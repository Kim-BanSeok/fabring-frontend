import { Badge, Button, Notice } from './ui.jsx';
import { HOME } from '../app/store.js';

const buyerLinks = [['홈', '/buyer/home'], ['원단목록', '/buyer/fabrics'], ['부자재 찾기', '/buyer/supplies'], ['구매내역', '/buyer/reservations'], ['문의내역', '/buyer/inquiries'], ['마이페이지', '/buyer/profile']];
const sellerLinks = [['홈', '/seller/dashboard'], ['내 원단', '/seller/fabrics'], ['원단 등록', '/seller/register'], ['픽업 예약', '/seller/reservations'], ['문의내역', '/seller/inquiries'], ['마이페이지', '/seller/profile']];
const adminLinks = [['대시보드 홈', '/admin/dashboard'], ['판매자 승인', '/admin/sellers'], ['상품목록', '/admin/fabrics'], ['원단 게시 승인', '/admin/approvals']];

export function Logo({ role, dark = false }) {
  return <a className="brand" href={`#${HOME[role]}`} aria-label={`섬유 루프 ${role === 'SELLER' ? '판매자' : role === 'ADMIN' ? '관리자' : '구매자'} 홈`}>
    <img src={`/assets/figma/${dark ? 'logo-light' : 'logo'}.svg`} width="28" height="28" alt="" /><span>섬유 루프</span>
  </a>;
}

export default function AppShell({ ctx, children, footer }) {
  const { path, query, role, logout } = ctx;
  const showConnectionScope = ctx.mode === 'live' && !path.startsWith('/auth/') && path !== '/preview';
  const main = <main className="main-content" id="main-content">{showConnectionScope ? <div className="stack"><Notice>로그인·계정·매장 조회만 연결되어 있어요. 원단·예약 등의 빈 목록과 수치는 실제 조회 결과가 아니며, 정보 수정과 업무 처리는 아직 저장되지 않습니다.</Notice>{ctx.state.storeError && <Notice tone="error">{ctx.state.storeError}</Notice>}{children}</div> : children}</main>;
  if ((path.startsWith('/auth/') && !path.endsWith('/session-expired')) || path === '/preview' || path === '/seller/upload') {
    const classes = path === '/seller/upload' ? 'upload-shell' : `auth-shell${path === '/preview' ? ' preview-shell' : ''}`;
    return <div className={`shell app-shell ${classes}`}><header className="auth-header"><Logo role={role} /></header>{main}{footer}</div>;
  }
  if (role === 'ADMIN') {
    const approvalScreen = path === '/admin/error' || (path.startsWith('/admin/fabrics/') && (query.has('action') || query.has('result')));
    const activePath = approvalScreen ? '/admin/approvals' : path;
    return <div className="shell app-shell admin-shell"><aside className="admin-sidebar"><Logo role={role} dark /><small>관리자 워크스페이스</small>
      <nav className="admin-nav" aria-label="관리자 메뉴">{adminLinks.map(([label, href]) => <a key={href} className="button" href={`#${href}`} aria-current={activePath.startsWith(href) ? 'page' : undefined}>{label}</a>)}</nav>
      <div className="admin-sidebar-footer"><small>MY · 운영 관리자</small><Button data-logout="ADMIN" onClick={logout}>로그아웃</Button></div>
    </aside><div className="admin-workspace"><header className="admin-topbar"><span>양주 섬유 루프 / 운영 관리</span><Badge>ADMIN</Badge></header>{main}{footer}</div></div>;
  }
  const links = role === 'SELLER' ? sellerLinks : buyerLinks;
  return <div className="shell app-shell"><header className="site-header"><Logo role={role} /><nav className="site-nav" aria-label={`${role === 'SELLER' ? '판매자' : '구매자'} 메뉴`}>
    {links.map(([label, href]) => <a key={href} href={`#${href}`} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</a>)}
  </nav><Badge>{role === 'SELLER' ? '판매자' : '구매자'}</Badge></header>{main}{footer}</div>;
}
