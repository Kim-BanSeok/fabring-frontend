import { formatPrice } from '../lib/format.js';
import { fabricFilterLabel } from '../services/fabric-contract.js';

export const STATUS = { REQUESTED: '요청됨', ACCEPTED: '수락됨', PICKED_UP: '수령 완료', CANCELED: '취소', REJECTED: '거절' };
export const STATUS_DESCRIPTION = {
  REQUESTED: '판매자가 요청을 확인 중이에요. 아직 원단이 확보되지 않았어요.',
  ACCEPTED: '판매자가 수락했어요. 약속한 시간에 방문해 주세요.',
  PICKED_UP: '원단 수령이 완료되었어요.', CANCELED: '예약이 취소되었어요.', REJECTED: '판매자가 이 요청을 수락하지 못했어요.',
};
export const price = value => formatPrice(Number(value) || 0);
export const routeId = ctx => { try { return ctx.resolvedFabricId || decodeURIComponent(ctx.path.split('/')[3] || ''); } catch { return ''; } };
export const href = path => `#${path}`;
export const fabricRoute = id => `/buyer/fabrics/${encodeURIComponent(id)}`;
export const quantityText = cm => Number(cm) % 90 === 0 ? `${Number(cm) / 90}마(${Number(cm)}cm)` : `${Number(cm)}cm`;
export const dimensions = fabric => {
  const sheets = fabric.available_sheet_count ?? fabric.sheet_count;
  return fabric.sale_type === 'ROLL' ? `폭 ${fabric.width_cm}cm · 구매 가능 ${quantityText(fabric.available_length_cm ?? 0)}` : `폭 ${fabric.width_cm}cm × 길이 ${fabric.length_cm}cm${sheets ? ` · 남은 ${sheets}장` : ''}`;
};
export const priceText = fabric => `${price(fabric.price)} / ${fabric.sale_type === 'ROLL' ? '1마(90cm)' : '한 장'}`;
export const dateText = value => String(value || '').replaceAll('-', '.');
export const validDate = offset => {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const validDateKst = (offset, now = Date.now()) => {
  const date = new Date(now + 9 * 3600000);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
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
export const isExample = ctx => ctx.mode !== 'live' && ctx.query.get('example') === '1';
export const exampleQuery = ctx => isExample(ctx) ? '&example=1' : '';
const safeReservationReturn = value => value && !/[\\#\r\n]/.test(value) && value.split('?')[0] === '/buyer/reservations' ? value : '';
export const reservationListReturn = ctx => ctx.path === '/buyer/reservations' ? currentRoute(ctx) : safeReservationReturn(ctx.query.get('return'));
export const reservationPath = (item, suffix = '') => addQuery(`/buyer/reservations/${encodeURIComponent(item.id)}${suffix}${item.example ? `?status=${item.status}&example=1&fabric_id=${encodeURIComponent(item.fabric_id)}${item.viewSubset ? `&subset=${encodeURIComponent(item.viewSubset)}` : ''}` : ''}`, 'return', safeReservationReturn(item.list_return));
export const reservationQuantity = item => item.sale_type === 'ROLL' ? quantityText(item.requested_length_cm) : item.requested_sheet_count ? `${item.requested_sheet_count}장` : '자투리 한 장 전체';
export const reservationPriceText = item => item.display_price == null ? '예약 금액 정보 없음' : price(item.display_price);
export const submittedReservationKey = id => `buyer:submitted:${id}`;
export function reservationResourceRequest(ctx) {
  if (ctx.path === '/buyer/reservations') {
    const query = { status: ctx.query.get('status') || 'REQUESTED' };
    for (const name of ['page', 'size']) if (ctx.query.has(name)) query[name] = ctx.query.get(name);
    return { kind: 'list', query };
  }
  if (ctx.path.startsWith('/buyer/reservations/')) return { kind: 'detail', id: routeId(ctx) };
  if (ctx.path.startsWith('/buyer/pickup/') && ctx.query.has('submitted')) return { kind: 'detail', id: ctx.query.get('submitted') };
  return null;
}
export const reservationListPagePath = (ctx, page) => addQuery(`/buyer/reservations${ctx.query.size ? `?${ctx.query}` : ''}`, 'page', String(page));
export const submittedReservationMatches = (ctx, item) => /^\d+$/.test(routeId(ctx)) && String(Number(routeId(ctx))) === item.fabric_id;
export const reservationPreviewFabric = (item, state) => item.fabric || (item.source === 'api'
  // API 26 omits dimensions and sale_type. Its adapter infers SCRAP only from
  // a null requested_length_cm. Never borrow demo dimensions or a current price.
  ? { source: 'api', id: item.fabric_id, title: item.fabric_title, sale_type: item.sale_type, image_url: item.image_url, store_name: item.store_name, store: item.store }
  : state.fabrics.find(fabric => fabric.id === item.fabric_id));
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
  return (kind === 'pattern' ? ['/buyer/patterns', '/buyer/patterns/pouch'].includes(path) || /^\/buyer\/patterns\/\d+$/.test(path) : path === '/buyer/fabrics') ? value : '';
}
export const listReturn = ctx => ctx.path === '/buyer/fabrics' ? currentRoute(ctx) : internalReturn(ctx.query.get('return'), 'list');
export const keepList = (ctx, path) => addQuery(path, 'return', listReturn(ctx));
export const detailPath = (ctx, fabric) => keepList(ctx, fabricRoute(fabric.id));
export const pickupPath = (ctx, fabric) => keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}`);
export const listPath = (ctx, fabric) => listReturn(ctx) || `/buyer/fabrics?sale_type=${fabric.sale_type}`;
export const FILTER_NAMES = ['material', 'thickness', 'color'];
export const CATALOG_PAGE_SIZE = '12';
export const catalogSaleType = value => value === 'ROLL' ? 'ROLL' : value === 'SCRAP' ? 'SCRAP' : 'ALL';
export function fabricSaleTypePath(ctx, saleType) {
  return fabricSearchPath({ query: new URLSearchParams({ ...Object.fromEntries(ctx.query), sale_type: catalogSaleType(saleType) }) }, ctx.query.get('keyword') || '');
}
export function fabricSearchPath(ctx, keyword, sort) {
  const query = new URLSearchParams(ctx.query);
  query.set('sale_type', catalogSaleType(query.get('sale_type')));
  query.set('page', '0'); query.delete('view'); query.delete('collapsed');
  if (keyword.trim()) query.set('keyword', keyword.trim()); else query.delete('keyword');
  if (sort) query.set('sort', sort);
  return `/buyer/fabrics?${query}`;
}
export function filterDemoFabrics(items, query) {
  const keyword = (query.get('keyword') || '').trim().toLocaleLowerCase('ko-KR');
  const selected = items.filter(fabric => FILTER_NAMES.every(name => {
    const value = fabricFilterLabel(name, filterValue(query, name));
    return !value || fabric[name] === value;
  }) && (!keyword || [fabric.title, fabric.material, fabric.color].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR').includes(keyword)));
  const sort = query.get('sort');
  return selected.sort((a, b) => sort === 'price_asc' ? a.price - b.price : sort === 'price_desc' ? b.price - a.price : String(b.created_at).localeCompare(String(a.created_at)));
}
const LIST_QUERY_NAMES = ['sale_type', ...FILTER_NAMES, 'color_family', 'keyword', 'sort', 'page', 'size'];
const FILTER_QUERY_NAMES = [...FILTER_NAMES, 'color_family', 'keyword', 'sort', 'page', 'size'];
export function fabricResourceRequest(ctx) {
  if (ctx.path.startsWith('/buyer/pickup/') && ctx.query.has('submitted')) return null;
  if (ctx.path === '/buyer/home') return { kind: 'list', query: { sale_type: 'SCRAP', sort: 'latest', page: 0, size: 4 } };
  if (['/buyer', '/buyer/fabrics'].includes(ctx.path)) {
    const query = Object.fromEntries(LIST_QUERY_NAMES.filter(name => ctx.query.has(name)).map(name => [name, ctx.query.get(name)]));
    if (!query.sale_type) query.sale_type = 'ALL';
    if (!query.size) query.size = CATALOG_PAGE_SIZE;
    return { kind: 'list', query };
  }
  if (['/buyer/fabrics/', '/buyer/pickup/', '/buyer/recommendations/'].some(prefix => ctx.path.startsWith(prefix))) return { kind: 'detail', id: routeId(ctx) };
  if (['/buyer/patterns', '/buyer/patterns/pouch'].includes(ctx.path) || (ctx.path === '/buyer/inquiries' && ctx.query.get('compose') === '1')) return { kind: 'detail', id: ctx.query.get('fabric_id') || '' };
  return null;
}
export const fabricListPagePath = (ctx, page) => addQuery(`/buyer/fabrics${ctx.query.size ? `?${ctx.query}` : ''}`, 'page', String(page));
export function applyFilterPath(ctx, filters) {
  const query = new URLSearchParams({ sale_type: catalogSaleType(ctx.query.get('sale_type')), view: 'search' });
  for (const name of ['keyword', 'sort', 'size']) if (ctx.query.get(name)) query.set(name, ctx.query.get(name));
  for (const name of FILTER_NAMES) if (filters[name]) query.set(name, filters[name]);
  query.set('page', '0');
  return `/buyer/fabrics?${query}`;
}
export function filterResultPath(query) {
  const applied = new URLSearchParams({ sale_type: catalogSaleType(query.get('sale_type')) });
  for (const name of FILTER_QUERY_NAMES) if (query.get(name)) applied.set(name, query.get(name));
  applied.set('view', 'search');
  return `/buyer/fabrics?${applied}`;
}
// Cancellation restores the applied route, never the unsaved select values.
export const filterCancelPath = ctx => internalReturn(ctx.query.get('return'), 'list') || filterResultPath(ctx.query);
export const filterEditPath = ctx => {
  const query = new URLSearchParams({ sale_type: catalogSaleType(ctx.query.get('sale_type')) });
  for (const name of FILTER_QUERY_NAMES) if (ctx.query.get(name)) query.set(name, ctx.query.get(name));
  return addQuery(`/buyer/filters?${query}`, 'return', listReturn(ctx));
};
export const filterValue = (query, name) => query.get(name) || (name === 'color' ? query.get('color_family') : '') || '';
export const filterSummary = query => [query.get('sale_type') === 'ROLL' ? '롤' : query.get('sale_type') === 'ALL' ? '전체' : '자투리', ...FILTER_NAMES.map((name, i) => fabricFilterLabel(name, filterValue(query, name)) || ['전체 소재', '전체 두께', '전체 색상'][i]), ...(query.get('keyword') ? [`검색어: ${query.get('keyword')}`] : []), ...(query.get('sort') && query.get('sort') !== 'latest' ? [{ price_asc: '낮은 가격순', price_desc: '높은 가격순' }[query.get('sort')] || '정렬 조건 확인 필요'] : [])];
export function currentPickupStore(state, fabric) {
  if (fabric?.source === 'api') return fabric.store || null;
  if (!fabric || !state.store) return null;
  // The demo has one managed store. Do not attach its address to another seller's fabric.
  const matches = fabric.store_id ? fabric.store_id === state.store.id : fabric.seller_id && fabric.seller_id === state.seller?.id;
  return matches ? state.store : null;
}
export const storeAddress = store => [store?.address, store?.detail_address].filter(Boolean).join(' ');
export const reservationPrimaryAction = item => ({ path: reservationPath(item), label: item.status === 'ACCEPTED' ? '픽업 정보 보기' : '상세 보기' });
export function availability(ctx, fabric) {
  if (ctx.mode === 'live' || fabric.source === 'api') {
    const sheetsLeft = fabric.available_sheet_count;
    const available = fabric.status === 'POSTED' && (fabric.sale_type === 'ROLL' ? Number(fabric.available_length_cm) >= 90 : fabric.is_reserved === false && (sheetsLeft == null || sheetsLeft >= 1));
    return { own: null, canRequest: available, label: available ? '거래 가능' : fabric.is_reserved ? '예약 중' : '현재 요청 불가' };
  }
  const active = ctx.state.reservations.filter(item => item.fabric_id === fabric.id && ['REQUESTED', 'ACCEPTED'].includes(item.status));
  const own = active.find(item => item.buyer_id === ctx.state.buyer.id);
  const stockAvailable = fabric.sale_type === 'ROLL' ? Number(fabric.available_length_cm) >= 90 : !active.some(item => item.status === 'ACCEPTED');
  return { own, canRequest: stockAvailable && !own, label: own ? '내 예약 진행 중' : stockAvailable ? '거래 가능' : '현재 요청 불가' };
}
export const defectText = fabric => fabric.defect_note || (fabric.has_defect ? '하자가 있어요. 등록된 하자 설명은 없습니다.' : '등록된 하자 없음');
export function exampleReservation(ctx, id = 'demo-roll', fabricId) {
  const fabric = ctx.state.fabrics.find(f => f.id === (fabricId || (id.includes('scrap') ? 'fabric-scrap-1' : 'fabric-roll-1')));
  if (!fabric) return null;
  const requestedStatus = ctx.query.get('status') || 'REQUESTED';
  const status = Object.hasOwn(STATUS, requestedStatus) ? requestedStatus : 'REQUESTED';
  return { id, example: true, viewSubset: ['canvas', 'stripe'].includes(ctx.query.get('subset')) ? ctx.query.get('subset') : null, status, fabric_id: fabric.id, fabric_title: fabric.title, sale_type: fabric.sale_type, requested_length_cm: fabric.sale_type === 'ROLL' ? 180 : null, display_price: fabric.price * (fabric.sale_type === 'ROLL' ? 2 : 1), pickup_date: validDate(2), pickup_time: '14:00', memo: '', rejection_reason: '요청하신 시간에는 매장 방문 응대가 어렵습니다. 다른 일시로 다시 요청해 주세요.' };
}
export function selectedReservation(ctx) {
  if (ctx.reservationItem) return ctx.reservationItem;
  const id = routeId(ctx);
  return ctx.state.reservations.find(item => item.id === id) || (isExample(ctx) && ['demo-roll', 'demo-scrap'].includes(id) ? exampleReservation(ctx, id, ctx.query.get('fabric_id')) : null);
}
export const SUPPLY_STORES = Object.freeze([
  { id: '1', name: '루프 부자재 공방', short: '지퍼·실·단추', items: '지퍼, 실, 단추, 작은 봉제 도구', node: '127:5669', x: 25, y: 30 },
  { id: '2', name: '양주 만들기 상회', short: '끈·버클·손잡이', items: '가방 끈, 버클, 손잡이, 웨빙', node: '127:5731', x: 50, y: 65 },
  { id: '3', name: '그린 봉제 공방', short: '봉제 도구·안감', items: '봉제 도구, 안감, 심지, 재봉실', node: '127:5793', x: 74, y: 25 },
]);
