import { ApiError } from './http-client.js';

export const SELLER_FABRIC_STATUSES = ['POSTED', 'PENDING', 'REJECTED', 'SOLD_OUT'];
export const SELLER_INQUIRY_STATUSES = ['WAITING', 'ANSWERED'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '현황 정보를 확인하지 못했어요. 다시 조회해 주세요.'); };
const changed = () => { throw new ApiError('DATA_CHANGED', '조회 중 예약 내역이 바뀌었어요. 최신 일정을 다시 조회해 주세요.'); };
const aborted = signal => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };

// Stats use the server's total, not the one row fetched to validate each status.
// No inquiry content, buyer identity, or product photo is retained for statistics.
export function sellerStatusCount(raw, status, kind) {
  if (!record(raw) || !Array.isArray(raw.content) || raw.page !== 0 || raw.size !== 1
    || !integer(raw.totalElements) || raw.totalPages !== raw.totalElements
    || raw.content.length !== Math.min(1, raw.totalElements)) invalid();
  const id = kind === 'fabric' ? 'fabricId' : 'inquiryId';
  if (raw.content.some(item => !record(item) || !integer(item[id]) || item[id] < 1 || item.status !== status)) invalid();
  return raw.totalElements;
}

const fingerprint = page => JSON.stringify(page.content.map(item => [item.id, item.status, item.pickup_at, item.fabric_id, item.fabric_title, item.buyer_nickname, item.memo, item.requested_length_cm, item.estimated_price]));

// API 27 has no month/date filter or pickup-time sort. Visit every ACCEPTED page.
// Offset pagination is not a server snapshot; detect shifts and discard partial data.
export async function collectSellerPickups(readPage, { signal, now = Date.now } = {}) {
  const size = 50;
  aborted(signal);
  const first = await readPage({ status: 'ACCEPTED', page: 0, size }, { signal });
  aborted(signal);
  if (!integer(first?.totalElements) || !integer(first?.totalPages) || first.totalPages !== Math.ceil(first.totalElements / size)) invalid();
  // Bound work without silently truncating a large seller's calendar.
  if (first.totalPages > 200) throw new ApiError('CALENDAR_TOO_LARGE', '예약이 많아 전체 일정을 한 번에 확인하기 어려워요. 받은 예약 목록에서 확인해 주세요.');
  const content = [], seen = new Set();
  function add(page, index) {
    if (!record(page) || !Array.isArray(page.content) || page.page !== index || page.size !== size) invalid();
    if (page.totalElements !== first.totalElements || page.totalPages !== first.totalPages
      || page.content.length !== Math.min(size, Math.max(0, first.totalElements - index * size))) changed();
    for (const item of page.content) {
      if (!item || item.status !== 'ACCEPTED' || !/^\d+$/.test(item.id) || Number(item.id) < 1) invalid();
      if (seen.has(item.id)) changed();
      seen.add(item.id); content.push(item);
    }
  }
  add(first, 0);
  for (let index = 1; index < first.totalPages; index++) {
    aborted(signal);
    const page = await readPage({ status: 'ACCEPTED', page: index, size }, { signal });
    aborted(signal); add(page, index);
  }
  // Catch changes at the leading offset while later pages were being fetched.
  if (first.totalPages > 1) {
    const latest = await readPage({ status: 'ACCEPTED', page: 0, size }, { signal });
    aborted(signal);
    if (latest.page !== 0 || latest.size !== size || latest.totalElements !== first.totalElements
      || latest.totalPages !== first.totalPages || fingerprint(latest) !== fingerprint(first)) changed();
  }
  if (content.length !== first.totalElements) changed();
  return { content, totalElements: first.totalElements, checkedAt: new Date(now()).toISOString() };
}
