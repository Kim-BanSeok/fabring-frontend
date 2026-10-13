import { fabricFilterLabel } from '../../services/fabric-contract.js';
import { emptyLiveFabricDraft } from './sellerLiveFabricModel.js';

export const AI_ACTIVE_KEY = 'seller:live:ai:active';
export const aiDraftKey = id => `seller:live:ai:${id}`;
export const aiPath = (id, step) => `/seller/register/ai${id ? `?${new URLSearchParams({ session: id, ...(step ? { step } : {}) })}` : ''}`;
export const AI_FIELD_LABELS = { sale_type: '판매 형태', title: '원단 이름', width_cm: '가로(폭)', length_cm: '세로(길이)', remaining_length_cm: '남은 길이', material: '소재', thickness: '두께', color_family: '색상 계열', has_defect: '하자 여부', defect_note: '하자 내용', price: '가격' };

export function aiOptionLabel(field, value) {
  if (field === 'sale_type') return ({ ROLL: '롤 원단', SCRAP: '자투리 1장' })[value] || value;
  if (field === 'has_defect') return value === 'true' ? '하자 있음' : '하자 없음';
  return fabricFilterLabel(field === 'color_family' ? 'color' : field, value);
}

const replyLabels = Object.fromEntries(Object.entries({
  sale_type: ['ROLL', 'SCRAP'],
  material: ['COTTON', 'LINEN', 'POLYESTER', 'NYLON', 'RAYON', 'WOOL', 'BLEND', 'ETC', 'UNKNOWN'],
  thickness: ['THIN', 'NORMAL', 'THICK'],
  color_family: ['WHITE', 'BLACK', 'GRAY', 'BEIGE', 'BROWN', 'RED', 'PINK', 'YELLOW', 'GREEN', 'BLUE', 'NAVY', 'PURPLE', 'MIXED'],
  has_defect: ['true', 'false'],
}).flatMap(([field, values]) => values.map(value => [value, aiOptionLabel(field, value)])));

// Keep server messages untouched for recovery comparisons. Only exact option
// tokens in user replies receive a friendly display label.
export function aiMessageDisplay(message) {
  return message.role === 'user' && Object.hasOwn(replyLabels, message.content) ? replyLabels[message.content] : message.content;
}

// No example values or guessed defaults: an unanswered defect question must
// remain unanswered in the final form as well.
export function aiFabricDraft(session, previous = {}) {
  const raw = session?.ai_draft || {}, type = raw.sale_type || '';
  const base = emptyLiveFabricDraft(type);
  return {
    ...base, sale_type: type, title: raw.title ?? '', width_cm: raw.width_cm ?? '',
    length_cm: type === 'ROLL' ? raw.remaining_length_cm ?? '' : raw.length_cm ?? '',
    remaining_length_cm: type === 'ROLL' ? raw.remaining_length_cm ?? '' : null,
    material: fabricFilterLabel('material', raw.material || 'UNKNOWN'),
    thickness: fabricFilterLabel('thickness', raw.thickness), color: fabricFilterLabel('color', raw.color_family),
    price: raw.price ?? '', has_defect: typeof raw.has_defect === 'boolean' ? raw.has_defect : null,
    defect_note: raw.defect_note ?? '', description: raw.description || previous.description || '', color_detail: previous.color_detail || '',
    sheet_count: previous.sheet_count ?? '',
    photos: previous.photos || [],
  };
}

export function changeAiSaleType(draft, type) {
  if (draft.sale_type === type) return draft;
  // A length collected for another sale type requires fresh confirmation.
  return { ...draft, sale_type: type, length_cm: '', remaining_length_cm: type === 'ROLL' ? '' : null };
}

export function aiSessionSnapshot(session) {
  return JSON.stringify([session?.session_status, session?.ai_draft, session?.unconfirmed_fields, session?.next_question,
    session?.messages?.map(message => [message.role, message.content, message.created_at])]);
}

export function reconcileAiRead(record, session) {
  const operation = record.operation;
  const changedAnswer = operation?.kind === 'answer' && operation.snapshot !== aiSessionSnapshot(session);
  const resolved = session.session_status !== 'IN_PROGRESS' || changedAnswer || operation?.acknowledged;
  return { ...record, session, needsRead: false, ...(resolved ? { operation: null, answer: changedAnswer || operation?.acknowledged ? '' : record.answer } : {}) };
}

export function aiFailureMessage(error) {
  if (!error) return '';
  return ({
    AI_UNAVAILABLE: '답변을 정리하는 서비스에 연결하지 못했어요. 지금까지 확인한 내용과 입력한 답변은 보관했어요. 다시 시도하거나 대화를 중단한 뒤 직접 입력할 수 있어요.',
    NOT_FOUND: '이 대화를 찾을 수 없어요. 서버가 재시작되거나 보관 기간이 지나면 대화가 사라질 수 있어요. 이 탭에 남은 초안을 확인해 주세요.',
    AI_SESSION_CLOSED: '이미 끝난 대화예요. 현재 상태를 다시 조회해 등록 여부를 확인해 주세요.',
    FORBIDDEN: '이 계정에서 열 수 있는 대화가 아니에요. 현재 계정으로 새 대화를 시작해 주세요.',
    SELLER_NOT_APPROVED: '판매자 승인 상태를 확인해 주세요. 승인된 판매자만 등록할 수 있어요.',
    STORE_REQUIRED: '먼저 매장 정보를 등록해 주세요.',
  })[error.code] || (error.outcomeUnknown ? '요청 결과를 확인하지 못했어요. 현재 대화를 다시 조회해 주세요. 같은 답변이나 등록 요청을 바로 다시 보내지 않습니다.' : error.message || '처리하지 못했어요. 잠시 후 다시 확인해 주세요.');
}
