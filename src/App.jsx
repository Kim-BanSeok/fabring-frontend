import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import AppShell from './react/components/AppShell.jsx';
import ReviewTools from './react/components/ReviewTools.jsx';
import { Button, EmptyState } from './react/components/ui.jsx';
import { NAVIGATION_FOCUS_TARGETS, isFactoryRoute, pageMountKey } from './react/app/store.js';

// Load the current role's screens without downloading every role's UI at entry.
const loadPage = factory => lazy(async () => {
  const { default: Page } = await factory();
  return { default: function LoadedPage({ ctx }) {
    const entered = useRef(false);
    useLayoutEffect(() => {
      const heading = document.querySelector('#main-content h1, #main-content .empty-state h2');
      document.title = `${heading?.textContent || '패브링'} · 패브링`;
      if (!entered.current) {
        entered.current = true;
        const restore = ctx.scrollRestoration?.hash === window.location.hash ? ctx.scrollRestoration : null;
        const selector = NAVIGATION_FOCUS_TARGETS[restore?.focusTarget];
        const target = selector ? document.querySelector('#main-content')?.querySelector(selector) : null;
        (target || heading)?.focus({ preventScroll: true });
      }
    });
    return <Page ctx={ctx} />;
  } };
});
const PreviewPage = loadPage(() => import('./react/pages/PreviewPage.jsx'));
const AuthPage = loadPage(() => import('./react/pages/AuthPage.jsx'));
const BuyerPage = loadPage(() => import('./react/pages/BuyerPage.jsx'));
const SellerPage = loadPage(() => import('./react/pages/SellerPage.jsx'));
const AdminPage = loadPage(() => import('./react/pages/AdminPage.jsx'));

class PageErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (this.state.error) return <EmptyState title="화면을 불러오지 못했어요" description={this.state.error.message}><Button href="/auth/buyer/login">다시 시작하기</Button></EmptyState>;
    return this.props.children;
  }
}

function RoutePage({ ctx }) {
  if (ctx.path === '/preview') return <PreviewPage ctx={ctx} />;
  if (ctx.path.startsWith('/auth/')) return <AuthPage ctx={ctx} />;
  if (ctx.mode === 'live' && isFactoryRoute(ctx.path)) return <BuyerPage ctx={ctx} />;
  if (ctx.mode === 'live' && ctx.auth.status !== 'authenticated') {
    const { status, error } = ctx.auth;
    const loading = status === 'restoring';
    const title = loading ? '로그인 정보를 확인하고 있어요' : status === 'unavailable' ? '계정 연결을 확인해 주세요' : status === 'expired' ? '다시 로그인해 주세요' : '로그인이 필요해요';
    return <EmptyState title={title} description={error || (loading ? '잠시만 기다려 주세요.' : status === 'expired' ? '로그인 유효 시간이 지났어요.' : '로그인 후 내 계정의 화면을 이용할 수 있어요.')}>
      {status === 'unavailable' && <Button onClick={ctx.retrySession} tone="primary">다시 연결</Button>}
      {!loading && <Button href={`/auth/${ctx.role.toLowerCase()}/login?mode=live`} tone="primary">로그인으로 이동</Button>}
      {import.meta.env.DEV && <Button href="/preview">전체 화면 미리보기</Button>}
    </EmptyState>;
  }
  if (ctx.role === 'SELLER') return <SellerPage ctx={ctx} />;
  if (ctx.role === 'ADMIN') return <AdminPage ctx={ctx} />;
  return <BuyerPage ctx={ctx} />;
}

export default function App({ store }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const ctx = { ...snapshot, navigate: store.navigate, refresh: store.refresh, notify: store.notify, logout: store.logout, retrySession: store.retrySession, useContest: store.useContest, useLive: store.useLive };
  const routeKey = `${snapshot.sessionId}:${snapshot.path}?${snapshot.query}`;
  const lastRoute = useRef(null);
  useEffect(() => store.connect(), [store]);
  useLayoutEffect(() => {
    const heading = document.querySelector('#main-content h1');
    document.title = `${heading?.textContent || '패브링'} · 패브링`;
    if (lastRoute.current !== routeKey) {
      const restore = snapshot.scrollRestoration?.hash === window.location.hash ? snapshot.scrollRestoration : null;
      window.scrollTo(0, restore?.top || 0);
      if (lastRoute.current !== null) {
        const selector = NAVIGATION_FOCUS_TARGETS[restore?.focusTarget];
        const target = selector ? document.querySelector('#main-content')?.querySelector(selector) : null;
        (target || heading)?.focus({ preventScroll: true });
      }
      lastRoute.current = routeKey;
    }
  });
  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main.tabIndex = -1; main.focus(); }}>본문으로 바로가기</a>
    <AppShell ctx={ctx} footer={import.meta.env.DEV || snapshot.mode === 'demo' ? <ReviewTools ctx={ctx} onReset={store.reset} /> : null}><PageErrorBoundary key={pageMountKey(snapshot)}><Suspense fallback={<section className="panel" role="status" aria-live="polite">화면을 불러오고 있어요…</section>}><RoutePage ctx={ctx} /></Suspense></PageErrorBoundary></AppShell>
    <div className="toast" id="feedback" role="status" aria-live="polite">{snapshot.toast}</div>
  </>;
}
