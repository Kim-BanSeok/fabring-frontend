import { formatPrice } from '../lib/format.js';

export const STATUS = { REQUESTED: '요청됨', ACCEPTED: '수락됨', PICKED_UP: '수령 완료', CANCELED: '취소', REJECTED: '거절' };
export const STATUS_DESCRIPTION = {
  REQUESTED: '판매자가 요청을 확인 중이에요. 아직 원단이 확보되지 않았어요.',
  ACCEPTED: '판매자가 수락했어요. 약속한 시간에 방문해 주세요.',
  PICKED_UP: '원단 수령이 완료되었어요.', CANCELED: '예약이 취소되었어요.', REJECTED: '판매자가 이 요청을 수락하지 못했어요.',
};
export const price = value => formatPrice(Number(value) || 0);
export const routeId = ctx => { try { return decodeURIComponent(ctx.path.split('/')[3] || ''); } catch { return ''; } };
export const href = path => `#${path}`;
export const fabricRoute = id => `/buyer/fabrics/${encodeURIComponent(id)}`;
export const quantityText = cm => Number(cm) % 90 === 0 ? `${Number(cm) / 90}마(${Number(cm)}cm)` : `${Number(cm)}cm`;
export const dimensions = fabric => fabric.sale_type === 'ROLL' ? `폭 ${fabric.width_cm}cm · 구매 가능 ${quantityText(fabric.available_length_cm ?? 0)}` : `폭 ${fabric.width_cm}cm × 길이 ${fabric.length_cm}cm`;
export const priceText = fabric => `${price(fabric.price)}${fabric.sale_type === 'ROLL' ? ' / 마' : ''}`;
export const dateText = value => String(value || '').replaceAll('-', '.');
export const validDate = offset => {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const FABRIC_NODES = {
  'fabric-roll-1': ['123:1201', '123:1493', '127:2936'],
  'fabric-scrap-1': ['127:2994', '127:3092', '127:3190'],
  'fabric-gauze': ['127:3248', '127:3339', '127:3437'],
  'fabric-check': ['127:3495', '127:3586', '127:3684'],
  'fabric-denim': ['127:3742', '127:3833', '127:3931'],
  'fabric-scrap-2': ['127:3989', '127:4080', '127:4178'],
};
export const fabricNode = (fabric, index) => FABRIC_NODES[fabric.id]?.[index] || FABRIC_NODES['fabric-roll-1'][index];
export const statusTone = status => status === 'REQUESTED' ? 'amber' : status === 'REJECTED' ? 'red' : ['CANCELED', 'PICKED_UP'].includes(status) ? 'gray' : 'green';
export const isExample = ctx => ctx.query.get('example') === '1';
export const exampleQuery = ctx => isExample(ctx) ? '&example=1' : '';
export const reservationPath = (item, suffix = '') => `/buyer/reservations/${encodeURIComponent(item.id)}${suffix}${item.example ? `?status=${item.status}&example=1&fabric_id=${encodeURIComponent(item.fabric_id)}${item.viewSubset ? `&subset=${encodeURIComponent(item.viewSubset)}` : ''}` : ''}`;
export const reservationQuantity = item => item.sale_type === 'ROLL' ? quantityText(item.requested_length_cm) : '자투리 한 장 전체';
export const draftKey = (kind, id) => `buyer:${kind}:${id}`;
export const currentRoute = ctx => `${ctx.path}${ctx.query.size ? `?${ctx.query}` : ''}`;
export const addQuery = (path, key, value) => {
  const [base, search = ''] = path.split('?'); const query = new URLSearchParams(search);
  if (value) query.set(key, value);
  return `${base}${query.size ? `?${query}` : ''}`;
};
export function internalReturn(value, kind) {
  if (!value || /[\\#\r\n]/.test(value)) return '';
  const path = value.split('?')[0];
  return (kind === 'pattern' ? ['/buyer/patterns', '/buyer/patterns/pouch'].includes(path) : path === '/buyer/fabrics') ? value : '';
}
export const listReturn = ctx => ctx.path === '/buyer/fabrics' ? currentRoute(ctx) : internalReturn(ctx.query.get('return'), 'list');
export const keepList = (ctx, path) => addQuery(path, 'return', listReturn(ctx));
export const detailPath = (ctx, fabric) => keepList(ctx, fabricRoute(fabric.id));
export const pickupPath = (ctx, fabric) => keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}`);
export const listPath = (ctx, fabric) => listReturn(ctx) || `/buyer/fabrics?sale_type=${fabric.sale_type}`;
export function availability(ctx, fabric) {
  const active = ctx.state.reservations.filter(item => item.fabric_id === fabric.id && ['REQUESTED', 'ACCEPTED'].includes(item.status));
  const own = active.find(item => item.buyer_id === ctx.state.buyer.id);
  const stockAvailable = fabric.sale_type === 'ROLL' ? Number(fabric.available_length_cm) >= 90 : !active.some(item => item.status === 'ACCEPTED');
  return { own, canRequest: stockAvailable && !own, label: own ? '내 예약 진행 중' : stockAvailable ? '거래 가능' : '현재 요청 불가' };
}
export function exampleReservation(ctx, id = 'demo-roll', fabricId) {
  const fabric = ctx.state.fabrics.find(f => f.id === (fabricId || (id.includes('scrap') ? 'fabric-scrap-1' : 'fabric-roll-1')));
  if (!fabric) return null;
  const requestedStatus = ctx.query.get('status') || 'REQUESTED';
  const status = Object.hasOwn(STATUS, requestedStatus) ? requestedStatus : 'REQUESTED';
  return { id, example: true, viewSubset: ['canvas', 'stripe'].includes(ctx.query.get('subset')) ? ctx.query.get('subset') : null, status, fabric_id: fabric.id, fabric_title: fabric.title, sale_type: fabric.sale_type, requested_length_cm: fabric.sale_type === 'ROLL' ? 180 : null, display_price: fabric.price * (fabric.sale_type === 'ROLL' ? 2 : 1), pickup_date: validDate(2), pickup_time: '14:00', memo: '', rejection_reason: '요청하신 시간에는 매장 방문 응대가 어렵습니다. 다른 일시로 다시 요청해 주세요.' };
}
export function selectedReservation(ctx) {
  const id = routeId(ctx);
  return ctx.state.reservations.find(item => item.id === id) || (isExample(ctx) && ['demo-roll', 'demo-scrap'].includes(id) ? exampleReservation(ctx, id, ctx.query.get('fabric_id')) : null);
}
export const SUPPLY_STORES = Object.freeze([
  { id: '1', name: '루프 부자재 공방', short: '지퍼·실·단추', items: '지퍼, 실, 단추, 작은 봉제 도구', node: '127:5669', x: 25, y: 30 },
  { id: '2', name: '양주 만들기 상회', short: '끈·버클·손잡이', items: '가방 끈, 버클, 손잡이, 웨빙', node: '127:5731', x: 50, y: 65 },
  { id: '3', name: '그린 봉제 공방', short: '봉제 도구·안감', items: '봉제 도구, 안감, 심지, 재봉실', node: '127:5793', x: 74, y: 25 },
]);
