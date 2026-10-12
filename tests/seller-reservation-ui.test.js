import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sellerReservationRequest, sellerReservationRoute, sellerReservationReturn, sellerReservationDetailPath,
  sellerReservationConfirmPath, sellerReservationResultPath, sellerCanProcess, sellerReservationPrice,
  sellerReservationQuantity, sellerStockEffect, sellerReservationFailure, processSellerReservation,
} from '../src/react/pages/seller/sellerReservationModel.js';
import { createReservationMutation } from '../src/react/hooks/useReservationMutation.js';

const context = route => { const [path, query] = route.split('?'); return { path, query: new URLSearchParams(query) }; };
const entries = route => Object.fromEntries(context(route).query);
const pending = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('seller received list maps the existing fabric alias and omits ALL from server status filters', () => {
  assert.deepEqual(sellerReservationRequest(context('/seller/reservations?status=ALL&fabric=45&page=2&size=5&id=66&example=1')), { kind: 'list', query: { fabric_id: '45', page: '2', size: '5' } });
  assert.deepEqual(sellerReservationRequest(context('/seller/reservations?status=ACCEPTED&fabric_id=45')), { kind: 'list', query: { status: 'ACCEPTED', fabric_id: '45' } });
  assert.deepEqual(sellerReservationRequest(context('/seller/reservations')), { kind: 'list', query: { status: 'REQUESTED' } });
});

test('list → selected detail → confirmation → back retains state, fabric filter, page, and size', () => {
  const start = context('/seller/reservations?status=REQUESTED&fabric=45&page=2&size=5&mode=live');
  const detail = context(sellerReservationDetailPath(start, '66'));
  assert.deepEqual(Object.fromEntries(detail.query), { status: 'REQUESTED', fabric: '45', page: '2', size: '5', id: '66', mode: 'live' });
  const confirm = context(sellerReservationConfirmPath(detail, { id: '66' }, 'ACCEPTED'));
  assert.equal(confirm.path, '/seller/reservations/confirm');
  assert.equal(confirm.query.get('action'), 'ACCEPTED');
  assert.deepEqual(entries(sellerReservationReturn(confirm)), Object.fromEntries(detail.query));
  assert.deepEqual(entries(sellerReservationDetailPath(confirm, '66')), Object.fromEntries(detail.query));
});

test('status, page and fabric changes deliberately clear an old selected reservation', () => {
  const ctx = context('/seller/reservations?status=REQUESTED&fabric=45&page=2&size=5&id=66');
  assert.deepEqual(entries(sellerReservationRoute(ctx, { status: 'ACCEPTED', page: 0, id: null })), { status: 'ACCEPTED', fabric: '45', page: '0', size: '5' });
  assert.deepEqual(entries(sellerReservationRoute(ctx, { fabric_id: '46', fabric: null, page: 0, id: null })), { status: 'REQUESTED', page: '0', size: '5', fabric_id: '46' });
});

test('confirmed result opens the new status with a fresh first page while retaining the fabric filter', () => {
  const detail = context('/seller/reservations?status=REQUESTED&fabric=45&page=2&size=5&id=66');
  const confirm = context(sellerReservationConfirmPath(detail, { id: '66' }, 'ACCEPTED'));
  assert.deepEqual(entries(sellerReservationResultPath(confirm, { id: '66' }, 'ACCEPTED')), { status: 'ACCEPTED', fabric: '45', page: '0', size: '5', id: '66' });
});

test('a confirmation return cannot leave the seller reservation list or inject arbitrary route fields', () => {
  for (const bad of ['https://example.com', '//example.com', '/buyer/reservations', '/seller/reservations/confirm', '/seller/reservations#outside', '/seller/reservations\n', '/seller\\reservations']) {
    const ctx = context('/seller/reservations/confirm?id=66'); ctx.query.set('return', bad);
    assert.equal(sellerReservationReturn(ctx), '/seller/reservations');
    assert.equal(sellerReservationDetailPath(ctx, '66'), '/seller/reservations?id=66');
  }
  assert.equal(sellerReservationRoute(context('/seller/reservations?fake=1'), { fake: 2, status: 'ALL' }), '/seller/reservations?status=ALL');
});

test('seller state machine exposes only requested accept/reject and accepted pickup/cancel', () => {
  for (const status of ['REQUESTED', 'ACCEPTED', 'REJECTED', 'CANCELED', 'PICKED_UP']) {
    for (const next of ['ACCEPTED', 'REJECTED', 'PICKED_UP', 'CANCELED']) {
      assert.equal(sellerCanProcess(status, next), status === 'REQUESTED' ? ['ACCEPTED', 'REJECTED'].includes(next) : status === 'ACCEPTED' ? ['PICKED_UP', 'CANCELED'].includes(next) : false);
    }
  }
});

test('seller summary keeps scrap amount unknown and describes only this reservation’s quantity effect', () => {
  const scrap = { sale_type: 'SCRAP', display_price: null, requested_length_cm: null };
  const roll = { sale_type: 'ROLL', display_price: 15000, requested_length_cm: 270 };
  assert.equal(sellerReservationPrice(scrap), '예약 금액 정보 없음');
  assert.equal(sellerReservationPrice({ display_price: 0 }), '0원');
  assert.equal(sellerReservationPrice(roll), '15,000원');
  assert.equal(sellerReservationQuantity(scrap), '자투리 한 장 전체');
  assert.equal(sellerReservationQuantity(roll), '270cm (3마)');
  assert.match(sellerStockEffect(roll, 'ACCEPTED'), /270cm \(3마\).*확보/);
  assert.doesNotMatch(sellerStockEffect(roll, 'ACCEPTED'), /현재 남은|판매 가능.*0cm/);
  assert.match(sellerStockEffect(scrap, 'CANCELED'), /한 장 전체.*확보.*해제/);
});

test('live operations use explicit endpoints and accept keeps the original pickup timestamp omitted', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = {
    acceptReservation: async (...args) => { calls.push(['accept', ...args]); return { id: '66', status: 'ACCEPTED' }; },
    rejectReservation: async (...args) => { calls.push(['reject', ...args]); return { id: '66', status: 'REJECTED' }; },
    confirmPickup: async (...args) => { calls.push(['pickup', ...args]); return { id: '66', status: 'PICKED_UP' }; },
    cancelReservation: async (...args) => { calls.push(['cancel', ...args]); return { id: '66', status: 'CANCELED' }; },
    updateReservation: () => assert.fail('Generic demo mutation must never be used'),
  };
  await processSellerReservation(api, { id: '66', status: 'REQUESTED', pickup_at: '2020-01-01T14:00:00+09:00' }, 'ACCEPTED', '', signal);
  await processSellerReservation(api, { id: '66', status: 'REQUESTED' }, 'REJECTED', '  매장 휴무입니다.  ', signal);
  await processSellerReservation(api, { id: '66', status: 'ACCEPTED' }, 'PICKED_UP', '', signal);
  await processSellerReservation(api, { id: '66', status: 'ACCEPTED' }, 'CANCELED', '', signal);
  assert.deepEqual(calls, [ ['accept', '66', {}, { signal }], ['reject', '66', '매장 휴무입니다.', { signal }], ['pickup', '66', { signal }], ['cancel', '66', { signal }] ]);
});

test('invalid state or missing/oversized rejection reason never sends a request', async () => {
  const api = { rejectReservation: () => assert.fail('No invalid rejection request'), confirmPickup: () => assert.fail('No invalid pickup') };
  for (const reason of ['', '   ', '가'.repeat(256)]) await assert.rejects(processSellerReservation(api, { id: '66', status: 'REQUESTED' }, 'REJECTED', reason), error => error.code === 'VALIDATION_ERROR');
  await assert.rejects(processSellerReservation(api, { id: '66', status: 'REQUESTED' }, 'PICKED_UP', ''), error => error.code === 'INVALID_STATUS');
});

test('unknown response and known stock/status/permission conflicts lock repeat processing until review', () => {
  assert.equal(sellerReservationFailure({ outcomeUnknown: true }).locked, true);
  assert.match(sellerReservationFailure({ outcomeUnknown: true }).message, /이미 처리/);
  for (const code of ['INVALID_STATUS', 'INSUFFICIENT_LENGTH', 'SCRAP_ALREADY_RESERVED', 'FORBIDDEN', 'NOT_FOUND']) assert.equal(sellerReservationFailure({ code }).locked, true);
  assert.equal(sellerReservationFailure({ code: 'VALIDATION_ERROR', message: '사유 확인' }).locked, false);
});

test('double seller confirmation runs one mutation and retains the confirmed result before navigation', async () => {
  const deferred = pending(), effects = [];
  let calls = 0;
  const api = { acceptReservation: () => { calls++; return deferred.promise; } };
  const operation = createReservationMutation({ onBusy: () => {}, onFailure: failure => { if (failure) assert.fail(failure.message); } });
  const action = async ({ signal, isCurrent }) => {
    const result = await processSellerReservation(api, { id: '66', status: 'REQUESTED' }, 'ACCEPTED', '', signal);
    if (!isCurrent()) return;
    effects.push(['confirmed', result.status]);
    await Promise.resolve();
    if (isCurrent()) effects.push(['navigate', result.id]);
  };
  const first = operation.run(action), second = operation.run(action);
  assert.equal(calls, 1);
  deferred.resolve({ id: '66', status: 'ACCEPTED' }); await Promise.all([first, second]);
  assert.deepEqual(effects, [['confirmed', 'ACCEPTED'], ['navigate', '66']]);
  operation.dispose();
});

test('seller leaving or switching accounts while a mutation is pending cannot apply late UI effects', async () => {
  for (const type of ['leave', 'account']) {
    const deferred = pending(), effects = []; let sameSession = true, signal;
    const operation = createReservationMutation({ isSessionCurrent: () => sameSession, onBusy: () => {}, onFailure: failure => { if (failure) effects.push('error'); } });
    const run = operation.run(async context => { signal = context.signal; await deferred.promise; if (context.isCurrent()) effects.push('navigate'); });
    if (type === 'leave') operation.dispose(); else sameSession = false;
    deferred.resolve(); await run;
    assert.deepEqual(effects, []);
    if (type === 'leave') assert.equal(signal.aborted, true);
    operation.dispose();
  }
});
