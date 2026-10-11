import { createMockApi } from '../../prototype/services/mock-api.js';
import { createScenarioApi } from '../../prototype/data/scenarios.js';

export const HOME = { BUYER: '/buyer/home', SELLER: '/seller/dashboard', ADMIN: '/admin/dashboard' };
// Navigation accepts named destinations, never a selector supplied through a URL.
export const NAVIGATION_FOCUS_TARGETS = Object.freeze({
  'seller-calendar-date': '.seller-calendar-day[aria-current="date"]',
  'seller-calendar-first': '.seller-calendar-day',
  'seller-photo-review': '[data-seller-action="review-photos"]',
});

export function parseRoute(hash = '') {
  const [rawPath, ...search] = hash.replace(/^#/, '').split('?');
  const path = (rawPath || '/auth/buyer/login').replace(/\/$/, '') || '/auth/buyer/login';
  const query = new URLSearchParams(search.join('?'));
  const rolePath = path.startsWith('/auth/') ? path.split('/')[2] : path.split('/')[1];
  return { path, query, role: rolePath === 'seller' ? 'SELLER' : rolePath === 'admin' ? 'ADMIN' : 'BUYER' };
}

// Live accounts, saved demos, and individual gallery scenarios have separate adapters/drafts.
// React subscribes to immutable snapshots; a URL role never changes a live account's role.
export function createAppStore({ browser = window, savedApi = createMockApi(), scenarioFactory = createScenarioApi, liveApi } = {}) {
  const listeners = new Set();
  const draftStores = new WeakMap();
  let api = savedApi, scenario = '', sessionId = 0, snapshot, toastTimer, notificationVersion = 0, scrollRestoration = null;
  let toast = { message: '', route: '', role: '' };
  let mode = liveApi ? 'live' : 'demo';
  let lastAuth = liveApi?.getAuth();
  try { if (liveApi && browser.sessionStorage?.getItem('yangju-loop-mode') === 'demo') mode = 'demo'; } catch { /* Memory-only mode is sufficient. */ }
  if (liveApi && !browser.location.hash.replace(/^#\/?$/, '')) mode = 'live';

  function emit() { listeners.forEach(listener => listener()); }
  function draftStore() {
    if (!draftStores.has(api)) draftStores.set(api, new Map());
    return draftStores.get(api);
  }
  function update() {
    if (liveApi) {
      const auth = liveApi.getAuth();
      const identityChanged = auth.user?.userId !== lastAuth.user?.userId;
      if (identityChanged || auth.revision !== lastAuth.revision) {
        draftStores.get(liveApi)?.clear();
        if (mode === 'live' && (identityChanged || (auth.status === 'expired' && lastAuth.status !== 'expired'))) sessionId++;
      }
      lastAuth = auth;
    }
    let route = parseRoute(browser.location.hash);
    const requested = route.query.get('scenario');
    const requestedMode = route.query.get('mode');
    if (liveApi && ['live', 'demo'].includes(requestedMode)) mode = requestedMode;
    if (requested && /^\d+:\d+$/.test(requested)) mode = 'demo';
    if (route.path === '/preview') mode = 'demo';
    try { browser.sessionStorage?.setItem('yangju-loop-mode', mode); } catch { /* See above. */ }
    if (mode === 'live') {
      if (api !== liveApi) { api = liveApi; scenario = ''; sessionId++; }
      const auth = liveApi.getAuth();
      if (auth.status === 'restoring') queueMicrotask(() => { if (mode === 'live') void liveApi.restore(); });
      if (auth.status === 'authenticated' && !route.path.startsWith('/auth/') && route.role !== auth.user.role) {
        browser.history.replaceState(null, '', `#${HOME[auth.user.role]}`);
        route = parseRoute(browser.location.hash);
      }
    } else if (api === liveApi) { api = savedApi; scenario = ''; sessionId++; }
    if (route.path === '/preview') {
      if (api !== savedApi) sessionId++;
      api = savedApi; scenario = '';
    } else if (requested && /^\d+:\d+$/.test(requested) && requested !== scenario) {
      api = scenarioFactory(requested); scenario = requested; sessionId++;
    }
    // The mock adapter updates synchronously; no request is made by this demo role switch.
    if (mode === 'demo') void api.setRole(route.role);
    if (toast.route && (toast.route !== browser.location.hash || toast.role !== route.role)) {
      clearTimeout(toastTimer);
      toast = { message: '', route: '', role: '' };
    }
    snapshot = { ...route, mode, auth: mode === 'live' ? liveApi.getAuth() : null, state: api.getState(), api, drafts: draftStore(), scenario, sessionId, toast: toast.message, scrollRestoration };
    emit();
    return snapshot;
  }
  function refresh() { update(); return Promise.resolve(); }
  function navigate(path, { replace = false, preserveScroll = false, scrollY, focusTarget } = {}) {
    const hash = `#${path.replace(/^#/, '')}`;
    const explicitPosition = Number.isFinite(scrollY);
    scrollRestoration = {
      hash,
      top: Math.max(0, explicitPosition ? scrollY : preserveScroll ? browser.scrollY || 0 : 0),
      focusTarget: Object.hasOwn(NAVIGATION_FOCUS_TARGETS, focusTarget) ? focusTarget : null,
    };
    if (replace) browser.history.replaceState(null, '', hash);
    else if (browser.location.hash !== hash) browser.location.hash = hash;
    update();
    return Promise.resolve();
  }
  function notify(message) {
    clearTimeout(toastTimer);
    const version = ++notificationVersion;
    // Capture the result route after a synchronous navigate() in the same action.
    queueMicrotask(() => {
      if (version !== notificationVersion) return;
      toast = { message, route: browser.location.hash, role: parseRoute(browser.location.hash).role };
      update();
      toastTimer = setTimeout(() => { toast = { message: '', route: '', role: '' }; update(); }, 5000);
    });
  }
  async function logout() {
    const role = snapshot.role;
    draftStore().clear();
    await (mode === 'live' ? api.logout() : api.logoutDemo());
    await navigate(`/auth/${role.toLowerCase()}/login`);
  }
  async function reset() {
    if (mode === 'live') return;
    draftStore().clear();
    await api.reset();
    await navigate('/preview');
    notify('예시 데이터를 초기화했어요.');
  }
  update();
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    connect: () => {
      browser.addEventListener('hashchange', update);
      const disconnect = liveApi?.subscribe(update);
      const onFocus = () => { liveApi?.checkExpiry(); if (mode === 'live') void liveApi?.restore(); };
      browser.addEventListener('focus', onFocus);
      if (mode === 'live') void liveApi?.restore();
      return () => { browser.removeEventListener('hashchange', update); browser.removeEventListener('focus', onFocus); disconnect?.(); };
    },
    navigate, refresh, notify, logout, reset, retrySession: () => liveApi?.restore(),
  };
}
