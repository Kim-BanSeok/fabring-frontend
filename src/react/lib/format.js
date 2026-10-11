export const formatPrice = value => `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
export const formatLength = cm => `${new Intl.NumberFormat('ko-KR').format(Number(cm) || 0)}cm${cm && cm % 90 === 0 ? ` (${cm / 90}마)` : ''}`;

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const asDate = value => value == null || value === '' ? null : new Date(value);
export function formatDate(value) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return '날짜 확인 필요';
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day}`;
}
export function formatDateTime(value) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return '날짜 확인 필요';
  // A calendar date has no recorded time; do not invent a 09:00 time for it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDate(value);
  return `${formatDate(value)} ${timeFormatter.format(date)}`;
}
