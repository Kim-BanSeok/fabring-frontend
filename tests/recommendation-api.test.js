import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { patternQuery, patternPage, patternDetail, patternIdentifier, recommendationResult } from '../src/react/services/recommendation-contract.js';
import { reservationInput } from '../src/react/services/reservation-contract.js';

const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status });
const pattern = (patch = {}) => ({ patternId: 17, pattern_name: '작은 가방', aliases: '토트백', category: '가방', image_url: null,
  allowed_materials: ['COTTON', 'LINEN'], allowed_thickness: ['NORMAL'], description: null, reviewed_by: null,
  parts: [{ part_name: '몸판', width_cm: 40, height_cm: 46, quantity: 2 }], ...patch });
const page = (patch = {}) => ({ content: [pattern()], page: 0, size: 20, totalElements: 1, totalPages: 1, ...patch });
const item = (patch = {}) => ({ patternId: 17, pattern_name: '작은 가방', image_url: null, judgement: 'SUITABLE',
  reasons: [{ criterion: 'WIDTH', required: 40, actual: 140, met: true, text: '폭 충족' },
    { criterion: 'LENGTH', required: 180, actual: 900, met: true, text: '길이 충족' },
    { criterion: 'MATERIAL', required: ['COTTON'], actual: 'COTTON', met: true, text: '소재 충족' },
    { criterion: 'THICKNESS', required: ['NORMAL'], actual: 'NORMAL', met: true, text: '두께 충족' }],
  required_length_cm: 92, purchase_length_cm: 180, yards: 2, estimated_price: 14000, ...patch });
const result = (patch = {}) => ({ available: true, items: [item()], notices: ['실물 확인 권장'], message: null, ...patch });
const profile = { userId: 8, nickname: '구매자', role: 'BUYER', email: 'buyer@example.test', hasStore: false };
async function login(api) { api.commitLogin(await api.login({ email: profile.email, password: 'test-placeholder' })); }
function businessApi(fetchBusiness) {
  return createLiveApi({ storage: null, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/logout')) return response(null);
    if (url.endsWith('/auth/login')) return response({ accessToken: 'test-placeholder-token', expiresIn: 3600, user: profile });
    if (url.endsWith('/users/me')) return response(profile);
    return fetchBusiness(url, options);
  } });
}

test('pattern filters forward only documented search/category/paging and validate limits', () => {
  assert.deepEqual(Object.fromEntries(patternQuery({ keyword: ' 가방 ', category: ' 생활 ', page: 2, size: 3, fabric_id: 9, mode: 'demo' })),
    { keyword: '가방', category: '생활', page: '2', size: '3' });
  assert.equal(patternQuery(new URLSearchParams('keyword=&category=&page=0')).toString(), 'page=0&size=20');
  for (const input of [{ keyword: 'a'.repeat(101) }, { category: 'a'.repeat(51) }, { keyword: {} }, { page: -1 }, { size: 51 }, { page: Infinity }]) {
    assert.throws(() => patternQuery(input), error => error.code === 'VALIDATION_ERROR');
  }
});

test('pattern responses preserve nullable content and real parts, without inferred seam/supplies', () => {
  const actual = patternDetail(pattern());
  assert.equal(actual.id, '17');
  assert.equal(actual.description, null);
  assert.equal(actual.reviewed_by, null);
  assert.deepEqual(actual.parts, [{ part_name: '몸판', width_cm: 40, height_cm: 46, quantity: 2 }]);
  assert.equal(actual.seam_allowance, undefined);
  assert.equal(actual.supplies, undefined);
  assert.equal(patternDetail(pattern({ image_url: 'javascript:alert(1)' })).image_url, null);
  assert.equal(patternDetail(pattern({ image_url: 'https://example.test/pattern.png' })).image_url, 'https://example.test/pattern.png');
  assert.deepEqual(patternDetail(pattern({ parts: [] })).parts, []);
});

test('malformed pattern content fails rather than silently presenting a real empty collection', () => {
  for (const raw of [null, {}, page({ content: null }), page({ totalPages: 4 }), page({ content: [pattern(), pattern()], totalElements: 2 })]) {
    assert.throws(() => patternPage(raw), error => error.code === 'INVALID_RESPONSE');
  }
  assert.equal(patternPage(page({ content: [], totalElements: 0, totalPages: 0 })).content.length, 0);
  assert.equal(patternPage(page({ content: [], page: 10 })).totalElements, 1);
  for (const raw of [pattern({ patternId: '17' }), pattern({ parts: [{ width_cm: 0, height_cm: 2, quantity: 1, part_name: '몸판' }] }), pattern({ allowed_materials: null })]) {
    assert.throws(() => patternDetail(raw), error => error.code === 'INVALID_RESPONSE');
  }
});

test('roll recommendation keeps authoritative 92cm -> 180cm / 2ma and server price', () => {
  const actual = recommendationResult(result()).items[0];
  assert.equal(actual.pattern_id, '17');
  assert.equal(actual.required_length_cm, 92);
  assert.equal(actual.purchase_length_cm, 180);
  assert.equal(actual.yards, 2);
  assert.equal(actual.estimated_price, 14000);
  assert.deepEqual(actual.reasons, item().reasons);
  assert.equal(recommendationResult(result({ items: [item({ estimated_price: 0 })] })).items[0].estimated_price, 0);
});

test('SCRAP nullable calculation remains unknown instead of zero; NEEDS_CHECK remains unconfirmed', () => {
  const scrap = item({ required_length_cm: null, purchase_length_cm: null, yards: null, estimated_price: null });
  const unknown = structuredClone(scrap);
  unknown.judgement = 'NEEDS_CHECK';
  unknown.reasons[2] = { criterion: 'MATERIAL', required: ['COTTON'], actual: 'UNKNOWN', met: null, text: '소재 확인 필요' };
  const actual = recommendationResult(result({ items: [unknown] })).items[0];
  assert.equal(actual.estimated_price, null);
  assert.equal(actual.yards, null);
  assert.equal(actual.judgement, 'NEEDS_CHECK');
  assert.equal(actual.reasons[2].met, null);
});

test('unavailable fabric and available fabric with no matches are distinct states', () => {
  const empty = recommendationResult(result({ items: [], message: '조건에 맞는 도안 없음' }));
  const unavailable = recommendationResult(result({ available: false, items: [], message: '이미 예약 중' }));
  assert.equal(empty.available, true);
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.message, '이미 예약 중');
});

test('contradictory judgements, malformed quantities and missing reasons fail closed', () => {
  const contradiction = item(); contradiction.reasons[0].actual = 1;
  const unconfirmed = item(); unconfirmed.reasons[2].met = null;
  for (const raw of [result({ available: false }), result({ items: null }), result({ message: undefined }),
    result({ items: [item({ purchase_length_cm: 90 })] }), result({ items: [item({ estimated_price: null })] }),
    result({ items: [item({ judgement: 'MAYBE' })] }), result({ items: [item({ reasons: [] })] }),
    result({ items: [contradiction] }), result({ items: [unconfirmed] }), result({ items: [item(), item()] })]) {
    assert.throws(() => recommendationResult(raw), error => error.code === 'INVALID_RESPONSE');
  }
});

test('public API endpoints work without login, with safe IDs and no demo fields in requests', async () => {
  const calls = [];
  const api = createLiveApi({ storage: null, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/logout')) return response(null);
    calls.push({ url, options });
    return response(url.includes('/recommendations') ? result() : url.includes('/patterns?') ? page() : pattern());
  } });
  assert.equal((await api.listPatterns({ keyword: '가방', size: 3 })).content[0].id, '17');
  assert.equal((await api.getPattern('017')).id, '17');
  assert.equal((await api.getRecommendations('9')).items[0].pattern_id, '17');
  assert.equal(calls[1].url, '/api/v1/patterns/17');
  assert.equal(calls[2].url, '/api/v1/fabrics/9/recommendations');
  assert.ok(calls.every(call => !call.options.headers.Authorization));
  for (const id of ['pouch', '1/../users/me', 0, -1, '1?x=2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => patternIdentifier(id), error => error.code === 'VALIDATION_ERROR');
    await assert.rejects(api.getPattern(id), error => error.code === 'VALIDATION_ERROR');
    await assert.rejects(api.getRecommendations(id), error => error.code === 'VALIDATION_ERROR');
  }
  assert.equal(calls.length, 3);
  await assert.rejects(api.getPattern(18), error => error.code === 'INVALID_RESPONSE');
});

test('read errors distinguish inactive/notfound, unavailable network and expired login', async () => {
  let status = 404;
  const api = businessApi(() => { if (!status) throw new Error('offline'); return response({ code: status === 401 ? 'UNAUTHORIZED' : 'NOT_FOUND', message: '확인 필요' }, status); });
  await assert.rejects(api.getPattern(17), error => error.status === 404);
  status = 0;
  await assert.rejects(api.getRecommendations(9), error => error.code === 'NETWORK_ERROR');
  await login(api);
  status = 401;
  await assert.rejects(api.listPatterns(), error => error.status === 401);
  assert.equal(api.getState().session.authenticated, false);
});

test('logout while a pattern request is in flight discards old-session results', async () => {
  let finish;
  const api = businessApi(() => new Promise(resolve => { finish = () => resolve(response(pattern())); }));
  await login(api);
  const read = api.getPattern(17);
  await api.logout();
  finish();
  await assert.rejects(read, error => error.name === 'AbortError');
});

test('navigation abort cannot publish late recommendation response', async () => {
  let finish;
  const api = createLiveApi({ storage: null, fetchImpl: () => new Promise(resolve => { finish = () => resolve(response(result())); }) });
  const controller = new AbortController();
  const read = api.getRecommendations(9, { signal: controller.signal });
  controller.abort(); finish();
  await assert.rejects(read, error => error.name === 'AbortError');
});

test('reservation body preserves optional numeric pattern ID and rejects forged route IDs', () => {
  const input = { fabric_id: '9', pickup_date: '2030-01-03', pickup_time: '14:00', requested_length_cm: 180 };
  const now = Date.parse('2030-01-01T00:00:00Z');
  assert.equal(reservationInput(input, now).pattern_id, null);
  assert.equal(reservationInput({ ...input, pattern_id: '17' }, now).pattern_id, 17);
  for (const pattern_id of ['pouch', '0', -1, '', '1.2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => reservationInput({ ...input, pattern_id }, now), error => error.code === 'VALIDATION_ERROR');
  }
});
