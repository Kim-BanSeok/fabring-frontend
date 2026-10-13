import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { receivedReservationQuery, receivedReservationPage, acceptReservationInput, rejectReservationInput } from '../src/react/services/reservation-contract.js';

const now = Date.parse('2030-01-01T00:00:00Z');
const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status, headers: { 'Content-Type': 'application/json' } });
const item = (patch = {}) => ({ reservationId: 19, status: 'REQUESTED', pickup_at: '2030-01-04T00:30:00+09:00', memo: '요청 메모', requested_length_cm: 180, estimated_price: 15000, fabricId: 7, title: '검증 원단', buyer_nickname: '구매자', ...patch });
const page = (patch = {}) => ({ content: [item()], page: 0, size: 20, totalElements: 1, totalPages: 1, ...patch });
async function session(business, { role = 'SELLER', ...options } = {}) {
  const calls = [], profile = { userId: 1, nickname: '검증 계정', role, email: 'fixture@example.com', hasStore: false };
  let tokenNumber = 0;
  const api = createLiveApi({ storage: null, now: () => now, ...options, fetchImpl: async (url, request) => {
    if (url.endsWith('/auth/logout')) return response(null);
    if (url.endsWith('/auth/login')) return response({ accessToken: `test-seller-token-${++tokenNumber}`, expiresIn: 3600, user: profile });
    if (url.endsWith('/users/me')) return response(profile);
    calls.push({ url, request }); return business(url, request);
  } });
  const login = async () => api.commitLogin(await api.login({ email: profile.email, password: 'test-only' }));
  await login();
  return { api, calls, login };
}

test('seller filters whitelist status, fabric, page and size and reject malformed identifiers', () => {
  assert.equal(receivedReservationQuery(new URLSearchParams('status=ACCEPTED&fabric_id=007&page=1&size=2&date=2030-01-04&buyer_id=8')).toString(), 'status=ACCEPTED&page=1&size=2&fabric_id=7');
  assert.equal(receivedReservationQuery().toString(), 'page=0&size=20');
  for (const input of [{ fabric_id: '../7' }, { fabric_id: 0 }, { fabric_id: '1e3' }, { status: 'ALL' }, { page: -1 }, { size: 51 }]) assert.throws(() => receivedReservationQuery(input), { code: 'VALIDATION_ERROR' });
});

test('seller list accepts actual DTO without buyer-list fields and preserves nullable scrap amount', () => {
  const result = receivedReservationPage(page({ content: [item({ status: 'REJECTED', requested_length_cm: null, estimated_price: null, memo: null })] })).content[0];
  assert.equal(result.sale_type, 'SCRAP'); assert.equal(result.display_price, null);
  assert.equal(result.buyer_nickname, '구매자'); assert.equal(result.memo, null);
  for (const name of ['image_url', 'store', 'reject_reason']) assert.equal(result[name], null);
  assert.equal(result.buyer_phone, undefined); assert.equal(result.width_cm, undefined);
  const utc = receivedReservationPage(page({ content: [item({ pickup_at: '2030-01-03T15:30:00Z' })] })).content[0];
  assert.equal(utc.pickup_date, '2030-01-04'); assert.equal(utc.pickup_time, '00:30');
});

test('malformed seller lists fail visibly rather than showing fabricated empty histories', () => {
  for (const raw of [null, {}, page({ totalPages: 7 }), page({ content: [null] }), page({ content: [item({ buyer_nickname: null })] }), page({ content: [item({ memo: undefined })] }), page({ content: [item({ requested_length_cm: null })] })]) assert.throws(() => receivedReservationPage(raw), { code: 'INVALID_RESPONSE' });
  assert.equal(receivedReservationPage(page({ content: [], page: 4 })).totalElements, 1);
  assert.equal(receivedReservationPage(page({ content: [], totalElements: 0, totalPages: 0 })).totalPages, 0);
});

test('accept keeps original time without a body or converts a changed future time to KST; rejection validates trimmed reason', () => {
  assert.equal(acceptReservationInput({}, now), undefined);
  assert.deepEqual(acceptReservationInput({ pickup_date: '2030-01-04', pickup_time: '00:30', memo: 'ignored' }, now), { pickup_at: '2030-01-04T00:30:00+09:00' });
  for (const input of [null, { pickup_date: '2030-01-04' }, { pickup_date: '2030-02-30', pickup_time: '14:00' }, { pickup_date: '2029-01-01', pickup_time: '14:00' }]) assert.throws(() => acceptReservationInput(input, now), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(rejectReservationInput('  재고 확인이 필요해요.  '), { reason: '재고 확인이 필요해요.' });
  for (const reason of [null, '', '   ', 'x'.repeat(256), 123]) assert.throws(() => rejectReservationInput(reason), { code: 'VALIDATION_ERROR' });
});

test('seller list always reads server with exact filters and authorization, without a global reservation cache', async () => {
  const { api, calls } = await session(() => response(page()));
  await api.listReceivedReservations({ status: 'REQUESTED', fabric_id: 7, page: 1, size: 2 });
  await api.listReceivedReservations();
  assert.equal(calls[0].url, '/api/v1/sellers/me/reservations?status=REQUESTED&page=1&size=2&fabric_id=7');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer test-seller-token-1');
  assert.equal(calls.length, 2); assert.deepEqual(api.getState().reservations, []);
});

test('seller actions send exact paths, no body for unchanged acceptance or pickup, and reason only for rejection', async () => {
  const { api, calls } = await session(url => response({ reservationId: 19, status: url.endsWith('/accept') ? 'ACCEPTED' : url.endsWith('/reject') ? 'REJECTED' : 'PICKED_UP' }));
  assert.deepEqual(await api.acceptReservation(19), { id: '19', status: 'ACCEPTED' });
  await api.acceptReservation(19, { pickup_date: '2030-01-04', pickup_time: '00:30' });
  await api.rejectReservation(19, '  방문 일정 확인 필요  ');
  assert.deepEqual(await api.confirmPickup(19), { id: '19', status: 'PICKED_UP' });
  assert.deepEqual(calls.map(call => call.url), ['/api/v1/reservations/19/accept', '/api/v1/reservations/19/accept', '/api/v1/reservations/19/reject', '/api/v1/reservations/19/pickup']);
  assert.ok(calls.every(call => call.request.method === 'POST'));
  assert.equal(calls[0].request.body, undefined); assert.equal(calls[3].request.body, undefined);
  assert.deepEqual(JSON.parse(calls[1].request.body), { pickup_at: '2030-01-04T00:30:00+09:00' });
  assert.deepEqual(JSON.parse(calls[2].request.body), { reason: '방문 일정 확인 필요' });
});

test('buyer, admin and anonymous cannot issue seller requests, and invalid inputs send nothing', async () => {
  const actions = api => [() => api.listReceivedReservations(), () => api.acceptReservation(19), () => api.rejectReservation(19, '사유'), () => api.confirmPickup(19)];
  const anonymous = createLiveApi({ storage: null, fetchImpl: () => assert.fail('no request') });
  for (const action of actions(anonymous)) await assert.rejects(action(), { code: 'UNAUTHORIZED' });
  for (const role of ['BUYER', 'ADMIN']) {
    const { api, calls } = await session(() => assert.fail('no request'), { role });
    for (const action of actions(api)) await assert.rejects(action(), { code: 'FORBIDDEN' });
    assert.equal(calls.length, 0);
  }
  const { api, calls } = await session(() => assert.fail('no request'));
  await assert.rejects(api.rejectReservation(19, ' '), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.confirmPickup('bad'), { code: 'VALIDATION_ERROR' });
  assert.equal(calls.length, 0);
});

test('server conflicts and permissions remain distinct and never auto-retry', async () => {
  for (const [status, code] of [[400, 'VALIDATION_ERROR'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'INVALID_STATUS'], [409, 'INSUFFICIENT_LENGTH'], [409, 'SCRAP_ALREADY_RESERVED']]) {
    const { api, calls } = await session(() => response({ code, message: code }, status));
    await assert.rejects(api.acceptReservation(19), failure => failure.status === status && failure.code === code && !failure.outcomeUnknown);
    assert.equal(calls.length, 1);
  }
});

test('lost response, 500 or wrong acknowledgment of any seller action has unknown outcome and no retry', async () => {
  for (const action of [api => api.acceptReservation(19), api => api.rejectReservation(19, '사유'), api => api.confirmPickup(19)]) {
    for (const business of [() => { throw new TypeError('offline'); }, () => response({ code: 'INTERNAL_ERROR' }, 500), () => response({ reservationId: 20, status: 'ACCEPTED' }), () => response({ reservationId: 19, status: 'REQUESTED' })]) {
      const { api, calls } = await session(business);
      await assert.rejects(action(api), failure => failure.outcomeUnknown && failure.message.includes('현재 상태'));
      assert.equal(calls.length, 1);
    }
  }
});

test('seller action timeout is uncertain while explicit view abort is not a visible failure', async () => {
  const { api } = await session((_url, request) => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))), { timeoutMs: 5 });
  await assert.rejects(api.confirmPickup(19), failure => failure.code === 'TIMEOUT' && failure.outcomeUnknown);
  let resolve;
  const pendingSession = await session(() => new Promise(done => { resolve = done; }));
  const controller = new AbortController(), pending = pendingSession.api.acceptReservation(19, {}, { signal: controller.signal });
  controller.abort(); resolve(response({ reservationId: 19, status: 'ACCEPTED' }));
  await assert.rejects(pending, { name: 'AbortError' });
});

test('late seller mutation responses cannot affect a later login, including old-token unauthorized', async () => {
  for (const status of [200, 401, 500]) {
    let resolve;
    const { api, login } = await session(() => new Promise(done => { resolve = done; }));
    const pending = api.confirmPickup(19);
    await api.logout(); await login();
    resolve(response(status === 200 ? { reservationId: 19, status: 'PICKED_UP' } : { code: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR' }, status));
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(api.getAuth().status, 'authenticated');
  }
});
