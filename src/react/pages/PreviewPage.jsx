import coverage from '../../prototype/data/screen-coverage.json';
import { Button, PageHeading, Notice, Field } from '../components/ui.jsx';

const roles = [['buyer', '구매자'], ['seller', '판매자'], ['admin', '관리자']];
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
      <PageHeading title={`${label} · 화면 이름`} description="로그인한 뒤 서버에 있는 데이터로 같은 흐름을 확인합니다." />
      <Notice>목록은 화면 이름만 보여 줍니다. 실제 원단·승인·문의는 로그인 후 서버 데이터로 엽니다.</Notice>
      <div className="actions"><Button href={`/auth/${selected}/login`} tone="primary">{label} 로그인</Button><Button href="/preview">처음으로</Button></div>
      <form id="preview-filter" className="form-grid" onSubmit={e => { e.preventDefault(); ctx.navigate(`/preview?role=${selected}&q=${encodeURIComponent(new FormData(e.currentTarget).get('q') || '')}`); }}>
        <Field label="화면 이름 검색" name="q" defaultValue={ctx.query.get('q') || ''} placeholder="예: 가입, 거절, 문의" />
        <div className="actions"><Button type="submit">찾기</Button><Button href={`/preview?role=${selected}`}>전체 목록</Button></div>
      </form><p className="muted">화면 이름 {screens.length}개</p>
      <ul className="preview-screen-list">{screens.map(s => <li key={s.nodeId}><span>{s.name.replace(/^[^·]+ · /, '')}</span></li>)}</ul>
    </section>;
  }
  return <section className="preview-page stack" data-figma-node="133:6724">
    <PageHeading title="패브링" description="구매자 · 판매자 · 관리자" />
    <Notice>구매자, 판매자, 관리자 모두 같은 서버 데이터를 사용합니다.</Notice>
    <section className="panel"><h2>회원가입과 첫 진입</h2><Rows entries={[
      ['구매자', '회원가입 → 가입 완료 → 로그인 → 메인'], ['판매자', '가입 → 매장 등록 → 판매자 승인 → 원단 등록'], ['관리자', '로그인 → 대시보드 · 공개 회원가입 없음'],
    ]} /></section>
    <div className="actions">{roles.map(([role, label]) => <Button key={role} href={`/auth/${role}/login`} tone="primary">{label} 로그인</Button>)}</div>
    <div className="actions">{roles.slice(0, 2).map(([role, label]) => <Button key={role} href={`/auth/${role}/signup`}>{label} 회원가입</Button>)}</div>
    <section className="panel"><h2>연결된 과정</h2><Rows entries={[
      ['원단 등록', '등록 방법 → 직접/AI 입력 → 검토 → 등록·사진 업로드 → 승인 대기'], ['픽업 거래', '요청 → 판매자 수락 → 예약 확보 → 수령 확인'],
      ['판매 단위', '자투리 1장 / 롤 90cm(1마)'], ['운영 검수', '판매자 승인과 원단 게시 승인을 각각 처리'],
    ]} /></section>
  </section>;
}
