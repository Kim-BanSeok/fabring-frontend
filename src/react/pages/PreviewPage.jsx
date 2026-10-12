import coverage from '../../prototype/data/screen-coverage.json';
import { Button, PageHeading, Notice, Field } from '../components/ui.jsx';

const roles = [['buyer', '구매자'], ['seller', '판매자'], ['admin', '관리자']];
function withMode(path, mode) {
  const [base, search = ''] = path.split('?');
  const query = new URLSearchParams(search);
  query.set('mode', mode);
  return `${base}?${query}`;
}
function Rows({ entries }) {
  return <dl className="preview-details">{entries.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>;
}

export default function PreviewPage({ ctx }) {
  const selected = ctx.query.get('role');
  if (roles.some(([role]) => role === selected)) {
    const label = roles.find(([role]) => role === selected)[1];
    const query = (ctx.query.get('q') || '').trim().toLowerCase();
    const screens = coverage.filter(s => s.role === selected && !s.hold && (!query || `${s.name} ${s.nodeId}`.toLowerCase().includes(query)));
    return <section className="preview-page stack" data-figma-node={{ buyer: '133:6803', seller: '133:7124', admin: '133:7415' }[selected]}>
      <PageHeading title={`${label} · 화면·상태 목록`} description="시작 화면에서 전체 흐름을 따라가거나, 확인할 상태를 바로 열어보세요." />
      <Notice>아래 화면·상태 목록은 예시 데이터를 사용합니다. 실제 계정으로 시작하려면 ‘{label} 시작’을 선택하세요. 시연의 입력·예약·답변은 실제 계정에 반영되지 않습니다.</Notice>
      <div className="actions"><Button href={withMode(`/auth/${selected}/login`, 'live')} tone="primary">{label} 시작</Button><Button href={withMode(`/auth/${selected}/login`, 'demo')}>{label} 시연 시작</Button><Button href="/preview">전체 흐름으로</Button></div>
      <form id="preview-filter" className="form-grid" onSubmit={e => { e.preventDefault(); ctx.navigate(`/preview?role=${selected}&q=${encodeURIComponent(new FormData(e.currentTarget).get('q') || '')}`); }}>
        <Field label="화면 이름 검색" name="q" defaultValue={ctx.query.get('q') || ''} placeholder="예: 가입, 거절, 문의" />
        <div className="actions"><Button type="submit">찾기</Button><Button href={`/preview?role=${selected}`}>전체 목록</Button></div>
      </form><p className="muted">연결된 화면·상태 {screens.length}개</p>
      <ul className="preview-screen-list">{screens.map(s => <li key={s.nodeId}><a href={`#${withMode(s.route, 'demo')}`}><span>{s.name.replace(/^[^·]+ · /, '')}</span><small>{s.mode === 'state' ? '상태 예시' : s.mode === 'data' ? '데이터별 화면' : '화면'} →</small></a></li>)}</ul>
    </section>;
  }
  return <section className="preview-page stack" data-figma-node="133:6724">
    <PageHeading title="전체 흐름 · 연결 작업본" description="구매자 · 판매자 · 관리자 / React에서 확인하는 전체 흐름" />
    <Notice>실제 계정으로 시작하거나 예시 데이터로 전체 흐름을 살펴볼 수 있습니다. 계정·구매자 원단 조회·픽업 예약과 판매자 직접 원단 등록·관리·예약 처리·대시보드 통계·픽업 달력은 서버에 연결됩니다. 문의 처리·매장 저장·AI 등록은 아직 미연동이며, 시연은 예시 데이터로 동작합니다.</Notice>
    <section className="panel"><h2>회원가입과 첫 진입</h2><Rows entries={[
      ['구매자', '회원가입 → 가입 완료 → 로그인 → 메인'], ['판매자', '가입 → 매장 등록 → 판매자 승인 → 원단 등록'], ['관리자', '로그인 → 대시보드 · 공개 회원가입 없음'],
    ]} /></section>
    <div className="actions">{roles.map(([role, label]) => <Button key={role} href={withMode(`/auth/${role}/login`, 'live')} tone="primary">{label} 시작</Button>)}</div>
    <div className="actions">{roles.slice(0, 2).map(([role, label]) => <Button key={role} href={withMode(`/auth/${role}/signup`, 'live')}>{label} 회원가입</Button>)}</div>
    <div className="actions">{roles.map(([role, label]) => <Button key={role} href={withMode(`/auth/${role}/login`, 'demo')}>{label} 시연 시작</Button>)}</div>
    <section className="panel"><h2>연결된 핵심 과정</h2><Rows entries={[
      ['원단 등록', '등록 방법 → 직접/AI 예시 입력 → 검토 → 등록·사진 업로드 → 승인 대기'], ['픽업 거래', '요청 → 판매자 수락 → 예약 확보 → 판매자 수령 확인 / 취소 시 확보 해제'],
      ['판매 단위', '자투리 1장 전체 / 롤 90cm(1마) 단위 · 상품별 치수·단가 표시'], ['운영 검수', '판매자 승인과 원단 게시 승인을 각각 검토·처리'],
    ]} /></section>
    <div className="actions">{roles.map(([role, label]) => <Button key={role} href={`/preview?role=${role}`}>{label} 화면·상태 목록</Button>)}</div>
    <small className="muted">최신 작업본의 활성 화면을 공통 페이지와 상태로 연결했습니다. API 명세에 맞춰 보류한 이메일·비밀번호 변경, 관리자 구매자 조회 등 8개 화면은 포함하지 않습니다. 화면·상태 목록과 시연 시작에서는 실제 계정 인증·주문·AI·지도 API를 사용하지 않습니다.</small>
  </section>;
}
