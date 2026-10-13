import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Badge, Notice, PageHeading, EmptyState, FabricImage, Field, SelectField } from '../components/ui.jsx';
import useFabricResource from '../hooks/useFabricResource.js';
import useReservationResource from '../hooks/useReservationResource.js';
import useReservationMutation from '../hooks/useReservationMutation.js';
import BuyerLivePatterns, { MakingSteps, pouchGuideImages, LiveRecommendationsPreview, LivePatternPickup } from './BuyerLivePatterns.jsx';
import { BuyerLiveInquiries } from './InquiryPages.jsx';
import { FavoriteButton, FavoriteList } from './FavoritePages.jsx';
import LiveProfilePage from './LiveProfilePage.jsx';
import { inquiryFlowPath } from './inquiry-model.js';
import { isPatternRoute, recommendedPickupIssue, patternDetailPath } from './buyer-pattern-model.js';
import { pickupAtKst } from '../services/reservation-contract.js';
import { validDateKst, reservationListReturn, reservationResourceRequest, reservationListPagePath, reservationPriceText, reservationPreviewFabric, submittedReservationKey, submittedReservationMatches } from './buyer-model.js';
import { filterDemoFabrics, fabricSearchPath, fabricSaleTypePath } from './buyer-model.js';
import { FABRIC_FILTER_OPTIONS, fabricFilterLabel } from '../services/fabric-contract.js';
import { fabricResourceRequest, fabricListPagePath, applyFilterPath, filterValue, defectText } from './buyer-model.js';
import { STATUS, STATUS_DESCRIPTION, price, routeId, href, fabricRoute, quantityText, dimensions, priceText, dateText, validDate, fabricNode, statusTone, isExample, exampleQuery, reservationPath, reservationQuantity, draftKey, currentRoute, addQuery, internalReturn, listReturn, keepList, detailPath, pickupPath, listPath, availability, exampleReservation, selectedReservation, FILTER_NAMES, filterEditPath, filterCancelPath, filterSummary, currentPickupStore, storeAddress, reservationPrimaryAction, SUPPLY_STORES } from './buyer-model.js';

// Figma page 122:12. Existing CSS and node annotations are retained during the JSX migration.
const Page = ({ node, children, className = '' }) => <div className={`buyer-page ${className}`} data-figma-node={node}>{children}</div>;
const Info = ({ rows }) => <dl className="buyer-info">{rows.map(([label, value], index) => <Fragment key={`${label}-${index}`}><dt>{label}</dt><dd>{value ?? ''}</dd></Fragment>)}</dl>;
const Picture = ({ fabric, className = '' }) => <FabricImage fabric={fabric} className={`buyer-fabric-art ${className}`} />;
const LinkButton = ({ children, path, tone = 'secondary', ...props }) => <Button href={href(path)} tone={tone} {...props}>{children}</Button>;
const MissingFabric = ({ ctx }) => <Page node="202:8381"><EmptyState title="원단을 찾을 수 없어요" description="게시가 종료되었거나 존재하지 않는 원단입니다."><LinkButton path={ctx && listReturn(ctx) || '/buyer/fabrics'} tone="primary">원단 목록으로</LinkButton></EmptyState></Page>;
const ExampleNotice = () => <Notice>화면 확인용 예시입니다. 실제 요청·취소 기록은 변경되지 않습니다.</Notice>;

function FabricReadFeedback({ resource, detail = false, resetPath = '/buyer/fabrics' }) {
  if (resource?.loading) return <section className="panel buyer-resource-feedback" role="status" aria-live="polite"><p>원단 정보를 불러오는 중이에요…</p></section>;
  if (!resource?.error) return null;
  const invalid = resource.error.status === 400;
  return <section className="panel buyer-resource-feedback"><Notice tone="error"><strong>{invalid ? detail ? '원단 번호를 확인해 주세요' : '검색 조건을 확인해 주세요' : '원단 정보를 불러오지 못했어요'}</strong><p>{resource.error.message || '연결 상태를 확인하고 다시 시도해 주세요.'}</p></Notice><div className="actions">{!invalid && <Button tone="primary" onClick={resource.retry}>다시 불러오기</Button>}<LinkButton path={resetPath} tone={invalid ? 'primary' : 'secondary'}>{detail ? '원단 목록으로' : '검색 조건 초기화'}</LinkButton></div></section>;
}

function useResourceHeading(resource, enabled = true) {
  const loadingFocusOwned = useRef(false);
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const heading = document.querySelector('#main-content h1, #main-content .empty-state h2');
    if (resource.loading) {
      // App's route focus runs after this effect. Track whether the reader leaves
      // the loading heading before the response replaces it, without stealing focus.
      loadingFocusOwned.current = document.activeElement === heading;
      const trackFocus = event => { loadingFocusOwned.current = event.target === heading; };
      document.addEventListener('focusin', trackFocus);
      return () => document.removeEventListener('focusin', trackFocus);
    }
    document.title = `${heading?.textContent || '패브링'} · 패브링`;
    if (loadingFocusOwned.current && heading && (document.activeElement === document.body || document.activeElement === heading)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    loadingFocusOwned.current = false;
    return undefined;
  }, [enabled, resource.loading, resource.data, resource.error]);
}

function LiveBuyerPage({ ctx }) {
  const request = fabricResourceRequest(ctx);
  const resource = useFabricResource(ctx.api, request);
  useResourceHeading(resource, request?.kind === 'detail');
  if (!request) return <BuyerScreens ctx={ctx} />;
  if (request.kind === 'list') return <BuyerScreens ctx={{ ...ctx, fabricResource: resource, state: { ...ctx.state, fabrics: resource.data?.content || [] } }} />;
  if (resource.error?.status === 404) return <MissingFabric ctx={ctx} />;
  if (!resource.data) return <Page node="123:1201"><PageHeading title="원단 정보 확인" /><FabricReadFeedback resource={resource} detail resetPath={listReturn(ctx) || '/buyer/fabrics'} /></Page>;
  const query = new URLSearchParams(ctx.query);
  if (query.has('fabric_id')) query.set('fabric_id', resource.data.id);
  return <BuyerScreens ctx={{ ...ctx, query, resolvedFabricId: resource.data.id, fabricResource: resource, state: { ...ctx.state, fabrics: [resource.data] } }} />;
}

function ReservationReadFeedback({ resource, confirmed = false }) {
  if (resource.loading) return <section className="panel buyer-resource-feedback" role="status" aria-live="polite"><p>{confirmed ? '접수는 완료되었어요. 예약 상세를 불러오고 있습니다.' : '예약 정보를 불러오는 중이에요…'}</p></section>;
  if (!resource.error) return null;
  const status = resource.error.status;
  const title = status === 404 ? '예약을 찾을 수 없어요' : status === 403 ? '이 예약을 확인할 수 없어요' : status === 400 ? '예약 조회 조건을 확인해 주세요' : '예약 정보를 불러오지 못했어요';
  return <section className="panel buyer-resource-feedback">{confirmed && <Notice tone="success">픽업 요청 접수는 완료되었어요. 다시 요청하지 말고 예약 내역에서 진행 상태를 확인해 주세요.</Notice>}<Notice tone="error"><strong>{title}</strong><p>{resource.error.message || '연결 상태를 확인한 뒤 다시 불러와 주세요.'}</p></Notice><div className="actions">{![400, 403, 404].includes(status) && <Button tone="primary" onClick={resource.retry}>예약 정보 다시 불러오기</Button>}<LinkButton path="/buyer/reservations" tone={[400, 403, 404].includes(status) ? 'primary' : 'secondary'}>예약 내역 확인</LinkButton></div></section>;
}

function LiveReservationPage({ ctx, request }) {
  const resource = useReservationResource(ctx.api, request);
  useResourceHeading(resource, request.kind === 'detail');
  if (request.kind === 'list') return <Reservations ctx={{ ...ctx, reservationResource: resource, state: { ...ctx.state, reservations: resource.data?.content || [] } }} />;
  const submitted = ctx.path.startsWith('/buyer/pickup/');
  const confirmation = submitted && ctx.drafts?.get(submittedReservationKey(request.id));
  const confirmed = confirmation && submittedReservationMatches(ctx, confirmation);
  if (!resource.data) return <Page node="127:4434"><PageHeading title={confirmed ? '픽업 요청을 보냈어요' : '예약 정보 확인'} /><ReservationReadFeedback resource={resource} confirmed={Boolean(confirmed)} /></Page>;
  if (submitted) return <LivePickupComplete ctx={ctx} item={resource.data} />;
  return <ReservationDetail ctx={{ ...ctx, reservationItem: { ...resource.data, list_return: reservationListReturn(ctx) }, reservationResource: resource }} />;
}

function LivePickupComplete({ ctx, item }) {
  if (!submittedReservationMatches(ctx, item)) return <Page node="127:4434"><PageHeading title="예약 정보를 다시 확인해 주세요" description="이 주소의 원단과 예약에 연결된 원단이 다릅니다." /><LinkButton path={reservationPath(item)} tone="primary">예약 상세 확인</LinkButton></Page>;
  const requested = item.status === 'REQUESTED';
  return <Page node={fabricNode(item.fabric, 2)}><PageHeading title={requested ? '픽업 요청을 보냈어요' : '예약의 현재 상태를 확인해 주세요'} description={requested ? '판매자가 재고와 방문 일정을 확인하고 있어요.' : `${STATUS[item.status]} · ${STATUS_DESCRIPTION[item.status]}`} /><Notice tone={requested ? 'success' : 'info'}>{requested ? '접수 완료 · 아직 재고가 확보되거나 픽업이 확정된 상태는 아니에요.' : '예약 상세에서 현재 진행 상태를 확인할 수 있어요.'}</Notice><section className="panel"><h2 className="buyer-panel-heading">접수된 요청 상세</h2><ReservationDetails item={item} fabric={item.fabric} /><Info rows={[[ '진행 상태', STATUS[item.status]]]} /></section><div className="actions"><LinkButton path={reservationPath(item)} tone="primary">요청 상세 확인</LinkButton><LinkButton path="/buyer/reservations">예약 내역 확인</LinkButton><LinkButton path={listReturn(ctx) || '/buyer/fabrics'}>원단 목록으로</LinkButton></div></Page>;
}

function UnknownReservationOutcome({ failure, item }) {
  if (!failure?.outcomeUnknown) return null;
  return <Notice tone="warning"><strong>{item ? '취소 결과를 아직 확인하지 못했어요.' : '요청이 접수되었는지 아직 확인하지 못했어요.'}</strong><p>같은 요청을 다시 보내기 전에 예약 내역에서 현재 상태를 확인해 주세요.</p><div className="actions"><LinkButton path={item ? reservationPath(item) : '/buyer/reservations?status=REQUESTED'} tone="primary">{item ? '예약 상태 다시 확인' : '예약 내역 확인'}</LinkButton></div></Notice>;
}

export default function BuyerPage({ ctx }) {
  if (ctx.mode !== 'live') return <BuyerScreens ctx={ctx} />;
  if (ctx.path === '/buyer/inquiries') return <BuyerLiveInquiries ctx={ctx} />;
  if (ctx.path === '/buyer/favorites') return <FavoriteList ctx={ctx} />;
  if (ctx.path === '/buyer/profile') return <LiveProfilePage ctx={ctx} />;
  if (isPatternRoute(ctx.path)) return <BuyerLivePatterns ctx={ctx} />;
  const reservationRequest = reservationResourceRequest(ctx);
  return reservationRequest ? <LiveReservationPage ctx={ctx} request={reservationRequest} /> : <LiveBuyerPage ctx={ctx} />;
}

function FormError({ message }) {
  const ref = useRef(null);
  useEffect(() => { if (message) ref.current?.focus(); }, [message]);
  return <div ref={ref} data-buyer-error="" role="alert" tabIndex={-1} className="buyer-field-error">{message}</div>;
}

function useSubmission() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async action => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { setError(failure.message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return { busy, error, setError, run };
}

function StockRecovery({ ctx, fabric, stock }) {
  const message = stock.own ? '이미 보낸 요청이 있어요. 기존 예약에서 진행 상태를 확인해 주세요.' : fabric.sale_type === 'ROLL' ? '현재 1마(90cm) 이상 요청할 수 있는 길이가 남아 있지 않아요. 다른 원단을 찾아보세요.' : '판매자가 수락한 예약이 있는 자투리입니다. 다른 원단을 찾아보세요.';
  return <><Notice tone="warning">{message}</Notice><div className="actions">{stock.own && <LinkButton path={reservationPath(stock.own)} tone="primary">기존 예약 확인</LinkButton>}<LinkButton path={listPath(ctx, fabric)} tone={stock.own ? 'secondary' : 'primary'}>다른 원단 찾기</LinkButton></div></>;
}

const ReservationDetails = ({ item, fabric }) => <Info rows={[
  ['요청 번호', item.example ? (item.sale_type === 'ROLL' ? 'R-예시-001' : 'R-예시-002') : item.id],
  ['원단', item.fabric_title || fabric?.title], ['요청 수량', reservationQuantity(item)],
  ['예상 금액', reservationPriceText(item)], [item.status === 'ACCEPTED' ? '수락된 픽업' : '희망 픽업', `${dateText(item.pickup_date)} · ${item.pickup_time}`],
]} />;

function SaleTypeTabs({ ctx, saleType }) {
  return <nav className="tabs" aria-label="원단 판매 형태">{[['SCRAP', '자투리'], ['ROLL', '롤']].map(([value, label]) => <a key={value} className={`button${saleType === value ? ' is-active' : ''}`} href={href(fabricSaleTypePath(ctx, value))} aria-current={saleType === value ? 'page' : undefined}>{label}</a>)}</nav>;
}

function FabricCard({ ctx, fabric }) {
  const stock = availability(ctx, fabric);
  const store = currentPickupStore(ctx.state, fabric);
  const route = href(detailPath(ctx, fabric));
  return <article className="buyer-fabric-card"><a className="buyer-card-photo" href={route} aria-label={`${fabric.title} 상세 보기`}><Picture fabric={fabric} /></a><div className="buyer-card-copy"><h3><a href={route}>{fabric.title}</a></h3><strong className="buyer-card-price">{priceText(fabric)}</strong><p className="buyer-small">{[fabric.material, fabric.color, fabric.thickness].filter(Boolean).join(' · ')}</p><p className="buyer-card-dimensions">{dimensions(fabric)}</p><p className="buyer-card-store">{fabric.store_name || store?.store_name || '매장 정보 확인 필요'} · 매장 픽업</p>{!stock.canRequest && <Badge tone="amber">{stock.label}</Badge>}</div></article>;
}

function Home({ ctx }) {
  const live = ctx.mode === 'live', resource = ctx.fabricResource;
  const fabrics = live ? ctx.state.fabrics : ctx.state.fabrics.filter(f => f.status === 'POSTED' && f.sale_type === 'SCRAP').toSorted((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 4);
  const search = event => { event.preventDefault(); const keyword = new FormData(event.currentTarget).get('keyword') || ''; ctx.navigate(fabricSearchPath({ query: new URLSearchParams() }, keyword)); };
  return <Page node="123:482" className="buyer-page--home">
    <section className="buyer-home-banner"><div className="buyer-home-banner-copy"><p className="brand-eyebrow">패브링 · 소재 큐레이션</p><PageHeading title={<>원단을 다시 고르고,<br />쓰임을 새로 만들다.</>} description="양주에 남은 좋은 원단을 필요한 만큼. 소재와 치수를 확인하고 매장에서 픽업하세요." /><form className="brand-search" onSubmit={search}><label className="sr-only" htmlFor="home-fabric-search">원단 검색</label><input id="home-fabric-search" name="keyword" maxLength={100} placeholder="원단 이름, 소재, 색상 검색" /><button type="submit" aria-label="원단 검색하기">→</button></form><nav className="buyer-material-links" aria-label="자주 찾는 원단"><a href="#/buyer/fabrics?sale_type=SCRAP&color_family=BLUE&keyword=데님">블루 데님</a><a href="#/buyer/fabrics?sale_type=SCRAP&material=COTTON">면</a><a href="#/buyer/fabrics?sale_type=SCRAP&material=BLEND">혼방</a><a href="#/buyer/fabrics?sale_type=ROLL">롤 원단</a></nav></div><div className="buyer-home-banner-photo"><img src="/assets/brand/fabric-hero.webp" alt="워시드 데님과 인디고 원단의 결감을 보여주는 생성 소재 사진" width="1536" height="1024" fetchPriority="high" /><span>소재 노트 · 데님</span></div></section>
    <div className="buyer-home-section-heading"><div><h2>최근 등록된 자투리 원단</h2><p className="muted">소재와 사용 가능한 치수를 함께 살펴보세요.</p></div><LinkButton path="/buyer/fabrics?sale_type=SCRAP">전체 자투리 →</LinkButton></div>
    {resource?.loading || resource?.error ? <FabricReadFeedback resource={resource} /> : <div className="buyer-home-products">{fabrics.length ? fabrics.map(fabric => <FabricCard key={fabric.id} ctx={ctx} fabric={fabric} />) : <EmptyState title="새로운 원단을 기다리고 있어요" description="원단이 게시되면 이곳에서 확인할 수 있어요." />}</div>}
    <section className="buyer-pickup-guide" aria-label="매장 픽업 이용 안내"><h2>매장 픽업은 이렇게 진행돼요.</h2><ol>{[['소재·치수 확인','롤은 1마(90cm), 자투리는 한 장 전체를 요청해요.'],['픽업 요청·수락 확인','판매자가 수락하면 요청 수량이 확보돼요.'],['실물 확인·수령','약속한 시간에 매장에서 원단을 받아요.']].map(([title,text],i)=><li key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></section>
  </Page>;
}

function Fabrics({ ctx, dedicated = false }) {
  const formRef = useRef(null);
  const live = ctx.mode === 'live';
  const resource = ctx.fabricResource;
  const saleType = ctx.query.get('sale_type') === 'ROLL' ? 'ROLL' : 'SCRAP';
  const [filters, setFilters] = useState(() => Object.fromEntries(FILTER_NAMES.map(name => [name, fabricFilterLabel(name, filterValue(ctx.query, name))])));
  const [keyword, setKeyword] = useState(() => ctx.query.get('keyword') || '');
  const [expanded, setExpanded] = useState(() => !ctx.query.has('collapsed') && (typeof window === 'undefined' || !window.matchMedia('(max-width: 700px)').matches));
    const collapsed = ctx.query.get('collapsed') === '1';
  const search = ctx.query.get('view') === 'search';
  const publicFabrics = live ? ctx.state.fabrics : ctx.state.fabrics.filter(f => f.status === 'POSTED' && f.sale_type === saleType);
  // In live mode the server owns filtering, sorting, and the page boundary.
  const fabrics = live ? publicFabrics : filterDemoFabrics(publicFabrics, ctx.query);
  const hasFilters = Boolean(FILTER_NAMES.some(name => filterValue(ctx.query, name)) || ctx.query.get('keyword') || (ctx.query.get('sort') && ctx.query.get('sort') !== 'latest'));
  const options = (name, label) => {
    const values = live ? [...FABRIC_FILTER_OPTIONS[name]] : [...new Set(publicFabrics.map(f => f[name]))].filter(Boolean).map(value => ({ value, label: value }));
    if (filters[name] && !values.some(option => option.value === filters[name])) values.push({ value: filters[name], label: filters[name] });
    return [{ value: '', label: `전체 ${label}` }, ...values];
  };
  const filterPath = filterEditPath(ctx);
  const resetPath = `/buyer/fabrics?sale_type=${saleType}`;
  const reset = () => ctx.navigate(resetPath);
  const apply = event => { event.preventDefault(); ctx.navigate(applyFilterPath(ctx, filters)); };
  const selects = [['material', '소재'], ['thickness', '두께'], ['color', '색상']].map(([name, label]) => <SelectField key={name} label={label} name={name} options={options(name, label)} value={filters[name]} onChange={event => setFilters(previous => ({ ...previous, [name]: event.target.value }))} />);
  const summary = <><ul className={`buyer-filter-summary${hasFilters ? '' : ' buyer-filter-summary--empty'}`} aria-label="현재 적용 조건">{filterSummary(ctx.query).map((value, index) => <li key={index} className={index === 0 || (index <= 3 && !filterValue(ctx.query, FILTER_NAMES[index - 1])) ? 'buyer-filter-default' : undefined}>{value}</li>)}</ul>{!hasFilters && <p className="buyer-filter-all">전체 원단</p>}</>;
  if (dedicated) return <Page node={saleType === 'ROLL' ? '127:2667' : '202:7982'}><PageHeading title="원단 검색 조건" description={`${saleType === 'ROLL' ? '롤' : '자투리'} 원단의 소재·두께·색상을 선택하세요.`} /><form className="panel" data-buyer-filter="" onSubmit={apply}><h2 className="buyer-panel-heading">상세 조건</h2><p>판매 형태: <strong>{saleType === 'ROLL' ? '롤' : '자투리'}</strong></p><input name="sale_type" type="hidden" value={saleType} />{selects}<div className="actions"><Button type="submit" tone="primary">선택한 조건으로 검색</Button><Button data-buyer-reset-filter="" onClick={() => setFilters({ material: '', thickness: '', color: '' })}>선택값 초기화</Button><LinkButton path={filterCancelPath(ctx)}>선택 취소</LinkButton></div></form><Notice>검색을 누르면 적용됩니다. 선택 취소 시 이전 검색 결과로 돌아갑니다.</Notice></Page>;
  const node = !fabrics.length && hasFilters ? '127:2890' : search ? '127:2745' : collapsed ? '127:2823' : saleType === 'SCRAP' ? '123:855' : '202:7763';
  const page = resource?.data;
  const ready = !resource?.loading && !resource?.error;
  const outsidePage = live && page?.page > 0 && !fabrics.length && page?.totalElements > 0;
  return <Page node={node} className="buyer-page--catalog">
    <PageHeading title={search ? '검색 결과' : '원단 둘러보기'} description={saleType === 'SCRAP' ? '자투리는 표시된 한 장 전체를 예약합니다.' : '롤은 1마(90cm) 단위로 요청할 수 있어요.'} />
    <SaleTypeTabs ctx={ctx} saleType={saleType} />
    <div className="buyer-catalog-toolbar"><form className="brand-search" onSubmit={event => { event.preventDefault(); ctx.navigate(fabricSearchPath(ctx, keyword)); }}><label htmlFor="catalog-fabric-search" className="sr-only">원단 검색</label><input id="catalog-fabric-search" value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={100} placeholder="원단 이름, 소재, 색상 검색" /><button type="submit" aria-label="원단 검색하기">→</button></form><SelectField label="원단 정렬" name="sort" options={[{value:'latest',label:'최근 등록순'},{value:'price_asc',label:'낮은 가격순'},{value:'price_desc',label:'높은 가격순'}]} value={ctx.query.get('sort') || 'latest'} onChange={event => ctx.navigate(fabricSearchPath(ctx, ctx.query.get('keyword') || '', event.target.value))} /></div>
    <div className="buyer-catalog-layout"><section className={`panel buyer-filter-panel${!expanded ? ' is-collapsed' : ''}`} aria-label="원단 필터"><div className="buyer-filter-toolbar"><h2 className="buyer-panel-heading">검색 조건</h2><div className="actions">{<Button data-buyer-collapse="" aria-expanded={expanded} aria-controls="buyer-filter-fields" onClick={() => setExpanded(value => !value)}>{expanded ? '조건 접기' : '필터 펼치기'}</Button>}{hasFilters && <Button data-buyer-reset-filter="" onClick={reset}>초기화</Button>}</div></div>{summary}{<form ref={formRef} id="buyer-filter-fields" hidden={!expanded} data-buyer-filter="" onSubmit={apply}><input type="hidden" name="sale_type" value={saleType} /><div className="buyer-filter-grid">{selects}</div><div className="actions"><Button type="submit" tone="primary">선택한 조건으로 검색</Button><Button data-buyer-reset-filter="" onClick={() => setFilters({ material: '', thickness: '', color: '' })}>선택값 초기화</Button></div></form>}</section>
    <div className="buyer-catalog-content">{ready && <p className="buyer-result-count" aria-live="polite">{saleType === 'SCRAP' ? '자투리' : '롤'} 원단 {live ? page?.totalElements ?? 0 : fabrics.length}개</p>}
    <div className="buyer-results" aria-busy={resource?.loading || undefined}>{!ready ? <FabricReadFeedback resource={resource} resetPath={resetPath} /> : fabrics.length ? fabrics.map(fabric => <FabricCard key={fabric.id} ctx={ctx} fabric={fabric} />) : outsidePage ? <EmptyState title="이 페이지에는 원단이 없어요" description="등록된 원단 수가 바뀌었을 수 있어요. 첫 페이지에서 다시 확인해 주세요."><LinkButton path={fabricListPagePath(ctx, 0)} tone="primary">첫 페이지로</LinkButton></EmptyState> : <EmptyState title="조건에 맞는 원단이 없어요" description="검색 범위를 넓히거나 조건을 바꿔서 다시 찾아보세요."><LinkButton path={filterPath} tone="primary">조건 수정</LinkButton><Button data-buyer-reset-filter="" onClick={reset}>전체 원단 보기</Button></EmptyState>}</div>
    {ready && live && page?.totalPages > 1 && !outsidePage && <nav className="buyer-pagination" aria-label="원단 목록 페이지"><LinkButton path={fabricListPagePath(ctx, page.page - 1)} disabled={page.page <= 0}>이전 페이지</LinkButton><p aria-live="polite">{page.page + 1} / {page.totalPages} 페이지</p><LinkButton path={fabricListPagePath(ctx, page.page + 1)} disabled={page.page + 1 >= page.totalPages}>다음 페이지</LinkButton></nav>}
    </div></div>
  </Page>;
}

function RecommendationsPreview({ ctx, fabric }) {
  const [asked, setAsked] = useState(false);
  useEffect(() => { setAsked(false); }, [fabric.id]);
  if (ctx.mode === 'live') return <LiveRecommendationsPreview ctx={ctx} fabric={fabric} />;
  return <section className="buyer-page" aria-labelledby="buyer-demo-pattern-title"><h2 id="buyer-demo-pattern-title">이 원단으로 만드는 방법</h2><p className="buyer-muted">버튼을 누르면 사이즈별 가방과 재단 도안을 보여 드려요.</p>{!asked ? <div className="actions"><Button tone="primary" onClick={() => setAsked(true)}>AI로 도안 뽑아서 보기</Button></div> : <article className="panel"><h3>토트백 도안</h3><MakingSteps parts={[]} images={pouchGuideImages} /></article>}</section>;
}

function FabricGallery({ fabric }) {
  const images = fabric.source === 'api' ? (fabric.images || []).filter(image => image.image_url) : [];
  const [selectedId, setSelectedId] = useState(null);
  const dialog = useRef(null);
  const selected = images.find(image => image.id === selectedId) || images[0];
  const shown = selected ? { ...fabric, image_url: selected.image_url } : fabric;
  const label = (image, index) => `${index + 1}번 ${{ FULL: '전체', ZOOM: '확대', DEFECT: '하자' }[image.image_type] || '등록'} 사진`;
  const canZoom = fabric.source !== 'api' || Boolean(shown.image_url);
  return <div className="buyer-gallery"><div className="buyer-photo-stage" data-buyer-gallery=""><Picture fabric={shown} className="buyer-gallery-main" />{canZoom && <Button className="buyer-photo-zoom" onClick={() => dialog.current?.showModal()}>사진 크게 보기</Button>}</div><p className="buyer-small muted">{fabric.source === 'api' ? `${selected ? images.indexOf(selected) + 1 : 1} / ${images.length || 1} · 화면과 조명에 따라 색상이 달라 보일 수 있어요.` : '소재 사진·질감 예시 · 실제 판매 원단 사진이 아닙니다.'}</p>{images.length > 1 && <div className="buyer-gallery-thumbs" role="group" aria-label="등록된 원단 사진">{images.map((image, index) => <button key={image.id} type="button" aria-label={`${label(image, index)} 보기`} aria-pressed={image.id === selected?.id} onClick={() => setSelectedId(image.id)}><Picture fabric={{ ...fabric, title: `${fabric.title} ${label(image, index)}`, image_url: image.thumbnail_url || image.image_url }} /></button>)}</div>}<dialog ref={dialog} className="buyer-photo-dialog" aria-label={`${fabric.title} 사진 확대`}><form method="dialog"><Button type="submit">사진 닫기</Button></form><Picture fabric={shown} /><p className="buyer-small muted">{fabric.source === 'api' ? '등록된 원단 사진' : '소재 사진·질감 예시'}</p></dialog></div>;
}

function FabricDetail({ ctx }) {
  const fabric = ctx.state.fabrics.find(f => f.id === routeId(ctx) && (f.source === 'api' || f.status === 'POSTED'));
  if (!fabric) return <MissingFabric />;
  const stock = availability(ctx, fabric), store = currentPickupStore(ctx.state, fabric), roll = fabric.sale_type === 'ROLL';
  const inquiry = ctx.mode === 'live' ? inquiryFlowPath(ctx, fabric.id, { compose: 1 }) : keepList(ctx, `/buyer/inquiries?fabric_id=${encodeURIComponent(fabric.id)}&compose=1`);
  return <Page node={fabricNode(fabric, 0)} className="buyer-page--detail"><p className="buyer-breadcrumb"><a href={href(listPath(ctx, fabric))}>{listReturn(ctx)?.includes('view=search') ? '검색 결과로' : '원단 목록으로'}</a> / 원단 상세</p><div className="buyer-detail-grid"><FabricGallery key={fabric.id} fabric={fabric} /><section className="buyer-detail-summary"><div className="buyer-detail-topline"><p className="brand-eyebrow">{roll ? '롤 원단' : '자투리 한 장'}</p><Badge tone={stock.canRequest ? 'green' : 'amber'}>{stock.label}</Badge></div><PageHeading title={fabric.title} /><p className="buyer-price">{priceText(fabric)}</p><dl className="buyer-measures"><div><dt>원단 폭</dt><dd>{fabric.width_cm} <small>cm</small></dd></div><div><dt>{roll ? '판매 가능 길이' : '한 장 길이'}</dt><dd>{roll ? fabric.available_length_cm : fabric.length_cm} <small>cm</small></dd></div></dl><p className="buyer-small muted">{roll ? '1마는 90cm입니다. 구매할 길이는 픽업 요청에서 선택하세요.' : '표시된 치수의 자투리 한 장 전체를 거래합니다.'}</p><Info rows={[[ '소재', fabric.material ],[ '색상', fabric.color ],...(fabric.color_detail ? [['색상 상세',fabric.color_detail]] : []),['두께', fabric.thickness],['하자', defectText(fabric)]]} />{fabric.description && <section className="buyer-seller-description"><h2>원단 소개</h2><p>{fabric.description}</p></section>}<div className="buyer-pickup-store"><strong>{fabric.store_name || store?.store_name || '매장 정보 확인 필요'}</strong><p className="buyer-small muted">{storeAddress(store) || '방문 주소 확인 필요'} · 매장 픽업</p></div>{!stock.canRequest && <StockRecovery ctx={ctx} fabric={fabric} stock={stock} />}<div className="buyer-detail-actions">{stock.canRequest && <LinkButton path={pickupPath(ctx, fabric)} tone="primary">픽업 요청하기</LinkButton>}<LinkButton path={inquiry}>판매자 문의</LinkButton>{ctx.mode === 'live' && <LinkButton path={inquiryFlowPath(ctx, fabric.id)}>문의·답변 보기</LinkButton>}{ctx.mode === 'live' && fabric.source === 'api' && fabric.status === 'POSTED' && <FavoriteButton api={ctx.api} targetType="FABRIC" targetId={fabric.id} noun="원단" />}</div><p className="buyer-small muted">판매자 수락 전에는 원단이 확보되지 않습니다.</p></section></div><section className="panel buyer-detail-facts"><h2 className="buyer-panel-heading">픽업 매장 안내</h2><Info rows={[[ '판매처', fabric.store_name],['픽업 주소', storeAddress(store) || '판매자에게 방문 주소를 확인해 주세요.'],['휴무일',store?.closed_days || '등록된 휴무 안내 없음'],['방문 안내', store?.pickup_guide || '방문 전 판매자에게 일정을 확인해 주세요.']]} /></section><RecommendationsPreview ctx={ctx} fabric={fabric} /><div className="buyer-mobile-pickup"><strong>{priceText(fabric)}</strong><LinkButton path={stock.canRequest ? pickupPath(ctx, fabric) : stock.own ? reservationPath(stock.own) : listPath(ctx, fabric)} tone="primary">{stock.canRequest ? '픽업 요청' : stock.own ? '내 예약 확인' : '다른 원단 보기'}</LinkButton></div></Page>;
}

function Pickup({ ctx }) {
  const fabric = ctx.state.fabrics.find(f => f.id === routeId(ctx) && (f.source === 'api' || f.status === 'POSTED'));
  if (!fabric) return <MissingFabric />;
  const submitted = ctx.query.get('submitted');
  const reservation = (submitted && ctx.state.reservations.find(item => item.id === submitted && item.fabric_id === fabric.id)) || (isExample(ctx) && ctx.query.get('state') === 'DONE' ? exampleReservation(ctx, fabric.sale_type === 'ROLL' ? 'demo-roll' : 'demo-scrap', fabric.id) : null);
  if (reservation) return <Page node={fabricNode(fabric, 2)}><PageHeading title="픽업 요청을 보냈어요" description="판매자가 재고와 방문 일정을 확인하고 있어요." />{reservation.example && <ExampleNotice />}<Notice tone="success">접수 완료 · 아직 재고가 확보되거나 픽업이 확정된 상태는 아니에요.</Notice><section className="panel"><h2 className="buyer-panel-heading">접수된 요청 상세</h2><ReservationDetails item={reservation} fabric={fabric} /><Info rows={[[ '진행 상태', '요청됨']]} /></section><div className="actions"><LinkButton path={reservationPath(reservation)} tone="primary">요청 상세 확인</LinkButton><LinkButton path="/buyer/fabrics">원단 목록으로</LinkButton></div></Page>;
  const stock = availability(ctx, fabric);
  if (!stock.canRequest) return <Page node={fabricNode(fabric, 1)}><PageHeading title="픽업 요청 전 확인해 주세요" description={fabric.title} /><section className="panel"><h2 className="buyer-panel-heading">현재 원단 상태</h2><Badge tone="amber">{stock.label}</Badge><Info rows={[[ '원단', fabric.title], ['구매 가능 치수', dimensions(fabric)]]} /></section><StockRecovery ctx={ctx} fabric={fabric} stock={stock} /><div><LinkButton path={detailPath(ctx, fabric)}>원단 상세로 돌아가기</LinkButton></div></Page>;
  if (ctx.mode === 'live' && ctx.query.has('pattern_id')) return <LivePatternPickup ctx={ctx} fabric={fabric}>{recommendation => <PickupForm ctx={ctx} fabric={fabric} recommendation={recommendation} />}</LivePatternPickup>;
  return <PickupForm ctx={ctx} fabric={fabric} />;
}

function PickupForm({ ctx, fabric, recommendation }) {
  const baseKey = draftKey('pickup', fabric.id);
  const key = recommendation ? `${baseKey}:pattern:${recommendation.pattern_id}` : baseKey;
  const store = currentPickupStore(ctx.state, fabric);
  const maxMa = Math.floor((fabric.available_length_cm || 0) / 90);
  const roll = fabric.sale_type === 'ROLL';
  const [values, setValues] = useState(() => {
    const draft = ctx.drafts?.get(key) || {};
    const fallback = ctx.drafts?.get(baseKey) || {};
    const initialMa = recommendation?.yards || (ctx.mode === 'live' ? Math.min(2, maxMa || 1) : Math.max(1, Math.min(maxMa || 1, Number(ctx.query.get('ma')) || Math.min(2, maxMa || 1))));
    return { requested_ma: draft.requested_ma ?? initialMa, pickup_date: draft.pickup_date ?? fallback.pickup_date ?? (ctx.mode === 'live' ? validDateKst(2) : validDate(2)), pickup_time: draft.pickup_time ?? fallback.pickup_time ?? '14:00', memo: draft.memo ?? fallback.memo ?? '' };
  });
  const submission = useReservationMutation(ctx);
  const change = event => {
    const next = { ...values, [event.target.name]: event.target.value };
    setValues(next); ctx.drafts?.set(key, next);
  };
  const submit = event => {
    event.preventDefault();
    if (submission.failure?.outcomeUnknown || !event.currentTarget.reportValidity()) return;
    if (ctx.mode === 'live') {
      try { pickupAtKst(values.pickup_date, values.pickup_time); }
      catch (error) { return submission.setError(error.message); }
    } else if (new Date(`${values.pickup_date}T${values.pickup_time}`).getTime() <= Date.now()) return submission.setError('픽업 희망 날짜와 시간은 현재보다 이후로 선택해 주세요.');
    const ma = Number(values.requested_ma);
    if (roll && (!Number.isInteger(ma) || ma < 1 || ma * 90 > fabric.available_length_cm)) return submission.setError('구매 가능한 길이 안에서 1마 단위로 선택해 주세요.');
    submission.run(async ({ signal, isCurrent }) => {
      if (recommendation) {
        let fresh, freshFabric;
        try {
          [fresh, freshFabric] = await Promise.all([ctx.api.getRecommendations(fabric.id, { signal }), ctx.api.getFabric(fabric.id, { signal }), ctx.api.getPattern(recommendation.pattern_id, { signal })]);
        } catch (error) {
          if (error.status === 404) throw new Error('이 원단 또는 도안의 공개 상태가 바뀌었어요. 추천 결과를 다시 확인해 주세요.');
          throw error;
        }
        if (!isCurrent()) return;
        const issue = recommendedPickupIssue(fresh, recommendation.pattern_id, fabric, ma, freshFabric);
        if (issue) throw new Error(issue);
      }
      try {
        const reservation = await ctx.api.createReservation({ fabric_id: fabric.id, ...(roll ? { requested_length_cm: ma * 90 } : {}), ...(recommendation ? { pattern_id: recommendation.pattern_id } : {}), pickup_date: values.pickup_date, pickup_time: values.pickup_time, memo: values.memo.trim() }, { signal });
        if (!isCurrent()) return;
        ctx.drafts?.delete(key);
        if (ctx.mode === 'live') ctx.drafts?.set(submittedReservationKey(reservation.id), { id: reservation.id, fabric_id: fabric.id });
        await ctx.refresh();
        if (!isCurrent()) return;
        ctx.navigate(keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}?submitted=${encodeURIComponent(reservation.id)}`), { replace: true });
      } catch (error) {
        if (!isCurrent()) return;
        if (error.outcomeUnknown) throw error;
        const errors = { DUPLICATE_RESERVATION: 'duplicate', INSUFFICIENT_LENGTH: 'insufficient', SCRAP_ALREADY_RESERVED: 'reserved', FABRIC_NOT_AVAILABLE: 'unavailable', TOKEN_EXPIRED: 'expired', NOT_FOUND: 'unavailable' };
        if (!errors[error.code]) throw error;
        await ctx.refresh();
        if (!isCurrent()) return;
        ctx.navigate(keepList(ctx, `/buyer/errors/${errors[error.code]}?fabric_id=${encodeURIComponent(fabric.id)}`));
      }
    });
  };
  return <Page node={fabricNode(fabric, 1)}><PageHeading title="픽업 요청하기" description="원단과 방문 정보를 확인한 뒤 판매자에게 요청을 보내세요." />{recommendation && <section className="panel buyer-page"><h2 className="buyer-panel-heading">선택한 도안: {recommendation.pattern_name}</h2><Notice>등록 정보 기준으로 조건에 적합한 도안입니다. 실물 촉감·수축·결 방향은 제작 전 확인해 주세요.{roll && ` 이 도안에는 ${recommendation.yards}마(${recommendation.purchase_length_cm}cm) 이상 필요해요.`}</Notice><div className="actions"><LinkButton path={patternDetailPath(ctx, recommendation.pattern_id, fabric.id)}>도안과 제작 조건 다시 확인</LinkButton><LinkButton path={pickupPath(ctx, fabric)}>도안 연결 없이 일반 픽업 요청</LinkButton></div></section>}<form className="buyer-page" data-buyer-pickup="" data-fabric-id={fabric.id} onSubmit={submit}><section className="panel"><h2 className="buyer-panel-heading">구매 요청 정보</h2><div className="buyer-pickup-product"><Picture fabric={fabric} /><div><h2>{fabric.title}</h2><Info rows={[[ '원단 치수', dimensions(fabric)], ['판매처', fabric.store_name], ['픽업 장소', storeAddress(store) || '판매자에게 방문 주소를 확인해 주세요.']]} />{roll ? <><div className="buyer-quantity-row field"><label htmlFor="buyer-request-ma">요청 수량 (1마=90cm)</label><input id="buyer-request-ma" name="requested_ma" type="number" min={recommendation?.yards || 1} max={maxMa} step="1" value={values.requested_ma} onChange={change} required inputMode="numeric" aria-describedby="buyer-quantity-hint" /><span id="buyer-quantity-hint" className="buyer-small">{recommendation?.yards ? `도안 기준 최소 ${recommendation.yards}마 · ` : ""}최대 {maxMa}마 · 1마 단위</span></div>{Number(values.requested_ma) > maxMa && <Notice tone="warning">구매 가능한 길이가 바뀌었어요. 희망 일정과 요청 사항은 유지했으니 수량을 다시 선택해 주세요.</Notice>}</> : <p>요청 수량: 표시된 자투리 한 장 전체</p>}<p>요청 금액 <strong className="buyer-price" data-buyer-estimate="" aria-live="polite">{price(roll ? Number(values.requested_ma) * fabric.price : fabric.price)}</strong></p></div></div><div className="buyer-pickup-fields"><Field label="희망 픽업 날짜" name="pickup_date" type="date" required value={values.pickup_date} min={ctx.mode === 'live' ? validDateKst(0) : validDate(0)} onChange={change} /><Field label={ctx.mode === 'live' ? "희망 픽업 시간 (한국 시간)" : "희망 픽업 시간"} name="pickup_time" type="time" required value={values.pickup_time} onChange={change} /></div><section className="buyer-visit-guide" aria-labelledby="buyer-visit-guide-title"><h3 id="buyer-visit-guide-title">방문 안내</h3><Info rows={[['휴무일', store?.closed_days || '등록된 휴무 안내 없음'], ['운영 안내', store?.pickup_guide || '방문 가능 시간을 판매자에게 확인해 주세요.']]} /><Notice tone="warning">선택한 일정은 희망 일정입니다. 판매자가 수락한 뒤 방문해 주세요.</Notice></section></section><section className="panel"><h2 className="buyer-panel-heading">계정 정보 확인</h2><div className="buyer-readonly"><dl><dt>닉네임 (계정)</dt><dd>{ctx.state.buyer.nickname}</dd></dl><dl><dt>전화번호 (선택 정보)</dt><dd>{ctx.state.buyer.phone_number || '등록된 전화번호 없음'}</dd></dl></div><div className="field"><label htmlFor="buyer-memo">요청 사항</label><textarea id="buyer-memo" name="memo" maxLength="500" rows="2" placeholder="방문 전 확인할 내용이 있다면 적어주세요." aria-describedby="buyer-memo-hint" value={values.memo} onChange={change} /><span id="buyer-memo-hint" className="buyer-small buyer-muted">최대 500자</span></div><Notice>계정정보는 확인용이며 예약 연락처로 따로 저장되지 않습니다.</Notice></section><FormError message={submission.error} /><UnknownReservationOutcome failure={submission.failure} /><div className="actions"><LinkButton path={detailPath(ctx, fabric)}>원단 상세로 돌아가기</LinkButton><Button type="submit" tone="primary" disabled={submission.busy || submission.failure?.outcomeUnknown || (roll && maxMa < 1)}>{submission.busy ? '요청 보내는 중…' : '픽업 요청 보내기'}</Button></div></form></Page>;
}

function ReservationTabs({ ctx, status, subset }) {
  return <nav className="tabs" aria-label="픽업 예약 상태">{['REQUESTED', 'ACCEPTED', 'PICKED_UP', 'REJECTED', 'CANCELED'].map(key => <a key={key} className={`button${key === status ? ' is-active' : ''}`} href={`#/buyer/reservations?status=${key}${exampleQuery(ctx)}${subset && ['REQUESTED', 'CANCELED'].includes(key) ? `&subset=${subset}` : ''}`} aria-current={key === status ? 'page' : undefined}>{subset && key === 'REJECTED' ? '거절됨' : STATUS[key]}</a>)}</nav>;
}
function ReservationActions({ item }) {
  const primary = reservationPrimaryAction(item);
  if (item.status === 'REQUESTED') return <><LinkButton path={reservationPath(item)}>상세 보기</LinkButton><LinkButton path={reservationPath(item, '/cancel')} tone="danger">예약 취소</LinkButton></>;
  if (item.status === 'ACCEPTED') return <><LinkButton path={primary.path} tone="primary">{primary.label}</LinkButton><LinkButton path={reservationPath(item, '/cancel')} tone="danger">예약 취소</LinkButton></>;
  if (item.status === 'PICKED_UP') return <>{item.source === 'api' && <LinkButton path={reservationPath(item)}>상세 보기</LinkButton>}<LinkButton path="/buyer/fabrics">다른 원단 둘러보기</LinkButton></>;
  return <>{item.source === 'api' && <LinkButton path={reservationPath(item)}>상세 보기</LinkButton>}<LinkButton path={`/buyer/pickup/${encodeURIComponent(item.fabric_id)}`} tone="primary">다시 요청하기</LinkButton>{item.status === 'REJECTED' && <LinkButton path="/buyer/fabrics">다른 원단 찾기</LinkButton>}</>;
}
function ReservationCard({ ctx, item }) {
  const fabric = reservationPreviewFabric(item, ctx.state);
  const title = item.fabric_title || fabric?.title || '원단';
  const summary = `${reservationQuantity(item)} · ${reservationPriceText(item)} · ${item.status === 'ACCEPTED' ? '수락된 픽업' : '희망 픽업'} ${dateText(item.pickup_date)} ${item.pickup_time}`;
  const description = item.status === 'ACCEPTED' ? `${item.sale_type === 'ROLL' ? `${quantityText(item.requested_length_cm)} 확보` : '원단 한 장 예약 중'} · 판매자가 수락했어요. 방문 후 원단을 수령해 주세요.`
    : item.status === 'PICKED_UP' ? item.sale_type === 'ROLL' ? '수령한 길이가 실물 재고에서 차감되었어요.' : '자투리 원단의 거래가 완료되었어요.'
    : item.status === 'REJECTED' ? item.rejection_reason || item.reject_reason || STATUS_DESCRIPTION.REJECTED
    : item.status === 'CANCELED' ? '다시 예약하려면 현재 재고와 구매 가능한 길이를 확인해 주세요.' : STATUS_DESCRIPTION.REQUESTED;
  if (item.status !== 'REQUESTED') return <article className="panel buyer-compact-card"><Badge tone={statusTone(item.status)}>{STATUS[item.status]}</Badge><h3>{title}</h3>{item.source === 'api' && <p className="buyer-muted">{item.store_name}</p>}<p className="buyer-muted">{summary}</p><p>{description}</p>{item.status === 'ACCEPTED' && item.store?.address && <Info rows={[[ '픽업 주소', item.store.address], ...(item.store.pickup_guide ? [['방문 안내', item.store.pickup_guide]] : [])]} />}<div className="actions"><ReservationActions item={item} /></div></article>;
  const sizing = item.source === 'api' ? reservationQuantity(item) : item.sale_type === 'ROLL' ? `폭 ${fabric?.width_cm || '—'}cm · 요청 ${quantityText(item.requested_length_cm)}` : fabric ? dimensions(fabric) : '자투리 한 장 전체';
  return <article className="buyer-reservation"><Picture fabric={fabric || { title, texture: 'canvas' }} /><div className="buyer-reservation-info"><h3>{title}</h3>{item.source === 'api' && <p className="buyer-muted">{item.store_name}</p>}<p className="buyer-muted">{sizing}</p><p>픽업 희망 {dateText(item.pickup_date)} · {item.pickup_time}</p><strong>{reservationPriceText(item)}</strong>{item.memo && <details><summary>요청 사항 보기</summary><p className="buyer-message">{item.memo}</p></details>}</div><div className="buyer-reservation-actions"><Badge tone="amber">{STATUS[item.status]}</Badge><p className="buyer-small buyer-muted">{description}</p><ReservationActions item={item} /></div></article>;
}
function Reservations({ ctx }) {
  const requestedStatus = ctx.query.get('status') || 'REQUESTED';
  const status = Object.hasOwn(STATUS, requestedStatus) ? requestedStatus : 'REQUESTED';
  const examples = isExample(ctx); const subset = ctx.query.get('subset');
  if (examples && ['canvas', 'stripe', 'empty'].includes(subset) && ['REQUESTED', 'CANCELED'].includes(status)) return <ReservationSubset ctx={ctx} status={status} subset={subset} />;
  const live = ctx.mode === 'live', resource = ctx.reservationResource, page = resource?.data;
  const ready = !resource?.loading && !resource?.error;
  const reservations = live ? ctx.state.reservations : examples ? ['demo-roll', ...(status === 'REJECTED' ? [] : ['demo-scrap'])].map(id => exampleReservation(ctx, id)).filter(Boolean) : ctx.state.reservations.filter(item => item.status === status);
  const outsidePage = live && page?.page > 0 && !reservations.length && page?.totalElements > 0;
  const nodes = { REQUESTED: '123:1806', ACCEPTED: '127:4648', PICKED_UP: '127:4860', REJECTED: '127:4960', CANCELED: '127:5025' };
  return <Page node={nodes[status]}><PageHeading title="픽업 예약 내역" description={live ? '진행 상태와 한국 시간 기준 픽업 일정을 확인하세요.' : '요청한 원단과 픽업 진행 상태를 확인하세요.'} />{examples && <ExampleNotice />}<ReservationTabs ctx={ctx} status={status} />
    {live && ready && <div className="buyer-list-status"><p className="buyer-result-count" aria-live="polite">{STATUS[status]} {page?.totalElements ?? 0}건</p><Button onClick={resource.retry}>최신 내역 확인</Button></div>}
    {status === 'CANCELED' && reservations.length > 0 && <Notice>취소된 예약 내역입니다. 수락된 예약을 취소하면 확보된 원단은 다시 판매할 수 있어요.</Notice>}
    <div className="buyer-results" aria-busy={resource?.loading || undefined}>{!ready ? <ReservationReadFeedback resource={resource} /> : reservations.length ? reservations.map(item => <ReservationCard key={item.id} ctx={ctx} item={live ? { ...item, list_return: reservationListReturn(ctx) } : item} />) : outsidePage ? <EmptyState title="이 페이지에는 예약이 없어요" description="예약 상태가 바뀌었을 수 있어요. 첫 페이지에서 확인해 주세요."><LinkButton path={reservationListPagePath(ctx, 0)} tone="primary">첫 페이지로</LinkButton></EmptyState> : <EmptyState title={`${STATUS[status]} 내역이 없어요`} description="필요한 원단을 찾아 픽업을 요청해 보세요."><LinkButton path="/buyer/fabrics" tone="primary">원단 둘러보기</LinkButton></EmptyState>}</div>
    {ready && live && page?.totalPages > 1 && !outsidePage && <nav className="buyer-pagination" aria-label="예약 내역 페이지"><LinkButton path={reservationListPagePath(ctx, page.page - 1)} disabled={page.page <= 0}>이전 페이지</LinkButton><p aria-live="polite">{page.page + 1} / {page.totalPages} 페이지</p><LinkButton path={reservationListPagePath(ctx, page.page + 1)} disabled={page.page + 1 >= page.totalPages}>다음 페이지</LinkButton></nav>}
    <Notice>{status === 'ACCEPTED' ? '원단을 받은 뒤 판매자의 수령 확인이 완료되면 수령 완료 상태로 바뀝니다.' : '판매자가 요청을 처리하면 이곳에서 변경된 상태를 확인할 수 있어요.'}</Notice></Page>;
}

function ReservationSubset({ ctx, status, subset }) {
  const canceled = status === 'CANCELED';
  const nodes = canceled ? { canvas: '154:7566', stripe: '154:7639', empty: '154:7712' } : { canvas: '154:7368', stripe: '154:7452', empty: '154:7522' };
  const item = subset === 'empty' ? null : exampleReservation(ctx, subset === 'canvas' ? 'demo-roll' : 'demo-scrap');
  const fabric = item && ctx.state.fabrics.find(f => f.id === item.fabric_id);
  const meta = item ? `${item.sale_type === 'ROLL' ? `요청 ${item.requested_length_cm / 90}마` : `${fabric.width_cm}×${fabric.length_cm}cm 1장`} · ${price(item.display_price)}${canceled ? '' : ` · ${dateText(item.pickup_date)} ${item.pickup_time}`}` : '';
  return <Page node={nodes[subset]}><div className="buyer-reservation-summary"><PageHeading title="픽업 예약 내역" description={`${canceled ? '취소한 예약을 확인하세요.' : '판매자의 확인을 기다리는 요청입니다.'} · 화면 확인용 예시`} /><ReservationTabs ctx={ctx} status={status} subset={subset} />{item ? <>{canceled && <Notice>선택한 요청의 취소가 완료되었어요. 다른 요청은 그대로 유지됩니다.</Notice>}<article className="panel buyer-compact-card"><Badge tone={canceled ? 'gray' : 'amber'}>{canceled ? '취소됨' : '요청됨'}</Badge><h2>{item.fabric_title}</h2><p className="buyer-muted">{meta}</p><p>{canceled ? '취소 처리된 요청입니다. 재예약 시 현재 재고를 다시 확인해요.' : '판매자가 재고와 방문 일정을 확인하고 있어요.'}</p><div className="actions">{canceled ? <LinkButton path={`/buyer/pickup/${encodeURIComponent(item.fabric_id)}`}>다시 요청하기</LinkButton> : <><LinkButton path={reservationPath(item)} tone="primary">상세보기</LinkButton><LinkButton path={reservationPath(item, '/cancel')} tone="danger">취소</LinkButton></>}</div></article></> : <><Notice>{canceled ? '취소한 예약이 없습니다.' : '확인을 기다리는 요청이 없습니다.'}</Notice><div className="actions"><LinkButton path="/buyer/fabrics" tone="primary">원단 둘러보기</LinkButton></div></>}</div></Page>;
}

function ReservationDetail({ ctx }) {
  const item = selectedReservation(ctx);
  if (!item) return <Page node="127:4434"><EmptyState title="예약을 찾을 수 없어요" description="예약 목록에서 다시 선택해 주세요."><LinkButton path="/buyer/reservations" tone="primary">예약 목록으로</LinkButton></EmptyState></Page>;
  const fabric = reservationPreviewFabric(item, ctx.state);
  if (ctx.path.endsWith('/cancel')) return <ReservationCancel ctx={ctx} item={item} fabric={fabric} />;
  const canCancel = ['REQUESTED', 'ACCEPTED'].includes(item.status);
  const store = item.source === 'api' ? item.store : currentPickupStore(ctx.state, fabric);
  const stock = item.status === 'REQUESTED' ? '아직 확보되지 않음' : item.status === 'ACCEPTED' ? '판매자가 요청 수량을 확보함' : item.status === 'PICKED_UP' ? '수령 완료' : '이 예약으로 확보된 원단 없음';
  return <Page node={item.sale_type === 'ROLL' ? '127:4434' : '127:4541'}><PageHeading title="픽업 요청 상세" description={item.fabric_title || fabric?.title || '원단'} />{item.example && <ExampleNotice />}<Notice tone={item.status === 'REQUESTED' ? 'warning' : 'info'}>{`${STATUS[item.status]} · ${STATUS_DESCRIPTION[item.status]}`}</Notice><section className="panel"><h2 className="buyer-panel-heading">예약 정보</h2><ReservationDetails item={item} fabric={fabric} /><Info rows={[[ '재고', stock], ...(item.source === 'api' && item.canceled_by ? [['취소한 사람', item.canceled_by === 'BUYER' ? '구매자' : '판매자']] : []), ...(item.pattern_name ? [['참고 도안', item.pattern_name]] : [])]} />{item.memo && <p className="buyer-message">요청 사항: {item.memo}</p>}{item.status === 'REJECTED' && <Notice tone="error">{item.rejection_reason || item.reject_reason || STATUS_DESCRIPTION.REJECTED}</Notice>}</section><section className="panel"><h2 className="buyer-panel-heading">픽업 방문 정보</h2><Info rows={[[ '판매처', item.store_name || fabric?.store_name || '판매처 정보 확인 필요'], ['현재 픽업 주소', storeAddress(store) || '판매자에게 방문 주소를 확인해 주세요.'], [item.status === 'ACCEPTED' ? '수락된 픽업 일정' : '희망 픽업 일정', `${dateText(item.pickup_date)} · ${item.pickup_time}${item.source === 'api' ? ' (한국 시간)' : ''}`], ['휴무일', store?.closed_days || '등록된 휴무 안내 없음'], ['방문 안내', store?.pickup_guide || '방문 전 판매자에게 일정을 확인해 주세요.']]} /><p className="buyer-small buyer-muted">주소와 운영 안내는 현재 매장 정보입니다. 예약 당시 정보와 다를 수 있어요.</p>{fabric?.status === 'POSTED' ? <div className="actions"><LinkButton path={fabricRoute(fabric.id)}>원단 상세 보기</LinkButton><LinkButton path={ctx.mode === 'live' ? inquiryFlowPath(ctx, fabric.id, { compose: 1 }) : `/buyer/inquiries?fabric_id=${encodeURIComponent(fabric.id)}&compose=1`}>판매자 문의</LinkButton></div> : <Notice>{item.source === 'api' ? '판매가 종료되었거나 원단 정보가 변경되면 원단 상세를 열지 못할 수 있어요. 예약 정보는 이 화면에서 확인할 수 있습니다.' : '현재 원단이 공개되어 있지 않아 원단 상세와 새 문의를 열 수 없어요.'}</Notice>}</section><div className="actions">{canCancel ? <LinkButton path={reservationPath(item, '/cancel')} tone="danger">{item.status === 'REQUESTED' ? '예약 요청 취소' : '예약 취소'}</LinkButton> : <LinkButton path={fabricRoute(item.fabric_id)}>원단 상태 확인</LinkButton>}{ctx.reservationResource && <Button onClick={ctx.reservationResource.retry}>현재 상태 다시 확인</Button>}<LinkButton path={item.list_return || `/buyer/reservations?status=${item.status}${item.example ? '&example=1' : ''}`}>예약 목록으로</LinkButton></div></Page>;
}
function ReservationCancel({ ctx, item, fabric }) {
  const submission = useReservationMutation(ctx);
  const canCancel = ['REQUESTED', 'ACCEPTED'].includes(item.status);
  const changed = submission.failure?.code === 'INVALID_STATUS';
  const node = item.status === 'ACCEPTED' ? item.sale_type === 'ROLL' ? '127:4756' : '127:4808' : item.sale_type === 'ROLL' ? '127:4492' : '127:4599';
  const submit = event => {
    event.preventDefault(); if (!canCancel || changed || submission.failure?.outcomeUnknown) return;
    if (item.example) { const subset = ctx.query.get('subset'); ctx.navigate(`/buyer/reservations?status=CANCELED&example=1${['canvas', 'stripe'].includes(subset) ? `&subset=${subset}` : ''}`); return; }
    submission.run(async ({ signal, isCurrent }) => {
      await ctx.api.cancelReservation(item.id, { signal });
      if (!isCurrent()) return;
      await ctx.refresh();
      if (!isCurrent()) return;
      ctx.notify('예약이 취소되었습니다.');
      ctx.navigate('/buyer/reservations?status=CANCELED', { replace: true });
    });
  };
  return <Page node={node}><PageHeading title={!canCancel ? '현재 상태에서는 취소할 수 없어요' : item.status === 'ACCEPTED' ? '확정된 예약을 취소할까요?' : '예약 요청을 취소할까요?'} description="취소 전에 원단과 예약 정보를 확인해 주세요." />{item.example && <ExampleNotice />}<section className="panel"><h2 className="buyer-panel-heading">취소할 예약</h2><ReservationDetails item={item} fabric={fabric} /><>{item.source === 'api' && <Badge tone={statusTone(item.status)}>{STATUS[item.status]}</Badge>}</></section><Notice tone="warning">{!canCancel ? STATUS_DESCRIPTION[item.status] : item.status === 'ACCEPTED' ? '취소하면 확보된 원단이 다시 판매 가능 상태로 돌아갑니다. 필요한 경우 새로 요청해 주세요.' : '취소한 요청은 되돌릴 수 없습니다. 필요한 경우 다시 요청해 주세요.'}</Notice><form data-buyer-cancel-page="" data-reservation-id={item.id} data-example={Boolean(item.example)} onSubmit={submit}><FormError message={submission.error} /><UnknownReservationOutcome failure={submission.failure} item={item} />{changed && <Notice tone="warning">예약 상태가 바뀌었어요. 이미 취소되었거나 수령이 완료되었을 수 있으니 현재 상태를 먼저 확인해 주세요.<div className="actions"><LinkButton path={reservationPath(item)} tone="primary">현재 예약 상태 확인</LinkButton></div></Notice>}<div className="actions"><LinkButton path={reservationPath(item)}>{canCancel && !changed && !submission.failure?.outcomeUnknown ? '예약 유지' : '예약 상세로'}</LinkButton><Button type="submit" tone="danger" disabled={!canCancel || submission.busy || changed || submission.failure?.outcomeUnknown}>{submission.busy ? '취소 처리 중…' : item.example ? '예시 취소 결과 보기' : '예약 취소하기'}</Button></div></form></Page>;
}

function Profile({ ctx }) {
  const profile = ctx.state.buyer;
  if (ctx.query.get('state') === 'SAVED') return <Page node="127:5587"><div className="buyer-state-screen"><PageHeading title="회원 정보를 저장했어요" description="변경한 닉네임과 연락처가 반영되었습니다." />{isExample(ctx) && <ExampleNotice />}<Notice tone="success">저장 완료</Notice><div className="actions"><LinkButton path="/buyer/profile" tone="primary">마이페이지로</LinkButton></div></div></Page>;
  if (ctx.query.get('edit') === '1') return <ProfileForm ctx={ctx} />;
  return <Page node="123:1964"><PageHeading title="마이페이지" description="내 정보와 이용 내역을 한곳에서 관리하세요." /><section className="panel"><h2 className="buyer-panel-heading">회원 정보</h2><div className="buyer-profile-title"><h3>로그인 정보</h3><LinkButton path="/buyer/profile?edit=1">정보 수정</LinkButton></div><Info rows={[[ '로그인 이메일', profile.email], ['연락처', profile.phone_number || '등록된 전화번호 없음'], ['닉네임', profile.nickname]]} /></section><div className="buyer-two-columns"><section className="panel"><h3>구매 내역</h3><p className="buyer-muted">요청한 원단과 픽업 예약을 확인하세요.</p><div><LinkButton path="/buyer/reservations">구매 내역 바로 가기 →</LinkButton></div></section><section className="panel"><h3>문의 내역</h3><p className="buyer-muted">남긴 질문과 판매자의 답변을 확인하세요.</p><div><LinkButton path="/buyer/inquiries">문의 내역 바로 가기 →</LinkButton></div></section></div><div className="actions"><Button data-logout="BUYER" onClick={() => ctx.logout('BUYER')}>로그아웃</Button></div></Page>;
}
function ProfileForm({ ctx }) {
  const [values, setValues] = useState(() => ({ nickname: ctx.state.buyer.nickname, phone_number: ctx.state.buyer.phone_number || '' }));
  const submission = useSubmission();
  const change = event => setValues(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const submit = event => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const nickname = values.nickname.trim();
    if (!nickname) return submission.setError('닉네임을 입력해 주세요.');
    submission.run(async () => { await ctx.api.updateProfile({ nickname, phone_number: values.phone_number.trim() || null }); await ctx.refresh(); ctx.notify('회원 정보가 수정되었습니다.'); ctx.navigate('/buyer/profile?state=SAVED'); });
  };
  return <Page node="127:5385"><PageHeading title="회원 정보 수정" description="닉네임과 연락처를 수정할 수 있어요. 저장한 후 적용됩니다." /><form className="panel buyer-profile-form" data-buyer-profile="" onSubmit={submit}><h2 className="buyer-panel-heading">기본 정보</h2><Field label="로그인 이메일" name="email" value={ctx.state.buyer.email} readOnly hint="로그인 이메일은 변경할 수 없습니다." /><Field label="닉네임" name="nickname" value={values.nickname} onChange={change} required minLength="1" maxLength="50" autoComplete="nickname" /><Field label="전화번호 (선택)" name="phone_number" value={values.phone_number} onChange={change} type="tel" maxLength="20" autoComplete="tel" /><FormError message={submission.error} /><div className="actions"><Button type="submit" tone="primary" disabled={submission.busy}>저장하기</Button><LinkButton path="/buyer/profile">취소</LinkButton></div></form></Page>;
}

function Inquiries({ ctx }) {
  const fabric = ctx.state.fabrics.find(item => item.id === ctx.query.get('fabric_id'));
  if (ctx.query.get('state') === 'DONE') return <Page node="127:5261"><div className="buyer-state-screen"><PageHeading title="문의를 등록했어요" description="판매자의 답변을 기다려 주세요." />{isExample(ctx) && <ExampleNotice />}<Notice tone="success">답변 대기 · 등록한 문의의 답변은 내 문의에서 확인할 수 있어요.</Notice><div className="actions"><LinkButton path="/buyer/inquiries?status=WAITING" tone="primary">내 문의 확인</LinkButton><LinkButton path="/buyer/fabrics">원단 둘러보기</LinkButton></div></div></Page>;
  if (ctx.query.get('compose') === '1') return !fabric || fabric.status !== 'POSTED' ? <MissingFabric /> : <InquiryForm ctx={ctx} fabric={fabric} />;
  const status = ctx.query.get('status') === 'WAITING' ? 'WAITING' : 'ANSWERED';
  const inquiries = isExample(ctx) ? ['fabric-roll-1', 'fabric-scrap-1'].map((id, index) => ({ id: `demo-inquiry-${index}`, fabric_id: id, fabric_title: ctx.state.fabrics.find(f => f.id === id)?.title, content: '작은 파우치를 만들려고 합니다. 원단에 신축성이 있나요?', answer: status === 'ANSWERED' ? '신축성이 거의 없는 원단입니다. 방문하시면 촉감과 두께를 직접 확인할 수 있어요.' : null, created_at: validDate(-1) })) : ctx.state.inquiries.filter(item => status === 'WAITING' ? !item.answer : Boolean(item.answer));
  return <Page node={status === 'WAITING' ? '127:5299' : '123:2068'}><PageHeading title="문의 내역" description="원단에 대해 남긴 질문과 판매자의 답변을 확인하세요." />{isExample(ctx) && <ExampleNotice />}<nav className="tabs" aria-label="문의 답변 상태">{[['WAITING', '답변 대기'], ['ANSWERED', '답변 완료']].map(([value, label]) => <a key={value} className={`button${value === status ? ' is-active' : ''}`} href={`#/buyer/inquiries?status=${value}${exampleQuery(ctx)}`} aria-current={value === status ? 'page' : undefined}>{label}</a>)}</nav>{inquiries.length ? inquiries.map(item => {
    const itemFabric = ctx.state.fabrics.find(f => f.id === item.fabric_id);
    if (status === 'WAITING') return <article key={item.id} className="panel buyer-compact-card"><Badge tone="amber">답변 대기</Badge><h3>{item.fabric_title || itemFabric?.title || '원단'}</h3><p className="buyer-muted">{itemFabric?.store_name || '판매자'} · {dateText(String(item.created_at).slice(0, 10))}</p><p className="buyer-message">{item.content}</p><div>{itemFabric?.status === 'POSTED' ? <LinkButton path={fabricRoute(item.fabric_id)}>원단 상세 보기</LinkButton> : <Notice>현재 공개된 원단이 아니어서 상세를 열 수 없어요.</Notice>}</div></article>;
    return <article key={item.id} className="buyer-inquiry-item"><div className="buyer-inquiry-header"><Picture fabric={itemFabric || { texture: 'canvas' }} /><div><h3>{item.fabric_title || itemFabric?.title || '원단'}</h3><p className="buyer-muted">{itemFabric ? `${itemFabric.store_name} · ${dimensions(itemFabric)}` : ''}</p><Badge tone={item.answer ? 'green' : 'amber'}>{item.answer ? '답변 완료' : '답변 대기'}</Badge><p className="buyer-small buyer-muted">{dateText(String(item.created_at).slice(0, 10))}</p></div></div><section className="panel"><h3>문의 내용</h3><p className="buyer-small buyer-muted">{dateText(String(item.created_at).slice(0, 10))} · {ctx.state.buyer.nickname}</p><p className="buyer-message">{item.content}</p></section>{item.answer ? <section className="panel"><h3>판매자 답변</h3><p className="buyer-small buyer-muted">{itemFabric?.store_name || '판매자'}</p><p className="buyer-message">{item.answer}</p></section> : <Notice>판매자의 답변을 기다리고 있어요.</Notice>}<div>{itemFabric?.status === 'POSTED' ? <LinkButton path={fabricRoute(item.fabric_id)} tone="primary">원단 상세 보기</LinkButton> : <Notice>현재 공개된 원단이 아니어서 상세를 열 수 없어요.</Notice>}</div></article>;
  }) : <EmptyState title={status === 'WAITING' ? '답변을 기다리는 문의가 없어요' : '답변이 완료된 문의가 없어요'} description="원단 상세에서 판매자에게 궁금한 점을 남길 수 있어요."><LinkButton path="/buyer/fabrics">원단 둘러보기</LinkButton></EmptyState>}</Page>;
}
function InquiryForm({ ctx, fabric }) {
  const key = draftKey('inquiry', fabric.id);
  const [content, setContent] = useState(() => ctx.drafts?.get(key)?.content || '');
  const submission = useSubmission();
  const submit = event => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    if (!content.trim()) return submission.setError('문의 내용을 입력해 주세요.');
    submission.run(async () => { await ctx.api.createInquiry({ fabric_id: fabric.id, content: content.trim(), is_private: false }); ctx.drafts?.delete(key); await ctx.refresh(); ctx.notify('문의가 등록되었습니다.'); ctx.navigate('/buyer/inquiries?state=DONE', { replace: true }); });
  };
  return <Page node={fabric.id === 'fabric-scrap-1' ? '127:5197' : '127:5133'}><PageHeading title="판매자 문의" description={`${fabric.title}에 대해 궁금한 점을 남겨주세요.`} /><section className="panel"><h2 className="buyer-panel-heading">문의 대상</h2><Info rows={[[ '원단', fabric.title], ['판매처', fabric.store_name]]} /></section>{ctx.mode === 'live' && <Notice>문의 등록은 아직 연결되지 않았어요. 작성한 내용은 판매자에게 전송되지 않습니다.</Notice>}<form className="panel buyer-inquiry-form" data-buyer-inquiry="" data-fabric-id={fabric.id} onSubmit={submit}><h2 className="buyer-panel-heading">공개 문의 작성</h2><Notice id="buyer-inquiry-public" tone="warning"><strong>다른 사용자도 읽을 수 있는 공개 문의입니다.</strong> 개인 연락처나 주소는 적지 마세요.</Notice><div className="field"><label htmlFor="buyer-inquiry-content">문의 내용 (1~1,000자)</label><textarea id="buyer-inquiry-content" name="content" rows="4" minLength="1" maxLength="1000" required placeholder="원단에 대해 궁금한 내용을 적어주세요." aria-describedby="buyer-inquiry-public buyer-inquiry-count" value={content} onChange={event => { setContent(event.target.value); ctx.drafts?.set(key, { content: event.target.value }); }} /><span id="buyer-inquiry-count" className="buyer-small buyer-muted" data-buyer-inquiry-count="">{content.length} / 1,000자</span></div><FormError message={submission.error} /><div className="actions"><Button type="submit" tone="primary" disabled={submission.busy}>문의 등록</Button><LinkButton path={detailPath(ctx, fabric)} data-buyer-discard-inquiry={fabric.id} onClick={() => ctx.drafts?.delete(key)}>작성 취소</LinkButton></div></form></Page>;
}

function Recommendations({ ctx }) {
  const original = ctx.state.fabrics.find(f => f.id === routeId(ctx) && (f.source === 'api' || f.status === 'POSTED'));
  const example = isExample(ctx) && ctx.query.get('state') === 'NEEDS_CHECK';
  const fabric = original && example ? { ...original, material: '모름' } : original;
  if (!fabric) return <MissingFabric />;
  const requiredWidth = 35; const requiredLength = 100; const purchaseLength = Math.ceil(requiredLength / 90) * 90;
  const available = fabric.sale_type === 'ROLL' ? fabric.available_length_cm : fabric.length_cm;
  const materialUnknown = ['모름', '미확인', 'UNKNOWN', ''].includes(fabric.material || '');
  const supported = fabric.width_cm >= requiredWidth && available >= (fabric.sale_type === 'ROLL' ? purchaseLength : requiredLength) && ['중간 두께', '보통', '중간'].includes(fabric.thickness) && (['면', '혼방'].includes(fabric.material) || materialUnknown);
  if (!supported) return <Page node="127:4377"><PageHeading title="추천할 수 있는 도안이 없어요" description={`${fabric.title}의 입력 정보와 등록 도안 조건을 비교했어요.`} />{ctx.mode === 'live' && <Notice>예시 도안과 화면에서 비교한 참고 결과입니다. 추천 서비스는 아직 연결되지 않았어요.</Notice>}<section className="panel"><h2 className="buyer-panel-heading">추천 결과</h2><Info rows={[[ '원단', `${fabric.title} · ${dimensions(fabric)}`], ['소재 / 두께', `${fabric.material} / ${fabric.thickness}`], ['안내', '현재 확인할 수 있는 추천 도안이 없습니다.'], ['판정', '추천 결과 없음']]} /></section><Notice tone="warning">현재 정보로 추천 결과를 찾지 못했어요. 다른 원단을 찾아보거나 판매자에게 소재를 확인해 보세요.</Notice><div className="actions"><LinkButton path={keepList(ctx, `/buyer/inquiries?fabric_id=${encodeURIComponent(fabric.id)}&compose=1`)} tone="primary">판매자에게 물어보기</LinkButton><LinkButton path={detailPath(ctx, fabric)}>원단 상세로 돌아가기</LinkButton><LinkButton path="/buyer/fabrics">다른 원단 찾기</LinkButton></div></Page>;
  return <Page node={materialUnknown ? '202:8188' : '127:4236'}><PageHeading title={materialUnknown ? '소재 확인이 필요해요' : '지퍼 파우치 제작 조건'} description={`${fabric.title}와 도안의 조건을 비교했어요.`} />{ctx.mode === 'live' && <Notice>예시 도안과 화면에서 비교한 참고 결과입니다. 추천 서비스는 아직 연결되지 않았어요.</Notice>}{example && <Notice>소재 정보가 확인되지 않은 상황의 예시입니다. 원단의 실제 등록 정보는 변경되지 않습니다.</Notice>}<Notice tone={materialUnknown ? 'info' : 'success'}>{materialUnknown ? '소재가 확인되지 않았어요. 판매자에게 먼저 확인해 주세요.' : '적합 · 시연용 고정 도안 기준입니다. 촉감·수축·결 방향은 실물 확인을 권장해요.'}</Notice><section className="panel"><h2 className="buyer-panel-heading">판정 근거</h2><Info rows={[[ '원단 / 도안', `${fabric.title} / 지퍼 파우치`], ['소재 · 두께', `${fabric.material} · ${fabric.thickness} → ${materialUnknown ? '소재 확인 필요' : '도안의 허용 조건 충족'}`], ['필요 폭 / 원단 폭', `${requiredWidth}cm / ${fabric.width_cm}cm → 충족`], ['필요 길이', '겉감·안감 35×25cm 각 2장 → 길이 방향 합 100cm'], ['구매 길이', fabric.sale_type === 'ROLL' ? '100cm를 1마 단위로 올림 → 2마(180cm)' : '표시된 자투리 한 장 전체'], ['예상 금액', fabric.sale_type === 'ROLL' ? `2마 × ${price(fabric.price)} = ${price(fabric.price * 2)}` : price(fabric.price)]]} /></section><div className="actions"><LinkButton path={keepList(ctx, `/buyer/patterns/pouch?fabric_id=${encodeURIComponent(fabric.id)}${example ? '&state=NEEDS_CHECK&example=1' : ''}`)}>재단 치수 확인</LinkButton>{materialUnknown ? <LinkButton path={keepList(ctx, `/buyer/inquiries?fabric_id=${encodeURIComponent(fabric.id)}&compose=1`)} tone="primary">판매자에게 소재 문의</LinkButton> : <LinkButton path={keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}?ma=2`)} tone="primary">{fabric.sale_type === 'ROLL' ? '2마로 픽업 요청' : '픽업 요청'}</LinkButton>}<LinkButton path={detailPath(ctx, fabric)}>원단 상세로</LinkButton></div></Page>;
}
function Pattern({ ctx }) {
  const fabric = ctx.state.fabrics.find(f => f.id === (ctx.query.get('fabric_id') || 'fabric-roll-1') && (f.source === 'api' || f.status === 'POSTED'));
  if (!fabric) return <MissingFabric />;
  const length = fabric.sale_type === 'ROLL' ? fabric.available_length_cm : fabric.length_cm;
  const canRequest = availability(ctx, fabric).canRequest && fabric.width_cm >= 35 && length >= (fabric.sale_type === 'ROLL' ? 180 : 100) && ['면', '혼방'].includes(fabric.material) && ['중간 두께', '보통', '중간'].includes(fabric.thickness) && ctx.query.get('state') !== 'NEEDS_CHECK';
  const recommendation = keepList(ctx, `/buyer/recommendations/${encodeURIComponent(fabric.id)}${isExample(ctx) ? '?example=1&state=NEEDS_CHECK' : ''}`);
  return <Page node="127:4299"><PageHeading title="토트백 도안" description="사이즈를 고르면 아래 재단 그림대로 자릅니다. 실제 크기 출력은 제공하지 않아요." />{ctx.mode === 'live' && <Notice>아래 치수는 예시 도안입니다. 도안 조회 서비스는 아직 연결되지 않았어요.</Notice>}<section className="panel"><MakingSteps parts={[]} images={pouchGuideImages} /></section><section className="panel"><h2 className="buyer-panel-heading">재단 기준</h2><Info rows={[[ '겉감 · 안감', '고른 사이즈의 몸통을 각 1장 자릅니다.'], ['손잡이', '점선을 따라 세 번 접어 만듭니다. 2조.'], ['바닥 곡선', '모서리를 둥글게 잡는 선입니다.'], ['부자재', '손잡이 심과 실은 따로 준비합니다.']]} /></section><Notice>실제 제작 전 원단의 촉감·수축·결 방향을 확인해 주세요.</Notice>{!canRequest && <Notice tone="warning">이 원단은 제작 조건을 먼저 확인해 주세요. 도안의 치수만 보고 적합성을 판단할 수는 없습니다.</Notice>}<div className="actions"><LinkButton path={recommendation}>제작 조건으로 돌아가기</LinkButton>{canRequest ? <LinkButton path={keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}?ma=2`)} tone="primary">{fabric.sale_type === 'ROLL' ? '2마로 픽업 요청' : '픽업 요청'}</LinkButton> : <LinkButton path={keepList(ctx, `/buyer/inquiries?compose=1&fabric_id=${encodeURIComponent(fabric.id)}`)} tone="primary">판매자에게 물어보기</LinkButton>}<LinkButton path={addQuery('/buyer/supplies', 'from', currentRoute(ctx))}>부자재 둘러보기</LinkButton></div></Page>;
}

function Supplies({ ctx }) {
  const headingRef = useRef(null);
  const storeId = routeId(ctx);
  const selected = SUPPLY_STORES.find(store => store.id === (storeId || ctx.query.get('selected') || '1'));
  const from = internalReturn(ctx.query.get('from'), 'pattern');
  const supplyPath = path => addQuery(path, 'from', from);
  const selectionPath = id => supplyPath(`/buyer/supplies?selected=${id}&focus=selected`);
  const backToPattern = from ? <LinkButton path={from}>도안으로 돌아가기</LinkButton> : null;
  useEffect(() => {
    if (storeId || ctx.query.get('focus') !== 'selected') return;
    const frame = requestAnimationFrame(() => { headingRef.current?.focus({ preventScroll: true }); if (window.matchMedia('(max-width: 700px)').matches) headingRef.current?.closest('section')?.scrollIntoView({ block: 'start', behavior: 'instant' }); });
    return () => cancelAnimationFrame(frame);
  }, [storeId, ctx.query]);
  const select = (event, id) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); ctx.navigate(selectionPath(id), { replace: true, preserveScroll: !window.matchMedia('(max-width: 700px)').matches });
  };
  if (!selected) return <Page node="123:1637"><EmptyState title="판매처를 찾을 수 없어요" description="예시 지도에서 판매처를 선택해 주세요."><LinkButton path={supplyPath('/buyer/supplies')} tone="primary">부자재 둘러보기</LinkButton></EmptyState></Page>;
  if (storeId) return <Page node={selected.node}><PageHeading title={selected.name} description="부자재 판매처 상세 · 시연용 예시" /><section className="panel"><h2 className="buyer-panel-heading">선택한 판매처</h2><Info rows={[[ '지도 표시', `${selected.id}번 판매처`], ['취급 품목', selected.items], ['지역', '경기도 양주시'], ['영업 안내', '방문 전 영업 여부 확인']]} /></section><Notice>매장 위치와 연락처는 시연용 데이터입니다. 실제 지도와 길찾기는 매장 정보 확인 후 연결합니다.</Notice><div className="actions"><LinkButton path={selectionPath(selected.id)} tone="primary">전체 지도·목록으로</LinkButton>{backToPattern}</div></Page>;
  return <Page node="123:1637"><PageHeading title="부자재 둘러보기" description="시연용 판매처와 지도를 살펴보세요. 실제 업체 정보는 아직 제공하지 않습니다." /><div className="buyer-supply-layout"><div className="buyer-supply-map" role="group" aria-label="판매처 위치 예시 지도"><div className="buyer-map-river" aria-hidden="true" />{[14.46, 35.12, 55.79, 76.45, 97.1].map(y => <span key={`y-${y}`} className="buyer-map-road buyer-map-road--horizontal" style={{ top: `${y}%` }} aria-hidden="true" />)}{[11.72, 31.25, 50.78, 70.31, 89.84].map(x => <span key={`x-${x}`} className="buyer-map-road buyer-map-road--vertical" style={{ left: `${x}%` }} aria-hidden="true" />)}{SUPPLY_STORES.map(store => <a key={store.id} className={`buyer-map-pin${store.id === selected.id ? ' is-active' : ''}`} style={{ left: `${store.x}%`, top: `${store.y}%` }} href={href(selectionPath(store.id))} data-buyer-select-store="" aria-label={`${store.id}번 ${store.name} 선택`} aria-current={store.id === selected.id ? 'true' : undefined} onClick={event => select(event, store.id)}>{store.id}</a>)}<span className="buyer-map-caption">실제 위치가 아닌 예시 지도</span></div><section className="panel"><h2 className="buyer-panel-heading">판매처 목록 · 예시</h2><ol className="buyer-store-list">{SUPPLY_STORES.map(store => <li key={store.id}><a href={href(selectionPath(store.id))} data-buyer-select-store="" aria-current={store.id === selected.id ? 'true' : undefined} onClick={event => select(event, store.id)}><strong>{store.id}. {store.name}</strong><span className="buyer-muted">{store.short}</span>{store.id === selected.id && <Badge>선택됨</Badge>}</a></li>)}</ol></section></div><section className="panel buyer-selected-store" aria-labelledby="buyer-selected-store-title"><h2 className="buyer-panel-heading">선택한 판매처 · 예시</h2><h2 id="buyer-selected-store-title" tabIndex={-1} ref={headingRef}>{selected.name}</h2><Info rows={[[ '취급 품목', selected.items], ['위치', '경기도 양주시 · 위치 예시'], ['운영 안내', '실제 영업 정보가 아닌 시연용 안내입니다.']]} /><div><LinkButton path={supplyPath(`/buyer/supplies/${selected.id}`)} tone="primary">판매처 안내 보기</LinkButton></div></section>{backToPattern && <div className="actions">{backToPattern}</div>}</Page>;
}

function PickupError({ ctx }) {
  const kind = routeId(ctx);
  const fabricId = ctx.query.get('fabric_id') || (kind === 'reserved' ? 'fabric-scrap-1' : 'fabric-roll-1');
  const detail = keepList(ctx, fabricRoute(fabricId));
  const pickup = keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabricId)}`);
  const existing = ctx.state.reservations.find(item => item.fabric_id === fabricId && ['REQUESTED', 'ACCEPTED'].includes(item.status));
  const errors = {
    insufficient: { node: '202:8252', title: '구매 가능 길이가 바뀌었어요', description: '다른 예약이 먼저 수락되어 요청한 길이를 확보할 수 없어요.', message: '최신 구매 가능 길이를 확인한 후 1마(90cm) 단위로 다시 선택해 주세요.', actions: [['수량 다시 선택', pickup], ['구매 가능량 확인', detail]] },
    reserved: { node: '202:8295', title: '이미 예약 중인 원단이에요', description: '이 자투리에는 판매자가 수락한 예약이 있어요.', message: '현재 추가 요청을 할 수 없습니다. 원단 상태를 확인하거나 다른 자투리를 찾아보세요.', actions: [['원단 상태 확인', detail], ['다른 자투리 보기', '/buyer/fabrics?sale_type=SCRAP']] },
    duplicate: { node: '202:8338', title: '이미 보낸 예약이 있어요', description: '같은 원단에 요청 중이거나 수락된 예약이 있어요.', message: '새 요청은 만들어지지 않았어요. 기존 예약 상태를 확인해 주세요.', tone: 'info', actions: [['기존 예약 보기', existing ? reservationPath(existing) : '/buyer/reservations'], ['원단 둘러보기', '/buyer/fabrics']] },
    unavailable: { node: '202:8381', title: '지금은 요청할 수 없어요', description: '판매가 종료되었거나 공개되지 않은 원단이에요.', message: '다른 원단을 찾아보거나 이미 보낸 예약 내역을 확인해 주세요.', actions: [['다른 원단 찾기', '/buyer/fabrics'], ['예약 내역 보기', '/buyer/reservations']] },
    expired: { node: '202:8424', title: '다시 로그인해 주세요', description: '로그인 유효 시간이 지나 요청을 처리하지 못했어요.', message: '다시 로그인한 후 원단 상태와 예약 내역을 확인해 주세요.', actions: [['다시 로그인', '/auth/buyer/login'], ['원단 둘러보기', '/buyer/fabrics']] },
  };
  const error = errors[kind] || errors.unavailable;
  return <Page node={error.node}><div className="buyer-state-screen"><PageHeading title={error.title} description={error.description} />{isExample(ctx) && <Notice>예약 요청이 처리되지 않은 상황의 화면 예시입니다. 현재 원단 상태는 변경되지 않습니다.</Notice>}<Notice tone={error.tone || 'error'}>{error.message}</Notice><div className="actions">{error.actions.map(([label, path], index) => <LinkButton key={label} path={path} tone={index === 0 ? 'primary' : 'secondary'}>{label}</LinkButton>)}</div></div></Page>;
}

function BuyerScreens({ ctx }) {
  if (ctx.path === '/buyer/home') return <Home ctx={ctx} />;
  if (ctx.path === '/buyer/fabrics' || ctx.path === '/buyer') return <Fabrics ctx={ctx} />;
  if (ctx.path === '/buyer/filters') return <Fabrics ctx={ctx} dedicated />;
  if (ctx.path.startsWith('/buyer/fabrics/')) return <FabricDetail ctx={ctx} />;
  if (ctx.path.startsWith('/buyer/pickup/')) return <Pickup ctx={ctx} />;
  if (ctx.path === '/buyer/reservations') return <Reservations ctx={ctx} />;
  if (ctx.path.startsWith('/buyer/reservations/')) return <ReservationDetail ctx={ctx} />;
  if (ctx.path === '/buyer/profile') return <Profile ctx={ctx} />;
  if (ctx.path === '/buyer/inquiries') return <Inquiries ctx={ctx} />;
  if (ctx.path.startsWith('/buyer/recommendations/')) return <Recommendations ctx={ctx} />;
  if (ctx.path === '/buyer/patterns' || ctx.path === '/buyer/patterns/pouch') return <Pattern ctx={ctx} />;
  if (ctx.path === '/buyer/supplies' || ctx.path.startsWith('/buyer/supplies/')) return <Supplies ctx={ctx} />;
  if (ctx.path.startsWith('/buyer/errors/')) return <PickupError ctx={ctx} />;
  return <Page node="123:855"><EmptyState title="화면을 찾을 수 없어요"><LinkButton path="/buyer/fabrics" tone="primary">원단 둘러보기</LinkButton></EmptyState></Page>;
}
