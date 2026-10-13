import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { fabricPage, fabricDetail, fabricQuery } from '../src/react/services/fabric-contract.js';

const response = (data, status = 200) => new Response(JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: data }), { status, headers: { 'Content-Type': 'application/json' } });
const summary = (overrides = {}) => ({
  fabricId: 17, title: '블루 코튼', sale_type: 'SCRAP', price: 7000, material: 'COTTON', thickness: 'THIN', color_family: 'BLUE', width_cm: 140, length_cm: 90,
  available_length_cm: null, is_reserved: true, has_defect: false, thumbnail_url: 'https://api.example.com/uploads/thumb.webp', store_name: '검증용 매장', ...overrides,
});
const page = (overrides = {}) => ({ content: [summary()], page: 1, size: 20, totalElements: 21, totalPages: 2, ...overrides });
const detail = (overrides = {}) => ({
  fabricId: 17, title: '블루 코튼', sale_type: 'ROLL', price: 5000, status: 'POSTED',
  detail: { material: 'COTTON', thickness: 'NORMAL', color_family: 'BLUE', color_detail: null, width_cm: 150, length_cm: null, has_defect: true, defect_note: '끝단 손상', description: '검증 원단' },
  images: [{ imageId: 2, image_url: 'https://api.example.com/zoom.png', thumbnail_url: null, image_type: 'ZOOM', sort_order: 1 }, { imageId: 1, image_url: 'https://api.example.com/full.png', thumbnail_url: null, image_type: null, sort_order: 0 }],
  store: { storeId: 8, store_name: '검증용 매장', store_address: '공개 매장 주소', store_phone: null, closed_days: null, pickup_guide: '예약 후 방문' },
  availability: { is_reserved: false, available_length_cm: 70, reserved_length_cm: 180 }, created_at: '2026-10-12T10:00:00+09:00', ...overrides,
});
const profile = { userId: 8, nickname: '검증 구매자', role: 'BUYER', email: 'buyer@example.com', hasStore: false };
async function loggedIn(fetchBusiness) {
  const calls = [];
  const api = createLiveApi({ storage: null, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/logout')) return response(null);
    calls.push({ url, options });
    if (url.endsWith('/auth/login')) return response({ accessToken: 'test-fabric-token', expiresIn: 3600, user: profile });
    if (url.endsWith('/users/me')) return response(profile);
    return fetchBusiness(url, options);
  } });
  api.commitLogin(await api.login({ email: profile.email, password: 'test-only' }));
  return { api, calls };
}

test('fabric filters map UI labels to server enums, omit empty inputs, and preserve server paging', () => {
  const query = fabricQuery({ sale_type: 'ROLL', material: '면,LINEN', thickness: '중간 두께', color: '블루', keyword: '  린넨  ', sort: 'price_asc', page: '2', size: '10', mode: 'demo', return: '/preview' });
  assert.deepEqual(Object.fromEntries(query), { sale_type: 'ROLL', material: 'COTTON,LINEN', thickness: 'NORMAL', color_family: 'BLUE', keyword: '린넨', sort: 'price_asc', page: '2', size: '10' });
  assert.deepEqual(Object.fromEntries(fabricQuery({ material: '', color: '', keyword: '  ' })), { sale_type: 'SCRAP', sort: 'latest', page: '0', size: '20' });
  for (const invalid of [{ material: '아무 소재' }, { color: '올리브' }, { material: 'COTTON,,LINEN' }, { page: -1 }, { size: 51 }, { size: 'x' }, { sort: 'random' }, { keyword: 'x'.repeat(101) }]) {
    assert.throws(() => fabricQuery(invalid), error => error.code === 'VALIDATION_ERROR');
  }
});

test('public list uses actual envelope, total count, availability and thumbnail without adding demo data', async () => {
  let request;
  const api = createLiveApi({ storage: null, fetchImpl: async (url, options) => { request = { url, options }; return response(page()); } });
  const result = await api.listFabrics({ page: 1 });
  assert.equal(request.url, '/api/v1/fabrics?sale_type=SCRAP&sort=latest&page=1&size=20');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(result.totalElements, 21);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].id, '17');
  assert.equal(result.content[0].is_reserved, true);
  assert.equal(result.content[0].color, '블루');
  assert.equal(result.content[0].description, null);
  assert.equal(result.content[0].store, undefined);
  assert.equal(result.content[0].image_url, 'https://api.example.com/uploads/thumb.webp');
  assert.deepEqual(api.getState().fabrics, []);
});

test('detail normalizes nested store, all sorted images and low roll stock, including nullable fields', () => {
  const result = fabricDetail(detail());
  assert.equal(result.id, '17');
  assert.equal(result.store_id, '8');
  assert.equal(result.store.address, '공개 매장 주소');
  assert.equal(result.store.phone_number, null);
  assert.equal(result.available_length_cm, 70);
  assert.equal(result.reserved_length_cm, 180);
  assert.equal(result.length_cm, null);
  assert.equal(result.thickness, '중간 두께');
  assert.deepEqual(result.images.map(image => image.id), ['1', '2']);
  assert.equal(result.image_url, 'https://api.example.com/full.png');
  assert.equal(fabricDetail(detail({ images: [] })).image_url, null);
  const unsafe = detail({ images: [{ imageId: 1, image_url: 'javascript:alert(1)', thumbnail_url: 'data:text/html,bad', image_type: 'FULL', sort_order: 0 }] });
  assert.equal(fabricDetail(unsafe).image_url, null);
});

test('missing or malformed data cannot turn into zero-priced, available fabric or a false empty result', () => {
  for (const malformed of [null, {}, { ...page(), content: null }, { ...page(), totalPages: 9 }, { ...page(), content: [summary({ price: null })] }, { ...page(), content: [summary({ is_reserved: undefined })] }, { ...page(), content: [summary({ material: 'invented' })] }]) {
    assert.throws(() => fabricPage(malformed), error => error.code === 'INVALID_RESPONSE');
  }
  for (const malformed of [null, {}, detail({ store: {} }), detail({ availability: {} }), detail({ created_at: 'invalid' })]) {
    assert.throws(() => fabricDetail(malformed), error => error.code === 'INVALID_RESPONSE');
  }
  assert.equal(fabricPage({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }).content.length, 0);
  assert.equal(fabricPage({ content: [], page: 4, size: 20, totalElements: 21, totalPages: 2 }).totalElements, 21);
});

test('authenticated detail reads send the existing bearer and reject wrong resource IDs', async () => {
  const { api, calls } = await loggedIn(() => response(detail()));
  assert.equal((await api.getFabric('17')).id, '17');
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer test-fabric-token');
  await assert.rejects(api.getFabric('18'), error => error.code === 'INVALID_RESPONSE');
  const before = calls.length;
  for (const id of ['fabric-roll-1', '-1', '0', '1?mode=demo', '1/../../users/me', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(api.getFabric(id), error => error.code === 'VALIDATION_ERROR');
  }
  assert.equal(calls.length, before);
  await api.logout();
});

test('404 stays distinct from a network error and an empty result; authenticated 401 expires the session', async () => {
  let code = 404;
  const { api } = await loggedIn(() => response({ code: code === 404 ? 'NOT_FOUND' : 'UNAUTHORIZED', message: '검증 오류' }, code));
  await assert.rejects(api.getFabric(17), error => error.status === 404 && error.code === 'NOT_FOUND');
  assert.equal(api.getAuth().status, 'authenticated');
  code = 401;
  await assert.rejects(api.listFabrics(), error => error.status === 401);
  assert.equal(api.getAuth().status, 'expired');
  const offline = createLiveApi({ storage: null, fetchImpl: async () => { throw new TypeError('offline'); } });
  await assert.rejects(offline.listFabrics(), error => error.code === 'NETWORK_ERROR');
});

test('a read completing after logout or cancellation cannot surface a stale successful result', async () => {
  let resolve;
  const { api } = await loggedIn(() => new Promise(done => { resolve = done; }));
  const pending = api.getFabric(17);
  await api.logout(); resolve(response(detail()));
  await assert.rejects(pending, error => error.name === 'AbortError');
  const controller = new AbortController();
  const anonymous = createLiveApi({ storage: null, fetchImpl: () => new Promise(done => { resolve = done; }) });
  const read = anonymous.listFabrics({}, { signal: controller.signal });
  controller.abort(); resolve(response(page()));
  await assert.rejects(read, error => error.name === 'AbortError');
});

test('reads are fresh requests across changing server availability', async () => {
  let reserved = true, calls = 0;
  const api = createLiveApi({ storage: null, fetchImpl: async () => { calls++; return response(page({ content: [summary({ is_reserved: reserved })] })); } });
  assert.equal((await api.listFabrics()).content[0].is_reserved, true);
  reserved = false;
  assert.equal((await api.listFabrics()).content[0].is_reserved, false);
  assert.equal(calls, 2);
});
