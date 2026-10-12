import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, EmptyState, FabricImage, Field, Notice, PageHeading } from '../../components/ui.jsx';
import { formatDate } from '../../lib/format.js';
import useReservationResource from '../../hooks/useReservationResource.js';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import {
  SELLER_RESERVATION_STATUS as STATUS, SELLER_RESERVATION_ACTIONS as ACTIONS,
  sellerCanProcess, sellerReservationPrice, sellerReservationQuantity, sellerReservationRequest,
  sellerReservationRoute, sellerReservationReturn, sellerReservationDetailPath, sellerReservationConfirmPath,
  sellerReservationResultPath, sellerStockEffect, sellerReservationFailure, processSellerReservation,
  sellerRejectDraftKey, sellerResultKey,
} from './sellerReservationModel.js';

const tone = status => ['REJECTED', 'CANCELED'].includes(status) ? 'red' : status === 'REQUESTED' ? 'amber' : status === 'PICKED_UP' ? 'gray' : 'green';
const nodes = { REQUESTED: '123:4387', ACCEPTED: '127:7621', REJECTED: '127:7753', PICKED_UP: '127:7892', CANCELED: '127:8022' };
const Page = ({ node, children }) => <section className="seller-page stack" data-figma-node={node}>{children}</section>;
const Link = ({ path, children, ...props }) => <Button href={path} {...props}>{children}</Button>;
const Details = ({ rows }) => <dl className="seller-details">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
const when = item => `${formatDate(item.pickup_date)} ${item.pickup_time} (한국 시간)`;
const fabricStatus = { POSTED: '게시 중', PENDING: '승인 대기', REJECTED: '승인 거절', SOLD_OUT: '판매 완료' };

function ReadFeedback({ resource, detail = false, resetPath = '/seller/reservations' }) {
  if (resource.loading) return <section className="panel seller-panel" role="status" aria-live="polite">{detail ? '선택한 예약을 확인하고 있어요…' : '받은 예약을 불러오는 중이에요…'}</section>;
  if (!resource.error) return null;
  const status = resource.error.status;
  return <section className="panel seller-panel"><Notice tone="error"><strong>{status === 400 ? '조회 조건을 확인해 주세요' : status === 403 ? '이 예약을 확인할 권한이 없어요' : status === 404 ? '예약을 찾을 수 없어요' : '예약 정보를 불러오지 못했어요'}</strong><p>{resource.error.message || '연결 상태를 확인하고 다시 불러와 주세요.'}</p></Notice><div className="actions">{![400, 403, 404].includes(status) && <Button onClick={resource.retry} tone="primary">다시 불러오기</Button>}<Link path={resetPath}>받은 예약 목록 확인</Link></div></section>;
}

function useSellerReservationApi(api) {
  return useMemo(() => ({ listReservations: (filters, options) => api.listReceivedReservations(filters, options), getReservation: (id, options) => api.getReservation(id, options) }), [api]);
}

export default function SellerReservations({ ctx }) {
  return ctx.path === '/seller/reservations/confirm' ? <Confirmation ctx={ctx} /> : <ReservationList ctx={ctx} />;
}

function ReservationList({ ctx }) {
  const api = useSellerReservationApi(ctx.api);
  const list = useReservationResource(api, sellerReservationRequest(ctx));
  const status = ctx.query.get('status') || 'REQUESTED';
  const items = list.data?.content || [];
  const id = ctx.query.has('id') ? ctx.query.get('id') : items[0]?.id;
  const detail = useReservationResource(api, id !== undefined ? { kind: 'detail', id } : null);
  const [fabricFilter, setFabricFilter] = useState(ctx.query.get('fabric_id') || ctx.query.get('fabric') || '');
  const ready = !list.loading && !list.error;
  const page = list.data;
  const confirmed = id && ctx.drafts.get(sellerResultKey(id));
  useEffect(() => { if (detail.data) ctx.drafts.delete(sellerResultKey(detail.data.id)); }, [ctx.drafts, detail.data]);
  const applyFilter = event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    ctx.navigate(sellerReservationRoute(ctx, { fabric_id: fabricFilter.trim(), fabric: null, page: 0, id: null }));
  };
  const refresh = () => { list.retry(); if (id !== undefined) detail.retry(); };
  const reset = sellerReservationRoute(ctx, { fabric: null, fabric_id: null, page: 0, id: null });
  const title = { ACCEPTED: '수락된 예약', REJECTED: '거절된 예약', PICKED_UP: '수령 완료 예약', CANCELED: '취소된 예약' }[status] || '판매 내역';
  return <Page node={nodes[status] || nodes.REQUESTED}>
    <PageHeading title={title} description="받은 픽업 예약을 확인하고 처리하세요. 픽업 일시는 한국 시간 기준입니다." />
    <nav className="tabs seller-tabs" aria-label="예약 상태 필터">{Object.entries({ ALL: '전체', ...STATUS }).map(([value, label]) => <Link key={value} path={sellerReservationRoute(ctx, { status: value, page: 0, id: null })} className={status === value ? 'seller-tab--active' : ''} aria-current={status === value ? 'page' : undefined}>{label}</Link>)}</nav>
    <form className="panel seller-reservation-filter" onSubmit={applyFilter}><Field label="원단 번호로 조회 (선택)" name="fabric_id" value={fabricFilter} onChange={event => setFabricFilter(event.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="전체 원단" /><div className="actions"><Button type="submit">조회</Button>{(ctx.query.get('fabric_id') || ctx.query.get('fabric')) && <Link path={reset}>전체 원단 예약</Link>}</div></form>
    {ready && <div className="seller-reservation-toolbar"><p aria-live="polite">{status === 'ALL' ? '전체' : STATUS[status] || '예약'} {page?.totalElements ?? 0}건</p><Button onClick={refresh}>최신 내역 확인</Button></div>}
    {confirmed && !detail.data && <Notice tone="success">{ACTIONS[confirmed.status]?.success || '예약 처리가 완료되었어요.'} 다시 처리하지 말고 아래에서 최신 정보를 확인해 주세요.</Notice>}
    {!ready ? <ReadFeedback resource={list} /> : <>
      {items.length > 0 ? <nav className="seller-reservation-list" aria-label="예약 선택">{items.map(item => <Link key={item.id} path={sellerReservationDetailPath(ctx, item.id)} className={String(id) === item.id ? 'seller-tab--active' : ''} aria-current={String(id) === item.id ? 'true' : undefined}>{item.fabric_title} · {item.buyer_nickname} · {formatDate(item.pickup_date)} {item.pickup_time}</Link>)}</nav> : page?.page > 0 && page?.totalElements > 0 ? <EmptyState title="이 페이지에는 예약이 없어요" description="현재 예약 상태가 바뀌었을 수 있어요."><Link path={sellerReservationRoute(ctx, { page: 0, id: null })} tone="primary">첫 페이지로</Link></EmptyState> : <EmptyState title="해당 조건의 예약이 없어요" description="다른 상태나 원단 번호로 예약 내역을 확인해 주세요." />}
      {page?.totalPages > 1 && <nav className="seller-reservation-pagination" aria-label="받은 예약 페이지"><Link path={sellerReservationRoute(ctx, { page: page.page - 1, id: null })} disabled={page.page <= 0}>이전 페이지</Link><span>{page.page + 1} / {page.totalPages} 페이지</span><Link path={sellerReservationRoute(ctx, { page: page.page + 1, id: null })} disabled={page.page + 1 >= page.totalPages}>다음 페이지</Link></nav>}
    </>}
    {id !== undefined && <>{detail.loading || detail.error ? <ReadFeedback resource={detail} detail resetPath={sellerReservationRoute(ctx, { id: null })} /> : detail.data && <>
      {status !== 'ALL' && detail.data.status !== status && <Notice>선택한 예약은 현재 {STATUS[detail.data.status]} 상태입니다. <Link path={sellerReservationResultPath(ctx, detail.data, detail.data.status)}>현재 상태 목록 보기</Link></Notice>}
      <ReservationDetail ctx={ctx} item={detail.data} retry={detail.retry} />
    </>}</>}
  </Page>;
}

function ReservationDetail({ ctx, item, retry }) {
  const guidance = {
    REQUESTED: ['재고 확인 후 처리', '실물 재고와 다른 수락된 예약, 픽업 가능 시간을 확인한 뒤 처리해 주세요.'],
    ACCEPTED: ['수령 확인', '원단을 전달한 뒤 수령 완료로 처리해 주세요. 전달한 수량이 실물 재고에서 차감됩니다.'],
    PICKED_UP: ['수령 완료', '전달한 수량을 재고에 반영했어요. 완료된 예약은 다시 처리하거나 취소할 수 없어요.'],
    REJECTED: ['거절된 예약', '이 요청으로 확보하거나 차감한 원단은 없습니다.'],
    CANCELED: ['취소된 예약', '이 예약에 대한 원단 확보가 해제되었습니다.'],
  }[item.status];
  return <div className="seller-columns"><section className="panel seller-panel"><h2>{item.status === 'REQUESTED' ? '새 픽업 예약 요청' : `${STATUS[item.status]} 예약`}</h2><div className="seller-product-cell"><FabricImage fabric={item.fabric} className="seller-reservation-image" /><div><h3>{item.fabric_title}</h3><p className="muted">원단 번호 {item.fabric_id} · {item.sale_type === 'ROLL' ? '롤 원단' : '자투리 원단'}</p></div></div><Details rows={[
    ['예약 번호', item.id], ['구매자', item.buyer_nickname], ['요청 수량', sellerReservationQuantity(item)],
    [item.status === 'ACCEPTED' ? '수락된 픽업 일시' : '픽업 희망일', when(item)], ['구매 요청 금액', sellerReservationPrice(item)], ['요청 사항', item.memo || '없음'],
  ]} /><Badge tone={tone(item.status)}>현재 상태: {STATUS[item.status]}</Badge>{item.reject_reason && <Notice tone="error">거절 사유: {item.reject_reason}</Notice>}{item.canceled_by && <p className="muted">취소한 사람: {item.canceled_by === 'BUYER' ? '구매자' : '판매자'}</p>}</section>
    <section className="panel seller-panel"><h2>{guidance[0]}</h2><Details rows={[
      ['이번 예약 수량', sellerReservationQuantity(item)], ['현재 원단 상태', fabricStatus[item.fabric.status]], ['판매처', item.store.store_name], ['현재 픽업 주소', item.store.address], ['휴무일', item.store.closed_days || '등록된 휴무 안내 없음'], ['방문 안내', item.store.pickup_guide || '별도 등록된 안내 없음'],
    ]} /><Notice>{guidance[1]}</Notice><p className="muted">주소와 운영 안내는 현재 매장 정보입니다. 예약 당시 정보와 다를 수 있어요.</p><div className="actions seller-reservation-actions">{item.status === 'REQUESTED' ? <><Link path={sellerReservationConfirmPath(ctx, item, 'REJECTED')} tone="danger">거절</Link><Link path={sellerReservationConfirmPath(ctx, item, 'ACCEPTED')} tone="primary">수락</Link></> : item.status === 'ACCEPTED' ? <><Link path={sellerReservationConfirmPath(ctx, item, 'CANCELED')} tone="danger">예약 취소</Link><Link path={sellerReservationConfirmPath(ctx, item, 'PICKED_UP')} tone="primary">수령 완료</Link></> : <p className="muted">처리가 완료된 예약이에요.</p>}</div><Button onClick={retry}>현재 예약 상태 다시 확인</Button></section>
  </div>;
}

function Confirmation({ ctx }) {
  const resource = useReservationResource(ctx.api, { kind: 'detail', id: ctx.query.get('id') || '' });
  const next = ctx.query.get('action'), action = ACTIONS[next];
  return <Page node={action?.node || '127:7558'}><PageHeading title={action?.title || '예약 처리 내용을 확인해 주세요'} description="픽업 일시와 이번 예약의 처리 내용을 확인해 주세요." />
    {resource.loading || resource.error ? <ReadFeedback resource={resource} detail resetPath={sellerReservationReturn(ctx)} /> : resource.data && <ConfirmationForm ctx={ctx} item={resource.data} next={next} />}
  </Page>;
}

function ConfirmationForm({ ctx, item, next }) {
  const mutation = useReservationMutation(ctx);
  const [reason, setReason] = useState(() => ctx.drafts.get(sellerRejectDraftKey(item.id)) || '');
  const failure = sellerReservationFailure(mutation.failure);
  const errorRef = useRef(null);
  useEffect(() => { if (mutation.failure) errorRef.current?.focus(); }, [mutation.failure]);
  const allowed = sellerCanProcess(item.status, next), action = ACTIONS[next];
  const back = sellerReservationDetailPath(ctx, item.id);
  if (!allowed || !action) return <EmptyState title="현재 상태에서는 처리할 수 없어요" description={`현재 예약은 ${STATUS[item.status]} 상태입니다. 예약 내역에서 가능한 처리를 확인해 주세요.`}><Link path={back} tone="primary">현재 예약 확인</Link></EmptyState>;
  const submit = event => {
    event.preventDefault();
    if (failure?.locked || !event.currentTarget.reportValidity()) return;
    if (next === 'REJECTED' && (!reason.trim() || reason.trim().length > 255)) return mutation.setError('거절 사유를 1~255자로 입력해 주세요.');
    mutation.run(async ({ signal, isCurrent }) => {
      const result = await processSellerReservation(ctx.api, item, next, reason, signal);
      if (!isCurrent()) return;
      ctx.drafts.delete(sellerRejectDraftKey(item.id));
      ctx.drafts.set(sellerResultKey(item.id), { status: result.status });
      await ctx.refresh();
      if (!isCurrent()) return;
      ctx.notify(action.success);
      ctx.navigate(sellerReservationResultPath(ctx, item, result.status), { replace: true });
    });
  };
  return <form id="seller-reservation-page-confirm" className="panel seller-panel seller-confirm" data-reservation-id={item.id} data-status={next} onSubmit={submit}><div className="seller-columns"><section className="stack"><h2>예약 요약</h2><Details rows={[
    ['구매자', item.buyer_nickname], ['원단 / 요청 수량', `${item.fabric_title} / ${sellerReservationQuantity(item)}`], ['픽업 일시', when(item)], ['예상 금액', sellerReservationPrice(item)],
  ]} /></section>{next !== 'REJECTED' && <section className="stack"><h2>이번 예약의 재고 변경</h2><p>{sellerStockEffect(item, next)}</p>{next === 'ACCEPTED' && <p className="muted">표시된 희망 픽업 일시를 그대로 수락합니다.</p>}</section>}</div><Notice tone="warning">{action.notice}</Notice>
    {next === 'REJECTED' && <Field label="거절 사유" name="reason" required maxLength={255} value={reason} onChange={event => { setReason(event.target.value); ctx.drafts.set(sellerRejectDraftKey(item.id), event.target.value); }} placeholder="거절 사유를 입력해 주세요." />}
    {next === 'CANCELED' && <p className="muted">구매자와 취소 여부를 확인해 주세요.</p>}
    {failure && <div ref={errorRef} className="seller-reservation-failure" role="alert" tabIndex={-1}><Notice tone="error"><strong>{failure.title}</strong><p>{failure.message}</p></Notice>{failure.locked && <div className="actions"><Link path={back} tone="primary">현재 예약 상태 확인</Link>{['INSUFFICIENT_LENGTH', 'SCRAP_ALREADY_RESERVED'].includes(mutation.failure.code) && <Link path={sellerReservationRoute(ctx, { status: 'ACCEPTED', fabric: null, fabric_id: item.fabric_id, page: 0, id: null })}>수락된 예약 확인</Link>}</div>}</div>}
    <div className="actions"><Button type="submit" tone={['REJECTED', 'CANCELED'].includes(next) ? 'danger' : 'primary'} disabled={mutation.busy || failure?.locked}>{mutation.busy ? '처리 중…' : action.label}</Button><Link path={back}>돌아가기</Link></div>
  </form>;
}
