import test from 'node:test';
import assert from 'node:assert/strict';
import { adminListQuery, adminListBack, adminItemPath, adminReviewPath, safeLiveAdminReturn, adminCanReview, adminReviewConfirmed, adminReviewFailure, startAdminRead, submitAdminReview } from '../src/react/pages/adminLiveModel.js';
import { createReservationMutation } from '../src/react/hooks/useReservationMutation.js';

const seller = status => ({ id: '12', nickname: '판매자', email: 'seller@example.test', phone_number: null, store: null, seller_approval_status: status });
const fabric = (status = 'PENDING') => ({ id: '23', source: 'api', status, title: '검토 원단', price: 2000, sale_type: 'SCRAP', width_cm: 110, length_cm: 60, images: [{ id: '9', image_url: '/uploads/photo.webp' }], description: '판매자 설명' });
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const error = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

test('admin filters use endpoint states and page/size bounds, never ALL', () => {
  assert.deepEqual(adminListQuery(new URLSearchParams('status=ALL&page=-1&size=100')), { status: 'PENDING', page: 0, size: 20 });
  assert.deepEqual(adminListQuery(new URLSearchParams('status=REJECTED&page=2&size=50'), 'sellers'), { status: 'REJECTED', page: 2, size: 50 });
  assert.equal(adminListQuery(new URLSearchParams('status=POSTED'), 'sellers').status, 'PENDING');
});
test('list, detail, confirmation and back links retain status/page/size and approval workspace', () => {
  const list = '/admin/approvals?status=PENDING&page=3&size=5';
  const item = adminItemPath('fabrics', '23', list), query = new URL(item, 'https://admin.local').searchParams;
  assert.equal(adminListBack('fabrics', query), list);
  const confirm = new URL(adminReviewPath('fabrics', '23', 'REJECTED', list + '&id=23', list), 'https://admin.local');
  assert.equal(confirm.searchParams.get('action'), 'reject');
  assert.equal(confirm.searchParams.get('returnTo'), '/admin/approvals?status=PENDING&id=23&page=3&size=5');
  assert.equal(adminListBack('fabrics', confirm.searchParams), list);
  const sellerItem = adminItemPath('sellers', '12', '/admin/sellers?status=REJECTED&page=2&size=10');
  assert.equal(adminListBack('sellers', new URL(sellerItem, 'https://admin.local').searchParams), '/admin/sellers?status=REJECTED&page=2&size=10');
});
test('return paths cannot enter external/auth/demo resets or replay review actions', () => {
  for (const value of ['https://other.test/admin/sellers', '//other.test/admin/sellers', '/auth/admin/login', '/admin/../auth/admin/login', '/admin/error']) assert.equal(safeLiveAdminReturn(value), '/admin/dashboard');
  assert.equal(safeLiveAdminReturn('/admin/fabrics/23?action=approve&mode=demo&scenario=1&page=2&size=5'), '/admin/fabrics/23?page=2&size=5');
});
test('seller and fabric decisions follow actual state policies and do not require seller store', () => {
  for (const status of ['PENDING', 'REJECTED']) assert.equal(adminCanReview('sellers', seller(status), 'APPROVED'), true);
  assert.equal(adminCanReview('sellers', seller('REJECTED'), 'REJECTED'), false);
  assert.equal(adminCanReview('sellers', seller('PENDING'), 'REJECTED'), true);
  assert.equal(adminCanReview('sellers', seller('APPROVED'), 'APPROVED'), false);
  for (const status of ['POSTED', 'REJECTED', 'SOLD_OUT']) for (const next of ['POSTED', 'REJECTED']) assert.equal(adminCanReview('fabrics', fabric(status), next), false);
});
test('read routing forwards status/page/signal and failed lookups do not become empty results', async () => {
  const calls = [], results = [], failures = [], failure = error('LOOKUP_INCOMPLETE');
  const api = { listAdminSellers: async (query, options) => { calls.push([query, options.signal]); return { items: [], totalElements: 0 }; }, getAdminFabric: async (id, options) => { calls.push([id, options.statusHint]); throw failure; } };
  const list = startAdminRead(api, { type: 'list', kind: 'sellers', query: { status: 'PENDING', page: 3, size: 5 } }, data => results.push(data), assert.fail);
  await settle(); list();
  const detail = startAdminRead(api, { type: 'detail', kind: 'fabrics', id: '23', statusHint: 'REJECTED' }, () => assert.fail('Error is not an empty result'), value => failures.push(value));
  await settle(); detail();
  assert.deepEqual(calls[0][0], { status: 'PENDING', page: 3, size: 5 }); assert.ok(calls[0][1] instanceof AbortSignal); assert.deepEqual(calls[1], ['23', 'REJECTED']); assert.equal(results.length, 1); assert.deepEqual(failures, [failure]);
});
test('StrictMode cleanup skips duplicate read and unmounted late read cannot update the screen', async () => {
  let calls = 0; const wait = deferred(), results = [];
  const api = { getAdminDashboard: async () => { calls++; return wait.promise; } };
  const first = startAdminRead(api, { type: 'dashboard' }, data => results.push(data), assert.fail); first();
  const second = startAdminRead(api, { type: 'dashboard' }, data => results.push(data), assert.fail); await settle(); second();
  wait.resolve({ fabricCounts: {} }); await settle(); assert.equal(calls, 1); assert.deepEqual(results, []);
});

test('an in-flight review invalidating the new route GET ends loading with a retryable error', async () => {
  const read = deferred(), failures = [], results = [];
  const api = { getAdminDashboard: async ({ signal }) => { assert.equal(signal.aborted, false); return read.promise; } };
  const stop = startAdminRead(api, { type: 'dashboard' }, value => results.push(value), value => failures.push(value));
  await settle();
  // The previous route POST completed, invalidating this GET via adminVersion;
  // the destination view and its AbortController are still alive.
  read.reject(new DOMException('Version changed', 'AbortError')); await settle();
  assert.deepEqual(results, []); assert.equal(failures.length, 1); assert.equal(failures[0].code, 'DATA_CHANGED'); assert.match(failures[0].message, /다시 조회/);
  stop();
  const canceled = deferred(), ignored = [];
  const dispose = startAdminRead({ getAdminDashboard: async () => canceled.promise }, { type: 'dashboard' }, assert.fail, value => ignored.push(value));
  await settle(); dispose(); canceled.reject(new DOMException('Aborted', 'AbortError')); await settle(); assert.deepEqual(ignored, []);
});
test('fabric decisions freshly read then POST and persist UNKNOWN before ACK, reason trim and clear draft source untouched', async () => {
  const item = fabric(), calls = [], operations = [], reason = '  사진을 보완해 주세요.  ';
  const api = { getAdminFabric: async id => { calls.push(['GET', id]); return structuredClone(item); }, reviewFabric: async (id, next, value) => { calls.push(['POST', id, next, value]); assert.equal(operations.at(-1).status, 'UNKNOWN'); return { id, status: next }; } };
  const result = await submitAdminReview(api, { kind: 'fabrics', item, next: 'REJECTED', reason, onOperation: value => operations.push(value) });
  assert.deepEqual(calls, [['GET', '23'], ['POST', '23', 'REJECTED', '사진을 보완해 주세요.']]); assert.equal(result.status, 'CONFIRMED'); assert.equal(result.reason, '사진을 보완해 주세요.'); assert.equal(reason, '  사진을 보완해 주세요.  ');
});
test('seller decisions use explicit service with no reason payload and allow rejected seller approval', async () => {
  const item = seller('REJECTED'), calls = [];
  const api = { getAdminSeller: async () => item, reviewSeller: async (...args) => { calls.push(args); return { id: '12', seller_approval_status: 'APPROVED' }; }, reviewFabric: assert.fail };
  await submitAdminReview(api, { kind: 'sellers', item, next: 'APPROVED', reason: 'never send', signal: new AbortController().signal });
  assert.equal(calls.length, 1); assert.equal(calls[0].length, 3); assert.equal(calls[0][0], '12'); assert.equal(calls[0][1], 'APPROVED'); assert.deepEqual(Object.keys(calls[0][2]), ['signal']);
});
test('state changes, changed content and missing photos block POST before confirmation', async () => {
  for (const [fresh, code] of [[fabric('POSTED'), 'INVALID_STATUS'], [{ ...fabric(), description: '변경된 정보' }, 'REVIEW_CHANGED'], [{ ...fabric(), images: [] }, 'REVIEW_CHANGED']]) {
    let writes = 0; const operations = [];
    await assert.rejects(submitAdminReview({ getAdminFabric: async () => fresh, reviewFabric: async () => { writes++; } }, { kind: 'fabrics', item: fabric(), next: 'POSTED', onOperation: value => operations.push(value) }), value => value.code === code);
    assert.equal(writes, 0); assert.equal(operations.at(-1).status, 'REVIEW_REQUIRED');
  }
  const noPhoto = { ...fabric(), images: [] };
  await assert.rejects(submitAdminReview({ getAdminFabric: async () => noPhoto, reviewFabric: assert.fail }, { kind: 'fabrics', item: noPhoto, next: 'POSTED' }), value => value.code === 'IMAGE_REQUIRED');
});
test('reason validation happens before HTTP, exact trim1..255 contract', async () => {
  const api = { getAdminFabric: assert.fail, reviewFabric: assert.fail };
  for (const reason of ['   ', '가'.repeat(256)]) await assert.rejects(submitAdminReview(api, { kind: 'fabrics', item: fabric(), next: 'REJECTED', reason }), value => value.code === 'VALIDATION_ERROR');
});
test('unknown and conflict results stay locked for a fresh read, known validation unlocks with input retained', async () => {
  for (const [failure, lastStatus] of [[error('NETWORK_ERROR', { outcomeUnknown: true }), 'UNKNOWN'], [error('INVALID_STATUS'), 'REVIEW_REQUIRED'], [error('IMAGE_REQUIRED'), 'REVIEW_REQUIRED'], [error('VALIDATION_ERROR'), null]]) {
    const operations = [], item = fabric();
    await assert.rejects(submitAdminReview({ getAdminFabric: async () => item, reviewFabric: async () => { throw failure; } }, { kind: 'fabrics', item, next: 'REJECTED', reason: '사유 보존', onOperation: value => operations.push(value) }), value => value === failure);
    assert.equal(operations.at(-1)?.status ?? null, lastStatus); assert.ok(adminReviewFailure(failure));
    if (lastStatus === 'UNKNOWN') assert.equal(operations.at(-1).reason, '사유 보존');
  }
});
test('one active mutation prevents double-submit and late successful response cannot navigate or discard unknown operation', async () => {
  const wait = deferred(), item = fabric(), operations = [], busy = []; let calls = 0, navigations = 0;
  const api = { getAdminFabric: async () => item, reviewFabric: async () => { calls++; return wait.promise; } };
  const runner = createReservationMutation({ onBusy: value => busy.push(value), onFailure: () => {} });
  const action = async ({ signal, isCurrent }) => { const ack = await submitAdminReview(api, { kind: 'fabrics', item, next: 'POSTED', signal, isCurrent, onOperation: value => operations.push(value) }); if (ack && isCurrent()) navigations++; };
  const first = runner.run(action); await settle(); await runner.run(action); runner.dispose(); wait.resolve({ id: '23', status: 'POSTED' }); await first;
  assert.equal(calls, 1); assert.equal(navigations, 0); assert.equal(operations.at(-1).status, 'UNKNOWN'); assert.deepEqual(busy, [true]);
});
test('session change while fresh read is in progress prevents POST altogether', async () => {
  const wait = deferred(); let current = true, writes = 0;
  const promise = submitAdminReview({ getAdminSeller: async () => wait.promise, reviewSeller: async () => { writes++; } }, { kind: 'sellers', item: seller('PENDING'), next: 'APPROVED', isCurrent: () => current });
  current = false; wait.resolve(seller('PENDING')); assert.equal(await promise, null); assert.equal(writes, 0);
});
test('confirmed ACK persists independently of a later result-read failure without posting again', async () => {
  const operations = [], item = fabric(); let reads = 0, posts = 0;
  const api = { getAdminFabric: async () => { if (++reads > 1) throw error('NETWORK_ERROR'); return item; }, reviewFabric: async () => { posts++; return { id: '23', status: 'POSTED' }; } };
  await submitAdminReview(api, { kind: 'fabrics', item, next: 'POSTED', onOperation: value => operations.push(value) });
  await assert.rejects(api.getAdminFabric('23')); assert.equal(operations.at(-1).status, 'CONFIRMED'); assert.equal(posts, 1);
});

test('a rejected fabric resubmitted to PENDING starts a new review cycle despite its previous rejection ACK', async () => {
  const priorAck = { status: 'CONFIRMED', next: 'REJECTED' };
  assert.equal(adminReviewConfirmed(priorAck, 'REJECTED', 'REJECTED'), true);
  assert.equal(adminReviewConfirmed(priorAck, 'REJECTED', 'PENDING'), false);
  let calls = 0; const item = fabric();
  const result = await submitAdminReview({ getAdminFabric: async () => item, reviewFabric: async () => { calls++; return { id: '23', status: 'REJECTED' }; } }, { kind: 'fabrics', item, next: 'REJECTED', reason: '재검토한 보완 사유' });
  assert.equal(calls, 1); assert.equal(result.status, 'CONFIRMED'); assert.equal(result.reason, '재검토한 보완 사유');
});
