import test from 'node:test';
import assert from 'node:assert/strict';
import { startPatternRequest } from '../src/react/hooks/usePatternResource.js';
import { internalReturn, detailPath, listReturn } from '../src/react/pages/buyer-model.js';
import { patternDetailPath, patternPickupPath, recommendationPath, selectedRecommendation, recommendationPurchase, recommendedPickupIssue, patternListReturn } from '../src/react/pages/buyer-pattern-model.js';

const context = route => { const [path, query] = route.split('?'); return { path, query: new URLSearchParams(query) }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const result = { available: true, items: [{ pattern_id: '7', judgement: 'SUITABLE', yards: 3, purchase_length_cm: 270, required_length_cm: 195, estimated_price: 9000 }] };

test('recommended detail and pickup retain the original fabric result filter without trusting a ma parameter', () => {
  const original = '/buyer/fabrics?sale_type=ROLL&keyword=면&page=2&size=4';
  const detail = context(detailPath(context(original), { id: '5' }));
  const recommendations = context(recommendationPath(detail, '5'));
  const pattern = context(patternDetailPath(recommendations, '7', '5'));
  const pickup = context(patternPickupPath(pattern, '5', '7'));
  assert.equal(decodeURI(listReturn(pickup)), original);
  assert.equal(pickup.query.get('pattern_id'), '7');
  assert.equal(pickup.query.has('ma'), false);
  assert.equal(pattern.query.get('fabric_id'), '5');
});

test('pattern catalogue return and supplies return keep numeric selected detail and reject external paths', () => {
  const original = '/buyer/patterns?keyword=가방&category=BAG&page=3&fabric_id=8';
  const detail = patternDetailPath(context(original), '6', '8');
  assert.equal(decodeURI(context(detail).query.get('patterns_return')), original);
  const pickup = patternPickupPath(context(detail), '8', '6');
  const restored = patternDetailPath(context(pickup), '6', '8');
  assert.equal(context(restored).query.get('patterns_return'), context(detail).query.get('patterns_return'));
  assert.equal(internalReturn(detail, 'pattern'), detail);
  for (const value of ['https://example.com', '//example.com', '/buyer/patterns/6#x', '/buyer/patterns\\other', '/buyer/patterns\n']) {
    assert.equal(patternListReturn(value), '');
    assert.equal(internalReturn(value, 'pattern'), '');
  }
  assert.equal(internalReturn('/buyer/patterns/pouch?fabric_id=fabric-roll-1', 'pattern'), '/buyer/patterns/pouch?fabric_id=fabric-roll-1');
  assert.equal(patternListReturn('/buyer/patterns?mode=demo&example=1&state=DONE&page=2'), '/buyer/patterns?page=2');
});

test('recommendation selection distinguishes missing/capped/unavailable from suitable without fabric-side guessing', () => {
  assert.equal(selectedRecommendation(result, '007'), result.items[0]);
  assert.equal(selectedRecommendation(result, '999'), null);
  assert.equal(selectedRecommendation(result, '7.0'), null);
  assert.equal(selectedRecommendation({ ...result, available: false }, '7'), null);
});

test('recommended pickup rejects changed eligibility, insufficient selected length, and stale price', () => {
  const fabric = { sale_type: 'ROLL', price: 3000 };
  assert.equal(recommendedPickupIssue(result, '7', fabric, 3), '');
  assert.equal(recommendedPickupIssue(result, '7', fabric, 4), '');
  assert.match(recommendedPickupIssue(result, '7', fabric, 2), /3마/);
  assert.match(recommendedPickupIssue(result, '7', { ...fabric, price: 2000 }, 3), /가격이 변경/);
  assert.match(recommendedPickupIssue({ available: true, items: [{ ...result.items[0], yards: null }] }, '7', { sale_type: 'SCRAP', price: 2000 }, null, { sale_type: 'SCRAP', price: 3000 }), /가격 또는 판매 방식/);
  assert.match(recommendedPickupIssue({ ...result, items: [{ ...result.items[0], judgement: 'NEEDS_CHECK' }] }, '7', fabric, 3), /제작 조건/);
  assert.match(recommendedPickupIssue({ available: false, items: [] }, '7', fabric, 3), /제작 조건/);
});

test('SCRAP uses its actual whole-piece price and never null recommendation pricing as free', () => {
  const item = { pattern_id: '7', judgement: 'SUITABLE', yards: null, purchase_length_cm: null, estimated_price: null };
  const fabric = { sale_type: 'SCRAP', price: 4500 };
  assert.match(recommendationPurchase(item, fabric), /자투리 한 장 전체.*4,500/);
  assert.equal(recommendedPickupIssue({ available: true, items: [item] }, '7', fabric, null), '');
  assert.match(recommendationPurchase(result.items[0], { sale_type: 'ROLL', price: 999 }), /3마\(270cm\).*9,000/);
});

test('StrictMode cleanup prevents duplicate pattern reads and exposes shared abort on parallel context', async () => {
  const calls = [], values = [];
  const api = {
    getFabric: async (id, { signal }) => { calls.push({ method: 'fabric', id, signal }); return { id }; },
    getRecommendations: async (id, { signal }) => { calls.push({ method: 'recommendations', id, signal }); return result; },
  };
  const request = { kind: 'context', id: '5' };
  startPatternRequest(api, request, () => assert.fail('disposed result'), () => assert.fail('disposed error'))();
  const stop = startPatternRequest(api, request, value => values.push(value), () => assert.fail('error'));
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal, calls[1].signal);
  assert.deepEqual(values, [{ fabric: { id: '5' }, recommendations: result }]);
  stop();
  assert.equal(calls[0].signal.aborted, true);
});

test('old route results are discarded and service invalidation becomes a retryable error', async () => {
  let resolve;
  const values = [], errors = [];
  const api = { getPattern: () => new Promise(yes => { resolve = yes; }) };
  const stop = startPatternRequest(api, { kind: 'detail', id: '7' }, value => values.push(value), error => errors.push(error));
  await tick(); stop(); resolve({ id: '7' }); await tick();
  assert.deepEqual(values, []);
  startPatternRequest({ getPattern: () => { throw Object.assign(new Error('stale session'), { name: 'AbortError' }); } }, { kind: 'detail', id: '8' }, () => assert.fail('no data'), error => errors.push(error));
  await tick();
  assert.equal(errors[0].code, 'DATA_CHANGED');
});

test('a missing active pattern prevents a recommendation pickup context from succeeding', async () => {
  const errors = [];
  startPatternRequest({ getRecommendations: async () => result, getPattern: async () => { throw Object.assign(new Error('not found'), { status: 404 }); } }, { kind: 'pickup', id: '5', patternId: '7' }, () => assert.fail('inactive pattern'), error => errors.push(error));
  await tick();
  assert.equal(errors[0].status, 404);
});
