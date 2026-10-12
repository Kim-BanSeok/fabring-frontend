import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { inquiryIdentifier, inquiryQuery, inquiryInput, inquiryItem, inquiryPage, inquiryMutation } from '../src/react/services/inquiry-contract.js';
import { profileInput, profileDetail } from '../src/react/services/profile-contract.js';

const time = '2026-10-12T18:30:00+09:00';
const user = (extra = {}) => ({ userId: 41, email: 'qa@example.test', nickname: '검증 계정', role: 'BUYER', phone_number: null, seller_approval_status: null, hasStore: false, created_at: time, ...extra });
const item = (extra = {}) => ({ inquiryId: 9, fabricId: 12, fabric_title: '검증 원단', buyer_nickname: '검증 구매자', is_private: false, status: 'WAITING', content: '원단을 확인할 수 있나요?', answer: null, answered_at: null, created_at: time, ...extra });
const page = (items = [item()], extra = {}) => ({ content: items, page: 0, size: 20, totalElements: items.length, totalPages: items.length ? 1 : 0, ...extra });
const response = (data, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const failure = (code, status = 500) => new Response(JSON.stringify({ success: false, error: { code, message: '검증 실패' } }), { status });
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function session(business, { role = 'BUYER', timeoutMs } = {}) {
  const account = user({ role, seller_approval_status: role === 'SELLER' ? 'APPROVED' : null }), calls = [];
  let authenticating = false, loginNumber = 0;
  const api = createLiveApi({ storage: null, timeoutMs, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/login')) { authenticating = true; return response({ accessToken: `inquiry-profile-test-${++loginNumber}`, expiresIn: 3600, user: account }); }
    if (authenticating && url.endsWith('/users/me')) { authenticating = false; return response(account); }
    calls.push({ url, options }); return business(url, options, account);
  } });
  const login = async () => api.commitLogin(await api.login({ email: account.email, password: 'test-only-value' }));
  await login(); return { api, calls, account, login };
}

test('inquiry ids and pagination prevent invalid paths and omit ALL without unsupported buyer filters', () => {
  assert.equal(inquiryIdentifier('0012'), '12');
  for (const id of ['../12', '1/answer', 0, -1, 1.2, '1e2', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => inquiryIdentifier(id), { code: 'VALIDATION_ERROR' });
  assert.equal(inquiryQuery({ status: 'ALL' }, { seller: true }).toString(), 'page=0&size=20');
  assert.equal(inquiryQuery({ status: 'ANSWERED', page: 2, size: 5 }, { seller: true }).toString(), 'status=ANSWERED&page=2&size=5');
  for (const input of [{ status: 'ANSWERED' }, { page: -1 }, { size: 0 }, { size: 51 }, { page: '1.5' }]) assert.throws(() => inquiryQuery(input), { code: 'VALIDATION_ERROR' });
});

test('inquiry input trims content and answer with explicit privacy and strict length boundaries', () => {
  assert.deepEqual(inquiryInput({ content: ' 질문 ', is_private: true, buyer_id: 999 }), { content: '질문', is_private: true });
  assert.deepEqual(inquiryInput({ content: '질문' }), { content: '질문', is_private: false });
  assert.deepEqual(inquiryInput({ answer: ' 답변 ' }, { answer: true }), { answer: '답변' });
  for (const input of [{}, { content: ' ' }, { content: '가'.repeat(1001) }, { content: '질문', is_private: 'false' }]) assert.throws(() => inquiryInput(input), { code: 'VALIDATION_ERROR' });
  assert.equal(inquiryInput({ answer: '가'.repeat(1000) }, { answer: true }).answer.length, 1000);
});

test('private DTO retains server masking, nullable nickname and answered timestamp without invented ownership', () => {
  const value = inquiryItem(item({ is_private: true, status: 'ANSWERED', content: '비공개 문의입니다', answer: null, answered_at: time, buyer_nickname: null }));
  assert.equal(value.answer, null); assert.equal(value.buyer_nickname, null); assert.equal(value.answered_at, time);
  assert.equal(value.fabric_id, '12'); assert.equal(value.id, '9'); assert.equal(value.is_private, true);
  assert.equal('isMine' in value, false); assert.equal('buyer_id' in value, false);
  for (const extra of [{ inquiryId: '9' }, { status: 'ALL' }, { content: '' }, { created_at: 'today' }, { status: 'ANSWERED', answer: null, answered_at: time }, { answer: '답변' }]) assert.throws(() => inquiryItem(item(extra)), { code: 'INVALID_RESPONSE' });
});

test('inquiry page verifies pagination echo, status, selected fabric and duplicate ids', () => {
  const query = inquiryQuery(); assert.equal(inquiryPage(page(), query, { fabricId: '12' }).items.length, 1);
  for (const value of [page([item(), item()]), page([item({ fabricId: 13 })]), page([item()], { page: 1 }), page([item()], { totalPages: 2 }), page([item()], { totalElements: 0 })]) assert.throws(() => inquiryPage(value, query, { fabricId: '12' }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => inquiryPage(page(), inquiryQuery({ status: 'ANSWERED' }, { seller: true })), { code: 'INVALID_RESPONSE' });
  assert.deepEqual(inquiryMutation({ inquiryId: 9, status: 'ANSWERED' }, 'ANSWERED', '9'), { id: '9', status: 'ANSWERED' });
  assert.throws(() => inquiryMutation({ inquiryId: 10, status: 'ANSWERED' }, 'ANSWERED', '9'), { code: 'INVALID_RESPONSE' });
});

test('anonymous inquiry reads omit bearer; authenticated reads send bearer for server private access decisions', async () => {
  let authHeader;
  const api = createLiveApi({ storage: null, fetchImpl: async (url, options) => { authHeader = options.headers.Authorization; return response(page([item({ is_private: true, content: '비공개 문의입니다' })])); } });
  assert.equal((await api.listFabricInquiries(12)).items[0].content, '비공개 문의입니다'); assert.equal(authHeader, undefined);
  const f = await session(() => response(page()));
  assert.equal((await f.api.listFabricInquiries(12)).totalElements, 1);
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer inquiry-profile-test-1'); await f.api.logout();
});

test('buyer inquiry create sends only trimmed content and privacy, with exact WAITING acknowledgment', async () => {
  const f = await session(() => response({ inquiryId: 9, status: 'WAITING' }, 201));
  assert.deepEqual(await f.api.createInquiry('12', { content: ' 픽업 질문 ', is_private: true }), { id: '9', status: 'WAITING' });
  assert.equal(f.calls[0].url, '/api/v1/fabrics/12/inquiries'); assert.equal(f.calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { content: '픽업 질문', is_private: true }); await f.api.logout();
});

test('seller receives real filtered pages and answer/update use the same owner-scoped POST', async () => {
  const f = await session((url, options) => options.method === 'GET' ? response(page()) : response({ inquiryId: 9, status: 'ANSWERED' }), { role: 'SELLER' });
  await f.api.listSellerInquiries({ status: 'WAITING' });
  assert.equal(f.calls[0].url, '/api/v1/sellers/me/inquiries?status=WAITING&page=0&size=20');
  await f.api.answerInquiry(9, { answer: ' 답변 ' }); await f.api.answerInquiry(9, { answer: '수정한 답변' });
  assert.equal(f.calls[1].url, '/api/v1/inquiries/9/answer');
  assert.deepEqual(JSON.parse(f.calls[1].options.body), { answer: '답변' }); assert.equal(f.calls.length, 3); await f.api.logout();
});

test('wrong roles and anonymous writes fail before HTTP', async () => {
  const api = createLiveApi({ storage: null, fetchImpl: () => { throw new Error('unexpected fetch'); } });
  for (const action of [() => api.createInquiry(12, { content: '질문' }), () => api.answerInquiry(9, { answer: '답변' }), () => api.listSellerInquiries(), () => api.updateProfile({ nickname: '이름' }), () => api.getMyProfile()]) await assert.rejects(action(), { code: 'UNAUTHORIZED' });
  for (const role of ['BUYER', 'SELLER', 'ADMIN']) {
    const f = await session(() => { throw new Error('unexpected business fetch'); }, { role });
    if (role !== 'BUYER') await assert.rejects(f.api.createInquiry(12, { content: '질문' }), { code: 'FORBIDDEN' });
    if (role !== 'SELLER') { await assert.rejects(f.api.listSellerInquiries(), { code: 'FORBIDDEN' }); await assert.rejects(f.api.answerInquiry(9, { answer: '답변' }), { code: 'FORBIDDEN' }); }
    assert.equal(f.calls.length, 0); await f.api.logout();
  }
});

test('inquiry known not-found/permission failures stay known; uncertain writes never auto retry', async () => {
  for (const [kind, unknown] of [['network', true], ['malformed', true], ['server', true], ['NOT_FOUND', false], ['FORBIDDEN', false]]) {
    const f = await session(() => { if (kind === 'network') throw new TypeError('offline'); return kind === 'malformed' ? response({}) : kind === 'server' ? failure('INTERNAL_ERROR') : failure(kind, kind === 'NOT_FOUND' ? 404 : 403); });
    await assert.rejects(f.api.createInquiry(12, { content: '질문' }), error => Boolean(error.outcomeUnknown) === unknown);
    assert.equal(f.calls.length, 1); await f.api.logout();
  }
});

test('inquiry read failure is not an empty result and private responses arriving after logout are discarded', async () => {
  const d = deferred(), f = await session(() => d.promise);
  const pending = f.api.listFabricInquiries(12); await f.api.logout(); d.resolve(response(page([item({ is_private: true, content: '비공개 내용' })])));
  await assert.rejects(pending, { name: 'AbortError' });
  const broken = await session(() => failure('INTERNAL_ERROR'));
  await assert.rejects(broken.api.listFabricInquiries(12), { code: 'INTERNAL_ERROR' }); await broken.api.logout();
});

test('inquiry GET started before answer cannot overwrite the resulting state', async () => {
  const d = deferred(), f = await session((url, options) => options.method === 'GET' ? d.promise : response({ inquiryId: 9, status: 'ANSWERED' }), { role: 'SELLER' });
  const pending = f.api.listSellerInquiries(); await f.api.answerInquiry(9, { answer: '답변' }); d.resolve(response(page()));
  await assert.rejects(pending, { name: 'AbortError' }); await f.api.logout();
});

test('profile updates are strictly partial and empty phone clears to null without allowing immutable fields', () => {
  assert.deepEqual(profileInput({ nickname: ' 새 이름 ' }), { nickname: '새 이름' });
  assert.deepEqual(profileInput({ phone_number: ' ' }), { phone_number: null });
  assert.deepEqual(profileInput({ phone_number: '연락처 확인 중' }), { phone_number: '연락처 확인 중' });
  for (const input of [{}, { nickname: undefined }, { nickname: '' }, { nickname: '가'.repeat(51) }, { phone_number: '1'.repeat(21) }, { nickname: '이름', email: 'new@example.test' }, { role: 'ADMIN' }, { password: 'never-sent' }]) assert.throws(() => profileInput(input), { code: 'VALIDATION_ERROR' });
});

test('profile DTO validates identity and actual submitted field values before caching', () => {
  assert.equal(profileDetail(user()).id, '41'); assert.equal(profileDetail(user()).phone_number, null);
  for (const extra of [{ userId: '41' }, { phone_number: undefined }, { created_at: 'invalid' }, { nickname: '' }, { seller_approval_status: 'APPROVED' }]) assert.throws(() => profileDetail(user(extra)), { code: 'INVALID_RESPONSE' });
  for (const extra of [{ userId: 42 }, { email: 'other@example.test' }, { role: 'SELLER', seller_approval_status: 'PENDING' }]) assert.throws(() => profileDetail(user(extra), user()), { code: 'INVALID_RESPONSE' });
  assert.throws(() => profileDetail(user(), user(), { nickname: '다른 이름' }), { code: 'INVALID_RESPONSE' });
});

test('profile PATCH updates current auth snapshot without changing session revision or writing store fields', async () => {
  const f = await session((url, options, account) => response({ ...account, ...JSON.parse(options.body) }), { role: 'SELLER' });
  const revision = f.api.getAuth().revision;
  const result = await f.api.updateProfile({ nickname: ' 새 판매자 ', phone_number: '' });
  assert.equal(result.nickname, '새 판매자'); assert.equal(result.phone_number, null);
  assert.equal(f.calls[0].url, '/api/v1/users/me'); assert.equal(f.calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { nickname: '새 판매자', phone_number: null });
  assert.equal(f.api.getAuth().revision, revision); assert.equal(f.api.getState().seller.nickname, '새 판매자'); assert.equal(f.api.getState().seller.seller_approval_status, 'APPROVED'); await f.api.logout();
});

test('profile fresh read replaces cached editable fields while failed reads preserve the prior snapshot', async () => {
  let count = 0;
  const f = await session(() => ++count === 1 ? response(user({ nickname: '다른 기기에서 수정' })) : failure('INTERNAL_ERROR'));
  assert.equal((await f.api.getMyProfile()).nickname, '다른 기기에서 수정');
  await assert.rejects(f.api.getMyProfile(), { code: 'INTERNAL_ERROR' }); assert.equal(f.api.getState().buyer.nickname, '다른 기기에서 수정'); await f.api.logout();
});

test('profile 5xx, network and wrong ACK are unknown once; 400 is a known rejection', async () => {
  for (const kind of ['network', 'server', 'mismatch', 'validation']) {
    const f = await session(() => { if (kind === 'network') throw new TypeError('offline'); return kind === 'server' ? failure('INTERNAL_ERROR') : kind === 'validation' ? failure('VALIDATION_ERROR', 400) : response(user()); });
    await assert.rejects(f.api.updateProfile({ nickname: '새 닉네임' }), error => Boolean(error.outcomeUnknown) === (kind !== 'validation'));
    assert.equal(f.calls.length, 1); assert.equal(f.api.getState().buyer.nickname, '검증 계정'); await f.api.logout();
  }
});

test('profile request timeout remains uncertain and does not retry', async () => {
  const f = await session((url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })), { timeoutMs: 5 });
  await assert.rejects(f.api.updateProfile({ nickname: '새 이름' }), error => error.code === 'TIMEOUT' && error.outcomeUnknown);
  assert.equal(f.calls.length, 1); await f.api.logout();
});

test('late profile PATCH after logout cannot restore or mutate a newer account session', async () => {
  const d = deferred(), f = await session(() => d.promise);
  const pending = f.api.updateProfile({ nickname: '이전 요청' }); await f.api.logout(); await f.login();
  d.resolve(response(user({ nickname: '이전 요청' }))); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.api.getAuth().user.nickname, '검증 계정'); await f.api.logout();
});

test('old profile GET and seller approval refresh cannot undo an acknowledged profile PATCH', async () => {
  for (const method of ['getMyProfile', 'refreshSellerProfile']) {
    const d = deferred(), f = await session((url, options, account) => options.method === 'GET' ? d.promise : response({ ...account, nickname: '새 판매자' }), { role: 'SELLER' });
    const pending = f.api[method](); await f.api.updateProfile({ nickname: '새 판매자' }); d.resolve(response(f.account));
    await assert.rejects(pending, { name: 'AbortError' }); assert.equal(f.api.getState().seller.nickname, '새 판매자'); await f.api.logout();
  }
});

test('profile GET during an in-flight PATCH is invalidated when PATCH completes', async () => {
  const write = deferred(), read = deferred(), f = await session((url, options) => options.method === 'PATCH' ? write.promise : read.promise);
  const saving = f.api.updateProfile({ nickname: '변경 이름' }); const loading = f.api.getMyProfile();
  write.resolve(response(user({ nickname: '변경 이름' }))); await saving; read.resolve(response(user()));
  await assert.rejects(loading, { name: 'AbortError' }); assert.equal(f.api.getState().buyer.nickname, '변경 이름'); await f.api.logout();
});

test('profile read cannot clear a store created while that read was pending', async () => {
  const d = deferred(), f = await session((url, options) => options.method === 'POST' ? response({ storeId: 5 }, 201) : d.promise, { role: 'SELLER' });
  const loading = f.api.getMyProfile(); await f.api.createStore({ store_name: '매장', address: '주소', phone_number: '전화' });
  d.resolve(response(f.account)); await assert.rejects(loading, { name: 'AbortError' }); assert.equal(f.api.getState().seller.hasStore, true); await f.api.logout();
});

test('profile PATCH response preserves a simultaneous acknowledged store creation', async () => {
  const d = deferred(), f = await session((url, options) => options.method === 'PATCH' ? d.promise : response({ storeId: 5 }, 201), { role: 'SELLER' });
  const saving = f.api.updateProfile({ nickname: '새 판매자' }); await f.api.createStore({ store_name: '매장', address: '주소', phone_number: '전화' });
  d.resolve(response({ ...f.account, nickname: '새 판매자', hasStore: false }));
  assert.equal((await saving).hasStore, true); assert.equal(f.api.getState().seller.hasStore, true); await f.api.logout();
});
