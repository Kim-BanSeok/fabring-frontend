import { Button } from './ui.jsx';

export default function AdminWorkQueue({ fabrics, sellers }) {
  return <section className="admin-work-queue" aria-label="오늘 확인할 승인 업무">
    <article className="panel"><div><p className="muted">원단 게시 심사</p><h2>승인 대기 <strong>{fabrics}건</strong></h2><p>사진 · 소재 · 치수 · 하자</p></div><Button href="/admin/approvals?status=PENDING" tone="primary">원단 검토하기</Button></article>
    <article className="panel"><div><p className="muted">판매자 계정 심사</p><h2>승인 대기 <strong>{sellers}건</strong></h2><p>판매자 정보 · 매장 정보</p></div><Button href="/admin/sellers?status=PENDING">판매자 검토하기</Button></article>
  </section>;
}
