import { ApiError } from './http-client.js';

// API 17–21 return a partial draft. Missing fields must never become invented defaults.
const enums = {
  sale_type: ['SCRAP', 'ROLL'],
  material: ['COTTON', 'LINEN', 'POLYESTER', 'NYLON', 'RAYON', 'WOOL', 'BLEND', 'ETC', 'UNKNOWN'],
  thickness: ['THIN', 'NORMAL', 'THICK'],
  color_family: ['WHITE', 'BLACK', 'GRAY', 'BEIGE', 'BROWN', 'RED', 'PINK', 'YELLOW', 'GREEN', 'BLUE', 'NAVY', 'PURPLE', 'MIXED'],
};
const textFields = { title: 100, defect_note: 255 };
const numberFields = { width_cm: 1000, length_cm: 2147483647, remaining_length_cm: 2147483647, price: 2147483647 };
const draftFields = [...Object.keys(enums), ...Object.keys(textFields), ...Object.keys(numberFields), 'has_defect'];
const questions = ['sale_type', 'title', 'size', 'material', 'thickness', 'color_family', 'has_defect', 'defect_note', 'price'];
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const integer = value => Number.isSafeInteger(value) && value > 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 'AI 등록 정보를 확인하지 못했어요. 현재 세션을 다시 조회해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };

export function aiSessionIdentifier(value) {
  if (!text(value) || !/^[0-9a-f]{24}$/.test(value)) validation('AI 등록 세션 주소가 올바르지 않아요. 등록 화면에서 다시 확인해 주세요.');
  return value;
}

export function aiAnswerInput(input) {
  if (!record(input)) validation('답변을 입력하거나 선택해 주세요.');
  const result = {};
  for (const [field, max] of [['answer', 1000], ['selected', 50]]) {
    if (input[field] === undefined) continue;
    if (!text(input[field]) || !input[field].trim() || input[field].trim().length > max) validation(`${field === 'answer' ? '답변' : '선택값'}은 1~${max}자로 입력해 주세요.`);
    result[field] = input[field].trim();
  }
  if (input.finish !== undefined) {
    if (typeof input.finish !== 'boolean') validation('대화 마무리 여부를 확인해 주세요.');
    result.finish = input.finish;
  }
  // The server gives selected precedence. Do not silently discard typed user input.
  if (result.answer && result.selected) validation('직접 쓴 답변과 선택 답변 중 하나만 보내 주세요.');
  if (!result.answer && !result.selected && result.finish !== true) validation('답변을 입력하거나 선택해 주세요.');
  return result;
}

function draft(raw) {
  if (!record(raw)) invalid();
  const value = {};
  for (const field of draftFields) {
    if (!Object.hasOwn(raw, field)) continue;
    const item = raw[field];
    if (enums[field] ? !enums[field].includes(item)
      : textFields[field] ? !text(item) || !item.trim() || item.length > textFields[field]
        : numberFields[field] ? !integer(item) || item > numberFields[field]
          : typeof item !== 'boolean') invalid();
    value[field] = item;
  }
  return value;
}

function base(raw, id) {
  if (!record(raw) || !text(raw.sessionId) || !/^[0-9a-f]{24}$/.test(raw.sessionId)
    || (id && raw.sessionId !== id) || !['IN_PROGRESS', 'CONFIRMED', 'ABORTED'].includes(raw.session_status)
    || !Array.isArray(raw.unconfirmed_fields) || raw.unconfirmed_fields.some(field => !draftFields.includes(field))
    || new Set(raw.unconfirmed_fields).size !== raw.unconfirmed_fields.length) invalid();
  return { sessionId: raw.sessionId, session_status: raw.session_status, ai_draft: draft(raw.ai_draft), unconfirmed_fields: [...raw.unconfirmed_fields] };
}

export function aiSession(raw, { id, detail = false, open = false } = {}) {
  const result = base(raw, id);
  if (typeof raw.is_complete !== 'boolean' || raw.is_complete !== (raw.next_question === null)
    || (open && result.session_status !== 'IN_PROGRESS') || (result.session_status !== 'IN_PROGRESS' && raw.next_question !== null)) invalid();
  let question = null;
  if (raw.next_question !== null) {
    const next = raw.next_question;
    if (!record(next) || !questions.includes(next.field) || !text(next.text) || !next.text.trim()) invalid();
    question = { field: next.field, text: next.text };
    if (next.options !== undefined) {
      const allowed = next.field === 'has_defect' ? ['true', 'false'] : enums[next.field];
      if (!allowed || !Array.isArray(next.options) || !next.options.length || next.options.some(option => !allowed.includes(option))) invalid();
      question.options = [...next.options];
    }
  }
  Object.assign(result, { next_question: question, is_complete: raw.is_complete });
  if (detail) {
    if (!Array.isArray(raw.messages) || (result.session_status === 'CONFIRMED' ? !integer(raw.fabric_id) : raw.fabric_id !== null)) invalid();
    result.fabric_id = raw.fabric_id == null ? null : String(raw.fabric_id);
    result.messages = raw.messages.map(message => {
      if (!record(message) || !['assistant', 'user'].includes(message.role) || !text(message.content)
        || !text(message.created_at) || !Number.isFinite(Date.parse(message.created_at))) invalid();
      return { role: message.role, content: message.content, created_at: message.created_at };
    });
  }
  return result;
}

export function aiAborted(raw, id) {
  const result = base(raw, id);
  if (result.session_status !== 'ABORTED') invalid();
  return result;
}
