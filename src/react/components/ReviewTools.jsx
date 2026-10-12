import { Button, SelectField } from './ui.jsx';
import { HOME } from '../app/store.js';

function LiveAccountTools({ ctx }) {
  const auth = ctx.auth || { status: 'anonymous', user: null };
  const statusLabel = { anonymous: '로그인 전', restoring: '계정 확인 중', authenticated: '로그인됨', expired: '로그인 만료', unavailable: '연결 확인 필요' }[auth.status] || '로그인 전';
  const role = ['BUYER', 'SELLER', 'ADMIN'].includes(auth.user?.role) ? auth.user.role : ctx.role || 'BUYER';
  return <details className="prototype-tools"><summary>실제 계정 · {statusLabel}</summary><section>
    <p>계정·구매자 원단 조회·도안 추천·도안 조회·픽업 예약과 판매자 매장 등록·수정·직접·AI 보조 원단 등록·관리·예약 처리·대시보드 통계·픽업 달력, 관리자 판매자·원단 조회·승인·거절은 서버에 연결됩니다. 개인 프로필 수정·문의 처리는 아직 연동되지 않았습니다. AI 응답 방식은 등록 화면의 안내를 확인해 주세요.</p>
    {auth.status === 'authenticated' && <p>로그인한 계정: {auth.user?.nickname || auth.user?.email || '회원'} · {{ BUYER: '구매자', SELLER: '판매자', ADMIN: '관리자' }[role]}</p>}
    {auth.status === 'restoring' && <p role="status">저장된 로그인 정보를 확인하고 있어요.</p>}
    {auth.status === 'unavailable' && <><p>계정 정보를 확인하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.</p><Button onClick={() => ctx.retrySession()}>계정 연결 다시 확인</Button></>}
    {auth.status === 'expired' && <p>로그인 유효 시간이 지났어요. 다시 로그인해 주세요.</p>}
    <div className="actions"><Button href={`/auth/${role.toLowerCase()}/login?mode=live`}>실제 로그인 화면</Button>{auth.status === 'authenticated' && <Button data-logout="" onClick={ctx.logout}>로그아웃</Button>}<Button href="/preview">전체 화면·상태</Button></div>
    <small>화면·상태 목록의 시연 데이터는 실제 계정과 분리됩니다.</small>
  </section></details>;
}

export default function ReviewTools({ ctx, onReset }) {
  if (ctx.mode === 'live') return <LiveAccountTools ctx={ctx} />;
  const { state, api, refresh, navigate, logout, scenario, notify } = ctx;
  async function update(values) {
    try { await api.setDemo(values); await refresh(); }
    catch (error) { notify(error.message); }
  }
  return <details className="prototype-tools"><summary>React 미리보기 · {scenario ? '상태 예시' : '예시 데이터'}</summary><section>
    {scenario && <p className="notice">화면 목록에서 연 상태 예시입니다. 여기서 진행한 작업은 기존 시연 데이터에 저장되지 않습니다.</p>}
    <p>이 브라우저에만 저장되는 시연용 화면입니다. 실제 로그인·주문·업로드는 발생하지 않습니다.</p>
    <div className="actions">{['BUYER', 'SELLER', 'ADMIN'].map((role, i) => <Button key={role} tone={state.session.role === role ? 'primary' : 'secondary'} data-preview-role={role} onClick={() => navigate(`${HOME[role]}?mode=demo`)}>{['구매자', '판매자', '관리자'][i]}</Button>)}</div>
    <SelectField label="판매자 승인 상태" name="demoApproval" options={[{ value: 'PENDING', label: '승인 대기' }, { value: 'APPROVED', label: '승인 완료' }, { value: 'REJECTED', label: '승인 거절' }]} value={state.seller.seller_approval_status} onChange={e => update({ seller_approval_status: e.target.value })} />
    <label><input type="checkbox" data-preview-store checked={state.seller.hasStore} onChange={e => update({ hasStore: e.target.checked })} /> 매장 정보 등록됨</label>
    <SelectField label="등록 응답 시연" name="demoCreate" options={[{ value: 'SUCCESS', label: '정상 응답' }, { value: 'UNKNOWN', label: '응답 유실' }]} value={state.demo.createResult} onChange={e => update({ createResult: e.target.value })} />
    <SelectField label="사진 업로드 시연" name="demoUpload" options={[{ value: 'SUCCESS', label: '모두 성공' }, { value: 'PARTIAL', label: '일부 실패' }]} value={state.demo.uploadResult} onChange={e => update({ uploadResult: e.target.value })} />
    <SelectField label="원단 승인 응답 시연" name="demoAdmin" options={[{ value: 'SUCCESS', label: '정상 응답' }, { value: 'ERROR', label: '연결 오류' }]} value={state.demo.adminResult || 'SUCCESS'} onChange={e => update({ adminResult: e.target.value })} />
    <div className="actions"><Button data-preview-reset onClick={onReset}>예시 데이터 초기화</Button><Button href="/preview">전체 화면·상태</Button></div>
    <a href="https://www.figma.com/design/uYO6eu041WwmEBKAfA7a6Y?node-id=122-12" target="_blank" rel="noreferrer">기준 Figma 작업본</a>
    <div className="actions"><Button href={`/auth/${state.session.role.toLowerCase()}/login?mode=demo`}>시연 로그인 화면</Button><Button data-logout onClick={logout}>시연 로그아웃</Button><Button href={`/auth/${state.session.role.toLowerCase()}/login?mode=live`}>실제 계정으로 로그인</Button></div>
    <small>실제 계정 인증 없이 입력 형식만 확인하는 시연입니다.</small><small>시연 중인 역할: {state.session.role}</small>
  </section></details>;
}
