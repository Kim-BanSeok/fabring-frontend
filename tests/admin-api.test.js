import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { adminQuery, adminPage, adminSeller, adminFabric, adminReview, findAdminSeller } from '../src/react/services/admin-contract.js';

const created_at = '2026-10-12T12:00:00+09:00';
const seller = (extra = {}) => ({ userId: 7, email: 'admin-test-seller@example.test', nickname: '판매자', phone_number: null, seller_approval_status: 'PENDING', store: null, created_at, ...extra });
const fabric = (extra = {}) => ({ fabricId: 12, title: '검토 원단', sale_type: 'ROLL', price: 5000, status: 'PENDING', remaining_length_cm: 900, store_name: '검증 매장', created_at,
  detail: { material: 'COTTON', thickness: 'NORMAL', color_family: 'BLUE', color_detail: null, width_cm: 150, length_cm: null, has_defect: false, defect_note: null, blend_ratio: null, weave: null, grain_direction: null, description: '실제 설명' },
  images: [{ imageId: 4, image_url: 'http://localhost:3000/uploads/qa.png', thumbnail_url: null, image_type: null, sort_order: 0 }], ...extra });
const store = { storeId: 3, store_name: '검증 매장', store_address: '검증용 주소', store_phone: '031-000-0000', closed_days: null, pickup_guide: null };
const detail = () => ({ ...fabric(), store, reject_reason: '치수 확인 필요', availability: { is_reserved: false, available_length_cm: 720, reserved_length_cm: 180 } });
const page = (content, extra = {}) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0, ...extra });
const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status });
const failure = (status, code) => response({ code, message: '검증 오류' }, status);
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function session(business, { role = 'ADMIN', timeoutMs } = {}) {
  const calls = [], user = { userId: 99, email: 'admin@example.test', nickname: '관리자', role, hasStore: false, seller_approval_status: null };
  let signingIn = false;
  const api = createLiveApi({ storage: null, timeoutMs, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/login')) { signingIn = true; return response({ accessToken: 'admin-test-token', expiresIn: 3600, user }); }
    if (url.endsWith('/users/me') && signingIn) { signingIn = false; return response(user); }
    calls.push({ url, options }); return business(url, options);
  } });
  api.commitLogin(await api.login({ email: user.email, password: 'test-only-not-a-real-account' }));
  return { api, calls };
}

test('admin query supports only server statuses, preserves pagination and rejects invalid ranges', () => {
  assert.equal(String(adminQuery('sellers')), 'status=PENDING&page=0&size=20');
  assert.equal(String(adminQuery('fabrics', new URLSearchParams('status=SOLD_OUT&page=2&size=50'))), 'status=SOLD_OUT&page=2&size=50');
  for (const values of [{ status: 'ALL' }, { status: 'APPROVED' }, { page: -1 }, { page: 0.5 }, { size: 51 }, { size: 0 }]) assert.throws(() => adminQuery('fabrics', values), { code: 'VALIDATION_ERROR' });
});

test('seller DTO distinguishes null store and nullable fields without inventing rejection reason', () => {
  assert.equal(adminSeller(seller()).store, null); assert.equal(adminSeller(seller()).hasStore, false);
  const result = adminSeller(seller({ store })); assert.equal(result.store.address, store.store_address); assert.equal(result.hasStore, true);
  assert.equal(Object.hasOwn(result, 'reject_reason'), false);
  for (const patch of [{ userId: 0 }, { store: undefined }, { phone_number: undefined }, { seller_approval_status: 'POSTED' }, { created_at: 'bad' }]) assert.throws(() => adminSeller(seller(patch)), { code: 'INVALID_RESPONSE' });
});

test('admin fabric list decodes actual metadata and nullable image type without assuming available inventory', () => {
  const result = adminFabric(fabric()); assert.equal(result.material, '면'); assert.equal(result.color, '블루');
  assert.equal(result.remaining_length_cm, 900); assert.equal(result.available_length_cm, null); assert.equal(result.reject_reason, null);
  assert.equal(result.images[0].image_type, null); assert.equal(result.source, 'api');
  assert.equal(adminFabric(fabric({ images: [{ ...fabric().images[0], image_url: 'javascript:alert(1)' }] })).image_url, null);
  for (const patch of [{ fabricId: '12' }, { detail: { ...fabric().detail, material: 'INVALID' } }, { remaining_length_cm: null }, { images: [fabric().images[0], fabric().images[0]] }]) assert.throws(() => adminFabric(fabric(patch)), { code: 'INVALID_RESPONSE' });
});

test('page decoder rejects wrong query echo, mixed statuses, duplicates and malformed totals', () => {
  const query = adminQuery('sellers'); assert.equal(adminPage('sellers', page([seller()]), query).items[0].id, '7');
  for (const raw of [page([seller()], { page: 1 }), page([seller()], { size: 10 }), page([seller()], { totalPages: 2 }), page([seller(), seller()]), page([seller({ seller_approval_status: 'APPROVED' })])]) assert.throws(() => adminPage('sellers', raw, query), { code: 'INVALID_RESPONSE' });
});

test('review writes use only endpoint contract and trim a 1–255 character fabric reason', () => {
  assert.equal(adminReview('sellers', 7, 'REJECTED', 'not supported').body, undefined);
  assert.deepEqual(adminReview('fabrics', 12, 'REJECTED', ' 치수 확인 '), { identifier: '12', action: 'reject', body: { reason: '치수 확인' } });
  assert.equal(adminReview('fabrics', 12, 'POSTED', 'ignored').body, undefined);
  for (const value of ['', ' ', '가'.repeat(256), null]) assert.throws(() => adminReview('fabrics', 12, 'REJECTED', value), { code: 'VALIDATION_ERROR' });
  assert.throws(() => adminReview('sellers', 7, 'POSTED'), { code: 'VALIDATION_ERROR' });
  assert.throws(() => adminReview('fabrics', '../7', 'POSTED'), { code: 'VALIDATION_ERROR' });
});

test('seller detail searches later pages and other states instead of interpreting a first-page miss as absence', async () => {
  const calls = [];
  const result = await findAdminSeller(async filter => {
    calls.push(filter); return { items: filter.status === 'APPROVED' && filter.page === 1 ? [adminSeller(seller({ seller_approval_status: 'APPROVED' }))] : [], totalPages: filter.status === 'APPROVED' ? 2 : 0 };
  }, 7, { statusHint: 'REJECTED' });
  assert.equal(result.id, '7'); assert.deepEqual(calls.map(item => [item.status, item.page]), [['REJECTED', 0], ['PENDING', 0], ['APPROVED', 0], ['APPROVED', 1]]);
});

test('seller lookup distinguishes absence, server error, cancellation and bounded incomplete search', async () => {
  await assert.rejects(findAdminSeller(async () => ({ items: [], totalPages: 0 }), 7), { code: 'NOT_FOUND' });
  await assert.rejects(findAdminSeller(async () => { throw new Error('offline'); }, 7), { message: 'offline' });
  await assert.rejects(findAdminSeller(async () => ({ items: [], totalPages: 300 }), 7, { maxPages: 2 }), { code: 'LOOKUP_LIMIT' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(findAdminSeller(() => { throw new Error('must not call'); }, 7, { signal: controller.signal }), { name: 'AbortError' });
});

test('admin list sends bearer and server filters; fabric detail uses generic ADMIN-authorized endpoint', async () => {
  const f = await session(url => url.includes('/admin/sellers?') ? response(page([seller()])) : response(detail()));
  assert.equal((await f.api.listAdminSellers()).items[0].email, seller().email);
  const item = await f.api.getAdminFabric(12);
  assert.equal(item.reject_reason, '치수 확인 필요'); assert.equal(item.available_length_cm, 720); assert.equal(item.remaining_length_cm, 900);
  assert.equal(f.calls[1].url, '/api/v1/fabrics/12'); assert(f.calls.every(call => call.options.headers.Authorization === 'Bearer admin-test-token'));
  await f.api.logout();
});

test('dashboard counts server totals across all seven statuses, not the loaded preview length', async () => {
  const f = await session(url => { const query = new URL(url, 'https://test.local').searchParams, size = Number(query.get('size')); return response(page([], { size, totalElements: 73, totalPages: Math.ceil(73 / size) })); });
  const dashboard = await f.api.getAdminDashboard(); assert.equal(dashboard.fabricCounts.PENDING, 73); assert.equal(dashboard.sellerCounts.APPROVED, 73);
  assert.equal(Object.values(dashboard.fabricCounts).reduce((sum, value) => sum + value, 0), 292); assert.equal(dashboard.pendingFabrics.length, 0); assert.equal(f.calls.length, 7);
  await f.api.logout();
});

test('seller and fabric mutations are one POST and require exact target/status ACK', async () => {
  const f = await session(url => response(url.includes('/sellers/') ? { userId: 7, seller_approval_status: 'APPROVED' } : { fabricId: 12, status: 'REJECTED' }));
  assert.deepEqual(await f.api.reviewSeller(7, 'APPROVED'), { id: '7', seller_approval_status: 'APPROVED' });
  assert.deepEqual(await f.api.reviewFabric(12, 'REJECTED', ' 치수 확인 '), { id: '12', status: 'REJECTED' });
  assert.equal(f.calls[0].options.body, undefined); assert.deepEqual(JSON.parse(f.calls[1].options.body), { reason: '치수 확인' }); assert.equal(f.calls.length, 2);
  await f.api.logout();
});

test('network, server and incorrect ACK outcomes never auto-retry or report success', async () => {
  for (const outcome of ['network', 'server', 'wrong-id', 'wrong-status']) {
    const f = await session(() => { if (outcome === 'network') throw new TypeError('offline'); if (outcome === 'server') return failure(503, 'UNAVAILABLE'); return response({ fabricId: outcome === 'wrong-id' ? 13 : 12, status: 'REJECTED' }); });
    await assert.rejects(f.api.reviewFabric(12, 'POSTED'), error => error.outcomeUnknown === true); assert.equal(f.calls.length, 1); await f.api.logout();
  }
});

test('known state/image/validation conflicts stay known failures and a later read error does not undo ACK', async () => {
  for (const [status, code] of [[409, 'INVALID_STATUS'], [400, 'IMAGE_REQUIRED'], [404, 'NOT_FOUND']]) {
    const f = await session(() => failure(status, code)); await assert.rejects(f.api.reviewFabric(12, 'POSTED'), error => error.code === code && !error.outcomeUnknown); await f.api.logout();
  }
  const f = await session((url, options) => options.method === 'POST' ? response({ fabricId: 12, status: 'POSTED' }) : failure(500, 'INTERNAL_ERROR'));
  const ack = await f.api.reviewFabric(12, 'POSTED'); await assert.rejects(f.api.getAdminFabric(12)); assert.equal(ack.status, 'POSTED'); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1); await f.api.logout();
});

test('buyer, seller and anonymous are denied all administrative reads and writes before HTTP', async () => {
  for (const role of ['BUYER', 'SELLER']) {
    const f = await session(() => { throw new Error('must not fetch'); }, { role });
    for (const method of ['listAdminSellers', 'listAdminFabrics', 'getAdminDashboard']) await assert.rejects(f.api[method](), { code: 'FORBIDDEN' });
    for (const method of ['getAdminSeller', 'getAdminFabric']) await assert.rejects(f.api[method](12), { code: 'FORBIDDEN' });
    await assert.rejects(f.api.reviewSeller(7, 'APPROVED'), { code: 'FORBIDDEN' }); await assert.rejects(f.api.reviewFabric(12, 'POSTED'), { code: 'FORBIDDEN' }); assert.equal(f.calls.length, 0);
    await f.api.logout(); await assert.rejects(f.api.listAdminSellers(), { code: 'UNAUTHORIZED' });
  }
});

test('logout or caller cancellation discards late approval responses', async () => {
  for (const kind of ['logout', 'abort']) {
    const gate = deferred(), controller = new AbortController(); const f = await session(() => gate.promise);
    const pending = f.api.reviewSeller(7, 'APPROVED', { signal: controller.signal });
    if (kind === 'logout') await f.api.logout(); else controller.abort();
    gate.resolve(response({ userId: 7, seller_approval_status: 'APPROVED' })); await assert.rejects(pending, { name: 'AbortError' }); await f.api.logout();
  }
});

test('reads started before or during a mutation cannot overwrite its acknowledged state', async () => {
  for (const during of [false, true]) {
    const readGate = deferred(), writeGate = deferred(); const f = await session((url, options) => options.method === 'POST' ? writeGate.promise : readGate.promise);
    let reading, writing;
    if (during) { writing = f.api.reviewSeller(7, 'APPROVED'); reading = f.api.listAdminSellers(); }
    else { reading = f.api.listAdminSellers(); writing = f.api.reviewSeller(7, 'APPROVED'); }
    writeGate.resolve(response({ userId: 7, seller_approval_status: 'APPROVED' })); await writing;
    readGate.resolve(response(page([seller()]))); await assert.rejects(reading, { name: 'AbortError' }); await f.api.logout();
  }
});
