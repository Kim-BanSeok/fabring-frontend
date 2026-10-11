import { escapeHtml as esc, formatPrice, formatLength, badge, notice, pageHeading, button, emptyState, fabricImage, field, selectField } from '../shared/ui.js';
import './seller.css';

// Source: connected Figma page 122:12. Each view retains its source frame ID.
const FABRIC_STATUS = { POSTED: '게시 중', PENDING: '승인 대기', REJECTED: '승인 거절', SOLD_OUT: '판매 완료' };
const RESERVATION_STATUS = { REQUESTED: '요청됨', ACCEPTED: '수락됨', PICKED_UP: '수령 완료', REJECTED: '거절됨', CANCELED: '취소됨' };
const PHOTO_SLOTS = [['FULL', '전체 사진', 'canvas'], ['ZOOM', '확대 사진', 'linen'], ['DEFECT', '하자 사진', 'gingham']];
const MATERIALS = ['면', '린넨', '폴리에스터', '나일론', '레이온', '울', '혼방', '기타', '미확인'];
const href = path => `#${path}`;
const go = (label, path, tone = 'secondary') => button(label, { href: href(path), tone });
const action = (label, name, tone = 'secondary', attrs = '') => button(label, { tone, attrs: `data-seller-action="${name}" ${attrs}` });
const errorSlot = () => '<div id="seller-error" class="notice notice--error" role="alert" tabindex="-1" hidden></div>';
const wrap = (source, content, extra = '') => `<section class="seller-page stack ${extra}" data-figma-node="${source}">${errorSlot()}${content}</section>`;
const tone = status => ['REJECTED', 'CANCELED'].includes(status) ? 'red' : ['PENDING', 'REQUESTED'].includes(status) ? 'amber' : status === 'SOLD_OUT' || status === 'PICKED_UP' ? 'gray' : 'green';
const ownFabrics = state => state.fabrics.filter(f => f.seller_id === state.seller.id);
const ownReservations = state => state.reservations.filter(r => r.seller_id === state.seller.id || ownFabrics(state).some(f => f.id === r.fabric_id));
const canRegister = state => state.seller.seller_approval_status === 'APPROVED' && state.seller.hasStore;
const options = labels => labels.map(label => ({ value: label, label }));
const details = rows => `<dl class="seller-details">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value ?? '—')}</dd></div>`).join('')}</dl>`;
const record = (title, body, { meta = '', status = '', actions = '' } = {}) => `<section class="panel seller-panel seller-record">${status ? badge(status, /거절|취소/.test(status)?'red':/대기|필요/.test(status)?'amber':/판매 완료|수령 완료/.test(status)?'gray':'green') : ''}<h2>${esc(title)}</h2>${meta ? `<p class="muted">${esc(meta)}</p>` : ''}${body}${actions ? `<div class="actions">${actions}</div>` : ''}</section>`;
const fabricByQuery = ctx => ownFabrics(ctx.state).find(f => f.id === ctx.query.get('id'));
const fabricRoute = (f, action = 'detail') => `/seller/fabrics/${action}?id=${encodeURIComponent(f.id)}`;
const fabricRows = f => [['판매 형태', f.sale_type === 'ROLL' ? '롤 원단' : '자투리 · 1장'], ['폭 / 길이', `${f.width_cm}cm / ${f.sale_type === 'ROLL' ? f.remaining_length_cm : f.length_cm}cm`], ['소재 / 두께 / 색상', `${f.material || '미확인'} / ${f.thickness || '미확인'} / ${f.color || '미확인'}`], ['가격', `${formatPrice(f.price)} / ${f.sale_type === 'ROLL' ? '90cm(1마)' : '1장'}`], ['하자', f.has_defect ? f.defect_note || '내용 확인 필요' : '없음']];
const stockRows = f => f.sale_type === 'ROLL' ? [['물리적으로 남은 길이', formatLength(f.remaining_length_cm)], ['수락된 예약으로 확보', formatLength(f.reserved_length_cm || 0)], ['판매 가능 길이', formatLength(f.available_length_cm ?? f.remaining_length_cm - (f.reserved_length_cm || 0))]] : [['판매 형태', '자투리 1장'], ['상태', FABRIC_STATUS[f.status]]];
const missing = (source, title = '원단을 찾을 수 없어요') => wrap(source, emptyState(title, '목록에서 현재 항목을 확인해 주세요.', go('내 원단 목록', '/seller/fabrics')));

function statusTabs(path, labels, selected) {
  return `<nav class="tabs seller-tabs" aria-label="상태 필터">${Object.entries(labels).map(([value, label]) => `<a class="button ${selected === value ? 'seller-tab--active' : ''}" href="${href(`${path}?status=${encodeURIComponent(value)}`)}" ${selected === value ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>`;
}

function approvalView(ctx, storeRequired = false) {
  const status = ctx.state.seller.seller_approval_status;
  const title = storeRequired ? '매장 정보가 필요해요' : status === 'APPROVED' ? '판매자 승인이 완료되었어요' : status === 'REJECTED' ? '판매자 승인이 거절되었어요' : '판매자 승인을 기다리고 있어요';
  const description = storeRequired ? '원단 등록 준비 · 매장 정보' : `판매자 계정 · ${status === 'APPROVED' ? '승인 완료' : status === 'REJECTED' ? '승인 거절' : '승인 대기'}`;
  const message = storeRequired ? '원단을 등록하려면 매장 정보를 먼저 입력해 주세요. 픽업 장소와 연락처를 확인해 주세요.' : status === 'APPROVED' ? '매장 정보가 등록되어 있으면 직접 입력과 AI 등록을 시작할 수 있어요.' : status === 'REJECTED' ? '원단 등록과 AI 등록을 이용할 수 없어요. 재신청 기능은 제공하지 않으며 운영팀이 승인하면 등록할 수 있어요.' : '매장 정보는 먼저 등록할 수 있어요. 운영팀 승인 전에는 원단 등록과 AI 등록을 이용할 수 없어요.';
  return wrap(storeRequired ? '127:5978' : status === 'APPROVED' ? '209:8203' : status === 'REJECTED' ? '209:8167' : '209:8131', `${pageHeading(title, description)}${notice(message, status === 'APPROVED' && !storeRequired ? 'info' : 'warning')}<div class="actions">${go(status === 'APPROVED' && !storeRequired ? '원단 등록' : '매장 정보 확인', status === 'APPROVED' && !storeRequired ? '/seller/register' : '/seller/store', 'primary')}${action('승인 상태 다시 확인', 'refresh-approval')}</div>`, 'seller-state');
}

function dashboardView(ctx) {
  const fabrics = ownFabrics(ctx.state), reservations = ownReservations(ctx.state);
  if (!ctx.state.seller.hasStore || (!fabrics.length && ctx.query.get('view') === 'new')) return newDashboardView(ctx);
  const requested = reservations.filter(r => r.status === 'REQUESTED').length;
  const inquiries = ctx.state.inquiries.filter(i => fabrics.some(f => f.id === i.fabric_id) && !i.answer).length;
  const pending = fabrics.filter(f => f.status === 'PENDING').length, rejected = fabrics.filter(f => f.status === 'REJECTED').length;
  const today = new Date(), todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const monthQuery = ctx.query.get('month'), validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthQuery || '') ? monthQuery : todayIso.slice(0, 7);
  const [year, month] = validMonth.split('-').map(Number);
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.get('date') || '') ? ctx.query.get('date') : todayIso;
  const pickups = reservations.filter(r => r.pickup_date === selectedDate && r.status === 'ACCEPTED');
  const monthLink = shift => { const date = new Date(year, month - 1 + shift, 1); return `/seller/dashboard?month=${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const days = Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => {
    const iso = `${validMonth}-${String(i + 1).padStart(2, '0')}`;
    const hasPickup = reservations.some(r => r.pickup_date === iso && r.status === 'ACCEPTED');
    return `<a href="${href(`/seller/dashboard?month=${validMonth}&date=${iso}`)}" class="seller-calendar-day ${iso === selectedDate ? 'is-selected' : ''} ${hasPickup ? 'has-pickup' : ''}" aria-label="${year}년 ${month}월 ${i + 1}일${hasPickup ? ', 픽업 있음' : ''}" ${iso === selectedDate ? 'aria-current="date"' : ''}>${i + 1}</a>`;
  }).join('');
  return wrap('123:2473', `${pageHeading(`반가워요, ${ctx.state.store?.store_name || ctx.state.seller.nickname}`, '오늘의 예약과 원단 판매 현황을 확인하세요.')}${go('월별 픽업 일정 보기', `/seller/calendar?month=${validMonth}`)}
    <div class="stat-grid seller-stats">${[['예약 요청', `${requested}건`, '판매자 확인 대기'], ['답변 대기', `${inquiries}건`, '구매자 문의'], ['오늘 픽업', `${reservations.filter(r => r.pickup_date === todayIso && r.status === 'ACCEPTED').length}건`, '수락된 예약'], ['원단 승인', `대기 ${pending} · 거절 ${rejected}`, '거절 사유를 확인하세요']].map(([label, value, note]) => `<div class="panel stat-card"><p class="muted">${label}</p><strong class="seller-stat-value">${value}</strong><small class="muted">${note}</small></div>`).join('')}</div>
    <div class="seller-columns"><div class="stack"><section class="panel seller-panel"><h2>오늘 처리할 일</h2><h3>예약 요청 ${requested}건 · 답변 대기 ${inquiries}건</h3><p class="muted">${rejected ? `승인 거절된 원단 ${rejected}건의 사유를 확인해 주세요.` : '예약과 문의를 확인하고 구매자를 맞이해 주세요.'}</p><div class="actions seller-task-actions">${go('예약 확인', '/seller/reservations', 'primary')}${go('문의 확인', '/seller/inquiries')}${go('거절 사유', '/seller/fabrics?status=REJECTED', 'danger')}</div></section>
    <section class="panel seller-panel"><h2>내 원단 현황</h2>${details(Object.entries(FABRIC_STATUS).map(([key, label]) => [label, `${fabrics.filter(f => f.status === key).length}건`]))}${go('원단 목록 전체보기 →', '/seller/fabrics')}</section></div>
    <div class="stack"><section class="panel seller-panel"><h2>픽업 일정</h2><div class="seller-calendar-head"><strong>${year}년 ${month}월</strong><div class="actions">${button('‹', { href: href(monthLink(-1)), attrs: 'aria-label="이전 달"' })}${button('›', { href: href(monthLink(1)), attrs: 'aria-label="다음 달"' })}</div></div><div class="seller-calendar" aria-label="픽업 달력">${['월', '화', '수', '목', '금', '토', '일'].map(d => `<span class="seller-calendar-weekday">${d}</span>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${days}</div><h3>${esc(selectedDate)} · 픽업 ${pickups.length}건</h3>${pickups.length ? `<div class="table-wrapper"><table class="data-table"><thead><tr><th>시간</th><th>원단</th><th>상태</th></tr></thead><tbody>${pickups.map(r => `<tr><td>${esc(r.pickup_time)}</td><td><a href="${href(`/seller/reservations?status=ACCEPTED&id=${encodeURIComponent(r.id)}`)}">${esc(r.fabric_title)}</a></td><td>${badge('수락됨')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">선택한 날짜에 수락된 픽업이 없어요.</p>'}</section>${go('+ 새 원단 등록', '/seller/register', 'primary')}</div></div>`);
}

function fabricsView(ctx) {
  const status = ctx.query.get('status') || 'ALL', all = ownFabrics(ctx.state), items = all.filter(f => status === 'ALL' || f.status === status);
  const selected = all.find(f => f.id === ctx.query.get('id'));
  if (selected) return fabricDetailView(ctx);
  if (status !== 'ALL' && FABRIC_STATUS[status]) return fabricStatusView(ctx, status, items);
  return wrap('123:2891', `${pageHeading('내 원단 목록', '등록한 원단의 게시 상태와 예약을 관리하세요.')}${statusTabs('/seller/fabrics', { ALL: '전체', ...FABRIC_STATUS }, status)}
    <section class="panel seller-panel"><h2>등록한 원단 ${all.length}건</h2>${items.length ? `<div class="table-wrapper"><table class="data-table seller-fabric-table"><thead><tr><th>원단</th><th>치수 · 남은 길이 × 고정폭</th><th>가격</th><th>상태</th><th>예약</th><th>관리</th></tr></thead><tbody>${items.map(f => `<tr><td><div class="seller-product-cell">${fabricImage(f, 'seller-thumb')}<div><strong>${esc(f.title)}</strong><small>${esc(f.material)} · ${esc(f.color)}</small></div></div></td><td>${esc(f.sale_type === 'ROLL' ? formatLength(f.remaining_length_cm) : `${f.length_cm}cm`)} × ${esc(f.width_cm)}cm</td><td>${esc(formatPrice(f.price))}<small>${f.sale_type === 'ROLL' ? '90cm당' : '1장'}</small></td><td>${badge(FABRIC_STATUS[f.status] || f.status, tone(f.status))}</td><td>${ctx.state.reservations.some(r => r.fabric_id === f.id && ['REQUESTED', 'ACCEPTED'].includes(r.status)) ? '진행 중' : '없음'}</td><td><a href="${href(`/seller/fabrics?status=${encodeURIComponent(status)}&id=${encodeURIComponent(f.id)}`)}">상세보기</a></td></tr>`).join('')}</tbody></table></div>` : emptyState('해당 상태의 원단이 없어요', '다른 상태를 선택하거나 새 원단을 등록해 주세요.')}</section>
    ${selected ? `<section class="panel seller-panel" aria-label="선택한 원단 상세"><div class="seller-product-cell">${fabricImage(selected, 'seller-detail-thumb')}<div><h2>${esc(selected.title)}</h2><p class="muted">${esc(selected.material)} · ${esc(selected.color)}</p></div></div>${details([['판매 형태', selected.sale_type === 'ROLL' ? '롤 원단' : '자투리 원단'], ['가격', `${formatPrice(selected.price)} / ${selected.sale_type === 'ROLL' ? '90cm' : '1장'}`], ['상태', FABRIC_STATUS[selected.status]], ['설명', selected.description || '등록된 설명이 없어요.']])}${selected.reject_reason ? notice(`거절 사유: ${selected.reject_reason}`, 'error') : ''}${go('예약 확인', `/seller/reservations?fabric=${encodeURIComponent(selected.id)}`)}</section>` : ''}
    <div class="actions">${go(`승인 거절 ${all.filter(f => f.status === 'REJECTED').length}건`, '/seller/fabrics?status=REJECTED', 'danger')}${go('새 원단 등록', '/seller/register', 'primary')}</div>`);
}

function registrationView(ctx) {
  if (ctx.query.get('mode') === 'ai') return typeView(ctx);
  return wrap('123:3245', `${pageHeading('새 원단 등록', '편한 방법으로 원단 정보를 입력하세요.')}<div class="seller-columns seller-methods"><section class="panel seller-panel"><h2>AI와 대화로 등록</h2><h3>원단에 대해 알려주세요.</h3><p class="muted">대화를 통해 등록 항목을 정리하고, 판매자가 내용을 확인해요.</p><div class="seller-method-space"></div>${notice('사진은 게시물에 첨부해요. AI 대화에는 사진을 보내지 않아요.')}${go('AI와 대화 시작', '/seller/register?mode=ai', 'primary')}</section><section class="panel seller-panel"><h2>직접 입력</h2><h3>정보를 차례로 입력해요.</h3><p class="muted">사진, 소재, 치수와 가격을 직접 입력하고 등록 내용을 확인해요.</p><div class="seller-method-space"></div>${notice('이미 알고 있는 원단 정보를 빠르게 등록하세요.')}${go('직접 입력하기', '/seller/register/type')}</section></div>`);
}

function draftFor(ctx) {
  if (ctx.path === '/seller/fabrics/edit') {
    const fabric = fabricByQuery(ctx);
    if (fabric) return ctx.drafts?.get(`seller:edit:${fabric.id}`) || { ...fabric, editing_id:fabric.id, photo_names:fabric.photo_names || fabric.photos || [], photo_slots:fabric.photo_slots || {} };
  }
  const type = ctx.query.get('type') === 'SCRAP' ? 'SCRAP' : ctx.query.get('type') === 'ROLL' ? 'ROLL' : ctx.state.draft?.sale_type || 'ROLL';
  if (ctx.drafts?.has(`seller:register:${type}`)) return ctx.drafts.get(`seller:register:${type}`);
  if (ctx.state.draft?.sale_type === type && !ctx.state.draft.editing_id) return ctx.state.draft;
  return { sale_type: type, title: type === 'ROLL' ? '내추럴 코튼 캔버스' : '포근한 더블 거즈', material: '면', thickness: type === 'ROLL' ? '중간 두께' : '얇음', color: type === 'ROLL' ? '내추럴' : '흰색', color_detail: type === 'ROLL' ? '내추럴 · 무지' : '아이보리 · 무지', width_cm: type === 'ROLL' ? 150 : 110, length_cm: type === 'ROLL' ? 450 : 80, remaining_length_cm: type === 'ROLL' ? 450 : null, price: type === 'ROLL' ? 5000 : 8000, has_defect: false, defect_note: '', photo_names: [], photo_slots: {}, ai_request: ctx.state.draft?.sale_type === type ? ctx.state.draft.ai_request || '' : '' };
}

function photosFields(draft) {
  return `<section class="panel seller-panel"><h2>사진</h2><div class="seller-photos">${PHOTO_SLOTS.map(([slot, label, texture], index) => { const name = draft.photo_slots?.[slot] || (!draft.photo_slots ? draft.photo_names?.[index] : ''); return `<div class="seller-photo-slot">${fabricImage({ title: `${label} 예시`, texture }, 'seller-photo')}<strong>${label}</strong><label class="button seller-file-label">${name ? '사진 변경' : '사진 추가'}<input type="file" name="photo_${slot}" data-photo-slot="${slot}" accept="image/jpeg,image/png,image/webp" aria-label="${label} 선택"></label><small class="muted seller-photo-name">${name ? esc(name) : '선택한 사진 없음 · 위 이미지는 예시'}</small>${name ? action('사진 제거', 'remove-photo', 'secondary', `data-slot="${slot}"`) : ''}</div>`; }).join('')}</div><p class="muted seller-small">jpg·png·webp 최대 3장, 장당 5MB 이하 · 최종 등록 후 업로드돼요.</p></section>`;
}

function manualView(ctx) {
  const draft = draftFor(ctx), scrap = draft.sale_type === 'SCRAP';
  return wrap(scrap ? '127:6196' : '123:3466', `${pageHeading(scrap ? '자투리 원단 입력' : '원단 등록 · 직접 입력', scrap ? '1장 그대로 판매 · 직접 입력 또는 AI 초안 확인' : '원단 정보를 입력한 뒤 등록 내용을 확인해 주세요.')}<nav class="tabs seller-tabs" aria-label="판매 형태"><a class="button ${!scrap ? 'seller-tab--active' : ''}" href="#/seller/register/manual?type=ROLL">롤 원단</a><a class="button ${scrap ? 'seller-tab--active' : ''}" href="#/seller/register/manual?type=SCRAP">자투리 원단</a></nav>${scrap ? notice('하자를 피해 사용할 수 있는 가장 큰 직사각형을 기준으로 재주세요. 길이는 30~90cm예요.', 'warning') : ''}
    <form id="seller-fabric-form" class="stack" data-sale-type="${draft.sale_type}">${!scrap ? photosFields(draft) : ''}<section class="panel seller-panel"><h2>기본 정보</h2>${field('원단 이름', 'title', { value: draft.title, required: true, attrs: 'maxlength="100"' })}<fieldset class="seller-material"><legend>소재</legend><div class="seller-material-options">${MATERIALS.map(material => `<label class="seller-material-option"><input type="radio" name="material" value="${esc(material)}" ${draft.material === material ? 'checked' : ''}><span>${esc(material)}</span></label>`).join('')}</div></fieldset><div class="${scrap ? 'stack' : 'form-grid'}">${selectField('두께', 'thickness', options(['얇음', '중간 두께', '두꺼움']), draft.thickness)}${selectField('색상 계열', 'color', options(['흰색', '검정', '회색', '내추럴', '베이지', '갈색', '빨강', '분홍', '노랑', '올리브', '초록', '블루', '네이비', '보라', '혼합']), draft.color)}</div>${field('색상 상세 / 무늬', 'color_detail', { value: draft.color_detail || '', attrs: 'maxlength="100"' })}</section>
    <section class="panel seller-panel"><h2>치수 / 가격</h2><h3>사용 가능 치수</h3><div class="${scrap ? 'stack' : 'form-grid'}">${field('가로(폭) · cm', 'width_cm', { value: draft.width_cm, type: 'number', required: true, attrs: 'min="1" max="1000" step="1" inputmode="numeric"' })}${field(scrap ? '세로(길이) · cm' : '남은 길이 · cm', 'length_cm', { value: scrap ? draft.length_cm : draft.remaining_length_cm ?? draft.length_cm, type: 'number', required: true, attrs: `min="${scrap ? '30' : '90'}" ${scrap ? 'max="90"' : ''} step="1" inputmode="numeric"` })}</div><p class="muted seller-small">${scrap ? '자투리 길이 30~90cm · cm 정수' : '롤 잔량은 90cm 이상인 cm 정수로 입력해 주세요.'}</p><div class="${scrap ? '' : 'seller-half'}">${field(scrap ? '가격 · 원/장' : '90cm(1마)당 가격 · 원', 'price', { value: draft.price, type: 'number', required: true, attrs: 'min="1" step="1" inputmode="numeric"' })}</div></section>
    <section class="panel seller-panel"><h2>하자</h2><fieldset class="seller-defect"><legend>하자가 있나요?</legend><div class="actions"><label><input type="radio" name="has_defect" value="false" ${!draft.has_defect ? 'checked' : ''}> 없음</label><label><input type="radio" name="has_defect" value="true" ${draft.has_defect ? 'checked' : ''}> 있음</label></div></fieldset>${field('하자 위치 / 내용 / 크기', 'defect_note', { value: draft.defect_note || '', attrs: 'maxlength="255" placeholder="하자가 있다면 위치와 크기를 자세히 적어 주세요."' })}</section>${scrap ? photosFields(draft) : ''}${draft.photo_names?.length ? action('선택한 사진 확인', 'review-photos') : ''}<div class="actions">${go('이전', '/seller/register')}${button('등록 내용 확인', { type: 'submit', tone: 'primary' })}</div></form>${notice(scrap ? '자투리는 입력한 1장 전체를 판매해요.' : '가격은 90cm(1마)당 금액이에요. 잔량은 cm 정수로 입력하며 구매 요청만 90cm 단위로 선택해요.', 'info')}`);
}

function reviewView(ctx) {
  const draft = ctx.state.draft;
  if (!draft || draft.editing_id) return wrap('123:4153', emptyState('작성 중인 원단이 없어요', '원단 정보를 입력한 뒤 등록 내용을 확인해 주세요.', go('원단 입력하기', '/seller/register/type', 'primary')));
  const scrap = draft.sale_type === 'SCRAP', length = scrap ? draft.length_cm : draft.remaining_length_cm ?? draft.length_cm;
  if (scrap) return wrap('127:6325', `${pageHeading('자투리 등록 내용 확인','사진과 정보를 확인한 후 승인 신청을 보내 주세요.')}${fabricImage({title:draft.title,texture:'linen'},'seller-banner-image')}${record(draft.title,details(fabricRows(draft)))}<p class="muted seller-small">선택한 사진: ${(draft.photo_names||[]).map(esc).join(', ')||'없음'} · 미리보기는 질감 예시예요.</p><div class="actions">${action('확인 후 승인 신청','submit-fabric','primary')}${go('내용 수정','/seller/register/manual?type=SCRAP')}</div>`);
  return wrap('123:4153', `${pageHeading('등록 내용 확인', '사진과 정보를 확인한 후 승인 신청을 보내 주세요.')}<div class="seller-review"><div class="stack"><div class="seller-review-main">${fabricImage({ title: draft.title, texture: scrap ? 'linen' : 'canvas' }, 'seller-review-image')}</div><div class="seller-review-sub">${fabricImage({ title: '확대 예시', texture: 'linen' }, 'seller-review-thumb')}${fabricImage({ title: '하자 예시', texture: 'gingham' }, 'seller-review-thumb')}</div><p class="muted seller-small">미리보기는 원단 질감 예시예요. 선택한 파일: ${(draft.photo_names || []).map(esc).join(', ') || '없음'}</p></div><section class="panel seller-panel"><h2>원단 정보</h2>${badge('승인 신청 전', 'gray')}<h3 class="seller-review-title">${esc(draft.title)}</h3>${details([['판매 형태', scrap ? '자투리 원단 · 1장' : '롤 원단'], ['소재 / 두께', `${draft.material} / ${draft.thickness}`], ['색상', draft.color_detail || draft.color], ['폭 / 남은 길이', `${draft.width_cm}cm / ${length}cm`], ['하자', draft.has_defect ? draft.defect_note : '없음'], ['단가', `${formatPrice(draft.price)} / ${scrap ? '1장' : '90cm(1마)'}`]])}${go('내용 수정', `/seller/register/manual?type=${draft.sale_type}`)}${action('확인 후 승인 신청', 'submit-fabric', 'primary')}</section></div>`);
}

function storeView(ctx) {
  const store = ctx.state.store || {};
  return wrap('127:5855', `${pageHeading(ctx.state.seller.hasStore ? '매장 / 픽업 정보' : '매장 정보를 입력해 주세요', '구매자에게 표시할 픽업 장소와 연락처를 확인해 주세요.')}${notice('매장 정보를 저장해도 판매자 승인 상태는 바뀌지 않아요. 운영팀의 판매자 승인이 완료되면 원단을 등록할 수 있어요.', 'warning')}<form id="seller-store-form" class="panel seller-panel"><h2>매장 / 픽업 정보</h2>${field('매장명', 'store_name', { value: store.store_name || '', required: true, attrs: 'maxlength="100"' })}${field('픽업 주소', 'address', { value: store.address || '', required: true, attrs: 'maxlength="255"' })}${field('상세 위치', 'detail_address', { value: store.detail_address || '', attrs: 'maxlength="255"' })}${field('매장 연락처', 'phone_number', { value: store.phone_number || '', type: 'tel', required: true, attrs: 'maxlength="20"' })}${field('휴무일', 'closed_days', { value: store.closed_days || '', attrs: 'maxlength="100"' })}<label class="field"><span>픽업 가능 요일 / 시간 및 안내</span><textarea name="pickup_guide" rows="3" maxlength="5000">${esc(store.pickup_guide || '')}</textarea></label><div class="actions">${button('매장 정보 저장', { type: 'submit', tone: 'primary' })}${go('나중에 입력', '/seller/dashboard')}</div></form>`);
}

function uploadView(ctx) {
  const upload = ctx.state.upload;
  if (!upload) return wrap('210:8608', emptyState('진행 중인 등록이 없어요', '원단 내용을 확인한 뒤 승인 신청을 보내 주세요.', go('내 원단 목록', '/seller/fabrics')));
  const content = {
    CREATING: ['원단을 등록하고 있어요', '등록 내용을 저장하는 중입니다.', '등록이 완료되면 선택한 사진을 이어서 업로드해요. 잠시만 기다려 주세요.'],
    UPLOADING: ['사진을 업로드하고 있어요', '등록한 원단에 사진을 첨부하는 중입니다.', '사진 업로드가 끝나면 승인 신청 완료 화면으로 이동해요. 사진은 게시물 표시용이며 AI 분석에 사용하지 않아요.'],
    PARTIAL: ['일부 사진을 업로드하지 못했어요', '원단 정보는 저장되어 있어요.', '원단을 새로 등록하지 않고 실패한 사진만 다시 업로드해 주세요. 이미 올라간 사진은 유지됩니다.'],
    UNKNOWN: ['등록 결과를 확인하지 못했어요', '입력한 내용은 유지되어 있어요.', '원단이 등록되었는지 먼저 내 원단 목록에서 확인해 주세요. 지금 다시 등록하면 중복될 수 있어요.'],
    DONE: ['승인 신청을 보냈어요', '운영팀이 원단 정보를 확인하고 있어요.', '원단 정보와 선택한 사진이 모두 저장되었어요. 승인되면 구매자에게 게시돼요.'],
  }[upload.stage] || ['등록 상태를 확인해 주세요', '', '내 원단 목록에서 현재 상태를 확인할 수 있어요.'];
  const id = { CREATING: '210:8608', UPLOADING: '210:8618', PARTIAL: '210:8628', UNKNOWN: '210:8638', DONE: ctx.state.draft?.sale_type === 'SCRAP' ? '210:8648' : '127:6713' }[upload.stage];
  const saved = ctx.state.fabrics.find(f=>f.id===upload.fabric_id);
  return wrap(id, `${pageHeading(content[0], content[1])}${notice(content[2], upload.stage === 'UNKNOWN' ? 'warning' : 'info')}${upload.stage==='DONE'&&saved?record(saved.title,details(fabricRows(saved)),{status:'승인 대기'}):''}${['CREATING', 'UPLOADING'].includes(upload.stage) ? '<div class="seller-progress" role="status"><span class="seller-spinner" aria-hidden="true"></span>잠시만 기다려 주세요.</div>' : ''}<div class="actions">${upload.stage === 'PARTIAL' ? action('실패한 사진 다시 시도', 'retry-photos', 'primary') : ''}${!['CREATING', 'UPLOADING'].includes(upload.stage) ? go(upload.stage === 'DONE' ? '승인 대기 목록' : '내 원단 목록 확인', upload.stage === 'DONE' ? '/seller/fabrics?status=PENDING' : '/seller/fabrics', upload.stage === 'UNKNOWN' ? 'primary' : 'secondary') : ''}${upload.stage === 'DONE' ? go('메인으로', '/seller/dashboard') + action('다른 원단 등록', 'new-draft') : ''}</div>`, 'seller-state');
}

function reservationsView(ctx) {
  const status = ctx.query.get('status') || 'REQUESTED';
  const items = ownReservations(ctx.state).filter(r => (status === 'ALL' || r.status === status) && (!ctx.query.get('fabric') || r.fabric_id === ctx.query.get('fabric')));
  const selected = items.find(r => r.id === ctx.query.get('id')) || items[0];
  const fabric = selected && (ctx.state.fabrics.find(f => f.id === selected.fabric_id) || {id:selected.fabric_id,title:selected.fabric_title,price:selected.display_price,sale_type:selected.sale_type,status:'SOLD_OUT',material:'',color:'',remaining_length_cm:0});
  let body = emptyState('해당 상태의 예약이 없어요', '다른 상태를 선택해 예약 내역을 확인하세요.');
  if (selected && fabric) {
    const roll = selected.sale_type === 'ROLL', available = fabric.available_length_cm ?? ((fabric.remaining_length_cm || 0) - (fabric.reserved_length_cm || 0));
    const guidance = {
      REQUESTED: ['재고 확인 후 처리', '이번 요청 수량', '실제 남은 원단과 픽업 가능 시간을 확인해 주세요.'],
      ACCEPTED: ['수령 확인', '이번 예약 확보 수량', '원단을 전달한 뒤 수령 완료로 처리해 주세요. 수령 완료 시 남은 재고에서 전달한 수량이 차감돼요.'],
      PICKED_UP: ['수령 완료 · 현재 재고', '전달한 수량', '전달한 수량을 재고에 반영했어요. 완료된 예약은 다시 처리하거나 취소할 수 없어요.'],
      REJECTED: ['거절된 예약 · 현재 재고', '거절한 요청 수량', '예약 요청을 거절했어요. 이 요청으로 확보되거나 차감된 재고는 없어요.'],
      CANCELED: ['취소된 예약 · 현재 재고', '취소한 수량', '취소된 예약은 재고를 확보하지 않아요. 처리 내역과 현재 판매 가능한 재고를 확인할 수 있어요.'],
    }[selected.status];
    body = `<div class="seller-columns"><section class="panel seller-panel"><h2>${selected.status === 'REQUESTED' ? '새 픽업 예약 요청' : RESERVATION_STATUS[selected.status] + ' 예약'}</h2><div class="seller-product-cell">${fabricImage(fabric, 'seller-reservation-image')}<div><h3>${esc(selected.fabric_title)}</h3><p class="muted">${esc(fabric.material)} · ${esc(fabric.color)}</p></div></div>${details([['구매자', selected.buyer_nickname], ['요청 수량', roll ? formatLength(selected.requested_length_cm) : '1장'], ['픽업 희망일', `${selected.pickup_date} ${selected.pickup_time}`], ['구매 요청 금액', formatPrice(selected.display_price ?? selected.estimated_price ?? fabric.price)], ['요청 사항', selected.memo || '없음']])}${badge(`현재 상태: ${RESERVATION_STATUS[selected.status]}`, tone(selected.status))}</section><section class="panel seller-panel"><h2>${guidance[0]}</h2>${details(roll ? [['현재 남은 길이', formatLength(fabric.remaining_length_cm)], ['현재 수락된 예약 길이', formatLength(fabric.reserved_length_cm || 0)], [guidance[1], formatLength(selected.requested_length_cm)], ['현재 판매 가능 길이', formatLength(available)]] : [['판매 형태', '자투리 · 1장'], ['현재 원단 상태', FABRIC_STATUS[fabric.status]]])}${notice(guidance[2])}${selected.reject_reason ? notice(selected.reject_reason, 'error') : ''}<div class="actions seller-reservation-actions">${selected.status === 'REQUESTED' ? go('거절', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=REJECTED`, 'danger') + go('수락', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=ACCEPTED`, 'primary') : selected.status === 'ACCEPTED' ? go('예약 취소', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=CANCELED`, 'danger') + go('수령 완료', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=PICKED_UP`, 'primary') : '<p class="muted">처리가 완료된 예약이에요.</p>' + (selected.status === 'PICKED_UP' && ctx.state.fabrics.some(f=>f.id===selected.fabric_id) ? go('변경된 재고 확인', `/seller/fabrics/detail?id=${encodeURIComponent(selected.fabric_id)}&after=pickup`) : '')}</div></section></div>`;
  }
  return wrap({ACCEPTED:'127:7621',REJECTED:'127:7753',PICKED_UP:'127:7892',CANCELED:'127:8022'}[status] || '123:4387', `${pageHeading({ACCEPTED:'수락된 예약',REJECTED:'거절된 예약',PICKED_UP:'수령 완료 예약',CANCELED:'취소된 예약'}[status] || '판매 내역', ['PICKED_UP','REJECTED','CANCELED'].includes(status) ? '처리 결과와 현재 재고를 확인하세요.' : '픽업 예약 내용을 확인하고 처리하세요.')}${statusTabs('/seller/reservations', { ALL: '전체', ...RESERVATION_STATUS }, status)}${items.length > 1 ? `<nav class="seller-reservation-list" aria-label="예약 선택">${items.map(r => `<a href="${href(`/seller/reservations?status=${status}&id=${encodeURIComponent(r.id)}`)}" class="button ${selected?.id === r.id ? 'seller-tab--active' : ''}">${esc(r.fabric_title)} · ${esc(r.pickup_date)}</a>`).join('')}</nav>` : ''}${body}<dialog id="seller-reservation-dialog" class="seller-dialog" aria-labelledby="seller-dialog-title"><form id="seller-reservation-confirm" class="seller-panel"><h2 id="seller-dialog-title">예약을 처리할까요?</h2><p id="seller-dialog-description"></p><div class="actions">${button('돌아가기', { attrs: 'data-close-dialog' })}${button('확인', { type: 'submit', tone: 'primary' })}</div></form></dialog>`);
}

function inquiriesView(ctx) {
  const done = ctx.query.get('status') === 'DONE', own = ownFabrics(ctx.state);
  const items = ctx.state.inquiries.filter(i => own.some(f => f.id === i.fabric_id) && Boolean(i.answer) === done);
  const selected = items.find(i => i.id === ctx.query.get('id')) || items[0];
  return wrap('123:4559', `${pageHeading('문의 내역', '구매자의 문의와 답변 내용을 확인하세요.')}${statusTabs('/seller/inquiries', { WAITING: '답변 대기', DONE: '답변 완료' }, done ? 'DONE' : 'WAITING')}<div class="seller-inquiries"><section class="panel seller-panel"><h2>문의 목록</h2>${items.length ? `<div class="table-wrapper"><table class="data-table"><thead><tr><th>일자</th><th>원단</th><th>상태</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.created_at)}</td><td><a href="${href(`/seller/inquiries?status=${done ? 'DONE' : 'WAITING'}&id=${encodeURIComponent(i.id)}`)}">${esc(i.fabric_title)}</a></td><td>${badge(done ? '답변 완료' : '답변 대기', done ? 'green' : 'amber')}</td></tr>`).join('')}</tbody></table></div>` : emptyState('문의가 없어요', '새 문의가 들어오면 이곳에서 확인할 수 있어요.')}</section><section class="panel seller-panel"><h2>선택한 문의</h2>${selected ? `<h3>${esc(selected.fabric_title)}</h3><p class="muted">${esc(selected.created_at)}</p>${notice(selected.content)}<div class="field"><span>판매자 답변</span><p class="seller-answer">${esc(selected.answer || '아직 등록된 답변이 없어요.')}</p></div><form id="seller-inquiry-form" class="stack" data-inquiry-id="${esc(selected.id)}"><label class="field"><span>${selected.answer ? '답변 수정' : '답변 작성'}</span><textarea name="answer" rows="4" required maxlength="1000" placeholder="구매자에게 답변을 남겨 주세요.">${esc(selected.answer || '')}</textarea></label>${button('답변 등록', {type:'submit',tone:'primary'})}</form>` : '<p class="muted">확인할 문의를 선택해 주세요.</p>'}</section></div>`);
}

function profileView(ctx) {
  const s = ctx.state.seller, store = ctx.state.store || {};
  return wrap('123:4699', `${pageHeading('마이페이지', '계정과 매장 정보를 최신 상태로 관리하세요.')}<form id="seller-profile-form" class="seller-columns"><section class="panel seller-panel"><h2>계정 정보</h2>${field('닉네임', 'nickname', { value:s.nickname, required:true, attrs:'maxlength="50"' })}${field('로그인 이메일 · 변경 불가', 'email', { value:s.email, readonly:true })}${field('연락처', 'phone_number', { value:s.phone_number || '', type:'tel', attrs:'maxlength="20"' })}${badge(s.seller_approval_status === 'APPROVED' ? '승인 완료' : s.seller_approval_status === 'REJECTED' ? '승인 거절' : '승인 대기', tone(s.seller_approval_status))}${go('판매자 승인 상태 확인', '/seller/approval')}</section><section class="panel seller-panel"><h2>매장 / 픽업 정보</h2>${field('매장명', 'store_name', { value:store.store_name || '', required:true, attrs:'maxlength="100"' })}${field('픽업 주소 / 상세 위치', 'address', { value:store.address || '', required:true, attrs:'maxlength="255"' })}${field('매장 연락처', 'store_phone', { value:store.phone_number || '', required:true, type:'tel', attrs:'maxlength="20"' })}<label class="field"><span>픽업 가능 요일 / 시간</span><textarea name="pickup_guide" maxlength="5000" rows="3">${esc(store.pickup_guide || '')}</textarea></label>${button('변경 사항 저장', {type:'submit',tone:'primary'})}${go('매장 정보 전체 수정', '/seller/store')}</section></form><div class="actions">${button('로그아웃', {attrs:'data-logout="SELLER"'})}</div>`);
}

function savedView() {
  return wrap('127:5927', `${pageHeading('변경 사항을 저장했어요', '계정 및 매장 정보')}${notice('입력한 정보가 저장되었어요.')}${record('다음 단계', details([['원단 등록', '매장 정보와 판매자 승인이 모두 확인되어야 원단을 등록할 수 있어요.'], ['정보 확인', '마이페이지에서 변경한 내용을 확인할 수 있어요.']]))}<div class="actions">${go('마이페이지 확인','/seller/profile','primary')}${go('메인으로','/seller/dashboard')}${go('새 원단 등록','/seller/register')}</div>`);
}

function newDashboardView(ctx) {
  const own = ownFabrics(ctx.state), rs = ownReservations(ctx.state);
  return wrap('144:6910', `${pageHeading('판매를 시작할 준비를 해볼까요?', '매장 정보와 판매자 승인 상태를 확인해 주세요.')}${notice('상품을 등록하기 전에 구매자가 방문할 매장 정보를 입력해 주세요.','warning')}${record('나의 판매 현황', details([['등록 원단',`${own.length}개`],['픽업 요청',`${rs.filter(r=>r.status==='REQUESTED').length}건`],['새 문의',`${ctx.state.inquiries.filter(i=>own.some(f=>f.id===i.fabric_id)&&!i.answer).length}건`]]))}${record('매장 정보 등록','<p>매장 등록과 판매자 승인을 모두 마치면 원단을 등록할 수 있어요.</p>',{meta:'매장명 · 픽업 주소 · 연락처 · 운영 시간',status:ctx.state.seller.hasStore?'등록됨':'입력 필요',actions:go('매장 정보 입력','/seller/store','primary')+go('새 원단 등록','/seller/register')})}`);
}

function typeView(ctx) {
  const ai = ctx.query.get('mode') === 'ai';
  const next = type => `/seller/register/${ai?'ai':'manual'}?type=${type}`;
  return wrap(ai?'127:6105':'127:6016',`${pageHeading(ai?'어떤 형태의 원단인가요?':'어떤 형태로 판매하나요?',ai?'AI 등록 도우미 · 예시 대화':'직접 입력 · 판매 형태 선택')}${ai?notice('판매 형태에 맞춰 필요한 정보를 하나씩 확인해요. 이 화면은 AI 연결 전 예시 흐름이에요.'):''}${record('롤 원단','<p>폭은 그대로 두고 길이 방향으로 90cm(1마) 단위로 판매해요.</p>',{status:'길이로 판매',meta:'재고 · 이월 원단',actions:go(ai?'롤 원단으로 시작':'롤 원단 입력',next('ROLL'),'primary')})}${record('자투리 원단','<p>길이 30~90cm의 원단 1장을 등록해요. 사용 가능한 직사각형의 치수를 입력해 주세요.</p>',{status:'1장 그대로 판매',meta:'롤을 팔고 남은 끝단',actions:go(ai?'자투리 원단으로 시작':'자투리 원단 입력',next('SCRAP'),'primary')})}<div class="actions">${go('이전','/seller/register')}</div>`);
}

function aiView(ctx) {
  const draft=draftFor(ctx), scrap=draft.sale_type==='SCRAP', step=ctx.query.get('step')||'chat', manual=`/seller/register/manual?type=${draft.sale_type}`;
  const message=(ctx.state.ai?.sale_type===draft.sale_type?ctx.state.ai.message:'') || draft.ai_request || '';
  const example=scrap?'아이보리 면 거즈예요. 가로 110cm, 세로 80cm이고 얇아요. 하자는 없고 한 장에 8,000원이에요.':'내추럴 색상의 면 캔버스예요. 폭은 150cm이고 5마 남았어요. 두께는 보통이고 하자는 없어요. 1마당 5,000원입니다.';
  const disclosure=notice('예시 AI 대화예요. 입력한 설명을 보관하고 정해진 예시 초안을 보여줘요. 실제 AI 요청은 보내지 않아요.');
  if(step==='processing') return wrap('127:6487',`${pageHeading('답변을 정리하고 있어요','AI 등록 도우미 · 예시 처리 중')}${disclosure}${record('보낸 답변',`<p>${esc(message||'입력한 답변을 확인하고 있어요.')}</p>`)}<div class="seller-progress" role="status"><span class="seller-spinner" aria-hidden="true"></span>예시 초안을 준비하고 있어요.</div><div class="actions">${go('직접 입력으로 계속',manual)}</div>`);
  if(step==='error') return wrap('127:6588',`${pageHeading('응답을 받지 못했어요','AI 응답 실패 예시')}${notice('지금까지 입력한 내용은 유지했어요. 직접 입력에서 이어서 확인해 주세요.','error')}${record('유지된 항목',details(fabricRows(draft)))}${record('보낸 답변',`<p>${esc(message||'아직 입력한 답변이 없어요.')}</p>`)}<div class="actions">${go('직접 입력으로 계속',manual,'primary')}${go('등록 방식으로','/seller/register')}</div>`);
  if(step==='result') return wrap('127:6528',`${pageHeading('AI가 정리한 내용을 확인해 주세요','예시 초안 · 판매자 확인 전에는 게시되지 않아요.')}${disclosure}${record('정리된 등록 항목',details(fabricRows(draft)))}${message?record('입력한 설명',`<p>${esc(message)}</p>`):''}<div class="actions">${go('등록 내용 확인','/seller/register/review','primary')}${go('항목 직접 수정',manual)}${go('사진 추가',manual)}</div>`);
  const form=`<form id="seller-ai-form" class="panel seller-panel" data-sale-type="${draft.sale_type}"><h2>판매자 답변</h2><label class="field"><span>메시지</span><textarea name="ai_request" rows="3" required maxlength="1000" placeholder="원단에 대해 알려주세요.">${esc(message||example)}</textarea></label><div class="actions">${button(scrap?'답변 정리하기':'보내기',{type:'submit',tone:'primary'})}${button('직접 입력으로 계속',{type:'submit',attrs:'data-ai-direct'})}${button('응답 실패 예시 보기',{type:'submit',attrs:'data-ai-error'})}</div></form>`;
  if(scrap) return wrap('127:6410',`${pageHeading('자투리 정보를 알려주세요','AI 등록 도우미 · 입력한 내용은 직접 입력으로 이어갈 수 있어요.')}${disclosure}${record('원단 등록 도우미','<p>자투리의 가로와 세로, 소재, 두께와 장당 가격을 알려주세요.</p>',{status:'AI 질문'})}${form}${notice('사진으로 치수나 소재를 자동 판별하지 않아요. 알려주신 값을 확인해 주세요.')}`);
  return wrap('123:3842',`${pageHeading('원단 등록 · AI와 대화로','대화로 정리한 내용을 직접 확인하고 수정할 수 있어요.')}${disclosure}<div class="seller-ai-layout"><div class="stack">${record('원단 등록 도우미',`<div class="seller-chat">${notice('어떤 원단을 판매하시나요? 소재와 남은 길이를 알려주세요.')}<p class="seller-chat-user">${esc(message||example)}</p>${notice('예시 초안에 소재와 치수를 정리했어요. 두께, 하자 여부와 가격도 확인해 주세요.')}</div>`)}${form}</div>${record('정리된 등록 항목',`${details([['판매 형태','롤 원단'],['원단 이름',draft.title],['폭',`${draft.width_cm}cm`],['남은 길이',formatLength(draft.remaining_length_cm)],['소재',draft.material],['두께',draft.thickness],['색상 계열',draft.color],['하자',draft.has_defect?draft.defect_note:'없음'],['90cm당 가격',formatPrice(draft.price)]])}<div class="seller-ai-thumbs">${PHOTO_SLOTS.map(([,label,texture])=>fabricImage({title:label,texture})).join('')}</div>`,{actions:action('+ 사진 추가','ai-continue','secondary',`data-path="${manual}"`)+action('항목 직접 수정','ai-continue','secondary',`data-path="${manual}"`)+action('등록 내용 확인','ai-continue','primary','data-path="/seller/register/review"')})}</div>`);
}

function photoView(ctx) {
  const d=draftFor(ctx);
  return wrap('127:6637',`${pageHeading('선택한 사진을 확인해 주세요','전체 사진 · 선택 완료 상태')}${fabricImage({title:d.title,texture:d.sale_type==='ROLL'?'canvas':'linen'},'seller-banner-image')}${notice(`선택한 사진 ${d.photo_names?.length||0}장 · ${(d.photo_names||[]).join(', ')||'아직 선택한 사진이 없어요.'}`)}${record('사진 용도',details([['전체 사진','원단 전체 형태를 보여 주세요.'],['확대 / 하자 사진','필요한 경우 추가해 주세요.'],['확인','사진은 상세 표시용이며 치수·혼용률을 자동 판별하지 않아요.']]))}<div class="actions">${go('입력 화면으로 돌아가기',`/seller/register/manual?type=${d.sale_type}`,'primary')}</div>`);
}

function inputErrorView(ctx) {
  const d=draftFor(ctx), message=validateSellerDraft(d)||'입력한 항목과 사진을 다시 확인해 주세요.';
  return wrap('127:8297',`${pageHeading('입력한 항목을 확인해 주세요','원단 등록 내용을 확인하지 못했어요.')}${notice(message,'error')}${record('확인이 필요한 항목',`${field('사용 가능 세로(길이) · cm','error_length',{value:d.sale_type==='ROLL'?d.remaining_length_cm:d.length_cm,readonly:true})}${field('가격','error_price',{value:d.price,readonly:true})}${field('사진','error_photos',{value:(d.photo_names||[]).join(', ')||'미선택',readonly:true})}`)}<div class="actions">${go('입력 수정',`/seller/register/manual?type=${d.sale_type}`,'primary')}${go('롤로 등록하기','/seller/register/manual?type=ROLL')}</div>`);
}

function fabricStatusView(ctx,status,items) {
  const meta={POSTED:['127:6779','게시 중인 원단','구매자에게 공개된 원단을 관리하세요.'],PENDING:['127:6879','승인 대기 중인 원단','등록 내용을 저장했어요. 운영팀 승인 후 구매자에게 공개돼요.'],REJECTED:['127:7011','승인 거절 사유를 확인해 주세요','내용을 보완하고 다시 승인 신청할 수 있어요.'],SOLD_OUT:['127:7076','판매 완료 원단','현재 구매자에게 노출되지 않는 원단이에요.']}[status];
  return wrap(meta[0],`${pageHeading(meta[1],meta[2])}${statusTabs('/seller/fabrics',{ALL:'전체',...FABRIC_STATUS},status)}${items.length?items.map(f=>record(f.title,`<p>${esc(f.reject_reason || `${formatPrice(f.price)} / ${f.sale_type==='ROLL'?'90cm':'1장'}`)}</p>`,{status:FABRIC_STATUS[f.status],meta:`${f.sale_type==='ROLL'?'롤':'자투리'} · 폭 ${f.width_cm}cm · 길이 ${f.remaining_length_cm??f.length_cm}cm`,actions:go(status==='REJECTED'?'내용 보완하기':status==='PENDING'?'등록 내용 확인':'상세보기',fabricRoute(f,status==='REJECTED'?'edit':'detail'),status==='REJECTED'?'primary':'secondary')+(status==='POSTED'?go('삭제',fabricRoute(f,'delete'),'danger'):'')})).join(''):emptyState('해당 상태의 원단이 없어요','다른 상태를 선택해 주세요.')}${status==='SOLD_OUT'?notice('롤은 남은 길이가 90cm 미만이면 판매 완료로 처리해요. 남은 원단을 판매하려면 자투리로 새로 등록해 주세요.'):''}<div class="actions">${go('새 원단 등록','/seller/register','primary')}</div>`);
}

function fabricDetailView(ctx) {
  const f=fabricByQuery(ctx);if(!f)return missing('127:7149');
  const after=ctx.query.get('after')==='pickup';
  return wrap(after?'129:5726':'127:7149',`${pageHeading(after?'내 원단 목록':'내 원단 상세',after?'수령 확인으로 변경된 원단 재고를 확인하세요.':f.title)}${after?notice('수령 완료된 수량을 현재 남은 길이에 반영했어요.'):fabricImage(f,'seller-banner-image')}${record('원단 정보',`${details(fabricRows(f))}${f.reject_reason?notice(`거절 사유: ${f.reject_reason}`,'error'):''}`,{status:FABRIC_STATUS[f.status]})}${record('재고 현황',details(stockRows(f)))}<div class="actions">${f.status!=='SOLD_OUT'?go(f.status==='REJECTED'?'내용 보완하기':'정보 수정',fabricRoute(f,'edit'),'primary'):''}${go('판매 내역 확인',`/seller/reservations?status=ALL&fabric=${encodeURIComponent(f.id)}`)}${go('삭제',fabricRoute(f,'delete'),'danger')}${go('원단 목록','/seller/fabrics')}</div>`);
}

function fabricEditView(ctx) {
  const f=fabricByQuery(ctx);if(!f)return missing('127:7250');
  if(f.status==='SOLD_OUT')return wrap('127:7076',`${pageHeading('판매 완료 원단은 수정할 수 없어요')}${go('원단 상세로',fabricRoute(f))}`);
  const d=draftFor(ctx), rejected=f.status==='REJECTED',scrap=f.sale_type==='SCRAP';
  return wrap(rejected?'127:7322':'127:7250',`${pageHeading(rejected?'거절된 원단 보완':'원단 정보 수정',rejected?`${f.title} · 승인 거절 항목 수정`:'게시 중인 원단의 수정 내용은 저장 즉시 반영돼요.')}${notice(rejected?`거절 사유: ${f.reject_reason||'등록 내용을 확인해 주세요.'}`:`예약된 길이 ${formatLength(f.reserved_length_cm||0)}보다 재고를 적게 변경할 수 없어요.`,rejected?'error':'warning')}<form id="seller-fabric-form" class="panel seller-panel" data-sale-type="${f.sale_type}" data-edit-id="${esc(f.id)}"><h2>${rejected?'보완한 내용':'원단 정보'}</h2>${field('원단 이름','title',{value:d.title,required:true,attrs:'maxlength="100"'})}${field('판매 형태','sale_type_label',{value:scrap?'자투리':'롤',readonly:true})}<div class="form-grid">${field('가로(폭) · cm','width_cm',{value:d.width_cm,type:'number',required:true,attrs:'min="1" max="1000" step="1"'})}${field(scrap?'세로(길이) · cm':'남은 길이 · cm','length_cm',{value:scrap?d.length_cm:d.remaining_length_cm,type:'number',required:true,attrs:`min="${scrap?30:Math.max(90,f.reserved_length_cm||0)}" ${scrap?'max="90"':''} step="1"`})}</div>${field(scrap?'가격 · 원/장':'가격 · 원/90cm','price',{value:d.price,type:'number',required:true,attrs:'min="1" step="1"'})}<label class="field"><span>판매자 설명</span><textarea name="description" rows="3" maxlength="5000">${esc(d.description||'')}</textarea></label><label class="seller-defect"><input type="checkbox" name="has_defect" value="true" ${d.has_defect?'checked':''}> 하자 있음</label>${field('하자 위치 / 내용 / 크기','defect_note',{value:d.defect_note||'',attrs:'maxlength="255"'})}${rejected?photosFields(d):''}<div class="actions">${button(rejected?'확인 후 다시 승인 신청':'수정 내용 저장',{type:'submit',tone:'primary'})}${go('취소',fabricRoute(f))}</div></form>`);
}

function deleteView(ctx) {
  const f=fabricByQuery(ctx);if(!f)return missing('127:7448');
  const active=ownReservations(ctx.state).filter(r=>r.fabric_id===f.id&&['REQUESTED','ACCEPTED'].includes(r.status));
  if(active.length)return wrap('127:7402',`${pageHeading('진행 중인 예약을 확인해 주세요','원단 삭제 제한')}${notice('요청됨 또는 수락됨 상태의 예약이 있어 원단을 삭제할 수 없어요.','warning')}${record(f.title,details(active.map(r=>['진행 중 예약',`${r.buyer_nickname} · ${RESERVATION_STATUS[r.status]} · ${r.sale_type==='ROLL'?formatLength(r.requested_length_cm):'1장'}`])))}<div class="actions">${go('판매 내역 확인',`/seller/reservations?status=ALL&fabric=${encodeURIComponent(f.id)}`,'primary')}${go('원단 상세로',fabricRoute(f))}</div>`);
  return wrap('127:7448',`${pageHeading(`${f.sale_type==='SCRAP'?'자투리':'롤'} 원단 상세 · 삭제 확인`,`${f.title} · 진행 중인 예약 없음`)}${notice('삭제하면 원단이 구매자 목록에서 사라져요.','warning')}${record('삭제할 원단',details(fabricRows(f)))}<div class="actions">${action('원단 삭제','delete-fabric','danger',`data-id="${esc(f.id)}"`)}${go('취소',fabricRoute(f))}</div>`);
}

function deletedView(ctx) {
  return wrap('127:7497',`${pageHeading('원단을 삭제했어요','삭제한 원단은 구매자에게 표시되지 않아요.')}${notice('원단을 삭제했어요. 구매자에게 표시되지 않아요.')}${record('남은 원단',`<div class="table-wrapper"><table class="data-table"><thead><tr><th>원단</th><th>판매 형태</th><th>상태</th></tr></thead><tbody>${ownFabrics(ctx.state).map(f=>`<tr><td><a href="#${fabricRoute(f)}">${esc(f.title)}</a></td><td>${f.sale_type==='ROLL'?'롤':'자투리'}</td><td>${esc(FABRIC_STATUS[f.status])}</td></tr>`).join('')}</tbody></table></div>`)}<div class="actions">${go('메인으로','/seller/dashboard','primary')}${go('새 원단 등록','/seller/register')}</div>`);
}

function calendarView(ctx) {
  const now=new Date(),fallback=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,month=/^\d{4}-(0[1-9]|1[0-2])$/.test(ctx.query.get('month')||'')?ctx.query.get('month'):fallback;
  const [year,num]=month.split('-').map(Number),rs=ownReservations(ctx.state).filter(r=>r.status==='ACCEPTED'&&r.pickup_date.startsWith(month)),offset=new Date(year,num-1,1).getDay(),days=new Date(year,num,0).getDate();
  const monthRoute=shift=>{const d=new Date(year,num-1+shift,1);return`/seller/calendar?month=${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
  const source=num===9?'142:6789':num===11?'142:7090':'142:6919';
  return wrap(source,`${pageHeading('픽업 일정','월별 픽업 일정을 확인하세요.')}<div class="actions">${go('이전 달',monthRoute(-1))}${go('대시보드로','/seller/dashboard')}${go('다음 달',monthRoute(1))}</div>${record(`${year}년 ${num}월`,`<div class="seller-calendar seller-calendar-full">${['일','월','화','수','목','금','토'].map(x=>`<span class="seller-calendar-weekday">${x}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`,items=rs.filter(r=>r.pickup_date===date);return `<a class="seller-calendar-day ${items.length?'has-pickup':''}" href="#/seller/calendar?month=${month}&date=${date}"><span>${i+1}${items.length?` · 픽업 ${items.length}건`:''}</span></a>`;}).join('')}</div>`)}${rs.filter(r=>!ctx.query.get('date')||r.pickup_date===ctx.query.get('date')).map(r=>record(r.fabric_title,`<p>${esc(r.buyer_nickname)} · ${esc(r.pickup_date)} ${esc(r.pickup_time)} · ${r.sale_type==='ROLL'?formatLength(r.requested_length_cm):'1장'}</p>`,{status:'수락됨',actions:go('판매 내역 확인',`/seller/reservations?status=ACCEPTED&id=${encodeURIComponent(r.id)}`,'primary')})).join('')||notice(`${num}월${ctx.query.get('date')?' 선택한 날짜에는':'에는'} 등록된 픽업 일정이 없어요.`)}`);
}

function reservationConfirmView(ctx) {
  const r=ownReservations(ctx.state).find(x=>x.id===ctx.query.get('id')),next=ctx.query.get('action'),f=r&&ctx.state.fabrics.find(x=>x.id===r.fabric_id);
  if(!r||!f)return wrap('127:7558',emptyState('예약을 찾을 수 없어요','판매 내역에서 확인해 주세요.',go('판매 내역','/seller/reservations')));
  const data={ACCEPTED:['127:7558','예약을 수락할까요?','확인 후 수락','수락하면 요청 수량이 확보돼요. 실제 재고는 수령 완료 시 차감돼요.'],REJECTED:['127:7692','예약 거절 사유를 입력해 주세요','거절 확정','거절 사유는 구매자에게 표시돼요.'],PICKED_UP:['127:7829','원단 전달을 완료했나요?','전달 완료 · 수령 확인','수령 완료 후 요청 길이만큼 실제 재고가 차감되고 취소할 수 없어요.'],CANCELED:['127:7974','예약을 취소할까요?','예약 취소 확정','취소하면 확보했던 수량이 풀려 다른 구매자가 예약할 수 있어요.']}[next];
  if(!data||!(r.status==='REQUESTED'?['ACCEPTED','REJECTED']:r.status==='ACCEPTED'?['PICKED_UP','CANCELED']:[]).includes(next))return wrap('127:7558',emptyState('현재 상태에서는 처리할 수 없어요','예약 상태를 다시 확인해 주세요.',go('예약 확인',`/seller/reservations?status=${r.status}&id=${encodeURIComponent(r.id)}`)));
  return wrap(data[0],`${pageHeading(data[1],'재고와 픽업 일시를 다시 확인해 주세요.')}${record('예약 요청',details([['구매자',r.buyer_nickname],['원단 / 요청 길이',`${r.fabric_title} / ${r.sale_type==='ROLL'?formatLength(r.requested_length_cm):'1장'}`],['픽업 일시',`${r.pickup_date} ${r.pickup_time}`],['예상 금액',formatPrice(r.display_price??r.estimated_price??f.price)]]))}${notice(data[3],'warning')}${['ACCEPTED','PICKED_UP'].includes(next)?record('재고 현황',details(stockRows(f))):''}<form id="seller-reservation-page-confirm" class="panel seller-panel" data-reservation-id="${esc(r.id)}" data-status="${next}">${next==='REJECTED'?field('거절 사유','reason',{required:true,attrs:'maxlength="255" placeholder="거절 사유를 입력해 주세요."'}):''}${next==='CANCELED'?'<p class="muted">구매자와 취소 여부를 확인해 주세요.</p>':''}<div class="actions">${button(data[2],{type:'submit',tone:['REJECTED','CANCELED'].includes(next)?'danger':'primary'})}${go('돌아가기',`/seller/reservations?status=${r.status}&id=${encodeURIComponent(r.id)}`)}</div></form>`);
}

function inquiryAnsweredView(ctx) {
  const own=ownFabrics(ctx.state),i=ctx.state.inquiries.find(x=>x.id===ctx.query.get('id')&&own.some(f=>f.id===x.fabric_id));
  if(!i?.answer)return wrap('127:8098',emptyState('등록된 답변이 없어요','문의 내역에서 답변할 문의를 확인해 주세요.',go('문의 내역','/seller/inquiries')));
  return wrap('127:8098',`${pageHeading('답변을 등록했어요','구매자가 내 문의에서 답변을 확인할 수 있어요.')}${statusTabs('/seller/inquiries',{WAITING:'답변 대기',DONE:'답변 완료'},'DONE')}${record(i.fabric_title,`<p>${esc(i.content)}</p>`,{meta:i.created_at,status:'답변 완료'})}${record('판매자 답변',details([['답변',i.answer],['등록일',i.answered_at||i.created_at]]))}<div class="actions">${go('다른 문의 확인','/seller/inquiries')}</div>`);
}

export function renderSeller(ctx) {
  if (ctx.path.startsWith('/seller/register')) {
    if (ctx.state.seller.seller_approval_status !== 'APPROVED') return approvalView(ctx);
    if (!ctx.state.seller.hasStore) return approvalView(ctx, true);
    if (ctx.state.upload && ['CREATING', 'UPLOADING', 'PARTIAL', 'UNKNOWN'].includes(ctx.state.upload.stage)) return uploadView(ctx);
  }
  switch (ctx.path) {
    case '/seller/fabrics': return fabricsView(ctx);
    case '/seller/fabrics/detail': return fabricDetailView(ctx);
    case '/seller/fabrics/edit': return fabricEditView(ctx);
    case '/seller/fabrics/delete': return deleteView(ctx);
    case '/seller/fabrics/deleted': return deletedView(ctx);
    case '/seller/register': return registrationView(ctx);
    case '/seller/register/type': return typeView(ctx);
    case '/seller/register/ai': return aiView(ctx);
    case '/seller/register/photos': return photoView(ctx);
    case '/seller/register/error': return inputErrorView(ctx);
    case '/seller/register/manual': return manualView(ctx);
    case '/seller/register/review': return reviewView(ctx);
    case '/seller/store': return storeView(ctx);
    case '/seller/profile': return profileView(ctx);
    case '/seller/profile/saved': return savedView(ctx);
    case '/seller/calendar': return calendarView(ctx);
    case '/seller/approval': return approvalView(ctx, ctx.state.seller.seller_approval_status === 'APPROVED' && !ctx.state.seller.hasStore);
    case '/seller/upload': return uploadView(ctx);
    case '/seller/reservations': return reservationsView(ctx);
    case '/seller/reservations/confirm': return reservationConfirmView(ctx);
    case '/seller/inquiries': return inquiriesView(ctx);
    case '/seller/inquiries/answered': return inquiryAnsweredView(ctx);
    default: return dashboardView(ctx);
  }
}

function formDraft(form, previous = {}) {
  const data = new FormData(form), type = form.dataset.saleType;
  const length = Number(data.get('length_cm'));
  const slots=previous.photo_slots && Object.keys(previous.photo_slots).length ? previous.photo_slots : Object.fromEntries(PHOTO_SLOTS.map(([slot],i)=>[slot,previous.photo_names?.[i]]).filter(([,name])=>name));
  return { ...previous, sale_type: type, title: String(data.get('title') || '').trim(), material: String(data.get('material') || previous.material || '미확인'), thickness: String(data.get('thickness') || previous.thickness || ''), color: String(data.get('color') || previous.color || ''), color_detail: String(data.get('color_detail') ?? previous.color_detail ?? '').trim(), description:String(data.get('description') ?? previous.description ?? '').trim(), width_cm: Number(data.get('width_cm')), length_cm: length, remaining_length_cm: type === 'ROLL' ? length : null, price: Number(data.get('price')), has_defect: data.get('has_defect') === 'true', defect_note: String(data.get('defect_note') || '').trim(), photo_names: previous.photo_names || [], photo_slots: slots };
}

function unfinishedDraft(form, previous) {
  const draft = formDraft(form, previous), values = new FormData(form);
  // Keep empty and unfinished inputs exactly as entered until form submission.
  for (const key of ['title', 'color_detail', 'description', 'defect_note']) {
    if (values.has(key)) draft[key] = String(values.get(key));
  }
  for (const key of ['width_cm', 'length_cm', 'price']) {
    if (values.has(key)) draft[key] = values.get(key) === '' ? '' : Number(values.get(key));
  }
  if (draft.sale_type === 'ROLL') draft.remaining_length_cm = draft.length_cm;
  return draft;
}

export function validateSellerDraft(draft, requirePhoto = true) {
  if (!['ROLL', 'SCRAP'].includes(draft.sale_type)) return '판매 형태를 선택해 주세요.';
  if (!draft.title?.trim() || draft.title.length > 100) return '원단 이름을 1~100자로 입력해 주세요.';
  if (!Number.isSafeInteger(draft.width_cm) || draft.width_cm < 1 || draft.width_cm > 1000) return '가로(폭)는 1~1000cm 정수로 입력해 주세요.';
  const length = draft.sale_type === 'ROLL' ? draft.remaining_length_cm : draft.length_cm;
  if (!Number.isSafeInteger(length) || (draft.sale_type === 'ROLL' ? length < 90 : length < 30 || length > 90)) return draft.sale_type === 'ROLL' ? '롤 잔량은 90cm 이상인 정수로 입력해 주세요.' : '자투리 길이는 30~90cm 정수로 입력해 주세요.';
  if (!Number.isSafeInteger(draft.price) || draft.price < 1) return '가격은 1원 이상의 정수로 입력해 주세요.';
  if (draft.has_defect && !draft.defect_note?.trim()) return '하자 위치와 내용을 입력해 주세요.';
  if ((draft.defect_note || '').length > 255) return '하자 내용은 255자 이하로 입력해 주세요.';
  if (requirePhoto && !draft.photo_names?.length) return '원단 사진을 한 장 이상 선택해 주세요.';
  if ((draft.photo_names || []).length > 3) return '사진은 최대 3장까지 선택할 수 있어요.';
  return '';
}

export function bindSeller(ctx) {
  const controller = new AbortController(), { signal } = controller;
  let active = true, uploadTimer, aiTimer;
  const on = (target, type, listener) => target?.addEventListener(type, listener, { signal });
  const showError = message => { const target = ctx.root.querySelector('#seller-error'); if (target) { target.textContent = message; target.hidden = false; target.focus(); } else ctx.notify(message); };
  const run = async (target, task) => { if (target?.disabled) return; if (target) target.disabled = true; try { await task(); } catch (error) { if (active) showError(error.message || '처리하지 못했어요. 다시 확인해 주세요.'); } finally { if (active && target) target.disabled = false; } };
  const form = ctx.root.querySelector('#seller-fabric-form');
  const draftKey = form && (form.dataset.editId ? `seller:edit:${form.dataset.editId}` : `seller:register:${form.dataset.saleType}`);
  const remember = previous => {
    if (form && ctx.drafts) ctx.drafts.set(draftKey, unfinishedDraft(form, previous || draftFor({ ...ctx, state: ctx.api.getState() })));
  };
  on(form, 'input', () => remember());
  on(form, 'change', () => remember());
  if (form?.dataset.editId) on(form.querySelector('a'), 'click', () => ctx.drafts?.delete(draftKey));
  on(form, 'submit', event => { event.preventDefault(); if (!form.reportValidity()) return; const draft = formDraft(form, draftFor({ ...ctx, state: ctx.api.getState() })); const editId=form.dataset.editId; const message = validateSellerDraft(draft, !editId); if (message) { if(editId){showError(message);return;} run(event.submitter,async()=>{await ctx.api.saveDraft(draft);ctx.navigate(`/seller/register/error?type=${draft.sale_type}`);}); return; } run(event.submitter, async () => { if(editId){const fabric=await ctx.api.updateFabric(editId,draft);ctx.drafts?.delete(draftKey);ctx.notify(fabric.status==='PENDING'?'보완한 내용을 저장하고 승인 신청을 보냈어요.':'수정 내용을 저장했어요.');ctx.navigate(fabricRoute(fabric));}else{await ctx.api.saveDraft(draft);ctx.navigate('/seller/register/review');} }); });
  on(form, 'change', event => {
    const input = event.target.closest('[data-photo-slot]');
    if (!input?.files?.length) return;
    const file = input.files[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) { input.value = ''; showError('jpg·png·webp 사진만 선택해 주세요.'); return; }
    if (file.size > 5 * 1024 * 1024 || file.size === 0) { input.value = ''; showError('0바이트보다 크고 5MB 이하인 사진을 선택해 주세요.'); return; }
    const draft = formDraft(form, draftFor({ ...ctx, state: ctx.api.getState() }));
    draft.photo_slots = { ...draft.photo_slots, [input.dataset.photoSlot]: file.name };
    draft.photo_names = PHOTO_SLOTS.map(([slot]) => draft.photo_slots[slot]).filter(Boolean);
    run(input, async () => { await ctx.api.saveDraft(draft); remember(draft); if (active) ctx.refresh(); });
  });
  on(ctx.root.querySelector('#seller-store-form'), 'submit', event => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const fields = Object.fromEntries(new FormData(form)); for (const key of Object.keys(fields)) fields[key] = String(fields[key]).trim(); if (!fields.store_name || !fields.address || !fields.phone_number) { showError('매장명, 주소, 연락처를 입력해 주세요.'); return; } run(event.submitter, async () => { await ctx.api.saveStore(fields); ctx.navigate('/seller/profile/saved'); }); });
  on(ctx.root.querySelector('#seller-profile-form'),'submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));for(const key of Object.keys(data))data[key]=String(data[key]).trim();if(!data.nickname||!data.store_name||!data.address||!data.store_phone){showError('닉네임과 매장 정보를 입력해 주세요.');return;}run(event.submitter,async()=>{await ctx.api.updateSellerProfile({nickname:data.nickname,phone_number:data.phone_number});await ctx.api.saveStore({store_name:data.store_name,address:data.address,phone_number:data.store_phone,pickup_guide:data.pickup_guide});ctx.navigate('/seller/profile/saved');});});
  on(ctx.root.querySelector('#seller-ai-form'), 'submit', event => { event.preventDefault(); const form=event.currentTarget;if(!form.reportValidity())return;const message=String(new FormData(form).get('ai_request')||'').trim(),sale_type=form.dataset.saleType,direct=event.submitter?.hasAttribute('data-ai-direct'),error=event.submitter?.hasAttribute('data-ai-error');run(event.submitter,async()=>{await ctx.api.saveDraft({...draftFor(ctx),ai_request:message,description:message});if(direct){ctx.navigate(`/seller/register/manual?type=${sale_type}`);return;}try{await ctx.api.prepareAiDraft({sale_type,message});ctx.drafts?.delete(`seller:register:${sale_type}`);ctx.navigate(`/seller/register/ai?type=${sale_type}&step=${error?'error':'processing'}`);}catch{ctx.navigate(`/seller/register/ai?type=${sale_type}&step=error`);}}); });
  on(ctx.root.querySelector('#seller-inquiry-form'),'submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const content=String(new FormData(form).get('answer')||'').trim();if(!content||content.length>1000){showError('답변을 1~1,000자로 입력해 주세요.');return;}run(event.submitter,async()=>{await ctx.api.answerInquiry(form.dataset.inquiryId,content);ctx.navigate(`/seller/inquiries/answered?id=${encodeURIComponent(form.dataset.inquiryId)}`);});});
  on(ctx.root.querySelector('#seller-reservation-page-confirm'),'submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const reason=String(new FormData(form).get('reason')||'').trim();run(event.submitter,async()=>{await ctx.api.updateReservation(form.dataset.reservationId,form.dataset.status,reason);ctx.navigate(`/seller/reservations?status=${form.dataset.status}&id=${encodeURIComponent(form.dataset.reservationId)}`);});});
  on(ctx.root, 'click', event => {
    const target = event.target.closest('[data-seller-action]');
    if (!target || !ctx.root.contains(target)) return;
    const name = target.dataset.sellerAction;
    if(name==='new-draft'){run(target,async()=>{ctx.drafts?.delete('seller:register:ROLL');ctx.drafts?.delete('seller:register:SCRAP');await ctx.api.saveDraft(draftFor({...ctx,query:new URLSearchParams('type=ROLL'),state:{...ctx.api.getState(),draft:null}}));ctx.navigate('/seller/register');});return;}
    if(name==='review-photos'){run(target,async()=>{const draft=formDraft(form,draftFor({...ctx,state:ctx.api.getState()}));await ctx.api.saveDraft(draft);ctx.navigate(`/seller/register/photos?type=${draft.sale_type}`);});return;}
    if(name==='ai-continue'){const aiForm=ctx.root.querySelector('#seller-ai-form'),message=String(new FormData(aiForm).get('ai_request')||'').trim();if(!message){showError('원단 설명을 입력해 주세요.');return;}run(target,async()=>{await ctx.api.prepareAiDraft({sale_type:aiForm.dataset.saleType,message});ctx.drafts?.delete(`seller:register:${aiForm.dataset.saleType}`);ctx.navigate(target.dataset.path);});return;}
    if(name==='delete-fabric'){run(target,async()=>{await ctx.api.deleteFabric(target.dataset.id);ctx.navigate('/seller/fabrics/deleted');});return;}
    if (name === 'refresh-approval') { ctx.refresh(); ctx.notify('현재 승인 상태를 확인했어요.'); return; }
    if (name === 'remove-photo') { const draft = formDraft(form, draftFor({ ...ctx, state: ctx.api.getState() })); delete draft.photo_slots[target.dataset.slot]; draft.photo_names = PHOTO_SLOTS.map(([slot]) => draft.photo_slots[slot]).filter(Boolean); run(target, async () => { await ctx.api.saveDraft(draft); remember(draft); ctx.refresh(); }); return; }
    if (name === 'submit-fabric') { run(target, async () => { const state = ctx.api.getState(); if (!canRegister(state)) { ctx.navigate('/seller/approval'); return; } const validation = validateSellerDraft(state.draft || {}); if (validation) throw new Error(validation); target.textContent = '등록 중…'; try { const screen=ctx.root.querySelector('.seller-page'); if(screen) screen.outerHTML=uploadView({...ctx,state:{...state,upload:{stage:'CREATING'}}}); await new Promise(resolve=>setTimeout(resolve,300)); if(!active)return; try { await ctx.api.createFabric(); } catch (error) { if (!ctx.api.getState().upload) { ctx.refresh(); ctx.notify(error.message || '등록하지 못했어요. 입력 내용을 확인해 주세요.'); return; } } ctx.navigate('/seller/upload'); } finally { if (active) target.textContent = '확인 후 승인 신청'; } }); return; }
    if (name === 'retry-photos') { run(target, async () => { await ctx.api.retryPhotos(); if (active) ctx.refresh(); }); return; }
    if (name === 'reservation') {
      const dialog = ctx.root.querySelector('#seller-reservation-dialog'), confirmation = ctx.root.querySelector('#seller-reservation-confirm');
      const reason = ctx.root.querySelector('[name="reservation_reason"]')?.value.trim() || '';
      if (target.dataset.status === 'REJECTED' && (!reason || reason.length > 255)) { showError('거절 사유를 1~255자로 입력해 주세요.'); return; }
      confirmation.dataset.reservationId = target.dataset.id; confirmation.dataset.status = target.dataset.status; confirmation.dataset.reason = reason;
      const messages = { ACCEPTED: ['예약을 수락할까요?', '수락하면 구매자의 요청 수량이 확보돼요.'], REJECTED: ['예약을 거절할까요?', `거절 사유: ${reason}`], PICKED_UP: ['원단을 전달했나요?', '수령 완료로 처리하면 재고가 차감되며 예약을 취소할 수 없어요.'], CANCELED: ['예약을 취소할까요?', '확보된 수량이 다시 판매 가능한 재고로 돌아가요.'] }[target.dataset.status];
      ctx.root.querySelector('#seller-dialog-title').textContent = messages[0]; ctx.root.querySelector('#seller-dialog-description').textContent = messages[1]; dialog.showModal();
    }
  });
  const dialog = ctx.root.querySelector('#seller-reservation-dialog');
  on(ctx.root.querySelector('[data-close-dialog]'), 'click', () => dialog.close());
  on(ctx.root.querySelector('#seller-reservation-confirm'), 'submit', event => { event.preventDefault(); const form = event.currentTarget; run(event.submitter, async () => { await ctx.api.updateReservation(form.dataset.reservationId, form.dataset.status, form.dataset.reason || ''); dialog.close(); ctx.notify('예약 상태를 변경했어요.'); ctx.navigate(`/seller/reservations?status=${form.dataset.status}&id=${encodeURIComponent(form.dataset.reservationId)}`); }); });
  if (ctx.query.get('sample') !== '1' && ctx.state.upload?.stage === 'UPLOADING' && ctx.root.querySelector('[data-figma-node="210:8618"]')) { uploadTimer = setTimeout(() => { if (!active) return; ctx.api.uploadPhotos().then(() => { if (active) ctx.refresh(); }).catch(error => { if (active) showError(error.message); }); }, 450); }
  if(ctx.query.get('sample')!=='1'&&ctx.path==='/seller/register/ai'&&ctx.query.get('step')==='processing'&&ctx.root.querySelector('[data-figma-node="127:6487"]'))aiTimer=setTimeout(()=>{if(active)ctx.navigate(`/seller/register/ai?type=${ctx.query.get('type')==='SCRAP'?'SCRAP':'ROLL'}&step=result`);},650);
  return () => { active = false; clearTimeout(uploadTimer); clearTimeout(aiTimer); controller.abort(); if (dialog?.open) dialog.close(); };
}
