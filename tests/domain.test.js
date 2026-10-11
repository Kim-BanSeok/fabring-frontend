import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../src/prototype/services/mock-api.js';
import { createSeed } from '../src/prototype/data/seed.js';
import { canRegister, validateFabric, validateReservation } from '../src/prototype/shared/domain.js';

const api = () => createMockApi({ getItem:()=>null,setItem:()=>{} });
const draft = { title:'테스트 원단',sale_type:'ROLL',width_cm:150,remaining_length_cm:451,price:5000,photo_names:['front.png','back.png'] };
const pickup = () => { const d = new Date();d.setDate(d.getDate()+7);return{fabric_id:'fabric-roll-1',requested_length_cm:180,pickup_date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,pickup_time:'14:00'}; };
const registerReady = async service => { await service.setRole('SELLER');await service.setDemo({seller_approval_status:'APPROVED',hasStore:true});await service.saveDraft(draft); };

test('registration requires both seller approval and store; saving store never grants approval',async()=>{
  for(const status of ['PENDING','REJECTED','APPROVED'])for(const hasStore of [false,true])assert.equal(canRegister({seller_approval_status:status,hasStore}),status==='APPROVED'&&hasStore);
  const service=api();await service.setRole('SELLER');await service.saveStore({store_name:'검증 매장',address:'양주시'});
  assert.equal(service.getState().seller.seller_approval_status,'PENDING');
  await assert.rejects(service.saveDraft(draft),{code:'SELLER_NOT_APPROVED'});
});
test('roll registration accepts integer cm >=90, while requests require multiples of90',()=>{
  assert.equal(validateFabric(draft).remaining_length_cm,451);
  assert.throws(()=>validateFabric({...draft,remaining_length_cm:89}),{code:'INVALID_LENGTH'});
  assert.throws(()=>validateFabric({...draft,remaining_length_cm:90.5}),{code:'INVALID_LENGTH'});
  for(const length of [29,91])assert.throws(()=>validateFabric({...draft,sale_type:'SCRAP',length_cm:length}),{code:'INVALID_LENGTH'});
  assert.equal(validateFabric({...draft,sale_type:'SCRAP',length_cm:90}).length_cm,90);
  assert.throws(()=>validateReservation(createSeed().fabrics[2],{...pickup(),requested_length_cm:91},[]),{code:'INVALID_LENGTH'});
});
test('request does not reserve stock; acceptance reserves, cancellation releases once',async()=>{
  const service=api(),r=await service.createReservation(pickup());
  const stock=()=>service.getState().fabrics.find(f=>f.id==='fabric-roll-1');
  assert.equal(stock().available_length_cm,450);
  await assert.rejects(service.createReservation(pickup()),{code:'DUPLICATE_RESERVATION'});
  await service.setRole('SELLER');await service.updateReservation(r.id,'ACCEPTED');
  assert.equal(stock().available_length_cm,270);assert.equal(stock().remaining_length_cm,450);
  await service.setRole('BUYER');await service.cancelReservation(r.id);
  assert.equal(stock().available_length_cm,450);
  await assert.rejects(service.cancelReservation(r.id),{code:'INVALID_STATUS'});
  assert.equal(stock().available_length_cm,450);
});
test('pickup subtracts physical stock exactly once; seller cancel is limited to accepted',async()=>{
  const service=api(),r=await service.createReservation(pickup());await service.setRole('SELLER');
  await assert.rejects(service.updateReservation(r.id,'CANCELED'),{code:'INVALID_STATUS'});
  await service.updateReservation(r.id,'ACCEPTED');await service.updateReservation(r.id,'PICKED_UP');
  let f=service.getState().fabrics.find(f=>f.id==='fabric-roll-1');assert.equal(f.remaining_length_cm,270);assert.equal(f.reserved_length_cm,0);
  await assert.rejects(service.updateReservation(r.id,'PICKED_UP'),{code:'INVALID_STATUS'});
  f=service.getState().fabrics.find(f=>f.id==='fabric-roll-1');assert.equal(f.remaining_length_cm,270);
});
test('scrap is blocked by another accepted reservation, not merely a pending request',()=>{
  const f=createSeed().fabrics[0],input={...pickup(),fabric_id:f.id,requested_length_cm:null};
  const r={fabric_id:f.id,buyer_id:'someone-else',status:'REQUESTED'};
  assert.doesNotThrow(()=>validateReservation(f,input,[r]));
  assert.throws(()=>validateReservation(f,input,[{...r,status:'ACCEPTED'}]),{code:'SCRAP_ALREADY_RESERVED'});
});
test('seller rejection is only allowed from pending; approved account cannot be reprocessed',async()=>{
  const service=api();await service.setRole('ADMIN');await service.reviewSeller('seller-1','REJECTED');
  await assert.rejects(service.reviewSeller('seller-1','REJECTED'),{code:'INVALID_STATUS'});
  await service.reviewSeller('seller-1','APPROVED');
  await assert.rejects(service.reviewSeller('seller-1','REJECTED'),{code:'INVALID_STATUS'});
  assert.equal(service.getState().seller.seller_approval_status,'APPROVED');
});
test('photo retry keeps the original fabric and photo selection even if another draft is edited',async()=>{
  const service=api();await registerReady(service);await service.setDemo({uploadResult:'PARTIAL'});
  const before=service.getState().fabrics.length, f=await service.createFabric();await service.uploadPhotos();
  assert.equal(service.getState().upload.stage,'PARTIAL');
  await assert.rejects(service.createFabric(),{code:'CREATE_UNRESOLVED'});
  await service.saveDraft({...draft,photo_names:['different.jpg']});await service.retryPhotos();
  assert.equal(service.getState().fabrics.length,before+1);
  assert.deepEqual(service.getState().fabrics.find(item=>item.id===f.id).photos,['front.png','back.png']);
  await assert.rejects(service.createFabric(),{code:'CREATE_UNRESOLVED'});
});
test('lost creation response cannot trigger a second create; query list remains possible',async()=>{
  const service=api();await registerReady(service);await service.setDemo({createResult:'UNKNOWN'});
  const before=service.getState().fabrics.length;await service.createFabric();
  assert.equal(service.getState().upload.stage,'UNKNOWN');
  await assert.rejects(service.createFabric(),{code:'CREATE_UNRESOLVED'});
  assert.equal(service.getState().fabrics.length,before+1);
});
test('incomplete local drafts are preserved, but cannot be submitted',async()=>{
  const service=api();await registerReady(service);
  await service.saveDraft({...draft,title:'',photo_names:['selected.png']});
  assert.deepEqual(service.getState().draft.photo_names,['selected.png']);
  await assert.rejects(service.createFabric(),{code:'INVALID_INPUT'});
});
test('profile only edits supported fields and inquiry validates public content',async()=>{
  const service=api();await service.updateProfile({nickname:'새 닉네임',phone_number:null,email:'changed@example.com'});
  assert.equal(service.getState().buyer.email,'loop@example.com');
  await assert.rejects(service.updateProfile({nickname:'x'.repeat(51)}),{code:'INVALID_INPUT'});
  await assert.rejects(service.createInquiry({fabric_id:'fabric-scrap-1',content:' '}),{code:'INVALID_CONTENT'});
  const q=await service.createInquiry({fabric_id:'fabric-scrap-1',content:'소재가 궁금해요.'});assert.equal(q.is_private,false);
});
test('fabric publication requires an uploaded photo and rejection reason is bounded',async()=>{
  const service=api();await registerReady(service);const f=await service.createFabric();
  await service.setRole('ADMIN');await assert.rejects(service.reviewFabric(f.id,'POSTED'),{code:'IMAGE_REQUIRED'});
  await assert.rejects(service.reviewFabric(f.id,'REJECTED','x'.repeat(256)),{code:'REASON_REQUIRED'});
  await service.setRole('SELLER');await service.uploadPhotos();await service.setRole('ADMIN');
  const result=await service.reviewFabric(f.id,'POSTED');assert.equal(result.status,'POSTED');
});

test('demo signup requires both consents and never stores passwords; seller starts without a store',async()=>{
  let saved='';const service=createMockApi({getItem:()=>null,setItem:(_key,value)=>{saved=value;}});
  const input={role:'SELLER',email:'NEW@example.com',password:'UniqueSecret123!',nickname:'새 판매자',terms:true,privacy:false};
  await assert.rejects(service.signupDemo(input),{code:'CONSENT_REQUIRED'});
  await service.signupDemo({...input,privacy:true});
  assert.equal(service.getState().seller.email,'new@example.com');
  assert.equal(service.getState().seller.hasStore,false);
  assert.equal(service.getState().seller.seller_approval_status,'PENDING');
  assert.equal(saved.includes(input.password),false);assert.equal(saved.includes('password'),false);
  const login=await service.loginDemo(input);assert.equal(login.first_login,true);
  await service.logoutDemo();assert.equal(service.getState().session.authenticated,false);
  await assert.rejects(service.signupDemo({...input,role:'ADMIN',privacy:true}),{code:'INVALID_ROLE'});
});

test('editing rejected fabric resubmits it and posted price edits preserve old reservation price',async()=>{
  const service=api();const r=await service.createReservation(pickup());
  await service.setRole('SELLER');await service.updateFabric('fabric-roll-1',{price:6000});
  assert.equal(service.getState().reservations.find(x=>x.id===r.id).estimated_price,10000);
  assert.equal(service.getState().fabrics.find(x=>x.id==='fabric-roll-1').status,'POSTED');
  await service.setRole('ADMIN');await service.reviewFabric('fabric-pending-1','REJECTED','사진을 보완해 주세요.');
  await service.setRole('SELLER');const f=await service.updateFabric('fabric-pending-1',{description:'보완 설명'});
  assert.equal(f.status,'PENDING');assert.equal(f.reject_reason,null);
  await assert.rejects(service.updateFabric('fabric-pending-2',{price:1000}),{code:'FORBIDDEN'});
});

test('stock edits cannot undercut accepted reservations and sold-out fabrics cannot be edited',async()=>{
  const service=api();const r=await service.createReservation(pickup());await service.setRole('SELLER');
  await service.updateReservation(r.id,'ACCEPTED');
  await assert.rejects(service.updateFabric('fabric-roll-1',{remaining_length_cm:90}),{code:'INSUFFICIENT_LENGTH'});
  const f=await service.updateFabric('fabric-roll-1',{remaining_length_cm:360});assert.equal(f.available_length_cm,180);
  await service.setRole('BUYER');const scrap=await service.createReservation({...pickup(),fabric_id:'fabric-scrap-1'});
  await service.setRole('SELLER');await service.updateReservation(scrap.id,'ACCEPTED');await service.updateReservation(scrap.id,'PICKED_UP');
  await assert.rejects(service.updateFabric('fabric-scrap-1',{price:1000}),{code:'INVALID_STATUS'});
});

test('deletion blocks active reservations, hides inactive fabric, and preserves history',async()=>{
  let saved;const service=createMockApi({getItem:()=>null,setItem:(_key,value)=>{saved=JSON.parse(value);}});
  const r=await service.createReservation(pickup());await service.setRole('SELLER');
  await assert.rejects(service.deleteFabric('fabric-roll-1'),{code:'FABRIC_HAS_ACTIVE_RESERVATION'});
  await service.updateReservation(r.id,'ACCEPTED');
  await assert.rejects(service.deleteFabric('fabric-roll-1'),{code:'FABRIC_HAS_ACTIVE_RESERVATION'});
  await service.updateReservation(r.id,'CANCELED');await service.deleteFabric('fabric-roll-1');
  assert.equal(service.getState().fabrics.some(f=>f.id==='fabric-roll-1'),false);
  assert.equal(service.getState().reservations[0].fabric_title,'내추럴 코튼 캔버스');
  assert(saved.fabrics.find(f=>f.id==='fabric-roll-1').deleted_at);
  await assert.rejects(service.deleteFabric('fabric-roll-1'),{code:'NOT_FOUND'});
  await assert.rejects(service.deleteFabric('fabric-pending-2'),{code:'FORBIDDEN'});
});

test('seller can answer only own inquiries with valid content, buyer sees the persisted answer',async()=>{
  const service=api();const q=await service.createInquiry({fabric_id:'fabric-roll-1',content:'세탁 가능한가요?'});
  await service.setRole('SELLER');await assert.rejects(service.answerInquiry(q.id,' '),{code:'INVALID_CONTENT'});
  await assert.rejects(service.answerInquiry(q.id,'x'.repeat(1001)),{code:'INVALID_CONTENT'});
  await service.answerInquiry(q.id,'찬물 단독 세탁을 권해요.');await service.setRole('BUYER');
  assert.equal(service.getState().inquiries[0].answer,'찬물 단독 세탁을 권해요.');
  await assert.rejects(service.answerInquiry(q.id,'아무 답변'),{code:'FORBIDDEN'});
});

test('AI sample preserves the request without pretending to infer actual material or measurements',async()=>{
  const service=api();await registerReady(service);const message='소재를 잘 모르겠어요.';
  const f=await service.prepareAiDraft({sale_type:'SCRAP',message});
  assert.equal(f.ai_demo,true);assert.equal(f.ai_request,message);assert.equal(f.sale_type,'SCRAP');
  assert.equal(service.getState().ai.status,'READY');
  await assert.rejects(service.prepareAiDraft({sale_type:'ROLL',message:'x'.repeat(1001)}),{code:'INVALID_INPUT'});
});

test('new fixtures migrate into existing local work once without resetting it',async()=>{
  const saved=createSeed();delete saved.phase2;saved.buyer.nickname='기존 작업자';saved.fabrics=saved.fabrics.filter(f=>!['fabric-gauze','fabric-check','fabric-denim'].includes(f.id));
  let value=JSON.stringify(saved);const storage={getItem:()=>value,setItem:(_key,v)=>{value=v;}};
  const service=createMockApi(storage);await service.setRole('BUYER');
  assert.equal(service.getState().buyer.nickname,'기존 작업자');
  assert.equal(service.getState().fabrics.filter(f=>f.id==='fabric-gauze').length,1);
  assert.equal(createMockApi(storage).getState().fabrics.length,service.getState().fabrics.length);
});

test('admin network-error scenario does not change publication status and can recover',async()=>{
  const service=api();await service.setRole('ADMIN');await service.setDemo({adminResult:'ERROR'});
  await assert.rejects(service.reviewFabric('fabric-pending-1','POSTED'),{code:'SERVICE_ERROR'});
  assert.equal(service.getState().fabrics.find(f=>f.id==='fabric-pending-1').status,'PENDING');
  await service.setDemo({adminResult:'SUCCESS'});await service.reviewFabric('fabric-pending-1','POSTED');
  assert.equal(service.getState().fabrics.find(f=>f.id==='fabric-pending-1').status,'POSTED');
});

test('pickup marks a roll sold out when its leftover is below the 90cm sales unit',async()=>{
 const service=api();await service.setRole('SELLER');await service.updateFabric('fabric-roll-1',{remaining_length_cm:100});
 await service.setRole('BUYER');const r=await service.createReservation({...pickup(),requested_length_cm:90});
 await service.setRole('SELLER');await service.updateReservation(r.id,'ACCEPTED');await service.updateReservation(r.id,'PICKED_UP');
 const f=service.getState().fabrics.find(f=>f.id==='fabric-roll-1');assert.equal(f.remaining_length_cm,10);assert.equal(f.status,'SOLD_OUT');
});

test('deleting a confirmed local record clears its unresolved upload and permits another registration',async()=>{
 for(const result of ['UNKNOWN','SUCCESS']){
  const service=api();await registerReady(service);await service.setDemo({createResult:result,uploadResult:'PARTIAL'});
  const first=await service.createFabric();if(result==='SUCCESS')await service.uploadPhotos();
  await service.deleteFabric(first.id);assert.equal(service.getState().upload,null);
  await service.saveDraft(draft);const second=await service.createFabric();assert.notEqual(first.id,second.id);
 }
});

test('resubmission synchronizes removed photos and blocks publication until a replacement exists',async()=>{
 const service=api();await service.setRole('ADMIN');await service.reviewFabric('fabric-pending-1','REJECTED','사진 보완');
 await service.setRole('SELLER');await service.updateFabric('fabric-pending-1',{photo_names:[],photo_slots:{}});
 await service.setRole('ADMIN');await assert.rejects(service.reviewFabric('fabric-pending-1','POSTED'),{code:'IMAGE_REQUIRED'});
 await service.setRole('SELLER');await service.updateFabric('fabric-pending-1',{photo_names:['replacement.png'],photo_slots:{FULL:'replacement.png'}});
 await service.setRole('ADMIN');await service.reviewFabric('fabric-pending-1','POSTED');
 assert.deepEqual(service.getState().fabrics.find(f=>f.id==='fabric-pending-1').photos,['replacement.png']);
});

test('selling the last available scrap automatically rejects other pending requests',async()=>{
 const seed=createSeed();seed.reservations=['a','b'].map((id,i)=>({id,fabric_id:'fabric-scrap-1',buyer_id:`buyer-${i+1}`,seller_id:'seller-1',sale_type:'SCRAP',status:'REQUESTED'}));
 const service=createMockApi({getItem:()=>JSON.stringify(seed),setItem:()=>{}});await service.setRole('SELLER');
 await service.updateReservation('a','ACCEPTED');await service.updateReservation('a','PICKED_UP');
 assert.equal(service.getState().reservations.find(r=>r.id==='b').status,'REJECTED');
 await assert.rejects(service.updateReservation('b','ACCEPTED'),{code:'FABRIC_NOT_AVAILABLE'});
});

test('store rename is reflected on previously registered fabric cards',async()=>{
 const service=api();await service.setRole('SELLER');await service.saveStore({store_name:'새 매장명'});
 assert(service.getState().fabrics.filter(f=>f.seller_id==='seller-1').every(f=>f.store_name==='새 매장명'));
});
