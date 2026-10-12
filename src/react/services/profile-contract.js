import { ApiError } from './http-client.js';

const invalid = () => { throw new ApiError('INVALID_RESPONSE', '저장된 계정 정보를 확인하지 못했어요. 다시 조회해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };

export function profileInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['nickname', 'phone_number'].includes(key))) validation('닉네임과 개인 연락처만 변경할 수 있어요.');
  const body = {};
  if (Object.hasOwn(input, 'nickname') && input.nickname !== undefined) {
    if (typeof input.nickname !== 'string' || !input.nickname.trim() || input.nickname.trim().length > 50) validation('닉네임은 1~50자로 입력해 주세요.');
    body.nickname = input.nickname.trim();
  }
  if (Object.hasOwn(input, 'phone_number') && input.phone_number !== undefined) {
    if (input.phone_number !== null && (typeof input.phone_number !== 'string' || input.phone_number.trim().length > 20)) validation('개인 연락처는 20자 이내로 입력해 주세요.');
    body.phone_number = input.phone_number?.trim() || null;
  }
  if (!Object.keys(body).length) validation('수정할 계정 정보를 입력해 주세요.');
  return body;
}

export function profileDetail(raw, expected, submitted) {
  if (!raw || !Number.isSafeInteger(raw.userId) || raw.userId <= 0 || typeof raw.email !== 'string' || !raw.email
    || typeof raw.nickname !== 'string' || !raw.nickname.trim() || raw.nickname.length > 50
    || !['BUYER', 'SELLER', 'ADMIN'].includes(raw.role) || typeof raw.hasStore !== 'boolean'
    || !(raw.phone_number === null || (typeof raw.phone_number === 'string' && raw.phone_number.length <= 20))
    || (raw.role === 'SELLER' ? !['PENDING', 'APPROVED', 'REJECTED'].includes(raw.seller_approval_status) : raw.seller_approval_status !== null)
    || typeof raw.created_at !== 'string' || !Number.isFinite(Date.parse(raw.created_at))
    || (expected && (raw.userId !== expected.userId || raw.role !== expected.role || raw.email !== expected.email))
    || (submitted && Object.entries(submitted).some(([key, value]) => raw[key] !== value))) invalid();
  return { userId: raw.userId, id: String(raw.userId), email: raw.email, nickname: raw.nickname, role: raw.role,
    phone_number: raw.phone_number, seller_approval_status: raw.seller_approval_status, hasStore: raw.hasStore, created_at: raw.created_at };
}
