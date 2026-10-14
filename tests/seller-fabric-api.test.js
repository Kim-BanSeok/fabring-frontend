import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { ownFabricQuery, ownFabricPage, ownFabricDetail, sellerFabricInput, imageUploadBody } from '../src/react/services/seller-fabric-contract.js';

const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status });
const draft = (sale_type = 'SCRAP') => ({ sale_type, title: ' 검증 원단 ', price: 5000, width_cm: 120, length_cm: sale_type === 'SCRAP' ? 80 : null, remaining_length_cm: sale_type === 'ROLL' ? 450 : null, material: '면', thickness: '중간 두께', color: '네이비', has_defect: false, description: ' 설명 ', sheet_count: sale_type === 'SCRAP' ? 2 : null, photo_names: ['not-wire.png'], status: 'POSTED' });
const summary = (status = 'REJECTED') => ({ fabricId: 12, title: '원단', sale_type: 'ROLL', price: 5000, material: 'COTTON', thickness: 'NORMAL', color_family: 'NAVY', width_cm: 120, length_cm: null, available_length_cm: 270, is_reserved: false, has_defect: false, thumbnail_url: null, store_name: '매장', status, reject_reason: status === 'REJECTED' ? '사진 보완' : null, active_reservation_count: 2 });
const detail = () => ({ fabricId: 12, title: '원단', sale_type: 'ROLL', price: 5000, status: 'POSTED', remaining_length_cm: 450, reject_reason: null,
  detail: { material: 'COTTON', thickness: 'NORMAL', color_family: 'NAVY', color_detail: null, width_cm: 120, length_cm: null, has_defect: false, defect_note: null, blend_ratio: null, weave: null, grain_direction: null, description: '설명' },
  images: [], store: { storeId: 4, store_name: '매장', store_address: '주소', store_phone: null, closed_days: null, pickup_guide: null }, availability: { is_reserved: false, available_length_cm: 270, reserved_length_cm: 180 }, created_at: '2026-10-12T09:00:00+09:00' });
const file = (name = 'fabric.png', type = 'image/png', bytes = 'test-file') => new File([bytes], name, { type });
async function session(business, { role = 'SELLER', timeoutMs } = {}) {
  const calls = [], profile = { userId: 1, nickname: '테스트', role, email: 'fixture@example.com', hasStore: false };
  let sequence = 0;
  const api = createLiveApi({ storage: null, timeoutMs, fetchImpl: async (url, request) => {
    if (url.endsWith('/auth/logout')) return response(null);
    if (url.endsWith('/auth/login')) return response({ accessToken: `fixture-${++sequence}`, expiresIn: 3600, user: profile });
    if (url.endsWith('/users/me')) return response(profile);
    calls.push({ url, request }); return business(url, request);
  } });
  const login = async () => api.commitLogin(await api.login({ email: profile.email, password: 'test-only' }));
  await login(); return { api, calls, login };
}

test('own fabric query supports status and server pagination without public sale-type filters', () => {
  assert.equal(String(ownFabricQuery()), 'page=0&size=20');
  assert.equal(String(ownFabricQuery({ status: 'ALL', page: 2, size: 10 })), 'page=2&size=10');
  assert.equal(String(ownFabricQuery({ status: 'REJECTED' })), 'status=REJECTED&page=0&size=20');
  for (const input of [{ status: 'APPROVED' }, { page: -1 }, { size: 51 }, { size: 0 }, { page: 'abc' }]) assert.throws(() => ownFabricQuery(input), { code: 'VALIDATION_ERROR' });
});
test('seller lists preserve rejected status, reason and active reservations instead of marking everything POSTED', () => {
  const raw = { content: [summary()], page: 1, size: 20, totalElements: 21, totalPages: 2 }, value = ownFabricPage(raw);
  assert.equal(value.content[0].status, 'REJECTED'); assert.equal(value.content[0].reject_reason, '사진 보완'); assert.equal(value.content[0].active_reservation_count, 2);
  assert.equal(value.content[0].available_length_cm, 270); assert.equal(value.totalElements, 21);
  for (const patch of [{ status: 'UNKNOWN' }, { active_reservation_count: -1 }, { reject_reason: undefined }]) assert.throws(() => ownFabricPage({ ...raw, content: [{ ...summary(), ...patch }] }), { code: 'INVALID_RESPONSE' });
});
test('own detail requires private owner fields and distinguishes total remaining from available stock', () => {
  const raw = detail(), item = ownFabricDetail(raw);
  assert.equal(item.remaining_length_cm, 450); assert.equal(item.available_length_cm, 270); assert.equal(item.reserved_length_cm, 180);
  delete raw.remaining_length_cm;
  assert.throws(() => ownFabricDetail(raw), { code: 'FORBIDDEN' });
  assert.throws(() => ownFabricDetail({ ...detail(), remaining_length_cm: 900 }), { code: 'INVALID_RESPONSE' });
});
test('creation maps UI enum labels, trims optional text and omits UI metadata', () => {
  const body = sellerFabricInput(draft());
  assert.equal(body.title, '검증 원단'); assert.equal(body.detail.material, 'COTTON'); assert.equal(body.detail.thickness, 'NORMAL'); assert.equal(body.detail.color_family, 'NAVY');
  assert.equal(body.detail.description, '설명'); assert.equal(body.detail.length_cm, 80); assert.equal(body.detail.sheet_count, 2); assert.equal(body.remaining_length_cm, null);
  assert.equal(body.photo_names, undefined); assert.equal(body.status, undefined);
  assert.equal(sellerFabricInput(draft('ROLL')).detail.length_cm, null);
  assert.equal(sellerFabricInput(draft('ROLL')).remaining_length_cm, 450);
});
test('partial patch keeps omission, explicit clearing and unknown material distinct', () => {
  assert.deepEqual(sellerFabricInput({ title: ' 새 제목 ' }, { partial: true }), { title: '새 제목' });
  assert.deepEqual(sellerFabricInput({ description: ' ', material: null }, { partial: true }), { detail: { material: 'UNKNOWN', description: null } });
  assert.throws(() => sellerFabricInput({}, { partial: true }), { code: 'VALIDATION_ERROR' });
});
test('client rejects invalid dimensions, prices, enums and defect explanation before sending', () => {
  for (const patch of [{ price: 2147483648 }, { price: 0 }, { width_cm: 1001 }, { length_cm: 0 }, { length_cm: null }, { title: ' ' }, { material: '알수없는소재' }, { has_defect: true }, { description: 'x'.repeat(5001) }]) {
    assert.throws(() => sellerFabricInput({ ...draft(), ...patch }), { code: 'VALIDATION_ERROR' });
  }
  assert.throws(() => sellerFabricInput({ ...draft('ROLL'), remaining_length_cm: 89 }), { code: 'VALIDATION_ERROR' });
});
test('multipart uses one real file plus image_type and validates size, type and extension', () => {
  const form = imageUploadBody(file(), 'ZOOM');
  assert.equal(form.get('image_type'), 'ZOOM'); assert.equal(form.get('file').name, 'fabric.png'); assert.equal([...form.keys()].length, 2);
  for (const [value, type] of [[file('bad.svg','image/svg+xml'), 'FULL'], [file('empty.png','image/png',''), 'FULL'], [file('big.png','image/png',new Uint8Array(5*1024*1024+1)), 'FULL'], [file(),'INVALID']]) assert.throws(() => imageUploadBody(value,type), { code: 'VALIDATION_ERROR' });
});
test('live CRUD sends exact methods and uses server acknowledgments for current status', async () => {
  const { api, calls } = await session((url, options) => response(options.method === 'DELETE' ? null : { fabricId: 12, status: 'PENDING' }));
  assert.deepEqual(await api.createFabric(draft()), { id:'12', status:'PENDING' });
  assert.deepEqual(await api.updateFabric('12', { title:'수정' }), { id:'12', status:'PENDING' });
  assert.equal(await api.deleteFabric('12'), null);
  assert.deepEqual(calls.map(call => [call.url, call.request.method]), [['/api/v1/fabrics','POST'],['/api/v1/fabrics/12','PATCH'],['/api/v1/fabrics/12','DELETE']]);
  assert.ok(calls.every(call => call.request.headers.Authorization === 'Bearer fixture-1'));
  assert.deepEqual(JSON.parse(calls[1].request.body), { title:'수정' });
});
test('image upload passes FormData without a manual multipart Content-Type or JSON conversion', async () => {
  const { api, calls } = await session((url, options) => response(options.method === 'POST' ? { imageId: 2, image_url:'http://localhost/img.png', thumbnail_url:'http://localhost/thumb.webp', sort_order:0 } : null));
  const image = await api.uploadFabricImage(12,file(),'FULL');
  assert.equal(image.id,'2'); assert.equal(image.image_type,'FULL');
  const request = calls[0].request;
  assert.ok(request.body instanceof FormData); assert.equal(request.headers['Content-Type'],undefined); assert.equal(request.headers.Authorization,'Bearer fixture-1');
  assert.equal(request.body.get('file').name,'fabric.png'); assert.equal(await request.body.get('file').text(),'test-file');
  assert.equal(await api.deleteFabricImage(12,2),null); assert.equal(calls[1].url,'/api/v1/fabrics/12/images/2'); assert.equal(calls[1].request.method,'DELETE');
});
test('own read endpoints retain identity and reject another fabric acknowledgment', async () => {
  const { api, calls } = await session(url => response(url.includes('/sellers/me/') ? { content: [summary()],page:0,size:20,totalElements:1,totalPages:1 } : detail()));
  assert.equal((await api.listMyFabrics({status:'REJECTED'})).content[0].status,'REJECTED'); assert.equal((await api.getSellerFabric(12)).id,'12');
  assert.equal(calls[0].url,'/api/v1/sellers/me/fabrics?status=REJECTED&page=0&size=20');
  await assert.rejects(api.getSellerFabric(13),{code:'INVALID_RESPONSE'});
});
test('buyer/admin/anonymous cannot call any seller management or image endpoint', async () => {
  for (const role of ['BUYER','ADMIN']) {
    const {api,calls}=await session(()=>assert.fail('must not fetch'),{role});
    for (const action of [()=>api.listMyFabrics(),()=>api.getSellerFabric(12),()=>api.createFabric(draft()),()=>api.updateFabric(12,{title:'x'}),()=>api.deleteFabric(12),()=>api.uploadFabricImage(12,file(),'FULL'),()=>api.deleteFabricImage(12,2)]) await assert.rejects(action,{code:'FORBIDDEN'});
    assert.equal(calls.length,0);
  }
  await assert.rejects(createLiveApi({storage:null}).listMyFabrics(),{code:'UNAUTHORIZED'});
});
test('known ownership, approval, stock, image and active reservation failures are definite and never auto-retried', async () => {
  for (const code of ['FORBIDDEN','SELLER_NOT_APPROVED','STORE_REQUIRED','INSUFFICIENT_LENGTH','INVALID_STATUS','FABRIC_HAS_ACTIVE_RESERVATION','IMAGE_LIMIT_EXCEEDED','IMAGE_TOO_LARGE']) {
    const {api,calls}=await session(()=>response({code,message:'서버 검증'},409));
    await assert.rejects(api.createFabric(draft()), error=>error.code===code && !error.outcomeUnknown); assert.equal(calls.length,1);
  }
});
test('all write failures with uncertain outcomes block a blind retry, including patch/delete and malformed acknowledgments', async () => {
  const actions=[api=>api.createFabric(draft()),api=>api.updateFabric(12,{title:'x'}),api=>api.deleteFabric(12),api=>api.uploadFabricImage(12,file(),'FULL'),api=>api.deleteFabricImage(12,2)];
  for(const action of actions) for(const failure of [()=>{throw new TypeError('connection lost');},()=>response({code:'INTERNAL_ERROR'},500),()=>response({unexpected:true})]) {
    const {api,calls}=await session(failure); await assert.rejects(()=>action(api),error=>error.outcomeUnknown===true); assert.equal(calls.length,1);
  }
});
test('late responses and old-token unauthorized cannot change or expose a later session', async () => {
  for(const unauthorized of [false,true]) {
    let resolve; const pending=new Promise(yes=>{resolve=yes;});
    const {api,login}=await session(()=>pending);
    const sent=api.createFabric(draft()); await api.logout(); await login();
    resolve(unauthorized?response({code:'UNAUTHORIZED'},401):response({fabricId:12,status:'PENDING'}));
    await assert.rejects(sent,{name:'AbortError'}); assert.equal(api.getAuth().status,'authenticated');
  }
});
test('caller abort discards a late successful upload instead of showing success on another screen', async () => {
  const controller=new AbortController(); let resolve; const pending=new Promise(yes=>{resolve=yes;});
  const {api}=await session(()=>pending); const sent=api.uploadFabricImage(12,file(),'FULL',{signal:controller.signal}); controller.abort();
  resolve(response({imageId:2,image_url:'http://localhost/a.png',thumbnail_url:'http://localhost/a.webp',sort_order:0}));
  await assert.rejects(sent,{name:'AbortError'});
});
