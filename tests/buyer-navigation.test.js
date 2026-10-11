import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEditPath, filterCancelPath, filterSummary, detailPath, listPath, reservationPrimaryAction, reservationPath, currentPickupStore, storeAddress } from '../src/react/pages/buyer-model.js';

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
