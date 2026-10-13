// Framework-independent rules. Reuse these in React; the server remains authoritative.
export function failure(code, message) { return Object.assign(new Error(message), { code }); }
export function canRegister(seller) { return seller.seller_approval_status === 'APPROVED' && seller.hasStore; }
export function assertRegistration(seller) {
  if (seller.seller_approval_status !== 'APPROVED') throw failure('SELLER_NOT_APPROVED', '운영팀의 판매자 승인 후 원단을 등록할 수 있어요.');
  if (!seller.hasStore) throw failure('STORE_REQUIRED', '매장 정보를 먼저 등록해 주세요.');
}
export function validateFabric(draft) {
  if (!draft || !String(draft.title || '').trim()) throw failure('INVALID_INPUT', '원단 이름을 입력해 주세요.');
  if (String(draft.title).trim().length > 100) throw failure('INVALID_INPUT', '원단 이름은 100자 이하로 입력해 주세요.');
  if (!['SCRAP', 'ROLL'].includes(draft.sale_type)) throw failure('INVALID_INPUT', '판매 형태를 선택해 주세요.');
  if (!Number.isInteger(Number(draft.width_cm)) || Number(draft.width_cm) < 1 || Number(draft.width_cm) > 1000) throw failure('INVALID_INPUT', '폭을 1~1,000cm의 정수로 입력해 주세요.');
  if (!Number.isInteger(Number(draft.price)) || Number(draft.price) <= 0) throw failure('INVALID_INPUT', '가격을 1원 이상의 정수로 입력해 주세요.');
  const length = Number(draft.sale_type === 'ROLL' ? draft.remaining_length_cm : draft.length_cm);
  if (!Number.isInteger(length) || length < 1 || (draft.sale_type === 'ROLL' && length < 90)) throw failure('INVALID_LENGTH', draft.sale_type === 'ROLL' ? '롤 잔량은 90cm 이상의 정수로 입력해 주세요.' : '자투리 길이는 1cm 이상의 정수로 입력해 주세요.');
  if ((draft.has_defect && !String(draft.defect_note || '').trim()) || String(draft.defect_note || '').length > 255) throw failure('INVALID_INPUT', '하자 설명은 1~255자로 입력해 주세요.');
  if ((draft.photo_names || []).length > 3) throw failure('TOO_MANY_PHOTOS', '사진은 최대 3장까지 선택할 수 있어요.');
  return { ...draft, title: String(draft.title).trim(), width_cm: Number(draft.width_cm), price: Number(draft.price), length_cm: draft.sale_type === 'SCRAP' ? length : null, remaining_length_cm: draft.sale_type === 'ROLL' ? length : null };
}
export function validateReservation(fabric, input, reservations) {
  if (!fabric || fabric.status !== 'POSTED') throw failure('FABRIC_NOT_AVAILABLE', '지금은 요청할 수 없는 원단이에요. 목록에서 다른 원단을 확인해 주세요.');
  const active = reservations.filter(r => r.fabric_id === fabric.id && ['REQUESTED', 'ACCEPTED'].includes(r.status));
  if (active.some(r => r.buyer_id === 'buyer-1')) throw failure('DUPLICATE_RESERVATION', '이미 보낸 예약이 있어요. 구매내역에서 확인해 주세요.');
  if (fabric.sale_type === 'SCRAP' && active.some(r => r.status === 'ACCEPTED')) throw failure('SCRAP_ALREADY_RESERVED', '이미 예약 중인 자투리 원단이에요. 다른 원단을 확인해 주세요.');
  if (fabric.sale_type === 'ROLL') {
    const length = Number(input.requested_length_cm);
    if (!Number.isInteger(length) || length < 90 || length % 90) throw failure('INVALID_LENGTH', '구매 요청 길이는 90cm(1마) 단위로 선택해 주세요.');
    if (length > fabric.available_length_cm) throw failure('INSUFFICIENT_LENGTH', '구매 가능 길이가 바뀌었어요. 수량을 다시 확인해 주세요.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.pickup_date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.pickup_time || '')) throw failure('INVALID_DATE', '희망 픽업 날짜와 시간을 입력해 주세요.');
  const [year, month, day] = input.pickup_date.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw failure('INVALID_DATE', '올바른 희망 픽업 날짜를 입력해 주세요.');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (date < today) throw failure('INVALID_DATE', '오늘 이후의 희망 날짜를 선택해 주세요.');
}
export function transitionReservation(reservation, next, fabric) {
  const allowed = { REQUESTED: ['ACCEPTED', 'REJECTED', 'CANCELED'], ACCEPTED: ['CANCELED', 'PICKED_UP'] };
  if (!allowed[reservation.status]?.includes(next)) throw failure('INVALID_STATUS', '현재 예약 상태에서는 이 작업을 할 수 없어요.');
  const roll = fabric.sale_type === 'ROLL';
  const length = reservation.requested_length_cm || 0;
  if (next === 'ACCEPTED' && roll && length > fabric.available_length_cm) throw failure('INSUFFICIENT_LENGTH', '수락 가능한 원단 길이가 부족해요.');
  const result = { ...fabric };
  if (roll && next === 'ACCEPTED') result.reserved_length_cm += length;
  if (roll && reservation.status === 'ACCEPTED' && ['CANCELED', 'PICKED_UP'].includes(next)) result.reserved_length_cm -= length;
  if (roll && next === 'PICKED_UP') result.remaining_length_cm -= length;
  if (roll) result.available_length_cm = result.remaining_length_cm - result.reserved_length_cm;
  if (next === 'PICKED_UP' && (!roll || result.remaining_length_cm < 90)) result.status = 'SOLD_OUT';
  return { reservation: { ...reservation, status: next }, fabric: result };
}
