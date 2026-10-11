import { escapeHtml, badge, button, selectField } from './ui.js';
const home = { BUYER: '/buyer/home', SELLER: '/seller/dashboard', ADMIN: '/admin/dashboard' };
const buyerLinks = [['홈','/buyer/home'],['원단목록','/buyer/fabrics'],['부자재 찾기','/buyer/supplies'],['구매내역','/buyer/reservations'],['문의내역','/buyer/inquiries'],['마이페이지','/buyer/profile']];
const sellerLinks = [['홈','/seller/dashboard'],['내 원단','/seller/fabrics'],['원단 등록','/seller/register'],['픽업 예약','/seller/reservations'],['문의내역','/seller/inquiries'],['마이페이지','/seller/profile']];
export function logo(role, dark = false) { return `<a class="brand" href="#${home[role]}" aria-label="섬유 루프 ${role === 'SELLER' ? '판매자' : role === 'ADMIN' ? '관리자' : '구매자'} 홈"><img src="/assets/figma/${dark ? 'logo-light' : 'logo'}.svg" width="28" height="28" alt=""><span>섬유 루프</span></a>`; }
export function shell(role, path, content) {
  if ((path.startsWith('/auth/') && !path.endsWith('/session-expired')) || path.startsWith('/preview')) {
    return `<div class="shell auth-shell${path.startsWith('/preview')?' preview-shell':''}"><header class="auth-header">${logo(role)}</header><main class="main-content" id="main-content">${content}</main></div>`;
  }
  if (role === 'SELLER' && path === '/seller/upload') {
    return `<div class="shell upload-shell"><header class="auth-header">${logo(role)}</header><main class="main-content" id="main-content">${content}</main></div>`;
  }
  if (role === 'ADMIN') {
    const approvalScreen = /data-figma-node="(?:131:9697|131:9893|131:9772|131:10037|131:10248)"/.test(content);
    const activePath = approvalScreen ? '/admin/approvals' : path;
    const links = [['대시보드 홈','/admin/dashboard'],['판매자 승인','/admin/sellers'],['상품목록','/admin/fabrics'],['원단 게시 승인','/admin/approvals']];
    return `<div class="shell admin-shell"><aside class="admin-sidebar">${logo(role,true)}<small>관리자 워크스페이스</small><nav class="admin-nav" aria-label="관리자 메뉴">${links.map(([label,href])=>`<a class="button" href="#${href}" ${activePath.startsWith(href) ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="admin-sidebar-footer"><small>MY · 운영 관리자</small>${button('로그아웃',{attrs:'data-logout="ADMIN"'})}</div></aside><div><header class="admin-topbar"><span>양주 섬유 루프 / 운영 관리</span>${badge('ADMIN')}</header><main class="main-content" id="main-content">${content}</main></div></div>`;
  }
  const links = role === 'SELLER' ? sellerLinks : buyerLinks;
  const activePath = path;
  return `<div class="shell"><header class="site-header">${logo(role)}<nav class="site-nav" aria-label="${role === 'SELLER' ? '판매자' : '구매자'} 메뉴">${links.map(([label,href])=>`<a href="#${href}" ${activePath.startsWith(href) ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>${badge(role === 'SELLER' ? '판매자' : '구매자')}</header><main class="main-content" id="main-content">${content}</main></div>`;
}
export function reviewTools(state, scenario = '') {
  return `<details class="prototype-tools"><summary>HTML 미리보기 · ${scenario ? '상태 예시' : '예시 데이터'}</summary><section>${scenario ? '<p class="notice">화면 목록에서 연 상태 예시입니다. 여기서 진행한 작업은 기존 시연 데이터에 저장되지 않습니다.</p>' : ''}<p>이 브라우저에만 저장되는 시연용 화면입니다. 실제 로그인·주문·업로드는 발생하지 않습니다.</p><div class="actions">${['BUYER','SELLER','ADMIN'].map((role,i)=>button(['구매자','판매자','관리자'][i],{tone:state.session.role===role?'primary':'secondary',attrs:`data-preview-role="${role}"`})).join('')}</div>${selectField('판매자 승인 상태','demoApproval',[{value:'PENDING',label:'승인 대기'},{value:'APPROVED',label:'승인 완료'},{value:'REJECTED',label:'승인 거절'}],state.seller.seller_approval_status)}<label><input type="checkbox" data-preview-store ${state.seller.hasStore?'checked':''}> 매장 정보 등록됨</label>${selectField('등록 응답 시연','demoCreate',[{value:'SUCCESS',label:'정상 응답'},{value:'UNKNOWN',label:'응답 유실'}],state.demo.createResult)}${selectField('사진 업로드 시연','demoUpload',[{value:'SUCCESS',label:'모두 성공'},{value:'PARTIAL',label:'일부 실패'}],state.demo.uploadResult)}${selectField('원단 승인 응답 시연','demoAdmin',[{value:'SUCCESS',label:'정상 응답'},{value:'ERROR',label:'연결 오류'}],state.demo.adminResult || 'SUCCESS')}<div class="actions">${button('예시 데이터 초기화',{attrs:'data-preview-reset'})}${button('전체 화면·상태',{href:'/preview'})}</div><a href="https://www.figma.com/design/uYO6eu041WwmEBKAfA7a6Y?node-id=122-12" target="_blank" rel="noreferrer">기준 Figma 작업본</a><div class="actions">${button('로그인 화면',{href:'/auth/' + state.session.role.toLowerCase() + '/login'})}${button('로그아웃',{attrs:'data-logout'})}</div><small>실제 계정 인증 없이 입력 형식만 확인하는 시연입니다.</small><small>현재 역할: ${escapeHtml(state.session.role)}</small></section></details>`;
}
