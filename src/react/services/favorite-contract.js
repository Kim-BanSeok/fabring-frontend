import { ApiError } from './http-client.js';

export const FAVORITE_TARGETS = ['FABRIC', 'PATTERN'];
const FABRIC_STATUSES = ['PENDING', 'POSTED', 'REJECTED', 'SOLD_OUT'];
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const text = value => typeof value === 'string';
const date = value => text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '관심 목록을 확인하지 못했어요. 다시 조회해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };

export function favoriteIdentifier(value) {
  if (!/^\d+$/.test(String(value)) || !integer(Number(value), 1)) validation('관심 대상 번호가 올바르지 않아요. 목록에서 다시 선택해 주세요.');
  return String(Number(value));
}

export function favoriteQuery(input = {}) {
  const read = key => input instanceof URLSearchParams ? input.get(key) : input[key];
  const query = new URLSearchParams(), target = read('target_type');
  if (target) {
    if (!FAVORITE_TARGETS.includes(target)) validation('원단 또는 도안 중에서 다시 선택해 주세요.');
    query.set('target_type', target);
  }
  for (const [key, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = read(key), value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min) || value > max) validation('관심 목록의 페이지 범위를 확인해 주세요.');
    query.set(key, String(value));
  }
  return query;
}

export function favoriteInput(targetType, targetId) {
  if (!FAVORITE_TARGETS.includes(targetType)) validation('원단 또는 도안만 관심 목록에 저장할 수 있어요.');
  const id = Number(favoriteIdentifier(targetId));
  return targetType === 'FABRIC' ? { target_type: 'FABRIC', fabric_id: id } : { target_type: 'PATTERN', pattern_id: id };
}

export function favoriteItem(raw) {
  if (!record(raw) || !integer(raw.favoriteId, 1) || !FAVORITE_TARGETS.includes(raw.target_type) || !date(raw.created_at)) invalid();
  const base = { source: 'api', id: String(raw.favoriteId), target_type: raw.target_type, created_at: raw.created_at };
  if (raw.target_type === 'FABRIC') {
    if (!integer(raw.fabricId, 1) || !text(raw.title) || !raw.title.trim() || !['SCRAP', 'ROLL'].includes(raw.sale_type)
      || !(raw.price === null || integer(raw.price)) || !(raw.thumbnail_url === null || text(raw.thumbnail_url))
      || !FABRIC_STATUSES.includes(raw.fabric_status) || typeof raw.is_deleted !== 'boolean') invalid();
    return { ...base, target_id: String(raw.fabricId), title: raw.title, sale_type: raw.sale_type, price: raw.price,
      thumbnail_url: raw.thumbnail_url, fabric_status: raw.fabric_status, is_deleted: raw.is_deleted };
  }
  if (!integer(raw.patternId, 1) || !text(raw.pattern_name) || !raw.pattern_name.trim()
    || !(raw.category === null || text(raw.category)) || !(raw.image_url === null || text(raw.image_url))
    || typeof raw.is_active !== 'boolean') invalid();
  return { ...base, target_id: String(raw.patternId), title: raw.pattern_name, category: raw.category, image_url: raw.image_url, is_active: raw.is_active };
}

export function favoritePage(raw, query) {
  if (!record(raw) || !Array.isArray(raw.content) || !integer(raw.page) || !integer(raw.size, 1) || raw.size > 50
    || !integer(raw.totalElements) || !integer(raw.totalPages) || raw.page !== Number(query.get('page'))
    || raw.size !== Number(query.get('size')) || raw.totalPages !== Math.ceil(raw.totalElements / raw.size)
    || raw.content.length > raw.size || raw.content.length > raw.totalElements) invalid();
  const items = raw.content.map(favoriteItem), target = query.get('target_type');
  if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => target && item.target_type !== target)) invalid();
  return { items, page: raw.page, size: raw.size, totalElements: raw.totalElements, totalPages: raw.totalPages };
}

export function favoriteCreated(raw) {
  if (!record(raw) || !integer(raw.favoriteId, 1)) invalid();
  return { id: String(raw.favoriteId) };
}
