import coverage from '../data/screen-coverage.json';
import { escapeHtml as esc, pageHeading, notice, button, field } from '../shared/ui.js';

const roles = [['buyer','구매자'],['seller','판매자'],['admin','관리자']];
const rows = data => `<dl class="preview-details">${data.map(([label, text])=>`<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`).join('')}</dl>`;

export function renderPreview(ctx) {
  const selected = ctx.query.get('role');
  if (roles.some(([role])=>role===selected)) {
    const label = roles.find(([role])=>role===selected)[1];
    const query=(ctx.query.get('q')||'').trim().toLowerCase();
    const screens=coverage.filter(s=>s.role===selected && !s.hold && (!query || `${s.name} ${s.nodeId}`.toLowerCase().includes(query)));
    return `<section class="preview-page stack" data-figma-node="${{buyer:'133:6803',seller:'133:7124',admin:'133:7415'}[selected]}">${pageHeading(`${label} · 화면·상태 목록`,'시작 화면에서 전체 흐름을 따라가거나, 확인할 상태를 바로 열어보세요.')}${notice('상태 예시는 실제 처리 결과와 구분됩니다. 입력·예약·답변은 이 브라우저의 시연 데이터에만 저장됩니다.')}<div class="actions">${button(`${label} 시작`,{href:`/auth/${selected}/login`,tone:'primary'})}${button('전체 흐름으로',{href:'/preview'})}</div><form id="preview-filter" class="form-grid">${field('화면 이름 검색','q',{value:ctx.query.get('q')||'',attrs:'placeholder="예: 가입, 거절, 문의"'})}<div class="actions">${button('찾기',{type:'submit'})}${button('전체 목록',{href:`/preview?role=${selected}`})}</div></form><p class="muted">연결된 화면·상태 ${screens.length}개</p><ul class="preview-screen-list">${screens.map(s=>`<li><a href="#${esc(s.route)}"><span>${esc(s.name.replace(/^[^·]+ · /,''))}</span><small>${esc(s.mode==='state'?'상태 예시':s.mode==='data'?'데이터별 화면':'화면')} →</small></a></li>`).join('')}</ul></section>`;
  }
  return `<section class="preview-page stack" data-figma-node="133:6724">${pageHeading('전체 흐름 · 연결 작업본','구매자 · 판매자 · 관리자 / HTML에서 확인하는 전체 흐름')}${notice('화면 안의 버튼을 눌러 다음 단계와 결과를 확인하세요. 실제 서버·로그인·AI·지도 API를 사용하지 않는 시연입니다. 비밀번호는 저장하지 않습니다.')}<section class="panel"><h2>회원가입과 첫 진입</h2>${rows([['구매자','회원가입 → 가입 완료 → 로그인 → 메인'],['판매자','가입 → 매장 등록 → 판매자 승인 → 원단 등록'],['관리자','로그인 → 대시보드 · 공개 회원가입 없음']])}</section><div class="actions">${roles.map(([role,label])=>button(`${label} 시작`,{href:`/auth/${role}/login`,tone:'primary'})).join('')}</div><div class="actions">${roles.slice(0,2).map(([role,label])=>button(`${label} 회원가입`,{href:`/auth/${role}/signup`})).join('')}</div><section class="panel"><h2>연결된 핵심 과정</h2>${rows([['원단 등록','등록 방법 → 직접/AI 예시 입력 → 검토 → 등록·사진 업로드 → 승인 대기'],['픽업 거래','요청 → 판매자 수락 → 예약 확보 → 판매자 수령 확인 / 취소 시 확보 해제'],['판매 단위','자투리 1장 전체 / 롤 90cm(1마) 단위 · 상품별 치수·단가 표시'],['운영 검수','판매자 승인과 원단 게시 승인을 각각 검토·처리']])}</section><div class="actions">${roles.map(([role,label])=>button(`${label} 화면·상태 목록`,{href:`/preview?role=${role}`})).join('')}</div><small class="muted">최신 작업본의 활성 화면을 공통 페이지와 상태로 연결했습니다. API 명세에 맞춰 보류한 이메일·비밀번호 변경, 관리자 구매자 조회 등 8개 화면은 포함하지 않습니다. 로그인은 이메일 형식과 비밀번호 입력을 확인하는 시연이며 실제 계정 인증은 하지 않습니다.</small></section>`;
}

export function bindPreview(ctx) {
  const form=ctx.root.querySelector('#preview-filter');
  const submit=event=>{event.preventDefault();ctx.navigate(`/preview?role=${ctx.query.get('role')}&q=${encodeURIComponent(new FormData(form).get('q')||'')}`);};
  form?.addEventListener('submit',submit);
  return()=>form?.removeEventListener('submit',submit);
}
