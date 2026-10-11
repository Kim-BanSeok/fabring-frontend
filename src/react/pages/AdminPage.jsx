import { useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, FabricImage, Notice, PageHeading, SelectField } from '../components/ui.jsx';
import { formatLength, formatPrice } from '../lib/format.js';
import { useAction } from '../hooks/useAction.js';

const SELLER_STATUS = { PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '승인 거절' };
const FABRIC_STATUS = { PENDING: '승인 대기', POSTED: '게시 중', REJECTED: '승인 거절', SOLD_OUT: '판매 완료' };
const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', POSTED: 'green', REJECTED: 'red', SOLD_OUT: 'gray' };
const detailPath = (kind, id) => `/admin/${kind}/${encodeURIComponent(id)}`;
const date = value => value ? String(value).slice(0, 10).replaceAll('-', '.') : '—';
const validStatus = (query, labels) => Object.hasOwn(labels, query.get('status')) ? query.get('status') : 'PENDING';

function StatusBadge({ status, labels }) { return <Badge tone={STATUS_TONE[status] || 'gray'}>{labels[status] || '확인 필요'}</Badge>; }
function Details({ entries, className = '' }) {
  return <dl className={`admin-details ${className}`}>{entries.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}
function ActionError({ error }) {
  const ref = useRef(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  return <p ref={ref} className="admin-action-error notice notice--error" data-admin-error role="alert" tabIndex={-1} hidden={!error}>{error}</p>;
}
function Missing({ title = '페이지를 찾을 수 없어요.', path = '/admin/dashboard', label = '대시보드 홈' }) {
  return <section className="admin-page stack"><PageHeading title={title} /><EmptyState title="정보를 찾을 수 없어요." description="목록으로 돌아가 현재 상태를 확인해 주세요."><Button href={path}>{label}</Button></EmptyState></section>;
}
function Dashboard({ ctx }) {
  const { state } = ctx;
  const pending = state.fabrics.filter(f => f.status === 'PENDING');
  const cards = [
    ['원단 게시 대기', pending.length, '확인이 필요한 원단', '/admin/fabrics?status=PENDING'],
    ['판매자', state.sellers.length, '등록된 판매자', '/admin/sellers?status=APPROVED'],
    ['판매자 승인 대기', state.sellers.filter(s => s.seller_approval_status === 'PENDING').length, '승인 확인 대기 판매자', '/admin/sellers?status=PENDING'],
    ['등록된 원단수', state.fabrics.length, '전체 등록 원단', '/admin/fabrics?status=PENDING'],
  ];
  return <section className="admin-page stack" data-figma-node="123:4955">
    <PageHeading title="관리자 대시보드" description="새롭게 등록된 원단과 서비스 현황을 확인하세요." />
    <div className="stat-grid admin-stats">{cards.map(([title, count, hint, path]) => <a key={title} className="stat-card admin-stat" href={`#${path}`}><span>{title}</span><strong>{ctx.mode === 'live' ? '—' : count}</strong><small>{ctx.mode === 'live' ? '조회 연결 준비 중' : hint}</small></a>)}</div>
    <section className="panel admin-panel" aria-labelledby="admin-pending-heading"><h2 id="admin-pending-heading">원단 게시 승인 대기</h2>
      {pending.length ? <><div className="table-wrapper"><table className="data-table admin-dashboard-table"><caption className="admin-sr-only">게시 승인을 기다리는 원단</caption><thead><tr><th scope="col">원단명</th><th scope="col">판매자</th><th scope="col">신청일</th><th scope="col">상태</th></tr></thead><tbody>{pending.map(f => <tr key={f.id}><td data-label="원단명"><a href={`#${detailPath('fabrics', f.id)}`}>{f.title}</a></td><td data-label="판매자">{f.store_name}</td><td data-label="신청일">{date(f.created_at)}</td><td data-label="상태"><StatusBadge status={f.status} labels={FABRIC_STATUS} /></td></tr>)}</tbody></table></div><Button href="/admin/fabrics?status=PENDING" tone="primary">승인 대기 확인 →</Button></> : <EmptyState title={ctx.mode === 'live' ? '승인 대기 목록 연결을 준비하고 있어요.' : '게시 승인을 기다리는 원단이 없어요.'} description={ctx.mode === 'live' ? '원단 승인 내역은 아직 조회하지 않았습니다.' : '새로운 원단이 등록되면 이곳에서 확인할 수 있어요.'} />}
    </section><p className="admin-footnote muted">{ctx.mode === 'live' ? '계정 인증만 연결되었습니다. 관리 목록과 통계는 아직 조회하지 않았습니다.' : '화면에 표시된 이름, 수치와 날짜는 예시입니다.'}</p>
  </section>;
}
function SellerList({ ctx }) {
  const status = validStatus(ctx.query, SELLER_STATUS);
  const sellers = ctx.state.sellers.filter(s => s.seller_approval_status === status);
  return <section className="admin-page stack" data-figma-node="123:5138">
    <PageHeading title="판매자 승인 관리" description="판매자 계정의 승인 상태와 매장 정보를 확인하세요. 원단 게시 승인은 별도 관리합니다." />
    <nav className="tabs admin-status-tabs" aria-label="판매자 승인 상태">{Object.entries(SELLER_STATUS).map(([value, label]) => <Button key={value} href={`/admin/sellers?status=${value}`} tone={status === value ? 'primary' : 'secondary'} aria-current={status === value ? 'page' : undefined}>{label}</Button>)}</nav>
    <section className="panel admin-panel" aria-labelledby="admin-seller-list-heading"><h2 id="admin-seller-list-heading">{SELLER_STATUS[status]} 판매자</h2>
      {sellers.length ? <div className="table-wrapper"><table className="data-table admin-seller-table"><caption className="admin-sr-only">{SELLER_STATUS[status]} 판매자 {sellers.length}명</caption><thead><tr><th scope="col">닉네임</th><th scope="col">승인 상태</th><th scope="col">상세보기</th></tr></thead><tbody>{sellers.map(s => <tr key={s.id}><td data-label="닉네임">{s.nickname}</td><td data-label="승인 상태">{SELLER_STATUS[s.seller_approval_status]}</td><td data-label="상세보기"><a href={`#${detailPath('sellers', s.id)}`} aria-label={`${s.nickname} 판매자 상세보기`}>상세보기 →</a></td></tr>)}</tbody></table></div> : <EmptyState title={ctx.mode === 'live' ? '판매자 목록 연결을 준비하고 있어요.' : `${SELLER_STATUS[status]} 판매자가 없어요.`} description={ctx.mode === 'live' ? '판매자 승인 내역은 아직 조회하지 않았습니다.' : '다른 승인 상태를 선택해 확인할 수 있어요.'} />}
    </section><p className="admin-footnote muted">{ctx.mode === 'live' ? '판매자 목록은 아직 조회하지 않았습니다.' : `전체 판매자 ${ctx.state.sellers.length}명 · 이름과 매장 정보는 시연용 예시입니다.`}</p>
  </section>;
}
function SellerDetail({ ctx, id }) {
  const action = useAction();
  const seller = ctx.state.sellers.find(s => String(s.id) === id);
  if (!seller) return <Missing title="판매자 승인 검토" path="/admin/sellers?status=PENDING" label="판매자 목록으로" />;
  const status = seller.seller_approval_status;
  const store = seller.store || (seller.id === ctx.state.seller.id && seller.hasStore ? ctx.state.store : null);
  const storeRows = store ? [['매장명', store.store_name], ['픽업 주소', [store.address || store.store_address, store.detail_address].filter(Boolean).join(' ') || '—'], ['매장 연락처', store.phone_number || store.store_phone], ['휴무일', store.closed_days], ['픽업 안내', store.pickup_guide]] : seller.store_name ? [['매장명', seller.store_name]] : [];
  const description = status === 'PENDING' ? '승인 대기 · 판매자 계정과 매장 정보를 확인한 뒤 승인 또는 거절해 주세요.' : status === 'REJECTED' ? '승인 거절 · 검토 후 판매자 승인을 진행할 수 있어요.' : '승인 완료 · 매장 정보가 준비되면 원단을 등록할 수 있어요.';
  const review = next => action.run(() => ctx.api.reviewSeller(seller.id, next), () => { ctx.navigate(detailPath('sellers', seller.id)); ctx.notify(next === 'APPROVED' ? '판매자를 승인했어요.' : '판매자 승인을 거절했어요.'); });
  return <section className="admin-page stack" data-figma-node={status === 'APPROVED' ? '210:8380' : status === 'REJECTED' ? '210:8462' : '123:5272'}>
    <PageHeading title={status === 'APPROVED' ? '판매자 승인 완료' : status === 'REJECTED' ? '판매자 승인 거절' : '판매자 승인 검토'} description={`${seller.nickname} · 판매자 계정과 매장 정보를 확인하세요.`} />
    <section className="panel admin-panel"><h2>회원정보</h2><div className="admin-member-summary"><h3>{seller.nickname}</h3><Badge>판매자</Badge><StatusBadge status={status} labels={SELLER_STATUS} /></div>
      <Details entries={[[ '닉네임', seller.nickname ], [ '연락처', seller.phone_number || '등록된 연락처 없음' ], [ '이메일', seller.email ]]} />
      <hr className="admin-divider" /><h2>매장 정보</h2>{storeRows.length ? <Details entries={storeRows} /> : <Notice>아직 등록된 매장 정보가 없어요. 승인 후에도 매장을 등록해야 원단을 등록할 수 있어요.</Notice>}
    </section><p className="admin-footnote muted">{description}</p><ActionError error={action.error} />
    <div className="actions admin-actions">
      {['PENDING', 'REJECTED'].includes(status) && <Button tone="primary" data-admin-review-seller="APPROVED" data-id={seller.id} disabled={action.busy} onClick={() => review('APPROVED')}>판매자 승인</Button>}
      {status === 'PENDING' && <Button tone="danger" data-admin-review-seller="REJECTED" data-id={seller.id} disabled={action.busy} onClick={() => review('REJECTED')}>판매자 승인 거절</Button>}
      <Button href={`/admin/sellers?status=${Object.hasOwn(SELLER_STATUS, status) ? status : 'PENDING'}`}>판매자 목록으로</Button>
    </div>
  </section>;
}
function FabricList({ ctx }) {
  const status = validStatus(ctx.query, FABRIC_STATUS);
  const fabrics = ctx.state.fabrics.filter(f => f.status === status);
  return <section className="admin-page stack" data-figma-node="123:5566"><PageHeading title="상품 목록" description="등록된 원단을 확인하고, 상태별로 조회할 수 있어요." />
    <section className="panel admin-panel"><h2>상태별 조회</h2><form id="admin-fabric-filter" data-admin-filter onSubmit={e => e.preventDefault()}>
      <SelectField label="상태" name="status" options={Object.entries(FABRIC_STATUS).map(([value, label]) => ({ value, label }))} value={status} onChange={e => ctx.navigate(`/admin/fabrics?status=${e.target.value}`)} />
    </form></section>
    <section className="panel admin-panel"><h2>{FABRIC_STATUS[status]} · {fabrics.length}건</h2>
      {fabrics.length ? <div className="table-wrapper"><table className="data-table admin-fabric-table"><caption className="admin-sr-only">{FABRIC_STATUS[status]} 원단 목록</caption><thead><tr><th scope="col">원단 사진</th><th scope="col">원단 종류</th><th scope="col">판매자</th><th scope="col">등록 상태</th></tr></thead><tbody>{fabrics.map(f => <tr key={f.id}><td data-label="원단 사진"><FabricImage fabric={f} className="admin-fabric-thumbnail" /></td><td data-label="원단 종류"><a className="admin-fabric-title" href={`#${detailPath('fabrics', f.id)}`}>{f.title}</a><small>{[f.material, f.color].filter(Boolean).join(' · ')}</small></td><td data-label="판매자">{f.store_name}</td><td data-label="등록 상태">{FABRIC_STATUS[f.status]}</td></tr>)}</tbody></table></div> : <EmptyState title={ctx.mode === 'live' ? '원단 목록 연결을 준비하고 있어요.' : `${FABRIC_STATUS[status]} 원단이 없습니다.`} description={ctx.mode === 'live' ? '등록된 원단은 아직 조회하지 않았습니다.' : '다른 상태의 원단을 확인해 보세요.'} />}
    </section><div className="actions"><Button href="/admin/fabrics/filter">상태별 조회</Button></div>
  </section>;
}
function fabricRows(fabric) {
  const isRoll = fabric.sale_type === 'ROLL';
  return [
    ['원단명', fabric.title], ['판매자', fabric.store_name], ['소재 / 색상', [fabric.material, fabric.color].filter(Boolean).join(' / ')], ['판매 형태', isRoll ? '롤 원단' : '자투리 원단'],
    ['치수', isRoll ? `폭 ${fabric.width_cm}cm · 남은 길이 ${formatLength(fabric.remaining_length_cm)}` : `${fabric.width_cm} × ${fabric.length_cm}cm · 1장`],
    ...(isRoll ? [['예약으로 확보된 길이', formatLength(fabric.reserved_length_cm)], ['구매 가능한 길이', formatLength(fabric.available_length_cm)]] : []),
    ['가격', isRoll ? `90cm(1마)당 ${formatPrice(fabric.price)}` : `${formatPrice(fabric.price)} · 1장 전체 가격`], ['하자', fabric.defect_description || fabric.defect_note || '없음'],
  ];
}
function FabricDetail({ ctx, id }) {
  const fabric = ctx.state.fabrics.find(f => String(f.id) === id);
  if (!fabric) return <Missing title="등록 원단 상세" path="/admin/fabrics?status=PENDING" label="상품 목록으로" />;
  const action = ctx.query.get('action');
  if (ctx.query.get('result') && ['POSTED', 'REJECTED'].includes(fabric.status)) return <FabricResult ctx={ctx} fabric={fabric} />;
  if (fabric.status === 'PENDING' && ['approve', 'reject'].includes(action)) return <FabricReview ctx={ctx} fabric={fabric} reject={action === 'reject'} />;
  const stateText = { PENDING: '승인 대기 · 사진과 입력 내용을 검토한 뒤 게시 승인 여부를 결정해 주세요.', POSTED: '게시 중 · 구매자에게 공개된 원단입니다.', REJECTED: '승인 거절 · 판매자의 내용 보완을 기다리는 원단입니다.', SOLD_OUT: '판매 완료 · 구매자 목록에 표시되지 않는 원단입니다.' }[fabric.status] || '원단의 현재 상태를 확인해 주세요.';
  return <section className="admin-page stack" data-figma-node="131:9584">
    <PageHeading title="등록 원단 상세" description="등록 정보와 현재 게시 상태를 확인하세요." /><Notice tone={fabric.status === 'REJECTED' ? 'error' : 'info'}>{stateText}</Notice><FabricImage fabric={fabric} className="admin-fabric-hero" />
    <section className="panel admin-panel"><h2>{fabric.title}</h2><Details entries={fabricRows(fabric)} className="admin-details--fabric" /></section>
    {fabric.description && <section className="panel admin-panel"><h2>판매자 설명</h2><p className="admin-text-preserve">{fabric.description}</p></section>}
    <section className="panel admin-panel"><h2>승인 정보</h2><Details entries={[
      ['등록일', date(fabric.created_at)], ...(fabric.approved_at ? [['승인일', date(fabric.approved_at)]] : []), ['현재 상태', FABRIC_STATUS[fabric.status] || '확인 필요'], ...(fabric.reject_reason ? [['거절 사유', fabric.reject_reason]] : []),
    ]} className="admin-details--fabric" /></section>
    <div className="actions admin-actions">{fabric.status === 'PENDING' && <><Button href={`${detailPath('fabrics', fabric.id)}?action=approve`} tone="primary">원단 게시 승인</Button><Button href={`${detailPath('fabrics', fabric.id)}?action=reject`} tone="danger">게시 승인 거절</Button></>}
      <Button href={`/admin/fabrics?status=${Object.hasOwn(FABRIC_STATUS, fabric.status) ? fabric.status : 'PENDING'}`}>상품 목록으로</Button></div>
  </section>;
}
function FabricReview({ ctx, fabric, reject }) {
  const [reason, setReason] = useState(() => ctx.drafts.get(`admin:reject:${fabric.id}`) || '');
  const reasonRef = useRef(null);
  const action = useAction({ onError: error => { if (error.code === 'SERVICE_ERROR') ctx.navigate(`/admin/error?id=${encodeURIComponent(fabric.id)}`); } });
  function submit(event) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (reject && (!trimmed || trimmed.length > 255)) { action.setError('거절 사유를 1~255자로 입력해 주세요.'); reasonRef.current?.focus(); return; }
    const status = reject ? 'REJECTED' : 'POSTED';
    void action.run(async () => { await ctx.api.reviewFabric(fabric.id, status, trimmed); ctx.drafts.delete(`admin:reject:${fabric.id}`); }, () => {
      ctx.navigate(`${detailPath('fabrics', fabric.id)}?result=${status}`); ctx.notify(reject ? '게시 승인을 거절했어요.' : '원단 게시를 승인했어요.');
    });
  }
  return <section className="admin-page stack" data-figma-node={reject ? '131:9893' : '131:9697'}>
    <PageHeading title={reject ? '게시글 거절 사유 입력' : '원단 게시를 승인할까요?'} description={reject ? '판매자가 내용을 보완할 수 있도록 구체적인 사유를 작성하세요.' : '승인하면 원단이 구매자 목록에 게시됩니다.'} />
    <section className="panel admin-panel"><h2>{reject ? '거절 대상' : '승인 대상'}</h2><Details entries={fabricRows(fabric)} className="admin-details--fabric" /></section>
    {!reject && <Notice tone="warning">사진과 판매자 입력 내용을 검토해 주세요. AI가 정리한 내용은 판매자의 확인이 필요한 보조 정보입니다.</Notice>}
    <form className={reject ? 'panel admin-panel' : 'admin-review-form stack'} data-admin-review-fabric={reject ? 'REJECTED' : 'POSTED'} data-id={fabric.id} onSubmit={submit}>
      {reject ? <><h2>거절 사유</h2><div className="field"><label htmlFor="admin-reject-reason">거절 사유 <span aria-hidden="true">*</span></label>
        <textarea ref={reasonRef} id="admin-reject-reason" name="reason" required minLength={1} maxLength={255} rows={3} aria-describedby="admin-reject-hint" aria-invalid={action.error ? true : undefined} placeholder="예: 사용 가능한 전체 길이를 확인할 수 있는 사진을 보완해 주세요." value={reason} onChange={e => { setReason(e.target.value); ctx.drafts.set(`admin:reject:${fabric.id}`, e.target.value); }} />
        <small id="admin-reject-hint" className="muted">1~255자 · 검토 화면을 오가도 입력한 사유가 유지됩니다. 확정하면 판매자에게 표시됩니다.</small></div></> : <Notice>{fabric.title} 1건을 승인합니다.</Notice>}
      {ctx.query.get('invalid') && <Notice tone="error">거절 사유를 1~255자로 입력해 주세요.</Notice>}<ActionError error={action.error} />
      <div className="actions admin-actions"><Button type="submit" tone={reject ? 'danger' : 'primary'} disabled={action.busy}>{reject ? '거절 확정' : '승인 확정'}</Button><Button href={detailPath('fabrics', fabric.id)}>검토 화면으로</Button></div>
    </form>{reject && <Notice tone="warning">거절 시 원단은 구매자에게 게시되지 않습니다. 사진과 입력 내용을 확인한 결과를 적어 주세요.</Notice>}
  </section>;
}
function PendingTable({ fabrics }) {
  if (!fabrics.length) return <EmptyState title="승인 대기 중인 원단이 없습니다." description="새 원단이 등록되면 목록에 표시됩니다." />;
  return <div className="table-wrapper"><table className="data-table admin-dashboard-table"><caption className="admin-sr-only">남은 승인 대기 원단</caption><thead><tr><th scope="col">원단명</th><th scope="col">판매자</th><th scope="col">신청일</th><th scope="col">상태</th></tr></thead><tbody>{fabrics.map(f => <tr key={f.id}><td data-label="원단명"><a href={`#/admin/approvals?id=${encodeURIComponent(f.id)}`}>{f.title}</a></td><td data-label="판매자">{f.store_name}</td><td data-label="신청일">{date(f.created_at)}</td><td data-label="상태">승인 대기</td></tr>)}</tbody></table></div>;
}
function FabricResult({ ctx, fabric }) {
  const reject = fabric.status === 'REJECTED';
  const pending = ctx.state.fabrics.filter(f => f.status === 'PENDING');
  return <section className="admin-page stack" data-figma-node={reject ? '131:10037' : '131:9772'}>
    <PageHeading title={reject ? '게시글 승인을 거절했습니다' : '원단 게시를 승인했습니다'} description={reject ? `${fabric.title}의 거절 사유가 판매자에게 표시됩니다.` : `${fabric.title}가 승인 대기에서 제외되고 구매자에게 공개되었습니다.`} />
    <Notice tone={reject ? 'error' : 'info'}>{reject ? '승인 거절 · 구매자에게 공개되지 않습니다.' : '승인 완료 · 게시 중인 원단에서 확인할 수 있습니다.'}</Notice>
    <section className="panel admin-panel">{reject ? <><h2>처리 결과</h2><Details entries={[[ '원단명', fabric.title ], [ '판매자', fabric.store_name ], [ '거절 사유', fabric.reject_reason ], [ '현재 상태', '승인 거절' ]]} /></> : <><StatusBadge status="POSTED" labels={FABRIC_STATUS} /><h2>{fabric.title}</h2><p className="muted">{fabric.store_name} · {fabric.sale_type === 'ROLL' ? `롤 원단 · 재고 ${formatLength(fabric.remaining_length_cm)}` : '자투리 원단 · 1장'} · {formatPrice(fabric.price)}</p><p>승인한 원단은 아래 대기 목록에서 제외되었습니다.</p><div className="actions"><Button href={`/buyer/fabrics/${fabric.id}`} tone="primary">게시된 원단 확인</Button><Button href="/admin/approvals?status=POSTED">승인 완료 목록 확인</Button></div></>}</section>
    {reject && <section className="panel admin-panel"><h2>갱신된 거절 내역 · 방금 처리한 원단</h2><Details entries={[[ '원단명', fabric.title ], [ '판매자', fabric.store_name ], [ '상태', '승인 거절' ], [ '거절 사유', fabric.reject_reason ]]} /></section>}
    <section className="panel admin-panel"><h2>남은 승인 대기 · {pending.length}건</h2><PendingTable fabrics={pending} /></section>
    <div className="actions">{reject && <Button href="/admin/approvals?status=REJECTED" tone="primary">승인 거절 목록</Button>}<Button href="/admin/approvals">승인 대기 목록</Button></div>
  </section>;
}
function ApprovalList({ ctx }) {
  const status = validStatus(ctx.query, FABRIC_STATUS);
  const items = ctx.state.fabrics.filter(f => f.status === status);
  const selected = items.find(f => f.id === ctx.query.get('id')) || items[0];
  return <section className="admin-page stack" data-figma-node={status === 'POSTED' ? '123:6125' : status === 'REJECTED' ? '123:6292' : '123:5941'}>
    <PageHeading title="승인 신청 목록" description="등록 원단의 사진과 내용을 확인한 후 승인 여부를 결정하세요." />
    <nav className="tabs admin-approval-tabs" aria-label="원단 게시 승인 상태">{[['POSTED', '승인 완료'], ['PENDING', '승인 대기'], ['REJECTED', '승인 거절']].map(([s, label]) => <Button key={s} href={`/admin/approvals?status=${s}`} aria-current={status === s ? 'page' : undefined}>{label}</Button>)}</nav>
    {!selected ? <EmptyState title={`${FABRIC_STATUS[status]} 원단이 없습니다.`} description="다른 상태를 선택해 확인할 수 있습니다."><Button href="/admin/approvals">승인 대기 보기</Button></EmptyState> : <>
      <div className="admin-mobile-selector"><SelectField label={`검토할 원단 · ${items.length}건`} name="reviewFabric" options={items.map(f => ({ value: f.id, label: `${f.title} · ${f.store_name}` }))} value={selected.id} data-admin-select={status} onChange={e => ctx.navigate(`/admin/approvals?status=${status}&id=${encodeURIComponent(e.target.value)}`)} /></div>
      <div className="admin-review-workspace"><section className="panel admin-panel admin-candidates"><h2>원단 목록</h2><nav className="admin-candidate-list" aria-label="검토할 원단">{items.map(f => <a key={f.id} href={`#/admin/approvals?status=${status}&id=${encodeURIComponent(f.id)}`} aria-current={f.id === selected.id ? 'true' : undefined}><strong>{f.title}</strong><small>{f.id === selected.id ? `${f.store_name} · 선택됨` : `${date(f.created_at)} · ${FABRIC_STATUS[status]}`}</small></a>)}</nav></section>
        <section className="panel admin-panel"><h2>선택한 원단 검토</h2><StatusBadge status={status} labels={FABRIC_STATUS} /><div className="admin-selected-product"><FabricImage fabric={selected} className="admin-review-image" /><div className="stack"><small className="muted">게시글 내용</small><h3>{selected.title}</h3><Details entries={fabricRows(selected).filter(([label]) => !['원단명', '판매 형태', '예약으로 확보된 길이', '구매 가능한 길이'].includes(label))} className="admin-review-details" /></div></div>
          <hr className="admin-divider" />{status === 'PENDING' ? <><h3>AI 정리 내용 · 판매자 확인 필요</h3><p>판매자가 입력한 소재·색상·치수 정보를 확인하세요. 사진과 게시글을 함께 검토해 주세요.</p><Notice>판매자 입력 보조정보이며, 게시 여부는 관리자가 최종 확인합니다.</Notice><div className="actions admin-review-actions"><Button href={`/admin/fabrics/${selected.id}?action=reject`} tone="danger">게시글 거절</Button><Button href={`/admin/fabrics/${selected.id}?action=approve`} tone="primary">게시글 승인</Button></div></> : <><Details entries={[[ '현재 상태', FABRIC_STATUS[status] ], ...(selected.reject_reason ? [['거절 사유', selected.reject_reason]] : [])]} /><Button href={`/admin/fabrics/${selected.id}`}>원단 상세보기</Button></>}
        </section></div>
    </>}
  </section>;
}
function FilterPage() {
  return <section className="admin-page stack" data-figma-node="131:9343"><PageHeading title="상태별 상품 조회" description="원단 상태를 선택하면 해당 목록이 표시됩니다." /><section className="panel admin-panel"><h2>원단 상태</h2><p>조회할 상태</p><p className="muted">아래에서 조회할 상태를 선택하세요.</p><div className="actions">{Object.entries(FABRIC_STATUS).map(([status, label]) => <Button key={status} href={`/admin/fabrics?status=${status}`} tone={status === 'PENDING' ? 'primary' : 'secondary'}>{label} 보기</Button>)}</div></section></section>;
}
function ServiceError({ ctx }) {
  const fabric = ctx.state.fabrics.find(f => f.id === ctx.query.get('id')) || ctx.state.fabrics.find(f => f.status === 'PENDING');
  const reload = async () => { if (ctx.mode !== 'live') await ctx.api.setDemo({ adminResult: 'SUCCESS' }); ctx.navigate(fabric?.id ? detailPath('fabrics', fabric.id) : '/admin/approvals'); };
  return <section className="admin-page stack" data-figma-node="131:10248"><PageHeading title="요청 결과를 확인하지 못했습니다" description="네트워크 연결을 확인하고 신청 정보를 다시 불러와 주세요." /><Notice tone="error">처리 결과를 확인하지 못했습니다. 신청 정보를 다시 불러와 주세요.</Notice><section className="panel admin-panel"><h2>확인할 신청</h2><Details entries={[[ '원단명', fabric?.title ], [ '판매자', fabric?.store_name ], [ '마지막 확인 상태', FABRIC_STATUS[fabric?.status] || '확인 필요' ]]} /></section><div className="actions"><Button tone="primary" data-admin-reload={fabric?.id || ''} onClick={reload}>신청 정보 다시 불러오기</Button><Button href="/admin/dashboard">관리자 홈으로</Button></div></section>;
}

export default function AdminPage({ ctx }) {
  // URL examples are overlays; review actions always mutate the service through ctx.api.
  if (ctx.query.has('sample') || ctx.query.has('empty')) {
    ctx = { ...ctx, state: structuredClone(ctx.state) };
    const status = ctx.query.get('sample');
    const fabric = ctx.state.fabrics.find(f => f.id === (ctx.path.split('/')[3] || 'fabric-pending-1'));
    if (fabric && ['POSTED', 'REJECTED', 'SOLD_OUT'].includes(status)) Object.assign(fabric, { status, reject_reason: status === 'REJECTED' ? '사용 가능한 전체 길이를 확인할 수 있는 사진을 보완해 주세요.' : null });
    if (['APPROVED', 'SELLER_REJECTED'].includes(status)) { const seller = ctx.state.sellers.find(s => s.id === (ctx.path.split('/')[3] || 'seller-1')); if (seller) seller.seller_approval_status = status === 'APPROVED' ? 'APPROVED' : 'REJECTED'; }
    if (ctx.query.has('empty')) ctx.state.fabrics = [];
  }
  if (['/admin/dashboard', '/admin'].includes(ctx.path)) return <Dashboard ctx={ctx} />;
  if (ctx.path === '/admin/approvals') return <ApprovalList ctx={ctx} />;
  if (ctx.path === '/admin/fabrics/filter') return <FilterPage />;
  if (ctx.path === '/admin/error') return <ServiceError ctx={ctx} />;
  if (ctx.path === '/admin/sellers') return <SellerList ctx={ctx} />;
  if (ctx.path === '/admin/fabrics') return <FabricList ctx={ctx} />;
  const match = ctx.path.match(/^\/admin\/(sellers|fabrics)\/([^/]+)$/);
  if (match) {
    let id;
    try { id = decodeURIComponent(match[2]); } catch { return <Missing />; }
    return match[1] === 'sellers' ? <SellerDetail ctx={ctx} id={id} /> : <FabricDetail ctx={ctx} id={id} />;
  }
  return <Missing />;
}
