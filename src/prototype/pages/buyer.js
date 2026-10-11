import { escapeHtml, formatPrice, badge, notice, pageHeading, button, emptyState, fabricImage, field, selectField } from '../shared/ui.js';
import './buyer.css';

// Live Figma 10 · 전체 흐름 · 연결 작업본: 123:855, 123:1201, 123:1493,
// 123:1806, 123:1964, 123:2068, 127:5133, 127:4236 and 202:8188.
// Business state belongs to the shared mock service; only form/view state is local.
const e = escapeHtml;
const STATUS = { REQUESTED: '요청됨', ACCEPTED: '수락됨', PICKED_UP: '수령 완료', CANCELED: '취소', REJECTED: '거절' };
const STATUS_DESCRIPTION = {
  REQUESTED: '판매자가 요청을 확인 중이에요. 아직 원단이 확보되지 않았어요.',
  ACCEPTED: '판매자가 수락했어요. 약속한 시간에 방문해 주세요.',
  PICKED_UP: '원단 수령이 완료되었어요.',
  CANCELED: '예약이 취소되었어요.',
  REJECTED: '판매자가 이 요청을 수락하지 못했어요.',
};
const price = value => formatPrice(Number(value) || 0);
const routeId = ctx => { try { return decodeURIComponent(ctx.path.split('/')[3] || ''); } catch { return ''; } };
const href = path => `#${path}`;
const fabricRoute = id => `/buyer/fabrics/${encodeURIComponent(id)}`;
const quantityText = cm => Number(cm) % 90 === 0 ? `${Number(cm) / 90}마(${Number(cm)}cm)` : `${Number(cm)}cm`;
const dimensions = fabric => fabric.sale_type === 'ROLL'
  ? `폭 ${fabric.width_cm}cm · 구매 가능 ${quantityText(fabric.available_length_cm ?? 0)}`
  : `폭 ${fabric.width_cm}cm × 길이 ${fabric.length_cm}cm`;
const priceText = fabric => `${price(fabric.price)}${fabric.sale_type === 'ROLL' ? ' / 마' : ''}`;
const info = rows => `<dl class="buyer-info">${rows.map(([label, value]) => `<dt>${e(label)}</dt><dd>${e(value ?? '')}</dd>`).join('')}</dl>`;
const picture = (fabric, className = '') => fabricImage(fabric, `buyer-fabric-art ${className}`);
const page = (id, content) => `<div class="buyer-page" data-figma-node="${id}">${content}</div>`;
const linkButton = (label, path, tone = 'secondary') => button(label, { href: href(path), tone });
const missingFabric = () => page('202:8381', emptyState('원단을 찾을 수 없어요', '게시가 종료되었거나 존재하지 않는 원단입니다.', linkButton('원단 목록으로', '/buyer/fabrics', 'primary')));
const dateText = value => String(value || '').replaceAll('-', '.');
const validDate = offset => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const FABRIC_NODES = {
  'fabric-roll-1': ['123:1201', '123:1493', '127:2936'],
  'fabric-scrap-1': ['127:2994', '127:3092', '127:3190'],
  'fabric-gauze': ['127:3248', '127:3339', '127:3437'],
  'fabric-check': ['127:3495', '127:3586', '127:3684'],
  'fabric-denim': ['127:3742', '127:3833', '127:3931'],
  'fabric-scrap-2': ['127:3989', '127:4080', '127:4178'],
};
const fabricNode = (fabric, index) => FABRIC_NODES[fabric.id]?.[index] || ['123:1201', '123:1493', '127:2936'][index];
const statusTone = status => status === 'REQUESTED' ? 'amber' : status === 'REJECTED' ? 'red' : ['CANCELED', 'PICKED_UP'].includes(status) ? 'gray' : 'green';
const exampleNotice = () => notice('화면 확인용 예시입니다. 실제 요청·취소 기록은 변경되지 않습니다.');
const isExample = ctx => ctx.query.get('example') === '1';
const exampleQuery = ctx => isExample(ctx) ? '&example=1' : '';
const reservationPath = (item, suffix = '') => `/buyer/reservations/${encodeURIComponent(item.id)}${suffix}${item.example ? `?status=${item.status}&example=1&fabric_id=${encodeURIComponent(item.fabric_id)}${item.viewSubset ? `&subset=${encodeURIComponent(item.viewSubset)}` : ''}` : ''}`;
const reservationQuantity = item => item.sale_type === 'ROLL' ? quantityText(item.requested_length_cm) : '자투리 한 장 전체';
const draftKey = (kind, id) => `buyer:${kind}:${id}`;
const currentRoute = ctx => `${ctx.path}${ctx.query.size ? `?${ctx.query}` : ''}`;
const addQuery = (path, key, value) => {
  const [base, search = ''] = path.split('?');
  const query = new URLSearchParams(search);
  if (value) query.set(key, value);
  return `${base}${query.size ? `?${query}` : ''}`;
};
function internalReturn(value, kind) {
  if (!value || /[\\#\r\n]/.test(value)) return '';
  const path = value.split('?')[0];
  return (kind === 'pattern' ? ['/buyer/patterns', '/buyer/patterns/pouch'].includes(path) : path === '/buyer/fabrics') ? value : '';
}
const listReturn = ctx => ctx.path === '/buyer/fabrics' ? currentRoute(ctx) : internalReturn(ctx.query.get('return'), 'list');
const keepList = (ctx, path) => addQuery(path, 'return', listReturn(ctx));
const detailPath = (ctx, fabric) => keepList(ctx, fabricRoute(fabric.id));
const pickupPath = (ctx, fabric) => keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}`);
const listPath = (ctx, fabric) => listReturn(ctx) || `/buyer/fabrics?sale_type=${fabric.sale_type}`;
function availability(ctx, fabric) {
  const active = ctx.state.reservations.filter(item => item.fabric_id === fabric.id && ['REQUESTED', 'ACCEPTED'].includes(item.status));
  const own = active.find(item => item.buyer_id === ctx.state.buyer.id);
  const stockAvailable = fabric.sale_type === 'ROLL' ? Number(fabric.available_length_cm) >= 90 : !active.some(item => item.status === 'ACCEPTED');
  return { own, canRequest: stockAvailable && !own, label: own ? '내 예약 진행 중' : stockAvailable ? '거래 가능' : '현재 요청 불가' };
}
function stockRecovery(ctx, fabric, stock) {
  const message = stock.own ? '이미 보낸 요청이 있어요. 기존 예약에서 진행 상태를 확인해 주세요.' : fabric.sale_type === 'ROLL' ? '현재 1마(90cm) 이상 요청할 수 있는 길이가 남아 있지 않아요. 다른 원단을 찾아보세요.' : '판매자가 수락한 예약이 있는 자투리입니다. 다른 원단을 찾아보세요.';
  return `${notice(message, 'warning')}<div class="actions">${stock.own ? linkButton('기존 예약 확인', reservationPath(stock.own), 'primary') : ''}${linkButton('다른 원단 찾기', listPath(ctx, fabric), stock.own ? 'secondary' : 'primary')}</div>`;
}

function exampleReservation(ctx, id = 'demo-roll', fabricId) {
  const fabric = ctx.state.fabrics.find(f => f.id === (fabricId || (id.includes('scrap') ? 'fabric-scrap-1' : 'fabric-roll-1')));
  if (!fabric) return null;
  const requestedStatus = ctx.query.get('status') || 'REQUESTED';
  const status = Object.hasOwn(STATUS, requestedStatus) ? requestedStatus : 'REQUESTED';
  return { id, example: true, viewSubset: ['canvas', 'stripe'].includes(ctx.query.get('subset')) ? ctx.query.get('subset') : null, status, fabric_id: fabric.id, fabric_title: fabric.title, sale_type: fabric.sale_type, requested_length_cm: fabric.sale_type === 'ROLL' ? 180 : null, display_price: fabric.price * (fabric.sale_type === 'ROLL' ? 2 : 1), pickup_date: validDate(2), pickup_time: '14:00', memo: '', rejection_reason: '요청하신 시간에는 매장 방문 응대가 어렵습니다. 다른 일시로 다시 요청해 주세요.' };
}

function selectedReservation(ctx) {
  const id = routeId(ctx);
  return ctx.state.reservations.find(item => item.id === id) || (isExample(ctx) && ['demo-roll', 'demo-scrap'].includes(id) ? exampleReservation(ctx, id, ctx.query.get('fabric_id')) : null);
}

const reservationDetails = (item, fabric) => info([
  ['요청 번호', item.example ? (item.sale_type === 'ROLL' ? 'R-예시-001' : 'R-예시-002') : item.id],
  ['원단', item.fabric_title || fabric?.title], ['요청 수량', reservationQuantity(item)],
  ['예상 금액', price(item.display_price)], ['희망 픽업', `${dateText(item.pickup_date)} · ${item.pickup_time}`],
]);

function saleTypeTabs(saleType) {
  return `<nav class="tabs" aria-label="원단 판매 형태">${[['SCRAP', '자투리'], ['ROLL', '롤']].map(([value, label]) => `<a class="button${saleType === value ? ' is-active' : ''}" href="#/buyer/fabrics?sale_type=${value}"${saleType === value ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function fabricCard(ctx, fabric) {
  const stock = availability(ctx, fabric);
  return `<article class="buyer-fabric-card">${picture(fabric)}<div class="buyer-card-copy">${badge(stock.label, stock.canRequest ? 'green' : 'amber')}
    <h3>${e(fabric.title)}</h3><p>${e(fabric.description)}</p>
    <p class="buyer-small">${e([fabric.material, fabric.color, fabric.thickness].join(' · '))} / ${e(dimensions(fabric))}</p>
    <div class="buyer-price-row"><strong class="buyer-price">${e(priceText(fabric))}</strong>${linkButton('상세 보기 →', detailPath(ctx, fabric))}</div>
  </div></article>`;
}

function renderHome(ctx) {
  const fabrics = ctx.state.fabrics.filter(f => f.status === 'POSTED').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || a.sale_type.localeCompare(b.sale_type)).slice(0, 4);
  return page('123:482', `${pageHeading('원단의 다음 쓰임을 찾아보세요', '양주의 남은 원단으로 시작하는 나만의 만들기')}
    <section class="buyer-home-banner"><div class="buyer-home-banner-copy"><h2>작은 원단에서<br>새로운 가능성으로</h2><p>마음에 드는 원단을 고르고, 만들 수 있는 제품을 살펴보세요.<br>가까운 판매처에서 직접 픽업할 수 있어요.</p>${linkButton('원단 둘러보기 →', '/buyer/fabrics', 'primary')}</div>${picture({ title: '그린 체크', texture: 'gingham' }, 'buyer-home-banner-art')}</section>
    <div class="buyer-home-section-heading"><div><h2>최근 등록된 원단</h2><p class="buyer-muted">새로운 쓰임을 기다리는 원단을 만나보세요.</p></div>${linkButton('전체 보기 →', '/buyer/fabrics')}</div>
    <div class="buyer-home-products">${fabrics.length ? fabrics.map(fabric => `<a class="buyer-home-product" href="${href(fabricRoute(fabric.id))}">${picture(fabric)}<div><p class="buyer-muted">${e([fabric.material, fabric.color, fabric.thickness].join(' · '))}</p><h3>${e(fabric.title)}</h3><p class="buyer-muted">${e(dimensions(fabric))}</p><strong>${e(priceText(fabric))}</strong></div></a>`).join('') : emptyState('새로운 원단을 기다리고 있어요', '원단이 게시되면 이곳에서 확인할 수 있어요.')}</div>`);
}

function renderFabrics(ctx) {
  const saleType = ctx.query.get('sale_type') === 'ROLL' ? 'ROLL' : 'SCRAP';
  const material = ctx.query.get('material') || '';
  const thickness = ctx.query.get('thickness') || '';
  const color = ctx.query.get('color') || '';
  const collapsed = ctx.query.get('collapsed') === '1';
  const search = ctx.query.get('view') === 'search';
  const publicFabrics = ctx.state.fabrics.filter(f => f.status === 'POSTED' && f.sale_type === saleType);
  const fabrics = publicFabrics.filter(f => (!material || f.material === material) && (!thickness || f.thickness === thickness) && (!color || f.color === color));
  const options = (name, label) => [{ value: '', label: `전체 ${label}` }, ...[...new Set(publicFabrics.map(f => f[name]))].filter(Boolean).map(value => ({ value, label: value }))];
  const filterPath = `/buyer/filters?${new URLSearchParams({ sale_type: saleType, material, thickness, color })}`;
  if (!fabrics.length && (material || thickness || color)) return page('127:2890', `${pageHeading('조건에 맞는 원단이 없어요', '검색 범위를 넓히거나 조건을 바꿔서 다시 찾아보세요.')}<section class="panel"><h2 class="buyer-panel-heading">현재 검색 조건</h2>${info([['판매 형태', saleType === 'ROLL' ? '롤' : '자투리'], ['소재 / 두께 / 색상', [material || '전체', thickness || '전체', color || '전체'].join(' / ')]])}</section>${notice('현재 조건과 일치하는 게시 원단이 없습니다.')}<div class="actions">${linkButton('조건 수정', filterPath, 'primary')}${linkButton('전체 원단 보기', `/buyer/fabrics?sale_type=${saleType}`)}</div>`);
  if (search || collapsed) return page(search ? '127:2745' : '127:2823', `${pageHeading(search ? '검색 결과' : '원단 둘러보기', search ? '선택한 검색 조건에 맞는 원단을 확인하세요.' : '조건을 접어 원단 목록을 넓게 살펴보세요.')}${saleTypeTabs(saleType)}${notice(search ? `조건에 맞는 ${saleType === 'ROLL' ? '롤' : '자투리'} 원단 ${fabrics.length}개` : `선택한 조건: ${saleType === 'ROLL' ? '롤' : '자투리'} · ${material || '전체 소재'} · ${thickness || '전체 두께'} · ${color || '전체 색상'}`, search ? 'success' : 'info')}<div class="actions">${linkButton(search ? '필터 조건 변경' : '상세 조건 펼치기', filterPath)}${button('초기화', { attrs: 'data-buyer-reset-filter' })}${search ? linkButton(`${saleType === 'ROLL' ? '롤' : '자투리'} 목록 보기`, `/buyer/fabrics?sale_type=${saleType}`) : ''}</div><div class="buyer-results">${fabrics.map(fabric => `<article class="panel buyer-compact-card">${badge(availability(ctx, fabric).label, availability(ctx, fabric).canRequest ? 'green' : 'amber')}<h3>${e(fabric.title)}</h3><p class="buyer-muted">${e(`${fabric.material} · ${fabric.thickness} · ${dimensions(fabric)}`)}</p><strong class="buyer-price">${e(priceText(fabric))}</strong><div>${linkButton('상세 보기', detailPath(ctx, fabric))}</div></article>`).join('')}</div>${search ? `<div class="actions">${linkButton('다른 조건 살펴보기', filterPath)}</div>` : ''}`);
  return page(saleType === 'SCRAP' ? '123:855' : '202:7763', `${pageHeading('원단 둘러보기', saleType === 'SCRAP' ? '자투리는 표시된 한 장 전체를 예약합니다. 소재와 치수를 확인해 보세요.' : '롤은 1마(90cm) 단위로 요청할 수 있어요. 구매 가능한 길이를 확인해 보세요.')}
    ${saleTypeTabs(saleType)}
    <form class="panel" data-buyer-filter><h2 class="buyer-panel-heading">상품 필터 조건</h2>
      <input type="hidden" name="sale_type" value="${saleType}">
      <div class="buyer-filter-grid" id="buyer-filter-fields"${collapsed ? ' hidden' : ''}>
        ${selectField('소재', 'material', options('material', '소재'), material)}
        ${selectField('두께', 'thickness', options('thickness', '두께'), thickness)}
        ${selectField('색상', 'color', options('color', '색상'), color)}
      </div>
      <div class="actions">${button('초기화', { attrs: 'data-buyer-reset-filter' })}${button('검색', { type: 'submit', tone: 'primary' })}${button(collapsed ? '상세 조건 펼치기 ↓' : '상세 조건 접기 ↑', { attrs: `data-buyer-collapse aria-expanded="${!collapsed}" aria-controls="buyer-filter-fields"` })}</div>
    </form>
    <p class="buyer-result-count" aria-live="polite">${saleType === 'SCRAP' ? '자투리' : '롤'} 원단 ${fabrics.length}개</p>
    <div class="buyer-results">${fabrics.length ? fabrics.map(fabric => fabricCard(ctx, fabric)).join('') : emptyState('조건에 맞는 원단이 없어요', '검색 조건을 줄여 다시 찾아보세요.', button('필터 초기화', { attrs: 'data-buyer-reset-filter' }))}</div><div class="actions">${button('필터 조건 선택', { attrs: 'data-buyer-filter-shortcut' })}</div>`);
}

function renderFilters(ctx) {
  const saleType = ctx.query.get('sale_type') === 'ROLL' ? 'ROLL' : 'SCRAP';
  const fabrics = ctx.state.fabrics.filter(f => f.status === 'POSTED' && f.sale_type === saleType);
  const selected = name => ctx.query.get(name) || '';
  const options = (name, label) => [{ value: '', label: `전체 ${label}` }, ...[...new Set([...fabrics.map(f => f[name]), selected(name)])].filter(Boolean).map(value => ({ value, label: value }))];
  return page(saleType === 'ROLL' ? '127:2667' : '202:7982', `${pageHeading('원단 검색 조건', `${saleType === 'ROLL' ? '롤' : '자투리'} 원단의 소재·두께·색상을 선택하세요.`)}${saleTypeTabs(saleType)}<form class="panel" data-buyer-filter><h2 class="buyer-panel-heading">상세 조건</h2>${field('판매 형태', 'sale_type_label', { value: saleType === 'ROLL' ? '롤' : '자투리', readonly: true, attrs: 'disabled' })}<input name="sale_type" type="hidden" value="${saleType}">${selectField('소재', 'material', options('material', '소재'), selected('material'))}${selectField('두께', 'thickness', options('thickness', '두께'), selected('thickness'))}${selectField('색상', 'color', options('color', '색상'), selected('color'))}<div class="actions">${button('선택한 조건으로 검색', { type: 'submit', tone: 'primary' })}${button('조건 초기화', { attrs: 'data-buyer-reset-filter' })}</div></form>${notice(`선택한 조건: ${saleType === 'ROLL' ? '롤' : '자투리'} · ${selected('material') || '전체 소재'} · ${selected('thickness') || '전체 두께'} · ${selected('color') || '전체 색상'}`)}<div class="actions">${linkButton('선택 취소', `/buyer/fabrics?sale_type=${saleType}`)}</div>`);
}

function productArt(kind) {
  return kind === 'tote'
    ? '<div class="buyer-product-art"><img src="/assets/figma/tote.svg" alt="데일리 토트백 모양 예시" width="180" height="148"></div>'
    : '<div class="buyer-product-art buyer-product-art--pouch" role="img" aria-label="지퍼 파우치 모양 예시"><span class="buyer-pouch-grain"></span><span class="buyer-pouch-pull"></span></div>';
}

function recommendationsPreview(ctx, fabric) {
  return `<h2>이런 활용 아이디어가 있어요</h2><p class="buyer-muted">제품 모양을 살펴보는 예시입니다. 이 원단으로 제작할 수 있는지는 조건 확인이 필요해요.</p>
    <div class="buyer-recommend-grid">${[['pouch', '지퍼 파우치', '작은 소지품을 담기 좋은 기본형 파우치'], ['tote', '데일리 토트백', '가볍게 들기 좋은 실용적인 토트백']].map(([kind, title, description]) => `<article class="panel"><h3>${title}</h3><div class="buyer-recommend-body">${productArt(kind)}<div class="buyer-recommend-copy"><strong>${description}</strong><p class="buyer-muted">예상 사용 치수를 확인하고<br>만들기를 준비해 보세요.</p>${badge('활용 아이디어 예시')}</div></div></article>`).join('')}</div>
    <div class="actions">${linkButton('제작 조건 확인', keepList(ctx, `/buyer/recommendations/${encodeURIComponent(fabric.id)}`), 'primary')}${linkButton('도안 미리보기', keepList(ctx, `/buyer/patterns/pouch?fabric_id=${encodeURIComponent(fabric.id)}`))}</div>`;
}

function renderFabric(ctx) {
  const fabric = ctx.state.fabrics.find(f => f.id === routeId(ctx) && f.status === 'POSTED');
  if (!fabric) return missingFabric();
  const gallery = [fabric, { ...fabric, texture: 'linen', image_url: null }, { ...fabric, texture: 'gingham', image_url: null }];
  const title = pageHeading(fabric.title);
  const stock = availability(ctx, fabric);
  return page(fabricNode(fabric, 0), `${title}<p class="buyer-breadcrumb"><a href="${e(href(listPath(ctx, fabric)))}">${listReturn(ctx)?.includes('view=search') ? '검색 결과로' : '원단목록'}</a> / 원단 상세</p>
    <div class="buyer-detail-grid"><div class="buyer-gallery"><div data-buyer-gallery>${picture(fabric, 'buyer-gallery-main')}</div>
      <div class="buyer-gallery-thumbs">${gallery.map((item, index) => `<button type="button" data-buyer-photo="${index}" aria-label="원단 예시 사진 ${index + 1} 보기" aria-pressed="${index === 0}">${picture(item)}</button>`).join('')}</div>
    </div><section class="panel buyer-detail-panel"><h2 class="buyer-panel-heading">원단 상세 정보</h2>${badge(stock.label, stock.canRequest ? 'green' : 'amber')}<h2>${e(fabric.title)}</h2><p class="buyer-price">${e(priceText(fabric))}</p><p class="buyer-muted">${e(fabric.description)}</p>
      ${info([['소재 / 색상', `${fabric.material} / ${fabric.color}`], ['두께', fabric.thickness], ['구매 가능 치수', dimensions(fabric)], ['하자', fabric.defect_note || '등록된 하자 없음'], ['판매처', `${fabric.store_name} · 양주시`]])}
      ${!stock.canRequest ? stockRecovery(ctx, fabric, stock) : ''}<div class="buyer-detail-actions">${stock.canRequest ? linkButton('픽업 요청하기', pickupPath(ctx, fabric), 'primary') : ''}${linkButton('판매자 문의', keepList(ctx, `/buyer/inquiries?fabric_id=${encodeURIComponent(fabric.id)}&compose=1`))}</div>
    </section></div>${recommendationsPreview(ctx, fabric)}`);
}

function renderPickup(ctx) {
  const fabric = ctx.state.fabrics.find(f => f.id === routeId(ctx) && f.status === 'POSTED');
  if (!fabric) return missingFabric();
  const submitted = ctx.query.get('submitted');
  const reservation = (submitted && ctx.state.reservations.find(item => item.id === submitted && item.fabric_id === fabric.id)) || (isExample(ctx) && ctx.query.get('state') === 'DONE' ? exampleReservation(ctx, fabric.sale_type === 'ROLL' ? 'demo-roll' : 'demo-scrap', fabric.id) : null);
  if (reservation) return page(fabricNode(fabric, 2), `${pageHeading('픽업 요청을 보냈어요', '판매자가 재고와 방문 일정을 확인하고 있어요.')}${reservation.example ? exampleNotice() : ''}${notice('접수 완료 · 아직 재고가 확보되거나 픽업이 확정된 상태는 아니에요.', 'success')}<section class="panel"><h2 class="buyer-panel-heading">접수된 요청 상세</h2>${reservationDetails(reservation, fabric)}${info([['진행 상태', '요청됨']])}</section><div class="actions">${linkButton('요청 상세 확인', reservationPath(reservation), 'primary')}${linkButton('원단 목록으로', '/buyer/fabrics')}</div>`);
  const stock = availability(ctx, fabric);
  if (!stock.canRequest) return page(fabricNode(fabric, 1), `${pageHeading('픽업 요청 전 확인해 주세요', fabric.title)}<section class="panel"><h2 class="buyer-panel-heading">현재 원단 상태</h2>${badge(stock.label, 'amber')}${info([['원단', fabric.title], ['구매 가능 치수', dimensions(fabric)]])}</section>${stockRecovery(ctx, fabric, stock)}<div>${linkButton('원단 상세로 돌아가기', detailPath(ctx, fabric))}</div>`);
  const draft = ctx.drafts?.get(draftKey('pickup', fabric.id)) || {};
  const maxMa = Math.floor((fabric.available_length_cm || 0) / 90);
  const requestedMa = draft.requested_ma ?? Math.max(1, Math.min(maxMa || 1, Number(ctx.query.get('ma')) || Math.min(2, maxMa || 1)));
  const roll = fabric.sale_type === 'ROLL';
  return page(fabricNode(fabric, 1), `${pageHeading('픽업 요청하기', '원단과 방문 정보를 확인한 뒤 판매자에게 요청을 보내세요.')}
    <form class="buyer-page" data-buyer-pickup data-fabric-id="${e(fabric.id)}">
      <section class="panel"><h2 class="buyer-panel-heading">구매 요청 정보</h2><div class="buyer-pickup-product">${picture(fabric)}<div><h2>${e(fabric.title)}</h2>
        ${info([['원단 치수', dimensions(fabric)], ['판매처', fabric.store_name], ['픽업 장소', `${ctx.state.store.address} ${ctx.state.store.detail_address || ''}`]])}
        ${roll ? `<div class="buyer-quantity-row field"><label for="buyer-request-ma">요청 수량 (1마=90cm)</label><input id="buyer-request-ma" name="requested_ma" type="number" min="1" max="${maxMa}" step="1" value="${e(requestedMa)}" required inputmode="numeric" aria-describedby="buyer-quantity-hint"><span id="buyer-quantity-hint" class="buyer-small">최대 ${maxMa}마 · 1마 단위</span></div>${Number(requestedMa) > maxMa ? notice('구매 가능한 길이가 바뀌었어요. 희망 일정과 요청 사항은 유지했으니 수량을 다시 선택해 주세요.', 'warning') : ''}` : '<p>요청 수량: 표시된 자투리 한 장 전체</p>'}
        <p>요청 금액 <strong class="buyer-price" data-buyer-estimate aria-live="polite">${e(price(roll ? requestedMa * fabric.price : fabric.price))}</strong></p>
      </div></div><div class="buyer-pickup-fields">${field('희망 픽업 날짜', 'pickup_date', { type: 'date', required: true, value: draft.pickup_date ?? validDate(2), attrs: `min="${validDate(0)}"` })}${field('희망 픽업 시간', 'pickup_time', { type: 'time', required: true, value: draft.pickup_time ?? '14:00' })}</div>
      <p class="buyer-small buyer-muted">${e(ctx.state.store.closed_days)} · ${e(ctx.state.store.pickup_guide)} 희망 일정이며 판매자의 수락 전에는 확정되지 않습니다.</p></section>
      <section class="panel"><h2 class="buyer-panel-heading">계정 정보 확인</h2><div class="buyer-readonly"><dl><dt>닉네임 (계정)</dt><dd>${e(ctx.state.buyer.nickname)}</dd></dl><dl><dt>전화번호 (선택 정보)</dt><dd>${e(ctx.state.buyer.phone_number || '등록된 전화번호 없음')}</dd></dl></div>
        <div class="field"><label for="buyer-memo">요청 사항</label><textarea id="buyer-memo" name="memo" maxlength="500" rows="2" placeholder="방문 전 확인할 내용이 있다면 적어주세요." aria-describedby="buyer-memo-hint">${e(draft.memo || '')}</textarea><span id="buyer-memo-hint" class="buyer-small buyer-muted">최대 500자</span></div>
        ${notice('계정정보는 확인용이며 예약 연락처로 따로 저장되지 않습니다. 픽업은 판매자가 수락하면 확정됩니다.')}</section>
      <div data-buyer-error role="alert" tabindex="-1" class="buyer-field-error"></div>
      <div class="actions">${linkButton('원단 상세로 돌아가기', detailPath(ctx, fabric))}${button('픽업 요청 보내기', { type: 'submit', tone: 'primary', disabled: roll && maxMa < 1 })}</div>
    </form>`);
}

function renderReservations(ctx) {
  const requestedStatus = ctx.query.get('status') || 'REQUESTED';
  const status = Object.hasOwn(STATUS, requestedStatus) ? requestedStatus : 'REQUESTED';
  const examples = isExample(ctx);
  const subset = ctx.query.get('subset');
  if (examples && ['canvas', 'stripe', 'empty'].includes(subset) && ['REQUESTED', 'CANCELED'].includes(status)) return renderReservationSubset(ctx, status, subset);
  const reservations = examples ? ['demo-roll', ...(status === 'REJECTED' ? [] : ['demo-scrap'])].map(id => exampleReservation(ctx, id)).filter(Boolean) : ctx.state.reservations.filter(item => item.status === status);
  const tabs = `<nav class="tabs" aria-label="픽업 예약 상태">${['REQUESTED', 'ACCEPTED', 'PICKED_UP', 'REJECTED', 'CANCELED'].map(key => `<a class="button${key === status ? ' is-active' : ''}" href="#/buyer/reservations?status=${key}${exampleQuery(ctx)}"${key === status ? ' aria-current="page"' : ''}>${STATUS[key]}</a>`).join('')}</nav>`;
  const nodes = { REQUESTED: '123:1806', ACCEPTED: '127:4648', PICKED_UP: '127:4860', REJECTED: '127:4960', CANCELED: '127:5025' };
  const cards = reservations.map(item => {
    const fabric = ctx.state.fabrics.find(f => f.id === item.fabric_id);
    const title = item.fabric_title || fabric?.title || '원단';
    const summary = `${reservationQuantity(item)} · ${price(item.display_price)} · 희망 픽업 ${dateText(item.pickup_date)} ${item.pickup_time}`;
    const actions = item.status === 'REQUESTED' ? `${linkButton('상세 보기', reservationPath(item))}${linkButton('예약 취소', reservationPath(item, '/cancel'), 'danger')}`
      : item.status === 'ACCEPTED' ? linkButton('예약 취소', reservationPath(item, '/cancel'), 'danger')
      : item.status === 'PICKED_UP' ? linkButton('다른 원단 둘러보기', '/buyer/fabrics')
      : `${linkButton('다시 요청하기', `/buyer/pickup/${encodeURIComponent(item.fabric_id)}`, 'primary')}${item.status === 'REJECTED' ? linkButton('다른 원단 찾기', '/buyer/fabrics') : ''}`;
    const description = item.status === 'ACCEPTED' ? `${item.sale_type === 'ROLL' ? `${quantityText(item.requested_length_cm)} 확보` : '원단 한 장 예약 중'} · 판매자가 수락했어요. 방문 후 원단을 수령해 주세요.`
      : item.status === 'PICKED_UP' ? item.sale_type === 'ROLL' ? '수령한 길이가 실물 재고에서 차감되었어요.' : '자투리 원단의 거래가 완료되었어요.'
      : item.status === 'REJECTED' ? item.rejection_reason || item.reject_reason || STATUS_DESCRIPTION.REJECTED
      : item.status === 'CANCELED' ? '다시 예약하려면 현재 재고와 구매 가능한 길이를 확인해 주세요.' : STATUS_DESCRIPTION.REQUESTED;
    return item.status === 'REQUESTED' ? `<article class="buyer-reservation">${picture(fabric || { title, texture: 'canvas' })}<div class="buyer-reservation-info"><h3>${e(title)}</h3><p class="buyer-muted">${e(item.sale_type === 'ROLL' ? `폭 ${fabric?.width_cm || '—'}cm · 요청 ${quantityText(item.requested_length_cm)}` : fabric ? dimensions(fabric) : '자투리 한 장 전체')}</p><p>픽업 희망 ${e(dateText(item.pickup_date))} · ${e(item.pickup_time)}</p><strong>${e(price(item.display_price))}</strong>${item.memo ? `<details><summary>요청 사항 보기</summary><p class="buyer-message">${e(item.memo)}</p></details>` : ''}</div><div class="buyer-reservation-actions">${badge(STATUS[item.status], 'amber')}<p class="buyer-small buyer-muted">${e(description)}</p>${actions}</div></article>`
      : `<article class="panel buyer-compact-card">${badge(STATUS[item.status], statusTone(item.status))}<h3>${e(title)}</h3><p class="buyer-muted">${e(summary)}</p><p>${e(description)}</p><div class="actions">${actions}</div></article>`;
  }).join('');
  return page(nodes[status], `${pageHeading('픽업 예약 내역', '요청한 원단과 픽업 진행 상태를 확인하세요.')}${examples ? exampleNotice() : ''}${tabs}${status === 'CANCELED' && reservations.length ? notice('취소된 예약 내역입니다. 수락된 예약을 취소하면 확보된 원단은 다시 판매할 수 있어요.') : ''}<div class="buyer-results">${cards || emptyState(`${STATUS[status]} 내역이 없어요`, '필요한 원단을 찾아 픽업을 요청해 보세요.', linkButton('원단 둘러보기', '/buyer/fabrics', 'primary'))}</div>${notice(status === 'ACCEPTED' ? '원단을 받은 뒤 판매자의 수령 확인이 완료되면 수령 완료 상태로 바뀝니다.' : '판매자가 요청을 처리하면 이곳에서 변경된 상태를 확인할 수 있어요.')}`);
}

function renderReservationSubset(ctx, status, subset) {
  const canceled = status === 'CANCELED';
  const nodes = canceled ? { canvas: '154:7566', stripe: '154:7639', empty: '154:7712' } : { canvas: '154:7368', stripe: '154:7452', empty: '154:7522' };
  const tabs = `<nav class="tabs" aria-label="픽업 예약 상태">${['REQUESTED', 'ACCEPTED', 'PICKED_UP', 'REJECTED', 'CANCELED'].map(key => `<a class="button${key === status ? ' is-active' : ''}" href="#/buyer/reservations?status=${key}&example=1${['REQUESTED', 'CANCELED'].includes(key) ? `&subset=${subset}` : ''}"${key === status ? ' aria-current="page"' : ''}>${key === 'REJECTED' ? '거절됨' : STATUS[key]}</a>`).join('')}</nav>`;
  const item = subset === 'empty' ? null : exampleReservation(ctx, subset === 'canvas' ? 'demo-roll' : 'demo-scrap');
  const fabric = item && ctx.state.fabrics.find(f => f.id === item.fabric_id);
  const meta = item ? `${item.sale_type === 'ROLL' ? `요청 ${item.requested_length_cm / 90}마` : `${fabric.width_cm}×${fabric.length_cm}cm 1장`} · ${price(item.display_price)}${canceled ? '' : ` · ${dateText(item.pickup_date)} ${item.pickup_time}`}` : '';
  const content = item ? `${canceled ? notice('선택한 요청의 취소가 완료되었어요. 다른 요청은 그대로 유지됩니다.') : ''}<article class="panel buyer-compact-card">${badge(canceled ? '취소됨' : '요청됨', canceled ? 'gray' : 'amber')}<h2>${e(item.fabric_title)}</h2><p class="buyer-muted">${e(meta)}</p><p>${canceled ? '취소 처리된 요청입니다. 재예약 시 현재 재고를 다시 확인해요.' : '판매자가 재고와 방문 일정을 확인하고 있어요.'}</p><div class="actions">${canceled ? linkButton('다시 요청하기', `/buyer/pickup/${encodeURIComponent(item.fabric_id)}`) : linkButton('상세보기', reservationPath(item), 'primary') + linkButton('취소', reservationPath(item, '/cancel'), 'danger')}</div></article>` : `${notice(canceled ? '취소한 예약이 없습니다.' : '확인을 기다리는 요청이 없습니다.')}<div class="actions">${linkButton('원단 둘러보기', '/buyer/fabrics', 'primary')}</div>`;
  return page(nodes[subset], `<div class="buyer-reservation-summary">${pageHeading('픽업 예약 내역', `${canceled ? '취소한 예약을 확인하세요.' : '판매자의 확인을 기다리는 요청입니다.'} · 화면 확인용 예시`)}${tabs}${content}</div>`);
}

function renderReservationDetail(ctx) {
  const item = selectedReservation(ctx);
  if (!item) return page('127:4434', emptyState('예약을 찾을 수 없어요', '예약 목록에서 요청 내역을 확인해 주세요.', linkButton('예약 목록으로', '/buyer/reservations', 'primary')));
  const fabric = ctx.state.fabrics.find(f => f.id === item.fabric_id);
  const canCancel = ['REQUESTED', 'ACCEPTED'].includes(item.status);
  const cancel = ctx.path.endsWith('/cancel');
  if (cancel) {
    const node = item.status === 'ACCEPTED' ? item.sale_type === 'ROLL' ? '127:4756' : '127:4808' : item.sale_type === 'ROLL' ? '127:4492' : '127:4599';
    return page(node, `${pageHeading(item.status === 'ACCEPTED' ? '확정된 예약을 취소할까요?' : '예약 요청을 취소할까요?', '취소 전에 원단과 예약 정보를 확인해 주세요.')}${item.example ? exampleNotice() : ''}<section class="panel"><h2 class="buyer-panel-heading">취소할 예약</h2>${reservationDetails(item, fabric)}</section>${notice(item.status === 'ACCEPTED' ? '취소하면 확보된 원단이 다시 판매 가능 상태로 돌아갑니다. 필요한 경우 새로 요청해 주세요.' : '취소한 요청은 되돌릴 수 없습니다. 필요한 경우 다시 요청해 주세요.', 'warning')}<form data-buyer-cancel-page data-reservation-id="${e(item.id)}" data-example="${Boolean(item.example)}"><div data-buyer-error role="alert" tabindex="-1" class="buyer-field-error"></div><div class="actions">${linkButton('예약 유지', reservationPath(item))}${button(item.example ? '예시 취소 결과 보기' : '예약 취소하기', { type: 'submit', tone: 'danger', disabled: !canCancel })}</div></form>`);
  }
  const stock = item.status === 'REQUESTED' ? '아직 확보되지 않음' : item.status === 'ACCEPTED' ? '판매자가 요청 수량을 확보함' : item.status === 'PICKED_UP' ? '수령 완료' : '이 예약으로 확보된 원단 없음';
  return page(item.sale_type === 'ROLL' ? '127:4434' : '127:4541', `${pageHeading('픽업 요청 상세', item.fabric_title || fabric?.title || '원단')}${item.example ? exampleNotice() : ''}${notice(`${STATUS[item.status]} · ${STATUS_DESCRIPTION[item.status]}`, item.status === 'REQUESTED' ? 'warning' : 'info')}<section class="panel"><h2 class="buyer-panel-heading">예약 정보</h2>${reservationDetails(item, fabric)}${info([['재고', stock]])}${item.memo ? `<p class="buyer-message">요청 사항: ${e(item.memo)}</p>` : ''}${item.status === 'REJECTED' ? notice(item.rejection_reason || item.reject_reason || STATUS_DESCRIPTION.REJECTED, 'error') : ''}</section><div class="actions">${canCancel ? linkButton(item.status === 'REQUESTED' ? '예약 요청 취소' : '예약 취소', reservationPath(item, '/cancel'), 'danger') : linkButton('원단 상태 확인', fabricRoute(item.fabric_id))}${linkButton('예약 목록으로', `/buyer/reservations?status=${item.status}${item.example ? '&example=1' : ''}`)}</div>`);
}

function renderProfile(ctx) {
  const profile = ctx.state.buyer;
  if (ctx.query.get('state') === 'SAVED') return page('127:5587', `<div class="buyer-state-screen">${pageHeading('회원 정보를 저장했어요', '변경한 닉네임과 연락처가 반영되었습니다.')}${isExample(ctx) ? exampleNotice() : ''}${notice('저장 완료', 'success')}<div class="actions">${linkButton('마이페이지로', '/buyer/profile', 'primary')}</div></div>`);
  if (ctx.query.get('edit') === '1') return page('127:5385', `${pageHeading('회원 정보 수정', '닉네임과 연락처를 수정할 수 있어요. 저장한 후 적용됩니다.')}<form class="panel buyer-profile-form" data-buyer-profile><h2 class="buyer-panel-heading">기본 정보</h2>${field('로그인 이메일', 'email', { value: profile.email, readonly: true, hint: '로그인 이메일은 변경할 수 없습니다.' })}${field('닉네임', 'nickname', { value: profile.nickname, required: true, attrs: 'minlength="1" maxlength="50" autocomplete="nickname"' })}${field('전화번호 (선택)', 'phone_number', { value: profile.phone_number || '', type: 'tel', attrs: 'maxlength="20" autocomplete="tel"' })}<div data-buyer-error role="alert" tabindex="-1" class="buyer-field-error"></div><div class="actions">${button('저장하기', { type: 'submit', tone: 'primary' })}${linkButton('취소', '/buyer/profile')}</div></form>`);
  return page('123:1964', `${pageHeading('마이페이지', '내 정보와 이용 내역을 한곳에서 관리하세요.')}<section class="panel"><h2 class="buyer-panel-heading">회원 정보</h2><div class="buyer-profile-title"><h3>로그인 정보</h3>${linkButton('정보 수정', '/buyer/profile?edit=1')}</div>${info([['로그인 이메일', profile.email], ['연락처', profile.phone_number || '등록된 전화번호 없음'], ['닉네임', profile.nickname]])}</section><div class="buyer-two-columns"><section class="panel"><h3>구매 내역</h3><p class="buyer-muted">요청한 원단과 픽업 예약을 확인하세요.</p><div>${linkButton('구매 내역 바로 가기 →', '/buyer/reservations')}</div></section><section class="panel"><h3>문의 내역</h3><p class="buyer-muted">남긴 질문과 판매자의 답변을 확인하세요.</p><div>${linkButton('문의 내역 바로 가기 →', '/buyer/inquiries')}</div></section></div><div class="actions">${button('로그아웃', { attrs: 'data-logout="BUYER"' })}</div>`);
}

function renderInquiries(ctx) {
  const fabricId = ctx.query.get('fabric_id');
  const fabric = ctx.state.fabrics.find(item => item.id === fabricId);
  if (ctx.query.get('state') === 'DONE') return page('127:5261', `<div class="buyer-state-screen">${pageHeading('문의를 등록했어요', '판매자의 답변을 기다려 주세요.')}${isExample(ctx) ? exampleNotice() : ''}${notice('답변 대기 · 등록한 문의의 답변은 내 문의에서 확인할 수 있어요.', 'success')}<div class="actions">${linkButton('내 문의 확인', '/buyer/inquiries?status=WAITING', 'primary')}${linkButton('원단 둘러보기', '/buyer/fabrics')}</div></div>`);
  if (ctx.query.get('compose') === '1') {
    if (!fabric || fabric.status !== 'POSTED') return missingFabric();
    const draft = ctx.drafts?.get(draftKey('inquiry', fabric.id)) || {};
    return page(fabric.id === 'fabric-scrap-1' ? '127:5197' : '127:5133', `${pageHeading('판매자 문의', `${fabric.title}에 대해 궁금한 점을 남겨주세요.`)}<section class="panel"><h2 class="buyer-panel-heading">문의 대상</h2>${info([['원단', fabric.title], ['판매처', fabric.store_name]])}</section><form class="panel buyer-inquiry-form" data-buyer-inquiry data-fabric-id="${e(fabric.id)}"><h2 class="buyer-panel-heading">문의 작성</h2><div class="field"><label for="buyer-inquiry-content">문의 내용 (1~1,000자)</label><textarea id="buyer-inquiry-content" name="content" rows="4" minlength="1" maxlength="1000" required placeholder="원단에 대해 궁금한 내용을 적어주세요." aria-describedby="buyer-inquiry-count">${e(draft.content || '')}</textarea><span id="buyer-inquiry-count" class="buyer-small buyer-muted" data-buyer-inquiry-count>${e((draft.content || '').length)} / 1,000자</span></div><div data-buyer-error role="alert" tabindex="-1" class="buyer-field-error"></div><div class="actions">${button('문의 등록', { type: 'submit', tone: 'primary' })}${button('작성 취소', { href: href(detailPath(ctx, fabric)), attrs: `data-buyer-discard-inquiry="${e(fabric.id)}"` })}</div></form>${notice('기본 공개 문의입니다. 다른 사용자에게도 문의 내용이 보여요. 답변은 문의 내역에서 확인하세요.')}`);
  }
  const status = ctx.query.get('status') === 'WAITING' ? 'WAITING' : 'ANSWERED';
  const inquiries = isExample(ctx) ? ['fabric-roll-1', 'fabric-scrap-1'].map((id, index) => ({ id: `demo-inquiry-${index}`, fabric_id: id, fabric_title: ctx.state.fabrics.find(f => f.id === id)?.title, content: '작은 파우치를 만들려고 합니다. 원단에 신축성이 있나요?', answer: status === 'ANSWERED' ? '신축성이 거의 없는 원단입니다. 방문하시면 촉감과 두께를 직접 확인할 수 있어요.' : null, created_at: validDate(-1) })) : ctx.state.inquiries.filter(item => status === 'WAITING' ? !item.answer : Boolean(item.answer));
  return page(status === 'WAITING' ? '127:5299' : '123:2068', `${pageHeading('문의 내역', '원단에 대해 남긴 질문과 판매자의 답변을 확인하세요.')}${isExample(ctx) ? exampleNotice() : ''}<nav class="tabs" aria-label="문의 답변 상태">${[['WAITING', '답변 대기'], ['ANSWERED', '답변 완료']].map(([value, label]) => `<a class="button${value === status ? ' is-active' : ''}" href="#/buyer/inquiries?status=${value}${exampleQuery(ctx)}"${value === status ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>${inquiries.length ? inquiries.map(item => {
    const itemFabric = ctx.state.fabrics.find(f => f.id === item.fabric_id);
    if (status === 'WAITING') return `<article class="panel buyer-compact-card">${badge('답변 대기', 'amber')}<h3>${e(item.fabric_title || itemFabric?.title || '원단')}</h3><p class="buyer-muted">${e(itemFabric?.store_name || '판매자')} · ${e(dateText(String(item.created_at).slice(0, 10)))}</p><p class="buyer-message">${e(item.content)}</p><div>${linkButton('원단 확인', fabricRoute(item.fabric_id))}</div></article>`;
    return `<article class="buyer-inquiry-item"><div class="buyer-inquiry-header">${picture(itemFabric || { texture: 'canvas' })}<div><h3>${e(item.fabric_title || itemFabric?.title || '원단')}</h3><p class="buyer-muted">${e(itemFabric ? `${itemFabric.store_name} · ${dimensions(itemFabric)}` : '')}</p>${badge(item.answer ? '답변 완료' : '답변 대기', item.answer ? 'green' : 'amber')}<p class="buyer-small buyer-muted">${e(dateText(String(item.created_at).slice(0, 10)))}</p></div></div><section class="panel"><h3>문의 내용</h3><p class="buyer-small buyer-muted">${e(dateText(String(item.created_at).slice(0, 10)))} · ${e(ctx.state.buyer.nickname)}</p><p class="buyer-message">${e(item.content)}</p></section>${item.answer ? `<section class="panel"><h3>판매자 답변</h3><p class="buyer-small buyer-muted">${e(itemFabric?.store_name || '판매자')}</p><p class="buyer-message">${e(item.answer)}</p></section>` : notice('판매자의 답변을 기다리고 있어요.')}</article>`;
  }).join('') : emptyState(status === 'WAITING' ? '답변을 기다리는 문의가 없어요' : '답변이 완료된 문의가 없어요', '원단 상세에서 판매자에게 궁금한 점을 남길 수 있어요.', linkButton('원단 둘러보기', '/buyer/fabrics'))}`);
}

function renderRecommendations(ctx) {
  const original = ctx.state.fabrics.find(f => f.id === routeId(ctx) && f.status === 'POSTED');
  const example = isExample(ctx) && ctx.query.get('state') === 'NEEDS_CHECK';
  const fabric = original && example ? { ...original, material: '모름' } : original;
  if (!fabric) return missingFabric();
  // Figma's fixed demonstration pattern: 35 × 25 cm, outer + lining, two panels each.
  const requiredWidth = 35;
  const requiredLength = 100;
  const purchaseLength = Math.ceil(requiredLength / 90) * 90;
  const available = fabric.sale_type === 'ROLL' ? fabric.available_length_cm : fabric.length_cm;
  const materialUnknown = ['모름', 'UNKNOWN', ''].includes(fabric.material || '');
  const suitableMaterial = ['면', '혼방'].includes(fabric.material);
  const suitableThickness = ['중간 두께', '보통', '중간'].includes(fabric.thickness);
  const fits = fabric.width_cm >= requiredWidth && available >= (fabric.sale_type === 'ROLL' ? purchaseLength : requiredLength);
  const supported = fits && suitableThickness && (suitableMaterial || materialUnknown);
  if (!supported) return page('127:4377', `${pageHeading('추천할 수 있는 도안이 없어요', `${fabric.title}의 입력 정보와 등록 도안 조건을 비교했어요.`)}<section class="panel"><h2 class="buyer-panel-heading">추천 결과</h2>${info([['원단', `${fabric.title} · ${dimensions(fabric)}`], ['소재 / 두께', `${fabric.material} / ${fabric.thickness}`], ['안내', '현재 확인할 수 있는 추천 도안이 없습니다.'], ['판정', '추천 결과 없음']])}</section>${notice('현재 정보로 추천 결과를 찾지 못했어요. 다른 원단을 찾아보거나 판매자에게 소재를 확인해 보세요.', 'warning')}<div class="actions">${linkButton('판매자에게 물어보기', keepList(ctx, `/buyer/inquiries?fabric_id=${encodeURIComponent(fabric.id)}&compose=1`), 'primary')}${linkButton('원단 상세로 돌아가기', detailPath(ctx, fabric))}${linkButton('다른 원단 찾기', '/buyer/fabrics')}</div>`);
  return page(materialUnknown ? '202:8188' : '127:4236', `${pageHeading(materialUnknown ? '소재 확인이 필요해요' : '지퍼 파우치 제작 조건', `${fabric.title}와 도안의 조건을 비교했어요.`)}${example ? notice('소재 정보가 확인되지 않은 상황의 예시입니다. 원단의 실제 등록 정보는 변경되지 않습니다.') : ''}${notice(materialUnknown ? '소재가 확인되지 않았어요. 판매자에게 먼저 확인해 주세요.' : '적합 · 시연용 고정 도안 기준입니다. 촉감·수축·결 방향은 실물 확인을 권장해요.', materialUnknown ? 'info' : 'success')}<section class="panel"><h2 class="buyer-panel-heading">판정 근거</h2>${info([['원단 / 도안', `${fabric.title} / 지퍼 파우치`], ['소재 · 두께', `${fabric.material} · ${fabric.thickness} → ${materialUnknown ? '소재 확인 필요' : '도안의 허용 조건 충족'}`], ['필요 폭 / 원단 폭', `${requiredWidth}cm / ${fabric.width_cm}cm → 충족`], ['필요 길이', '겉감·안감 35×25cm 각 2장 → 길이 방향 합 100cm'], ['구매 길이', fabric.sale_type === 'ROLL' ? '100cm를 1마 단위로 올림 → 2마(180cm)' : '표시된 자투리 한 장 전체'], ['예상 금액', fabric.sale_type === 'ROLL' ? `2마 × ${price(fabric.price)} = ${price(fabric.price * 2)}` : price(fabric.price)]])}</section><div class="actions">${linkButton('도안 미리보기', keepList(ctx, `/buyer/patterns/pouch?fabric_id=${encodeURIComponent(fabric.id)}${example ? '&state=NEEDS_CHECK&example=1' : ''}`))}${materialUnknown ? linkButton('판매자에게 소재 문의', keepList(ctx, `/buyer/inquiries?fabric_id=${encodeURIComponent(fabric.id)}&compose=1`), 'primary') : linkButton(fabric.sale_type === 'ROLL' ? '2마로 픽업 요청' : '픽업 요청', keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}?ma=2`), 'primary')}${linkButton('원단 상세로', detailPath(ctx, fabric))}</div>`);
}

function renderPattern(ctx) {
  const fabric = ctx.state.fabrics.find(f => f.id === (ctx.query.get('fabric_id') || 'fabric-roll-1') && f.status === 'POSTED');
  if (!fabric) return missingFabric();
  const length = fabric.sale_type === 'ROLL' ? fabric.available_length_cm : fabric.length_cm;
  const canRequest = fabric.width_cm >= 35 && length >= (fabric.sale_type === 'ROLL' ? 180 : 100) && ['면', '혼방'].includes(fabric.material) && ['중간 두께', '보통', '중간'].includes(fabric.thickness) && ctx.query.get('state') !== 'NEEDS_CHECK';
  const recommendation = keepList(ctx, `/buyer/recommendations/${encodeURIComponent(fabric.id)}${isExample(ctx) ? '?example=1&state=NEEDS_CHECK' : ''}`);
  return page('127:4299', `${pageHeading('지퍼 파우치 도안 미리보기', '치수가 정해진 시연용 도안입니다. 실제 제작 전 검토가 필요해요.')}<section class="panel"><h2 class="buyer-panel-heading">시접 포함 재단 부품</h2><div class="table-wrapper"><table class="data-table buyer-pattern-table"><thead><tr><th scope="col">부품</th><th scope="col">치수</th><th scope="col">장수</th></tr></thead><tbody><tr><th scope="row">겉감 앞·뒤</th><td>35×25cm</td><td>2장</td></tr><tr><th scope="row">안감 앞·뒤</th><td>35×25cm</td><td>2장</td></tr></tbody></table></div></section><section class="panel"><h2 class="buyer-panel-heading">재단 기준</h2>${info([['배치', '롤 길이 방향으로 한 장씩 배치 · 부품 회전 없음'], ['원단 폭', '35cm 이상'], ['합산 길이', '25cm × 4장 = 100cm'], ['예약 기준', fabric.sale_type === 'ROLL' ? `2마(180cm) / ${price(fabric.price * 2)}` : '자투리 한 장에 재단 부품을 배치할 수 있는지 확인'], ['부자재', '지퍼·실 별도 준비']])}</section>${notice('미리보기는 치수 확인용이며 실제 크기 출력·다운로드 파일이 아닙니다.')}${!canRequest ? notice('이 원단은 제작 조건을 먼저 확인해 주세요. 도안의 치수만 보고 적합성을 판단할 수는 없습니다.', 'warning') : ''}<div class="actions">${linkButton('제작 조건으로 돌아가기', recommendation)}${canRequest ? linkButton(fabric.sale_type === 'ROLL' ? '2마로 픽업 요청' : '픽업 요청', keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}?ma=2`), 'primary') : linkButton('판매자에게 물어보기', keepList(ctx, `/buyer/inquiries?compose=1&fabric_id=${encodeURIComponent(fabric.id)}`), 'primary')}${linkButton('부자재 둘러보기', addQuery('/buyer/supplies', 'from', currentRoute(ctx)))}</div>`);
}

const SUPPLY_STORES = Object.freeze([
  { id: '1', name: '루프 부자재 공방', short: '지퍼·실·단추', items: '지퍼, 실, 단추, 작은 봉제 도구', node: '127:5669', x: 25, y: 30 },
  { id: '2', name: '양주 만들기 상회', short: '끈·버클·손잡이', items: '가방 끈, 버클, 손잡이, 웨빙', node: '127:5731', x: 50, y: 65 },
  { id: '3', name: '그린 봉제 공방', short: '봉제 도구·안감', items: '봉제 도구, 안감, 심지, 재봉실', node: '127:5793', x: 74, y: 25 },
]);

function renderSupplies(ctx) {
  const storeId = routeId(ctx);
  const selectedId = storeId || ctx.query.get('selected') || '1';
  const selected = SUPPLY_STORES.find(store => store.id === selectedId);
  const from = internalReturn(ctx.query.get('from'), 'pattern');
  const supplyPath = path => addQuery(path, 'from', from);
  const selectionPath = id => supplyPath(`/buyer/supplies?selected=${id}&focus=selected`);
  const backToPattern = from ? linkButton('도안으로 돌아가기', from) : '';
  if (!selected) return page('123:1637', emptyState('판매처를 찾을 수 없어요', '예시 지도에서 판매처를 선택해 주세요.', linkButton('부자재 둘러보기', supplyPath('/buyer/supplies'), 'primary')));
  if (storeId) return page(selected.node, `${pageHeading(selected.name, '부자재 판매처 상세 · 시연용 예시')}<section class="panel"><h2 class="buyer-panel-heading">선택한 판매처</h2>${info([['지도 표시', `${selected.id}번 판매처`], ['취급 품목', selected.items], ['지역', '경기도 양주시'], ['영업 안내', '방문 전 영업 여부 확인']])}</section>${notice('매장 위치와 연락처는 시연용 데이터입니다. 실제 지도와 길찾기는 매장 정보 확인 후 연결합니다.')}<div class="actions">${linkButton('전체 지도·목록으로', selectionPath(selected.id), 'primary')}${backToPattern}</div>`);
  return page('123:1637', `${pageHeading('부자재 둘러보기', '시연용 판매처와 지도를 살펴보세요. 실제 업체 정보는 아직 제공하지 않습니다.')}<div class="buyer-supply-layout"><div class="buyer-supply-map" role="group" aria-label="판매처 위치 예시 지도"><div class="buyer-map-river" aria-hidden="true"></div>${[14.46, 35.12, 55.79, 76.45, 97.1].map(y => `<span class="buyer-map-road buyer-map-road--horizontal" style="top:${y}%" aria-hidden="true"></span>`).join('')}${[11.72, 31.25, 50.78, 70.31, 89.84].map(x => `<span class="buyer-map-road buyer-map-road--vertical" style="left:${x}%" aria-hidden="true"></span>`).join('')}${SUPPLY_STORES.map(store => `<a class="buyer-map-pin${store.id === selected.id ? ' is-active' : ''}" style="left:${store.x}%;top:${store.y}%" href="${e(href(selectionPath(store.id)))}" data-buyer-select-store aria-label="${store.id}번 ${e(store.name)} 선택"${store.id === selected.id ? ' aria-current="true"' : ''}>${store.id}</a>`).join('')}<span class="buyer-map-caption">실제 위치가 아닌 예시 지도</span></div><section class="panel"><h2 class="buyer-panel-heading">판매처 목록 · 예시</h2><ol class="buyer-store-list">${SUPPLY_STORES.map(store => `<li><a href="${e(href(selectionPath(store.id)))}" data-buyer-select-store${store.id === selected.id ? ' aria-current="true"' : ''}><strong>${store.id}. ${e(store.name)}</strong><span class="buyer-muted">${e(store.short)}</span>${store.id === selected.id ? badge('선택됨') : ''}</a></li>`).join('')}</ol></section></div><section class="panel buyer-selected-store" aria-labelledby="buyer-selected-store-title"><h2 class="buyer-panel-heading">선택한 판매처 · 예시</h2><h2 id="buyer-selected-store-title" tabindex="-1">${e(selected.name)}</h2>${info([['취급 품목', selected.items], ['위치', '경기도 양주시 · 위치 예시'], ['운영 안내', '실제 영업 정보가 아닌 시연용 안내입니다.']])}<div>${linkButton('판매처 안내 보기', supplyPath(`/buyer/supplies/${selected.id}`), 'primary')}</div></section>${backToPattern ? `<div class="actions">${backToPattern}</div>` : ''}`);
}

function renderPickupError(ctx) {
  const kind = routeId(ctx);
  const fabricId = ctx.query.get('fabric_id') || (kind === 'reserved' ? 'fabric-scrap-1' : 'fabric-roll-1');
  const detail = keepList(ctx, fabricRoute(fabricId));
  const pickup = keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabricId)}`);
  const existing = ctx.state.reservations.find(item => item.fabric_id === fabricId && ['REQUESTED', 'ACCEPTED'].includes(item.status));
  const errors = {
    insufficient: { node: '202:8252', title: '구매 가능 길이가 바뀌었어요', description: '다른 예약이 먼저 수락되어 요청한 길이를 확보할 수 없어요.', message: '최신 구매 가능 길이를 확인한 후 1마(90cm) 단위로 다시 선택해 주세요.', actions: linkButton('수량 다시 선택', pickup, 'primary') + linkButton('구매 가능량 확인', detail) },
    reserved: { node: '202:8295', title: '이미 예약 중인 원단이에요', description: '이 자투리에는 판매자가 수락한 예약이 있어요.', message: '현재 추가 요청을 할 수 없습니다. 원단 상태를 확인하거나 다른 자투리를 찾아보세요.', actions: linkButton('원단 상태 확인', detail, 'primary') + linkButton('다른 자투리 보기', '/buyer/fabrics?sale_type=SCRAP') },
    duplicate: { node: '202:8338', title: '이미 보낸 예약이 있어요', description: '같은 원단에 요청 중이거나 수락된 예약이 있어요.', message: '새 요청은 만들어지지 않았어요. 기존 예약 상태를 확인해 주세요.', tone: 'info', actions: linkButton('기존 예약 보기', existing ? reservationPath(existing) : '/buyer/reservations', 'primary') + linkButton('원단 둘러보기', '/buyer/fabrics') },
    unavailable: { node: '202:8381', title: '지금은 요청할 수 없어요', description: '판매가 종료되었거나 공개되지 않은 원단이에요.', message: '다른 원단을 찾아보거나 이미 보낸 예약 내역을 확인해 주세요.', actions: linkButton('다른 원단 찾기', '/buyer/fabrics', 'primary') + linkButton('예약 내역 보기', '/buyer/reservations') },
    expired: { node: '202:8424', title: '다시 로그인해 주세요', description: '로그인 유효 시간이 지나 요청을 처리하지 못했어요.', message: '다시 로그인한 후 원단 상태와 예약 내역을 확인해 주세요.', actions: linkButton('다시 로그인', '/auth/buyer/login', 'primary') + linkButton('원단 둘러보기', '/buyer/fabrics') },
  };
  const error = errors[kind] || errors.unavailable;
  return page(error.node, `<div class="buyer-state-screen">${pageHeading(error.title, error.description)}${isExample(ctx) ? notice('예약 요청이 처리되지 않은 상황의 화면 예시입니다. 현재 원단 상태는 변경되지 않습니다.') : ''}${notice(error.message, error.tone || 'error')}<div class="actions">${error.actions}</div></div>`);
}

export function renderBuyer(ctx) {
  if (ctx.path === '/buyer/home') return renderHome(ctx);
  if (ctx.path === '/buyer/fabrics' || ctx.path === '/buyer') return renderFabrics(ctx);
  if (ctx.path === '/buyer/filters') return renderFilters(ctx);
  if (ctx.path.startsWith('/buyer/fabrics/')) return renderFabric(ctx);
  if (ctx.path.startsWith('/buyer/pickup/')) return renderPickup(ctx);
  if (ctx.path === '/buyer/reservations') return renderReservations(ctx);
  if (ctx.path.startsWith('/buyer/reservations/')) return renderReservationDetail(ctx);
  if (ctx.path === '/buyer/profile') return renderProfile(ctx);
  if (ctx.path === '/buyer/inquiries') return renderInquiries(ctx);
  if (ctx.path.startsWith('/buyer/recommendations/')) return renderRecommendations(ctx);
  if (ctx.path === '/buyer/patterns' || ctx.path === '/buyer/patterns/pouch') return renderPattern(ctx);
  if (ctx.path === '/buyer/supplies' || ctx.path.startsWith('/buyer/supplies/')) return renderSupplies(ctx);
  if (ctx.path.startsWith('/buyer/errors/')) return renderPickupError(ctx);
  return page('123:855', emptyState('화면을 찾을 수 없어요', '', linkButton('원단 둘러보기', '/buyer/fabrics', 'primary')));
}

function showFormError(form, error) {
  const target = form.querySelector('[data-buyer-error]');
  if (!target) return;
  target.textContent = error.message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  target.focus();
}

export function bindBuyer(ctx) {
  const controller = new AbortController();
  const listen = (node, event, handler) => node?.addEventListener(event, handler, { signal: controller.signal });
  const { root, api } = ctx;
  let focusFrame;
  root.querySelectorAll('[data-buyer-select-store]').forEach(node => listen(node, 'click', event => {
    event.preventDefault();
    ctx.navigate(node.getAttribute('href').slice(1), { replace: true });
  }));
  if (ctx.path === '/buyer/supplies' && ctx.query.get('focus') === 'selected') {
    focusFrame = requestAnimationFrame(() => {
      const heading = root.querySelector('#buyer-selected-store-title');
      heading?.focus({ preventScroll: true });
      heading?.closest('section')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  const filter = root.querySelector('[data-buyer-filter]');
  listen(filter, 'submit', event => {
    event.preventDefault();
    const values = new FormData(filter);
    const query = new URLSearchParams();
    for (const [key, value] of values.entries()) if (value) query.set(key, value);
    query.set('view', 'search');
    ctx.navigate(`/buyer/fabrics?${query}`);
  });
  root.querySelectorAll('[data-buyer-reset-filter]').forEach(node => listen(node, 'click', () => ctx.navigate(`/buyer/fabrics?sale_type=${ctx.query.get('sale_type') === 'ROLL' ? 'ROLL' : 'SCRAP'}`)));
  listen(root.querySelector('[data-buyer-filter-shortcut]'), 'click', () => {
    root.querySelector('#buyer-filter-fields').hidden = false;
    const toggle = root.querySelector('[data-buyer-collapse]');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = '상세 조건 접기 ↑';
    filter.scrollIntoView({ block: 'start' });
    filter.querySelector('select').focus({ preventScroll: true });
  });
  listen(root.querySelector('[data-buyer-collapse]'), 'click', () => {
    const query = new URLSearchParams(new FormData(filter));
    query.set('collapsed', '1');
    ctx.navigate(`/buyer/fabrics?${query}`);
  });
  root.querySelectorAll('[data-buyer-photo]').forEach(node => listen(node, 'click', () => {
    const fabric = ctx.state.fabrics.find(f => f.id === routeId(ctx));
    const index = Number(node.dataset.buyerPhoto);
    const variants = [fabric, { ...fabric, texture: 'linen', image_url: null }, { ...fabric, texture: 'gingham', image_url: null }];
    root.querySelector('[data-buyer-gallery]').innerHTML = picture(variants[index], 'buyer-gallery-main');
    root.querySelectorAll('[data-buyer-photo]').forEach(item => item.setAttribute('aria-pressed', String(item === node)));
  }));

  const pickupForm = root.querySelector('[data-buyer-pickup]');
  if (pickupForm) {
    const fabric = ctx.state.fabrics.find(f => f.id === pickupForm.dataset.fabricId);
    const key = draftKey('pickup', fabric.id);
    const saveDraft = () => ctx.drafts?.set(key, Object.fromEntries(new FormData(pickupForm)));
    listen(pickupForm, 'input', saveDraft);
    listen(pickupForm, 'change', saveDraft);
    listen(pickupForm.elements.requested_ma, 'input', () => {
      root.querySelector('[data-buyer-estimate]').textContent = price((Number(pickupForm.elements.requested_ma.value) || 0) * fabric.price);
    });
    let sending = false;
    listen(pickupForm, 'submit', async event => {
      event.preventDefault();
      if (sending || !pickupForm.reportValidity()) return;
      const values = new FormData(pickupForm);
      const pickupDate = String(values.get('pickup_date') || '');
      const pickupTime = String(values.get('pickup_time') || '');
      if (new Date(`${pickupDate}T${pickupTime}`).getTime() <= Date.now()) return showFormError(pickupForm, new Error('픽업 희망 날짜와 시간은 현재보다 이후로 선택해 주세요.'));
      const ma = Number(values.get('requested_ma'));
      if (fabric.sale_type === 'ROLL' && (!Number.isInteger(ma) || ma < 1 || ma * 90 > fabric.available_length_cm)) return showFormError(pickupForm, new Error('구매 가능한 길이 안에서 1마 단위로 선택해 주세요.'));
      const submit = pickupForm.querySelector('[type="submit"]');
      sending = true;
      submit.disabled = true;
      submit.textContent = '요청 보내는 중…';
      try {
        const reservation = await api.createReservation({ fabric_id: fabric.id, ...(fabric.sale_type === 'ROLL' ? { requested_length_cm: ma * 90 } : {}), pickup_date: pickupDate, pickup_time: pickupTime, memo: String(values.get('memo') || '').trim() });
        ctx.drafts?.delete(key);
        ctx.navigate(keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabric.id)}?submitted=${encodeURIComponent(reservation.id)}`), { replace: true });
      } catch (error) {
        const errors = { DUPLICATE_RESERVATION: 'duplicate', INSUFFICIENT_LENGTH: 'insufficient', SCRAP_ALREADY_RESERVED: 'reserved', FABRIC_NOT_AVAILABLE: 'unavailable', TOKEN_EXPIRED: 'expired' };
        if (errors[error.code]) ctx.navigate(keepList(ctx, `/buyer/errors/${errors[error.code]}?fabric_id=${encodeURIComponent(fabric.id)}`));
        else showFormError(pickupForm, error);
      } finally {
        sending = false;
        submit.disabled = false;
        submit.textContent = '픽업 요청 보내기';
      }
    });
  }

  const cancelForm = root.querySelector('[data-buyer-cancel-page]');
  let cancelling = false;
  listen(cancelForm, 'submit', async event => {
    event.preventDefault();
    if (cancelling) return;
    if (cancelForm.dataset.example === 'true') {
      const subset = ctx.query.get('subset');
      ctx.navigate(`/buyer/reservations?status=CANCELED&example=1${['canvas', 'stripe'].includes(subset) ? `&subset=${subset}` : ''}`);
      return;
    }
    cancelling = true;
    const submit = cancelForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await api.cancelReservation(cancelForm.dataset.reservationId);
      ctx.notify('예약이 취소되었습니다.');
      ctx.navigate('/buyer/reservations?status=CANCELED');
    } catch (error) { showFormError(cancelForm, error); }
    finally { cancelling = false; submit.disabled = false; }
  });

  const profileForm = root.querySelector('[data-buyer-profile]');
  let savingProfile = false;
  listen(profileForm, 'submit', async event => {
    event.preventDefault();
    if (savingProfile || !profileForm.reportValidity()) return;
    const values = new FormData(profileForm);
    const nickname = String(values.get('nickname') || '').trim();
    const phone = String(values.get('phone_number') || '').trim();
    if (!nickname) return showFormError(profileForm, new Error('닉네임을 입력해 주세요.'));
    savingProfile = true;
    const submit = profileForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try { await api.updateProfile({ nickname, phone_number: phone || null }); ctx.notify('회원 정보가 수정되었습니다.'); ctx.navigate('/buyer/profile?state=SAVED'); }
    catch (error) { showFormError(profileForm, error); }
    finally { savingProfile = false; submit.disabled = false; }
  });

  const inquiryForm = root.querySelector('[data-buyer-inquiry]');
  root.querySelectorAll('[data-buyer-discard-inquiry]').forEach(node => listen(node, 'click', () => ctx.drafts?.delete(draftKey('inquiry', node.dataset.buyerDiscardInquiry))));
  let sendingInquiry = false;
  listen(inquiryForm?.elements.content, 'input', () => {
    root.querySelector('[data-buyer-inquiry-count]').textContent = `${inquiryForm.elements.content.value.length} / 1,000자`;
    ctx.drafts?.set(draftKey('inquiry', inquiryForm.dataset.fabricId), { content: inquiryForm.elements.content.value });
  });
  listen(inquiryForm, 'submit', async event => {
    event.preventDefault();
    if (sendingInquiry || !inquiryForm.reportValidity()) return;
    const content = inquiryForm.elements.content.value.trim();
    if (!content) return showFormError(inquiryForm, new Error('문의 내용을 입력해 주세요.'));
    sendingInquiry = true;
    const submit = inquiryForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try { await api.createInquiry({ fabric_id: inquiryForm.dataset.fabricId, content, is_private: false }); ctx.drafts?.delete(draftKey('inquiry', inquiryForm.dataset.fabricId)); ctx.notify('문의가 등록되었습니다.'); ctx.navigate('/buyer/inquiries?state=DONE', { replace: true }); }
    catch (error) { showFormError(inquiryForm, error); }
    finally { sendingInquiry = false; submit.disabled = false; }
  });
  return () => { controller.abort(); if (focusFrame) cancelAnimationFrame(focusFrame); };
}
