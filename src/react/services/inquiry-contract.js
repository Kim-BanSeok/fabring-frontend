import { ApiError } from './http-client.js';

export const INQUIRY_STATUSES = ['WAITING', 'ANSWERED'];
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const text = value => typeof value === 'string';
const date = value => text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '문의 정보를 확인하지 못했어요. 목록을 다시 조회해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };

export function inquiryIdentifier(value) {
  if (!/^\d+$/.test(String(value)) || !integer(Number(value), 1)) validation('문의 또는 원단 번호가 올바르지 않아요. 목록에서 다시 선택해 주세요.');
  return String(Number(value));
}

export function inquiryQuery(input = {}, { seller = false } = {}) {
  const read = key => input instanceof URLSearchParams ? input.get(key) : input[key];
  const query = new URLSearchParams(), status = read('status');
  if (status && status !== 'ALL') {
    if (!seller || !INQUIRY_STATUSES.includes(status)) validation('문의 상태를 다시 선택해 주세요.');
    query.set('status', status);
  }
  for (const [key, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = read(key), value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min) || value > max) validation('문의 목록의 페이지 범위를 확인해 주세요.');
    query.set(key, String(value));
  }
  return query;
}

export function inquiryInput(input, { answer = false } = {}) {
  const key = answer ? 'answer' : 'content';
  if (!record(input) || !text(input[key]) || !input[key].trim() || input[key].trim().length > 1000) validation(`${answer ? '답변' : '문의'} 내용을 1~1,000자로 입력해 주세요.`);
  const result = { [key]: input[key].trim() };
  if (!answer) {
    if (input.is_private !== undefined && typeof input.is_private !== 'boolean') validation('문의 공개 여부를 확인해 주세요.');
    result.is_private = input.is_private ?? false;
  }
  return result;
}

export function inquiryItem(raw) {
  if (!record(raw) || !integer(raw.inquiryId, 1) || !integer(raw.fabricId, 1) || !text(raw.fabric_title)
    || !(raw.buyer_nickname === null || text(raw.buyer_nickname)) || typeof raw.is_private !== 'boolean'
    || !INQUIRY_STATUSES.includes(raw.status) || !text(raw.content) || !raw.content.trim()
    || !(raw.answer === null || (text(raw.answer) && raw.answer.trim())) || !date(raw.created_at)
    || !(raw.answered_at === null || date(raw.answered_at))
    || (raw.status === 'WAITING' && (raw.answer !== null || raw.answered_at !== null))
    || (raw.status === 'ANSWERED' && (!raw.answered_at || (!raw.is_private && !raw.answer)))) invalid();
  // No buyer id or canRead flag exists. Preserve server masking and never infer ownership from nickname.
  return { source: 'api', id: String(raw.inquiryId), fabric_id: String(raw.fabricId), fabric_title: raw.fabric_title,
    buyer_nickname: raw.buyer_nickname, is_private: raw.is_private, status: raw.status,
    content: raw.content, answer: raw.answer, answered_at: raw.answered_at, created_at: raw.created_at };
}

export function inquiryPage(raw, query, { fabricId } = {}) {
  if (!record(raw) || !Array.isArray(raw.content) || !integer(raw.page) || !integer(raw.size, 1) || raw.size > 50
    || !integer(raw.totalElements) || !integer(raw.totalPages) || raw.page !== Number(query.get('page'))
    || raw.size !== Number(query.get('size')) || raw.totalPages !== Math.ceil(raw.totalElements / raw.size)
    || raw.content.length > raw.size || raw.content.length > raw.totalElements) invalid();
  const items = raw.content.map(inquiryItem), status = query.get('status');
  if (new Set(items.map(item => item.id)).size !== items.length
    || items.some(item => (fabricId && item.fabric_id !== fabricId) || (status && item.status !== status))) invalid();
  return { items, page: raw.page, size: raw.size, totalElements: raw.totalElements, totalPages: raw.totalPages };
}

export function inquiryMutation(raw, status, id) {
  if (!record(raw) || !integer(raw.inquiryId, 1) || raw.status !== status || (id && String(raw.inquiryId) !== id)) invalid();
  return { id: String(raw.inquiryId), status: raw.status };
}
