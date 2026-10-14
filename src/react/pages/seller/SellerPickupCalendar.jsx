import { useState } from 'react';
import { Button, Notice } from '../../components/ui.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';
import {
  sellerToday, sellerDashboardCalendar, sellerCalendarPath,
  sellerCalendarAdjacentMonth, sellerPickupSchedule, sellerCalendarReservationPath,
} from './sellerDashboardModel.js';

export default function SellerPickupCalendar({ ctx, resource, compact = false }) {
  const [today] = useState(() => sellerToday(Date.now()));
  const query = new URLSearchParams(ctx.query);
  if (compact && !query.has('date')) query.set('view', 'month');
  const { year, number, days, offset, selected, month } = sellerDashboardCalendar(query, today);
  const schedule = resource.data ? sellerPickupSchedule(resource.data.content, month, selected) : null;
  const path = values => sellerCalendarPath(ctx, { month, ...values });
  const detailPath = values => path({ base: '/seller/calendar', ...values });
  const select = (event, route, focusTarget = 'seller-calendar-date') => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    ctx.navigate(route, compact && route.startsWith('/seller/calendar') ? { focusTarget } : { preserveScroll: true, focusTarget });
  };
  const fullPath = detailPath({ date: selected, all: !selected });
  const failure = <Notice tone="error"><div className="seller-overview-failure"><span>픽업 일정을 불러오지 못했어요. {resource.error?.message || '다시 조회해 주세요.'}</span><Button onClick={resource.retry}>픽업 일정 다시 조회</Button></div></Notice>;
  return <div className={`seller-calendar-layout${compact ? ' seller-calendar-layout--dashboard' : ''}`}>
    <section className="panel seller-panel seller-live-calendar" aria-label="픽업 달력">
      <h2>{compact ? '월별 픽업 일정' : '픽업 달력'}</h2>
      <div className="seller-calendar-head"><h3>{year}년 {number}월</h3><div className="actions">{[[-1, '이전 달', '‹'], [1, '다음 달', '›']].map(([delta, label, icon]) => {
        const route = path({ month: sellerCalendarAdjacentMonth(month, delta), all: true });
        return <Button key={delta} href={route} onClick={event => select(event, route, 'seller-calendar-first')} aria-label={label}>{icon}</Button>;
      })}</div></div>
      <p className="muted seller-small">{compact ? '날짜를 눌러 픽업 일정을 확인하세요. 한국 시간 기준이에요.' : '날짜를 누르면 수락된 예약의 픽업 일정을 확인할 수 있어요.'}</p>
      <div className="actions seller-calendar-actions">
        <Button href={detailPath({ month: today.slice(0, 7), date: today })} onClick={event => select(event, detailPath({ month: today.slice(0, 7), date: today }))}>오늘</Button>
        <Button href={compact ? detailPath({ all: true }) : path({ all: true })} onClick={event => select(event, compact ? detailPath({ all: true }) : path({ all: true }), 'seller-calendar-first')}>이번 달 전체</Button>
        <Button onClick={resource.retry} disabled={resource.loading}>새로 조회</Button>
      </div>
      <div className="seller-calendar seller-calendar-full" aria-label={`${year}년 ${number}월 날짜 선택`} aria-busy={resource.loading}>
        {['월', '화', '수', '목', '금', '토', '일'].map(day => <span key={day} className="seller-calendar-weekday">{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`, route = detailPath({ date });
          const count = schedule?.byDate.get(date)?.length || 0;
          const status = resource.loading ? '일정 조회 중' : resource.error ? '일정 확인 필요' : `수락된 예약 ${count}건`;
          return <a key={date} href={`#${route}`} onClick={event => select(event, route)} className={`seller-calendar-day${selected === date ? ' is-selected' : ''}${date === today ? ' is-today' : ''}${count ? ' has-pickup' : ''}`} aria-current={selected === date ? 'date' : undefined} aria-label={`${year}년 ${number}월 ${i + 1}일${date === today ? ' 오늘' : ''}, ${status}`}>
            <span>{i + 1}</span>{count > 0 && <span className="seller-calendar-pickup"><span className="seller-calendar-pickup-label">픽업 </span>{count}건</span>}
          </a>;
        })}
      </div>
      {!compact && <p className="muted seller-small">픽업 날짜와 시간은 한국 시간 기준이에요.</p>}
      {compact && <div className="seller-calendar-footer"><div aria-live="polite">{resource.loading ? <p role="status">전체 수락 내역을 확인하고 있어요.</p> : resource.error ? failure : <p className="muted">이번 달 픽업 {schedule.entries.length.toLocaleString('ko-KR')}건</p>}</div><Button href={fullPath}>픽업 일정 전체 보기 →</Button></div>}
    </section>
    {!compact && <section className="panel seller-panel seller-calendar-results" aria-label="선택한 픽업 일정" aria-busy={resource.loading} aria-live="polite">
      <h2>{selected ? `${formatDate(selected)} 픽업 일정` : `${number}월 전체 픽업 일정`}</h2>
      {resource.loading ? <p role="status" className="muted">전체 수락 내역을 확인하고 있어요.</p> : resource.error ? failure : <>
        <p className="muted">{schedule.visible.length.toLocaleString('ko-KR')}건{selected ? ` · 이번 달 전체 ${schedule.entries.length.toLocaleString('ko-KR')}건` : ''}</p>
        {schedule.visible.length ? <ul className="seller-pickup-events">{schedule.visible.map(item => <li key={item.id}>
          <a href={`#${sellerCalendarReservationPath(item.id)}`} className="seller-pickup-event">
            <span className="seller-pickup-time">{!selected && <span>{formatDate(item.pickup_date)}</span>}<time dateTime={item.pickup_at}>{item.pickup_time}</time></span>
            <span className="seller-pickup-summary"><strong>{item.fabric_title}</strong><span>{item.buyer_nickname || '구매자 이름 미제공'} · 예약 #{item.id}</span></span><span className="seller-pickup-open">예약 확인 →</span>
          </a>
        </li>)}</ul> : <Notice>{schedule.entries.length === 0 ? '이번 달에는 수락된 픽업 일정이 없어요.' : '선택한 날짜에는 수락된 픽업 일정이 없어요. 다른 날짜나 이번 달 전체 일정을 확인해 주세요.'}</Notice>}
        {resource.data.checkedAt && <small className="muted">마지막 확인 {formatDateTime(resource.data.checkedAt)} · 수령 완료·취소·거절된 예약은 표시하지 않아요.</small>}
      </>}
      <div className="actions"><Button href="/seller/reservations?status=ACCEPTED">수락된 예약 전체</Button></div>
    </section>}
  </div>;
}
