import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { storeInput, storeDetail, storeCreated } from '../src/react/services/store-contract.js';

const dto = (extra = {}) => ({ storeId: 7, store_name: '검증 매장', store_address: '검증용 주소 2층', store_phone: '031-000-0000', closed_days: null, pickup_guide: '예약 후 방문', ...extra });
const input = () => ({ store_name: ' 검증 매장 ', address: ' 검증용 주소 2층 ', phone_number: ' 031-000-0000 ', closed_days: '', pickup_guide: ' 예약 후 방문 ' });
const profile = (extra = {}) => ({ userId: 42, email: 'seller@example.test', nickname: '검증 판매자', role: 'SELLER', phone_number: null, hasStore: false, seller_approval_status: 'PENDING', ...extra });
const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status });
const failure = (status, code) => response({ code, message: '검증 오류' }, status);
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function session(business, { role = 'SELLER', timeoutMs } = {}) {
  const calls = []; let signingIn = false, loginNumber = 0;
  const account = profile({ role });
  const api = createLiveApi({ storage: null, timeoutMs, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/login')) { signingIn = true; return response({ accessToken: `store-test-${++loginNumber}`, expiresIn: 3600, user: account }); }
    if (url.endsWith('/users/me') && signingIn) { signingIn = false; return response(account); }
    calls.push({ url, options }); return business(url, options);
  } });
  const login = async () => api.commitLogin(await api.login({ email: account.email, password: 'local-test-only' }));
  await login(); return { api, calls, login };
}

test('store inputs map only contract fields, trim and clear optional values while preserving omitted PATCH fields', () => {
  assert.deepEqual(storeInput({ ...input(), nickname: 'not sent', detail_address: 'not sent', user_id: 99 }), {
    store_name: '검증 매장', store_address: '검증용 주소 2층', store_phone: '031-000-0000', closed_days: null, pickup_guide: '예약 후 방문',
  });
  assert.deepEqual(storeInput({ pickup_guide: null }, { partial: true }), { pickup_guide: null });
  assert.deepEqual(storeInput({ closed_days: '   ' }, { partial: true }), { closed_days: null });
  assert.equal(storeInput({ ...input(), phone_number: '매장에 문의' }).store_phone, '매장에 문의');
});
test('store validation enforces required trimmed text, per-field limits and nonempty PATCH', () => {
  for (const patch of [{ store_name: ' ' }, { address: '' }, { phone_number: null }, { store_name: '가'.repeat(101) }, { address: '가'.repeat(256) }, { phone_number: '1'.repeat(21) }, { closed_days: '가'.repeat(101) }, { pickup_guide: '가'.repeat(5001) }]) assert.throws(() => storeInput({ ...input(), ...patch }), { code: 'VALIDATION_ERROR' });
  for (const partial of [{}, { nickname: 'ignored' }, { store_name: undefined }]) assert.throws(() => storeInput(partial, { partial: true }), { code: 'VALIDATION_ERROR' });
  assert.equal(storeInput({ ...input(), pickup_guide: '가'.repeat(5000) }).pickup_guide.length, 5000);
});
test('store DTO requires actual fields, retains nulls and validates creation acknowledgment', () => {
  assert.deepEqual(storeDetail(dto()), { id: 7, store_name: '검증 매장', address: '검증용 주소 2층', phone_number: '031-000-0000', closed_days: null, pickup_guide: '예약 후 방문' });
  for (const patch of [{ storeId: 0 }, { store_name: null }, { store_address: '' }, { store_phone: undefined }, { closed_days: undefined }, { pickup_guide: 1 }]) assert.throws(() => storeDetail(dto(patch)), { code: 'INVALID_RESPONSE' });
  assert.deepEqual(storeCreated({ storeId: 7 }), { id: 7 });
  for (const raw of [null, {}, { storeId: '7' }, { storeId: -1 }]) assert.throws(() => storeCreated(raw), { code: 'INVALID_RESPONSE' });
});
test('fresh profile and missing own store use authenticated endpoints without turning pending into approved', async () => {
  const f = await session(url => url.endsWith('/users/me') ? response(profile()) : failure(404, 'NOT_FOUND'));
  const revision = f.api.getAuth().revision;
  assert.equal((await f.api.refreshSellerProfile()).id, 42); assert.equal(await f.api.getMyStore(), null);
  assert.equal(f.api.getState().seller.hasStore, false); assert.equal(f.api.getAuth().revision, revision);
  assert.equal(f.api.getState().seller.seller_approval_status, 'PENDING');
  assert(f.calls.every(call => call.options.headers.Authorization === 'Bearer store-test-1'));
  await f.api.logout();
});
test('create sends POST once, records confirmed hasStore, then GET supplies actual fields', async () => {
  const f = await session((url, options) => options.method === 'POST' ? response({ storeId: 7 }, 201) : response(dto()));
  assert.deepEqual(await f.api.createStore(input()), { id: 7 });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, '/api/v1/stores');
  assert.deepEqual(JSON.parse(f.calls[0].options.body), storeInput(input()));
  assert.equal(f.api.getState().seller.hasStore, true); assert.deepEqual(f.api.getState().store, {});
  assert.deepEqual(await f.api.getMyStore(), storeDetail(dto()));
  assert.deepEqual(f.api.getState().store, storeDetail(dto())); await f.api.logout();
});
test('PATCH is partial, caches returned fields and preserves seller approval', async () => {
  const f = await session(() => response(dto({ closed_days: null, pickup_guide: null })));
  await f.api.updateStore({ pickup_guide: null });
  assert.equal(f.calls[0].url, '/api/v1/stores/me'); assert.equal(f.calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { pickup_guide: null });
  assert.equal(f.api.getState().store.pickup_guide, null); assert.equal(f.api.getState().seller.seller_approval_status, 'PENDING');
  await f.api.logout();
});
test('only actual NOT_FOUND is an empty store; read failure preserves last saved store', async () => {
  let step = 0; const f = await session(() => ++step === 1 ? response(dto()) : step === 2 ? failure(500, 'INTERNAL_ERROR') : step === 3 ? failure(404, 'OTHER_NOT_FOUND') : failure(404, 'NOT_FOUND'));
  await f.api.getMyStore();
  await assert.rejects(f.api.getMyStore(), { code: 'INTERNAL_ERROR' });
  assert.equal(f.api.getState().store.id, 7); assert.equal(f.api.getState().seller.hasStore, true);
  await assert.rejects(f.api.getMyStore(), { code: 'OTHER_NOT_FOUND' });
  assert.equal(await f.api.getMyStore(), null); assert.deepEqual(f.api.getState().store, {}); await f.api.logout();
});
test('fresh seller approval is obtained from users/me; invalid identity cannot replace session', async () => {
  let step = 0; const f = await session(() => response(profile(++step === 1 ? { seller_approval_status: 'APPROVED' } : { userId: 99 })));
  assert.equal((await f.api.refreshSellerProfile()).seller_approval_status, 'APPROVED');
  await assert.rejects(f.api.refreshSellerProfile(), { code: 'INVALID_RESPONSE' });
  assert.equal(f.api.getAuth().user.userId, 42); assert.equal(f.api.getState().seller.seller_approval_status, 'APPROVED'); await f.api.logout();
});
test('known duplicate and validation errors are not uncertain and never automatically retry', async () => {
  const f = await session(() => failure(409, 'STORE_ALREADY_EXISTS'));
  await assert.rejects(f.api.createStore(input()), error => error.code === 'STORE_ALREADY_EXISTS' && !error.outcomeUnknown);
  assert.equal(f.calls.length, 1); assert.equal(f.api.getState().seller.hasStore, false);
  await assert.rejects(f.api.updateStore({}), { code: 'VALIDATION_ERROR' }); assert.equal(f.calls.length, 1); await f.api.logout();
});
test('unconfirmed POST and PATCH mark unknown outcome, while acknowledged POST stays successful when GET fails', async () => {
  for (const method of ['createStore', 'updateStore']) for (const kind of ['network', 'server', 'malformed']) {
    const f = await session(() => { if (kind === 'network') throw new TypeError('offline'); return kind === 'server' ? failure(503, 'UNAVAILABLE') : response({}); });
    await assert.rejects(f.api[method](input()), error => error.outcomeUnknown === true); assert.equal(f.calls.length, 1); await f.api.logout();
  }
  let step = 0; const f = await session(() => ++step === 1 ? response({ storeId: 7 }, 201) : failure(500, 'UNAVAILABLE'));
  assert.deepEqual(await f.api.createStore(input()), { id: 7 }); await assert.rejects(f.api.getMyStore(), { code: 'UNAVAILABLE' });
  assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1); assert.equal(f.api.getState().seller.hasStore, true); await f.api.logout();
});
test('buyer, admin and anonymous cannot read or write seller stores', async () => {
  for (const role of ['BUYER', 'ADMIN']) {
    const f = await session(() => { throw new Error('must not fetch'); }, { role });
    for (const method of ['getMyStore', 'refreshSellerProfile']) await assert.rejects(f.api[method](), { code: 'FORBIDDEN' });
    for (const method of ['createStore', 'updateStore']) await assert.rejects(f.api[method](input()), { code: 'FORBIDDEN' });
    assert.equal(f.calls.length, 0); await f.api.logout(); await assert.rejects(f.api.getMyStore(), { code: 'UNAUTHORIZED' });
  }
});
test('late responses after logout cannot restore a store or overwrite the next account', async () => {
  const gate = deferred(), f = await session(() => gate.promise);
  const pending = f.api.updateStore(input()); await f.api.logout(); await f.login(); gate.resolve(response(dto()));
  await assert.rejects(pending, { name: 'AbortError' }); assert.deepEqual(f.api.getState().store, {}); await f.api.logout();
});
test('old store 401 cannot expire a newer login', async () => {
  const gate = deferred(), f = await session(() => gate.promise);
  const pending = f.api.getMyStore(); await f.api.logout(); await f.login(); gate.resolve(failure(401, 'UNAUTHORIZED'));
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(f.api.getAuth().status, 'authenticated'); await f.api.logout();
});
test('an earlier store GET cannot replace a confirmed later PATCH snapshot', async () => {
  const gate = deferred(), f = await session((url, options) => options.method === 'GET' ? gate.promise : response(dto({ store_name: '새 매장명' })));
  const pending = f.api.getMyStore(); await f.api.updateStore({ store_name: '새 매장명' }); gate.resolve(response(dto()));
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(f.api.getState().store.store_name, '새 매장명'); await f.api.logout();
});
test('explicit view abort discards writes, and timeout remains uncertain', async () => {
  const gate = deferred(), f = await session(() => gate.promise), controller = new AbortController();
  const pending = f.api.createStore(input(), { signal: controller.signal }); controller.abort(); gate.resolve(response({ storeId: 7 }, 201));
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(f.api.getState().seller.hasStore, false); await f.api.logout();
  const timeout = await session((url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))), { timeoutMs: 5 });
  await assert.rejects(timeout.api.createStore(input()), error => error.code === 'TIMEOUT' && error.outcomeUnknown); await timeout.api.logout();
});

test('reads begun during a write cannot undo its later confirmed snapshot or hasStore', async () => {
  for (const readMethod of ['getMyStore', 'refreshSellerProfile']) {
    const writeGate = deferred(), readGate = deferred();
    const f = await session((url, options) => options.method === 'PATCH' ? writeGate.promise : readGate.promise);
    const write = f.api.updateStore({ store_name: '새 매장명' });
    const read = f.api[readMethod]();
    writeGate.resolve(response(dto({ store_name: '새 매장명' }))); await write;
    readGate.resolve(response(readMethod === 'getMyStore' ? dto() : profile({ hasStore: false })));
    await assert.rejects(read, { name: 'AbortError' });
    assert.equal(f.api.getState().store.store_name, '새 매장명'); assert.equal(f.api.getState().seller.hasStore, true);
    await f.api.logout();
  }
});
