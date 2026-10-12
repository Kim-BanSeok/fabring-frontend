import { formatPrice, formatLength } from '../../lib/format.js';

export const SELLER_RESERVATION_STATUS = { REQUESTED: '요청됨', ACCEPTED: '수락됨', PICKED_UP: '수령 완료', REJECTED: '거절됨', CANCELED: '취소됨' };
export const SELLER_RESERVATION_ACTIONS = {
  ACCEPTED: { node: '127:7558', title: '예약을 수락할까요?', label: '확인 후 수락', notice: '수락하면 요청 수량이 확보돼요. 실제 재고는 수령 완료 시 차감됩니다.', success: '예약을 수락했어요.' },
  REJECTED: { node: '127:7692', title: '예약 거절 사유를 입력해 주세요', label: '거절 확정', notice: '거절 사유는 구매자에게 표시돼요. 이 요청으로 확보되거나 차감되는 재고는 없습니다.', success: '예약을 거절했어요.' },
  PICKED_UP: { node: '127:7829', title: '원단 전달을 완료했나요?', label: '전달 완료 · 수령 확인', notice: '전달한 원단은 실물 재고에서 차감됩니다. 수령 완료 후에는 예약을 취소할 수 없어요.', success: '수령 완료로 처리했어요.' },
  CANCELED: { node: '127:7974', title: '예약을 취소할까요?', label: '예약 취소 확정', notice: '취소하면 이 예약에 확보한 원단이 다시 판매 가능한 상태로 돌아갑니다.', success: '예약을 취소했어요.' },
};
export const sellerCanProcess = (status, next) => (status === 'REQUESTED' ? ['ACCEPTED', 'REJECTED'] : status === 'ACCEPTED' ? ['PICKED_UP', 'CANCELED'] : []).includes(next);
export const sellerReservationPrice = item => item.display_price == null ? '예약 금액 정보 없음' : formatPrice(item.display_price);
export const sellerReservationQuantity = item => item.sale_type === 'ROLL' ? formatLength(item.requested_length_cm) : '자투리 한 장 전체';
export const sellerRejectDraftKey = id => `seller:reservation-reject:${id}`;
export const sellerResultKey = id => `seller:reservation-result:${id}`;
const allowedQuery = ['status', 'fabric', 'fabric_id', 'page', 'size', 'id', 'mode'];
const safeReturn = value => value && !/[\\#\r\n]/.test(value) && value.split('?')[0] === '/seller/reservations' ? value : '';
export function sellerReservationReturn(ctx) {
  if (ctx.path === '/seller/reservations') return sellerReservationRoute(ctx);
  return safeReturn(ctx.query.get('return')) || '/seller/reservations';
}
export function sellerReservationRoute(ctx, changes = {}) {
  const base = ctx.path === '/seller/reservations' ? ctx.query : new URLSearchParams(safeReturn(ctx.query.get('return')).split('?')[1]);
  const query = new URLSearchParams(allowedQuery.filter(key => base.has(key)).map(key => [key, base.get(key)]));
  for (const [key, value] of Object.entries(changes)) {
    if (!allowedQuery.includes(key)) continue;
    if (value == null || value === '') query.delete(key); else query.set(key, String(value));
  }
  return `/seller/reservations${query.size ? `?${query}` : ''}`;
}
export function sellerReservationRequest(ctx) {
  const query = {};
  const status = ctx.query.get('status') || 'REQUESTED';
  if (status !== 'ALL') query.status = status;
  const fabric = ctx.query.get('fabric_id') || ctx.query.get('fabric');
  if (fabric) query.fabric_id = fabric;
  for (const key of ['page', 'size']) if (ctx.query.has(key)) query[key] = ctx.query.get(key);
  return { kind: 'list', query };
}
export const sellerReservationDetailPath = (ctx, id) => sellerReservationRoute(ctx, { id });
export function sellerReservationConfirmPath(ctx, item, next) {
  const query = new URLSearchParams({ id: item.id, action: next, return: sellerReservationDetailPath(ctx, item.id) });
  return `/seller/reservations/confirm?${query}`;
}
export const sellerReservationResultPath = (ctx, item, next) => sellerReservationRoute(ctx, { status: next, id: item.id, page: 0 });

// API 28 supplies a reservation's requested quantity, not overall roll stock.
// Explain the effect of this operation without inventing remaining/reserved totals.
export function sellerStockEffect(item, next) {
  const quantity = sellerReservationQuantity(item);
  return {
    ACCEPTED: `${quantity}를 이 예약에 확보합니다. 실물 재고는 아직 차감하지 않습니다.`,
    REJECTED: '이 요청으로 확보하거나 차감하는 재고는 없습니다.',
    PICKED_UP: `${quantity}를 전달한 것으로 처리하고 실물 재고에 반영합니다.`,
    CANCELED: `${quantity}에 대한 예약 확보를 해제합니다.`,
  }[next] || '';
}
export function sellerReservationFailure(failure) {
  if (!failure) return null;
  if (failure.outcomeUnknown) return { locked: true, title: '처리 결과를 아직 확인하지 못했어요', message: '같은 처리를 다시 보내기 전에 예약 상태를 확인해 주세요. 서버에서 이미 처리되었을 수 있습니다.' };
  const messages = {
    INVALID_STATUS: ['예약이나 원단 상태가 바뀌었어요', '다른 사람이 처리했거나 원단 상태가 변경되었을 수 있어요. 현재 예약 상태를 확인해 주세요.'],
    INSUFFICIENT_LENGTH: ['요청 수량을 확보할 수 없어요', '수락된 예약과 실물 재고를 확인해 주세요. 이 요청은 수락되지 않았습니다.'],
    SCRAP_ALREADY_RESERVED: ['이미 예약 중인 자투리예요', '이 원단에 다른 수락된 예약이 있어요. 예약 내역을 확인해 주세요.'],
    FORBIDDEN: ['이 예약을 처리할 권한이 없어요', '내 매장에 들어온 예약인지 확인해 주세요.'],
    NOT_FOUND: ['예약을 찾을 수 없어요', '받은 예약 목록에서 현재 내역을 확인해 주세요.'],
  };
  const message = messages[failure.code];
  return message ? { locked: true, title: message[0], message: message[1] } : { locked: false, title: '처리 내용을 확인해 주세요', message: failure.message || '처리하지 못했어요. 입력 내용을 확인해 주세요.' };
}
export async function processSellerReservation(api, item, next, reason, signal) {
  if (!sellerCanProcess(item.status, next)) throw Object.assign(new Error('현재 상태에서는 처리할 수 없어요.'), { code: 'INVALID_STATUS', status: 409 });
  if (next === 'ACCEPTED') return api.acceptReservation(item.id, {}, { signal });
  if (next === 'REJECTED') {
    const content = String(reason || '').trim();
    if (!content || content.length > 255) throw Object.assign(new Error('거절 사유를 1~255자로 입력해 주세요.'), { code: 'VALIDATION_ERROR', status: 400 });
    return api.rejectReservation(item.id, content, { signal });
  }
  if (next === 'PICKED_UP') return api.confirmPickup(item.id, { signal });
  return api.cancelReservation(item.id, { signal });
}
