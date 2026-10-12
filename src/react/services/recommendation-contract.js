import { ApiError } from './http-client.js';

// API v0.3, 22–24. Keep the server's judgement and cutting calculation authoritative.
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const text = value => typeof value === 'string';
const nullableText = value => value === null || text(value);
const texts = value => Array.isArray(value) && value.every(text);
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '도안 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };
const imageUrl = value => {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

export function patternIdentifier(value) {
  if (!/^\d+$/.test(String(value)) || !integer(Number(value), 1)) validation('도안 번호가 올바르지 않아요. 도안 목록에서 다시 선택해 주세요.');
  return String(Number(value));
}

export function patternQuery(input = {}) {
  const read = key => input instanceof URLSearchParams ? input.get(key) : input[key];
  const query = new URLSearchParams();
  for (const [name, max] of [['keyword', 100], ['category', 50]]) {
    const raw = read(name);
    if (raw == null || raw === '') continue;
    if (!text(raw) || raw.trim().length > max) validation(`${name === 'keyword' ? '검색어는' : '도안 분류는'} ${max}자 이내로 입력해 주세요.`);
    if (raw.trim()) query.set(name, raw.trim());
  }
  for (const [name, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = read(name), value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min) || value > max) validation('도안 목록의 페이지 범위를 확인해 주세요.');
    query.set(name, String(value));
  }
  return query;
}

export function patternSummary(raw) {
  if (!record(raw) || !integer(raw.patternId, 1) || !text(raw.pattern_name) || !raw.pattern_name.trim()
    || !nullableText(raw.aliases) || !nullableText(raw.category) || !nullableText(raw.image_url)
    || !texts(raw.allowed_materials) || !texts(raw.allowed_thickness)) invalid();
  return { source: 'api', id: String(raw.patternId), pattern_id: String(raw.patternId), pattern_name: raw.pattern_name,
    aliases: raw.aliases, category: raw.category, image_url: imageUrl(raw.image_url),
    allowed_materials: [...raw.allowed_materials], allowed_thickness: [...raw.allowed_thickness] };
}

export function patternPage(raw) {
  if (!record(raw) || !Array.isArray(raw.content) || !integer(raw.page) || !integer(raw.size, 1) || raw.size > 50
    || !integer(raw.totalElements) || !integer(raw.totalPages) || raw.totalPages !== Math.ceil(raw.totalElements / raw.size)
    || raw.content.length > raw.size || raw.content.length > raw.totalElements) invalid();
  const content = raw.content.map(patternSummary);
  if (new Set(content.map(item => item.id)).size !== content.length) invalid();
  return { content, page: raw.page, size: raw.size, totalElements: raw.totalElements, totalPages: raw.totalPages };
}

export function patternDetail(raw) {
  const pattern = patternSummary(raw);
  if (!nullableText(raw.description) || !nullableText(raw.reviewed_by) || !Array.isArray(raw.parts)) invalid();
  const parts = raw.parts.map(part => {
    if (!record(part) || !text(part.part_name) || !integer(part.width_cm, 1) || !integer(part.height_cm, 1) || !integer(part.quantity, 1)) invalid();
    return { part_name: part.part_name, width_cm: part.width_cm, height_cm: part.height_cm, quantity: part.quantity };
  });
  return { ...pattern, description: raw.description, reviewed_by: raw.reviewed_by, parts };
}

function recommendationItem(raw) {
  if (!record(raw) || !integer(raw.patternId, 1) || !text(raw.pattern_name) || !raw.pattern_name.trim()
    || !nullableText(raw.image_url) || !['SUITABLE', 'NEEDS_CHECK'].includes(raw.judgement)
    || !Array.isArray(raw.reasons) || raw.reasons.length !== 4) invalid();
  const reasons = raw.reasons.map(reason => {
    if (!record(reason) || !text(reason.text)) invalid();
    if (['WIDTH', 'LENGTH'].includes(reason.criterion)) {
      if (!integer(reason.required, 1) || !integer(reason.actual, 1) || reason.actual < reason.required || reason.met !== true) invalid();
    } else if (['MATERIAL', 'THICKNESS'].includes(reason.criterion)) {
      if (!texts(reason.required) || !text(reason.actual)) invalid();
      const unknown = reason.criterion === 'MATERIAL' && raw.judgement === 'NEEDS_CHECK';
      if (unknown ? reason.actual !== 'UNKNOWN' || reason.met !== null : reason.met !== true || !reason.required.includes(reason.actual)) invalid();
    } else invalid();
    return { criterion: reason.criterion, required: Array.isArray(reason.required) ? [...reason.required] : reason.required,
      actual: reason.actual, met: reason.met, text: reason.text };
  });
  if (new Set(reasons.map(reason => reason.criterion)).size !== 4) invalid();
  const lengths = ['required_length_cm', 'purchase_length_cm', 'yards', 'estimated_price'];
  const scrap = lengths.every(key => raw[key] === null);
  if (!scrap && (!integer(raw.required_length_cm, 1) || !integer(raw.purchase_length_cm, 1) || !integer(raw.yards, 1)
    || !integer(raw.estimated_price) || raw.yards !== Math.ceil(raw.required_length_cm / 90) || raw.purchase_length_cm !== raw.yards * 90)) invalid();
  return { source: 'api', id: String(raw.patternId), pattern_id: String(raw.patternId), pattern_name: raw.pattern_name,
    image_url: imageUrl(raw.image_url), judgement: raw.judgement, reasons,
    required_length_cm: raw.required_length_cm, purchase_length_cm: raw.purchase_length_cm, yards: raw.yards, estimated_price: raw.estimated_price };
}

export function recommendationResult(raw) {
  if (!record(raw) || typeof raw.available !== 'boolean' || !Array.isArray(raw.items) || !texts(raw.notices)
    || !nullableText(raw.message) || (!raw.available && raw.items.length)) invalid();
  const items = raw.items.map(recommendationItem);
  if (new Set(items.map(item => item.id)).size !== items.length
    || items.filter(item => item.judgement === 'SUITABLE').length > 5 || items.filter(item => item.judgement === 'NEEDS_CHECK').length > 3) invalid();
  return { available: raw.available, items, notices: [...raw.notices], message: raw.message };
}
