import { useState } from 'react';
import { Button, Notice, PageHeading } from '../../components/ui.jsx';
import useSellerOverviewResource from '../../hooks/useSellerOverviewResource.js';
import { formatDate, formatDateTime } from '../../lib/format.js';
import {
  SELLER_FABRIC_COUNT_LABELS, sellerToday, sellerDashboardCalendar, sellerCalendarPath,
  sellerCalendarAdjacentMonth, sellerPickupSchedule, sellerCalendarReservationPath, sellerOverviewCount,
} from './sellerDashboardModel.js';

const Link = ({ path, children, ...props }) => <Button href={path} {...props}>{children}</Button>;

function OverviewFailure({ resource, label }) {
  return <Notice tone="error"><div className="seller-overview-failure"><span>{label}을 불러오지 못했어요. {resource.error?.message || '다시 조회해 주세요.'}</span><Button onClick={resource.retry}>{label} 다시 조회</Button></div></Notice>;
}

function Stat({ label, resource, countKey, note }) {
  return <div className="panel stat-card"><p className="muted">{label}</p><strong className="seller-stat-value" aria-live="polite">{sellerOverviewCount(resource, countKey)}</strong><small className="muted">{note}</small>{resource.error && <Button onClick={resource.retry} aria-label={`${label} 다시 조회`}>다시 조회</Button>}</div>;
}

function Calendar({ ctx, resource, compact = false }) {
  const [today] = useState(() => sellerToday(Date.now()));
  const { year, number, days, offset, selected, month } = sellerDashboardCalendar(ctx.query, today);
  const schedule = resource.data ? sellerPickupSchedule(resource.data.content, month, selected) : null;
  const path = values => sellerCalendarPath(ctx, { month, ...values });
  const select = (event, route, focusTarget = 'seller-calendar-date') => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); ctx.navigate(route, { preserveScroll: true, focusTarget });
  };
  return <section className="panel seller-panel seller-live-calendar" aria-label="픽업 달력">
    <div className="seller-calendar-head"><h2>{year}년 {number}월</h2><div className="actions">{[[-1, '이전 달', '‹'], [1, '다음 달', '›']].map(([delta, label, icon]) => {
      const route = path({ month: sellerCalendarAdjacentMonth(month, delta), all: true });
      return <Link key={delta} path={route} onClick={event => select(event, route, 'seller-calendar-first')} aria-label={label}>{icon}</Link>;
    })}</div></div>
    <p className="muted">수락된 예약의 픽업 일정이에요. 날짜와 시간은 한국 시간 기준입니다.</p>
    <div className="actions seller-calendar-actions"><Link path={path({ month: today.slice(0, 7), date: today })} onClick={event => select(event, path({ month: today.slice(0, 7), date: today }))}>오늘</Link><Link path={path({ all: true })} onClick={event => select(event, path({ all: true }), 'seller-calendar-first')}>이번 달 전체</Link><Button onClick={resource.retry} disabled={resource.loading}>새로 조회</Button></div>
    <div className={`seller-calendar${compact ? '' : ' seller-calendar-full'}`} aria-label={`${year}년 ${number}월 날짜 선택`} aria-busy={resource.loading}>
      {['월', '화', '수', '목', '금', '토', '일'].map(day => <span key={day} className="seller-calendar-weekday">{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
      {Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`, route = path({ date });
        const count = schedule?.byDate.get(date)?.length || 0;
        const status = resource.loading ? '일정 조회 중' : resource.error ? '일정 확인 필요' : `수락된 예약 ${count}건`;
        return <a key={date} href={`#${route}`} onClick={event => select(event, route)} className={`seller-calendar-day${selected === date ? ' is-selected' : ''}${count ? ' has-pickup' : ''}`} aria-current={selected === date ? 'date' : undefined} aria-label={`${year}년 ${number}월 ${i + 1}일${date === today ? ' 오늘' : ''}, ${status}`}>
          <span>{i + 1}</span>{count > 0 && <span className="seller-calendar-pickup"><span className="seller-calendar-pickup-label">픽업 </span>{count}건</span>}
        </a>;
      })}
    </div>
    <div className="seller-calendar-results" aria-busy={resource.loading}>
      <h3>{selected ? `${formatDate(selected)} 픽업 일정` : `${number}월 전체 픽업 일정`}</h3>
      {resource.loading ? <p role="status" className="muted">전체 수락 내역을 확인하고 있어요.</p> : resource.error ? <OverviewFailure resource={resource} label="픽업 일정" /> : <>
        <p className="muted">{schedule.visible.length.toLocaleString('ko-KR')}건{selected ? ` · 이번 달 전체 ${schedule.entries.length.toLocaleString('ko-KR')}건` : ''}</p>
        {schedule.visible.length ? <ul className="seller-pickup-events">{schedule.visible.map(item => <li key={item.id}>
          <a href={`#${sellerCalendarReservationPath(item.id)}`} className="seller-pickup-event">
            <span className="seller-pickup-time">{!selected && <span>{formatDate(item.pickup_date)}</span>}<time dateTime={item.pickup_at}>{item.pickup_time}</time></span>
            <span className="seller-pickup-summary"><strong>{item.fabric_title}</strong><span>{item.buyer_nickname || '구매자 이름 미제공'} · 예약 #{item.id}</span></span><span className="seller-pickup-open">상세 보기 →</span>
          </a>
        </li>)}</ul> : <Notice>{schedule.entries.length === 0 ? '이번 달에는 수락된 픽업 일정이 없어요.' : '선택한 날짜에는 수락된 픽업 일정이 없어요. 다른 날짜나 이번 달 전체 일정을 확인해 주세요.'}</Notice>}
        <small className="muted">마지막 확인 {formatDateTime(resource.data.checkedAt)} · 수령 완료·취소·거절된 예약은 달력에 표시하지 않아요.</small>
      </>}
    </div>
    <div className="actions"><Link path="/seller/reservations?status=ACCEPTED">수락된 예약 전체</Link>{compact && <Link path={path({ base: '/seller/calendar', date: selected, all: !selected })}>월별 달력 보기</Link>}</div>
  </section>;
}

export default function SellerLiveOverview({ ctx }) {
  const calendar = useSellerOverviewResource(ctx.api, 'calendar');
  return ctx.path === '/seller/calendar'
    ? <section className="seller-page stack" data-figma-node="142:6919"><PageHeading title="픽업 일정" description="수락된 예약을 날짜별로 확인하고 예약 상세에서 수령 완료로 처리하세요." /><div className="actions"><Link path="/seller/dashboard">대시보드로</Link></div><Calendar ctx={ctx} resource={calendar} /></section>
    : <Dashboard ctx={ctx} calendar={calendar} />;
}

function Dashboard({ ctx, calendar }) {
  const requested = useSellerOverviewResource(ctx.api, 'requested');
  const fabrics = useSellerOverviewResource(ctx.api, 'fabrics');
  const inquiries = useSellerOverviewResource(ctx.api, 'inquiries');
  const busy = [requested, fabrics, inquiries, calendar].some(resource => resource.loading);
  const retryAll = () => { for (const resource of [requested, fabrics, inquiries, calendar]) resource.retry(); };
  return <section className="seller-page stack" data-figma-node="123:2473"><PageHeading title={`반가워요, ${ctx.state.store?.store_name || ctx.state.seller.nickname}`} description="받은 예약과 픽업 진행 상태를 확인하세요." />
    <div className="actions"><Button onClick={retryAll} disabled={busy}>{busy ? '현황 조회 중' : '전체 현황 새로 조회'}</Button></div>
    <div className="stat-grid seller-stats">
      <Stat label="예약 요청" resource={requested} note="판매자 확인 대기" />
      <Stat label="답변 대기" resource={inquiries} countKey="WAITING" note={inquiries.data ? `답변 완료 ${inquiries.data.ANSWERED.toLocaleString('ko-KR')}건` : '받은 문의 현황'} />
      <Stat label="수락된 예약" resource={calendar} note="전체 날짜의 수락 내역" />
      <Stat label="원단 승인 대기" resource={fabrics} countKey="PENDING" note={fabrics.data ? `전체 원단 ${fabrics.data.total.toLocaleString('ko-KR')}건` : '내 원단 현황'} />
    </div>
    <div className="seller-columns"><div className="stack">
      <section className="panel seller-panel"><h2>오늘 처리할 일</h2><h3>받은 픽업 예약 확인</h3><p className="muted">요청을 수락하거나 거절하고, 전달한 원단은 수령 완료로 처리하세요.</p>{requested.error && <OverviewFailure resource={requested} label="예약 요청 현황" />}<div className="actions"><Link path="/seller/reservations" tone="primary">예약 확인</Link><Link path="/seller/reservations?status=ACCEPTED">수락된 예약</Link></div></section>
      <section className="panel seller-panel"><h2>내 원단 현황</h2>
        {fabrics.loading ? <p role="status" className="muted">원단 현황을 조회하고 있어요.</p> : fabrics.error ? <OverviewFailure resource={fabrics} label="원단 현황" /> : <dl className="seller-overview-counts">{SELLER_FABRIC_COUNT_LABELS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{sellerOverviewCount(fabrics, key)}</dd></div>)}</dl>}
        <h3>문의 현황</h3>{inquiries.loading ? <p role="status" className="muted">문의 현황을 조회하고 있어요.</p> : inquiries.error ? <OverviewFailure resource={inquiries} label="문의 현황" /> : <dl className="seller-overview-counts"><div><dt>답변 대기</dt><dd>{sellerOverviewCount(inquiries, 'WAITING')}</dd></div><div><dt>답변 완료</dt><dd>{sellerOverviewCount(inquiries, 'ANSWERED')}</dd></div></dl>}
        <Notice>원단 관리에서 등록 내역을 수정하고, 문의 내역에서 구매자의 질문을 확인하고 답변할 수 있어요.</Notice><div className="actions"><Link path="/seller/fabrics">원단 관리</Link><Link path="/seller/inquiries">문의 확인·답변</Link></div>
      </section>
    </div><Calendar ctx={ctx} resource={calendar} compact /></div>
  </section>;
}
