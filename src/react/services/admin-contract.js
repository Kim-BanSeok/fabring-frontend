import { ApiError } from './http-client.js';
import { fabricFilterLabel, fabricWireCode, fabricIdentifier } from './fabric-contract.js';
import { storeDetail } from './store-contract.js';

export const ADMIN_SELLER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
export const ADMIN_FABRIC_STATUSES = ['PENDING', 'POSTED', 'REJECTED', 'SOLD_OUT'];
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const nullableText = value => value === null || typeof value === 'string';
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '관리 정보를 확인하지 못했어요. 최신 정보를 다시 조회해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const safeImage = value => {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

export function adminQuery(kind, input = {}) {
  const statuses = kind === 'sellers' ? ADMIN_SELLER_STATUSES : ADMIN_FABRIC_STATUSES;
  const get = key => input instanceof URLSearchParams ? input.get(key) : input[key];
  const status = get('status') || 'PENDING';
  if (!statuses.includes(status)) validation('조회할 승인 상태를 다시 선택해 주세요.');
  const query = new URLSearchParams({ status });
  for (const [key, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = get(key), value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min) || value > max) validation('목록의 페이지 범위를 다시 확인해 주세요.');
    query.set(key, String(value));
  }
  return query;
}

export function adminSeller(raw) {
  if (!record(raw) || !integer(raw.userId, 1) || typeof raw.email !== 'string' || typeof raw.nickname !== 'string'
    || !nullableText(raw.phone_number) || !ADMIN_SELLER_STATUSES.includes(raw.seller_approval_status)
    || !timestamp(raw.created_at) || !(raw.store === null || record(raw.store))) invalid();
  return { source: 'api', id: String(raw.userId), userId: raw.userId, email: raw.email, nickname: raw.nickname,
    phone_number: raw.phone_number, seller_approval_status: raw.seller_approval_status, created_at: raw.created_at,
    hasStore: raw.store !== null, store: raw.store === null ? null : storeDetail(raw.store) };
}

export function adminFabric(raw) {
  const detail = raw?.detail;
  if (!record(raw) || !record(detail) || !integer(raw.fabricId, 1) || typeof raw.title !== 'string'
    || !['SCRAP', 'ROLL'].includes(raw.sale_type) || !integer(raw.price) || !ADMIN_FABRIC_STATUSES.includes(raw.status)
    || !nullableText(raw.store_name) || !timestamp(raw.created_at) || !Array.isArray(raw.images)
    || !integer(detail.width_cm, 1) || typeof detail.has_defect !== 'boolean'
    || (raw.sale_type === 'ROLL' ? detail.length_cm !== null || !integer(raw.remaining_length_cm) : !integer(detail.length_cm, 1) || raw.remaining_length_cm !== null)) invalid();
  const labels = {};
  for (const [key, name] of [['material', 'material'], ['thickness', 'thickness'], ['color_family', 'color']]) {
    try { labels[name] = fabricFilterLabel(name, fabricWireCode(name, detail[key])); }
    catch { invalid(); }
  }
  const extra = {};
  for (const key of ['description', 'defect_note', 'color_detail', 'blend_ratio', 'weave', 'grain_direction']) {
    if (!nullableText(detail[key])) invalid();
    extra[key] = detail[key];
  }
  const images = raw.images.map(image => {
    if (!record(image) || !integer(image.imageId, 1) || !integer(image.sort_order) || !nullableText(image.image_url)
      || !nullableText(image.thumbnail_url) || ![null, 'FULL', 'ZOOM', 'DEFECT'].includes(image.image_type)) invalid();
    return { id: String(image.imageId), image_url: safeImage(image.image_url), thumbnail_url: safeImage(image.thumbnail_url), image_type: image.image_type, sort_order: image.sort_order };
  }).sort((a, b) => a.sort_order - b.sort_order || Number(a.id) - Number(b.id));
  if (new Set(images.map(item => item.id)).size !== images.length) invalid();
  return { source: 'api', id: String(raw.fabricId), title: raw.title, sale_type: raw.sale_type, price: raw.price,
    status: raw.status, store_name: raw.store_name, created_at: raw.created_at, ...labels, ...extra,
    width_cm: detail.width_cm, length_cm: detail.length_cm, has_defect: detail.has_defect,
    remaining_length_cm: raw.remaining_length_cm, images, image_url: images.find(image => image.image_url)?.image_url || null,
    // API 33 does not supply these. Fetch the authenticated fabric detail before review.
    reject_reason: null, available_length_cm: null, reserved_length_cm: null, is_reserved: null };
}

export function adminPage(kind, raw, query) {
  if (!record(raw) || !Array.isArray(raw.content) || !integer(raw.page) || !integer(raw.size, 1) || raw.size > 50
    || !integer(raw.totalElements) || !integer(raw.totalPages) || raw.totalPages !== Math.ceil(raw.totalElements / raw.size)
    || raw.content.length > raw.size || raw.content.length > raw.totalElements
    || raw.page !== Number(query.get('page')) || raw.size !== Number(query.get('size'))) invalid();
  const items = raw.content.map(kind === 'sellers' ? adminSeller : adminFabric);
  const key = kind === 'sellers' ? 'seller_approval_status' : 'status';
  if (items.some(item => item[key] !== query.get('status')) || new Set(items.map(item => item.id)).size !== items.length) invalid();
  return { items, page: raw.page, size: raw.size, totalElements: raw.totalElements, totalPages: raw.totalPages };
}

export function adminReview(kind, id, next, reason) {
  const identifier = fabricIdentifier(id);
  if (!(kind === 'sellers' ? ['APPROVED', 'REJECTED'] : ['POSTED', 'REJECTED']).includes(next)) validation('처리할 승인 상태를 다시 확인해 주세요.');
  let body;
  if (kind === 'fabrics' && next === 'REJECTED') {
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 255) validation('반려 사유를 1~255자로 입력해 주세요.');
    body = { reason: reason.trim() };
  }
  return { identifier, action: next === 'REJECTED' ? 'reject' : 'approve', body };
}

export function adminReviewResult(kind, raw, id, next) {
  const key = kind === 'sellers' ? 'userId' : 'fabricId', statusKey = kind === 'sellers' ? 'seller_approval_status' : 'status';
  if (!record(raw) || !integer(raw[key], 1) || String(raw[key]) !== String(id) || raw[statusKey] !== next) invalid();
  return { id: String(raw[key]), [statusKey]: raw[statusKey] };
}

// Seller detail is absent from API v0.3. Scan actual status pages, never an incomplete cached array.
export async function findAdminSeller(list, id, { signal, statusHint, maxPages = 200 } = {}) {
  const identifier = fabricIdentifier(id);
  const statuses = ADMIN_SELLER_STATUSES.includes(statusHint)
    ? [statusHint, ...ADMIN_SELLER_STATUSES.filter(status => status !== statusHint)] : ADMIN_SELLER_STATUSES;
  let pagesRead = 0;
  for (const status of statuses) {
    for (let page = 0; ; page++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (++pagesRead > maxPages) throw new ApiError('LOOKUP_LIMIT', '판매자가 많아 상세 조회를 끝내지 못했어요. 목록에서 다시 조회해 주세요.');
      const result = await list({ status, page, size: 50 }, { signal });
      const found = result.items.find(item => item.id === identifier);
      if (found) return found;
      if (page + 1 >= result.totalPages) break;
    }
  }
  throw new ApiError('NOT_FOUND', '현재 목록에서 판매자를 찾지 못했어요. 승인 상태가 바뀌었을 수 있으니 목록을 다시 확인해 주세요.', { status: 404 });
}
