import { ApiError } from './http-client.js';

const categories = ['TEXTILE', 'APPAREL', 'LEATHER', 'FOOD', 'CHEMICAL', 'PLASTIC', 'METAL', 'WOOD', 'PAPER', 'ELECTRIC', 'CONSTRUCTION', 'OTHER'];
const statuses = ['candidate', 'review', 'excluded', 'unmatched'];
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const text = (value) => typeof value === 'string' && Boolean(value.trim());
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '공장 정보를 확인하지 못했어요. 다시 불러와 주세요.'); };

export function factoryQuery(input = {}) {
  const read = (key) => input instanceof URLSearchParams ? input.get(key) : input[key];
  const query = new URLSearchParams();
  for (const [key, allowed] of [['category', categories], ['supply_status', statuses]]) {
    const value = read(key);
    if (value) {
      if (!allowed.includes(value)) throw new ApiError('VALIDATION_ERROR', '공장 조회 조건을 확인해 주세요.', { status: 400 });
      query.set(key, value);
    }
  }
  for (const [key, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = read(key), value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min) || value > max) throw new ApiError('VALIDATION_ERROR', '공장 목록의 페이지 범위를 확인해 주세요.', { status: 400 });
    query.set(key, String(value));
  }
  return query;
}

export function factoryItem(raw) {
  if (!raw || !integer(raw.factoryId, 1) || !text(raw.factory_name) || !text(raw.address)
    || !(raw.industry === null || typeof raw.industry === 'string') || !categories.includes(raw.category)
    || !text(raw.data_source) || typeof raw.created_at !== 'string' || !Number.isFinite(Date.parse(raw.created_at))) invalid();
  for (const key of ['phone_number', 'fax_number']) {
    if (raw[key] != null && (typeof raw[key] !== 'string' || raw[key].length > 20)) invalid();
  }
  const missing = raw.latitude === null && raw.longitude === null;
  if (!missing && (!Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)
    || Math.abs(raw.latitude) > 90 || Math.abs(raw.longitude) > 180)) invalid();
  if (raw.legal_dong != null && !text(raw.legal_dong)) invalid();
  return { id: String(raw.factoryId), name: raw.factory_name, address: raw.address, industry: raw.industry,
    phone_number: raw.phone_number?.trim() || null, fax_number: raw.fax_number?.trim() || null,
    legal_dong: raw.legal_dong?.trim() || null,
    category: raw.category, latitude: raw.latitude, longitude: raw.longitude, data_source: raw.data_source, created_at: raw.created_at };
}

export function factoryPage(raw, query) {
  if (!raw || !Array.isArray(raw.content) || !integer(raw.page) || !integer(raw.size, 1) || raw.size > 50
    || !integer(raw.totalElements) || !integer(raw.totalPages) || raw.page !== Number(query.get('page'))
    || raw.size !== Number(query.get('size')) || raw.totalPages !== Math.ceil(raw.totalElements / raw.size)
    || raw.content.length !== Math.min(raw.size, Math.max(0, raw.totalElements - raw.page * raw.size))) invalid();
  const items = raw.content.map(factoryItem);
  if (new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => query.has('category') && item.category !== query.get('category'))) invalid();
  return { items, page: raw.page, size: raw.size, totalElements: raw.totalElements, totalPages: raw.totalPages };
}

export async function loadSupplyFactories(api, { signal } = {}) {
  const items = [], seen = new Set();
  let totalElements;
  for (let page = 0; ; page++) {
    const result = await api.listFactories({ supply_status: 'candidate', page, size: 50 }, { signal });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (totalElements !== undefined && result.totalElements !== totalElements) invalid();
    totalElements = result.totalElements;
    for (const item of result.items) {
      if (seen.has(item.id)) invalid();
      seen.add(item.id); items.push(item);
    }
    if (page + 1 >= result.totalPages) break;
  }
  if (items.length !== totalElements || new Set(items.map((item) => item.data_source)).size > 1) invalid();
  return { items, totalElements };
}
