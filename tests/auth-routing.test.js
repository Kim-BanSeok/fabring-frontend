import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore, isFactoryRoute, pageMountKey } from '../src/react/app/store.js';
import { createMockApi } from '../src/prototype/services/mock-api.js';
import { createLiveApi, AUTH_STORAGE_KEY } from '../src/react/services/live-api.js';
import { getAuthState } from '../src/react/pages/auth-state.js';

const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const profile = { userId: 4, nickname: '테스트 판매자', role: 'SELLER', email: 'seller@test.example', hasStore: false, seller_approval_status: 'PENDING', phone_number: null };
const ok = data => new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
function setup(hash = '#/auth/buyer/login?mode=live', storage = memory(), options = {}) {
  const browser = new EventTarget();
  browser.location = new URL(`http://localhost/${hash}`);
  browser.sessionStorage = storage;
  browser.history = { replaceState: (_state, _unused, url) => { browser.location.hash = url; } };
  const liveApi = createLiveApi({ storage, fetchImpl: async url => ok(url.endsWith('/auth/login') ? { accessToken: 'test-only-token', expiresIn: 60, user: profile } : profile), ...options });
  const savedApi = createMockApi(memory());
  const store = createAppStore({ browser, liveApi, savedApi });
  return { store, liveApi, savedApi, browser, storage };
}

test('plain public entry opens real login even after a prior demo session', () => {
  const storage = memory();
  storage.setItem('yangju-loop-mode', 'demo');
  const { store } = setup('', storage);
  assert.equal(store.getSnapshot().path, '/auth/buyer/login');
  assert.equal(store.getSnapshot().mode, 'live');
  assert.equal(store.getSnapshot().auth.status, 'anonymous');
  assert.deepEqual(store.getSnapshot().state.fabrics, []);
});

test('public factory map opens real data without login after a saved demo session', async () => {
  const storage = memory();
  storage.setItem('yangju-loop-mode', 'demo');
  const { store, liveApi } = setup('#/buyer/supplies', storage);
  assert.equal(store.getSnapshot().mode, 'live');
  assert.equal(store.getSnapshot().api, liveApi);
  assert.equal(store.getSnapshot().auth.status, 'anonymous');
  assert.equal(storage.getItem('yangju-loop-mode'), 'live');
  await store.navigate('/buyer/supplies/23?from=%2Fbuyer%2Fpatterns%2F7');
  assert.equal(store.getSnapshot().mode, 'live');
  assert.equal(store.getSnapshot().query.get('from'), '/buyer/patterns/7');
  assert.equal(isFactoryRoute(store.getSnapshot().path), true);
  for (const path of ['/buyer/favorites', '/buyer/supplies-private', '/buyer/supplies/23/edit']) assert.equal(isFactoryRoute(path), false);
});

test('factory navigation exits demo by default but explicit demo and gallery routes stay examples', async () => {
  const { store, liveApi } = setup('#/buyer/supplies?mode=demo');
  assert.equal(store.getSnapshot().mode, 'demo');
  await store.navigate('/buyer/supplies');
  assert.equal(store.getSnapshot().api, liveApi);
  await store.navigate('/buyer/supplies?mode=demo');
  assert.equal(store.getSnapshot().mode, 'demo');
  await store.navigate('/buyer/supplies/1?mode=demo');
  assert.equal(store.getSnapshot().mode, 'demo');
  await store.navigate('/buyer/supplies?scenario=123:1637');
  assert.equal(store.getSnapshot().mode, 'demo');
  await store.navigate('/buyer/supplies');
  assert.equal(store.getSnapshot().mode, 'live');
});

test('public factory map preserves authenticated role while private buyer routes retain role checks', async () => {
  const { store, liveApi } = setup();
  liveApi.commitLogin(await liveApi.login({ email: profile.email, password: 'TestPass123!' }));
  await store.navigate('/buyer/supplies');
  assert.equal(store.getSnapshot().path, '/buyer/supplies');
  assert.equal(liveApi.getAuth().user.role, 'SELLER');
  await store.navigate('/buyer/favorites');
  assert.equal(store.getSnapshot().path, '/seller/dashboard');
  await liveApi.logout();
});

test('factory selection preserves the mounted map while detail, mode and session changes reset it', async () => {
  const { store, liveApi } = setup('#/buyer/supplies');
  const stop = store.connect();
  const first = pageMountKey(store.getSnapshot());
  await store.navigate('/buyer/supplies?selected=331&focus=selected');
  assert.equal(pageMountKey(store.getSnapshot()), first);
  await store.navigate('/buyer/supplies?selected=348&focus=selected');
  assert.equal(pageMountKey(store.getSnapshot()), first);
  await store.navigate('/buyer/supplies/348');
  assert.notEqual(pageMountKey(store.getSnapshot()), first);
  await store.navigate('/buyer/supplies?mode=demo');
  assert.notEqual(pageMountKey(store.getSnapshot()), first);
  await store.navigate('/buyer/supplies');
  liveApi.commitLogin(await liveApi.login({ email: profile.email, password: 'TestPass123!' }));
  assert.notEqual(pageMountKey(store.getSnapshot()), first);
  await liveApi.logout();
  stop();
});

test('live route roles never change authenticated server role or expose demo state', async () => {
  const { store, liveApi } = setup();
  const stop = store.connect();
  liveApi.commitLogin(await liveApi.login({ email: profile.email, password: 'TestPass123!' }));
  await store.navigate('/admin/dashboard');
  assert.equal(store.getSnapshot().path, '/seller/dashboard');
  assert.equal(store.getSnapshot().state.session.role, 'SELLER');
  assert.deepEqual(store.getSnapshot().state.fabrics, []);
  assert.equal(store.getSnapshot().state.seller.nickname, profile.nickname);
  stop(); await liveApi.logout();
});

test('a real session ignores demo links and stays on the server account', async () => {
  const { store, liveApi } = setup();
  const stop = store.connect();
  liveApi.commitLogin(await liveApi.login({ email: profile.email, password: 'TestPass123!' }));
  await store.navigate('/admin/dashboard?mode=demo');
  assert.equal(store.getSnapshot().mode, 'live');
  assert.equal(store.getSnapshot().path, '/seller/dashboard');
  assert.equal(store.getSnapshot().api, liveApi);
  assert.equal(liveApi.getAuth().user.role, 'SELLER');
  stop(); await liveApi.logout();
});

test('scenario links stay on the server account', async () => {
  const { store, liveApi } = setup();
  await store.navigate('/seller/register?scenario=127:6528');
  assert.equal(store.getSnapshot().mode, 'live');
  assert.equal(store.getSnapshot().api, liveApi);
  assert.equal(store.getSnapshot().scenario, '');
});

test('logout clears real token and real drafts without resetting saved demo work', async () => {
  const { store, liveApi, savedApi, storage } = setup();
  const stop = store.connect();
  await savedApi.updateProfile({ nickname: '시연 보존' });
  liveApi.commitLogin(await liveApi.login({ email: profile.email, password: 'TestPass123!' }));
  const drafts = store.getSnapshot().drafts;
  drafts.set('sensitive', 'temporary');
  await store.navigate('/seller/dashboard');
  await store.logout();
  assert.equal(store.getSnapshot().path, '/auth/seller/login');
  assert.equal(storage.getItem(AUTH_STORAGE_KEY), undefined);
  assert.equal(drafts.size, 0);
  assert.equal(savedApi.getState().buyer.nickname, '시연 보존');
  stop();
});

test('StrictMode re-subscription consumes one request once, leaving processing aborts it', async () => {
  const drafts = new Map(), state = getAuthState(drafts);
  let calls = 0, finish;
  const api = { mode: 'live', login: () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
  const operation = state.startRequest({ api, role: 'buyer', kind: 'login', input: { password: 'TestPass123!' } });
  let consumed = 0;
  const stop1 = state.subscribe(operation, () => consumed++, assert.fail);
  stop1();
  const stop2 = state.subscribe(operation, () => consumed++, assert.fail);
  await Promise.resolve(); finish({ role: 'BUYER' });
  await operation.promise; await Promise.resolve();
  assert.equal(calls, 1); assert.equal(consumed, 1); stop2();
  const pending = state.startRequest({ api, role: 'buyer', kind: 'login', input: { password: 'TestPass123!' } });
  const leave = state.subscribe(pending, () => consumed++, assert.fail);
  await Promise.resolve(); leave(); await Promise.resolve();
  assert.equal(pending.controller.signal.aborted, true);
  finish({ role: 'BUYER' }); await pending.promise; await Promise.resolve();
  assert.equal(consumed, 1);
});

test('expiration clears the signed-in drafts', async () => {
  let time = Date.now();
  const { store, liveApi } = setup(undefined, undefined, { now: () => time });
  const stop = store.connect();
  let snapshot = store.getSnapshot();
  getAuthState(snapshot.drafts).updateForm(snapshot.state, 'buyer', 'signup', 'password', 'Abandoned-secret!');
  liveApi.commitLogin(await liveApi.login({ email: profile.email, password: 'TestPass123!' }));
  assert.equal(snapshot.drafts.size, 0);
  snapshot = store.getSnapshot();
  getAuthState(snapshot.drafts).updateForm(snapshot.state, 'buyer', 'signup', 'password', 'Another-secret!');
  await store.navigate('/admin/dashboard?mode=demo');
  snapshot.drafts.set('note', 'keep-until-expiry');
  time += 61000; liveApi.checkExpiry();
  assert.equal(snapshot.drafts.size, 0);
  await store.navigate('/auth/buyer/signup');
  snapshot = store.getSnapshot();
  assert.equal(store.getSnapshot().mode, 'live');
  assert.equal(getAuthState(snapshot.drafts).initialForm(snapshot.state, 'buyer', 'signup').password, '');
  stop();
});

test('direct session clearing erases anonymous auth drafts without remount loops', async () => {
  const { store, liveApi } = setup('#/auth/buyer/session-expired?mode=live');
  const stop = store.connect();
  const before = store.getSnapshot();
  getAuthState(before.drafts).updateForm(before.state, 'seller', 'signup', 'password', 'Abandoned-secret!');
  await liveApi.logout();
  assert.equal(before.drafts.size, 0);
  assert.equal(store.getSnapshot().sessionId, before.sessionId);
  stop();
});
