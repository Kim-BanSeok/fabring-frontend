import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { factoryItem, factoryPage, factoryQuery, loadSupplyFactories } from '../src/react/services/factory-contract.js';
import { FACTORY_MAP_MOVE_MS, focusFactoryMarker, groupFactoryMarkers, loadNaverMaps, showFactoryOverview } from '../src/react/services/naver-maps.js';

const item = (id = 1, extra = {}) => ({ factoryId: id, factory_name: `업체 ${id}`, industry: '단추', category: 'OTHER', address: '경기도 양주시 은현면 봉암리 422-4', latitude: null, longitude: null, data_source: '양주시청 공장등록 2026-09', created_at: '2026-10-13T12:00:00+09:00', ...extra });
const page = (items = [item()], extra = {}) => ({ content: items, page: 0, size: 50, totalElements: items.length, totalPages: items.length ? 1 : 0, ...extra });
test('공장 연락처를 보존하고 원본에 없는 전화번호는 null로 둔다', () => {
  const data = factoryItem(item(1, { phone_number: ' 031-123-4567 ', fax_number: '031-123-4568' }));
  assert.equal(data.phone_number, '031-123-4567');
  assert.equal(data.fax_number, '031-123-4568');
  assert.equal(factoryItem(item()).phone_number, null);
  assert.equal(factoryItem(item(1, { phone_number: '  ' })).phone_number, null);
  assert.throws(() => factoryItem(item(1, { phone_number: 311234567 })), { code: 'INVALID_RESPONSE' });
});

test('공개 API로 후보를 요청하고 null 좌표와 생산품 전체 문구를 보존한다', async () => {
  const calls = [];
  const api = createLiveApi({ storage: null, fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ success: true, data: page([item(1, { industry: '원'.repeat(718) })]) })); } });
  const data = await loadSupplyFactories(api);
  assert.equal(data.items[0].industry.length, 718);
  assert.equal(data.items[0].latitude, null);
  assert.equal(calls[0].url, '/api/v1/factories?supply_status=candidate&page=0&size=50');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('조회 조건·중복 ID·불완전 페이지·짝이 맞지 않는 좌표를 검증한다', () => {
  assert.throws(() => factoryQuery({ supply_status: 'approved' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => factoryQuery({ size: 51 }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => factoryItem(item(1, { latitude: 37.85 })), { code: 'INVALID_RESPONSE' });
  assert.throws(() => factoryItem(item(1, { latitude: 137, longitude: 127 })), { code: 'INVALID_RESPONSE' });
  assert.throws(() => factoryPage(page([item(), item()]), factoryQuery({ size: 50 })), { code: 'INVALID_RESPONSE' });
  assert.throws(() => factoryPage(page([item()], { totalElements: 2 }), factoryQuery({ size: 50 })), { code: 'INVALID_RESPONSE' });
});

test('다음 페이지도 가져오고 중간 자료 변경이나 취소를 표시한다', async () => {
  const api = { listFactories: async ({ page: number }) => ({ items: Array.from({ length: number ? 1 : 50 }, (_, i) => factoryItem(item(number ? 51 : i + 1))), totalElements: 51, totalPages: 2 }) };
  assert.equal((await loadSupplyFactories(api)).items.length, 51);
  await assert.rejects(loadSupplyFactories({ listFactories: async ({ page: number }) => ({ items: [], totalElements: number ? 52 : 51, totalPages: 2 }) }), { code: 'INVALID_RESPONSE' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadSupplyFactories(api, { signal: controller.signal }), { name: 'AbortError' });
});

test('같은 좌표 업체는 한 마커로 묶고 좌표 없는 업체는 임의로 지도에 배치하지 않는다', () => {
  const rows = [factoryItem(item(1, { latitude: 37.85, longitude: 126.99 })), factoryItem(item(2, { latitude: 37.85, longitude: 126.99 })), factoryItem(item(3))];
  const groups = groupFactoryMarkers(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].factories.map((row) => row.id), ['1', '2']);
});

test('선택 위치를 건물 배율까지 확대하며 사용자가 더 확대한 배율과 지도 한도를 존중한다', () => {
  const position = { latitude: 37.85, longitude: 126.99 }, moves = [];
  const marker = { getPosition: () => position };
  const map = { getZoom: () => 11, getMaxZoom: () => 21, stop() {}, morph: (...args) => moves.push(args) };
  focusFactoryMarker(map, marker);
  assert.deepEqual(moves.pop(), [position, 16, { duration: 300, easing: 'easeOutCubic' }]);
  map.getZoom = () => 18;
  focusFactoryMarker(map, marker);
  assert.deepEqual(moves.pop(), [position, 18, { duration: 300, easing: 'easeOutCubic' }]);
  map.getMaxZoom = () => 15;
  focusFactoryMarker(map, marker);
  assert.deepEqual(moves.pop(), [position, 15, { duration: 300, easing: 'easeOutCubic' }]);
});

test('벡터 지도는 이동과 확대를 300ms로 함께 수행하고 재선택 전에 이전 전환을 중단한다', () => {
  const calls = [];
  const map = { getZoom: () => 10, getMaxZoom: () => 20, isGLReady: () => true,
    stop: () => calls.push('stop'), morph: (...args) => calls.push(args) };
  const first = { id: 'first' }, last = { id: 'last' };
  focusFactoryMarker(map, { getPosition: () => first });
  focusFactoryMarker(map, { getPosition: () => last });
  assert.equal(FACTORY_MAP_MOVE_MS, 300);
  assert.deepEqual(calls, ['stop', [first, 15, { duration: 300, easing: 'easeOutCubic' }], 'stop', [last, 15, { duration: 300, easing: 'easeOutCubic' }]]);
});

test('전체 위치도 300ms로 부드럽게 복귀하며 진행 중인 선택 전환을 먼저 중단한다', () => {
  const updates = [], bounds = { id: 'all' };
  const map = { stop: () => updates.push('stop'), panToBounds: (...args) => updates.push(args) };
  showFactoryOverview(map, bounds);
  assert.equal(updates[0], 'stop');
  assert.equal(updates[1][0], bounds);
  assert.equal(updates[1][1].duration, 300);
  assert.equal(updates[1][1].easing, 'easeOutCubic');
});

test('SDK는 공식 ncpKeyId 주소로 한 번만 로드하고 준비 완료를 기다린다', async () => {
  const scripts = [], timers = new Map();
  const browser = { setTimeout: (fn) => { timers.set(1, fn); return 1; }, clearTimeout: (id) => timers.delete(id), document: {
    createElement: () => ({ remove() {} }), head: { appendChild: (script) => scripts.push(script) },
  } };
  const first = loadNaverMaps('test-id', browser), second = loadNaverMaps('test-id', browser);
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  const url = new URL(scripts[0].src);
  assert.equal(url.hostname, 'oapi.map.naver.com');
  assert.equal(url.searchParams.get('ncpKeyId'), 'test-id');
  assert.equal(url.searchParams.get('submodules'), 'gl');
  let resolved = false;
  first.then(() => { resolved = true; });
  browser.naver = { maps: { Map: class {} } };
  scripts[0].onload?.();
  await Promise.resolve();
  assert.equal(resolved, false, '기본 SDK가 로드돼도 GL 모듈 완료 전에는 반환하지 않는다');
  browser.naver.maps.glEnabled = true;
  browser[url.searchParams.get('callback')]();
  assert.equal(await first, browser.naver.maps);
  assert.equal(timers.size, 0);
});

test('키가 없으면 SDK를 요청하지 않고 인증 실패는 다시 시도할 수 있다', async () => {
  await assert.rejects(loadNaverMaps('', {}), /주소/);
  const scripts = [];
  const browser = { setTimeout: () => 1, clearTimeout() {}, document: { createElement: () => ({ remove() {} }), head: { appendChild: (script) => scripts.push(script) } } };
  const first = loadNaverMaps('test-id', browser);
  browser.navermap_authFailure();
  await assert.rejects(first, /연결하지 못/);
  const retry = loadNaverMaps('test-id', browser);
  browser.navermap_authFailure();
  await assert.rejects(retry);
  assert.equal(scripts.length, 2);
});

test('SDK 완료 콜백이 maps 전역 공개보다 먼저 실행되어도 로딩에 성공한다', async () => {
  const scripts = [];
  const browser = { setTimeout: () => 1, clearTimeout() {}, document: { createElement: () => ({ remove() {} }), head: { appendChild: (script) => scripts.push(script) } } };
  const loaded = loadNaverMaps('test-id', browser);
  const callback = new URL(scripts[0].src).searchParams.get('callback');
  browser[callback]();
  browser.naver = { maps: { Map: class {} } };
  assert.equal(await loaded, browser.naver.maps);
});
