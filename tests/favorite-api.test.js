import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { favoriteIdentifier, favoriteQuery, favoriteInput, favoriteItem, favoritePage, favoriteCreated } from '../src/react/services/favorite-contract.js';

const time = '2026-10-12T18:30:00+09:00';
const user = (extra = {}) => ({ userId: 41, email: 'qa@example.test', nickname: '검증 계정', role: 'BUYER', phone_number: null, seller_approval_status: null, hasStore: false, created_at: time, ...extra });
const fabricItem = (extra = {}) => ({ favoriteId: 3, target_type: 'FABRIC', created_at: time, fabricId: 12, title: '검증 원단', sale_type: 'SCRAP', price: 3500, thumbnail_url: null, fabric_status: 'POSTED', is_deleted: false, ...extra });
const patternItem = (extra = {}) => ({ favoriteId: 4, target_type: 'PATTERN', created_at: time, patternId: 8, pattern_name: '지퍼 파우치', category: '소품', image_url: null, is_active: true, ...extra });
const page = (items = [fabricItem()], extra = {}) => ({ content: items, page: 0, size: 20, totalElements: items.length, totalPages: items.length ? 1 : 0, ...extra });
const response = (data, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const failure = (code, status = 500) => new Response(JSON.stringify({ success: false, error: { code, message: '검증 실패' } }), { status });
async function session(business, { role = 'BUYER' } = {}) {
  const account = user({ role, seller_approval_status: role === 'SELLER' ? 'APPROVED' : null }), calls = [];
  let authenticating = false;
  const api = createLiveApi({ storage: null, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/logout')) return response(null);
    if (url.endsWith('/auth/login')) { authenticating = true; return response({ accessToken: 'favorite-test', expiresIn: 3600, user: account }); }
    if (authenticating && url.endsWith('/users/me')) { authenticating = false; return response(account); }
    calls.push({ url, options }); return business(url, options);
  } });
  await api.commitLogin(await api.login({ email: account.email, password: 'test-only-value' }));
  return { api, calls };
}

test('favorite query and body send only the selected target', () => {
  assert.equal(favoriteIdentifier('0012'), '12');
  assert.equal(favoriteQuery({ target_type: 'PATTERN', page: 1, size: 5 }).toString(), 'target_type=PATTERN&page=1&size=5');
  assert.deepEqual(favoriteInput('FABRIC', '12'), { target_type: 'FABRIC', fabric_id: 12 });
  assert.deepEqual(favoriteInput('PATTERN', 8), { target_type: 'PATTERN', pattern_id: 8 });
  for (const input of [{ target_type: 'STORE' }, { page: -1 }, { size: 51 }]) assert.throws(() => favoriteQuery(input), { code: 'VALIDATION_ERROR' });
  assert.throws(() => favoriteInput('FABRIC', 0), { code: 'VALIDATION_ERROR' });
});

test('favorite items keep sold-out and inactive targets without mixing shapes', () => {
  const fabric = favoriteItem(fabricItem({ fabric_status: 'SOLD_OUT', is_deleted: true, price: null }));
  assert.equal(fabric.target_id, '12'); assert.equal(fabric.is_deleted, true); assert.equal(fabric.price, null);
  const pattern = favoriteItem(patternItem({ is_active: false, category: null }));
  assert.equal(pattern.target_id, '8'); assert.equal(pattern.is_active, false);
  assert.throws(() => favoriteItem(fabricItem({ title: '' })), { code: 'INVALID_RESPONSE' });
  assert.throws(() => favoritePage(page([fabricItem(), fabricItem()]), favoriteQuery()), { code: 'INVALID_RESPONSE' });
  assert.deepEqual(favoriteCreated({ favoriteId: 3 }), { id: '3' });
});

test('logged-in favorite calls use the account token and exact paths', async () => {
  const f = await session((url, options) => {
    if (options.method === 'POST') return response({ favoriteId: 3 }, 201);
    if (options.method === 'DELETE') return response(null);
    return response(page());
  });
  assert.equal((await f.api.listFavorites({ target_type: 'FABRIC' })).items[0].title, '검증 원단');
  assert.equal(f.calls[0].url, '/api/v1/favorites/me?target_type=FABRIC&page=0&size=20');
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer favorite-test');
  assert.deepEqual(await f.api.createFavorite('FABRIC', 12), { id: '3' });
  assert.deepEqual(JSON.parse(f.calls[1].options.body), { target_type: 'FABRIC', fabric_id: 12 });
  assert.deepEqual(await f.api.deleteFavorite(3), { id: '3' });
  assert.equal(f.calls[2].url, '/api/v1/favorites/3');
  assert.equal(f.calls[2].options.method, 'DELETE');
  await f.api.logout();
});

test('anonymous favorite access fails before HTTP and uncertain writes are not retried', async () => {
  const api = createLiveApi({ storage: null, fetchImpl: () => { throw new Error('unexpected fetch'); } });
  await assert.rejects(api.listFavorites(), { code: 'UNAUTHORIZED' });
  const f = await session(() => { throw new TypeError('offline'); });
  await assert.rejects(f.api.createFavorite('PATTERN', 8), error => error.outcomeUnknown === true && error.code === 'NETWORK_ERROR');
  assert.equal(f.calls.length, 1);
  const known = await session(() => failure('FAVORITE_DUPLICATED', 409));
  await assert.rejects(known.api.createFavorite('FABRIC', 12), error => error.code === 'FAVORITE_DUPLICATED' && !error.outcomeUnknown);
  assert.equal(known.calls.length, 1);
  await f.api.logout(); await known.api.logout();
});
