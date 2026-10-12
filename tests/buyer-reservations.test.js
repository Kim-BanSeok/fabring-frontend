import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationResourceRequest, reservationListPagePath, reservationPriceText, reservationPreviewFabric, reservationListReturn, reservationPath, selectedReservation, submittedReservationMatches, fabricResourceRequest, validDateKst } from '../src/react/pages/buyer-model.js';
import { startReservationRequest } from '../src/react/hooks/useReservationResource.js';
import { createReservationMutation } from '../src/react/hooks/useReservationMutation.js';

const context = route => { const [path, query] = route.split('?'); return { path, query: new URLSearchParams(query) }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
const pending = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('reservation list forwards only status/page/size and keeps server pagination parameters', () => {
  const ctx = context('/buyer/reservations?status=CANCELED&page=2&size=5&example=1&fabric_id=9');
  assert.deepEqual(reservationResourceRequest(ctx), { kind: 'list', query: { status: 'CANCELED', page: '2', size: '5' } });
  const next = context(reservationListPagePath(ctx, 3));
  assert.equal(next.query.get('page'), '3');
  assert.equal(next.query.get('status'), 'CANCELED');
  assert.equal(next.query.get('size'), '5');
  assert.deepEqual(reservationResourceRequest(context('/buyer/reservations')), { kind: 'list', query: { status: 'REQUESTED' } });
});

test('reservation detail, cancel, and submitted completion resolve from reservation ID without a fabric GET', () => {
  for (const route of ['/buyer/reservations/29', '/buyer/reservations/29/cancel', '/buyer/pickup/999?submitted=29']) {
    const ctx = context(route);
    assert.deepEqual(reservationResourceRequest(ctx), { kind: 'detail', id: '29' });
    assert.equal(fabricResourceRequest(ctx), null);
  }
  assert.equal(reservationResourceRequest(context('/buyer/pickup/999')), null);
  assert.equal(submittedReservationMatches(context('/buyer/pickup/0999?submitted=29'), { fabric_id: '999' }), true);
  assert.equal(submittedReservationMatches(context('/buyer/pickup/28?submitted=29'), { fabric_id: '999' }), false);
  assert.equal(submittedReservationMatches(context('/buyer/pickup/bad?submitted=29'), { fabric_id: '999' }), false);
});

test('reservation list → detail → cancel → detail retains the exact list page and size', () => {
  const original = '/buyer/reservations?status=REQUESTED&page=2&size=5&mode=live';
  const item = { id: '29', list_return: reservationListReturn(context(original)) };
  const detail = context(reservationPath(item));
  const cancel = context(reservationPath({ ...item, list_return: reservationListReturn(detail) }, '/cancel'));
  assert.equal(reservationListReturn(detail), original);
  assert.equal(reservationListReturn(cancel), original);
  assert.equal(reservationListReturn(context(reservationPath({ ...item, list_return: reservationListReturn(cancel) }))), original);
  for (const bad of ['https://example.com', '//example.com', '/buyer/fabrics', '/buyer/reservations/4', '/buyer/reservations#outside', '/buyer/reservations\n', '/buyer\\reservations']) {
    assert.equal(reservationPath({ id: '29', list_return: bad }), '/buyer/reservations/29');
  }
});

test('nullable scrap price and missing dimensions never become a zero-price or demo-filled reservation', () => {
  const item = { source: 'api', id: '29', fabric_id: '9', fabric_title: '실제 자투리', sale_type: 'SCRAP', requested_length_cm: null, display_price: null, image_url: null, store_name: '실제 매장', store: null };
  const state = { fabrics: [{ id: '9', title: '시연 원단', price: 999, width_cm: 150, length_cm: 90 }] };
  const preview = reservationPreviewFabric(item, state);
  assert.equal(reservationPriceText(item), '예약 금액 정보 없음');
  assert.equal(reservationPriceText({ display_price: 0 }), '0원');
  assert.equal(reservationPriceText({ display_price: 7000 }), '7,000원');
  assert.equal(preview.title, '실제 자투리');
  assert.equal(preview.width_cm, undefined);
  assert.equal(preview.price, undefined);
  assert.equal(preview.source, 'api');
  const detail = { ...item, fabric: { source: 'api', id: '9', title: '예약의 원단', status: 'SOLD_OUT' } };
  assert.equal(reservationPreviewFabric(detail, state), detail.fabric);
  assert.equal(selectedReservation({ ...context('/buyer/reservations/29'), reservationItem: detail, state: { reservations: [], fabrics: [] } }), detail);
});

test('live pickup date boundaries use Korea rather than the browser timezone', () => {
  const midnightKst = Date.parse('2026-10-12T15:05:00Z');
  assert.equal(validDateKst(0, midnightKst), '2026-10-13');
  assert.equal(validDateKst(2, midnightKst), '2026-10-15');
  assert.equal(validDateKst(1, Date.parse('2026-12-31T06:00:00Z')), '2027-01-01');
});

test('StrictMode cancelled setup does not duplicate a reservation read', async () => {
  let calls = 0;
  const data = [], errors = [], api = { listReservations: async () => { calls++; return { content: [] }; } };
  const request = { kind: 'list', query: { status: 'REQUESTED' } };
  startReservationRequest(api, request, value => data.push(value), error => errors.push(error))();
  const stop = startReservationRequest(api, request, value => data.push(value), error => errors.push(error));
  await settle();
  assert.equal(calls, 1);
  assert.equal(data.length, 1);
  assert.equal(errors.length, 0);
  stop();
});

test('changing reservation tab ignores a late old page and aborts its signal', async () => {
  const old = pending(), latest = pending(), calls = [], values = [];
  const api = { listReservations: (query, { signal }) => { calls.push({ query, signal }); return query.status === 'REQUESTED' ? old.promise : latest.promise; } };
  const stopOld = startReservationRequest(api, { kind: 'list', query: { status: 'REQUESTED' } }, value => values.push(value), () => assert.fail('Old error must be ignored'));
  await settle(); stopOld();
  const stopNew = startReservationRequest(api, { kind: 'list', query: { status: 'CANCELED' } }, value => values.push(value), () => assert.fail('No new error expected'));
  await settle(); latest.resolve({ content: ['canceled'] }); old.resolve({ content: ['stale'] });
  await settle();
  assert.equal(calls[0].signal.aborted, true);
  assert.deepEqual(values, [{ content: ['canceled'] }]);
  stopNew();
});

test('reservation errors retain 400, 403, and 404 distinctions for recovery', async () => {
  const errors = [];
  for (const status of [400, 403, 404]) {
    const error = Object.assign(new Error(`status ${status}`), { status });
    const stop = startReservationRequest({ getReservation: () => Promise.reject(error) }, { kind: 'detail', id: '4' }, () => assert.fail('No success expected'), failure => errors.push(failure.status));
    await settle(); stop();
  }
  assert.deepEqual(errors, [400, 403, 404]);
});

test('double submit runs one POST and lets only its confirmed success navigate', async () => {
  const response = pending(), events = [], failures = [];
  let calls = 0;
  const operation = createReservationMutation({ onBusy: value => events.push(['busy', value]), onFailure: error => failures.push(error) });
  const action = async ({ isCurrent }) => { calls++; await response.promise; if (isCurrent()) events.push(['navigate', 'confirmed']); };
  const first = operation.run(action), second = operation.run(action);
  assert.equal(calls, 1);
  response.resolve(); await Promise.all([first, second]);
  assert.deepEqual(events, [['busy', true], ['navigate', 'confirmed'], ['busy', false]]);
  assert.deepEqual(failures, [null]);
  operation.dispose();
});

test('leaving a pending POST aborts UI ownership without assuming the server did not create it', async () => {
  const response = pending(), events = [], failures = [];
  let signal;
  const operation = createReservationMutation({ onBusy: value => events.push(['busy', value]), onFailure: error => failures.push(error) });
  const work = operation.run(async context => { signal = context.signal; await response.promise; if (context.isCurrent()) events.push(['delete-draft-or-navigate']); });
  operation.dispose(); response.resolve({ id: '31' }); await work;
  assert.equal(signal.aborted, true);
  assert.deepEqual(events, [['busy', true]]);
  assert.deepEqual(failures, [null]);
});

test('logout or account change suppresses late mutation feedback and navigation', async () => {
  const response = pending(), effects = [];
  let sameSession = true;
  const operation = createReservationMutation({ isSessionCurrent: () => sameSession, onBusy: value => effects.push(['busy', value]), onFailure: error => { if (error) effects.push(['error', error]); } });
  const work = operation.run(async ({ isCurrent }) => { await response.promise; if (isCurrent()) effects.push(['navigate']); });
  sameSession = false; response.resolve(); await work;
  await operation.run(() => assert.fail('No request after session change'));
  assert.deepEqual(effects, [['busy', true]]);
  operation.dispose();
});

test('unknown POST outcome and status conflict preserve their recovery flags', async () => {
  const failures = [];
  const operation = createReservationMutation({ onBusy: () => {}, onFailure: error => { if (error) failures.push(error); } });
  const unknown = Object.assign(new Error('Outcome unknown'), { outcomeUnknown: true });
  await operation.run(() => Promise.reject(unknown));
  const conflict = Object.assign(new Error('Status changed'), { code: 'INVALID_STATUS', status: 409 });
  await operation.run(() => Promise.reject(conflict));
  assert.equal(failures[0].outcomeUnknown, true);
  assert.equal(failures[1].code, 'INVALID_STATUS');
  operation.dispose();
});
