import { createSeed, STATE_VERSION } from '../data/seed.js';
import { assertRegistration, validateFabric, validateReservation, transitionReservation, failure } from '../shared/domain.js';

export const STORAGE_KEY = 'yangju-loop-html-v1';
const clone = value => structuredClone(value);
const today = () => new Date().toLocaleDateString('en-CA');
export function createMockApi(storage = globalThis.localStorage) {
  let state;
  try { const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null'); if (saved?.version === STATE_VERSION && saved.seller && Array.isArray(saved.fabrics)) state = saved; } catch { /* Invalid local demo data is replaceable. */ }
  state ||= createSeed();
  // Add new preview fixtures once without resetting the user's previous local work.
  if (!state.phase2) {
    const additions = createSeed().fabrics.filter(f => ['fabric-gauze', 'fabric-check', 'fabric-denim'].includes(f.id));
    state.fabrics.push(...additions.filter(f => !state.fabrics.some(existing => existing.id === f.id)));
    state.phase2 = true;
  }
  state.demo.adminResult ||= 'SUCCESS';
  const save = () => { try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* In-memory preview still works if storage is unavailable. */ } };
  const id = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  const getFabric = fabricId => { const f = state.fabrics.find(f => f.id === fabricId && !f.deleted_at); if (!f) throw failure('NOT_FOUND', '원단을 찾을 수 없어요.'); return f; };
  const role = expected => { if (state.session.role !== expected) throw failure('FORBIDDEN', '이 작업은 해당 역할 화면에서 진행해 주세요.'); };
  const syncSeller = () => { const row = state.sellers.find(s => s.id === state.seller.id); if (row) Object.assign(row, state.seller, { store_name: state.store.store_name }); };
  const validateAccount = (input, signup = false) => {
    if (!['BUYER', 'SELLER', ...(signup ? [] : ['ADMIN'])].includes(input.role)) throw failure('INVALID_ROLE', '역할을 확인해 주세요.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email || '')) || input.email.length > 255) throw failure('INVALID_EMAIL', '올바른 이메일을 입력해 주세요.');
    if (String(input.password || '').length < (signup ? 8 : 1) || String(input.password).length > 72) throw failure('INVALID_PASSWORD', signup ? '비밀번호는 8~72자로 입력해 주세요.' : '비밀번호를 입력해 주세요.');
    if (signup && (!String(input.nickname || '').trim() || input.nickname.trim().length > 50 || String(input.phone_number || '').length > 20)) throw failure('INVALID_INPUT', '닉네임은 1~50자, 연락처는 20자 이하로 입력해 주세요.');
  };
  const adminResult = () => { if (state.demo.adminResult === 'ERROR') throw failure('SERVICE_ERROR', '처리 결과를 확인하지 못했어요. 신청 정보를 다시 불러와 주세요.'); };
  return {
    getState: () => clone({ ...state, fabrics: state.fabrics.filter(f => !f.deleted_at) }),
    async loginDemo(input) { validateAccount(input); state.session = { role: input.role, authenticated: true }; save(); return { role: input.role, first_login: input.role === 'SELLER' && !state.seller.hasStore }; },
    async signupDemo(input) {
      validateAccount(input, true);
      if (input.terms !== true || input.privacy !== true) throw failure('CONSENT_REQUIRED', '필수 약관 두 가지에 동의해 주세요.');
      const profile = { email: input.email.trim().toLowerCase(), nickname: input.nickname.trim(), phone_number: input.phone_number || null };
      if (input.role === 'SELLER') { Object.assign(state.seller, profile, { hasStore: false, seller_approval_status: 'PENDING' }); syncSeller(); }
      else Object.assign(state.buyer, profile);
      // Authentication is a form-flow simulation: never persist passwords or real tokens.
      state.session = { role: input.role, authenticated: false }; save(); return { role: input.role, email: profile.email };
    },
    async logoutDemo() { state.session.authenticated = false; save(); },
    async setRole(value) { if (!['BUYER', 'SELLER', 'ADMIN'].includes(value)) throw failure('INVALID_ROLE', '역할을 확인해 주세요.'); state.session.role = value; save(); },
    async reset() { state = createSeed(); save(); },
    async setDemo(values) { if (values.seller_approval_status && ['PENDING', 'APPROVED', 'REJECTED'].includes(values.seller_approval_status)) state.seller.seller_approval_status = values.seller_approval_status; if (typeof values.hasStore === 'boolean') state.seller.hasStore = values.hasStore; if (['SUCCESS', 'UNKNOWN'].includes(values.createResult)) state.demo.createResult = values.createResult; if (['SUCCESS', 'PARTIAL'].includes(values.uploadResult)) state.demo.uploadResult = values.uploadResult; if (['SUCCESS', 'ERROR'].includes(values.adminResult)) state.demo.adminResult = values.adminResult; syncSeller(); save(); },
    async updateSellerProfile({ nickname, phone_number }) { role('SELLER'); if (!String(nickname || '').trim() || String(nickname).trim().length > 50 || String(phone_number || '').length > 20) throw failure('INVALID_INPUT', '닉네임은 1~50자, 연락처는 20자 이하로 입력해 주세요.'); Object.assign(state.seller, { nickname: nickname.trim(), phone_number: phone_number || null }); syncSeller(); save(); return clone(state.seller); },
    async answerInquiry(inquiryId, content) {
      role('SELLER'); const inquiry = state.inquiries.find(i => i.id === inquiryId);
      if (!inquiry) throw failure('NOT_FOUND', '문의를 찾을 수 없어요.');
      if (getFabric(inquiry.fabric_id).seller_id !== state.seller.id) throw failure('FORBIDDEN', '내 원단에 대한 문의만 답변할 수 있어요.');
      const answer = String(content || '').trim(); if (!answer || answer.length > 1000) throw failure('INVALID_CONTENT', '답변은 1~1,000자로 입력해 주세요.');
      inquiry.answer = answer; inquiry.answered_at = new Date().toISOString(); save(); return clone(inquiry);
    },
    async updateFabric(fabricId, fields) {
      role('SELLER'); const fabric = getFabric(fabricId);
      if (fabric.seller_id !== state.seller.id) throw failure('FORBIDDEN', '내 매장의 원단만 수정할 수 있어요.');
      if (fabric.status === 'SOLD_OUT') throw failure('INVALID_STATUS', '판매 완료 원단은 수정할 수 없어요.');
      const allowed = ['title', 'description', 'price', 'width_cm', 'length_cm', 'remaining_length_cm', 'material', 'color', 'color_detail', 'thickness', 'has_defect', 'defect_note', 'photo_names', 'photo_slots'];
      const changes = Object.fromEntries(allowed.filter(k => Object.hasOwn(fields, k)).map(k => [k, fields[k]]));
      const next = validateFabric({ ...fabric, ...changes });
      if (next.sale_type === 'ROLL' && next.remaining_length_cm < fabric.reserved_length_cm) throw failure('INSUFFICIENT_LENGTH', '이미 수락한 예약의 확보 길이보다 줄일 수 없어요.');
      Object.assign(fabric, next, { status: fabric.status === 'REJECTED' ? 'PENDING' : fabric.status, reject_reason: null, available_length_cm: next.sale_type === 'ROLL' ? next.remaining_length_cm - fabric.reserved_length_cm : null });
      if (Object.hasOwn(changes, 'photo_names')) fabric.photos = [...changes.photo_names];
      save(); return clone(fabric);
    },
    async deleteFabric(fabricId) {
      role('SELLER'); const fabric = getFabric(fabricId);
      if (fabric.seller_id !== state.seller.id) throw failure('FORBIDDEN', '내 매장의 원단만 삭제할 수 있어요.');
      if (state.reservations.some(r => r.fabric_id === fabricId && ['REQUESTED', 'ACCEPTED'].includes(r.status))) throw failure('FABRIC_HAS_ACTIVE_RESERVATION', '진행 중인 예약이 있어 삭제할 수 없어요. 예약 내역을 먼저 확인해 주세요.');
      fabric.deleted_at = new Date().toISOString();
      if (state.upload?.fabric_id === fabricId) state.upload = null;
      save(); return { id: fabricId };
    },
    async prepareAiDraft({ sale_type, message }) {
      role('SELLER'); assertRegistration(state.seller);
      if (!['SCRAP', 'ROLL'].includes(sale_type) || !String(message || '').trim() || String(message).length > 1000) throw failure('INVALID_INPUT', '판매 형태와 1~1,000자의 원단 설명을 입력해 주세요.');
      const draft = { title: sale_type === 'ROLL' ? '내추럴 코튼 캔버스' : '포근한 더블 거즈', sale_type, description: String(message).trim(), material: '면', color: sale_type === 'ROLL' ? '내추럴' : '흰색', thickness: sale_type === 'ROLL' ? '중간 두께' : '얇음', width_cm: sale_type === 'ROLL' ? 150 : 110, remaining_length_cm: sale_type === 'ROLL' ? 450 : null, length_cm: sale_type === 'SCRAP' ? 80 : null, price: sale_type === 'ROLL' ? 5000 : 8000, has_defect: false, defect_note: '', photo_names: [...(state.draft?.photo_names || [])], ai_request: String(message).trim(), ai_demo: true };
      state.ai = { status: 'READY', sale_type, message: String(message).trim(), draft: clone(draft) }; state.draft = clone(draft); save(); return clone(draft);
    },
    async updateProfile({ nickname, phone_number }) { role('BUYER'); if (!String(nickname || '').trim() || String(nickname).trim().length > 50) throw failure('INVALID_INPUT', '닉네임은 1~50자로 입력해 주세요.'); if (String(phone_number || '').length > 20) throw failure('INVALID_INPUT', '연락처는 20자 이하로 입력해 주세요.'); Object.assign(state.buyer, { nickname: nickname.trim(), phone_number: phone_number || null }); save(); return clone(state.buyer); },
    async createInquiry(input) { role('BUYER'); const f = getFabric(input.fabric_id); const content = String(input.content || '').trim(); if (!content || content.length > 1000) throw failure('INVALID_CONTENT', '문의 내용은 1~1,000자로 입력해 주세요.'); const inquiry = { id: id('inquiry'), fabric_id: f.id, fabric_title: f.title, content, is_private: input.is_private === true, answer: null, created_at: today() }; state.inquiries.unshift(inquiry); save(); return clone(inquiry); },
    async createReservation(input) { role('BUYER'); const f = getFabric(input.fabric_id); validateReservation(f, input, state.reservations); const length = f.sale_type === 'ROLL' ? Number(input.requested_length_cm) : null; const reservation = { id: id('reservation'), fabric_id: f.id, fabric_title: f.title, buyer_id: state.buyer.id, buyer_nickname: state.buyer.nickname, seller_id: f.seller_id, sale_type: f.sale_type, requested_length_cm: length, pickup_date: input.pickup_date, pickup_time: input.pickup_time, memo: String(input.memo || ''), status: 'REQUESTED', estimated_price: length ? length / 90 * f.price : null, display_price: length ? length / 90 * f.price : f.price, created_at: today() }; state.reservations.unshift(reservation); save(); return clone(reservation); },
    async cancelReservation(reservationId) { role('BUYER'); return this.updateReservation(reservationId, 'CANCELED'); },
    async updateReservation(reservationId, status, reason = '') {
      const r = state.reservations.find(r => r.id === reservationId);
      if (!r) throw failure('NOT_FOUND', '예약을 찾을 수 없어요.');
      const f = getFabric(r.fabric_id);
      if (status === 'CANCELED') {
        if (!['BUYER', 'SELLER'].includes(state.session.role)) throw failure('FORBIDDEN', '예약 당사자만 취소할 수 있어요.');
        if (state.session.role === 'SELLER' && r.status !== 'ACCEPTED') throw failure('INVALID_STATUS', '판매자는 수락한 예약만 취소할 수 있어요.');
      } else role('SELLER');
      if (state.session.role === 'SELLER' && f.seller_id !== state.seller.id) throw failure('FORBIDDEN', '내 매장의 예약만 처리할 수 있어요.');
      if (state.session.role === 'BUYER' && r.buyer_id !== state.buyer.id) throw failure('FORBIDDEN', '내 예약만 취소할 수 있어요.');
      if (status === 'REJECTED' && (!String(reason).trim() || String(reason).length > 255)) throw failure('REASON_REQUIRED', '거절 사유를 1~255자로 입력해 주세요.');
      if (status === 'ACCEPTED' && f.status !== 'POSTED') throw failure('FABRIC_NOT_AVAILABLE', '현재 판매 중인 원단의 예약만 수락할 수 있어요.');
      if (status === 'ACCEPTED' && f.sale_type === 'SCRAP' && state.reservations.some(other => other.id !== r.id && other.fabric_id === f.id && other.status === 'ACCEPTED')) throw failure('SCRAP_ALREADY_RESERVED', '이미 수락된 예약이 있는 자투리 원단이에요.');
      const next = transitionReservation(r, status, f);
      Object.assign(r, next.reservation, status === 'REJECTED' ? { reject_reason: String(reason).trim() } : status === 'CANCELED' ? { canceled_by: state.session.role, canceled_at: new Date().toISOString() } : {});
      Object.assign(f, next.fabric);
      if (status === 'PICKED_UP' && f.status === 'SOLD_OUT') state.reservations.filter(other => other.id !== r.id && other.fabric_id === f.id && other.status === 'REQUESTED').forEach(other => { other.status='REJECTED'; other.reject_reason='판매 완료'; });
      save(); return clone(r);
    },
    async saveStore(values) { role('SELLER'); const next = { ...state.store, ...values }; if (!String(next.store_name || '').trim() || !String(next.address || '').trim()) throw failure('INVALID_INPUT', '매장 이름과 주소를 입력해 주세요.'); state.store = next; state.seller.hasStore = true; state.fabrics.filter(f => f.seller_id === state.seller.id).forEach(f => { f.store_name = next.store_name; }); syncSeller(); save(); return clone(next); },
    async saveDraft(values) { role('SELLER'); assertRegistration(state.seller); state.draft = clone(values); if (state.upload?.stage === 'DONE') state.upload = null; save(); return clone(state.draft); },
    async createFabric() { role('SELLER'); assertRegistration(state.seller); if (state.upload) throw failure('CREATE_UNRESOLVED', '앞선 등록 결과를 먼저 확인해 주세요. 같은 원단을 다시 등록하지 않아요.'); const draft = validateFabric(state.draft); const f = { ...draft, id: id('fabric'), status: 'PENDING', seller_id: state.seller.id, store_name: state.store.store_name, reserved_length_cm: 0, available_length_cm: draft.remaining_length_cm, texture: draft.texture || 'canvas', image_url: null, photos: [], reject_reason: null, created_at: today() }; state.fabrics.unshift(f); state.upload = { fabric_id: f.id, stage: state.demo.createResult === 'UNKNOWN' ? 'UNKNOWN' : 'UPLOADING', failed_count: 0, photo_names: [...(draft.photo_names || [])] }; save(); return clone(f); },
    async uploadPhotos() { role('SELLER'); if (!state.upload || state.upload.stage === 'UNKNOWN') throw failure('CREATE_UNRESOLVED', '내 원단 목록에서 등록 결과를 먼저 확인해 주세요.'); if (state.upload.stage !== 'UPLOADING') return clone(state.upload); const f = getFabric(state.upload.fabric_id); const names = state.upload.photo_names || []; const failed = state.demo.uploadResult === 'PARTIAL' && names.length > 0; state.upload.stage = failed ? 'PARTIAL' : 'DONE'; state.upload.failed_count = failed ? 1 : 0; f.photos = failed ? names.slice(0, -1) : [...names]; save(); return clone(state.upload); },
    async retryPhotos() { role('SELLER'); if (!state.upload || state.upload.stage !== 'PARTIAL') throw failure('INVALID_STATUS', '다시 올릴 사진이 없어요.'); getFabric(state.upload.fabric_id).photos = [...(state.upload.photo_names || [])]; state.upload.stage = 'DONE'; state.upload.failed_count = 0; save(); return clone(state.upload); },
    async reviewSeller(sellerId, status) { role('ADMIN'); const s = state.sellers.find(s => s.id === sellerId); if (!s) throw failure('NOT_FOUND', '판매자를 찾을 수 없어요.'); if (!['APPROVED', 'REJECTED'].includes(status) || s.seller_approval_status === 'APPROVED' || (status === 'REJECTED' && s.seller_approval_status !== 'PENDING')) throw failure('INVALID_STATUS', '현재 상태에서 허용되지 않는 승인 처리예요.'); s.seller_approval_status = status; if (s.id === state.seller.id) state.seller.seller_approval_status = status; save(); return clone(s); },
    async reviewFabric(fabricId, status, reason = '') {
      role('ADMIN'); adminResult(); const f = getFabric(fabricId);
      if (f.status !== 'PENDING' || !['POSTED', 'REJECTED'].includes(status)) throw failure('INVALID_STATUS', '승인 대기 원단만 처리할 수 있어요.');
      if (status === 'POSTED' && !f.photos?.length) throw failure('IMAGE_REQUIRED', '사진이 한 장 이상 등록된 원단만 게시 승인할 수 있어요.');
      if (status === 'REJECTED' && (!String(reason).trim() || String(reason).length > 255)) throw failure('REASON_REQUIRED', '원단 게시 거절 사유를 1~255자로 입력해 주세요.');
      f.status = status; f.reject_reason = status === 'REJECTED' ? String(reason).trim() : null; save(); return clone(f);
    },
  };
}
