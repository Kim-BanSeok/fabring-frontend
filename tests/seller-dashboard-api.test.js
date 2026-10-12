import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { sellerStatusCount, collectSellerPickups } from '../src/react/services/seller-dashboard-contract.js';

const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status, headers: { 'Content-Type': 'application/json' } });
const countPage = (status, total, id = 'fabricId') => ({ content: total ? [{ [id]: 1, status }] : [], page: 0, size: 1, totalElements: total, totalPages: total });
const rows = Array.from({ length: 54 }, (_, i) => ({ id: String(54 - i), status: 'ACCEPTED', pickup_at: `2030-01-${i < 50 ? '02' : '03'}T00:30:00+09:00`, pickup_date: i < 50 ? '2030-01-02' : '2030-01-03', pickup_time: '00:30', fabric_id: '3' }));
const calendarPage = (page, content = rows, patch = {}) => ({ content: content.slice(page * 50, (page + 1) * 50), page, size: 50, totalElements: content.length, totalPages: Math.ceil(content.length / 50), ...patch });
async function session(business, { role = 'SELLER', ...options } = {}) {
  const calls = [], profile = { userId: 1, nickname: '검증 계정', role, email: 'fixture@example.com', hasStore: false };
  let number = 0;
  const api = createLiveApi({ storage: null, ...options, fetchImpl: async (url, request) => {
    if (url.endsWith('/auth/login')) return response({ accessToken: `dashboard-token-${++number}`, expiresIn: 3600, user: profile });
    if (url.endsWith('/users/me')) return response(profile);
    calls.push({ url, request }); return business(url, request);
  } });
  const login = async () => api.commitLogin(await api.login({ email: profile.email, password: 'test-only' }));
  await login(); return { api, calls, login };
}

test('statistics retain actual totalElements rather than the first one-row page and reject inconsistent metadata', () => {
  assert.equal(sellerStatusCount(countPage('POSTED', 123), 'POSTED', 'fabric'), 123);
  assert.equal(sellerStatusCount(countPage('WAITING', 53, 'inquiryId'), 'WAITING', 'inquiry'), 53);
  assert.equal(sellerStatusCount(countPage('WAITING', 0, 'inquiryId'), 'WAITING', 'inquiry'), 0);
  for (const raw of [null, {}, { ...countPage('POSTED', 123), totalPages: 1 }, { ...countPage('POSTED', 1), content: [] }, countPage('PENDING', 1), { ...countPage('POSTED', 1), page: 1 }, { ...countPage('POSTED', 1), totalElements: -1 }]) assert.throws(() => sellerStatusCount(raw, 'POSTED', 'fabric'), { code: 'INVALID_RESPONSE' });
});

test('fabric and inquiry statistics call own-seller endpoints for every server status and retain only counts', async () => {
  const fabrics = { POSTED: 60, PENDING: 3, REJECTED: 2, SOLD_OUT: 3 }, inquiries = { WAITING: 53, ANSWERED: 7 };
  const { api, calls } = await session(url => {
    const parsed = new URL(url, 'http://local.test'), status = parsed.searchParams.get('status'), fabric = parsed.pathname.endsWith('/fabrics');
    assert.equal(parsed.searchParams.get('page'), '0'); assert.equal(parsed.searchParams.get('size'), '1');
    return response(countPage(status, (fabric ? fabrics : inquiries)[status], fabric ? 'fabricId' : 'inquiryId'));
  });
  assert.deepEqual(await api.getSellerFabricCounts(), { ...fabrics, total: 68 });
  assert.deepEqual(await api.getSellerInquiryCounts(), { ...inquiries, total: 60 });
  assert.equal(calls.length, 6);
  assert.ok(calls.every(call => call.url.startsWith('/api/v1/sellers/me/') && call.request.headers.Authorization === 'Bearer dashboard-token-1'));
  assert.deepEqual(api.getState().inquiries, []); assert.deepEqual(api.getState().fabrics, []);
});

test('calendar loads all pages, includes last-page dates and verifies the leading offset again', async () => {
  const calls = [];
  const result = await collectSellerPickups(async query => { calls.push(query); return calendarPage(query.page); }, { now: () => 0 });
  assert.equal(result.content.length, 54); assert.equal(result.content.filter(row => row.pickup_date === '2030-01-03').length, 4);
  assert.deepEqual(calls, [0, 1, 0].map(page => ({ status: 'ACCEPTED', page, size: 50 })));
  assert.equal(result.totalElements, 54); assert.equal(result.checkedAt, '1970-01-01T00:00:00.000Z');
});

test('an empty calendar is valid only when the complete server result is empty', async () => {
  let calls = 0;
  const result = await collectSellerPickups(async () => { calls++; return calendarPage(0, []); });
  assert.equal(result.totalElements, 0); assert.deepEqual(result.content, []); assert.equal(calls, 1);
  await assert.rejects(collectSellerPickups(async () => calendarPage(0, rows, { content: [] })), { code: 'DATA_CHANGED' });
});

test('calendar discards the whole result on missing, duplicated, shifted or mixed-status pages', async () => {
  for (const patch of [page => ({ ...page, totalElements: 53 }), page => ({ ...page, content: page.content.slice(1) }), page => ({ ...page, content: [rows[0], ...page.content.slice(1)] }), page => ({ ...page, page: 0 }), page => ({ ...page, content: page.content.map(row => ({ ...row, status: 'PICKED_UP' })) })]) {
    await assert.rejects(collectSellerPickups(async query => query.page === 1 ? patch(calendarPage(1)) : calendarPage(0)), failure => ['DATA_CHANGED', 'INVALID_RESPONSE'].includes(failure.code));
  }
  let reads = 0;
  await assert.rejects(collectSellerPickups(async query => {
    reads++;
    const page = calendarPage(query.page);
    return reads === 3 ? { ...page, content: page.content.map(row => ({ ...row, pickup_at: '2030-02-01T10:00:00+09:00' })) } : page;
  }), { code: 'DATA_CHANGED' });
});

test('failed tail pages and excessive calendars cannot return partial schedules or zero', async () => {
  await assert.rejects(collectSellerPickups(async query => { if (query.page) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }); return calendarPage(0); }), { code: 'NETWORK_ERROR' });
  let calls = 0;
  await assert.rejects(collectSellerPickups(async () => { calls++; return calendarPage(0, rows, { totalElements: 10001, totalPages: 201 }); }), { code: 'CALENDAR_TOO_LARGE' });
  assert.equal(calls, 1);
});

test('aborting between calendar pages stops reads and rejects a late page', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(collectSellerPickups(() => assert.fail('no request'), { signal: before.signal }), { name: 'AbortError' });
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(collectSellerPickups(async query => { calls++; if (query.page === 1) controller.abort(); return calendarPage(query.page); }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 2);
});

test('live calendar queries ACCEPTED only, normalizes KST and includes every page with no unrecognized month parameter', async () => {
  const { api, calls } = await session(url => {
    const query = new URL(url, 'http://local.test').searchParams;
    assert.equal(query.get('status'), 'ACCEPTED'); assert.equal(query.get('size'), '50'); assert.equal(query.has('month'), false);
    const page = calendarPage(Number(query.get('page')));
    return response({ ...page, content: page.content.map(row => ({ reservationId: Number(row.id), status: row.status, pickup_at: '2030-01-31T15:30:00Z', memo: null, requested_length_cm: null, estimated_price: null, fabricId: 3, title: '원단', buyer_nickname: '구매자' })) });
  });
  const result = await api.getSellerPickupCalendar();
  assert.equal(result.totalElements, 54); assert.equal(result.content[53].pickup_date, '2030-02-01'); assert.equal(result.content[53].pickup_time, '00:30');
  assert.equal(calls.length, 3);
});

test('a failing stats group is rejected without falsifying counts; other groups remain independently usable', async () => {
  const { api } = await session(url => url.includes('/fabrics') ? response({ code: 'INTERNAL_ERROR' }, 500) : response(countPage(new URL(url, 'http://local.test').searchParams.get('status'), 7, 'inquiryId')));
  await assert.rejects(api.getSellerFabricCounts(), { code: 'INTERNAL_ERROR' });
  assert.deepEqual(await api.getSellerInquiryCounts(), { WAITING: 7, ANSWERED: 7, total: 14 });
});

test('anonymous and wrong-role accounts cannot read seller stats or calendars', async () => {
  const actions = api => [() => api.getSellerFabricCounts(), () => api.getSellerInquiryCounts(), () => api.getSellerPickupCalendar()];
  const anonymous = createLiveApi({ storage: null, fetchImpl: () => assert.fail('no request') });
  for (const action of actions(anonymous)) await assert.rejects(action(), { code: 'UNAUTHORIZED' });
  for (const role of ['BUYER', 'ADMIN']) {
    const { api, calls } = await session(() => assert.fail('no request'), { role });
    for (const action of actions(api)) await assert.rejects(action(), { code: 'FORBIDDEN' });
    assert.equal(calls.length, 0);
  }
});

test('old-account stats or calendar pages cannot leak into a new login, including stale 401', async () => {
  for (const status of [200, 401]) {
    const pending = [];
    const { api, login } = await session(url => new Promise(resolve => pending.push({ url, resolve })));
    const result = api.getSellerFabricCounts();
    await api.logout(); await login();
    for (const item of pending) item.resolve(status === 200 ? response(countPage(new URL(item.url, 'http://local.test').searchParams.get('status'), 1)) : response({ code: 'UNAUTHORIZED' }, 401));
    await assert.rejects(result, { name: 'AbortError' }); assert.equal(api.getAuth().status, 'authenticated');
  }
  let resolve;
  const { api, calls } = await session(() => new Promise(done => { resolve = done; }));
  const pending = api.getSellerPickupCalendar(); await api.logout();
  resolve(response({ content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 }));
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(calls.length, 1);
});
