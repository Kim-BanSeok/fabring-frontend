import './styles/base.css';
import './pages/buyer.css';
import './pages/seller.css';
import './pages/admin.css';
import './pages/auth.css';
import { renderBuyer, bindBuyer } from './pages/buyer.js';
import { renderSeller, bindSeller } from './pages/seller.js';
import { renderAdmin, bindAdmin } from './pages/admin.js';
import { renderAuth, bindAuth } from './pages/auth.js';
import { renderPreview, bindPreview } from './pages/preview.js';
import { createMockApi } from './services/mock-api.js';
import { createScenarioApi } from './data/scenarios.js';
import { shell, reviewTools } from './shared/shell.js';
import { button, emptyState, escapeHtml } from './shared/ui.js';

const savedApi = createMockApi();
// Unsaved form values live only for this tab and are isolated from gallery scenarios.
const draftStores = new WeakMap();
let api = savedApi, activeScenario = '';
const root = document.getElementById('app');
const toast = document.getElementById('feedback');
let cleanup, renderId = 0, toastTimer, renderedRole;
const home = { BUYER:'/buyer/home',SELLER:'/seller/dashboard',ADMIN:'/admin/dashboard' };
function navigate(path, { replace = false } = {}) {
  const hash = `#${path.replace(/^#/,'')}`;
  if (replace) {
    history.replaceState(null, '', hash);
    window.scrollTo(0, 0);
    return render().then(() => root.querySelector('h1')?.focus({ preventScroll: true }));
  }
  if (location.hash === hash) return render();
  location.hash = hash;
}
function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  // Actions may navigate immediately after notifying; attach feedback to that result route.
  queueMicrotask(() => { toast.dataset.route = location.hash; });
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 5000);
}
async function render() {
  const token = ++renderId;
  cleanup?.(); cleanup = undefined;
  const [rawPath, search=''] = location.hash.slice(1).split('?');
  const path = (rawPath || '/preview').replace(/\/$/,'');
  const query = new URLSearchParams(search);
  const requestedScenario = query.get('scenario');
  if(path === '/preview') { api = savedApi; activeScenario = ''; }
  else if(requestedScenario && /^\d+:\d+$/.test(requestedScenario) && requestedScenario !== activeScenario) { api = createScenarioApi(requestedScenario); activeScenario = requestedScenario; }
  const isAuth = path.startsWith('/auth/');
  const rolePath = isAuth ? path.split('/')[2] : path.split('/')[1];
  const role = rolePath === 'seller' ? 'SELLER' : rolePath === 'admin' ? 'ADMIN' : 'BUYER';
  await api.setRole(role);
  if (token !== renderId) return;
  const state = api.getState();
  if (!draftStores.has(api)) draftStores.set(api, new Map());
  const drafts = draftStores.get(api);
  if ((renderedRole && renderedRole !== role) || (toast.dataset.route && toast.dataset.route !== location.hash)) { clearTimeout(toastTimer); toast.textContent = ''; }
  renderedRole = role;
  const ctx = { path, query, state, root, navigate, refresh:render, notify, api, drafts, scenario:activeScenario };
  const toolsOpen = document.querySelector('.prototype-tools')?.open;
  try {
    let content;
    if (path === '/preview') content = renderPreview(ctx);
    else if (isAuth) content = renderAuth(ctx);
    else content = (role === 'SELLER' ? renderSeller : role === 'ADMIN' ? renderAdmin : renderBuyer)(ctx);
    root.innerHTML = shell(role,path,content) + reviewTools(state, activeScenario);
    if (toolsOpen) root.querySelector('.prototype-tools').open = true;
    if (path === '/preview') cleanup = bindPreview(ctx);
    else if (isAuth) cleanup = bindAuth(ctx);
    else cleanup = (role === 'SELLER' ? bindSeller : role === 'ADMIN' ? bindAdmin : bindBuyer)(ctx);
    root.querySelectorAll('[data-preview-role]').forEach(b=>b.addEventListener('click',()=>navigate(home[b.dataset.previewRole])));
    root.querySelector('[data-preview-reset]').addEventListener('click',async()=>{drafts.clear();await api.reset();notify('예시 데이터를 초기화했어요.');navigate('/preview');});
    root.querySelector('[name=demoApproval]').addEventListener('change',async e=>{await api.setDemo({seller_approval_status:e.target.value});render();});
    root.querySelector('[data-preview-store]').addEventListener('change',async e=>{await api.setDemo({hasStore:e.target.checked});render();});
    root.querySelector('[name=demoCreate]').addEventListener('change',async e=>{await api.setDemo({createResult:e.target.value});render();});
    root.querySelector('[name=demoUpload]').addEventListener('change',async e=>{await api.setDemo({uploadResult:e.target.value});render();});
    root.querySelector('[name=demoAdmin]').addEventListener('change',async e=>{await api.setDemo({adminResult:e.target.value});render();});
    root.querySelectorAll('[data-logout]').forEach(control=>control.addEventListener('click',async()=>{drafts.clear();await api.logoutDemo();navigate(`/auth/${role.toLowerCase()}/login`);}));
    document.title = `${root.querySelector('h1')?.textContent || '섬유 루프'} · 섬유 루프`;
  } catch (error) {
    console.error(error);
    root.innerHTML = shell(role,path,emptyState('화면을 불러오지 못했어요',escapeHtml(error.message),button('화면 안내로',{href:'/preview'})))+reviewTools(state);
  }
}
document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); const main = document.getElementById('main-content'); if (main) { main.tabIndex = -1; main.focus(); } });
window.addEventListener('hashchange',()=>{window.scrollTo(0,0);render().then(()=>root.querySelector('h1')?.focus({preventScroll:true}));});
render();
