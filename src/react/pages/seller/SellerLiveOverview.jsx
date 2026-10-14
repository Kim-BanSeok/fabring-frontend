import { useState } from 'react';
import { Button, Notice, PageHeading } from '../../components/ui.jsx';
import useSellerOverviewResource from '../../hooks/useSellerOverviewResource.js';
import { formatDate } from '../../lib/format.js';
import SellerPickupCalendar from './SellerPickupCalendar.jsx';
import { SELLER_FABRIC_COUNT_LABELS, sellerToday, sellerPickupSchedule, sellerCalendarReservationPath, sellerOverviewCount } from './sellerDashboardModel.js';

const Link = ({ path, children, ...props }) => <Button href={path} {...props}>{children}</Button>;

function OverviewFailure({ resource, label }) {
  return <Notice tone="error"><div className="seller-overview-failure"><span>{label}을 불러오지 못했어요. {resource.error?.message || '다시 조회해 주세요.'}</span><Button onClick={resource.retry}>{label} 다시 조회</Button></div></Notice>;
}

function Stat({ label, resource, countKey, path }) {
  return <div className="panel stat-card"><a className="seller-stat-link" href={`#${path}`}><span className="seller-stat-label">{label}<span aria-hidden="true">→</span></span><strong className="seller-stat-value" aria-live="polite">{sellerOverviewCount(resource, countKey)}</strong></a>{resource.error && <Button onClick={resource.retry} aria-label={`${label} 다시 조회`}>다시 조회</Button>}</div>;
}

export default function SellerLiveOverview({ ctx }) {
  const calendar = useSellerOverviewResource(ctx.api, 'calendar');
  return ctx.path === '/seller/calendar'
    ? <section className="seller-page stack" data-figma-node="142:6919"><PageHeading title="픽업 일정" description="수락된 예약을 날짜별로 확인하고 예약 상세에서 수령 완료로 처리하세요." /><div className="actions"><Link path="/seller/dashboard">대시보드로</Link></div><SellerPickupCalendar ctx={ctx} resource={calendar} /></section>
    : <Dashboard ctx={ctx} calendar={calendar} />;
}

function TodayPickups({ calendar }) {
  const [today] = useState(() => sellerToday(Date.now()));
  const schedule = calendar.data ? sellerPickupSchedule(calendar.data.content, today.slice(0, 7), today) : null;
  return <section className="panel seller-panel"><div className="seller-section-heading"><h2>오늘의 픽업</h2><Link path="/seller/calendar">일정 보기 →</Link></div><p className="muted">{formatDate(today)}</p>
    {calendar.loading ? <p role="status">픽업 일정을 확인하고 있어요.</p> : calendar.error ? <OverviewFailure resource={calendar} label="픽업 일정" /> : <>{schedule.visible.length ? <ul className="seller-today-list">{schedule.visible.map(item => <li key={item.id}><time dateTime={item.pickup_at}>{item.pickup_time}</time><div><strong>{item.fabric_title}</strong><small>{item.buyer_nickname || '구매자 이름 미제공'} · 예약 #{item.id}</small></div><Link path={sellerCalendarReservationPath(item.id)}>예약 확인</Link></li>)}</ul> : <p className="seller-empty-line">오늘 예정된 픽업이 없습니다.</p>}</>}
  </section>;
}

function Dashboard({ ctx, calendar }) {
  const requested = useSellerOverviewResource(ctx.api, 'requested');
  const fabrics = useSellerOverviewResource(ctx.api, 'fabrics');
  const inquiries = useSellerOverviewResource(ctx.api, 'inquiries');
  const busy = [requested, fabrics, inquiries, calendar].some(resource => resource.loading);
  const retryAll = () => { for (const resource of [requested, fabrics, inquiries, calendar]) resource.retry(); };
  return <section className="seller-page stack seller-dashboard" data-figma-node="123:2473">
    <div className="seller-dashboard-summary" aria-label="판매자 요약 현황"><Stat label="예약 요청" resource={requested} path="/seller/reservations?status=REQUESTED" /><Stat label="답변 대기" resource={inquiries} countKey="WAITING" path="/seller/inquiries?status=WAITING" /><Stat label="수락된 예약" resource={calendar} path="/seller/reservations?status=ACCEPTED" /><Stat label="원단 승인 대기" resource={fabrics} countKey="PENDING" path="/seller/fabrics?status=PENDING" /></div>
    <div className="seller-dashboard-heading"><PageHeading title="오늘 처리할 일" description={ctx.state.store?.store_name || ctx.state.seller.nickname} /><div className="actions"><Link path="/seller/register" tone="primary">원단 등록</Link><Button onClick={retryAll} disabled={busy}>{busy ? '현황 조회 중' : '전체 현황 새로 조회'}</Button></div></div>
    <div className="seller-overview-work"><div className="stack seller-overview-tasks"><TodayPickups calendar={calendar} />
      <section className="panel seller-panel"><div className="seller-section-heading"><h2>새 예약 요청 · {sellerOverviewCount(requested)}</h2><Link path="/seller/reservations?status=REQUESTED" tone="primary">요청 검토</Link></div>{requested.error && <OverviewFailure resource={requested} label="예약 요청 현황" />}</section>
      <section className="panel seller-panel"><div className="seller-section-heading"><h2>답변을 기다리는 문의 · {sellerOverviewCount(inquiries, 'WAITING')}</h2><Link path="/seller/inquiries?status=WAITING">문의 답변</Link></div>{inquiries.error && <OverviewFailure resource={inquiries} label="문의 현황" />}</section>
      <section className="panel seller-panel seller-dashboard-fabrics"><div className="seller-section-heading"><h2>내 원단 현황</h2><a className="seller-dashboard-manage" href="#/seller/fabrics">원단 관리 →</a></div>{fabrics.loading ? <p role="status">원단 현황을 조회하고 있어요.</p> : fabrics.error ? <OverviewFailure resource={fabrics} label="원단 현황" /> : <nav className="seller-dashboard-fabric-counts" aria-label="상태별 내 원단">{SELLER_FABRIC_COUNT_LABELS.map(([key, label]) => <a key={key} href={`#/seller/fabrics?status=${key}`}><span>{label}</span><strong>{sellerOverviewCount(fabrics, key)}</strong></a>)}</nav>}</section>
    </div><SellerPickupCalendar ctx={ctx} resource={calendar} compact /></div>
  </section>;
}
