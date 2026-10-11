import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore, parseRoute } from '../src/react/app/store.js';
import { createMockApi } from '../src/prototype/services/mock-api.js';

function setup(hash = '#/preview', savedStorage) {
  const values = new Map();
  const storage = savedStorage || { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const browser = new EventTarget();
  browser.location = new URL(`http://localhost/${hash}`);
  const replacements = [];
  browser.history = { replaceState: (_state, _unused, url) => { replacements.push(url); browser.location.hash = url; } };
  const store = createAppStore({ browser, savedApi: createMockApi(storage) });
  return { store, browser, storage, replacements };
}

test('hash routes preserve queries and infer auth and service roles', () => {
  assert.equal(parseRoute('').path, '/auth/buyer/login');
  assert.equal(parseRoute('#/preview').path, '/preview');
  assert.equal(parseRoute('#/seller/dashboard/').role, 'SELLER');
  assert.equal(parseRoute('#/auth/admin/login').role, 'ADMIN');
  assert.equal(parseRoute('#/buyer/fabrics?q=%EC%BA%94%EB%B2%84%EC%8A%A4').query.get('q'), '캔버스');
});

test('intentional same-context navigation retains or restores scroll without leaking it to another route', async () => {
  const { store, browser } = setup('#/seller/calendar');
  browser.scrollY = 420;
  await store.navigate('/seller/calendar?date=2026-10-15', { preserveScroll: true });
  assert.equal(store.getSnapshot().scrollRestoration.top, 420);
  assert.equal(store.getSnapshot().scrollRestoration.focusTarget, null);
  await store.navigate('/seller/register/manual', { scrollY: 930 });
  assert.equal(store.getSnapshot().scrollRestoration.top, 930);
  await store.navigate('/seller/dashboard');
  assert.equal(store.getSnapshot().scrollRestoration.top, 0);
  assert.equal(store.getSnapshot().scrollRestoration.focusTarget, null);
});

test('focus restoration is explicit, validated and independent from scroll restoration', async () => {
  const { store, browser } = setup('#/seller/calendar');
  browser.scrollY = 420;
  await store.navigate('/seller/calendar?date=2026-10-15', { preserveScroll: true, focusTarget: 'seller-calendar-date' });
  assert.equal(store.getSnapshot().scrollRestoration.top, 420);
  assert.equal(store.getSnapshot().scrollRestoration.focusTarget, 'seller-calendar-date');
  await store.navigate('/seller/register/manual?type=ROLL', { scrollY: 930, focusTarget: 'seller-photo-review' });
  assert.equal(store.getSnapshot().scrollRestoration.top, 930);
  assert.equal(store.getSnapshot().scrollRestoration.focusTarget, 'seller-photo-review');
  await store.navigate('/buyer/supplies?selected=2&focus=selected', { preserveScroll: true });
  assert.equal(store.getSnapshot().scrollRestoration.top, 420);
  assert.equal(store.getSnapshot().scrollRestoration.focusTarget, null);
  await store.navigate('/seller/dashboard', { focusTarget: 'body, input' });
  assert.equal(store.getSnapshot().scrollRestoration.top, 0);
  assert.equal(store.getSnapshot().scrollRestoration.focusTarget, null);
});

test('external snapshot is stable until state changes; unsubscribe removes listener', async () => {
  const { store } = setup();
  const first = store.getSnapshot();
  assert.equal(first, store.getSnapshot());
  let changes = 0;
  const stop = store.subscribe(() => changes++);
  await store.navigate('/seller/dashboard');
  assert.equal(changes, 1);
  assert.equal(store.getSnapshot().state.session.role, 'SELLER');
  assert.notEqual(store.getSnapshot(), first);
  stop(); await store.refresh(); assert.equal(changes, 1);
});

test('replace navigation replaces history and browser back/hash changes update the service role', async () => {
  const { store, browser, replacements } = setup('#/auth/buyer/processing');
  const disconnect = store.connect();
  await store.navigate('/buyer/home', { replace: true });
  assert.deepEqual(replacements, ['#/buyer/home']);
  browser.location.hash = '#/admin/approvals'; browser.dispatchEvent(new Event('hashchange'));
  assert.equal(store.getSnapshot().role, 'ADMIN');
  disconnect(); browser.location.hash = '#/buyer/home'; browser.dispatchEvent(new Event('hashchange'));
  assert.equal(store.getSnapshot().role, 'ADMIN');
});

test('gallery service and drafts remain isolated across steps and return to the saved demo', async () => {
  const { store } = setup('#/buyer/home');
  const saved = store.getSnapshot();
  saved.drafts.set('memo', 'saved draft');
  await store.navigate('/seller/register?scenario=127%3A6528');
  const example = store.getSnapshot();
  assert.notEqual(example.api, saved.api); assert.equal(example.drafts.has('memo'), false);
  example.drafts.set('memo', 'example draft');
  await example.api.setDemo({ seller_approval_status: 'REJECTED' });
  await store.navigate('/seller/profile');
  assert.equal(store.getSnapshot().api, example.api);
  assert.equal(store.getSnapshot().drafts.get('memo'), 'example draft');
  await store.navigate('/preview');
  assert.equal(store.getSnapshot().api, saved.api);
  assert.equal(store.getSnapshot().drafts.get('memo'), 'saved draft');
  assert.equal(store.getSnapshot().state.seller.seller_approval_status, saved.state.seller.seller_approval_status);
});

test('reset inside a gallery example does not erase saved user demo data', async () => {
  const { store } = setup('#/buyer/profile');
  await store.getSnapshot().api.updateProfile({ nickname: '보존할 이름', phone_number: '' });
  await store.navigate('/seller/register?scenario=127%3A6528');
  await store.reset();
  assert.equal(store.getSnapshot().state.buyer.nickname, '보존할 이름');
  await Promise.resolve(); await store.navigate('/buyer/home');
});

test('logout clears tab drafts and login state but preserves submitted work', async () => {
  const { store } = setup('#/buyer/profile');
  const { api, drafts } = store.getSnapshot();
  await api.updateProfile({ nickname: '보존된 프로필', phone_number: '' });
  drafts.set('buyer:pickup:one', { memo: 'temporary' });
  await store.logout();
  assert.equal(drafts.size, 0); assert.equal(store.getSnapshot().path, '/auth/buyer/login');
  assert.equal(store.getSnapshot().state.session.authenticated, false);
  assert.equal(store.getSnapshot().state.buyer.nickname, '보존된 프로필');
});

test('feedback follows its immediate result navigation and clears at the next route', async () => {
  const { store } = setup('#/admin/approvals');
  store.notify('원단 게시를 승인했어요.');
  await store.navigate('/admin/fabrics/fabric-pending-1?result=POSTED');
  assert.equal(store.getSnapshot().toast, '원단 게시를 승인했어요.');
  await store.navigate('/admin/approvals');
  assert.equal(store.getSnapshot().toast, '');
});

test('existing HTML localStorage is reused by a new React session', async () => {
  const initial = setup('#/buyer/profile');
  await initial.store.getSnapshot().api.updateProfile({ nickname: 'HTML 작업 내역', phone_number: '010-0000-0000' });
  const reopened = setup('#/buyer/profile', initial.storage);
  assert.equal(reopened.store.getSnapshot().state.buyer.nickname, 'HTML 작업 내역');
  assert.equal(reopened.store.getSnapshot().state.buyer.phone_number, '010-0000-0000');
});
