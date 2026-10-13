import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { pickupAtKst, reservationInput, reservationQuery, reservationPage, reservationDetail } from '../src/react/services/reservation-contract.js';

const now = Date.parse('2030-01-01T00:00:00Z');
const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status, headers: { 'Content-Type': 'application/json' } });
const summary = (patch = {}) => ({ reservationId: 19, status: 'REQUESTED', pickup_at: '2030-01-04T00:30:00+09:00', requested_length_cm: 180, estimated_price: 15000, reject_reason: null, fabricId: 7, title: '검증 원단', thumbnail_url: null, store_name: '검증 매장', ...patch });
const page = (patch = {}) => ({ content: [summary()], page: 0, size: 20, totalElements: 1, totalPages: 1, ...patch });
const detail = (patch = {}) => ({ ...summary(), memo: '검증용 메모', canceled_by: null, accepted_at: null, picked_up_at: null, canceled_at: null, created_at: '2030-01-01T09:00:00+09:00', buyer_nickname: '검증 구매자', pattern_name: null,
  fabric: { fabricId: 7, title: '검증 원단', sale_type: 'ROLL', status: 'SOLD_OUT', thumbnail_url: 'https://api.example.com/photo.webp' },
  store: { store_name: '현재 매장', store_address: '현재 주소', store_phone: null, closed_days: null, pickup_guide: '수락 후 방문' }, ...patch });
const input = (patch = {}) => ({ fabric_id: '7', pickup_date: '2030-01-04', pickup_time: '00:30', requested_length_cm: 180, memo: '  검증용 메모  ', ...patch });
async function session(business, options = {}) {
  const calls = [], profile = { userId: 1, nickname: '검증 구매자', role: 'BUYER', email: 'buyer@example.com', hasStore: false };
  const api = createLiveApi({ storage: null, now: () => now, ...options, fetchImpl: async (url, request) => {
    if (url.endsWith('/auth/logout')) return response(null);
    if (url.endsWith('/auth/login')) return response({ accessToken: 'test-reservation-token', expiresIn: 3600, user: profile });
    if (url.endsWith('/users/me')) return response(profile);
    calls.push({ url, request }); return business(url, request);
  } });
  api.commitLogin(await api.login({ email: profile.email, password: 'test-only' }));
  return { api, calls };
}

test('pickup uses explicit Korea timezone and rejects impossible, past, or malformed dates', () => {
  assert.equal(pickupAtKst('2030-01-04', '00:30', now), '2030-01-04T00:30:00+09:00');
  for (const [date, time] of [['2030-02-30', '12:00'], ['2030-01-04', '24:01'], ['2030-01-01', '08:59'], ['2030-01-04', 'bad']]) assert.throws(() => pickupAtKst(date, time, now), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(reservationInput(input(), now), { fabric_id: 7, pickup_at: '2030-01-04T00:30:00+09:00', requested_length_cm: 180, memo: '검증용 메모', pattern_id: null });
  assert.equal(reservationInput(input({ requested_length_cm: undefined }), now).requested_length_cm, null);
  for (const patch of [{ fabric_id: '7/bad' }, { requested_length_cm: 91 }, { requested_length_cm: 0 }, { requested_length_cm: '180' }, { memo: 'x'.repeat(501) }]) assert.throws(() => reservationInput(input(patch), now), { code: 'VALIDATION_ERROR' });
});

test('list query allows only server filters and keeps nullable scrap amount distinct from zero', () => {
  assert.equal(reservationQuery({ status: 'CANCELED', page: 2, size: 3, fabric_id: 7, mode: 'demo' }).toString(), 'status=CANCELED&page=2&size=3');
  for (const patch of [{ status: 'UNKNOWN' }, { page: -1 }, { size: 51 }]) assert.throws(() => reservationQuery(patch), { code: 'VALIDATION_ERROR' });
  const result = reservationPage(page({ content: [summary({ requested_length_cm: null, estimated_price: null })] }));
  assert.equal(result.content[0].sale_type, 'SCRAP');
  assert.equal(result.content[0].display_price, null);
  assert.equal(result.content[0].memo, null);
  assert.equal(result.content[0].store, null);
  assert.equal(result.content[0].pickup_date, '2030-01-04');
  assert.equal(result.content[0].pickup_time, '00:30');
  const utc = reservationDetail(detail({ pickup_at: '2030-01-03T15:30:00Z' }));
  assert.equal(utc.pickup_date, '2030-01-04');
  assert.equal(utc.pickup_time, '00:30');
});

test('history uses reservation DTO even for sold-out fabric, with current store and no invented dimensions', () => {
  const result = reservationDetail(detail());
  assert.equal(result.fabric.status, 'SOLD_OUT');
  assert.equal(result.fabric.width_cm, undefined);
  assert.equal(result.fabric.price, undefined);
  assert.equal(result.fabric.source, 'api');
  assert.equal(result.store.address, '현재 주소');
  assert.equal(result.display_price, 15000);
  assert.equal(reservationDetail(detail({ fabric: { ...detail().fabric, thumbnail_url: 'javascript:bad' } })).image_url, null);
  assert.equal(reservationPage(page({ content: [summary({ status: 'ACCEPTED', store_address: '현재 주소', pickup_guide: null })] })).content[0].store.address, '현재 주소');
});

test('malformed histories are rejected rather than fabricated as empty, free, or another reservation', () => {
  for (const raw of [null, {}, page({ totalPages: 5 }), page({ content: [summary({ estimated_price: null })] }), page({ content: [summary({ requested_length_cm: undefined })] }), page({ content: [summary({ status: 'ACCEPTED' })] })]) assert.throws(() => reservationPage(raw), { code: 'INVALID_RESPONSE' });
  for (const raw of [null, {}, detail({ store: {} }), detail({ pickup_at: 'invalid' }), detail({ fabric: { ...detail().fabric, sale_type: 'SCRAP' } })]) assert.throws(() => reservationDetail(raw), { code: 'INVALID_RESPONSE' });
  assert.deepEqual(reservationPage(page({ content: [], totalElements: 0, totalPages: 0 })).content, []);
  assert.equal(reservationPage(page({ content: [], page: 9 })).totalElements, 1);
});

test('authenticated create unwraps 201, sends only contract fields, and does not fake cached history', async () => {
  const { api, calls } = await session(() => response({ reservationId: 19, status: 'REQUESTED', estimated_price: 15000 }, 201));
  assert.deepEqual(await api.createReservation(input({ buyer_id: 99, email: 'ignored@example.com' })), { id: '19', status: 'REQUESTED', estimated_price: 15000 });
  assert.equal(calls[0].url, '/api/v1/reservations');
  assert.equal(calls[0].request.method, 'POST');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer test-reservation-token');
  assert.deepEqual(JSON.parse(calls[0].request.body), reservationInput(input(), now));
  assert.deepEqual(api.getState().reservations, []);
});

test('list/detail/cancel use exact paths and cancel sends no body; every revisit reads again', async () => {
  const { api, calls } = await session(url => response(url.includes('/me?') ? page() : url.endsWith('/cancel') ? { reservationId: 19, status: 'CANCELED' } : detail()));
  await api.listReservations({ status: 'REQUESTED', page: 0 });
  await api.getReservation('19');
  assert.deepEqual(await api.cancelReservation('19'), { id: '19', status: 'CANCELED' });
  await api.getReservation('19');
  assert.equal(calls[0].url, '/api/v1/reservations/me?status=REQUESTED&page=0&size=20');
  assert.equal(calls[2].url, '/api/v1/reservations/19/cancel');
  assert.equal(calls[2].request.body, undefined);
  assert.equal(calls[2].request.method, 'POST');
  assert.equal(calls.filter(item => item.url === '/api/v1/reservations/19').length, 2);
});

test('known validation/conflict/permission errors stay distinct without auto retry', async () => {
  for (const [status, code] of [[400, 'LENGTH_NOT_MULTIPLE_OF_90'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'DUPLICATE_RESERVATION'], [409, 'INSUFFICIENT_LENGTH'], [409, 'SCRAP_ALREADY_RESERVED'], [409, 'INVALID_STATUS']]) {
    const { api, calls } = await session(() => response({ code, message: code }, status));
    await assert.rejects(api.createReservation(input()), failure => failure.code === code && failure.status === status && !failure.outcomeUnknown);
    assert.equal(calls.length, 1);
  }
});

test('mutation timeout, lost response, server error and malformed acknowledgement are uncertain, never retried', async () => {
  for (const business of [() => { throw new TypeError('offline'); }, () => response({ code: 'INTERNAL_ERROR' }, 500), () => response({ reservationId: 19 }, 201)]) {
    const { api, calls } = await session(business);
    await assert.rejects(api.createReservation(input()), failure => failure.outcomeUnknown === true && failure.message.includes('예약 내역'));
    assert.equal(calls.length, 1);
  }
  const { api } = await session((_url, request) => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))), { timeoutMs: 5 });
  await assert.rejects(api.cancelReservation('19'), failure => failure.code === 'TIMEOUT' && failure.outcomeUnknown);
});

test('anonymous calls make no request; expired authenticated 401 clears the session', async () => {
  const anonymous = createLiveApi({ storage: null, fetchImpl: () => assert.fail('no unauthenticated request') });
  for (const action of [() => anonymous.listReservations(), () => anonymous.getReservation(19), () => anonymous.createReservation(input()), () => anonymous.cancelReservation(19)]) await assert.rejects(action(), { code: 'UNAUTHORIZED' });
  const { api } = await session(() => response({ code: 'UNAUTHORIZED', message: '다시 로그인해 주세요' }, 401));
  await assert.rejects(api.listReservations(), { name: 'AbortError' });
  assert.equal(api.getAuth().status, 'expired');
});

test('wrong resource response is rejected and late mutation success after logout or abort cannot navigate as success', async () => {
  const wrong = await session(() => response(detail({ reservationId: 20 })));
  await assert.rejects(wrong.api.getReservation('19'), { code: 'INVALID_RESPONSE' });
  const wrongCancel = await session(() => response({ reservationId: 20, status: 'CANCELED' }));
  await assert.rejects(wrongCancel.api.cancelReservation('19'), failure => failure.code === 'INVALID_RESPONSE' && failure.outcomeUnknown);
  for (const leave of ['logout', 'abort']) {
    let resolve;
    const { api } = await session(() => new Promise(done => { resolve = done; }));
    const controller = new AbortController();
    const pending = api.createReservation(input(), { signal: controller.signal });
    if (leave === 'logout') await api.logout(); else controller.abort();
    resolve(response({ reservationId: 19, status: 'REQUESTED', estimated_price: 15000 }, 201));
    await assert.rejects(pending, { name: 'AbortError' });
    assert.deepEqual(api.getState().reservations, []);
  }
});
