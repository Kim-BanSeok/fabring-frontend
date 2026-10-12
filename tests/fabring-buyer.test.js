import test from 'node:test';
import assert from 'node:assert/strict';
import { fabricSearchPath, fabricSaleTypePath, filterDemoFabrics, priceText } from '../src/react/pages/buyer-model.js';

test('switching scrap/roll keeps the search and filters while returning to page zero', () => {
  const ctx = { query: new URLSearchParams('sale_type=SCRAP&keyword=데님&color_family=BLUE&material=COTTON&page=4') };
  const query = new URL(fabricSaleTypePath(ctx, 'ROLL'), 'https://local.test').searchParams;
  assert.equal(query.get('sale_type'), 'ROLL'); assert.equal(query.get('keyword'), '데님');
  assert.equal(query.get('color_family'), 'BLUE'); assert.equal(query.get('material'), 'COTTON');
  assert.equal(query.get('page'), '0'); assert.equal(ctx.query.get('page'), '4');
});

test('catalog search preserves applied endpoint filters and resets the page', () => {
  const ctx = { query: new URLSearchParams('sale_type=ROLL&material=COTTON&color_family=NAVY&sort=price_desc&page=4&size=20&view=search&collapsed=1') };
  const query = new URL(fabricSearchPath(ctx, '  데님  '), 'https://local.test').searchParams;
  assert.equal(query.get('keyword'), '데님'); assert.equal(query.get('sale_type'), 'ROLL');
  assert.equal(query.get('material'), 'COTTON'); assert.equal(query.get('color_family'), 'NAVY');
  assert.equal(query.get('page'), '0'); assert.equal(query.get('size'), '20');
  assert.equal(query.has('collapsed'), false); assert.equal(query.has('view'), false);
  assert.equal(ctx.query.get('page'), '4', 'search does not mutate the previous route');
});
test('clearing the keyword and changing sort keep unrelated applied filters', () => {
  const ctx = { query: new URLSearchParams('keyword=데님&material=BLEND&page=3') };
  const query = new URL(fabricSearchPath(ctx, ' ', 'price_asc'), 'https://local.test').searchParams;
  assert.equal(query.has('keyword'), false); assert.equal(query.get('sort'), 'price_asc');
  assert.equal(query.get('material'), 'BLEND'); assert.equal(query.get('sale_type'), 'SCRAP');
});
const fabrics = [
  { id: 'blue', title: '블루 데님', material: '면', color: '블루', thickness: '두꺼움', price: 9000, created_at: '2026-10-10' },
  { id: 'linen', title: '린넨 혼방', material: '혼방', color: '베이지', thickness: '얇음', price: 5000, created_at: '2026-10-12' },
  { id: 'cotton', title: '코튼', material: '면', color: '네이비', thickness: '중간 두께', price: 7000, created_at: '2026-10-11' },
];
test('demo shortcuts interpret endpoint enums and combine keyword with color', () => {
  assert.deepEqual(filterDemoFabrics(fabrics, new URLSearchParams('material=COTTON&color_family=BLUE&keyword=데님')).map(f => f.id), ['blue']);
  assert.deepEqual(filterDemoFabrics(fabrics, new URLSearchParams('material=면&color=네이비')).map(f => f.id), ['cotton']);
  assert.deepEqual(filterDemoFabrics(fabrics, new URLSearchParams('keyword=없는원단')), []);
});
test('demo catalog price/latest sorting keeps seed and adapter arrays intact', () => {
  assert.deepEqual(filterDemoFabrics(fabrics, new URLSearchParams('sort=price_asc')).map(f => f.id), ['linen','cotton','blue']);
  assert.deepEqual(filterDemoFabrics(fabrics, new URLSearchParams('sort=latest')).map(f => f.id), ['linen','cotton','blue']);
  assert.deepEqual(fabrics.map(f => f.id), ['blue','linen','cotton']);
});
test('fabric prices always include the actual sale unit', () => {
  assert.equal(priceText({ price: 5000, sale_type: 'ROLL' }), '5,000원 / 1마(90cm)');
  assert.equal(priceText({ price: 9000, sale_type: 'SCRAP' }), '9,000원 / 한 장');
});
