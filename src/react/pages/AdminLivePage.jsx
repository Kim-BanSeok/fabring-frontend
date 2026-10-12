import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, FabricImage, Notice, PageHeading, SelectField } from '../components/ui.jsx';
import { formatLength, formatPrice } from '../lib/format.js';
import useReservationMutation from '../hooks/useReservationMutation.js';
import { adminRoute, fabricPhotos } from './admin-review.js';
import { ADMIN_SELLER_STATUS as SELLER_STATUS, ADMIN_FABRIC_STATUS as FABRIC_STATUS, adminListQuery, adminListBack, adminItemPath, adminReviewPath, safeLiveAdminReturn, adminCanReview, adminHasPhotos, adminReviewConfirmed, adminOperationKey, adminReasonKey, adminReviewFailure, startAdminRead, submitAdminReview } from './adminLiveModel.js';

const TONES = { PENDING: 'amber', APPROVED: 'green', POSTED: 'green', REJECTED: 'red', SOLD_OUT: 'gray' };
const date = value => value ? String(value).slice(0, 10).replaceAll('-', '.') : '—';
const labelsFor = kind => kind === 'sellers' ? SELLER_STATUS : FABRIC_STATUS;
const itemStatus = (kind, item) => kind === 'sellers' ? item.seller_approval_status : item.status;
const currentPath = ctx => ctx.path + (ctx.query.size ? '?' + ctx.query : '');

function useReviewScroll(ctx, path, ready) {
  useEffect(() => {
    const key = 'admin:live:scroll:' + path, top = ctx.drafts.get(key);
    if (!ready || typeof top !== 'number') return undefined;
    const frame = requestAnimationFrame(() => { window.scrollTo({ top, behavior: 'instant' }); ctx.drafts.delete(key); });
    return () => cancelAnimationFrame(frame);
  }, [ctx.drafts, path, ready]);
}

function useAdminResource(api, request) {
  const key = request ? JSON.stringify(request) : '';
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!key) return undefined;
    const identity = { api, key, attempt };
    return startAdminRead(api, JSON.parse(key), data => setResult({ ...identity, data, error: null }), error => setResult({ ...identity, data: null, error }));
  }, [api, key, attempt]);
  const current = result?.api === api && result?.key === key && result?.attempt === attempt;
  return { loading: Boolean(key) && !current, data: current ? result.data : null, error: current ? result.error : null, retry, attempt };
}
function Status({ kind = 'fabrics', status }) { return <Badge tone={TONES[status] || 'gray'}>{labelsFor(kind)[status] || '확인 필요'}</Badge>; }
function Details({ entries, className = '' }) { return <dl className={'admin-details ' + className}>{entries.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '정보 없음'}</dd></div>)}</dl>; }
function Missing() { return <section className="admin-page stack"><PageHeading title="페이지를 찾을 수 없어요." /><Button href="/admin/dashboard">관리자 홈으로</Button></section>; }
function AsyncState({ resource, title = '정보를 확인하고 있어요.', back, acknowledgement }) {
  if (!resource.loading && !resource.error) return null;
  return <section className="stack" aria-busy={resource.loading}>
    {acknowledgement && <Notice>요청한 처리는 서버에서 완료됐어요. 현재 정보 조회만 다시 시도해 주세요.</Notice>}
    {resource.loading ? <Notice role="status">{title}</Notice> : <><Notice tone="error">{resource.error.code === 'NOT_FOUND' ? '대상을 찾을 수 없어요. 목록에서 현재 상태를 확인해 주세요.' : resource.error.message || '정보를 불러오지 못했어요.'}</Notice><div className="actions"><Button onClick={resource.retry} tone="primary">정보 다시 조회</Button>{back && <Button href={back}>목록으로</Button>}</div></>}
  </section>;
}
function Pagination({ data, path, query }) {
  if (!data) return null;
  const route = page => adminRoute(path, { ...query, id: undefined, page, size: data.size });
  return <nav className="actions admin-actions" aria-label="목록 페이지">
    <Button href={route(Math.max(0, data.page - 1))} disabled={data.page <= 0}>이전 페이지</Button>
    <span className="muted">{data.totalPages ? data.page + 1 : 0} / {data.totalPages}페이지 · 전체 {data.totalElements}건</span>
    <Button href={route(data.page + 1)} disabled={data.page + 1 >= data.totalPages}>다음 페이지</Button>
    {!data.items.length && data.page > 0 && <Button href={route(0)}>첫 페이지로</Button>}
  </nav>;
}
function PhotoGallery({ fabric, compact = false }) {
  const photos = fabricPhotos(fabric), [index, setIndex] = useState(0), [failed, setFailed] = useState({});
  const dialog = useRef(null), photo = photos[Math.min(index, Math.max(0, photos.length - 1))], usable = photo && !failed[photo.url];
  return <figure className={'admin-photo-gallery' + (compact ? ' admin-photo-gallery--compact' : '')}>
    {usable ? <button className="admin-photo-open" aria-label={photo.label + ' 크게 보기'} onClick={() => dialog.current?.showModal()}><img src={photo.url} alt={fabric.title + ' · ' + photo.label} onError={() => setFailed(value => ({ ...value, [photo.url]: true }))} /><span>사진 크게 보기</span></button> : <><FabricImage fabric={{ ...fabric, source: 'api', image_url: null }} className="admin-photo-placeholder" /><figcaption>{photo ? '사진을 불러오지 못했어요. 다른 사진을 선택하거나 정보를 다시 조회해 주세요.' : '등록된 사진이 없어요. 게시 승인에는 사진이 필요합니다.'}</figcaption></>}
    {photos.length > 0 && <div className="admin-photo-choices" role="group" aria-label="등록 사진 선택">{photos.map((item, i) => <button key={item.url} className="button button--secondary" aria-pressed={i === index} onClick={() => setIndex(i)}>{item.label}{failed[item.url] ? ' · 로드 실패' : ''}</button>)}</div>}
    {usable && <figcaption>{photo.label} · {Math.min(index + 1, photos.length)} / {photos.length}</figcaption>}
    <dialog ref={dialog} className="admin-photo-dialog" aria-label={fabric.title + ' 사진 확대'}><form method="dialog"><Button type="submit">사진 닫기</Button></form>{usable && <img src={photo.url} alt={fabric.title + ' · ' + photo.label} />}</dialog>
  </figure>;
}
function fabricRows(fabric) {
  const roll = fabric.sale_type === 'ROLL', cm = value => value == null ? '정보 없음' : value + 'cm';
  return [['원단명', fabric.title], ['판매자', fabric.store_name || '매장 정보 없음'], ['소재 / 색상', [fabric.material, fabric.color].filter(Boolean).join(' / ') || '정보 없음'], ['판매 형태', roll ? '롤 원단' : '자투리 원단'],
    ['치수', roll ? '폭 ' + cm(fabric.width_cm) + ' · 남은 길이 ' + (fabric.remaining_length_cm == null ? '정보 없음' : formatLength(fabric.remaining_length_cm)) : cm(fabric.width_cm) + ' × ' + cm(fabric.length_cm) + ' · 1장'],
    ...(roll ? [['예약으로 확보된 길이', fabric.reserved_length_cm == null ? '정보 없음' : formatLength(fabric.reserved_length_cm)], ['구매 가능한 길이', fabric.available_length_cm == null ? '정보 없음' : formatLength(fabric.available_length_cm)]] : []),
    ['가격', fabric.price == null ? '정보 없음' : (roll ? '90cm(1마)당 ' : '') + formatPrice(fabric.price) + (roll ? '' : ' · 1장 전체 가격')], ['하자', fabric.has_defect ? fabric.defect_note || '하자 있음 · 설명 없음' : '없음']];
}
function PendingTable({ items }) {
  if (!items.length) return <EmptyState title="게시 승인을 기다리는 원단이 없어요." description="새 원단이 등록되면 이곳에서 확인할 수 있어요." />;
  return <div className="table-wrapper"><table className="data-table admin-dashboard-table"><caption className="admin-sr-only">승인 대기 원단</caption><thead><tr><th scope="col">원단명</th><th scope="col">판매자</th><th scope="col">신청일</th><th scope="col">상태</th></tr></thead><tbody>{items.map(f => <tr key={f.id}><td data-label="원단명"><a href={'#' + adminRoute('/admin/approvals', { status: 'PENDING', id: f.id })}>{f.title}</a></td><td data-label="판매자">{f.store_name || '매장 정보 없음'}</td><td data-label="신청일">{date(f.created_at)}</td><td data-label="상태">승인 대기</td></tr>)}</tbody></table></div>;
}
function Dashboard({ ctx }) {
  const resource = useAdminResource(ctx.api, { type: 'dashboard' }), data = resource.data;
  const cards = data ? [['원단 게시 대기', data.fabricCounts.PENDING, '확인이 필요한 원단', '/admin/fabrics?status=PENDING'], ['승인 완료 판매자', data.sellerCounts.APPROVED, '승인이 완료된 판매자', '/admin/sellers?status=APPROVED'], ['판매자 승인 대기', data.sellerCounts.PENDING, '승인 확인 대기 판매자', '/admin/sellers?status=PENDING'], ['등록된 원단수', Object.values(data.fabricCounts).reduce((sum, count) => sum + count, 0), '전체 상태 합계 · 상태별 목록에서 조회', null]] : [];
  return <section className="admin-page admin-dashboard stack" data-figma-node="123:4955"><PageHeading title="관리자 대시보드" description="새롭게 등록된 원단과 서비스 현황을 확인하세요." />
    <AsyncState resource={resource} title="관리 목록과 통계를 확인하고 있어요." />
    {data && <><section className="panel admin-panel admin-dashboard-work"><div className="admin-list-heading"><h2>원단 게시 승인 대기 · {data.fabricCounts.PENDING}건</h2><Button href="/admin/approvals" tone="primary">대기 원단 검토</Button></div><div className="admin-dashboard-preview"><PendingTable items={data.pendingFabrics.slice(0, 3)} /></div>{data.fabricCounts.PENDING > 3 && <Button href="/admin/approvals">대기 {data.fabricCounts.PENDING}건 모두 보기 →</Button>}</section>
      <div className="stat-grid admin-stats" aria-label="서비스 현황">{cards.map(([title, count, hint, path]) => { const content = <><span>{title}</span><strong>{count}</strong><small>{hint}</small></>; return path ? <a key={title} className="stat-card admin-stat" href={'#' + path}>{content}</a> : <div key={title} className="stat-card admin-stat admin-stat--summary">{content}</div>; })}</div><div className="actions"><Button onClick={resource.retry}>최신 현황 조회</Button></div></>}
  </section>;
}
function List({ ctx, kind }) {
  const seller = kind === 'sellers', query = adminListQuery(ctx.query, kind), labels = labelsFor(kind), path = '/admin/' + kind;
  const resource = useAdminResource(ctx.api, { type: 'list', kind, query }), data = resource.data;
  const listPath = adminRoute(path, query), heading = seller ? '판매자 승인 관리' : '상품 목록';
  return <section className="admin-page stack" data-figma-node={seller ? '123:5138' : '123:5566'}><PageHeading title={heading} description={seller ? '판매자 계정과 매장 정보를 확인하세요. 원단 게시 승인은 별도 관리합니다.' : '등록된 원단을 상태별로 확인하세요.'} />
    {seller && <nav className="tabs admin-status-tabs" aria-label="판매자 승인 상태">{Object.entries(labels).map(([value, label]) => <Button key={value} href={adminRoute(path, { status: value, size: query.size })} tone={query.status === value ? 'primary' : 'secondary'} aria-current={query.status === value ? 'page' : undefined}>{label}</Button>)}</nav>}
    <section className="panel admin-panel"><div className="admin-list-heading"><h2>{labels[query.status]}{data ? ' · ' + data.totalElements + (seller ? '명' : '건') : ''}</h2>{!seller && <form data-admin-filter onSubmit={e => e.preventDefault()}><SelectField label="상태" name="status" options={Object.entries(labels).map(([value, label]) => ({ value, label }))} value={query.status} onChange={e => ctx.navigate(adminRoute(path, { status: e.target.value, size: query.size }))} /></form>}</div>
      <AsyncState resource={resource} title="목록을 불러오고 있어요." />
      {data && (data.items.length ? <div className="table-wrapper"><table className={'data-table ' + (seller ? 'admin-seller-table' : 'admin-fabric-table')}><caption className="admin-sr-only">{labels[query.status]} {seller ? '판매자' : '원단'} 목록</caption><thead><tr>{(seller ? ['판매자 계정', '매장명', '승인 상태', '상세보기'] : ['원단 사진', '원단명', '판매자', '등록 상태']).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(item => seller ? <tr key={item.id}><td data-label="판매자 계정"><div><strong>{item.nickname}</strong><small className="admin-account-email">{item.email}</small></div></td><td data-label="매장명">{item.store?.store_name || '등록된 매장 없음'}</td><td data-label="승인 상태"><Status kind="sellers" status={item.seller_approval_status} /></td><td data-label="상세보기"><a href={'#' + adminItemPath(kind, item.id, listPath)} aria-label={item.nickname + ' 판매자 상세보기'}>상세보기 →</a></td></tr> : <tr key={item.id}><td data-label="원단 사진"><FabricImage fabric={item} className="admin-fabric-thumbnail" /></td><td data-label="원단명"><a className="admin-fabric-title" href={'#' + adminItemPath(kind, item.id, listPath)}>{item.title}</a><small>{[item.material, item.color].filter(Boolean).join(' · ')}</small></td><td data-label="판매자">{item.store_name || '매장 정보 없음'}</td><td data-label="등록 상태"><Status status={item.status} /></td></tr>)}</tbody></table></div> : <EmptyState title={labels[query.status] + (seller ? ' 판매자가 없어요.' : ' 원단이 없어요.')} description={data.page > 0 ? '목록이 변경됐을 수 있어요. 첫 페이지부터 다시 확인해 주세요.' : '다른 상태를 선택해 확인할 수 있어요.'} />)}
    </section><Pagination data={data} path={path} query={query} /><Button onClick={resource.retry}>목록 새로고침</Button>
  </section>;
}
function SellerInfo({ seller }) {
  const store = seller.store;
  return <section className="panel admin-panel"><div className="admin-member-summary"><h2>{seller.nickname}</h2><Badge>판매자</Badge><Status kind="sellers" status={seller.seller_approval_status} /></div><h3>회원정보</h3><Details entries={[[ '닉네임', seller.nickname ], [ '연락처', seller.phone_number || '등록된 연락처 없음' ], [ '이메일', seller.email ], [ '가입일', date(seller.created_at) ]]} /><hr className="admin-divider" /><h3>매장 정보</h3>{store ? <Details entries={[[ '매장명', store.store_name ], [ '픽업 주소', store.address ], [ '매장 연락처', store.phone_number ], [ '휴무일', store.closed_days || '입력하지 않음' ], [ '픽업 안내', store.pickup_guide || '입력하지 않음' ]]} /> : <Notice>등록된 매장이 없어요. 판매자 승인은 가능하며, 원단을 등록하려면 이후 매장을 등록해야 해요.</Notice>}</section>;
}
function FabricInfo({ fabric, compact = false }) {
  return <><div className={compact ? 'admin-selected-product' : 'admin-detail-product'}><PhotoGallery key={fabric.id} fabric={fabric} compact={compact} /><Details entries={fabricRows(fabric).filter(([label]) => label !== '원단명')} className="admin-review-details" /></div>{fabric.description && <><h3>판매자 설명</h3><p className="admin-text-preserve">{fabric.description}</p></>}{fabric.status === 'REJECTED' && <Details entries={[[ '거절 사유', fabric.reject_reason || '등록된 거절 사유 없음' ]]} />}</>;
}
function ReviewActions({ ctx, kind, item, origin, listPath, compact = false }) {
  const approved = kind === 'sellers' ? 'APPROVED' : 'POSTED', isSeller = kind === 'sellers';
  const saveScroll = () => ctx.drafts.set('admin:live:scroll:' + origin, window.scrollY);
  return <div className={'actions ' + (compact ? 'admin-review-actions' : 'admin-actions')}>
    {adminCanReview(kind, item, approved) && <Button href={adminReviewPath(kind, item.id, approved, origin, listPath)} onClick={saveScroll} tone="primary">{isSeller ? '판매자 승인' : compact ? '게시글 승인' : '원단 게시 승인'}</Button>}
    {adminCanReview(kind, item, 'REJECTED') && <Button href={adminReviewPath(kind, item.id, 'REJECTED', origin, listPath)} onClick={saveScroll} tone="danger">{isSeller ? '판매자 승인 거절' : compact ? '게시글 거절' : '게시 승인 거절'}</Button>}
    {!compact && <Button href={listPath}>{isSeller ? '판매자 목록으로' : ctx.query.get('from') === 'approvals' ? '승인 목록으로' : '상품 목록으로'}</Button>}
  </div>;
}
function ApprovalSelected({ ctx, id, status, origin, listPath }) {
  const resource = useAdminResource(ctx.api, { type: 'detail', kind: 'fabrics', id, statusHint: status }), fabric = resource.data;
  useReviewScroll(ctx, origin, Boolean(fabric));
  return <section className="panel admin-panel admin-review-card"><AsyncState resource={resource} title="선택한 원단 정보를 확인하고 있어요." />{fabric && <><div className="admin-result-heading"><h2>{fabric.title}</h2><Status status={fabric.status} /></div>{fabric.status !== status && <Notice tone="warning">선택한 원단의 상태가 변경됐어요. 아래 최신 상태를 확인하거나 목록을 새로 조회해 주세요.</Notice>}<FabricInfo fabric={fabric} compact /><ReviewActions ctx={ctx} kind="fabrics" item={fabric} origin={origin} listPath={listPath} compact /><Button href={adminItemPath('fabrics', fabric.id, listPath)}>원단 상세보기</Button><Button onClick={resource.retry}>원단 정보 다시 조회</Button></>}</section>;
}
function ApprovalList({ ctx }) {
  const query = adminListQuery(ctx.query), resource = useAdminResource(ctx.api, { type: 'list', kind: 'fabrics', query }), data = resource.data;
  const id = ctx.query.get('id') || data?.items[0]?.id, path = '/admin/approvals', listPath = adminRoute(path, query), origin = adminRoute(path, { ...query, id });
  const options = data ? data.items.map(f => ({ value: f.id, label: f.title + ' · ' + (f.store_name || '매장 정보 없음') })) : [];
  if (id && data && !options.some(option => String(option.value) === String(id))) options.unshift({ value: id, label: '현재 선택 원단 · #' + id });
  return <section className="admin-page stack" data-figma-node={query.status === 'POSTED' ? '123:6125' : query.status === 'REJECTED' ? '123:6292' : '123:5941'}><PageHeading title="원단 게시 승인" description="원단 사진과 등록 내용을 확인한 뒤 승인 여부를 결정하세요." />
    <nav className="tabs admin-status-tabs admin-approval-tabs" aria-label="원단 게시 승인 상태">{[['PENDING', '승인 대기'], ['POSTED', '승인 완료'], ['REJECTED', '승인 거절']].map(([status, label]) => <Button key={status} href={adminRoute(path, { status, size: query.size })} tone={query.status === status ? 'primary' : 'secondary'} aria-current={query.status === status ? 'page' : undefined}>{label}</Button>)}</nav>
    <AsyncState resource={resource} title="승인 목록을 확인하고 있어요." />
    {data && <>{!data.items.length && <EmptyState title={FABRIC_STATUS[query.status] + ' 원단이 없어요.'} description={data.page > 0 ? '목록이 변경됐을 수 있어요. 첫 페이지로 돌아가 확인해 주세요.' : '다른 상태를 선택해 확인할 수 있어요.'} />}
      {id && <><div className="admin-mobile-selector"><SelectField label={'검토할 원단 · 전체 ' + data.totalElements + '건'} name="reviewFabric" options={options} value={id} onChange={e => ctx.navigate(adminRoute(path, { ...query, id: e.target.value }))} /></div><div className="admin-review-workspace"><section className="panel admin-panel admin-candidates"><h2>원단 목록 · {data.totalElements}건</h2><nav className="admin-candidate-list" aria-label="검토할 원단">{data.items.map(f => <a key={f.id} href={'#' + adminRoute(path, { ...query, id: f.id })} aria-current={String(f.id) === String(id) ? 'true' : undefined}><strong>{f.title}</strong><small>{f.store_name || '매장 정보 없음'} · {String(f.id) === String(id) ? '선택됨' : date(f.created_at)}</small></a>)}</nav></section><ApprovalSelected key={id} ctx={ctx} id={id} status={query.status} origin={origin} listPath={listPath} /></div></>}
    </>}<Pagination data={data} path={path} query={query} /><Button onClick={resource.retry}>승인 목록 새로고침</Button>
  </section>;
}
function ReviewConfirmation({ ctx, kind, item, next, retry }) {
  const mutation = useReservationMutation(ctx), operationKey = adminOperationKey(kind, item.id);
  const [operation, setOperation] = useState(() => ctx.drafts.get(operationKey)), [checked, setChecked] = useState(true);
  const [reason, setReason] = useState(() => ctx.drafts.get(adminReasonKey(item.id)) || '');
  const errorRef = useRef(null), reasonRef = useRef(null), seller = kind === 'sellers', reject = next === 'REJECTED';
  const status = itemStatus(kind, item), allowed = adminCanReview(kind, item, next), listPath = adminListBack(kind, ctx.query, status);
  const itemPath = adminItemPath(kind, item.id, listPath), back = safeLiveAdminReturn(ctx.query.get('returnTo'), itemPath);
  const locked = Boolean(operation && operation.status !== 'CONFIRMED'), confirmed = adminReviewConfirmed(operation, next, status);
  const photoMissing = !seller && !reject && !adminHasPhotos(item);
  useEffect(() => { if (mutation.error) errorRef.current?.focus({ preventScroll: true }); }, [mutation.error]);
  function remember(value) { if (value) ctx.drafts.set(operationKey, value); else ctx.drafts.delete(operationKey); setOperation(value); }
  function submit(event) {
    event.preventDefault();
    if (locked || confirmed || !allowed || photoMissing) return;
    if (!seller && reject && (!reason.trim() || reason.trim().length > 255)) { mutation.setError('거절 사유를 1~255자로 입력해 주세요.'); reasonRef.current?.focus(); return; }
    void mutation.run(async ({ signal, isCurrent }) => {
      setChecked(false);
      const ack = await submitAdminReview(ctx.api, { kind, item, next, reason, signal, isCurrent, onOperation: remember });
      if (!ack || !isCurrent()) return;
      if (!seller) ctx.drafts.delete(adminReasonKey(item.id));
      const target = new URL(itemPath, 'https://admin.local');
      ctx.navigate(adminRoute(target.pathname, { ...Object.fromEntries(target.searchParams), result: next }), { replace: true });
    });
  }
  return <section className="admin-page stack" data-figma-node={!seller ? (reject ? '131:9893' : '131:9697') : undefined}><PageHeading title={seller ? (reject ? '판매자 승인을 거절할까요?' : '이 판매자를 승인할까요?') : reject ? '게시글 거절 사유 입력' : '원단 게시를 승인할까요?'} description="확정 직전에 최신 상태와 등록 내용을 다시 확인합니다." />
    <form className="panel admin-panel admin-review-form" onSubmit={submit}>
      {seller ? <Details entries={[[ '닉네임', item.nickname ], [ '이메일', item.email ], [ '매장명', item.store?.store_name || '등록된 매장 없음' ], [ '현재 상태', SELLER_STATUS[status] ]]} /> : <div className="admin-confirm-target"><FabricImage fabric={item} className="admin-fabric-thumbnail" /><div><h2>{item.title}</h2><p>{item.store_name || '매장 정보 없음'}</p><Status status={status} /></div></div>}
      {!seller && reject && <div className="field"><label htmlFor="admin-reject-reason">거절 사유 <span aria-hidden="true">*</span></label><textarea ref={reasonRef} id="admin-reject-reason" name="reason" required maxLength={255} rows={3} disabled={mutation.busy || locked || confirmed} aria-describedby="admin-reject-hint" value={reason} onChange={e => { setReason(e.target.value); ctx.drafts.set(adminReasonKey(item.id), e.target.value); }} /><small id="admin-reject-hint" className="muted">1~255자 · 검토 화면을 오가도 유지됩니다. 확정하면 판매자가 조회할 수 있어요.</small></div>}
      <Notice tone={reject ? 'warning' : 'info'}>{seller ? (reject ? '이 판매자의 승인을 거절합니다. 판매자 거절 사유 입력은 지원하지 않습니다.' : '판매자 승인과 매장 등록이 모두 완료되면 원단을 등록할 수 있어요. 원단의 게시 승인은 별도로 진행합니다.') : reject ? '사진과 입력 내용에서 보완할 점을 적어 주세요. 거절하면 구매자에게 게시되지 않습니다.' : '승인하면 이 원단이 구매자 목록에 게시됩니다.'}</Notice>
      {!allowed && <Notice tone="warning">현재 상태에서는 이 처리를 할 수 없어요. 최신 상태를 확인한 뒤 목록으로 돌아가 주세요.</Notice>}
      {photoMissing && <Notice tone="warning">등록된 사진이 없어 승인할 수 없어요. 판매자가 사진을 등록한 뒤 다시 검토해 주세요.</Notice>}
      {confirmed && <Notice>이 처리의 성공 응답을 이미 확인했어요. 결과 화면에서 현재 정보를 확인해 주세요.</Notice>}
      {locked && <Notice tone="warning"><p>{operation.message || '이전 요청 결과를 확인해야 해요. 최신 상태를 읽은 후 다시 판단해 주세요.'}</p>{checked && <p>새로 조회한 상태: {labelsFor(kind)[status]}{!allowed ? ' · 이 상태에서는 같은 처리를 반복할 수 없어요.' : ' · 내용 확인 후 다시 진행할 수 있어요.'}</p>}</Notice>}
      {mutation.error && <div ref={errorRef} className="admin-action-error notice notice--error" role="alert" tabIndex={-1}>{adminReviewFailure(mutation.failure)}</div>}
      <div className="actions admin-actions"><Button type="submit" tone={reject ? 'danger' : 'primary'} disabled={mutation.busy || locked || confirmed || !allowed || photoMissing}>{mutation.busy ? '최신 상태 확인 · 처리 중…' : seller ? (reject ? '판매자 거절 확정' : '판매자 승인 확정') : reject ? '거절 확정' : '승인 확정'}</Button><Button href={back}>취소 · 검토 화면으로</Button></div>
      {(locked || !allowed || photoMissing) && <div className="actions"><Button onClick={retry} disabled={mutation.busy}>최신 상태 다시 조회</Button>{locked && checked && allowed && !photoMissing && <Button onClick={() => { remember(null); mutation.setError(''); }}>최신 내용을 확인했어요 · 다시 검토</Button>}</div>}
      {confirmed && <Button href={itemPath + '&result=' + encodeURIComponent(next)}>처리 결과 확인</Button>}
      {!seller && <details className="admin-more-details"><summary>대상 원단 정보 다시 확인</summary><Details entries={fabricRows(item)} className="admin-details--fabric" /></details>}
    </form>
  </section>;
}
function PendingAfterResult({ ctx }) {
  const resource = useAdminResource(ctx.api, { type: 'list', kind: 'fabrics', query: { status: 'PENDING', page: 0, size: 3 } });
  return <section className="panel admin-panel"><h2>남은 승인 대기{resource.data ? ' · ' + resource.data.totalElements + '건' : ''}</h2><AsyncState resource={resource} />{resource.data && <><PendingTable items={resource.data.items} />{resource.data.items[0] && <Button href={adminRoute('/admin/approvals', { status: 'PENDING', id: resource.data.items[0].id })} tone="primary">다음 대기 원단 검토</Button>}</>}</section>;
}
function Result({ ctx, kind, item, operation, retry }) {
  const seller = kind === 'sellers', status = itemStatus(kind, item), expected = ctx.query.get('result');
  const confirmed = operation?.status === 'CONFIRMED' && operation.next === expected;
  const title = confirmed ? (seller ? expected === 'REJECTED' ? '판매자 승인을 거절했습니다' : '판매자를 승인했습니다' : expected === 'REJECTED' ? '게시글 승인을 거절했습니다' : '원단 게시를 승인했습니다') : '현재 승인 상태를 확인했어요';
  const listPath = adminListBack(kind, ctx.query, status), detailPath = adminItemPath(kind, item.id, listPath);
  const previewUrl = new URL(detailPath, 'https://admin.local');
  return <section className="admin-page stack" data-figma-node={!seller ? (expected === 'REJECTED' ? '131:10037' : '131:9772') : undefined}><PageHeading title={title} description={confirmed ? '서버의 처리 완료 응답을 확인했습니다.' : '아래 정보는 서버에서 조회한 현재 상태입니다.'} />
    {confirmed && status !== expected && <Notice tone="warning">처리 완료 후 상태가 다시 변경됐어요. 아래 현재 상태를 기준으로 확인해 주세요.</Notice>}
    <section className="panel admin-panel"><div className="admin-result-heading"><div><h2>{seller ? item.nickname : item.title}</h2><p>{seller ? item.email : item.store_name}</p></div><Status kind={kind} status={status} /></div>
      {!seller && status === 'REJECTED' && <Details entries={[[ '현재 거절 사유', item.reject_reason || '등록된 거절 사유 없음' ]]} />}
      <div className="actions admin-actions"><Button href={detailPath}>상세 정보 확인</Button>{!seller && status === 'POSTED' && <Button href={adminRoute(previewUrl.pathname, { ...Object.fromEntries(previewUrl.searchParams), preview: 1, returnTo: safeLiveAdminReturn(currentPath(ctx), detailPath) })}>게시된 원단 미리보기</Button>}<Button href={listPath}>검토했던 목록으로</Button><Button onClick={retry}>현재 상태 다시 조회</Button></div>
    </section>{!seller && <PendingAfterResult ctx={ctx} />}
  </section>;
}
function Detail({ ctx, kind, id }) {
  const statusHint = ctx.query.get('result') || ctx.query.get('listStatus');
  const resource = useAdminResource(ctx.api, { type: 'detail', kind, id, statusHint }), item = resource.data;
  const operation = ctx.drafts.get(adminOperationKey(kind, id));
  const listPath = adminListBack(kind, ctx.query, item ? itemStatus(kind, item) : 'PENDING');
  const origin = safeLiveAdminReturn(currentPath(ctx), ctx.path);
  useReviewScroll(ctx, origin, Boolean(item) && !ctx.query.has('action') && !ctx.query.has('result') && !ctx.query.has('preview'));
  if (!item) return <section className="admin-page stack"><PageHeading title={ctx.query.has('result') && operation?.status === 'CONFIRMED' ? '처리를 완료했어요' : kind === 'sellers' ? '판매자 승인 검토' : '등록 원단 상세'} /><AsyncState resource={resource} back={listPath} acknowledgement={ctx.query.has('result') && operation?.status === 'CONFIRMED'} /></section>;
  const seller = kind === 'sellers', next = ctx.query.get('action') === 'reject' ? 'REJECTED' : seller ? 'APPROVED' : 'POSTED';
  if (['approve', 'reject'].includes(ctx.query.get('action'))) return <ReviewConfirmation key={resource.attempt} ctx={ctx} kind={kind} item={item} next={next} retry={resource.retry} />;
  if (ctx.query.has('result')) return <Result ctx={ctx} kind={kind} item={item} operation={operation} retry={resource.retry} />;
  const preview = !seller && ctx.query.has('preview'), status = itemStatus(kind, item);
  return <section className="admin-page stack" data-figma-node={seller ? status === 'APPROVED' ? '210:8380' : status === 'REJECTED' ? '210:8462' : '123:5272' : '131:9584'} data-admin-preview={preview || undefined}>
    <PageHeading title={seller ? status === 'APPROVED' ? '판매자 승인 완료' : status === 'REJECTED' ? '판매자 승인 거절' : '판매자 승인 검토' : preview ? '게시 원단 미리보기' : '등록 원단 상세'} description={seller ? item.nickname + ' · 판매자 계정과 매장 정보' : '등록 정보와 현재 게시 상태를 확인하세요.'} />
    {seller ? <SellerInfo seller={item} /> : <><div className="admin-status-summary"><Status status={status} /><p>{status === 'PENDING' ? '사진과 입력 내용을 검토한 뒤 게시 여부를 결정해 주세요.' : status === 'POSTED' ? '구매자에게 공개된 원단입니다.' : status === 'REJECTED' ? '판매자의 내용 보완을 기다리는 원단입니다.' : '판매가 완료된 원단입니다.'}</p></div>{preview && <Notice>관리자 확인용 화면입니다. 픽업 요청과 문의는 이 미리보기에서 진행하지 않습니다.</Notice>}<section className="panel admin-panel"><h2>{item.title}</h2><FabricInfo fabric={item} /></section><section className="panel admin-panel"><h2>승인 정보</h2><Details entries={[[ '등록일', date(item.created_at) ], [ '현재 상태', FABRIC_STATUS[status] ]]} /></section></>}
    {operation && operation.status !== 'CONFIRMED' && <Notice tone="warning">이전 요청의 처리 결과를 확인해야 해요. 현재 상태를 기준으로 검토해 주세요.</Notice>}
    {preview ? <Button href={safeLiveAdminReturn(ctx.query.get('returnTo'), adminItemPath(kind, item.id, listPath))}>관리자 검토로 돌아가기</Button> : <ReviewActions ctx={ctx} kind={kind} item={item} origin={origin} listPath={listPath} />}<Button onClick={resource.retry}>최신 정보 조회</Button>
  </section>;
}
export default function AdminLivePage({ ctx }) {
  // Late data changes the heading after the router's loading render. Preserve an
  // actively used control while keeping the document title in sync with the view.
  const section = useRef(null);
  useEffect(() => {
    const target = section.current;
    const update = () => { const h1 = target?.querySelector('h1'); if (h1) document.title = h1.textContent + ' · 섬유 루프'; };
    update(); const observer = new MutationObserver(update); if (target) observer.observe(target, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  let view;
  if (['/admin', '/admin/dashboard'].includes(ctx.path)) view = <Dashboard ctx={ctx} />;
  else if (ctx.path === '/admin/approvals') view = <ApprovalList ctx={ctx} />;
  else if (ctx.path === '/admin/sellers') view = <List ctx={ctx} kind="sellers" />;
  else if (['/admin/fabrics', '/admin/fabrics/filter'].includes(ctx.path)) view = <List ctx={ctx} kind="fabrics" />;
  else if (ctx.path === '/admin/error') view = <section className="admin-page stack"><PageHeading title="요청 결과를 확인하지 못했습니다" /><Notice tone="warning">같은 처리를 반복하지 말고 대상의 최신 상태를 먼저 확인해 주세요.</Notice><Button href={safeLiveAdminReturn(ctx.query.get('returnTo'), '/admin/approvals')}>신청 정보 다시 확인</Button><Button href="/admin/dashboard">관리자 홈으로</Button></section>;
  else {
    const match = ctx.path.match(/^\/admin\/(sellers|fabrics)\/([^/]+)$/);
    let id;
    if (match) { try { id = decodeURIComponent(match[2]); } catch { /* Invalid URL has no valid target. */ } }
    view = id ? <Detail ctx={ctx} kind={match[1]} id={id} /> : <Missing />;
  }
  return <div ref={section}>{view}</div>;
}
