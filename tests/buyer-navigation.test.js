import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEditPath, filterCancelPath, filterSummary, detailPath, listPath, reservationPrimaryAction, reservationPath, currentPickupStore, storeAddress, availability, defectText, fabricResourceRequest, fabricListPagePath, applyFilterPath, isExample } from '../src/react/pages/buyer-model.js';

const context = route => {
  const [path, query] = route.split('?');
  return { path, query: new URLSearchParams(query) };
};
const routeValue = route => { const { path, query } = context(route); return [path, [...query.entries()]]; };

test('filter cancel restores all applied conditions and the original result mode', () => {
  const original = '/buyer/fabrics?sale_type=SCRAP&material=면&thickness=얇음&color=블루&view=search&mode=demo';
  const edit = context(filterEditPath(context(original)));
  // Even an edited field cannot replace the entry route when cancelling.
  edit.query.set('color', '아이보리');
  assert.deepEqual(routeValue(filterCancelPath(edit)), routeValue(original));
});

test('cancel also preserves a collapsed list with no conditions', () => {
  const original = '/buyer/fabrics?sale_type=ROLL&collapsed=1';
  assert.equal(filterCancelPath(context(filterEditPath(context(original)))), original);
});

test('direct filter entry falls back to its existing conditions instead of resetting them', () => {
  const restored = context(filterCancelPath(context('/buyer/filters?sale_type=SCRAP&material=울&thickness=두꺼움&color=보라')));
  assert.equal(restored.path, '/buyer/fabrics');
  assert.deepEqual(filterSummary(restored.query), ['자투리', '울', '두꺼움', '보라']);
  assert.equal(restored.query.get('view'), 'search');
});

test('untrusted filter return destinations cannot leave the fabric list', () => {
  for (const value of ['https://example.com', '//example.com', '/seller/dashboard', '/buyer/fabrics#outside', '/buyer/fabrics\n']) {
    const ctx = context('/buyer/filters?sale_type=ROLL&material=혼방');
    ctx.query.set('return', value);
    assert.equal(filterCancelPath(ctx), '/buyer/fabrics?sale_type=ROLL&material=%ED%98%BC%EB%B0%A9&view=search');
  }
});

test('result → detail → list retains color and search conditions', () => {
  const original = '/buyer/fabrics?sale_type=ROLL&material=면&color=그린&view=search';
  const fabric = { id: 'fabric-check', sale_type: 'ROLL' };
  assert.deepEqual(routeValue(listPath(context(detailPath(context(original), fabric)), fabric)), routeValue(original));
});

test('accepted reservation primary action opens the exact reservation, not cancellation', () => {
  const item = { id: 'request/with space', status: 'ACCEPTED', fabric_id: 'fabric-roll-1' };
  assert.deepEqual(reservationPrimaryAction(item), { label: '픽업 정보 보기', path: '/buyer/reservations/request%2Fwith%20space' });
  assert.equal(reservationPath(item, '/cancel'), '/buyer/reservations/request%2Fwith%20space/cancel');
});

test('example accepted reservation retains its state and fabric on detail/cancel links', () => {
  const item = { id: 'demo-roll', status: 'ACCEPTED', fabric_id: 'fabric-check', example: true };
  const detail = context(reservationPrimaryAction(item).path);
  assert.equal(detail.query.get('status'), 'ACCEPTED');
  assert.equal(detail.query.get('fabric_id'), 'fabric-check');
  assert.equal(detail.query.get('example'), '1');
  assert.equal(context(reservationPath(item, '/cancel')).query.toString(), detail.query.toString());
});

test('pickup address is used only for the fabric’s associated store', () => {
  const state = { seller: { id: 'seller-1' }, store: { id: 'store-1', address: '양주시 예시로 10', detail_address: '1층' } };
  assert.equal(currentPickupStore(state, { seller_id: 'seller-1' }), state.store);
  assert.equal(currentPickupStore(state, { store_id: 'store-1', seller_id: 'seller-2' }), state.store);
  assert.equal(currentPickupStore(state, { seller_id: 'seller-2' }), null);
  assert.equal(currentPickupStore(state, { store_id: 'store-2', seller_id: 'seller-1' }), null);
  assert.equal(currentPickupStore(state, {}), null);
  assert.equal(storeAddress(state.store), '양주시 예시로 10 1층');
  assert.equal(storeAddress(null), '');
});


test('live list requests forward supported query fields without demo or return parameters', () => {
  const ctx = context('/buyer/fabrics?sale_type=ROLL&material=COTTON&color_family=BLUE&keyword=코튼&sort=price_desc&page=2&size=10&example=1&return=/preview');
  assert.deepEqual(fabricResourceRequest(ctx), { kind: 'list', query: { sale_type: 'ROLL', material: 'COTTON', color_family: 'BLUE', keyword: '코튼', sort: 'price_desc', page: '2', size: '10' } });
  assert.deepEqual(fabricResourceRequest(context('/buyer/home')), { kind: 'list', query: { sale_type: 'SCRAP', sort: 'latest', page: 0, size: 4 } });
  assert.equal(fabricResourceRequest(context('/buyer/filters?material=면')), null);
});

test('detail and every fabric-dependent direct route request their own fabric ID', () => {
  for (const route of ['/buyer/fabrics/17', '/buyer/pickup/17', '/buyer/recommendations/17', '/buyer/patterns/pouch?fabric_id=17', '/buyer/inquiries?compose=1&fabric_id=17']) {
    assert.deepEqual(fabricResourceRequest(context(route)), { kind: 'detail', id: '17' });
  }
  assert.deepEqual(fabricResourceRequest(context('/buyer/patterns')), { kind: 'detail', id: '' });
  assert.equal(fabricResourceRequest(context('/buyer/inquiries')), null);
});

test('server page, keyword, and sort survive result → detail → list and filter cancellation', () => {
  const original = '/buyer/fabrics?sale_type=ROLL&material=COTTON&color_family=BLUE&keyword=코튼&sort=price_desc&page=2&size=10&view=search';
  const next = context(fabricListPagePath(context(original), 3));
  assert.equal(next.query.get('page'), '3');
  assert.equal(next.query.get('keyword'), '코튼');
  assert.equal(next.query.get('sort'), 'price_desc');
  assert.equal(next.query.get('size'), '10');
  assert.equal(next.query.get('color_family'), 'BLUE');
  const fabric = { id: '17', sale_type: 'ROLL' };
  assert.deepEqual(routeValue(listPath(context(detailPath(context(original), fabric)), fabric)), routeValue(original));
  assert.deepEqual(routeValue(filterCancelPath(context(filterEditPath(context(original))))), routeValue(original));
});

test('applying edited filters starts page zero and retains keyword, sort, and size', () => {
  const ctx = context('/buyer/filters?sale_type=ROLL&material=COTTON&color_family=BLUE&keyword=코튼&sort=price_asc&page=3&size=10');
  const result = context(applyFilterPath(ctx, { material: '면', color: '', thickness: '중간 두께' }));
  assert.deepEqual(Object.fromEntries(result.query), { sale_type: 'ROLL', view: 'search', keyword: '코튼', sort: 'price_asc', size: '10', material: '면', thickness: '중간 두께', page: '0' });
  assert.deepEqual(filterSummary(ctx.query), ['롤', '면', '전체 두께', '블루', '검색어: 코튼', '낮은 가격순']);
});

test('live availability uses server reserved/available values instead of empty local reservation arrays', () => {
  const ctx = { mode: 'live', state: { reservations: [], buyer: { id: 'buyer-1' } } };
  const scrap = { source: 'api', status: 'POSTED', sale_type: 'SCRAP', is_reserved: true };
  assert.deepEqual(availability(ctx, scrap), { own: null, canRequest: false, label: '예약 중' });
  assert.equal(availability(ctx, { ...scrap, is_reserved: false }).canRequest, true);
  assert.equal(availability(ctx, { ...scrap, status: 'SOLD_OUT', is_reserved: false }).canRequest, false);
  assert.equal(availability(ctx, { ...scrap, sale_type: 'ROLL', available_length_cm: 50 }).canRequest, false);
  assert.equal(availability(ctx, { ...scrap, sale_type: 'ROLL', available_length_cm: 720 }).canRequest, true);
});

test('live detail uses its embedded public store and never assigns the logged-in seller’s store', () => {
  const state = { store: { id: '1', address: '로그인한 매장' }, seller: { id: '1' } };
  const store = { id: '2', address: '실제 원단의 판매처' };
  assert.equal(currentPickupStore(state, { source: 'api', seller_id: '1', store_id: '1' }), null);
  assert.equal(currentPickupStore(state, { source: 'api', store }), store);
  assert.equal(defectText({ has_defect: true, defect_note: null }), '하자가 있어요. 등록된 하자 설명은 없습니다.');
  assert.equal(isExample({ mode: 'live', query: new URLSearchParams('example=1') }), false);
});
