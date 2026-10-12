import { Badge, Button, Notice } from './ui.jsx';
import { useRef } from 'react';
import { HOME } from '../app/store.js';

const buyerLinks = [['홈', '/buyer/home'], ['원단목록', '/buyer/fabrics'], ['부자재 찾기', '/buyer/supplies'], ['구매내역', '/buyer/reservations'], ['문의내역', '/buyer/inquiries'], ['관심', '/buyer/favorites'], ['마이페이지', '/buyer/profile']];
const sellerLinks = [['홈', '/seller/dashboard'], ['내 원단', '/seller/fabrics'], ['원단 등록', '/seller/register'], ['픽업 예약', '/seller/reservations'], ['문의내역', '/seller/inquiries'], ['마이페이지', '/seller/profile']];
const adminLinks = [['대시보드 홈', '/admin/dashboard'], ['판매자 승인', '/admin/sellers'], ['상품목록', '/admin/fabrics'], ['원단 게시 승인', '/admin/approvals']];

function MobileMenu({ links, activePath, routeKey, label, logout }) {
  const menu = useRef(null), trigger = useRef(null);
  const close = () => { if (menu.current) menu.current.open = false; trigger.current?.focus({ preventScroll: true }); };
  return <details className="mobile-menu" key={routeKey} ref={menu} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <summary ref={trigger} aria-label={`${label} 전체 메뉴`}>메뉴 <span aria-hidden="true">☰</span></summary>
    <div className="mobile-menu-panel">
      <nav className="mobile-menu-links" aria-label={`${label} 모바일 메뉴`}>{links.map(([text, href]) => <a key={href} href={`#${href}`} aria-current={activePath.startsWith(href) ? 'page' : undefined} onClick={event => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) close(); }}>{text}</a>)}</nav>
      <div className="mobile-menu-account"><span>{label}</span><Button onClick={logout}>로그아웃</Button></div>
    </div>
  </details>;
}

export function Logo({ role, dark = false }) {
  return <a className="brand" href={`#${HOME[role]}`} aria-label={`섬유 루프 ${role === 'SELLER' ? '판매자' : role === 'ADMIN' ? '관리자' : '구매자'} 홈`}>
    <img src={`/assets/figma/${dark ? 'logo-light' : 'logo'}.svg`} width="28" height="28" alt="" /><span>섬유 루프</span>
  </a>;
}

export default function AppShell({ ctx, children, footer }) {
  const { path, query, role, logout } = ctx;
  const buyerConnectedPage = ['/buyer', '/buyer/home', '/buyer/fabrics', '/buyer/filters', '/buyer/reservations', '/buyer/patterns', '/buyer/inquiries', '/buyer/favorites', '/buyer/profile'].includes(path)
    || ['/buyer/fabrics/', '/buyer/pickup/', '/buyer/reservations/', '/buyer/errors/', '/buyer/patterns/', '/buyer/recommendations/'].some(prefix => path.startsWith(prefix));
  const sellerConnectedPage = ['/seller', '/seller/dashboard', '/seller/calendar', '/seller/reservations', '/seller/fabrics', '/seller/register', '/seller/upload', '/seller/store', '/seller/profile', '/seller/profile/saved', '/seller/approval'].includes(path)
    || path === '/seller/inquiries' || ['/seller/reservations/', '/seller/fabrics/', '/seller/register/', '/seller/inquiries/'].some(prefix => path.startsWith(prefix));
  const adminConnectedPage = role === 'ADMIN' && (path === '/admin' || path.startsWith('/admin/'));
  const showConnectionScope = ctx.mode === 'live' && !path.startsWith('/auth/') && path !== '/preview' && !buyerConnectedPage && !sellerConnectedPage && !adminConnectedPage;
  const scopeMessage = role === 'BUYER'
    ? '원단 조회·추천·픽업 예약, 원단별 문의·답변, 관심 저장과 회원 정보 수정은 연결되어 있어요. 이 화면은 아직 예시 정보입니다.'
    : role === 'SELLER'
      ? '개인 정보·매장 관리, 직접·AI 보조 원단 등록, 예약 처리, 받은 문의·답변과 대시보드는 연결되어 있어요. 이 화면은 아직 예시 정보입니다.'
      : '판매자·원단 조회와 승인·거절, 대시보드 통계가 연결되어 있어요.';
  const showStoreError = ctx.mode === 'live' && role === 'SELLER' && !path.startsWith('/auth/') && ctx.state.storeError;
  const main = <main className="main-content" id="main-content">{showConnectionScope || showStoreError ? <div className="stack">{showConnectionScope && <Notice>{scopeMessage}</Notice>}{showStoreError && <Notice tone="error">{ctx.state.storeError}</Notice>}{children}</div> : children}</main>;
  if ((path.startsWith('/auth/') && !path.endsWith('/session-expired')) || path === '/preview' || path === '/seller/upload') {
    const classes = path === '/seller/upload' ? 'upload-shell' : `auth-shell${path === '/preview' ? ' preview-shell' : ''}`;
    return <div className={`shell app-shell ${classes}`}><header className="auth-header"><Logo role={role} /></header>{main}{footer}</div>;
  }
  if (role === 'ADMIN') {
    const approvalScreen = path === '/admin/error' || query.get('from') === 'approvals' || (path.startsWith('/admin/fabrics/') && (query.has('action') || query.has('result')));
    const activePath = approvalScreen ? '/admin/approvals' : path;
    return <div className="shell app-shell admin-shell"><aside className="admin-sidebar"><Logo role={role} dark /><small>관리자 워크스페이스</small>
      <MobileMenu links={adminLinks} activePath={activePath} routeKey={`${path}?${query}`} label="관리자" logout={logout} />
      <nav className="admin-nav" aria-label="관리자 메뉴">{adminLinks.map(([label, href]) => <a key={href} className="button" href={`#${href}`} aria-current={activePath.startsWith(href) ? 'page' : undefined}>{label}</a>)}</nav>
      <div className="admin-sidebar-footer"><small>MY · 운영 관리자</small><Button data-logout="ADMIN" onClick={logout}>로그아웃</Button></div>
    </aside><div className="admin-workspace"><header className="admin-topbar"><span>양주 섬유 루프 / 운영 관리</span><Badge>ADMIN</Badge></header>{main}{footer}</div></div>;
  }
  const links = role === 'SELLER' ? sellerLinks : buyerLinks;
  return <div className="shell app-shell"><header className="site-header"><Logo role={role} /><nav className="site-nav" aria-label={`${role === 'SELLER' ? '판매자' : '구매자'} 메뉴`}>
    {links.map(([label, href]) => <a key={href} href={`#${href}`} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</a>)}
  </nav><Badge>{role === 'SELLER' ? '판매자' : '구매자'}</Badge><MobileMenu links={links} activePath={path} routeKey={`${path}?${query}`} label={role === 'SELLER' ? '판매자' : '구매자'} logout={logout} /></header>{main}{footer}</div>;
}
