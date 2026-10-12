import { formatDate } from '../../lib/format.js';
import { sellerCalendar } from './sellerUx.js';

export const SELLER_FABRIC_COUNT_LABELS = [
  ['POSTED', '판매 중'], ['PENDING', '승인 대기'], ['REJECTED', '반려'], ['SOLD_OUT', '판매 완료'],
];
export const sellerToday = now => formatDate(now).replaceAll('.', '-');

export function sellerDashboardCalendar(query, today) {
  const value = query.get('month') || '';
  const month = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7);
  const calendar = sellerCalendar(month, query.get('date'));
  // An explicit month view stays unselected, including in the current month.
  const selected = calendar.selected || (query.get('view') !== 'month' && month === today.slice(0, 7) ? today : '');
  return { ...calendar, month, selected, today };
}

export function sellerCalendarPath(ctx, { month, date, all = false, base = ctx.path === '/seller/calendar' ? '/seller/calendar' : '/seller/dashboard' }) {
  const query = new URLSearchParams({ month });
  if (date) query.set('date', date); else if (all) query.set('view', 'month');
  if (ctx.query.get('mode') === 'live') query.set('mode', 'live');
  return `${base}?${query}`;
}

export function sellerCalendarAdjacentMonth(month, delta) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function sellerPickupSchedule(content, month, selected = '') {
  // pickup_date/time are already Asia/Seoul values from the API adapter.
  const entries = content.filter(item => item.status === 'ACCEPTED' && item.pickup_date.startsWith(`${month}-`))
    .toSorted((a, b) => `${a.pickup_date} ${a.pickup_time}`.localeCompare(`${b.pickup_date} ${b.pickup_time}`)
      || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  const byDate = new Map();
  for (const item of entries) {
    if (!byDate.has(item.pickup_date)) byDate.set(item.pickup_date, []);
    byDate.get(item.pickup_date).push(item);
  }
  return { entries, byDate, visible: selected ? (byDate.get(selected) || []) : entries };
}

export const sellerCalendarReservationPath = id => `/seller/reservations?${new URLSearchParams({ status: 'ACCEPTED', id: String(id) })}`;

export function sellerOverviewCount(resource, key = 'totalElements') {
  if (resource.loading) return '조회 중';
  if (resource.error || !Number.isInteger(resource.data?.[key])) return '조회 실패';
  return `${resource.data[key].toLocaleString('ko-KR')}건`;
}
