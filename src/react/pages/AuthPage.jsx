import { useEffect, useRef, useState } from 'react';
import { Badge, Button, FabricImage, Notice } from '../components/ui.jsx';
import { getAuthState } from './auth-state.js';
import { POLICIES } from '../content/policies.js';

const names = { buyer: '구매자', seller: '판매자', admin: '관리자' };
const homes = { buyer: '/buyer/home', seller: '/seller/dashboard', admin: '/admin/dashboard' };
const source = {
  buyer: { login: '123:59', signup: '123:189', error: '125:2482', processing: '125:2498', 'signup-done': '125:2508', 'signup-error': '125:2559' },
  seller: { login: '123:2190', signup: '123:2323', error: '127:2514', processing: '127:2530', 'signup-done': '127:2540', 'signup-error': '127:2591', 'first-login': '127:2633' },
  admin: { login: '123:4835', error: '127:2607', processing: '127:2623' },
};
const consentNodes = {
  buyer: { '00': '152:6946', '01': '152:7054', '10': '152:7162', '11': '123:189' },
  seller: { '00': '152:7312', '01': '152:7421', '10': '152:7530', '11': '123:2323' },
};
const url = (role, view, query = '') => `/auth/${role}/${view}${query ? `?${query}` : ''}`;

function route(path) {
  const parts = path.split('/');
  const role = Object.hasOwn(names, parts[2]) ? parts[2] : 'buyer';
  let view = parts[3] || 'login';
  if (role === 'admin' && view.startsWith('signup')) view = 'login';
  if (!source[role][view] && view !== 'session-expired') view = 'login';
  return { role, view };
}

function Brand({ role }) {
  const copy = role === 'seller'
    ? ['남은 원단의\n다음 쓰임을\n연결해요.', '매장의 원단을 필요한 사람에게.\n등록부터 픽업 예약까지 한곳에서 관리하세요.', 'denim']
    : role === 'admin'
      ? ['더 좋은 순환을\n만드는 곳.', '원단과 사람을 잇는 플랫폼을\n함께 관리합니다.', 'canvas']
      : ['좋은 원단의\n새로운 시작.', '양주에서 발견한 원단으로\n당신의 다음 작품을 만들어 보세요.', 'canvas'];
  return <aside className="auth-brand-panel">
    <p className="auth-kicker">YANGJU TEXTILE LOOP</p>
    <p className="auth-display">{copy[0]}</p>
    <p className="auth-brand-description">{copy[1]}</p>
    <FabricImage fabric={{ title: role === 'seller' ? '블루 데님' : '내추럴 캔버스', texture: copy[2] }} className="auth-fabric" exampleLabel={false} />
  </aside>;
}

// Auth labels intentionally omit the generic field's visible required marker.
function AuthInput({ label, name, data, onChange, type = 'text', hint = '', ...props }) {
  const id = `field-${name}`;
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <div className={password ? 'auth-password-field' : undefined}>
      <input id={id} name={name} type={password && visible ? 'text' : type} required value={data[name]} onChange={onChange} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {password && <button className="password-toggle" type="button" aria-label={`${label} ${visible ? '숨기기' : '표시'}`} aria-pressed={visible} aria-controls={id} onClick={() => setVisible(!visible)}>{visible ? '숨기기' : '표시'}</button>}
    </div>
    {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}

function PolicyViewer({ policyKey, onClose }) {
  const ref = useRef(null);
  const policy = POLICIES[policyKey];
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="policy-dialog" aria-labelledby="policy-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="policy-title">{policy.title}</h2><button className="policy-close" type="button" aria-label="내용 보기 닫기" onClick={onClose}>닫기</button></header>
    {policy.status === 'published' ? policy.sections.map(section => <section key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p></section>) : <Notice><strong>문안 준비 중</strong><p>아직 확정된 내용이 등록되지 않았어요. 문안이 준비되면 이 화면에서 확인할 수 있어요.</p></Notice>}
    <Button onClick={onClose} tone="primary">입력 화면으로 돌아가기</Button>
  </dialog>;
}

function LoginFields({ data, onChange }) {
  return <>
    <AuthInput label="이메일" name="email" data={data} onChange={onChange} type="email" autoComplete="username" maxLength={255} inputMode="email" spellCheck={false} />
    <AuthInput label="비밀번호" name="password" data={data} onChange={onChange} type="password" autoComplete="current-password" maxLength={72} />
  </>;
}

function SignupFields({ data, onChange }) {
  return <>
    <AuthInput label="닉네임" name="nickname" data={data} onChange={onChange} autoComplete="nickname" maxLength={50} />
    <AuthInput label="이메일" name="email" data={data} onChange={onChange} type="email" autoComplete="username" maxLength={255} inputMode="email" spellCheck={false} />
    <AuthInput label="비밀번호" name="password" data={data} onChange={onChange} type="password" autoComplete="new-password" minLength={8} maxLength={72} hint="8~72자로 입력해 주세요." />
    <AuthInput label="비밀번호 확인" name="confirm" data={data} onChange={onChange} type="password" autoComplete="new-password" minLength={8} maxLength={72} />
  </>;
}

function Heading({ title, description }) {
  return <><h1 tabIndex={-1}>{title}</h1><p className="auth-state-description">{description}</p></>;
}

export default function AuthPage({ ctx }) {
  const { role, view } = route(ctx.path);
  const store = getAuthState(ctx.drafts);
  const kind = view === 'signup' ? 'signup' : 'login';
  const [data, setData] = useState(() => store.initialForm(ctx.state, role, kind, ctx.query.get('consent')));
  const [submitting, setSubmitting] = useState(false);
  const [policyKey, setPolicyKey] = useState(null);
  const submittingRef = useRef(false);
  const expiryHandled = useRef(false);
  const current = useRef(ctx);
  const operation = view === 'processing' ? store.pending(role) : null;

  useEffect(() => { current.current = ctx; }, [ctx]);

  useEffect(() => {
    if (view !== 'session-expired' || expiryHandled.current) return;
    expiryHandled.current = true;
    // Keep the expired-session screen visible instead of invoking the navigation logout action.
    const context = current.current;
    void (context.mode === 'live' ? context.api.logout() : context.api.logoutDemo()).then(() => context.refresh());
  }, [view]);

  useEffect(() => {
    if (!operation) return;
    const onFailure = error => {
      const network = ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(error.code) || operation.scenario === 'network';
      store.recordFailure(role, operation.kind, {
        message: error.message || '요청을 처리하지 못했어요. 다시 시도해 주세요.', scenario: network ? 'network' : operation.scenario,
        code: error.code, details: error.details || [],
      });
      const query = new URLSearchParams();
      if (network) query.set('failure', 'network');
      if (operation.first) query.set('first', '1');
      current.current.navigate(url(role, operation.kind === 'signup' ? 'signup-error' : 'error', query.toString()), { replace: true });
    };
    return store.subscribe(operation, result => {
      const context = current.current;
      try { if (context.mode === 'live' && operation.kind === 'login') context.api.commitLogin(result); }
      catch (error) { onFailure(error); return; }
      store.finishSuccess(context.state, role, operation, result);
      if (operation.kind === 'signup') {
        context.navigate(url(role, 'signup-done'), { replace: true });
      } else context.navigate(result.first_login ? '/seller/store' : homes[result.role?.toLowerCase() || role], { replace: true });
    }, onFailure);
  }, [operation, role, store]);

  function onChange(event) {
    const { name, value, checked, type } = event.target;
    setData(store.updateForm(ctx.state, role, kind, name, type === 'checkbox' ? checked : value));
  }

  function onSubmit(event) {
    event.preventDefault();
    if (submittingRef.current || !event.currentTarget.reportValidity()) return;
    if (kind === 'signup' && (!data.nickname.trim() || data.password !== data.confirm)) {
      store.recordFailure(role, 'signup', {
        message: !data.nickname.trim() ? '닉네임을 입력해 주세요.' : '비밀번호 확인이 일치하지 않습니다. 다시 입력해 주세요.',
        scenario: 'validation',
      });
      ctx.navigate(url(role, 'signup-error'));
      return;
    }
    if (ctx.mode !== 'live' && ctx.query.get('demo') === 'session-expired') {
      ctx.navigate(url(role, 'session-expired'));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    const scenario = ctx.mode === 'live' ? null : ctx.query.get('demo');
    const input = {
      role: role.toUpperCase(), email: data.email.trim(), password: data.password,
      ...(kind === 'signup' ? { nickname: data.nickname.trim(), phone_number: '', terms: data.terms, privacy: data.privacy } : {}),
    };
    if (kind === 'signup') {
      store.updateForm(ctx.state, role, 'login', 'email', data.email.trim());
      store.updateForm(ctx.state, role, 'login', 'password', '');
    }
    store.startRequest({ api: ctx.api, role, kind, scenario, first: view === 'first-login', input });
    ctx.navigate(url(role, 'processing', kind === 'signup' ? 'operation=signup' : ''));
  }

  if (view === 'login' || view === 'signup') {
    const signup = view === 'signup';
    const agreed = data.terms && data.privacy;
    const node = signup ? consentNodes[role][`${Number(data.terms)}${Number(data.privacy)}`] : source[role].login;
    return <div className={`auth-layout auth-layout--${role}`} data-figma-node={node}>
      <Brand role={role} />
      <form className="auth-form" data-auth-form={kind} aria-labelledby="auth-title" onSubmit={onSubmit}>
        <h1 id="auth-title" tabIndex={-1}>{names[role]} {signup ? '회원가입' : '로그인'}</h1>
        <p className="auth-subtitle">{signup ? '필요한 정보만 입력하고 시작하세요.' : role === 'admin' ? '발급받은 계정으로 로그인하세요.' : '이메일로 섬유 루프를 시작하세요.'}</p>
        {role !== 'admin' && <nav className="auth-role-tabs" aria-label={signup ? '가입할 계정 선택' : '로그인할 계정 선택'}>
          {['buyer', 'seller'].map(item => <a key={item} href={`#${url(item, signup ? 'signup' : 'login')}`} aria-current={item === role ? 'page' : undefined}>{names[item]}</a>)}
        </nav>}
        {signup ? <SignupFields data={data} onChange={onChange} /> : <LoginFields data={data} onChange={onChange} />}
        {signup && <>
          <div className="auth-consent-row"><label className="auth-consent"><input type="checkbox" name="terms" required checked={data.terms} onChange={onChange} /><span>이용약관 동의 (필수)</span></label><button type="button" className="policy-link" onClick={() => setPolicyKey('terms')} aria-label="이용약관 내용 보기">내용 보기</button></div>
          <div className="auth-consent-row"><label className="auth-consent"><input type="checkbox" name="privacy" required checked={data.privacy} onChange={onChange} /><span>개인정보 수집·이용 동의 (필수)</span></label><button type="button" className="policy-link" onClick={() => setPolicyKey('privacy')} aria-label="개인정보 수집·이용 내용 보기">내용 보기</button></div>
          {Object.values(POLICIES).some(policy => policy.status !== 'published') && <p className="auth-small">약관·개인정보 안내 문안은 현재 준비 중이에요.</p>}
          {role === 'seller' && <p className="auth-small">매장 등록과 운영팀의 판매자 승인을 마친 뒤 원단을 등록할 수 있어요.</p>}
          <p className="auth-consent-hint" id="auth-consent-hint" hidden={agreed}>필수 약관 2개에 모두 동의하면 가입할 수 있어요.</p>
        </>}
        <Button type="submit" tone="primary" disabled={submitting || (signup && !agreed)} aria-describedby={signup ? 'auth-consent-hint' : undefined} data-auth-submit="">
          {signup ? '가입하기' : role === 'admin' ? '관리자 로그인' : '로그인'}
        </Button>
        {!signup && role !== 'admin' && <Button href={url(role, 'signup')}>회원가입</Button>}
        {signup && <p className="auth-login-return">이미 계정이 있나요? <a href={`#${url(role, 'login')}`}>로그인</a></p>}
        <div className="auth-policy"><button type="button" className="policy-link" onClick={() => setPolicyKey('privacy')}>개인정보 안내</button><span aria-hidden="true">·</span><button type="button" className="policy-link" onClick={() => setPolicyKey('terms')}>이용약관</button></div>
      </form>
      {policyKey && <PolicyViewer policyKey={policyKey} onClose={() => setPolicyKey(null)} />}
    </div>;
  }

  const center = ['processing', 'error', 'signup-error', 'session-expired'].includes(view);
  let content;
  if (view === 'processing') {
    const signup = ctx.query.get('operation') === 'signup' || ctx.query.get('mode') === 'signup';
    const running = operation?.status === 'RUNNING';
    const preview = Boolean(ctx.scenario || ctx.query.get('scenario'));
    const title = running || preview ? signup ? '가입 정보를 확인하고 있어요' : '로그인 중입니다'
      : signup ? '가입 정보를 다시 확인해 주세요' : '로그인을 다시 시작해 주세요';
    content = <>
      <Heading title={title} description={running || preview ? '잠시만 기다려 주세요.' : '진행 중인 요청이 없습니다. 입력 화면에서 다시 시작해 주세요.'} />
      <div role="status" aria-live="polite"><Notice>{running || preview ? '계정 정보를 확인하고 있습니다.' : '입력한 내용을 확인한 뒤 다시 요청해 주세요.'}</Notice></div>
      {!running && <div className="actions"><Button href={url(role, signup ? 'signup' : 'login')} tone="primary">{signup ? '가입 정보로 돌아가기' : '로그인으로 돌아가기'}</Button></div>}
    </>;
  } else if (view === 'error' || view === 'signup-error') {
    const signup = view === 'signup-error';
    const network = ctx.query.get('failure') === 'network' || (ctx.mode !== 'live' && ctx.query.get('demo') === 'network');
    const record = store.failure(role, signup ? 'signup' : 'login');
    const failure = record?.scenario === 'network' && !network ? undefined : record?.message;
    content = <>
      <Heading title={network ? '연결 상태를 확인해 주세요' : signup ? '가입 정보를 확인해 주세요' : '로그인 정보를 확인해 주세요'} description={network && signup && ctx.mode === 'live' ? '가입 결과를 확인하지 못했어요. 다시 가입하기 전에 입력한 이메일로 로그인해 확인해 주세요.' : network ? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : signup ? '입력한 내용과 필수 동의를 확인한 뒤 다시 시도하세요.' : '아래 안내를 확인한 뒤 다시 시도해 주세요.'} />
      <Notice tone="error">{failure || (signup ? '비밀번호 확인이 일치하지 않습니다. 이용약관과 개인정보 수집·이용 동의도 필요합니다.' : '입력한 정보를 확인한 뒤 다시 로그인해 주세요.')}{record?.details?.length > 0 && <ul>{record.details.map((detail, index) => <li key={index}>{detail.message}</li>)}</ul>}</Notice>
      <div className="actions"><Button href={url(role, signup ? 'signup' : ctx.query.get('first') === '1' ? 'first-login' : 'login')} tone="primary">{signup ? '가입 정보 수정' : '로그인으로 돌아가기'}</Button>{signup && ctx.mode === 'live' && (network || record?.code === 'EMAIL_DUPLICATED') && <Button href={url(role, 'login')}>로그인으로 확인</Button>}</div>
    </>;
  } else if (view === 'signup-done') {
    content = <>
      <Heading title="회원가입이 완료되었어요" description={`${names[role]} 계정이 준비되었습니다.`} />
      <section className="panel auth-done-card">
        <Badge>가입 완료</Badge><h2>섬유 루프에 오신 것을 환영해요</h2><p className="muted">{names[role]} 계정</p>
        <p>가입한 이메일로 로그인해 주세요.{role === 'seller' ? ' 로그인 후 매장 정보를 등록하고 운영팀 승인을 기다려 주세요.' : ''}</p>
        <Button href={url(role, role === 'seller' ? 'first-login' : 'login')} tone="primary">로그인하기</Button>
      </section>
    </>;
  } else if (view === 'first-login') {
    content = <>
      <Heading title="판매자 로그인" description="가입한 계정으로 로그인해 주세요." />
      <form className="panel auth-first-form" data-auth-form="login" onSubmit={onSubmit}>
        <h2>로그인 정보</h2><LoginFields data={data} onChange={onChange} />
        <div className="actions"><Button type="submit" tone="primary" disabled={submitting} data-auth-submit="">로그인</Button></div>
      </form>
      <Notice>로그인 후 매장 정보와 픽업 가능 시간을 입력해 주세요.</Notice>
    </>;
  } else {
    content = <>
      <Heading title="다시 로그인해 주세요" description="로그인 유효 시간이 지나 요청을 처리하지 못했어요." />
      <Notice tone="error">다시 로그인한 뒤 원단 상태와 예약 내역을 확인하고 진행해 주세요.</Notice>
      <div className="actions">
        <Button href={url(role, 'login')} tone="primary">다시 로그인</Button>
        <Button href={role === 'buyer' ? '/buyer/fabrics' : homes[role]}>{role === 'buyer' ? '원단 둘러보기' : '홈으로'}</Button>
      </div>
    </>;
  }
  return <section className={`auth-state ${center ? 'auth-state--center' : ''}`} data-figma-node={view === 'session-expired' ? '202:8424' : source[role][view]}>{content}</section>;
}
