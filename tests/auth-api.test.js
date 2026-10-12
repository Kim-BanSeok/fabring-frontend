import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createHttpClient } from '../src/react/services/http-client.js';
import { AUTH_STORAGE_KEY, createLiveApi } from '../src/react/services/live-api.js';

const BASE = 'https://backend.example.test/api/v1';
const NOW = 1_800_000_000_000;
const INPUT = { email: '  USER@Example.com ', password: ' Keep spaces 123! ', role: 'BUYER' };
const user = (overrides = {}) => ({
  userId: 42, email: 'user@example.com', nickname: '테스트 계정', role: 'BUYER',
  phone_number: null, seller_approval_status: null, hasStore: false,
  created_at: '2026-10-11T12:00:00+09:00', ...overrides,
});
const loginData = (profile = user(), token = 'test-access-token') => ({
  accessToken: token, expiresIn: 86400,
  user: { userId: profile.userId, nickname: profile.nickname, role: profile.role, hasStore: profile.hasStore, seller_approval_status: profile.seller_approval_status },
});
const response = (data, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const failure = (status, code, details) => new Response(JSON.stringify({
  success: false, error: { code, message: '서버가 반환한 안내', ...(details ? { details } : {}) },
}), { status, headers: status === 429 ? { 'Retry-After': '45' } : {} });

function memoryStorage(saved) {
  const values = new Map(saved ? [[AUTH_STORAGE_KEY, JSON.stringify(saved)]] : []);
  const writes = [];
  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); writes.push({ key, value }); },
    removeItem: key => values.delete(key),
    values, writes,
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fetchQueue(...handlers) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const index = calls.length;
    calls.push({ url, options });
    assert(index < handlers.length, `Unexpected fetch #${index + 1}: ${url}`);
    const handler = handlers[index];
    return typeof handler === 'function' ? handler(url, options) : handler;
  };
  return { calls, fetchImpl };
}
function fixture(handlers, options = {}) {
  const storage = options.storage || memoryStorage();
  const queue = fetchQueue(...handlers);
  return { storage, ...queue, api: createLiveApi({ baseUrl: BASE, now: () => NOW, ...options, storage, fetchImpl: queue.fetchImpl }) };
}
function saved(token = 'saved-access-token', extra = {}) {
  return { baseUrl: BASE, accessToken: token, expiresAt: NOW + 86400000, ...extra };
}
function expectCode(code, status) {
  return error => {
    assert(error instanceof ApiError);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  };
}

test('HTTP client sends JSON/Bearer explicitly and unwraps only the success data', async () => {
  const queue = fetchQueue(response({ id: 1 }), response(null), response({ id: 2 }));
  const request = createHttpClient({ baseUrl: `${BASE}///`, fetchImpl: queue.fetchImpl, getToken: () => 'saved-token' });
  assert.deepEqual(await request('/items', { method: 'POST', body: { title: '검증' }, authenticated: true }), { id: 1 });
  const first = queue.calls[0];
  assert.equal(first.url, `${BASE}/items`);
  assert.equal(first.options.method, 'POST');
  assert.equal(first.options.headers.Authorization, 'Bearer saved-token');
  assert.equal(first.options.headers.Accept, 'application/json');
  assert.equal(first.options.headers['Content-Type'], 'application/json');
  assert.equal(first.options.credentials, 'omit');
  assert.equal(first.options.cache, 'no-store');
  assert.deepEqual(JSON.parse(first.options.body), { title: '검증' });
  assert.equal(await request('/public'), null);
  assert.equal(queue.calls[1].options.headers.Authorization, undefined);
  assert.equal(queue.calls[1].options.headers['Content-Type'], undefined);
  await request('/me', { token: 'new-token' });
  assert.equal(queue.calls[2].options.headers.Authorization, 'Bearer new-token');
});

test('HTTP client rejects malformed envelopes, invalid JSON, and HTTP errors with field details', async t => {
  for (const [name, body] of [['bare DTO', { id: 1 }], ['missing data', { success: true }], ['wrong success type', { success: 1, data: {} }]]) {
    await t.test(name, async () => {
      const request = createHttpClient({ fetchImpl: async () => new Response(JSON.stringify(body)) });
      await assert.rejects(request('/test'), expectCode('INVALID_RESPONSE'));
    });
  }
  const request = createHttpClient({ fetchImpl: async () => new Response('<html>Unavailable</html>', { status: 502 }) });
  await assert.rejects(request('/test'), expectCode('INVALID_RESPONSE', 502));
  const details = [{ field: 'email', message: '이메일을 확인해 주세요' }];
  const validation = createHttpClient({ fetchImpl: async () => failure(400, 'VALIDATION_ERROR', details) });
  await assert.rejects(validation('/test'), error => {
    assert.equal(error.code, 'VALIDATION_ERROR'); assert.equal(error.status, 400);
    assert.equal(error.message, '서버가 반환한 안내'); assert.deepEqual(error.details, details); return true;
  });
  const limited = createHttpClient({ fetchImpl: async () => failure(429, 'TOO_MANY_REQUESTS') });
  await assert.rejects(limited('/test'), error => { assert.equal(error.retryAfter, '45'); return expectCode('TOO_MANY_REQUESTS', 429)(error); });
  const failedEnvelope = createHttpClient({ fetchImpl: async () => failure(200, 'LOGIN_FAILED') });
  await assert.rejects(failedEnvelope('/test'), expectCode('LOGIN_FAILED', 200));
});

test('HTTP distinguishes network failure, timeout and caller cancellation', async t => {
  await t.test('network failure', async () => {
    const request = createHttpClient({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    await assert.rejects(request('/test'), expectCode('NETWORK_ERROR'));
  });
  const untilAbort = (_url, { signal }) => new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
  await t.test('request timeout', async () => {
    const request = createHttpClient({ fetchImpl: untilAbort, timeoutMs: 10 });
    await assert.rejects(request('/test'), expectCode('TIMEOUT'));
  });
  await t.test('caller abort', async () => {
    const controller = new AbortController();
    const request = createHttpClient({ fetchImpl: untilAbort });
    const pending = request('/test', { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  });
});

test('HTTP must discard a successful response arriving after caller cancellation', async () => {
  // The fetch stub models a response already in flight when cancellation occurs.
  const late = deferred(), controller = new AbortController();
  const request = createHttpClient({ fetchImpl: () => late.promise });
  const pending = request('/test', { signal: controller.signal });
  controller.abort(); late.resolve(response({ ok: true }));
  await assert.rejects(pending, { name: 'AbortError' });
});

test('HTTP only expires a session for an authenticated 401, not a failed public login', async () => {
  const expired = [];
  const request = createHttpClient({ fetchImpl: async () => failure(401, 'UNAUTHORIZED'), getToken: () => 'current-token', onUnauthorized: token => expired.push(token) });
  await assert.rejects(request('/auth/login', { method: 'POST', body: {} }), expectCode('UNAUTHORIZED', 401));
  assert.deepEqual(expired, []);
  await assert.rejects(request('/users/me', { authenticated: true }), expectCode('UNAUTHORIZED', 401));
  assert.deepEqual(expired, ['current-token']);
});

test('signup maps the server payload and returns without login or persisted credentials', async () => {
  const f = fixture([response({ userId: 42, role: 'SELLER' }, 201)]);
  const result = await f.api.signup({ ...INPUT, role: 'SELLER', nickname: '  양주원단  ', phone_number: ' 010-0000-0000 ', terms: true, privacy: true, confirm: INPUT.password });
  assert.deepEqual(JSON.parse(f.calls[0].options.body), {
    email: 'user@example.com', password: INPUT.password, nickname: '양주원단', role: 'SELLER',
    phone_number: '010-0000-0000', terms_agreed: true, privacy_agreed: true,
  });
  assert.equal(f.calls[0].url, `${BASE}/auth/signup`);
  assert.equal(f.calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(result, { userId: 42, role: 'SELLER', email: 'user@example.com' });
  assert.equal(f.calls.length, 1); assert.equal(f.api.getAuth().status, 'anonymous');
  assert.equal(f.api.getState().session.authenticated, false); assert.equal(f.storage.values.size, 0);
});

test('signup rejects ADMIN locally and propagates server validation/agreement/duplicate/rate-limit errors', async t => {
  const admin = fixture([]);
  await assert.rejects(admin.api.signup({ ...INPUT, role: 'ADMIN' }), expectCode('FORBIDDEN'));
  assert.equal(admin.calls.length, 0);
  for (const [status, code] of [[400, 'VALIDATION_ERROR'], [400, 'AGREEMENT_REQUIRED'], [409, 'EMAIL_DUPLICATED'], [429, 'TOO_MANY_REQUESTS']]) {
    await t.test(code, async () => {
      const f = fixture([failure(status, code)]);
      await assert.rejects(f.api.signup({ ...INPUT, nickname: '구매자', terms: false, privacy: false }), expectCode(code, status));
      const body = JSON.parse(f.calls[0].options.body);
      assert.equal(body.phone_number, null); assert.equal(body.terms_agreed, false); assert.equal(body.privacy_agreed, false);
      assert.equal(f.api.getAuth().status, 'anonymous'); assert.equal(f.storage.values.size, 0);
    });
  }
});

test('signup does not accept a missing user id or a response with a different role', async t => {
  for (const result of [{ role: 'BUYER' }, { userId: 2, role: 'SELLER' }]) {
    await t.test(JSON.stringify(result), async () => {
      const f = fixture([response(result, 201)]);
      await assert.rejects(f.api.signup({ ...INPUT, nickname: '구매자', terms: true, privacy: true }), expectCode('INVALID_RESPONSE'));
      assert.equal(f.storage.values.size, 0);
    });
  }
});

test('login follows the verified server role and only commitLogin makes the session usable', async () => {
  const seller = user({ role: 'SELLER', seller_approval_status: 'PENDING', hasStore: false });
  const f = fixture([response(loginData(seller)), response(seller)]);
  let notifications = 0; const unsubscribe = f.api.subscribe(() => { notifications += 1; });
  const result = await f.api.login(INPUT); // Buyer UI credentials may belong to a seller.
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { email: 'user@example.com', password: INPUT.password });
  assert.equal(f.calls[0].options.headers.Authorization, undefined);
  assert.equal(f.calls[1].url, `${BASE}/users/me`);
  assert.equal(f.calls[1].options.headers.Authorization, 'Bearer test-access-token');
  assert.equal(result.role, 'SELLER'); assert.equal(result.first_login, true);
  assert.equal(f.api.getAuth().status, 'anonymous'); assert.equal(f.storage.values.size, 0); assert.equal(notifications, 0);
  f.api.commitLogin(result);
  assert.equal(f.api.getAuth().status, 'authenticated'); assert.equal(f.api.getState().session.role, 'SELLER');
  assert.equal(f.api.getState().seller.id, 42); assert.equal(f.api.getState().buyer.id, null);
  assert.equal(notifications, 1);
  const stored = JSON.parse(f.storage.getItem(AUTH_STORAGE_KEY));
  assert.deepEqual(stored, { baseUrl: BASE, accessToken: 'test-access-token', expiresAt: NOW + 86400000 });
  assert.equal(JSON.stringify(f.storage.writes).includes(INPUT.password), false);
  assert.equal(Object.hasOwn(stored, 'password'), false); assert.equal(Object.hasOwn(stored, 'user'), false);
  unsubscribe(); await f.api.logout();
  assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), null); assert.equal(f.api.getState().session.authenticated, false);
  assert.equal(f.calls.length, 2); // The contract has no server logout endpoint.
});

test('seller login loads /stores/me using the token and maps the actual DTO', async () => {
  const seller = user({ role: 'SELLER', hasStore: true, seller_approval_status: 'APPROVED' });
  const dto = { storeId: 13, store_name: '검증 매장', store_address: '양주시 평화로', store_phone: '031-000-0000', closed_days: null, pickup_guide: '방문 전 확인' };
  const f = fixture([response(loginData(seller)), response(seller), response(dto)]);
  const result = await f.api.login(INPUT); f.api.commitLogin(result);
  assert.equal(result.first_login, false); assert.equal(f.calls[2].url, `${BASE}/stores/me`);
  assert.equal(f.calls[2].options.headers.Authorization, 'Bearer test-access-token');
  assert.deepEqual(f.api.getState().store, { id: 13, store_name: dto.store_name, address: dto.store_address, phone_number: dto.store_phone, closed_days: null, pickup_guide: dto.pickup_guide });
  assert.equal(f.api.getState().storeError, ''); await f.api.logout();
});

test('store failure is visible without fabricating store data, while a store 401 rejects login', async t => {
  const seller = user({ role: 'SELLER', hasStore: true, seller_approval_status: 'PENDING' });
  await t.test('missing store', async () => {
    const f = fixture([response(loginData(seller)), response(seller), failure(404, 'NOT_FOUND')]);
    const result = await f.api.login(INPUT); f.api.commitLogin(result);
    assert.deepEqual(f.api.getState().store, {}); assert(f.api.getState().storeError);
    assert.equal(f.api.getState().seller.hasStore, true); await f.api.logout();
  });
  await t.test('expired token', async () => {
    const f = fixture([response(loginData(seller)), response(seller), failure(401, 'UNAUTHORIZED')]);
    await assert.rejects(f.api.login(INPUT), expectCode('UNAUTHORIZED', 401)); assert.equal(f.storage.values.size, 0);
  });
});

test('login refuses malformed or mismatched account data before any session commit', async t => {
  for (const [name, replies] of [
    ['invalid expiry', [response({ ...loginData(), expiresIn: 0 })]],
    ['missing token', [response({ ...loginData(), accessToken: '' })]],
    ['malformed me', [response(loginData()), response({ userId: 42 })]],
    ['mismatched user id', [response(loginData()), response(user({ userId: 43 }))]],
    ['mismatched role', [response(loginData()), response(user({ role: 'ADMIN' }))]],
  ]) {
    await t.test(name, async () => {
      const f = fixture(replies);
      await assert.rejects(f.api.login(INPUT), expectCode('INVALID_RESPONSE'));
      assert.equal(f.api.getAuth().status, 'anonymous'); assert.equal(f.storage.values.size, 0);
    });
  }
});

test('restore validates the saved token once and restores the server profile without persisting a password', async () => {
  const storage = memoryStorage(saved()); const gate = deferred();
  const f = fixture([() => gate.promise], { storage });
  assert.equal(f.api.getAuth().status, 'restoring'); assert.equal(f.api.getState().session.authenticated, false);
  const first = f.api.restore(), second = f.api.restore();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.headers.Authorization, 'Bearer saved-access-token');
  gate.resolve(response(user({ role: 'ADMIN' }))); await Promise.all([first, second]);
  assert.equal(f.api.getAuth().status, 'authenticated'); assert.equal(f.api.getState().session.role, 'ADMIN');
  const clone = f.api.getAuth(); clone.user.nickname = 'external mutation';
  assert.equal(f.api.getAuth().user.nickname, '테스트 계정');
  assert.equal(storage.writes.length, 0); await f.api.logout();
});

test('restore network failure retains credentials for a successful explicit retry', async () => {
  const storage = memoryStorage(saved());
  const f = fixture([() => { throw new TypeError('offline'); }, response(user())], { storage });
  await f.api.restore();
  assert.equal(f.api.getAuth().status, 'unavailable'); assert(f.api.getAuth().error);
  assert.equal(f.api.getAuth().user, null); assert.equal(f.api.getState().session.authenticated, false);
  assert.notEqual(storage.getItem(AUTH_STORAGE_KEY), null);
  await f.api.restore();
  assert.equal(f.api.getAuth().status, 'authenticated'); assert.equal(f.api.getAuth().error, '');
  assert.equal(f.calls.length, 2); await f.api.logout();
});

test('401 restoration expires and removes the stored session; public LOGIN_FAILED never creates one', async () => {
  const f = fixture([failure(401, 'UNAUTHORIZED')], { storage: memoryStorage(saved()) });
  await f.api.restore();
  assert.equal(f.api.getAuth().status, 'expired'); assert.equal(f.api.getAuth().user, null);
  assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), null); assert.deepEqual(f.api.getState().fabrics, []);
  const login = fixture([failure(401, 'LOGIN_FAILED')]);
  await assert.rejects(login.api.login(INPUT), expectCode('LOGIN_FAILED', 401));
  assert.equal(login.api.getAuth().status, 'anonymous'); assert.equal(login.storage.values.size, 0);
});

test('expired storage and expired committed credentials cannot remain authenticated', async () => {
  const expired = fixture([], { storage: memoryStorage(saved('old', { expiresAt: NOW })) });
  assert.equal(expired.api.getAuth().status, 'expired'); await expired.api.restore();
  assert.equal(expired.calls.length, 0); assert.equal(expired.storage.getItem(AUTH_STORAGE_KEY), null);
  let time = NOW;
  const f = fixture([response({ ...loginData(), expiresIn: 1 }), response(user())], { now: () => time });
  const result = await f.api.login(INPUT); f.api.commitLogin(result);
  time += 1001; f.api.checkExpiry();
  assert.equal(f.api.getAuth().status, 'expired'); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), null);
  const separate = fixture([response({ ...loginData(), expiresIn: 1 }), response(user())], { now: () => time });
  const stale = await separate.api.login(INPUT); time += 1001;
  assert.throws(() => separate.api.commitLogin(stale), expectCode('UNAUTHORIZED'));
  assert.equal(separate.storage.values.size, 0);
});

test('credentials scoped to another backend never restore against this backend', async () => {
  const f = fixture([], { storage: memoryStorage(saved('other-token', { baseUrl: 'https://other.example.test/api/v1' })) });
  await f.api.restore(); assert.equal(f.calls.length, 0); assert.equal(f.api.getAuth().status, 'anonymous');
});

test('caller cancellation rejects a late login result without persisting anything', async () => {
  const gate = deferred(), controller = new AbortController();
  const f = fixture([response(loginData()), () => gate.promise]);
  const pending = f.api.login(INPUT, { signal: controller.signal });
  while (f.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
  controller.abort(); gate.resolve(response(user()));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.api.getAuth().status, 'anonymous'); assert.equal(f.storage.values.size, 0);
});

test('logout invalidates both an in-flight login and a validated but uncommitted result', async t => {
  await t.test('in-flight login', async () => {
    const gate = deferred(); const f = fixture([response(loginData()), () => gate.promise]);
    const pending = f.api.login(INPUT);
    while (f.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
    await f.api.logout(); gate.resolve(response(user()));
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(f.api.getAuth().status, 'anonymous'); assert.equal(f.storage.values.size, 0);
  });
  await t.test('validated result awaiting commit', async () => {
    const f = fixture([response(loginData()), response(user())]); const result = await f.api.login(INPUT);
    await f.api.logout(); assert.throws(() => f.api.commitLogin(result), { name: 'AbortError' });
    assert.equal(f.api.getAuth().status, 'anonymous'); assert.equal(f.storage.values.size, 0);
  });
});

test('a restore response arriving after logout cannot resurrect the previous session', async () => {
  const gate = deferred(); const f = fixture([() => gate.promise], { storage: memoryStorage(saved()) });
  const pending = f.api.restore(); await f.api.logout(); gate.resolve(response(user())); await pending;
  assert.equal(f.api.getAuth().status, 'anonymous'); assert.equal(f.api.getAuth().user, null);
  assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), null);
});

test('an old restore 401 cannot expire a newer committed login', async () => {
  const oldRestore = deferred();
  const f = fixture([() => oldRestore.promise, response(loginData(user(), 'new-token')), response(user())], { storage: memoryStorage(saved('old-token')) });
  const restoring = f.api.restore(); const result = await f.api.login(INPUT); f.api.commitLogin(result);
  oldRestore.resolve(failure(401, 'UNAUTHORIZED')); await restoring;
  assert.equal(f.api.getAuth().status, 'authenticated');
  assert.equal(JSON.parse(f.storage.getItem(AUTH_STORAGE_KEY)).accessToken, 'new-token'); await f.api.logout();
});

test('two validated login attempts cannot both commit the same revision', async () => {
  const f = fixture([response(loginData()), response(user()), response(loginData(user(), 'second-token')), response(user())]);
  const first = await f.api.login(INPUT), second = await f.api.login(INPUT);
  f.api.commitLogin(first);
  assert.throws(() => f.api.commitLogin(second), { name: 'AbortError' });
  assert.equal(JSON.parse(f.storage.getItem(AUTH_STORAGE_KEY)).accessToken, 'test-access-token'); await f.api.logout();
});

test('all unconnected business mutations reject without fake success, fetching, or state changes', async () => {
  const f = fixture([]); const before = f.api.getState();
  const operations = ['updateSellerProfile', 'saveStore', 'updateReservation', 'prepareAiDraft', 'saveDraft', 'uploadPhotos', 'retryPhotos'];
  for (const name of operations) {
    assert.equal(typeof f.api[name], 'function', name);
    await assert.rejects(f.api[name]({}), expectCode('NOT_CONNECTED'));
  }
  assert.deepEqual(f.api.getState(), before); assert.equal(f.calls.length, 0); assert.equal(f.storage.values.size, 0);
  assert.deepEqual(before.fabrics, []); assert.deepEqual(before.sellers, []); assert.deepEqual(before.reservations, []); assert.deepEqual(before.inquiries, []);
});
