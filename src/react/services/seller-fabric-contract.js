import { ApiError } from './http-client.js';
import { fabricPage, fabricDetail, fabricWireCode } from './fabric-contract.js';

export const SELLER_FABRIC_STATUS = ['PENDING', 'POSTED', 'REJECTED', 'SOLD_OUT'];
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const optionalText = value => value === null || typeof value === 'string';
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '원단 처리 결과를 확인하지 못했어요. 내 원단에서 최신 상태를 확인해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };
const intMax = 2147483647;

export function ownFabricQuery(input = {}) {
  const get = key => input instanceof URLSearchParams ? input.get(key) : input[key];
  const query = new URLSearchParams(), status = get('status');
  if (status && status !== 'ALL') {
    if (!SELLER_FABRIC_STATUS.includes(status)) validation('원단 상태를 다시 선택해 주세요.');
    query.set('status', status);
  }
  for (const [key, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = get(key), value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min, max)) validation('페이지 범위를 다시 확인해 주세요.');
    query.set(key, String(value));
  }
  return query;
}

export function ownFabricPage(raw) {
  const page = fabricPage(raw);
  page.content = page.content.map((item, index) => {
    const source = raw.content[index];
    if (!SELLER_FABRIC_STATUS.includes(source.status) || !optionalText(source.reject_reason) || !integer(source.active_reservation_count)) invalid();
    return { ...item, status: source.status, reject_reason: source.reject_reason, active_reservation_count: source.active_reservation_count };
  });
  return page;
}

export function ownFabricDetail(raw) {
  // Only the owner (or admin) receives these internal keys; a public POSTED DTO is not an editable own fabric.
  if (!record(raw) || !Object.hasOwn(raw, 'remaining_length_cm') || !Object.hasOwn(raw, 'reject_reason')) {
    throw new ApiError('FORBIDDEN', '내가 등록한 원단만 관리할 수 있어요.', { status: 403 });
  }
  const fabric = fabricDetail(raw);
  if (!optionalText(raw.reject_reason) || (fabric.sale_type === 'ROLL' ? !integer(raw.remaining_length_cm) : raw.remaining_length_cm !== null)) invalid();
  if (fabric.sale_type === 'ROLL' && raw.remaining_length_cm !== fabric.available_length_cm + fabric.reserved_length_cm) invalid();
  const extra = {};
  for (const key of ['blend_ratio', 'weave', 'grain_direction']) {
    if (!optionalText(raw.detail[key])) invalid();
    extra[key] = raw.detail[key];
  }
  return { ...fabric, ...extra, reject_reason: raw.reject_reason, remaining_length_cm: raw.remaining_length_cm };
}

// Flat form values are mapped explicitly. Photos, status and UI-only fields never enter JSON requests.
export function sellerFabricInput(input, { partial = false } = {}) {
  if (!record(input)) validation('원단 정보를 입력해 주세요.');
  const body = {}, detail = {};
  const has = key => Object.hasOwn(input, key) && input[key] !== undefined;
  const required = key => !partial || has(key);
  const number = (key, min, max, target = body) => {
    if (!integer(input[key], min, max)) validation(`${key === 'price' ? '가격' : key === 'width_cm' ? '원단 폭' : '원단 길이'} 범위를 확인해 주세요.`);
    target[key] = input[key];
  };
  const text = (key, max, target, mandatory = false) => {
    if (input[key] == null && !mandatory) { target[key] = null; return; }
    if (typeof input[key] !== 'string' || input[key].trim().length > max || (mandatory && !input[key].trim())) validation('원단 이름과 설명의 입력 길이를 확인해 주세요.');
    target[key] = input[key].trim() || null;
  };
  if (required('sale_type')) {
    if (!['ROLL', 'SCRAP'].includes(input.sale_type)) validation('판매 형태를 선택해 주세요.');
    body.sale_type = input.sale_type;
  }
  if (required('title')) text('title', 100, body, true);
  if (required('price')) number('price', 1, intMax);
  if (required('width_cm')) number('width_cm', 1, 1000, detail);
  if (has('sheet_count') || (!partial && input.sale_type === 'SCRAP')) {
    if (input.sale_type === 'ROLL') {
      if (input.sheet_count != null) validation('롤은 판매 장수를 보내지 않아요.');
      detail.sheet_count = null;
    } else if (!integer(input.sheet_count, 1, 9999)) validation('판매 장수는 1장 이상 9,999장 이하인 정수로 입력해 주세요.');
    else detail.sheet_count = input.sheet_count;
  }
  for (const [key, kind] of [['material', 'material'], ['thickness', 'thickness'], ['color', 'color']]) {
    const source = key === 'color' && has('color_family') ? 'color_family' : key;
    if (!partial || has(source)) detail[key === 'color' ? 'color_family' : key] = fabricWireCode(kind, key === 'material' && input[source] == null ? 'UNKNOWN' : input[source]);
  }
  if (!partial || has('length_cm')) {
    if (input.sale_type === 'ROLL' || input.length_cm === null) detail.length_cm = null;
    else number('length_cm', 1, intMax, detail);
  }
  if (!partial || has('remaining_length_cm')) {
    if (input.sale_type === 'SCRAP' || input.remaining_length_cm === null) body.remaining_length_cm = null;
    else number('remaining_length_cm', 90, intMax);
  }
  if ((!partial || has('length_cm')) && input.sale_type === 'SCRAP' && detail.length_cm === null) validation('자투리 길이는 1cm 이상의 정수로 입력해 주세요.');
  if ((!partial || has('remaining_length_cm')) && input.sale_type === 'ROLL' && body.remaining_length_cm === null) validation('롤 잔량은 90cm 이상으로 입력해 주세요.');
  if (!partial || has('has_defect')) {
    if (input.has_defect !== undefined && typeof input.has_defect !== 'boolean') validation('하자 여부를 선택해 주세요.');
    detail.has_defect = input.has_defect ?? false;
  }
  for (const [key, max] of [['color_detail', 100], ['defect_note', 255], ['description', 5000], ['blend_ratio', 100], ['weave', 50], ['grain_direction', 50]]) {
    if (!partial || has(key)) text(key, max, detail);
  }
  if (detail.has_defect && !detail.defect_note && (!partial || has('defect_note'))) validation('하자 위치와 내용을 입력해 주세요.');
  if (Object.keys(detail).length) body.detail = detail;
  if (!Object.keys(body).length) validation('수정할 내용을 입력해 주세요.');
  return body;
}

export function fabricMutation(raw, { id, created = false } = {}) {
  if (!record(raw) || !integer(raw.fabricId, 1) || (id && String(raw.fabricId) !== id)
    || !SELLER_FABRIC_STATUS.includes(raw.status) || (created && raw.status !== 'PENDING')) invalid();
  return { id: String(raw.fabricId), status: raw.status };
}
export function fabricDeletion(raw) { if (raw !== null) invalid(); return null; }

export function imageUploadBody(file, imageType) {
  if (!(file instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || !/\.(jpe?g|png|webp)$/i.test(file.name || '') || file.size < 1 || file.size > 5 * 1024 * 1024) validation('사진은 5MB 이하의 jpg·png·webp 파일로 선택해 주세요.');
  if (imageType != null && !['FULL', 'ZOOM', 'DEFECT'].includes(imageType)) validation('사진 종류를 다시 선택해 주세요.');
  const body = new FormData(); body.append('file', file, file.name);
  if (imageType) body.append('image_type', imageType);
  return body;
}
export function fabricImage(raw, imageType) {
  const validUrl = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
  if (!record(raw) || !integer(raw.imageId, 1) || !integer(raw.sort_order) || !validUrl(raw.image_url) || !validUrl(raw.thumbnail_url)) invalid();
  return { id: String(raw.imageId), image_url: raw.image_url, thumbnail_url: raw.thumbnail_url, sort_order: raw.sort_order, image_type: imageType || null };
}
