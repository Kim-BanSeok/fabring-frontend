import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, FabricImage, Notice, PageHeading } from '../../components/ui.jsx';
import useFabricResource from '../../hooks/useFabricResource.js';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import { formatLength, formatPrice } from '../../lib/format.js';
import SellerFabricRegistration from './SellerFabricRegistration.jsx';
import SellerFabricPhotos from './SellerFabricPhotos.jsx';
import { FabricDetails, FabricLink, FabricStatus, LiveFabricForm, LiveFabricInfo, LiveStockInfo } from './SellerLiveFabricParts.jsx';
import { LIVE_FABRIC_STATUS, liveEditDraftKey, liveFabricFailure, liveFabricListPath, liveFabricListQuery, liveFabricPath, validateLiveFabricDraft } from './sellerLiveFabricModel.js';

const acknowledgeKey = id => `seller:live:fabric-result:${id}`;
function FabricLoadError({ resource, ctx, title = '원단 정보를 불러오지 못했어요' }) {
  const error = resource.error;
  return <section className="seller-page stack"><PageHeading title={error?.status === 404 ? '원단을 찾을 수 없어요' : error?.status === 403 ? '내 원단인지 확인해 주세요' : title} /><Notice tone="error">{error?.message || '잠시 후 다시 조회해 주세요.'}</Notice><div className="actions"><Button onClick={resource.retry} tone="primary">다시 조회</Button><FabricLink path={liveFabricListPath(ctx)}>원단 목록</FabricLink></div></section>;
}
function FabricPagination({ ctx, page }) {
  return <nav className="seller-reservation-pagination" aria-label="원단 목록 페이지"><FabricLink path={liveFabricListPath(ctx, { page: Math.max(0, page.page - 1) })} disabled={page.page === 0}>이전 페이지</FabricLink><span>{page.totalPages ? page.page + 1 : 0} / {page.totalPages} 페이지</span><FabricLink path={liveFabricListPath(ctx, { page: page.page + 1 })} disabled={page.page + 1 >= page.totalPages}>다음 페이지</FabricLink></nav>;
}
function List({ ctx, api }) {
  const resource = useFabricResource(api, { kind: 'list', query: liveFabricListQuery(ctx.query) });
  const status = ctx.query.get('status') || 'ALL', page = resource.data;
  return <section className="seller-page stack" data-figma-node="123:2891"><PageHeading title="내 원단 목록" description="등록한 원단의 게시 상태와 예약을 관리하세요." /><nav className="tabs seller-tabs" aria-label="상태 필터">{Object.entries({ ALL: '전체', ...LIVE_FABRIC_STATUS }).map(([value, label]) => <FabricLink key={value} path={liveFabricListPath(ctx, { status: value, page: 0 })} className={status === value ? 'seller-tab--active' : ''} aria-current={status === value ? 'page' : undefined}>{label}</FabricLink>)}</nav>
    <div className="actions"><FabricLink path="/seller/register" tone="primary">새 원단 등록</FabricLink><Button onClick={resource.retry} disabled={resource.loading}>목록 새로 조회</Button></div>
    {resource.loading ? <Notice role="status">내 원단 목록을 조회하고 있어요.</Notice> : resource.error ? <Notice tone="error"><div className="stack"><span>{resource.error.message}</span><Button onClick={resource.retry}>다시 조회</Button></div></Notice> : <>
      <section className="panel seller-panel"><h2>{status === 'ALL' ? '등록한 원단' : LIVE_FABRIC_STATUS[status]} {page.totalElements.toLocaleString('ko-KR')}건</h2>
        {page.content.length ? <div className="table-wrapper"><table className="data-table seller-fabric-table"><thead><tr><th>원단</th><th>치수 · 판매 가능 길이 × 폭</th><th>가격</th><th>상태</th><th>진행 예약</th><th>관리</th></tr></thead><tbody>{page.content.map(fabric => <tr key={fabric.id}>
          <td><div className="seller-product-cell"><FabricImage fabric={fabric} className="seller-thumb" compact /><div><strong>{fabric.title}</strong><small>{fabric.material} · {fabric.color}</small></div></div></td><td data-label="치수">{fabric.sale_type === 'ROLL' ? formatLength(fabric.available_length_cm) : `${fabric.length_cm}cm`} × {fabric.width_cm}cm</td><td data-label="가격">{formatPrice(fabric.price)}<small>{fabric.sale_type === 'ROLL' ? '90cm당' : '1장'}</small></td><td data-label="상태"><FabricStatus status={fabric.status} /></td><td data-label="진행 예약">{fabric.active_reservation_count ? `${fabric.active_reservation_count}건` : '없음'}</td><td className="seller-fabric-manage"><FabricLink path={liveFabricPath(ctx, fabric.id)}>상세보기</FabricLink></td>
        </tr>)}</tbody></table></div> : <EmptyState title={page.totalElements ? '이 페이지에 원단이 없어요' : '해당 상태의 원단이 없어요'} description={page.totalElements ? '목록이 변경되었을 수 있어요. 첫 페이지에서 다시 확인해 주세요.' : '다른 상태를 선택하거나 새 원단을 등록해 주세요.'}>{page.page > 0 && <FabricLink path={liveFabricListPath(ctx, { page: 0 })}>첫 페이지</FabricLink>}</EmptyState>}
        <p className="muted">롤은 예약 확보분을 제외한 판매 가능 길이예요. 실제 남은 길이와 확보 길이는 상세에서 확인할 수 있어요.</p>
      </section><FabricPagination ctx={ctx} page={page} />
    </>}
  </section>;
}
function Detail({ ctx, fabric, retry }) {
  const ack = ctx.drafts.get(acknowledgeKey(fabric.id));
  return <section className="seller-page stack" data-figma-node="127:7149"><PageHeading title="내 원단 상세" description={fabric.title} />{ack && <Notice>{ack}</Notice>}
    <FabricImage fabric={fabric} className="seller-banner-image" /><section className="panel seller-panel"><FabricStatus status={fabric.status} /><h2>원단 정보</h2><LiveFabricInfo fabric={fabric} />{fabric.reject_reason && <Notice tone="error">거절 사유: {fabric.reject_reason}</Notice>}</section>
    <section className="panel seller-panel"><h2>재고 현황</h2><LiveStockInfo fabric={fabric} /></section>
    <div className="actions">{fabric.status !== 'SOLD_OUT' && <FabricLink path={liveFabricPath(ctx, fabric.id, 'edit')} tone="primary">{fabric.status === 'REJECTED' ? '내용 보완하기' : '정보 수정'}</FabricLink>}<FabricLink path={liveFabricPath(ctx, fabric.id, 'photos')}>사진 확인 · 관리</FabricLink><FabricLink path={`/seller/reservations?status=ALL&fabric_id=${fabric.id}`}>판매 내역 확인</FabricLink><FabricLink path={liveFabricPath(ctx, fabric.id, 'delete')} tone="danger">삭제</FabricLink><FabricLink path={liveFabricListPath(ctx)}>원단 목록</FabricLink><Button onClick={retry}>상세 새로 조회</Button></div>
  </section>;
}
function Edit({ ctx, fabric, retry }) {
  const key = liveEditDraftKey(fabric.id), mutation = useReservationMutation(ctx), failure = liveFabricFailure(mutation.failure);
  const [draft] = useState(() => ctx.drafts.get(key) || { ...fabric, length_cm: fabric.sale_type === 'ROLL' ? fabric.remaining_length_cm : fabric.length_cm, photos: [] });
  const uncertainKey = `seller:live:fabric-edit-unknown:${fabric.id}`;
  const [uncertain, setUncertain] = useState(() => Boolean(ctx.drafts.get(uncertainKey)));
  const [serverChecked, setServerChecked] = useState(true);
  const submit = value => mutation.run(async ({ signal, isCurrent }) => {
    const message = validateLiveFabricDraft(value); if (message) throw new Error(message);
    ctx.drafts.set(uncertainKey, true);
    setServerChecked(false);
    let result;
    try { result = await ctx.api.updateFabric(fabric.id, value, { signal }); }
    catch (error) { if (isCurrent()) { if (error.outcomeUnknown) setUncertain(true); else ctx.drafts.delete(uncertainKey); } throw error; }
    if (!isCurrent()) return;
    ctx.drafts.delete(uncertainKey); ctx.drafts.delete(key); ctx.drafts.set(acknowledgeKey(fabric.id), result.status === 'PENDING' && fabric.status === 'REJECTED' ? '보완 내용을 저장하고 다시 승인 신청했어요.' : '수정 내용을 저장했어요.');
    ctx.navigate(liveFabricPath(ctx, fabric.id));
  });
  if (fabric.status === 'SOLD_OUT') return <section className="seller-page stack"><PageHeading title="판매 완료 원단은 수정할 수 없어요" /><FabricLink path={liveFabricPath(ctx, fabric.id)}>원단 상세로</FabricLink></section>;
  return <section className="seller-page stack" data-figma-node={fabric.status === 'REJECTED' ? '127:7322' : '127:7250'}><PageHeading title={fabric.status === 'REJECTED' ? '거절된 원단 보완' : '원단 정보 수정'} description={fabric.status === 'REJECTED' ? '정보를 수정해 저장하면 다시 승인 대기로 전환돼요.' : fabric.status === 'POSTED' ? '저장한 정보는 구매자에게 바로 반영돼요.' : '승인 대기 중인 등록 내용을 수정해요.'} />
    {fabric.reject_reason && <Notice tone="error">거절 사유: {fabric.reject_reason}</Notice>}{fabric.sale_type === 'ROLL' && <Notice>수락된 예약이 확보한 {formatLength(fabric.reserved_length_cm)}보다 남은 길이를 적게 줄일 수 없어요.</Notice>}
    {failure && <Notice tone="error">{failure.message}</Notice>}{uncertain && <Notice tone="warning"><div className="stack"><p>이전 저장 결과를 확인해야 해요. 위에서 새로 조회한 서버 정보와 작성 중인 내용을 비교해 주세요. 수정 요청을 바로 다시 보내지 않습니다.</p><FabricDetails rows={ [['서버 원단 이름', fabric.title], ['서버 가격', formatPrice(fabric.price)], ['서버 길이', formatLength(fabric.sale_type === 'ROLL' ? fabric.remaining_length_cm : fabric.length_cm)]]} /><div className="actions"><FabricLink path={liveFabricPath(ctx, fabric.id)}>서버 상세 전체 확인</FabricLink><Button onClick={retry}>서버 원단 다시 조회</Button><Button disabled={!serverChecked} onClick={() => { ctx.drafts.delete(uncertainKey); setUncertain(false); mutation.setError(''); }}>서버 내용을 확인했어요 · 수정 계속</Button></div></div></Notice>}
    <LiveFabricForm ctx={ctx} initial={draft} onRemember={value => ctx.drafts.set(key, value)} onSubmit={submit} busy={mutation.busy || uncertain || failure?.locked} edit submitLabel={fabric.status === 'REJECTED' ? '확인 후 다시 승인 신청' : '수정 내용 저장'} />
    <Notice>사진은 별도로 저장해요. 사진만 바꾸어서는 승인 거절 상태가 바뀌지 않습니다.</Notice><FabricLink path={liveFabricPath(ctx, fabric.id, 'photos')}>등록된 사진 관리</FabricLink>
  </section>;
}
function Delete({ ctx, fabric, retry }) {
  const mutation = useReservationMutation(ctx), failure = liveFabricFailure(mutation.failure);
  const key = `seller:live:delete-unknown:${fabric.id}`;
  const [uncertain, setUncertain] = useState(() => Boolean(ctx.drafts.get(key)));
  const [serverChecked, setServerChecked] = useState(true);
  const remove = () => mutation.run(async ({ signal, isCurrent }) => {
    if (uncertain) return;
    ctx.drafts.set(key, true);
    setServerChecked(false);
    try { await ctx.api.deleteFabric(fabric.id, { signal }); }
    catch (error) { if (isCurrent()) { if (error.outcomeUnknown) setUncertain(true); else ctx.drafts.delete(key); } throw error; }
    if (!isCurrent()) return;
    ctx.drafts.delete(key); ctx.drafts.set('seller:live:deleted', { id: fabric.id, title: fabric.title }); ctx.navigate('/seller/fabrics/deleted');
  });
  return <section className="seller-page stack" data-figma-node={mutation.failure?.code === 'FABRIC_HAS_ACTIVE_RESERVATION' ? '127:7402' : '127:7448'}><PageHeading title="원단 삭제 확인" description={fabric.title} /><Notice tone="warning">삭제하면 구매자 목록에서 사라져요. 요청됨 또는 수락됨 예약이 있으면 삭제할 수 없습니다. 삭제 시 서버에서 현재 예약을 다시 확인합니다.</Notice><section className="panel seller-panel"><h2>삭제할 원단</h2><LiveFabricInfo fabric={fabric} /></section>{failure && <Notice tone="error">{failure.message}</Notice>}{uncertain && <Notice tone="warning"><div className="stack"><p>삭제 요청 결과가 불확실해요. 현재 원단을 다시 조회한 뒤 삭제 여부를 확인해 주세요.</p><div className="actions"><Button onClick={retry} disabled={mutation.busy}>원단 상태 다시 조회</Button><Button disabled={mutation.busy || !serverChecked} onClick={() => { ctx.drafts.delete(key); setUncertain(false); mutation.setError(''); }}>원단이 남아 있음을 확인했어요 · 삭제 재개</Button></div></div></Notice>}<div className="actions"><Button onClick={remove} disabled={mutation.busy || uncertain || failure?.locked} tone="danger">{mutation.busy ? '삭제 중' : '원단 삭제'}</Button><FabricLink path={`/seller/reservations?status=ALL&fabric_id=${fabric.id}`}>판매 내역 확인</FabricLink><FabricLink path={liveFabricPath(ctx, fabric.id)}>상세 다시 확인</FabricLink><FabricLink path={liveFabricListPath(ctx)}>원단 목록</FabricLink></div></section>;
}
function FabricResourcePage({ ctx, api }) {
  const id = ctx.query.get('id'), resource = useFabricResource(api, id ? { kind: 'detail', id } : null);
  const root = useRef(null);
  useEffect(() => {
    if (!resource.data) return;
    const heading = root.current?.querySelector('h1');
    if (heading) { document.title = `${heading.textContent} · 섬유 루프`; if (document.activeElement === document.body) heading.focus({ preventScroll: true }); }
  }, [resource.data]);
  const ack = ctx.drafts.get(acknowledgeKey(id));
  if (!id) return <EmptyState title="원단을 선택해 주세요" description="내 원단 목록에서 항목을 선택할 수 있어요."><FabricLink path={liveFabricListPath(ctx)}>원단 목록</FabricLink></EmptyState>;
  if (resource.loading) return <section className="seller-page stack"><PageHeading title="내 원단 확인" /><Notice role="status">현재 원단 정보를 조회하고 있어요.</Notice></section>;
  if (resource.error) return <>{ack && <Notice>{ack} 현재 상세 조회만 다시 시도해 주세요.</Notice>}<FabricLoadError resource={resource} ctx={ctx} /></>;
  const fabric = resource.data;
  return <div ref={root}>{ctx.path.endsWith('/edit') ? <Edit ctx={ctx} fabric={fabric} retry={resource.retry} /> : ctx.path.endsWith('/delete') ? <Delete ctx={ctx} fabric={fabric} retry={resource.retry} /> : ctx.path.endsWith('/photos') ? <section className="seller-page stack" data-figma-node="127:6637"><PageHeading title="원단 사진 관리" description={fabric.title} /><SellerFabricPhotos ctx={ctx} fabric={fabric} /><div className="actions"><FabricLink path={liveFabricPath(ctx, fabric.id)}>원단 상세로</FabricLink><FabricLink path={liveFabricListPath(ctx)}>원단 목록</FabricLink></div></section> : <Detail ctx={ctx} fabric={fabric} retry={resource.retry} />}</div>;
}
export default function SellerLiveFabrics({ ctx }) {
  const api = useMemo(() => ({ listFabrics: (query, options) => ctx.api.listMyFabrics(query, options), getFabric: (id, options) => ctx.api.getSellerFabric(id, options) }), [ctx.api]);
  if (ctx.path.startsWith('/seller/register') || ctx.path === '/seller/upload') return <SellerFabricRegistration ctx={ctx} />;
  if (ctx.path === '/seller/fabrics/deleted') {
    const deleted = ctx.drafts.get('seller:live:deleted');
    return <section className="seller-page stack" data-figma-node="127:7497"><PageHeading title={deleted ? '원단을 삭제했어요' : '내 원단 목록을 확인해 주세요'} description={deleted?.title || '현재 목록에서 원단 상태를 확인할 수 있어요.'} />{deleted && <Notice>삭제한 원단은 구매자에게 표시되지 않아요.</Notice>}<div className="actions"><FabricLink path="/seller/fabrics" tone="primary">원단 목록</FabricLink><FabricLink path="/seller/register">새 원단 등록</FabricLink></div></section>;
  }
  return ctx.path === '/seller/fabrics' && !ctx.query.has('id') ? <List ctx={ctx} api={api} /> : <FabricResourcePage ctx={ctx} api={api} />;
}
