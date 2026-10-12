import { useMemo, useState } from 'react';
import { Button, Notice, PageHeading } from '../../components/ui.jsx';
import useReservationResource from '../../hooks/useReservationResource.js';
import { formatDate } from '../../lib/format.js';
import { sellerCalendar } from './sellerUx.js';

const Link = ({ path, children, ...props }) => <Button href={path} {...props}>{children}</Button>;

// Calendar API aggregation and the other dashboard services are not connected.
// Never represent their unavailable information as zero or an empty schedule.
function Calendar({ ctx, compact = false }) {
  const [fallback] = useState(() => formatDate(Date.now()).replaceAll('.', '-').slice(0, 7));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(ctx.query.get('month') || '') ? ctx.query.get('month') : fallback;
  const { year, number, days, offset, selected } = sellerCalendar(month, ctx.query.get('date'));
  const base = compact ? '/seller/dashboard' : '/seller/calendar';
  const monthPath = delta => {
    const date = new Date(year, number - 1 + delta, 1);
    return `${base}?month=${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };
  const select = (event, route) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); ctx.navigate(route, { preserveScroll: true, focusTarget: 'seller-calendar-date' });
  };
  return <section className="panel seller-panel"><div className="seller-calendar-head"><h2>{year}년 {number}월</h2><div className="actions"><Link path={monthPath(-1)} aria-label="이전 달">‹</Link><Link path={monthPath(1)} aria-label="다음 달">›</Link></div></div>
    <Notice>날짜별 예약 표시는 아직 연결되지 않았어요. 일정 유무는 아래의 수락된 예약 내역에서 확인해 주세요.</Notice>
    <div className={`seller-calendar${compact ? '' : ' seller-calendar-full'}`} aria-label="날짜 선택 · 예약 일정 미연동">{['월', '화', '수', '목', '금', '토', '일'].map(day => <span key={day} className="seller-calendar-weekday">{day}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}{Array.from({ length: days }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`, path = `${base}?month=${month}&date=${date}`;
      return <a key={date} href={`#${path}`} onClick={event => select(event, path)} className={`seller-calendar-day${selected === date ? ' is-selected' : ''}`} aria-current={selected === date ? 'date' : undefined} aria-label={`${year}년 ${number}월 ${i + 1}일 선택`}>{i + 1}</a>;
    })}</div>
    <p className="muted">{selected ? `${formatDate(selected)}의 일정도 수락된 예약의 픽업 일시를 확인해 주세요.` : '달력에 표시가 없어도 예약이 없다는 뜻은 아닙니다.'}</p><div className="actions"><Link path="/seller/reservations?status=ACCEPTED" tone="primary">수락된 예약 확인</Link>{compact && <Link path={`/seller/calendar?month=${month}`}>월별 달력 보기</Link>}</div>
  </section>;
}

export default function SellerLiveOverview({ ctx }) {
  return ctx.path === '/seller/calendar' ? <section className="seller-page stack" data-figma-node="142:6919"><PageHeading title="픽업 일정" description="실제 픽업 일시는 수락된 예약 내역에서 확인할 수 있어요." /><div className="actions"><Link path="/seller/dashboard">대시보드로</Link></div><Calendar ctx={ctx} /></section> : <Dashboard ctx={ctx} />;
}

function Dashboard({ ctx }) {
  const api = useMemo(() => ({ listReservations: (query, options) => ctx.api.listReceivedReservations(query, options) }), [ctx.api]);
  const requested = useReservationResource(api, { kind: 'list', query: { status: 'REQUESTED', page: 0, size: 1 } });
  const accepted = useReservationResource(api, { kind: 'list', query: { status: 'ACCEPTED', page: 0, size: 1 } });
  const count = resource => resource.loading ? '조회 중' : resource.error ? '조회 실패' : `${resource.data.totalElements}건`;
  return <section className="seller-page stack" data-figma-node="123:2473"><PageHeading title={`반가워요, ${ctx.state.store?.store_name || ctx.state.seller.nickname}`} description="받은 예약과 픽업 진행 상태를 확인하세요." />
    <div className="stat-grid seller-stats">{[['예약 요청', count(requested), '판매자 확인 대기'], ['답변 대기', '미조회', '문의 내역 연동 전'], ['수락된 예약', count(accepted), '전체 수락 내역'], ['원단 승인', '미조회', '원단 관리 연동 전']].map(([label, value, note]) => <div key={label} className="panel stat-card"><p className="muted">{label}</p><strong className="seller-stat-value">{value}</strong><small className="muted">{note}</small></div>)}</div>
    {(requested.error || accepted.error) && <Notice tone="error">예약 현황을 일부 불러오지 못했어요. <Button onClick={() => { requested.retry(); accepted.retry(); }}>다시 조회</Button></Notice>}
    <div className="seller-columns"><div className="stack"><section className="panel seller-panel"><h2>오늘 처리할 일</h2><h3>받은 픽업 예약 확인</h3><p className="muted">요청을 수락하거나 거절하고, 전달한 원단은 수령 완료로 처리하세요.</p><div className="actions"><Link path="/seller/reservations" tone="primary">예약 확인</Link><Link path="/seller/reservations?status=ACCEPTED">수락된 예약</Link></div></section><section className="panel seller-panel"><h2>내 원단 현황</h2><Notice>원단 관리와 문의 현황은 아직 조회되지 않습니다. 위의 미조회 표시는 등록된 원단이나 문의가 없다는 뜻이 아니에요.</Notice><div className="actions"><Link path="/seller/fabrics">원단 관리 화면</Link><Link path="/seller/inquiries">문의 화면</Link></div></section></div><Calendar ctx={ctx} compact /></div>
  </section>;
}
