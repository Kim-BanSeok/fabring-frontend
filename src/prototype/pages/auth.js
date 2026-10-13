import { escapeHtml as e, button, field, notice, badge, fabricImage } from '../shared/ui.js';

// Transient form drafts only. Passwords never enter the persistent application state.
const drafts = new Map();
const failures = new Map();
const consentPreviews = new Map();
let pending = null;
const names = { buyer: '구매자', seller: '판매자', admin: '관리자' };
const homes = { buyer: '/buyer/home', seller: '/seller/dashboard', admin: '/admin/dashboard' };
const source = {
  buyer: { login: '123:59', signup: '123:189', error: '125:2482', processing: '125:2498', 'signup-done': '125:2508', 'signup-error': '125:2559' },
  seller: { login: '123:2190', signup: '123:2323', error: '127:2514', processing: '127:2530', 'signup-done': '127:2540', 'signup-error': '127:2591', 'first-login': '127:2633' },
  admin: { login: '123:4835', error: '127:2607', processing: '127:2623' },
};
const consentNodes = { buyer: { '00': '152:6946', '01': '152:7054', '10': '152:7162', '11': '123:189' }, seller: { '00': '152:7312', '01': '152:7421', '10': '152:7530', '11': '123:2323' } };
function route(ctx) {
  const parts = ctx.path.split('/');
  const role = Object.hasOwn(names, parts[2]) ? parts[2] : 'buyer';
  let view = parts[3] || 'login';
  if (role === 'admin' && view.startsWith('signup')) view = 'login';
  if (!source[role][view] && view !== 'session-expired') view = 'login';
  return { role, view };
}
const url = (role, view, query = '') => `/auth/${role}/${view}${query ? `?${query}` : ''}`;
function draft(ctx, role, kind) {
  const key = `${role}:${kind}`;
  if (!drafts.has(key)) {
    const profile = ctx.state[role] || { email: 'admin@example.com' };
    drafts.set(key, { email: profile.email || '', nickname: profile.nickname || '', password: '', confirm: '', terms: false, privacy: false });
  }
  return drafts.get(key);
}
function applyConsentPreview(ctx, role, data) {
  const preview = ctx.query.get('consent');
  const key = `${role}:${preview}`;
  if (/^[01]{2}$/.test(preview || '') && consentPreviews.get(role) !== key) {
    data.terms = preview[0] === '1'; data.privacy = preview[1] === '1'; consentPreviews.set(role, key);
  } else if (!preview) consentPreviews.delete(role);
}
function input(label, name, data, type, attrs = '') {
  return field(label, name, { value: data[name], type, attrs: `required ${attrs}` });
}
function brand(role) {
  const copy = role === 'seller'
    ? ['남은 원단의\n다음 쓰임을\n연결해요.', '매장의 원단을 필요한 사람에게.\n등록부터 픽업 예약까지 한곳에서 관리하세요.', 'denim']
    : role === 'admin'
      ? ['더 좋은 순환을\n만드는 곳.', '원단과 사람을 잇는 플랫폼을\n함께 관리합니다.', 'canvas']
      : ['좋은 원단의\n새로운 시작.', '양주에서 발견한 원단으로\n당신의 다음 작품을 만들어 보세요.', 'canvas'];
  return `<aside class="auth-brand-panel"><p class="auth-kicker">YANGJU TEXTILE LOOP</p><p class="auth-display">${e(copy[0])}</p><p class="auth-brand-description">${e(copy[1])}</p>${fabricImage({ title: role === 'seller' ? '블루 데님' : '내추럴 캔버스', texture: copy[2] }, 'auth-fabric')}</aside>`;
}
function loginFields(data) {
  return `${input('이메일', 'email', data, 'email', 'autocomplete="username" maxlength="255" inputmode="email" spellcheck="false"')}${input('비밀번호', 'password', data, 'password', 'autocomplete="current-password" maxlength="72"')}`;
}
function formPage(ctx, role, signup) {
  const data = draft(ctx, role, signup ? 'signup' : 'login');
  if (signup) applyConsentPreview(ctx, role, data);
  const consent = `${Number(data.terms)}${Number(data.privacy)}`;
  const node = signup ? consentNodes[role][consent] : source[role].login;
  const fields = signup ? `${input('닉네임', 'nickname', data, 'text', 'autocomplete="nickname" maxlength="50"')}${input('이메일', 'email', data, 'email', 'autocomplete="username" maxlength="255" inputmode="email" spellcheck="false"')}${input('비밀번호', 'password', data, 'password', 'autocomplete="new-password" minlength="8" maxlength="72" placeholder="8~72자"')}${input('비밀번호 확인', 'confirm', data, 'password', 'autocomplete="new-password" minlength="8" maxlength="72"')}` : loginFields(data);
  const consents = signup ? `<label class="auth-consent"><input type="checkbox" name="terms" required ${data.terms ? 'checked' : ''}><span>이용약관 동의 (필수)</span></label><label class="auth-consent"><input type="checkbox" name="privacy" required ${data.privacy ? 'checked' : ''}><span>개인정보 수집·이용 동의 (필수)</span></label>${role === 'seller' ? '<p class="auth-small">매장 등록과 운영팀의 판매자 승인을 마친 뒤 원단을 등록할 수 있어요.</p>' : ''}<p class="auth-consent-hint" id="auth-consent-hint" ${data.terms && data.privacy ? 'hidden' : ''}>필수 약관 2개에 모두 동의하면 가입할 수 있어요.</p>` : '';
  return `<div class="auth-layout auth-layout--${role}" data-figma-node="${node}">${brand(role)}<form class="auth-form" data-auth-form="${signup ? 'signup' : 'login'}" aria-labelledby="auth-title"><h1 id="auth-title" tabindex="-1">${names[role]} ${signup ? '회원가입' : '로그인'}</h1><p class="auth-subtitle">${signup ? '필요한 정보만 입력하고 시작하세요.' : role === 'admin' ? '발급받은 계정으로 로그인하세요.' : '이메일로 섬유 루프를 시작하세요.'}</p><nav class="auth-role-tabs" aria-label="${signup ? '가입할 계정 선택' : '로그인할 계정 선택'}">${(signup ? ['buyer', 'seller'] : ['buyer', 'seller', 'admin']).map(r => `<a href="#${url(r, signup ? 'signup' : 'login')}" ${r === role ? 'aria-current="page"' : ''}>${names[r]}</a>`).join('')}</nav>${fields}${consents}${button(signup ? '가입하기' : role === 'admin' ? '관리자 로그인' : '로그인', { type: 'submit', tone: 'primary', disabled: signup && !(data.terms && data.privacy), attrs: signup ? 'aria-describedby="auth-consent-hint" data-auth-submit' : 'data-auth-submit' })}${!signup && role !== 'admin' ? button('회원가입', { href: url(role, 'signup') }) : ''}<p class="auth-policy">개인정보처리방침　·　이용약관</p></form></div>`;
}
const heading = (title, description) => `<h1 tabindex="-1">${e(title)}</h1><p class="auth-state-description">${e(description)}</p>`;
function statePage(ctx, role, view) {
  const kind = ctx.query.get('mode') === 'signup' ? 'signup' : 'login';
  let content, center = false;
  const node = view === 'session-expired' ? '202:8424' : source[role][view];
  if (view === 'processing') {
    center = true;
    const running = pending?.role === role && pending?.status === 'RUNNING';
    const preview = Boolean(ctx.scenario || ctx.query.get('scenario'));
    const title = running || preview ? kind === 'signup' ? '가입 정보를 확인하고 있어요' : '로그인 중입니다' : kind === 'signup' ? '가입 정보를 다시 확인해 주세요' : '로그인을 다시 시작해 주세요';
    content = `${heading(title, running || preview ? '잠시만 기다려 주세요.' : '진행 중인 요청이 없습니다. 입력 화면에서 다시 시작해 주세요.')}<div role="status" aria-live="polite">${notice(running || preview ? '계정 정보를 확인하고 있습니다.' : '입력한 내용을 확인한 뒤 다시 요청해 주세요.')}</div>${!running ? `<div class="actions">${button(kind === 'signup' ? '가입 정보로 돌아가기' : '로그인으로 돌아가기', { href: url(role, kind === 'signup' ? 'signup' : 'login'), tone: 'primary' })}</div>` : ''}`;
  } else if (view === 'error' || view === 'signup-error') {
    center = true;
    const signup = view === 'signup-error';
    const network = ctx.query.get('demo') === 'network';
    const record = failures.get(`${role}:${signup ? 'signup' : 'login'}`);
    const failure = record?.scenario === 'network' && !network ? undefined : record?.message;
    content = `${heading(network ? '연결 상태를 확인해 주세요' : signup ? '가입 정보를 확인해 주세요' : '로그인 정보를 확인해 주세요', network ? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : signup ? '입력한 내용과 필수 동의를 확인한 뒤 다시 시도하세요.' : '이메일과 비밀번호가 일치하지 않습니다.')}${notice((network ? '연결 상태를 확인한 뒤 다시 시도해 주세요.' : failure) || (signup ? '비밀번호 확인이 일치하지 않습니다. 이용약관과 개인정보 수집·이용 동의도 필요합니다.' : '입력한 정보를 확인한 뒤 다시 로그인해 주세요.'), 'error')}<div class="actions">${button(signup ? '가입 정보 수정' : '로그인으로 돌아가기', { href: url(role, signup ? 'signup' : ctx.query.get('first') === '1' ? 'first-login' : 'login'), tone: 'primary' })}</div>`;
  } else if (view === 'signup-done') {
    content = `${heading('회원가입이 완료되었어요', `${names[role]} 계정이 준비되었습니다.`)}<section class="panel auth-done-card">${badge('가입 완료')}<h2>섬유 루프에 오신 것을 환영해요</h2><p class="muted">${names[role]} 계정</p><p>가입한 이메일로 로그인해 주세요.${role === 'seller' ? ' 로그인 후 매장 정보를 등록하고 운영팀 승인을 기다려 주세요.' : ''}</p>${button('로그인하기', { href: url(role, role === 'seller' ? 'first-login' : 'login'), tone: 'primary' })}</section>`;
  } else if (view === 'first-login') {
    const data = draft(ctx, role, 'login');
    content = `${heading('판매자 로그인', '가입한 계정으로 로그인해 주세요.')}<form class="panel auth-first-form" data-auth-form="login"><h2>로그인 정보</h2>${loginFields(data)}<div class="actions">${button('로그인', { type: 'submit', tone: 'primary', attrs: 'data-auth-submit' })}</div></form>${notice('로그인 후 매장 정보와 픽업 가능 시간을 입력해 주세요.')}`;
  } else {
    center = true;
    content = `${heading('다시 로그인해 주세요', '로그인 유효 시간이 지나 요청을 처리하지 못했어요.')}${notice('다시 로그인한 뒤 원단 상태와 예약 내역을 확인하고 진행해 주세요.', 'error')}<div class="actions">${button('다시 로그인', { href: url(role, 'login'), tone: 'primary' })}${button(role === 'buyer' ? '원단 둘러보기' : '홈으로', { href: role === 'buyer' ? '/buyer/fabrics' : homes[role] })}</div>`;
  }
  return `<section class="auth-state ${center ? 'auth-state--center' : ''}" data-figma-node="${node}">${content}</section>`;
}
export function renderAuth(ctx) {
  const { role, view } = route(ctx);
  return view === 'login' || view === 'signup' ? formPage(ctx, role, view === 'signup') : statePage(ctx, role, view);
}
export function bindAuth(ctx) {
  const { role, view } = route(ctx);
  let active = true;
  if (view === 'session-expired') void ctx.api.logoutDemo();
  if (view === 'processing' && pending?.role === role) {
    const operation = pending;
    operation.promise.then(result => {
      if (!active || pending !== operation) return;
      pending = null;
      const data = draft(ctx, role, operation.kind);
      data.password = ''; data.confirm = '';
      failures.delete(`${role}:${operation.kind}`);
      if (operation.kind === 'signup') {
        const login = draft(ctx, role, 'login');
        login.email = result.email || data.email;
        login.password = '';
        ctx.navigate(url(role, 'signup-done'), { replace: true });
      } else ctx.navigate(result.first_login ? '/seller/store' : homes[role], { replace: true });
    }, error => {
      if (!active || pending !== operation) return;
      pending = null;
      failures.set(`${role}:${operation.kind}`, { message: error.message || '요청을 처리하지 못했어요. 다시 시도해 주세요.', scenario: operation.scenario });
      const query = new URLSearchParams();
      if (operation.scenario === 'network') query.set('demo', 'network');
      if (operation.first) query.set('first', '1');
      ctx.navigate(url(role, operation.kind === 'signup' ? 'signup-error' : 'error', query.toString()), { replace: true });
    });
  }
  const form = ctx.root.querySelector('[data-auth-form]');
  if (form) {
    const kind = form.dataset.authForm;
    const data = draft(ctx, role, kind);
    const collect = () => {
      for (const name of ['email', 'nickname', 'password', 'confirm']) if (form.elements[name]) data[name] = form.elements[name].value;
      if (kind === 'signup') {
        data.terms = form.elements.terms.checked; data.privacy = form.elements.privacy.checked;
        form.querySelector('[data-auth-submit]').disabled = !(data.terms && data.privacy);
        form.querySelector('.auth-consent-hint').hidden = data.terms && data.privacy;
        form.closest('[data-figma-node]').dataset.figmaNode = consentNodes[role][`${Number(data.terms)}${Number(data.privacy)}`];
      }
    };
    form.addEventListener('input', collect);
    form.addEventListener('change', collect);
    form.addEventListener('submit', event => {
      event.preventDefault(); collect();
      if (!form.reportValidity()) return;
      if (kind === 'signup' && (!data.nickname.trim() || data.password !== data.confirm)) {
        failures.set(`${role}:signup`, { message: !data.nickname.trim() ? '닉네임을 입력해 주세요.' : '비밀번호 확인이 일치하지 않습니다. 다시 입력해 주세요.', scenario: 'validation' });
        ctx.navigate(url(role, 'signup-error')); return;
      }
      if (ctx.query.get('demo') === 'session-expired') { ctx.navigate(url(role, 'session-expired')); return; }
      form.querySelector('[data-auth-submit]').disabled = true;
      const scenario = ctx.query.get('demo');
      const input = { role: role.toUpperCase(), email: data.email.trim(), password: data.password, ...(kind === 'signup' ? { nickname: data.nickname.trim(), phone_number: '', terms: data.terms, privacy: data.privacy } : {}) };
      const operation = { role, kind, scenario, first: view === 'first-login', status: 'RUNNING', promise: null };
      // The delay makes the source processing state reviewable without making a remote request.
      const promise = new Promise(resolve => setTimeout(resolve, 550)).then(() => {
        if (globalThis.location?.hash.split('?')[0] !== `#${url(role, 'processing')}`) throw new Error('요청이 취소되었어요.');
        if (scenario === 'error' || scenario === 'network') throw new Error(scenario === 'network' ? '연결 상태를 확인한 뒤 다시 시도해 주세요.' : kind === 'signup' ? '이미 사용 중인 이메일입니다. 다른 이메일로 다시 시도해 주세요.' : '입력한 정보를 확인한 뒤 다시 로그인해 주세요.');
        return kind === 'signup' ? ctx.api.signupDemo(input) : ctx.api.loginDemo(input);
      }).finally(() => { input.password = ''; operation.status = 'SETTLED'; });
      // A rejection remains handled even when the user leaves the processing route.
      promise.catch(() => {});
      operation.promise = promise;
      pending = operation;
      ctx.navigate(url(role, 'processing', kind === 'signup' ? 'mode=signup' : ''));
    });
  }
  return () => {
    active = false;
    if (view === 'processing' && pending?.role === role && globalThis.location?.hash.split('?')[0] !== `#${ctx.path}`) pending = null;
  };
}
