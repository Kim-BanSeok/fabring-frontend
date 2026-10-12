import test from 'node:test';
import assert from 'node:assert/strict';
import { INQUIRY_TARGETS_KEY, inquiryFailure, inquiryFlowPath, inquiryPageQuery, inquiryPath, inquiryReturnPath, reconcileInquiryAnswer, rememberInquiryTarget, sellerInquiryPath, sendInquiry, sendInquiryAnswer, startInquiryRead } from '../src/react/pages/inquiry-model.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const fabric = { id: '23', title: '네이비 면 원단' };
const input = { content: '신축성이 있나요?', is_private: true };

const context = route => { const [path, query] = route.split('?'); return { path, query: new URLSearchParams(query) }; };

test('fabric or recommendation → inquiry → receipt → pagination keeps the original selected screen and filters', () => {
  for (const path of ['/buyer/fabrics/23', '/buyer/recommendations/23']) {
    const origin = context(path);
    origin.query.set('return', '/buyer/fabrics?sale_type=ROLL&material=면&page=2');
    const compose = context(inquiryFlowPath(origin, fabric.id, { compose: 1 }));
    const receipt = context(inquiryFlowPath(compose, fabric.id, { state: 'DONE', id: '7' }));
    const nextPage = context(inquiryFlowPath(receipt, fabric.id, { page: 1 }));
    assert.equal(nextPage.query.get('from'), compose.query.get('from'));
    const returned = context(inquiryReturnPath(nextPage.query.get('from')));
    assert.equal(returned.path, path);
    assert.equal(context(returned.query.get('return')).query.get('material'), '면');
    assert.equal(context(returned.query.get('return')).query.get('page'), '2');
    assert.equal(nextPage.query.has('state'), false);
    assert.equal(nextPage.query.has('compose'), false);
  }
});

test('pattern and reservation inquiries restore the selected item and its catalogue/list', () => {
  for (const [path, key, back] of [
    ['/buyer/patterns/7', 'patterns_return', '/buyer/patterns?keyword=가방&page=3&fabric_id=23'],
    ['/buyer/reservations/9', 'return', '/buyer/reservations?status=ACCEPTED&page=2'],
  ]) {
    const origin = context(path); origin.query.set(key, back); origin.query.set('fabric_id', fabric.id);
    const compose = context(inquiryFlowPath(origin, fabric.id, { compose: 1 }));
    const restored = context(inquiryReturnPath(compose.query.get('from')));
    assert.equal(restored.path, path);
    assert.equal(restored.query.get('fabric_id'), fabric.id);
    assert.deepEqual(Object.fromEntries(context(restored.query.get(key)).query), Object.fromEntries(context(back).query));
  }
});

test('inquiry return destinations reject external/write/role routes and remove demo and completion flags', () => {
  for (const value of ['https://example.com', '//example.com', '/admin/fabrics/23', '/buyer/reservations/9/cancel', '/buyer/inquiries?compose=1', '/buyer/fabrics/23#x', '/buyer/fabrics\\23', '/buyer/fabrics/23\n']) {
    assert.equal(inquiryReturnPath(value), '');
  }
  const origin = context('/buyer/patterns/7?fabric_id=23&mode=demo&scenario=12:34&state=DONE');
  origin.query.set('return', '/buyer/fabrics?page=2&mode=demo&scenario=12:34');
  const restored = context(inquiryReturnPath(origin.path + '?' + origin.query));
  assert.deepEqual([...restored.query.keys()], ['fabric_id', 'return']);
  assert.equal(restored.query.get('return'), '/buyer/fabrics?page=2');
});

test('inquiry create keeps an uncertain operation before dispatch and never automatically retries a lost response', async () => {
  let operation, calls = 0;
  const error = Object.assign(new Error('응답 유실'), { outcomeUnknown: true });
  const api = { async createInquiry(id, body) {
    calls++;
    assert.equal(operation.status, 'UNKNOWN');
    assert.equal(operation.fabric_id, id);
    assert.deepEqual(operation.input, body);
    throw error;
  } };
  await assert.rejects(sendInquiry(api, fabric, input, { remember: value => { operation = value; } }), error);
  assert.equal(calls, 1);
  assert.equal(operation.status, 'UNKNOWN');
  assert.deepEqual(operation.input, input);
});

test('known rejected inquiries unlock correction while an aborted request retains uncertainty', async () => {
  for (const [error, retained] of [[Object.assign(new Error('원단 없음'), { status: 404 }), false], [Object.assign(new Error('이동'), { name: 'AbortError' }), true]]) {
    let operation;
    const api = { async createInquiry() { throw error; } };
    await assert.rejects(sendInquiry(api, fabric, input, { remember: value => { operation = value; } }));
    assert.equal(Boolean(operation), retained);
  }
});

test('create acknowledgement records only a confirmed ID; navigation during the request cannot claim success', async () => {
  let operation;
  const result = await sendInquiry({ async createInquiry() { return { id: '7', status: 'WAITING' }; } }, fabric, input, { remember: value => { operation = value; } });
  assert.equal(result.id, '7');
  assert.equal(operation.status, 'CONFIRMED');
  assert.equal(operation.id, '7');
  const discarded = await sendInquiry({ async createInquiry() { return { id: '8', status: 'WAITING' }; } }, fabric, input, { isCurrent: () => false, remember: value => { operation = value; } });
  assert.equal(discarded, null);
  assert.equal(operation.status, 'UNKNOWN');
});

test('answer requests use the exact inquiry ID and object payload; failure retains the attempted text once', async () => {
  let operation, calls = 0;
  const api = { async answerInquiry(id, payload) {
    calls++;
    assert.equal(id, '7'); assert.deepEqual(payload, { answer: '신축성은 없어요.' });
    throw Object.assign(new Error('시간 초과'), { outcomeUnknown: true });
  } };
  await assert.rejects(sendInquiryAnswer(api, { id: '7' }, '신축성은 없어요.', { remember: value => { operation = value; } }));
  assert.equal(calls, 1); assert.equal(operation.answer, '신축성은 없어요.'); assert.equal(operation.status, 'UNKNOWN');
});

test('answer recovery requires the same ID, answered status, and exact server text', () => {
  const operation = { status: 'UNKNOWN', id: '7', answer: '신축성은 없어요.' };
  for (const item of [null, { id: '8', status: 'ANSWERED', answer: operation.answer }, { id: '7', status: 'WAITING', answer: null }, { id: '7', status: 'ANSWERED', answer: '다른 답변' }]) {
    assert.equal(reconcileInquiryAnswer(operation, item), operation);
  }
  assert.equal(reconcileInquiryAnswer(operation, { id: '7', status: 'ANSWERED', answer: operation.answer }).status, 'OBSERVED');
  const confirmed = { ...operation, status: 'CONFIRMED' };
  assert.equal(reconcileInquiryAnswer(confirmed, { id: '7', status: 'ANSWERED', answer: operation.answer }), confirmed);
});

test('inquiry pagination passes backend filters without filtering one page locally', () => {
  assert.deepEqual(inquiryPageQuery(new URLSearchParams('page=2&status=ANSWERED')), { page: '2', size: 10 });
  assert.deepEqual(inquiryPageQuery(new URLSearchParams('page=2&status=ANSWERED'), true), { page: '2', size: 10, status: 'ANSWERED' });
  assert.deepEqual(inquiryPageQuery(new URLSearchParams('status=ALL'), true), { page: 0, size: 10 });
  assert.equal(inquiryPageQuery(new URLSearchParams('status=DONE'), true).status, 'ANSWERED');
  assert.equal(inquiryPageQuery(new URLSearchParams('page=-1'), true).page, '-1');
});

test('inquiry routes encode user-controlled identifiers and preserve server page/status selections', () => {
  assert.equal(inquiryPath('1&compose=1', { page: 2 }), '/buyer/inquiries?fabric_id=1%26compose%3D1&page=2');
  assert.equal(sellerInquiryPath({ status: 'ANSWERED', page: 3, id: '4' }), '/seller/inquiries?status=ANSWERED&page=3&id=4');
});

test('recent inquiry shortcuts deduplicate fabrics and store no question, answer, or author data', () => {
  const drafts = new Map();
  for (let i = 0; i < 25; i++) rememberInquiryTarget(drafts, { id: String(i), title: `원단 ${i}`, content: '개인 내용', buyer_nickname: '닉네임' });
  rememberInquiryTarget(drafts, { id: '23', title: '새 제목' });
  const targets = drafts.get(INQUIRY_TARGETS_KEY);
  assert.equal(targets.length, 20);
  assert.deepEqual(targets[0], { id: '23', title: '새 제목' });
  assert.equal(targets.filter(item => item.id === '23').length, 1);
  assert.ok(targets.every(item => Object.keys(item).length === 2));
});

test('inquiry reads forward abort signals and discard late data after route cleanup', async () => {
  let resolve, signal, delivered = false;
  const api = { listFabricInquiries(id, query, options) { assert.equal(id, '23'); assert.deepEqual(query, { page: 1 }); signal = options.signal; return new Promise(done => { resolve = done; }); } };
  const dispose = startInquiryRead(api, { kind: 'fabric', id: '23', query: { page: 1 } }, () => { delivered = true; }, () => { delivered = true; });
  await flush(); dispose(); assert.equal(signal.aborted, true);
  resolve({ items: [] }); await flush(); assert.equal(delivered, false);
});

test('a changed seller filter uses the real received-inquiries endpoint and surfaces errors without demo data', async () => {
  const expected = new Error('서버 연결 실패'); let failure;
  startInquiryRead({ async listSellerInquiries(query) { assert.deepEqual(query, { status: 'ANSWERED', page: 1 }); throw expected; } }, { kind: 'seller', query: { status: 'ANSWERED', page: 1 } }, () => assert.fail('must not fall back to fabricated inquiries'), error => { failure = error; });
  await flush(); assert.equal(failure, expected);
  assert.match(inquiryFailure(Object.assign(new Error(), { status: 404 })), /원단/);
  assert.match(inquiryFailure(Object.assign(new Error(), { status: 403 }), true), /권한/);
});

test('a version-invalidated live read resolves loading with retry feedback rather than hanging forever', async () => {
  let failure;
  startInquiryRead({ async listSellerInquiries() { throw Object.assign(new Error('stale'), { name: 'AbortError' }); } }, { kind: 'seller', query: {} }, () => assert.fail('stale read must not reach the page'), error => { failure = error; });
  await flush(); assert.equal(failure.code, 'STALE_INQUIRY_READ'); assert.match(failure.message, /다시 조회/);
});
