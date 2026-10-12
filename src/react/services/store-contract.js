import { ApiError } from './http-client.js';

const fields = [
  ['store_name', 'store_name', 100, '매장명'],
  ['address', 'store_address', 255, '픽업 주소'],
  ['phone_number', 'store_phone', 20, '매장 연락처'],
  ['closed_days', 'closed_days', 100, '휴무일', true],
  ['pickup_guide', 'pickup_guide', 5000, '픽업 안내', true],
];
const invalidResponse = () => new ApiError('INVALID_RESPONSE', '저장된 매장 정보를 확인하지 못했어요. 다시 조회해 주세요.');
const validId = value => Number.isSafeInteger(value) && value > 0;

export function storeInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError('VALIDATION_ERROR', '매장 정보를 입력해 주세요.', { status: 400 });
  const body = {};
  for (const [local, wire, max, label, optional] of fields) {
    if (!Object.hasOwn(input, local) || input[local] === undefined) {
      if (partial || optional) continue;
      throw new ApiError('VALIDATION_ERROR', `${label} 항목을 입력해 주세요.`, { status: 400 });
    }
    const value = input[local];
    if (optional && value === null) { body[wire] = null; continue; }
    if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim())) {
      throw new ApiError('VALIDATION_ERROR', `${label}: ${optional ? '최대 ' : '1~'}${max}자${optional ? '까지' : '로'} 입력해 주세요.`, { status: 400 });
    }
    body[wire] = optional ? value.trim() || null : value.trim();
  }
  if (!Object.keys(body).length) throw new ApiError('VALIDATION_ERROR', '수정할 매장 정보를 입력해 주세요.', { status: 400 });
  return body;
}

export function storeDetail(raw) {
  if (!raw || !validId(raw.storeId)) throw invalidResponse();
  const result = { id: raw.storeId };
  for (const [local, wire, max, , optional] of fields) {
    const value = raw[wire];
    if (optional && value === null) { result[local] = null; continue; }
    if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw invalidResponse();
    result[local] = value;
  }
  return result;
}

export function storeCreated(raw) {
  if (!raw || !validId(raw.storeId)) throw invalidResponse();
  return { id: raw.storeId };
}
