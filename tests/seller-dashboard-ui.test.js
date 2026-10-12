import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sellerToday, sellerDashboardCalendar, sellerCalendarPath, sellerCalendarAdjacentMonth,
  sellerPickupSchedule, sellerCalendarReservationPath, sellerOverviewCount,
} from '../src/react/pages/seller/sellerDashboardModel.js';
import { startSellerOverviewRequest } from '../src/react/hooks/useSellerOverviewResource.js';

const context = route => { const [path, query] = route.split('?'); return { path, query: new URLSearchParams(query) }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const item = (id, date, time = '14:00', status = 'ACCEPTED') => ({ id: String(id), pickup_date: date, pickup_time: time, status });

test('default today follows KST even at UTC month rollover, with explicit month view staying unselected', () => {
  const today = sellerToday('2026-10-31T16:30:00Z');
  assert.equal(today, '2026-11-01');
  const state = sellerDashboardCalendar(new URLSearchParams(), today);
  assert.equal(state.month, '2026-11'); assert.equal(state.selected, today); assert.equal(state.offset, 6);
  assert.equal(sellerDashboardCalendar(new URLSearchParams('month=2026-11&view=month'), today).selected, '');
  assert.equal(sellerDashboardCalendar(new URLSearchParams('month=2026-10'), today).selected, '');
});

test('valid selected dates and leap days survive, while impossible or foreign-month dates do not', () => {
  const calendar = query => sellerDashboardCalendar(new URLSearchParams(query), '2026-10-12');
  assert.equal(calendar('month=2028-02&date=2028-02-29').selected, '2028-02-29');
  assert.equal(calendar('month=2026-02&date=2026-02-29').selected, '');
  assert.equal(calendar('month=2026-11&date=2026-10-12').selected, '');
  assert.equal(calendar('month=2026-13').month, '2026-10');
});

test('calendar month/day routes retain live mode without carrying an unrelated selected date', () => {
  const ctx = context('/seller/dashboard?month=2026-12&date=2026-12-15&mode=live&id=23');
  assert.equal(sellerCalendarAdjacentMonth('2026-12', 1), '2027-01');
  assert.equal(sellerCalendarAdjacentMonth('2026-01', -1), '2025-12');
  assert.equal(sellerCalendarPath(ctx, { month: '2027-01', all: true }), '/seller/dashboard?month=2027-01&view=month&mode=live');
  assert.equal(sellerCalendarPath(ctx, { month: '2026-12', date: '2026-12-15', base: '/seller/calendar' }), '/seller/calendar?month=2026-12&date=2026-12-15&mode=live');
});

test('calendar uses all received entries, selects KST dates, excludes ended/requested items and sorts time then numeric ID', () => {
  const content = [item(10, '2026-11-01', '00:30'), item(2, '2026-11-01', '00:30'), item(20, '2026-11-01', '16:00'), item(30, '2026-11-02', '10:00'), item(40, '2026-10-31', '23:30')];
  for (const status of ['REQUESTED', 'PICKED_UP', 'REJECTED', 'CANCELED']) content.push(item(status, '2026-11-01', '00:00', status));
  const result = sellerPickupSchedule(content, '2026-11', '2026-11-01');
  assert.deepEqual(result.entries.map(value => value.id), ['2', '10', '20', '30']);
  assert.deepEqual(result.visible.map(value => value.id), ['2', '10', '20']);
  assert.equal(result.byDate.get('2026-11-01').length, 3);
  assert.equal(content[0].id, '10', 'sorting does not mutate adapter results');
  const large = sellerPickupSchedule(Array.from({ length: 54 }, (_, i) => item(i + 1, '2026-11-01')), '2026-11');
  assert.equal(large.entries.length, 54); assert.equal(large.byDate.get('2026-11-01').length, 54);
});

test('monthly empty results and selected empty days differ, and every row links its exact reservation', () => {
  const result = sellerPickupSchedule([item(76, '2026-10-15')], '2026-10', '2026-10-16');
  assert.equal(result.visible.length, 0); assert.equal(result.entries.length, 1);
  assert.equal(sellerPickupSchedule([item(76, '2026-10-15')], '2026-11').entries.length, 0);
  assert.equal(sellerCalendarReservationPath('76'), '/seller/reservations?status=ACCEPTED&id=76');
});

test('counts use server totalElements or enum totals; pending and failed results never become zero', () => {
  assert.equal(sellerOverviewCount({ loading: true, data: null }), '조회 중');
  assert.equal(sellerOverviewCount({ error: new Error('offline'), data: null }), '조회 실패');
  assert.equal(sellerOverviewCount({ data: { content: [item(1, '2026-10-12')], totalElements: 54 } }), '54건');
  assert.equal(sellerOverviewCount({ data: { totalElements: 0 } }), '0건');
  assert.equal(sellerOverviewCount({ data: { WAITING: 7, ANSWERED: 13 } }, 'WAITING'), '7건');
  assert.equal(sellerOverviewCount({ data: { PENDING: 0 } }, 'PENDING'), '0건');
  assert.equal(sellerOverviewCount({ data: null }), '조회 실패');
});

test('overview calls separate APIs and requests only metadata from the pending reservation page', async () => {
  const calls = [], values = [];
  const api = Object.fromEntries(['getSellerFabricCounts', 'getSellerInquiryCounts', 'getSellerPickupCalendar', 'listReceivedReservations'].map(method => [method, async (...args) => { calls.push([method, ...args]); return { method }; }]));
  const dispose = ['fabrics', 'inquiries', 'calendar', 'requested'].map(kind => startSellerOverviewRequest(api, kind, value => values.push(value.method), assert.fail));
  await settle();
  assert.equal(values.length, 4);
  const request = calls.find(call => call[0] === 'listReceivedReservations');
  assert.deepEqual(request[1], { status: 'REQUESTED', page: 0, size: 1 });
  assert.ok(request[2].signal instanceof AbortSignal);
  assert.ok(calls.find(call => call[0] === 'getSellerPickupCalendar')[1].signal instanceof AbortSignal);
  dispose.forEach(stop => stop());
});

test('an inquiry failure does not cancel or clear successful fabric and calendar results, and can retry alone', async () => {
  const effects = [], error = new Error('문의 연결 실패'); let attempts = 0, fabricCalls = 0;
  const api = {
    getSellerFabricCounts: async () => { fabricCalls++; return { total: 12 }; },
    getSellerInquiryCounts: async () => { if (++attempts === 1) throw error; return { WAITING: 3 }; },
    getSellerPickupCalendar: async () => ({ content: [item(1, '2026-10-12')], totalElements: 1 }),
  };
  const disposes = ['fabrics', 'inquiries', 'calendar'].map(kind => startSellerOverviewRequest(api, kind, data => effects.push([kind, data]), failure => effects.push([kind, failure])));
  await settle();
  assert.equal(effects.find(([kind]) => kind === 'fabrics')[1].total, 12);
  assert.equal(effects.find(([kind]) => kind === 'calendar')[1].totalElements, 1);
  assert.equal(effects.find(([kind]) => kind === 'inquiries')[1], error);
  disposes.push(startSellerOverviewRequest(api, 'inquiries', data => effects.push(['retry', data]), assert.fail));
  await settle(); assert.equal(effects.at(-1)[1].WAITING, 3); assert.equal(fabricCalls, 1);
  disposes.forEach(stop => stop());
});

test('StrictMode canceled setup makes no HTTP call and late results after leaving/switching cannot update UI', async () => {
  let calls = 0, signal;
  const deferred = pending(), effects = [];
  const api = { getSellerPickupCalendar: options => { calls++; signal = options.signal; return deferred.promise; } };
  const first = startSellerOverviewRequest(api, 'calendar', data => effects.push(data), assert.fail); first();
  const second = startSellerOverviewRequest(api, 'calendar', data => effects.push(data), assert.fail);
  await settle(); assert.equal(calls, 1); second(); assert.equal(signal.aborted, true);
  deferred.resolve({ content: [], totalElements: 0 }); await settle(); assert.deepEqual(effects, []);
});

test('returning to the calendar starts a fresh read instead of reusing a completed reservation', async () => {
  let calls = 0; const values = [];
  const api = { getSellerPickupCalendar: async () => (++calls === 1 ? { content: [item(1, '2026-10-12')], totalElements: 1 } : { content: [], totalElements: 0 }) };
  const first = startSellerOverviewRequest(api, 'calendar', data => values.push(data), assert.fail);
  await settle(); first();
  const second = startSellerOverviewRequest(api, 'calendar', data => values.push(data), assert.fail);
  await settle(); second();
  assert.equal(values[0].totalElements, 1); assert.equal(values[1].totalElements, 0); assert.equal(calls, 2);
});

test('a count read invalidated by an overlapping inquiry answer offers retry instead of hanging loading', async () => {
  const effects = [], stale = Object.assign(new Error('changed while reading'), { name: 'AbortError' });
  const api = { getSellerInquiryCounts: async () => { throw stale; } };
  const stop = startSellerOverviewRequest(api, 'inquiries', assert.fail, error => effects.push(error));
  await settle();
  assert.equal(effects.length, 1); assert.equal(effects[0].code, 'STALE_OVERVIEW_READ');
  assert.match(effects[0].message, /다시 조회/); stop();
  const canceled = startSellerOverviewRequest(api, 'inquiries', assert.fail, error => effects.push(error));
  canceled(); await settle(); assert.equal(effects.length, 1);
});
