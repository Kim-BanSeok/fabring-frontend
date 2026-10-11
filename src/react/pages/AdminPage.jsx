import { useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, FabricImage, Notice, PageHeading, SelectField } from '../components/ui.jsx';
import { formatLength, formatPrice } from '../lib/format.js';
import { useAction } from '../hooks/useAction.js';
import { adminRoute, canReviewSeller, confirmSellerReview, fabricPhotos, reviewPath, safeAdminReturn } from './admin-review.js';

const SELLER_STATUS = { PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '승인 거절' };
const FABRIC_STATUS = { PENDING: '승인 대기', POSTED: '게시 중', REJECTED: '승인 거절', SOLD_OUT: '판매 완료' };
const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', POSTED: 'green', REJECTED: 'red', SOLD_OUT: 'gray' };
const detailPath = (kind, id) => '/admin/' + kind + '/' + encodeURIComponent(id);
const date = value => value ? String(value).slice(0, 10).replaceAll('-', '.') : '—';
const validStatus = (query, labels) => Object.hasOwn(labels, query.get('status')) ? query.get('status') : 'PENDING';
const approvalPath = (status = 'PENDING', id) => adminRoute('/admin/approvals', { status, id });
const currentReviewPath = ctx => safeAdminReturn(ctx.path + '?' + ctx.query, ctx.path);

function StatusBadge({ status, labels }) { return <Badge tone={STATUS_TONE[status] || 'gray'}>{labels[status] || '확인 필요'}</Badge>; }
function Details({ entries, className = '' }) {
  return <dl className={'admin-details ' + className}>{entries.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}
function ActionError({ error }) {
  const ref = useRef(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  return <p ref={ref} className="admin-action-error notice notice--error" data-admin-error role="alert" tabIndex={-1} hidden={!error}>{error}</p>;
}
function Missing({ title = '페이지를 찾을 수 없어요.', path = '/admin/dashboard', label = '대시보드 홈' }) {
  return <section className="admin-page stack"><PageHeading title={title} /><EmptyState title="정보를 찾을 수 없어요." description="목록으로 돌아가 현재 상태를 확인해 주세요."><Button href={path}>{label}</Button></EmptyState></section>;
}
function useReviewScroll(ctx, path, enabled = true) {
  const key = 'admin:review-scroll:' + path;
  useEffect(() => {
    if (!enabled) return undefined;
    const top = ctx.drafts.get(key);
    if (typeof top !== 'number') return undefined;
    const frame = requestAnimationFrame(() => { window.scrollTo({ top, behavior: 'instant' }); ctx.drafts.delete(key); });
    return () => cancelAnimationFrame(frame);
  }, [ctx.drafts, key, enabled]);
  return () => ctx.drafts.set(key, window.scrollY);
}
function PhotoGallery({ fabric, compact = false }) {
  const photos = fabricPhotos(fabric);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState({});
  const dialog = useRef(null);
  const photo = photos[Math.min(index, Math.max(0, photos.length - 1))];
  const usable = photo && !failed[photo.url];
  return <figure className={'admin-photo-gallery' + (compact ? ' admin-photo-gallery--compact' : '')}>
    {usable ? <button className="admin-photo-open" aria-label={photo.label + ' 크게 보기'} onClick={() => dialog.current?.showModal()}><img src={photo.url} alt={fabric.title + ' · ' + photo.label} onError={() => setFailed(previous => ({ ...previous, [photo.url]: true }))} /><span>사진 크게 보기</span></button> : <><FabricImage fabric={{ ...fabric, image_url: null }} className="admin-photo-placeholder" /><figcaption>{photo ? '사진을 불러오지 못했어요. 다른 사진을 선택하거나 다시 확인해 주세요.' : '질감 예시 · 표시할 수 있는 등록 사진이 아직 없어요.'}</figcaption></>}
    {photos.length > 0 && <div className="admin-photo-choices" role="group" aria-label="등록 사진 선택">{photos.map((item, i) => <button key={item.url} className="button button--secondary" aria-pressed={i === index} onClick={() => setIndex(i)}>{item.label}{failed[item.url] ? ' · 로드 실패' : ''}</button>)}</div>}
    {usable && <figcaption>{photo.label} · {Math.min(index + 1, photos.length)} / {photos.length}</figcaption>}
    <dialog ref={dialog} className="admin-photo-dialog" aria-label={fabric.title + ' 사진 확대'}>
      <form method="dialog"><Button type="submit">사진 닫기</Button></form>
      {usable && <img src={photo.url} alt={fabric.title + ' · ' + photo.label} />}
    </dialog>
  </figure>;
}
function Dashboard({ ctx }) {
  const { state } = ctx;
  const pending = state.fabrics.filter(f => f.status === 'PENDING');
  const cards = [
    ['원단 게시 대기', pending.length, '확인이 필요한 원단', '/admin/fabrics?status=PENDING'],
    ['승인 완료 판매자', state.sellers.filter(s => s.seller_approval_status === 'APPROVED').length, '승인이 완료된 판매자', '/admin/sellers?status=APPROVED'],
    ['판매자 승인 대기', state.sellers.filter(s => s.seller_approval_status === 'PENDING').length, '승인 확인 대기 판매자', '/admin/sellers?status=PENDING'],
    ['등록된 원단수', state.fabrics.length, '전체 상태 합계 · 상태별 목록에서 조회', null],
  ];
  return <section className="admin-page admin-dashboard stack" data-figma-node="123:4955">
    <PageHeading title="관리자 대시보드" description="새롭게 등록된 원단과 서비스 현황을 확인하세요." />
    <section className="panel admin-panel admin-dashboard-work" aria-labelledby="admin-pending-heading"><div className="admin-list-heading"><h2 id="admin-pending-heading">원단 게시 승인 대기 · {pending.length}건</h2><Button href="/admin/approvals" tone="primary">대기 원단 검토</Button></div>
      <div className="admin-dashboard-preview">{pending.length ? <PendingTable fabrics={pending.slice(0, 3)} /> : <EmptyState title={ctx.mode === 'live' ? '승인 대기 목록 연결을 준비하고 있어요.' : '게시 승인을 기다리는 원단이 없어요.'} description={ctx.mode === 'live' ? '원단 승인 내역은 아직 조회하지 않았습니다.' : '새로운 원단이 등록되면 이곳에서 확인할 수 있어요.'} />}</div>
      {pending.length > 3 && <Button href="/admin/approvals">대기 {pending.length}건 모두 보기 →</Button>}
    </section>
    <div className="stat-grid admin-stats" aria-label="서비스 현황">{cards.map(([title, count, hint, path]) => {
      const content = <><span>{title}</span><strong>{ctx.mode === 'live' ? '—' : count}</strong><small>{ctx.mode === 'live' ? '조회 연결 준비 중' : hint}</small></>;
      return path ? <a key={title} className="stat-card admin-stat" href={'#' + path}>{content}</a> : <div key={title} className="stat-card admin-stat admin-stat--summary">{content}</div>;
    })}</div>
    <p className="admin-footnote muted">{ctx.mode === 'live' ? '계정 인증만 연결되었습니다. 관리 목록과 통계는 아직 조회하지 않았습니다.' : '화면에 표시된 이름, 수치와 날짜는 예시입니다.'}</p>
  </section>;
}
function SellerList({ ctx }) {
  const status = validStatus(ctx.query, SELLER_STATUS);
  const sellers = ctx.state.sellers.filter(s => s.seller_approval_status === status);
  return <section className="admin-page stack" data-figma-node="123:5138">
    <PageHeading title="판매자 승인 관리" description="판매자 계정과 매장 정보를 확인하세요. 원단 게시 승인은 별도 관리합니다." />
    <nav className="tabs admin-status-tabs" aria-label="판매자 승인 상태">{Object.entries(SELLER_STATUS).map(([value, label]) => <Button key={value} href={'/admin/sellers?status=' + value} tone={status === value ? 'primary' : 'secondary'} aria-current={status === value ? 'page' : undefined}>{label}</Button>)}</nav>
    <section className="panel admin-panel" aria-labelledby="admin-seller-list-heading"><h2 id="admin-seller-list-heading">{SELLER_STATUS[status]} 판매자 · {sellers.length}명</h2>
      {sellers.length ? <div className="table-wrapper"><table className="data-table admin-seller-table"><caption className="admin-sr-only">{SELLER_STATUS[status]} 판매자 {sellers.length}명</caption><thead><tr><th scope="col">판매자 계정</th><th scope="col">매장명</th><th scope="col">승인 상태</th><th scope="col">상세보기</th></tr></thead><tbody>{sellers.map(s => <tr key={s.id}><td data-label="판매자 계정"><div><strong>{s.nickname}</strong><small className="admin-account-email">{s.email || '이메일 정보 없음'}</small></div></td><td data-label="매장명">{s.store?.store_name || s.store_name || '매장 정보 없음'}</td><td data-label="승인 상태"><StatusBadge status={s.seller_approval_status} labels={SELLER_STATUS} /></td><td data-label="상세보기"><a href={'#' + adminRoute(detailPath('sellers', s.id), { listStatus: status })} aria-label={s.nickname + ' 판매자 상세보기'}>상세보기 →</a></td></tr>)}</tbody></table></div> : <EmptyState title={ctx.mode === 'live' ? '판매자 목록 연결을 준비하고 있어요.' : SELLER_STATUS[status] + ' 판매자가 없어요.'} description={ctx.mode === 'live' ? '판매자 승인 내역은 아직 조회하지 않았습니다.' : '다른 승인 상태를 선택해 확인할 수 있어요.'} />}
    </section><p className="admin-footnote muted">{ctx.mode === 'live' ? '판매자 목록은 아직 조회하지 않았습니다.' : '전체 판매자 ' + ctx.state.sellers.length + '명 · 이름과 매장 정보는 시연용 예시입니다.'}</p>
  </section>;
}
function SellerDetail({ ctx, id }) {
  const seller = ctx.state.sellers.find(s => String(s.id) === id);
  if (!seller) return <Missing title="판매자 승인 검토" path="/admin/sellers?status=PENDING" label="판매자 목록으로" />;
  const next = { approve: 'APPROVED', reject: 'REJECTED' }[ctx.query.get('action')];
  if (next) return <SellerConfirmation ctx={ctx} seller={seller} next={next} />;
  const status = seller.seller_approval_status;
  const store = seller.store || (seller.id === ctx.state.seller.id && seller.hasStore ? ctx.state.store : null);
  const storeRows = store ? [['매장명', store.store_name], ['픽업 주소', [store.address || store.store_address, store.detail_address].filter(Boolean).join(' ') || '—'], ['매장 연락처', store.phone_number || store.store_phone], ['휴무일', store.closed_days], ['픽업 안내', store.pickup_guide]] : seller.store_name ? [['매장명', seller.store_name]] : [];
  const description = status === 'PENDING' ? '판매자 계정과 매장 정보를 확인한 뒤 승인 또는 거절해 주세요.' : status === 'REJECTED' ? '검토 후 판매자 승인을 진행할 수 있어요.' : '매장 정보가 준비되면 원단을 등록할 수 있어요.';
  const listStatus = Object.hasOwn(SELLER_STATUS, ctx.query.get('listStatus')) ? ctx.query.get('listStatus') : status;
  const reviewFrom = adminRoute(detailPath('sellers', seller.id), { listStatus });
  return <section className="admin-page stack" data-figma-node={status === 'APPROVED' ? '210:8380' : status === 'REJECTED' ? '210:8462' : '123:5272'}>
    <PageHeading title={status === 'APPROVED' ? '판매자 승인 완료' : status === 'REJECTED' ? '판매자 승인 거절' : '판매자 승인 검토'} description={seller.nickname + ' · 판매자 계정과 매장 정보'} />
    <section className="panel admin-panel"><div className="admin-member-summary"><h2>{seller.nickname}</h2><Badge>판매자</Badge><StatusBadge status={status} labels={SELLER_STATUS} /></div><p className="admin-status-description">{description}</p>
      <h3>회원정보</h3><Details entries={[[ '닉네임', seller.nickname ], [ '연락처', seller.phone_number || '등록된 연락처 없음' ], [ '이메일', seller.email ]]} />
      <hr className="admin-divider" /><h3>매장 정보</h3>{storeRows.length ? <Details entries={storeRows} /> : <Notice>아직 등록된 매장 정보가 없어요. 승인 후에도 매장을 등록해야 원단을 등록할 수 있어요.</Notice>}
    </section>
    <div className="actions admin-actions">
      {canReviewSeller(status, 'APPROVED') && <Button href={reviewPath('sellers', seller.id, 'approve', reviewFrom)} tone="primary" data-admin-review-seller="APPROVED" data-id={seller.id}>판매자 승인</Button>}
      {canReviewSeller(status, 'REJECTED') && <Button href={reviewPath('sellers', seller.id, 'reject', reviewFrom)} tone="danger" data-admin-review-seller="REJECTED" data-id={seller.id}>판매자 승인 거절</Button>}
      <Button href={'/admin/sellers?status=' + listStatus}>{SELLER_STATUS[listStatus]} 목록으로</Button>
    </div>
  </section>;
}
function SellerConfirmation({ ctx, seller, next }) {
  const action = useAction();
  const reject = next === 'REJECTED';
  const back = safeAdminReturn(ctx.query.get('returnTo'), detailPath('sellers', seller.id));
  const listStatus = new URL(back, 'https://admin.local').searchParams.get('listStatus') || seller.seller_approval_status;
  const allowed = canReviewSeller(seller.seller_approval_status, next);
  function submit(event) {
    event.preventDefault();
    void action.run(() => confirmSellerReview(ctx.api, seller, next), () => {
      ctx.navigate(adminRoute(detailPath('sellers', seller.id), { listStatus }), { replace: true });
      ctx.notify(reject ? '판매자 승인을 거절했어요.' : '판매자를 승인했어요.');
    });
  }
  return <section className="admin-page stack">
    <PageHeading title={reject ? '판매자 승인을 거절할까요?' : '이 판매자를 승인할까요?'} description="아래 계정과 매장에 적용되는 처리입니다." />
    <form className="panel admin-panel" onSubmit={submit}>
      <Details entries={[[ '닉네임', seller.nickname ], [ '이메일', seller.email ], [ '매장명', seller.store?.store_name || seller.store_name || '등록된 매장 없음' ], [ '현재 상태', SELLER_STATUS[seller.seller_approval_status] ]]} />
      <Notice tone={reject ? 'warning' : 'info'}>{reject ? '이 계정은 원단을 등록할 수 없게 됩니다. 내용을 확인한 뒤 거절을 확정해 주세요.' : '매장 정보가 등록된 판매자는 원단을 등록할 수 있게 됩니다. 원단 게시 승인은 별도로 진행합니다.'}</Notice>
      {!allowed && <Notice tone="warning">현재 상태에서는 이 처리를 할 수 없어요. 검토 화면으로 돌아가 상태를 확인해 주세요.</Notice>}
      <ActionError error={action.error} />
      <div className="actions admin-actions"><Button type="submit" tone={reject ? 'danger' : 'primary'} disabled={action.busy || !allowed}>{action.busy ? '처리 중…' : reject ? '판매자 거절 확정' : '판매자 승인 확정'}</Button><Button href={back}>취소 · 검토로 돌아가기</Button></div>
    </form>
  </section>;
}
function FabricList({ ctx }) {
  const status = validStatus(ctx.query, FABRIC_STATUS);
  const fabrics = ctx.state.fabrics.filter(f => f.status === status);
  return <section className="admin-page stack" data-figma-node="123:5566"><PageHeading title="상품 목록" description="등록된 원단을 상태별로 확인하세요." />
    <section className="panel admin-panel"><div className="admin-list-heading"><h2>{FABRIC_STATUS[status]} · {fabrics.length}건</h2><form id="admin-fabric-filter" data-admin-filter onSubmit={e => e.preventDefault()}><SelectField label="상태" name="status" options={Object.entries(FABRIC_STATUS).map(([value, label]) => ({ value, label }))} value={status} onChange={e => ctx.navigate('/admin/fabrics?status=' + e.target.value)} /></form></div>
      {fabrics.length ? <div className="table-wrapper"><table className="data-table admin-fabric-table"><caption className="admin-sr-only">{FABRIC_STATUS[status]} 원단 목록</caption><thead><tr><th scope="col">원단 사진</th><th scope="col">원단명</th><th scope="col">판매자</th><th scope="col">등록 상태</th></tr></thead><tbody>{fabrics.map(f => <tr key={f.id}><td data-label="원단 사진"><FabricImage fabric={f} className="admin-fabric-thumbnail" /></td><td data-label="원단명"><a className="admin-fabric-title" href={'#' + adminRoute(detailPath('fabrics', f.id), { listStatus: status })}>{f.title}</a><small>{[f.material, f.color].filter(Boolean).join(' · ')}</small></td><td data-label="판매자">{f.store_name}</td><td data-label="등록 상태"><StatusBadge status={f.status} labels={FABRIC_STATUS} /></td></tr>)}</tbody></table></div> : <EmptyState title={ctx.mode === 'live' ? '원단 목록 연결을 준비하고 있어요.' : FABRIC_STATUS[status] + ' 원단이 없습니다.'} description={ctx.mode === 'live' ? '등록된 원단은 아직 조회하지 않았습니다.' : '다른 상태의 원단을 확인해 보세요.'} />}
    </section>
  </section>;
}
function fabricRows(fabric) {
  const isRoll = fabric.sale_type === 'ROLL';
  return [
    ['원단명', fabric.title], ['판매자', fabric.store_name], ['소재 / 색상', [fabric.material, fabric.color].filter(Boolean).join(' / ')], ['판매 형태', isRoll ? '롤 원단' : '자투리 원단'],
    ['치수', isRoll ? '폭 ' + fabric.width_cm + 'cm · 남은 길이 ' + formatLength(fabric.remaining_length_cm) : fabric.width_cm + ' × ' + fabric.length_cm + 'cm · 1장'],
    ...(isRoll ? [['예약으로 확보된 길이', formatLength(fabric.reserved_length_cm)], ['구매 가능한 길이', formatLength(fabric.available_length_cm)]] : []),
    ['가격', isRoll ? '90cm(1마)당 ' + formatPrice(fabric.price) : formatPrice(fabric.price) + ' · 1장 전체 가격'], ['하자', fabric.defect_description || fabric.defect_note || '없음'],
  ];
}
function FabricDetail({ ctx, id }) {
  const fabric = ctx.state.fabrics.find(f => String(f.id) === id);
  const saveScroll = useReviewScroll(ctx, currentReviewPath(ctx), !ctx.query.has('action') && !ctx.query.has('result') && !ctx.query.has('preview'));
  if (!fabric) return <Missing title="등록 원단 상세" path="/admin/fabrics?status=PENDING" label="상품 목록으로" />;
  if (ctx.query.has('preview')) return <FabricPreview ctx={ctx} fabric={fabric} />;
  const action = ctx.query.get('action');
  if (ctx.query.get('result') && ['POSTED', 'REJECTED'].includes(fabric.status)) return <FabricResult ctx={ctx} fabric={fabric} />;
  if (fabric.status === 'PENDING' && ['approve', 'reject'].includes(action)) return <FabricReview ctx={ctx} fabric={fabric} reject={action === 'reject'} />;
  const stateText = { PENDING: '사진과 입력 내용을 검토한 뒤 게시 승인 여부를 결정해 주세요.', POSTED: '구매자에게 공개된 원단입니다.', REJECTED: '판매자의 내용 보완을 기다리는 원단입니다.', SOLD_OUT: '구매자 목록에 표시되지 않는 원단입니다.' }[fabric.status] || '원단의 현재 상태를 확인해 주세요.';
  const from = currentReviewPath(ctx);
  const listStatus = Object.hasOwn(FABRIC_STATUS, ctx.query.get('listStatus')) ? ctx.query.get('listStatus') : fabric.status;
  return <section className="admin-page stack" data-figma-node="131:9584">
    <PageHeading title="등록 원단 상세" description="등록 정보와 현재 게시 상태를 확인하세요." /><div className="admin-status-summary"><StatusBadge status={fabric.status} labels={FABRIC_STATUS} /><p>{stateText}</p></div>
    <section className="panel admin-panel"><h2>{fabric.title}</h2><div className="admin-detail-product"><PhotoGallery key={fabric.id} fabric={fabric} /><Details entries={fabricRows(fabric).filter(([label]) => label !== '원단명')} className="admin-review-details" /></div></section>
    {fabric.description && <section className="panel admin-panel"><h2>판매자 설명</h2><p className="admin-text-preserve">{fabric.description}</p></section>}
    <section className="panel admin-panel"><h2>승인 정보</h2><Details entries={[
      ['등록일', date(fabric.created_at)], ...(fabric.approved_at ? [['승인일', date(fabric.approved_at)]] : []), ['현재 상태', FABRIC_STATUS[fabric.status] || '확인 필요'], ...(fabric.reject_reason ? [['거절 사유', fabric.reject_reason]] : []),
    ]} className="admin-details--fabric" /></section>
    <div className="actions admin-actions">{fabric.status === 'PENDING' && <><Button href={reviewPath('fabrics', fabric.id, 'approve', from)} onClick={saveScroll} tone="primary">원단 게시 승인</Button><Button href={reviewPath('fabrics', fabric.id, 'reject', from)} onClick={saveScroll} tone="danger">게시 승인 거절</Button></>}
      <Button href={ctx.query.get('from') === 'approvals' ? approvalPath(fabric.status, fabric.id) : '/admin/fabrics?status=' + listStatus}>{ctx.query.get('from') === 'approvals' ? '승인 목록으로' : '상품 목록으로'}</Button></div>
  </section>;
}
function FabricReview({ ctx, fabric, reject }) {
  const [reason, setReason] = useState(() => ctx.drafts.get('admin:reject:' + fabric.id) || '');
  const reasonRef = useRef(null);
  const back = safeAdminReturn(ctx.query.get('returnTo'), detailPath('fabrics', fabric.id));
  const context = { from: ctx.query.get('from'), returnTo: back };
  const action = useAction({ onError: error => { if (error.code === 'SERVICE_ERROR') ctx.navigate(adminRoute('/admin/error', { id: fabric.id, ...context })); } });
  function submit(event) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (reject && (!trimmed || trimmed.length > 255)) { action.setError('거절 사유를 1~255자로 입력해 주세요.'); reasonRef.current?.focus(); return; }
    const status = reject ? 'REJECTED' : 'POSTED';
    void action.run(async () => { await ctx.api.reviewFabric(fabric.id, status, trimmed); ctx.drafts.delete('admin:reject:' + fabric.id); }, () => {
      ctx.navigate(adminRoute(detailPath('fabrics', fabric.id), { result: status, ...context }), { replace: true }); ctx.notify(reject ? '게시 승인을 거절했어요.' : '원단 게시를 승인했어요.');
    });
  }
  return <section className="admin-page stack" data-figma-node={reject ? '131:9893' : '131:9697'}>
    <PageHeading title={reject ? '게시글 거절 사유 입력' : '원단 게시를 승인할까요?'} description={reject ? '판매자가 내용을 보완할 수 있도록 구체적인 사유를 작성하세요.' : '승인하면 원단이 구매자 목록에 게시됩니다.'} />
    <form className="panel admin-panel admin-review-form" data-admin-review-fabric={reject ? 'REJECTED' : 'POSTED'} data-id={fabric.id} onSubmit={submit}>
      <div className="admin-confirm-target"><FabricImage fabric={fabric} className="admin-fabric-thumbnail" /><div><h2>{fabric.title}</h2><p>{fabric.store_name}</p><StatusBadge status={fabric.status} labels={FABRIC_STATUS} /></div></div>
      {reject ? <div className="field"><label htmlFor="admin-reject-reason">거절 사유 <span aria-hidden="true">*</span></label>
        <textarea ref={reasonRef} id="admin-reject-reason" name="reason" required minLength={1} maxLength={255} rows={3} aria-describedby="admin-reject-hint" aria-invalid={action.error ? true : undefined} placeholder="예: 사용 가능한 전체 길이를 확인할 수 있는 사진을 보완해 주세요." value={reason} onChange={e => { setReason(e.target.value); ctx.drafts.set('admin:reject:' + fabric.id, e.target.value); }} />
        <small id="admin-reject-hint" className="muted">1~255자 · 검토 화면을 오가도 유지됩니다. 확정하면 판매자에게 표시됩니다.</small></div> : <Notice>사진과 등록 내용을 검토한 {fabric.title} 1건을 승인합니다.</Notice>}
      {reject && <p className="admin-status-description">거절하면 구매자에게 게시되지 않습니다. 사진과 입력 내용에서 보완할 점을 적어 주세요.</p>}
      {ctx.query.get('invalid') && <Notice tone="error">거절 사유를 1~255자로 입력해 주세요.</Notice>}<ActionError error={action.error} />
      <div className="actions admin-actions"><Button type="submit" tone={reject ? 'danger' : 'primary'} disabled={action.busy}>{action.busy ? '처리 중…' : reject ? '거절 확정' : '승인 확정'}</Button><Button href={back}>취소 · 검토 화면으로</Button></div>
      <details className="admin-more-details"><summary>대상 원단 정보 다시 확인</summary><Details entries={fabricRows(fabric)} className="admin-details--fabric" /></details>
    </form>
  </section>;
}
function PendingTable({ fabrics }) {
  if (!fabrics.length) return <EmptyState title="승인 대기 중인 원단이 없습니다." description="새 원단이 등록되면 목록에 표시됩니다." />;
  return <div className="table-wrapper"><table className="data-table admin-dashboard-table"><caption className="admin-sr-only">승인 대기 원단</caption><thead><tr><th scope="col">원단명</th><th scope="col">판매자</th><th scope="col">신청일</th><th scope="col">상태</th></tr></thead><tbody>{fabrics.map(f => <tr key={f.id}><td data-label="원단명"><a href={'#' + approvalPath('PENDING', f.id)}>{f.title}</a></td><td data-label="판매자">{f.store_name}</td><td data-label="신청일">{date(f.created_at)}</td><td data-label="상태">승인 대기</td></tr>)}</tbody></table></div>;
}
function FabricResult({ ctx, fabric }) {
  const reject = fabric.status === 'REJECTED';
  const pending = ctx.state.fabrics.filter(f => f.status === 'PENDING');
  const resultPath = adminRoute(detailPath('fabrics', fabric.id), { result: fabric.status, from: ctx.query.get('from') });
  return <section className="admin-page stack" data-figma-node={reject ? '131:10037' : '131:9772'}>
    <PageHeading title={reject ? '게시글 승인을 거절했습니다' : '원단 게시를 승인했습니다'} description={reject ? '거절 사유가 판매자에게 표시됩니다.' : '승인한 원단이 구매자에게 공개되었습니다.'} />
    <section className="panel admin-panel"><div className="admin-result-heading"><div><h2>{fabric.title}</h2><p>{fabric.store_name}</p></div><StatusBadge status={fabric.status} labels={FABRIC_STATUS} /></div>
      {reject ? <Details entries={[[ '거절 사유', fabric.reject_reason ]]} /> : <p className="admin-status-description">이 원단은 승인 대기 목록에서 제외되었습니다.</p>}
      <div className="actions admin-actions">{pending[0] && <Button href={approvalPath('PENDING', pending[0].id)} tone="primary">다음 대기 원단 검토 · {pending.length}건</Button>}
        {!reject && <Button href={adminRoute(detailPath('fabrics', fabric.id), { preview: 1, from: 'approvals', returnTo: resultPath })}>게시된 원단 미리보기</Button>}
        <Button href={approvalPath(fabric.status)}>{reject ? '승인 거절' : '승인 완료'} 목록</Button></div>
    </section>
    <section className="panel admin-panel"><h2>남은 승인 대기 · {pending.length}건</h2><PendingTable fabrics={pending} /></section>
    <Button href="/admin/approvals">승인 대기 목록</Button>
  </section>;
}
function FabricPreview({ ctx, fabric }) {
  const back = safeAdminReturn(ctx.query.get('returnTo'), approvalPath(fabric.status, fabric.id));
  return <section className="admin-page stack" data-admin-preview>
    <div className="admin-list-heading"><PageHeading title="게시 원단 미리보기" description="관리자 검토용 화면입니다." /><Button href={back}>관리자 검토로 돌아가기</Button></div>
    <Notice>구매자에게 제공하는 원단 정보를 확인하세요. 픽업 요청과 문의는 이 미리보기에서 진행하지 않습니다.</Notice>
    <section className="panel admin-panel"><div className="admin-result-heading"><div><h2>{fabric.title}</h2><p>{fabric.store_name}</p></div><StatusBadge status={fabric.status} labels={FABRIC_STATUS} /></div>
      <div className="admin-detail-product"><PhotoGallery key={fabric.id} fabric={fabric} /><Details entries={fabricRows(fabric).filter(([label]) => label !== '원단명')} className="admin-review-details" /></div>
      {fabric.description && <><h3>판매자 설명</h3><p className="admin-text-preserve">{fabric.description}</p></>}
    </section>
    <Button href={back}>관리자 검토로 돌아가기</Button>
  </section>;
}
function ApprovalList({ ctx }) {
  const status = validStatus(ctx.query, FABRIC_STATUS);
  const items = ctx.state.fabrics.filter(f => f.status === status);
  const selected = items.find(f => String(f.id) === ctx.query.get('id')) || items[0];
  const origin = approvalPath(status, selected?.id);
  const saveScroll = useReviewScroll(ctx, origin);
  return <section className="admin-page stack" data-figma-node={status === 'POSTED' ? '123:6125' : status === 'REJECTED' ? '123:6292' : '123:5941'}>
    <PageHeading title="원단 게시 승인" description="원단 사진과 등록 내용을 확인한 뒤 승인 여부를 결정하세요." />
    <nav className="tabs admin-status-tabs admin-approval-tabs" aria-label="원단 게시 승인 상태">{[['PENDING', '승인 대기'], ['POSTED', '승인 완료'], ['REJECTED', '승인 거절']].map(([s, label]) => <Button key={s} href={approvalPath(s)} tone={status === s ? 'primary' : 'secondary'} aria-current={status === s ? 'page' : undefined}>{label}</Button>)}</nav>
    {!selected ? <EmptyState title={ctx.mode === 'live' ? '승인 목록 연결을 준비하고 있어요.' : FABRIC_STATUS[status] + ' 원단이 없습니다.'} description={ctx.mode === 'live' ? '원단 승인 내역은 아직 조회하지 않았습니다.' : '다른 상태를 선택해 확인할 수 있습니다.'}><Button href="/admin/approvals">승인 대기 보기</Button></EmptyState> : <>
      <div className="admin-mobile-selector"><SelectField label={'검토할 원단 · ' + items.length + '건'} name="reviewFabric" options={items.map(f => ({ value: f.id, label: f.title + ' · ' + f.store_name }))} value={selected.id} data-admin-select={status} onChange={e => ctx.navigate(approvalPath(status, e.target.value))} /></div>
      <div className="admin-review-workspace"><section className="panel admin-panel admin-candidates"><h2>원단 목록 · {items.length}건</h2><nav className="admin-candidate-list" aria-label="검토할 원단">{items.map(f => <a key={f.id} href={'#' + approvalPath(status, f.id)} aria-current={f.id === selected.id ? 'true' : undefined}><strong>{f.title}</strong><small>{f.store_name} · {f.id === selected.id ? '선택됨' : date(f.created_at)}</small></a>)}</nav></section>
        <section className="panel admin-panel admin-review-card"><div className="admin-result-heading"><h2>{selected.title}</h2><StatusBadge status={status} labels={FABRIC_STATUS} /></div>
          <div className="admin-selected-product"><PhotoGallery key={selected.id} fabric={selected} compact /><div className="stack"><Details entries={fabricRows(selected).filter(([label]) => !['원단명', '판매 형태', '예약으로 확보된 길이', '구매 가능한 길이'].includes(label))} className="admin-review-details" /></div></div>
          {status === 'PENDING' ? <><div className="actions admin-review-actions"><Button href={reviewPath('fabrics', selected.id, 'reject', origin)} onClick={saveScroll} tone="danger">게시글 거절</Button><Button href={reviewPath('fabrics', selected.id, 'approve', origin)} onClick={saveScroll} tone="primary">게시글 승인</Button></div><details className="admin-more-details"><summary>등록 내용 검토 안내</summary><p>사진과 소재·색상·치수, 하자 설명이 일치하는지 확인하세요. 등록 내용을 근거로 관리자가 게시 여부를 결정합니다.</p>{selected.description && <p className="admin-text-preserve">{selected.description}</p>}</details></> : <>{selected.reject_reason && <Details entries={[[ '거절 사유', selected.reject_reason ]]} />}<Button href={adminRoute(detailPath('fabrics', selected.id), { from: 'approvals' })}>원단 상세보기</Button></>}
        </section></div>
    </>}
  </section>;
}
function ServiceError({ ctx }) {
  const fabric = ctx.state.fabrics.find(f => String(f.id) === ctx.query.get('id')) || ctx.state.fabrics.find(f => f.status === 'PENDING');
  const reload = async () => { if (ctx.mode !== 'live') await ctx.api.setDemo({ adminResult: 'SUCCESS' }); ctx.navigate(safeAdminReturn(ctx.query.get('returnTo'), fabric?.id ? detailPath('fabrics', fabric.id) : '/admin/approvals')); };
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
  // Keep bookmarked/gallery filter URLs useful without a second filtering workflow.
  if (ctx.path === '/admin/fabrics/filter') return <FabricList ctx={ctx} />;
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
