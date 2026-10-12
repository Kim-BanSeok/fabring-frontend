import { ApiError } from './http-client.js';

// Backend 7dc28c7: API v0.3, endpoints 10 and 11. UI labels stay separate from wire codes.
const labels = {
  material: { COTTON: '면', LINEN: '린넨', POLYESTER: '폴리에스터', NYLON: '나일론', RAYON: '레이온', WOOL: '울', BLEND: '혼방', ETC: '기타', UNKNOWN: '미확인' },
  thickness: { THIN: '얇음', NORMAL: '중간 두께', THICK: '두꺼움' },
  color: { WHITE: '흰색', BLACK: '검정', GRAY: '회색', BEIGE: '베이지', BROWN: '갈색', RED: '빨강', PINK: '분홍', YELLOW: '노랑', GREEN: '초록', BLUE: '블루', NAVY: '네이비', PURPLE: '보라', MIXED: '혼합' },
};
export const FABRIC_FILTER_OPTIONS = Object.fromEntries(Object.entries(labels).map(([key, values]) => [key, Object.values(values).map(label => ({ value: label, label }))]));
export const fabricFilterLabel = (name, value) => String(value || '').split(',').map(code => labels[name]?.[code.trim()] || code.trim()).join(',');
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '원단 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const text = value => typeof value === 'string';
const optionalText = value => value == null || text(value);
const enumLabel = (kind, value) => text(value) && Object.hasOwn(labels[kind], value) ? labels[kind][value] : invalid();
const imageUrl = value => {
  if (!text(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

export function fabricQuery(input = {}) {
  const read = key => input instanceof URLSearchParams ? input.get(key) : input[key];
  const query = new URLSearchParams();
  const saleType = read('sale_type') || 'SCRAP';
  if (!['SCRAP', 'ROLL'].includes(saleType)) validation('판매 형태를 다시 선택해 주세요.');
  query.set('sale_type', saleType);
  for (const name of ['material', 'thickness', 'color']) {
    const value = read(name) || (name === 'color' ? read('color_family') : null);
    if (value == null || value === '') continue;
    if (!text(value)) validation('검색 조건을 다시 선택해 주세요.');
    const codes = value.split(',').map(item => {
      const part = item.trim();
      const code = Object.hasOwn(labels[name], part) ? part : Object.keys(labels[name]).find(key => labels[name][key] === part);
      if (!code) validation('지원하지 않는 검색 조건이에요. 조건을 다시 선택해 주세요.');
      return code;
    });
    query.set(name === 'color' ? 'color_family' : name, [...new Set(codes)].join(','));
  }
  const keyword = String(read('keyword') || '').trim();
  if (keyword.length > 100) validation('검색어는 100자 이내로 입력해 주세요.');
  if (keyword) query.set('keyword', keyword);
  const sort = read('sort') || 'latest';
  if (!['latest', 'price_asc', 'price_desc'].includes(sort)) validation('정렬 조건을 다시 선택해 주세요.');
  query.set('sort', sort);
  for (const [name, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = read(name);
    const value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min) || value > max) validation('페이지 범위가 올바르지 않아요. 원단 목록에서 다시 선택해 주세요.');
    query.set(name, String(value));
  }
  return query;
}

function baseFabric(raw, detail = raw, availability = raw) {
  if (!record(raw) || !record(detail) || !record(availability)
    || !integer(raw.fabricId, 1) || !text(raw.title) || !['SCRAP', 'ROLL'].includes(raw.sale_type)
    || !integer(raw.price) || !integer(detail.width_cm, 1) || typeof detail.has_defect !== 'boolean'
    || typeof availability.is_reserved !== 'boolean') invalid();
  const roll = raw.sale_type === 'ROLL';
  if (roll ? detail.length_cm !== null || !integer(availability.available_length_cm) : !integer(detail.length_cm, 1) || availability.available_length_cm !== null) invalid();
  return {
    source: 'api', id: String(raw.fabricId), title: raw.title, sale_type: raw.sale_type, price: raw.price,
    material: enumLabel('material', detail.material), thickness: enumLabel('thickness', detail.thickness), color: enumLabel('color', detail.color_family),
    width_cm: detail.width_cm, length_cm: detail.length_cm, has_defect: detail.has_defect,
    is_reserved: availability.is_reserved, available_length_cm: availability.available_length_cm,
  };
}

export function fabricSummary(raw) {
  const fabric = baseFabric(raw);
  if (!text(raw.store_name) || !optionalText(raw.thumbnail_url)) invalid();
  return { ...fabric, status: 'POSTED', store_name: raw.store_name, image_url: imageUrl(raw.thumbnail_url), images: [], description: null };
}

export function fabricPage(raw) {
  if (!record(raw) || !Array.isArray(raw.content) || !integer(raw.page) || !integer(raw.size, 1) || raw.size > 50
    || !integer(raw.totalElements) || !integer(raw.totalPages) || raw.totalPages !== Math.ceil(raw.totalElements / raw.size)
    || raw.content.length > raw.size || raw.content.length > raw.totalElements) invalid();
  return { content: raw.content.map(fabricSummary), page: raw.page, size: raw.size, totalElements: raw.totalElements, totalPages: raw.totalPages };
}

export function fabricDetail(raw) {
  const fabric = baseFabric(raw, raw?.detail, raw?.availability);
  const store = raw.store, detail = raw.detail;
  if (!['POSTED', 'PENDING', 'REJECTED', 'SOLD_OUT'].includes(raw.status) || !record(store) || !integer(store.storeId, 1)
    || !text(store.store_name) || !text(store.store_address) || !Array.isArray(raw.images) || !text(raw.created_at)
    || !Number.isFinite(Date.parse(raw.created_at)) || !optionalText(detail.description) || !optionalText(detail.defect_note)
    || !optionalText(detail.color_detail) || !optionalText(store.store_phone) || !optionalText(store.closed_days) || !optionalText(store.pickup_guide)
    || (fabric.sale_type === 'ROLL' ? !integer(raw.availability.reserved_length_cm) : raw.availability.reserved_length_cm !== null)) invalid();
  const images = raw.images.map(image => {
    if (!record(image) || !integer(image.imageId, 1) || !integer(image.sort_order)
      || !optionalText(image.image_url) || !optionalText(image.thumbnail_url)
      || ![null, undefined, 'FULL', 'ZOOM', 'DEFECT'].includes(image.image_type)) invalid();
    return { id: String(image.imageId), image_url: imageUrl(image.image_url), thumbnail_url: imageUrl(image.thumbnail_url), image_type: image.image_type, sort_order: image.sort_order };
  }).sort((a, b) => a.sort_order - b.sort_order || Number(a.id) - Number(b.id));
  return {
    ...fabric, status: raw.status, description: detail.description, defect_note: detail.defect_note, color_detail: detail.color_detail,
    reserved_length_cm: raw.availability.reserved_length_cm, created_at: raw.created_at,
    images, image_url: images.find(image => image.image_url)?.image_url || null,
    store_id: String(store.storeId), store_name: store.store_name,
    store: { id: String(store.storeId), store_name: store.store_name, address: store.store_address, phone_number: store.store_phone, closed_days: store.closed_days, pickup_guide: store.pickup_guide },
  };
}

export function fabricIdentifier(id) {
  if (!/^\d+$/.test(String(id)) || !integer(Number(id), 1)) validation('원단 번호가 올바르지 않아요. 목록에서 원단을 다시 선택해 주세요.');
  return String(Number(id));
}
