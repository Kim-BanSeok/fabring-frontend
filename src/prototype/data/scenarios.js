import { createSeed } from './seed.js';
import { createMockApi } from '../services/mock-api.js';

// Isolated, editable examples for the screen index. Never overwrite the user's saved demo.
export function createScenarioApi(nodeId) {
  const state=createSeed();
  state.seller.seller_approval_status='APPROVED';
  state.sellers[0].seller_approval_status='APPROVED';
  const fabric=id=>state.fabrics.find(f=>f.id===id);
  const roll=fabric('fabric-roll-1');
  const samplePending=fabric('fabric-pending-1');
  const statusMap={
    '127:4434':'REQUESTED','127:4492':'REQUESTED','127:4541':'REQUESTED','127:4599':'REQUESTED',
    '127:4648':'ACCEPTED','127:4756':'ACCEPTED','127:4808':'ACCEPTED','127:4860':'PICKED_UP',
    '127:4960':'REJECTED','127:5025':'CANCELED','123:4387':'REQUESTED','127:7402':'REQUESTED',
    '127:7558':'REQUESTED','127:7692':'REQUESTED','127:7829':'ACCEPTED','127:7974':'ACCEPTED',
    '127:7621':'ACCEPTED','127:7753':'REJECTED','127:7892':'PICKED_UP','127:8022':'CANCELED',
    '129:5726':'PICKED_UP','142:6789':'ACCEPTED','142:6919':'ACCEPTED','142:7090':'ACCEPTED',
  };
  const pickupDate=new Date();pickupDate.setDate(pickupDate.getDate()+3);
  if(statusMap[nodeId]){
    const status=statusMap[nodeId];
    state.reservations=[{id:'reservation-scenario',fabric_id:roll.id,fabric_title:roll.title,buyer_id:state.buyer.id,buyer_nickname:state.buyer.nickname,seller_id:state.seller.id,sale_type:'ROLL',requested_length_cm:180,pickup_date:pickupDate.toLocaleDateString('en-CA'),pickup_time:'14:00',memo:'오후에 방문할게요.',status,estimated_price:10000,display_price:10000,created_at:'2026-10-11',reject_reason:status==='REJECTED'?'요청하신 날짜에 매장이 쉬어요.':null}];
    if(status==='ACCEPTED'){roll.reserved_length_cm=180;roll.available_length_cm=270;}
    if(status==='PICKED_UP'){roll.remaining_length_cm=270;roll.available_length_cm=270;}
    const month={'142:6789':'09','142:6919':'10','142:7090':'11'}[nodeId];
    if(month)state.reservations[0].pickup_date=`2026-${month}-15`;
  }
  if(['123:4559','127:8098'].includes(nodeId))state.inquiries=[{id:'inquiry-scenario',fabric_id:roll.id,fabric_title:roll.title,content:'이 원단은 세탁 후 수축이 있나요?',is_private:false,answer:nodeId==='127:8098'?'찬물 단독 세탁을 권해요. 제작 전에 소량 테스트해 주세요.':null,created_at:'2026-10-11'}];
  const scrap=['127:6196','127:6325','127:6410','127:8297','210:8648'].includes(nodeId);
  state.draft={title:scrap?'블루 스트라이프 코튼':'내추럴 코튼 캔버스',sale_type:scrap?'SCRAP':'ROLL',width_cm:150,length_cm:scrap?90:null,remaining_length_cm:scrap?null:450,price:5000,material:'면',thickness:'중간 두께',color:scrap?'블루':'내추럴',has_defect:false,defect_note:'',description:'소품 제작에 쓰기 좋은 면 원단입니다.',photo_names:['전체사진.png','확대사진.png'],photo_slots:{FULL:'전체사진.png',ZOOM:'확대사진.png'},ai_request:'면 원단이 5마 정도 남았어요. 폭은 150cm예요.'};
  if(scrap) Object.assign(state.draft,{title:'포근한 더블 거즈',width_cm:110,length_cm:80,price:8000,color:'흰색',thickness:'얇음'});
  state.ai={status:'READY',sale_type:state.draft.sale_type,message:state.draft.ai_request,draft:structuredClone(state.draft)};
  if(nodeId==='127:8297')state.draft={...state.draft,title:'',length_cm:20};
  const stage={'210:8608':'CREATING','210:8618':'UPLOADING','210:8628':'PARTIAL','210:8638':'UNKNOWN','127:6713':'DONE','210:8648':'DONE'}[nodeId];
  if(stage){Object.assign(samplePending,state.draft,{photos:stage==='DONE'?state.draft.photo_names:stage==='PARTIAL'?['전체사진.png']:[]});state.upload={fabric_id:samplePending.id,stage,photo_names:[...state.draft.photo_names],failed_count:stage==='PARTIAL'?1:0};}
  if(['209:8131','209:8167','123:5272','123:5138','210:8380','210:8462','210:8185'].includes(nodeId))state.seller.seller_approval_status=['209:8167','210:8462','210:8185'].includes(nodeId)?'REJECTED':nodeId==='210:8380'?'APPROVED':'PENDING';
  if(['127:5978','127:5855','144:6910','127:2633','127:2540'].includes(nodeId))state.seller.hasStore=false;
  if(nodeId==='144:6910'){state.fabrics=state.fabrics.filter(f=>f.seller_id!==state.seller.id);state.seller.seller_approval_status='PENDING';}
  if(['127:7011','127:7322','131:10037','131:10401','131:10493','156:9578','123:6292'].includes(nodeId))Object.assign(samplePending,{status:'REJECTED',reject_reason:'전체 길이를 확인할 수 있도록 치수와 사진을 보완해 주세요.'});
  if(['131:9772','131:10309'].includes(nodeId))samplePending.status='POSTED';
  if(nodeId==='127:7076')Object.assign(fabric('fabric-scrap-1'),{status:'SOLD_OUT'});
  if(nodeId==='127:7497')fabric('fabric-scrap-1').deleted_at=new Date().toISOString();
  if(nodeId==='205:7988')state.fabrics=state.fabrics.filter(f=>f.status!=='POSTED');
  if(nodeId==='205:8052')state.fabrics=state.fabrics.filter(f=>f.status!=='REJECTED');
  if(nodeId==='131:9520')state.fabrics=state.fabrics.filter(f=>f.status!=='PENDING');
  Object.assign(state.sellers[0],state.seller);
  const initial=JSON.stringify(state);
  return createMockApi({getItem:()=>initial,setItem:()=>{}});
}
