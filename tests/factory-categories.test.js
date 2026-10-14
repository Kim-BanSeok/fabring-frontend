import test from 'node:test';
import assert from 'node:assert/strict';
import { factoryArea, supplyCategoryCode, supplyCategoryCodes } from '../src/react/pages/factory-categories.js';

test('supply categories follow the product words and can overlap', () => {
  assert.deepEqual(supplyCategoryCodes('단추,파스너,지퍼'), ['BUTTON', 'ZIPPER', 'FASTENER']);
  assert.deepEqual(supplyCategoryCodes('자수,레이스'), ['LACE']);
  assert.deepEqual(supplyCategoryCodes('세폭직물(라벨지)'), ['TEXTILE_LABEL']);
  assert.deepEqual(supplyCategoryCodes('레이스웨이'), []);
  assert.equal(supplyCategoryCode('LACE'), 'LACE');
  assert.equal(supplyCategoryCode('FOOD'), '');
  assert.equal(factoryArea({ legal_dong: '경기도 양주시 광적면', address: '경기도 양주시 덕정동' }), '광적면');
  assert.equal(factoryArea({ address: '경기도 양주시 은현면 봉암리 44-0 101동' }), '은현면');
  assert.equal(factoryArea({ address: '경기도 양주시 회천1동 123' }), '회천1동');
});
