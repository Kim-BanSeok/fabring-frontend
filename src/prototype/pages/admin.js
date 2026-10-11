import {
  escapeHtml as esc,
  formatPrice,
  formatLength,
  badge,
  notice,
  pageHeading,
  button,
  emptyState,
  fabricImage,
  selectField,
} from '../shared/ui.js';
import './admin.css';

// Figma work page 122:12; exact reference responses live in docs/design-context/admin-*.txt.
const SELLER_STATUS = { PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '승인 거절' };
const FABRIC_STATUS = { PENDING: '승인 대기', POSTED: '게시 중', REJECTED: '승인 거절', SOLD_OUT: '판매 완료' };
const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', POSTED: 'green', REJECTED: 'red', SOLD_OUT: 'gray' };
const link = (path) => `#${path}`;
const detailPath = (kind, id) => `/admin/${kind}/${encodeURIComponent(id)}`;
const statusLabel = (status, labels) => labels[status] || '확인 필요';
const statusBadge = (status, labels) => badge(statusLabel(status, labels), STATUS_TONE[status] || 'gray');
const date = (value) => value ? String(value).slice(0, 10).replaceAll('-', '.') : '—';
const validStatus = (query, labels) => Object.hasOwn(labels, query.get('status')) ? query.get('status') : 'PENDING';

function details(entries, extraClass = '') {
  return `<dl class="admin-details ${extraClass}">${entries.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value ?? '—')}</dd></div>`).join('')}</dl>`;
}

function actionError() {
  return '<p class="admin-action-error notice notice--error" data-admin-error role="alert" tabindex="-1" hidden></p>';
}

function stateTabs(kind, active, labels) {
  return `<nav class="tabs admin-status-tabs" aria-label="${kind === 'sellers' ? '판매자 승인 상태' : '원단 등록 상태'}">${Object.entries(labels).map(([value, label]) => button(label, {
    href: link(`/admin/${kind}?status=${value}`),
    tone: active === value ? 'primary' : 'secondary',
    attrs: active === value ? 'aria-current="page"' : '',
  })).join('')}</nav>`;
}

function missing(title, path, label) {
  return `<section class="admin-page stack">${pageHeading(title)}${emptyState('정보를 찾을 수 없어요.', '목록으로 돌아가 현재 상태를 확인해 주세요.', button(label, { href: link(path) }))}</section>`;
}

function dashboard({ state }) {
  const pending = state.fabrics.filter(f => f.status === 'PENDING');
  const sellerPending = state.sellers.filter(s => s.seller_approval_status === 'PENDING');
  const cards = [
    ['원단 게시 대기', pending.length, '확인이 필요한 원단', '/admin/fabrics?status=PENDING'],
    ['판매자', state.sellers.length, '등록된 판매자', '/admin/sellers?status=APPROVED'],
    ['판매자 승인 대기', sellerPending.length, '승인 확인 대기 판매자', '/admin/sellers?status=PENDING'],
    ['등록된 원단수', state.fabrics.length, '전체 등록 원단', '/admin/fabrics?status=PENDING'],
  ];
  return `<section class="admin-page stack" data-figma-node="123:4955">
    ${pageHeading('관리자 대시보드', '새롭게 등록된 원단과 서비스 현황을 확인하세요.')}
    <div class="stat-grid admin-stats">${cards.map(([title, count, hint, path]) => `<a class="stat-card admin-stat" href="${esc(link(path))}"><span>${esc(title)}</span><strong>${esc(count)}</strong><small>${esc(hint)}</small></a>`).join('')}</div>
    <section class="panel admin-panel" aria-labelledby="admin-pending-heading"><h2 id="admin-pending-heading">원단 게시 승인 대기</h2>
      ${pending.length ? `<div class="table-wrapper"><table class="data-table admin-dashboard-table"><caption class="admin-sr-only">게시 승인을 기다리는 원단</caption><thead><tr><th scope="col">원단명</th><th scope="col">판매자</th><th scope="col">신청일</th><th scope="col">상태</th></tr></thead><tbody>${pending.map(f => `<tr><td><a href="${esc(link(detailPath('fabrics', f.id)))}">${esc(f.title)}</a></td><td>${esc(f.store_name)}</td><td>${esc(date(f.created_at))}</td><td>${statusBadge(f.status, FABRIC_STATUS)}</td></tr>`).join('')}</tbody></table></div>${button('승인 대기 확인 →', { href: link('/admin/fabrics?status=PENDING'), tone: 'primary' })}` : emptyState('게시 승인을 기다리는 원단이 없어요.', '새로운 원단이 등록되면 이곳에서 확인할 수 있어요.')}
    </section><p class="admin-footnote muted">화면에 표시된 이름, 수치와 날짜는 예시입니다.</p>
  </section>`;
}

function sellerList({ state, query }) {
  const status = validStatus(query, SELLER_STATUS);
  const sellers = state.sellers.filter(s => s.seller_approval_status === status);
  return `<section class="admin-page stack" data-figma-node="123:5138">
    ${pageHeading('판매자 승인 관리', '판매자 계정의 승인 상태와 매장 정보를 확인하세요. 원단 게시 승인은 별도 관리합니다.')}
    ${stateTabs('sellers', status, SELLER_STATUS)}
    <section class="panel admin-panel" aria-labelledby="admin-seller-list-heading"><h2 id="admin-seller-list-heading">${esc(SELLER_STATUS[status])} 판매자</h2>
      ${sellers.length ? `<div class="table-wrapper"><table class="data-table admin-seller-table"><caption class="admin-sr-only">${esc(SELLER_STATUS[status])} 판매자 ${sellers.length}명</caption><thead><tr><th scope="col">닉네임</th><th scope="col">승인 상태</th><th scope="col">상세보기</th></tr></thead><tbody>${sellers.map(s => `<tr><td>${esc(s.nickname)}</td><td>${esc(SELLER_STATUS[s.seller_approval_status])}</td><td><a href="${esc(link(detailPath('sellers', s.id)))}" aria-label="${esc(`${s.nickname} 판매자 상세보기`)}">상세보기 →</a></td></tr>`).join('')}</tbody></table></div>` : emptyState(`${SELLER_STATUS[status]} 판매자가 없어요.`, '다른 승인 상태를 선택해 확인할 수 있어요.')}
    </section><p class="admin-footnote muted">전체 판매자 ${state.sellers.length}명 · 이름과 매장 정보는 시연용 예시입니다.</p>
  </section>`;
}

function sellerDetail(ctx, id) {
  const seller = ctx.state.sellers.find(s => String(s.id) === id);
  if (!seller) return missing('판매자 승인 검토', '/admin/sellers?status=PENDING', '판매자 목록으로');
  const status = seller.seller_approval_status;
  const store = seller.store || (seller.id === ctx.state.seller.id && seller.hasStore ? ctx.state.store : null);
  const storeRows = store ? [
    ['매장명', store.store_name],
    ['픽업 주소', [store.address || store.store_address, store.detail_address].filter(Boolean).join(' ') || '—'],
    ['매장 연락처', store.phone_number || store.store_phone],
    ['휴무일', store.closed_days],
    ['픽업 안내', store.pickup_guide],
  ] : seller.store_name ? [['매장명', seller.store_name]] : [];
  const description = status === 'PENDING' ? '승인 대기 · 판매자 계정과 매장 정보를 확인한 뒤 승인 또는 거절해 주세요.' : status === 'REJECTED' ? '승인 거절 · 검토 후 판매자 승인을 진행할 수 있어요.' : '승인 완료 · 매장 정보가 준비되면 원단을 등록할 수 있어요.';
  const canApprove = status === 'PENDING' || status === 'REJECTED';
  return `<section class="admin-page stack" data-figma-node="${status === 'APPROVED' ? '210:8380' : status === 'REJECTED' ? '210:8462' : '123:5272'}">
    ${pageHeading(status === 'APPROVED' ? '판매자 승인 완료' : status === 'REJECTED' ? '판매자 승인 거절' : '판매자 승인 검토', `${seller.nickname} · 판매자 계정과 매장 정보를 확인하세요.`)}
    <section class="panel admin-panel"><h2>회원정보</h2>
      <div class="admin-member-summary"><h3>${esc(seller.nickname)}</h3>${badge('판매자')}${statusBadge(status, SELLER_STATUS)}</div>
      ${details([['닉네임', seller.nickname], ['연락처', seller.phone_number || '등록된 연락처 없음'], ['이메일', seller.email]])}
      <hr class="admin-divider"><h2>매장 정보</h2>
      ${storeRows.length ? details(storeRows) : notice('아직 등록된 매장 정보가 없어요. 승인 후에도 매장을 등록해야 원단을 등록할 수 있어요.')}
    </section><p class="admin-footnote muted">${esc(description)}</p>${actionError()}
    <div class="actions admin-actions">
      ${canApprove ? button('판매자 승인', { tone: 'primary', attrs: `data-admin-review-seller="APPROVED" data-id="${esc(seller.id)}"` }) : ''}
      ${status === 'PENDING' ? button('판매자 승인 거절', { tone: 'danger', attrs: `data-admin-review-seller="REJECTED" data-id="${esc(seller.id)}"` }) : ''}
      ${button('판매자 목록으로', { href: link(`/admin/sellers?status=${Object.hasOwn(SELLER_STATUS, status) ? status : 'PENDING'}`) })}
    </div>
  </section>`;
}

function fabricList({ state, query }) {
  const status = validStatus(query, FABRIC_STATUS);
  const fabrics = state.fabrics.filter(f => f.status === status);
  return `<section class="admin-page stack" data-figma-node="123:5566">
    ${pageHeading('상품 목록', '등록된 원단을 확인하고, 상태별로 조회할 수 있어요.')}
    <section class="panel admin-panel"><h2>상태별 조회</h2><form id="admin-fabric-filter" data-admin-filter>
      ${selectField('상태', 'status', Object.entries(FABRIC_STATUS).map(([value, label]) => ({ value, label })), status)}
    </form></section>
    <section class="panel admin-panel"><h2>${esc(FABRIC_STATUS[status])} · ${fabrics.length}건</h2>
      ${fabrics.length ? `<div class="table-wrapper"><table class="data-table admin-fabric-table"><caption class="admin-sr-only">${esc(FABRIC_STATUS[status])} 원단 목록</caption><thead><tr><th scope="col">원단 사진</th><th scope="col">원단 종류</th><th scope="col">판매자</th><th scope="col">등록 상태</th></tr></thead><tbody>${fabrics.map(f => `<tr><td>${fabricImage(f, 'admin-fabric-thumbnail')}</td><td><a class="admin-fabric-title" href="${esc(link(detailPath('fabrics', f.id)))}">${esc(f.title)}</a><small>${esc([f.material, f.color].filter(Boolean).join(' · '))}</small></td><td>${esc(f.store_name)}</td><td>${esc(FABRIC_STATUS[f.status])}</td></tr>`).join('')}</tbody></table></div>` : emptyState(`${FABRIC_STATUS[status]} 원단이 없습니다.`, '다른 상태의 원단을 확인해 보세요.')}
    </section><div class="actions">${button('상태별 조회', { href: '/admin/fabrics/filter' })}</div>
  </section>`;
}

function fabricRows(fabric) {
  const isRoll = fabric.sale_type === 'ROLL';
  return [
    ['원단명', fabric.title], ['판매자', fabric.store_name],
    ['소재 / 색상', [fabric.material, fabric.color].filter(Boolean).join(' / ')],
    ['판매 형태', isRoll ? '롤 원단' : '자투리 원단'],
    ['치수', isRoll ? `폭 ${fabric.width_cm}cm · 남은 길이 ${formatLength(fabric.remaining_length_cm)}` : `${fabric.width_cm} × ${fabric.length_cm}cm · 1장`],
    ...(isRoll ? [['예약으로 확보된 길이', formatLength(fabric.reserved_length_cm)], ['구매 가능한 길이', formatLength(fabric.available_length_cm)]] : []),
    ['가격', isRoll ? `90cm(1마)당 ${formatPrice(fabric.price)}` : `${formatPrice(fabric.price)} · 1장 전체 가격`],
    ['하자', fabric.defect_description || fabric.defect_note || '없음'],
  ];
}

function fabricDetail(ctx, id) {
  const fabric = ctx.state.fabrics.find(f => String(f.id) === id);
  if (!fabric) return missing('등록 원단 상세', '/admin/fabrics?status=PENDING', '상품 목록으로');
  const action = ctx.query.get('action');
  if (ctx.query.get('result') && ['POSTED', 'REJECTED'].includes(fabric.status)) return fabricResult(ctx, fabric);
  if (fabric.status === 'PENDING' && (action === 'approve' || action === 'reject')) return fabricReview(ctx, fabric, action);
  const stateText = {
    PENDING: '승인 대기 · 사진과 입력 내용을 검토한 뒤 게시 승인 여부를 결정해 주세요.',
    POSTED: '게시 중 · 구매자에게 공개된 원단입니다.',
    REJECTED: '승인 거절 · 판매자의 내용 보완을 기다리는 원단입니다.',
    SOLD_OUT: '판매 완료 · 구매자 목록에 표시되지 않는 원단입니다.',
  }[fabric.status] || '원단의 현재 상태를 확인해 주세요.';
  return `<section class="admin-page stack" data-figma-node="131:9584">
    ${pageHeading('등록 원단 상세', '등록 정보와 현재 게시 상태를 확인하세요.')}
    ${notice(stateText, fabric.status === 'REJECTED' ? 'error' : 'info')}
    ${fabricImage(fabric, 'admin-fabric-hero')}
    <section class="panel admin-panel"><h2>${esc(fabric.title)}</h2>${details(fabricRows(fabric), 'admin-details--fabric')}</section>
    ${fabric.description ? `<section class="panel admin-panel"><h2>판매자 설명</h2><p class="admin-text-preserve">${esc(fabric.description)}</p></section>` : ''}
    <section class="panel admin-panel"><h2>승인 정보</h2>${details([
      ['등록일', date(fabric.created_at)],
      ...(fabric.approved_at ? [['승인일', date(fabric.approved_at)]] : []),
      ['현재 상태', statusLabel(fabric.status, FABRIC_STATUS)],
      ...(fabric.reject_reason ? [['거절 사유', fabric.reject_reason]] : []),
    ], 'admin-details--fabric')}</section>
    <div class="actions admin-actions">${fabric.status === 'PENDING' ? `${button('원단 게시 승인', { href: link(`${detailPath('fabrics', fabric.id)}?action=approve`), tone: 'primary' })}${button('게시 승인 거절', { href: link(`${detailPath('fabrics', fabric.id)}?action=reject`), tone: 'danger' })}` : ''}${button('상품 목록으로', { href: link(`/admin/fabrics?status=${Object.hasOwn(FABRIC_STATUS, fabric.status) ? fabric.status : 'PENDING'}`) })}</div>
  </section>`;
}

function fabricReview(ctx, fabric, action) {
  const reject = action === 'reject';
  const description = reject ? '판매자가 내용을 보완할 수 있도록 구체적인 사유를 작성하세요.' : '승인하면 원단이 구매자 목록에 게시됩니다.';
  return `<section class="admin-page stack" data-figma-node="${reject ? '131:9893' : '131:9697'}">
    ${pageHeading(reject ? '게시글 거절 사유 입력' : '원단 게시를 승인할까요?', description)}
    <section class="panel admin-panel"><h2>${reject ? '거절 대상' : '승인 대상'}</h2>${details(fabricRows(fabric), 'admin-details--fabric')}</section>
    ${reject ? '' : notice('사진과 판매자 입력 내용을 검토해 주세요. AI가 정리한 내용은 판매자의 확인이 필요한 보조 정보입니다.', 'warning')}
    <form class="${reject ? 'panel admin-panel' : 'admin-review-form stack'}" data-admin-review-fabric="${reject ? 'REJECTED' : 'POSTED'}" data-id="${esc(fabric.id)}">
      ${reject ? `<h2>거절 사유</h2><div class="field"><label for="admin-reject-reason">거절 사유 <span aria-hidden="true">*</span></label><textarea id="admin-reject-reason" name="reason" required minlength="1" maxlength="255" rows="3" aria-describedby="admin-reject-hint" placeholder="예: 사용 가능한 전체 길이를 확인할 수 있는 사진을 보완해 주세요.">${esc(ctx.drafts.get(`admin:reject:${fabric.id}`) || '')}</textarea><small id="admin-reject-hint" class="muted">1~255자 · 검토 화면을 오가도 입력한 사유가 유지됩니다. 확정하면 판매자에게 표시됩니다.</small></div>` : notice(`${fabric.title} 1건을 승인합니다.`)}
      ${ctx.query.get('invalid') ? notice('거절 사유를 1~255자로 입력해 주세요.', 'error') : ''}${actionError()}<div class="actions admin-actions">${button(reject ? '거절 확정' : '승인 확정', { type: 'submit', tone: reject ? 'danger' : 'primary' })}${button('검토 화면으로', { href: link(detailPath('fabrics', fabric.id)) })}</div>
    </form>${reject ? notice('거절 시 원단은 구매자에게 게시되지 않습니다. 사진과 입력 내용을 확인한 결과를 적어 주세요.', 'warning') : ''}
  </section>`;
}

function pendingTable(fabrics) {
  if (!fabrics.length) return emptyState('승인 대기 중인 원단이 없습니다.', '새 원단이 등록되면 목록에 표시됩니다.');
  return `<div class="table-wrapper"><table class="data-table admin-dashboard-table"><thead><tr><th>원단명</th><th>판매자</th><th>신청일</th><th>상태</th></tr></thead><tbody>${fabrics.map(f=>`<tr><td><a href="#/admin/approvals?id=${encodeURIComponent(f.id)}">${esc(f.title)}</a></td><td>${esc(f.store_name)}</td><td>${esc(date(f.created_at))}</td><td>승인 대기</td></tr>`).join('')}</tbody></table></div>`;
}

function fabricResult(ctx, fabric) {
  const reject = fabric.status === 'REJECTED';
  const pending = ctx.state.fabrics.filter(f => f.status === 'PENDING');
  return `<section class="admin-page stack" data-figma-node="${reject ? '131:10037' : '131:9772'}">
    ${pageHeading(reject ? '게시글 승인을 거절했습니다' : '원단 게시를 승인했습니다', reject ? `${fabric.title}의 거절 사유가 판매자에게 표시됩니다.` : `${fabric.title}가 승인 대기에서 제외되고 구매자에게 공개되었습니다.`)}
    ${notice(reject ? '승인 거절 · 구매자에게 공개되지 않습니다.' : '승인 완료 · 게시 중인 원단에서 확인할 수 있습니다.', reject ? 'error' : 'info')}
    <section class="panel admin-panel">${reject ? `<h2>처리 결과</h2>${details([['원단명', fabric.title], ['판매자', fabric.store_name], ['거절 사유', fabric.reject_reason], ['현재 상태', '승인 거절']])}` : `${statusBadge('POSTED', FABRIC_STATUS)}<h2>${esc(fabric.title)}</h2><p class="muted">${esc(fabric.store_name)} · ${fabric.sale_type === 'ROLL' ? `롤 원단 · 재고 ${formatLength(fabric.remaining_length_cm)}` : '자투리 원단 · 1장'} · ${formatPrice(fabric.price)}</p><p>승인한 원단은 아래 대기 목록에서 제외되었습니다.</p><div class="actions">${button('게시된 원단 확인', { href: `/buyer/fabrics/${fabric.id}`, tone: 'primary' })}${button('승인 완료 목록 확인', { href: '/admin/approvals?status=POSTED' })}</div>`}</section>
    ${reject ? `<section class="panel admin-panel"><h2>갱신된 거절 내역 · 방금 처리한 원단</h2>${details([['원단명', fabric.title], ['판매자', fabric.store_name], ['상태', '승인 거절'], ['거절 사유', fabric.reject_reason]])}</section>` : ''}
    <section class="panel admin-panel"><h2>남은 승인 대기 · ${pending.length}건</h2>${pendingTable(pending)}</section>
    <div class="actions">${reject ? button('승인 거절 목록', { href: '/admin/approvals?status=REJECTED', tone: 'primary' }) : ''}${button('승인 대기 목록', { href: '/admin/approvals' })}</div>
  </section>`;
}

function approvalList(ctx) {
  const status = validStatus(ctx.query, FABRIC_STATUS);
  const items = ctx.state.fabrics.filter(f => f.status === status);
  const selected = items.find(f=>f.id===ctx.query.get('id')) || items[0];
  const node = status === 'POSTED' ? '123:6125' : status === 'REJECTED' ? '123:6292' : '123:5941';
  return `<section class="admin-page stack" data-figma-node="${node}">${pageHeading('승인 신청 목록', '등록 원단의 사진과 내용을 확인한 후 승인 여부를 결정하세요.')}
    <nav class="tabs admin-approval-tabs" aria-label="원단 게시 승인 상태">${[['POSTED','승인 완료'], ['PENDING','승인 대기'], ['REJECTED','승인 거절']].map(([s,label])=>button(label,{href:`/admin/approvals?status=${s}`,attrs:status===s?'aria-current="page"':''})).join('')}</nav>
    ${!selected ? emptyState(`${FABRIC_STATUS[status]} 원단이 없습니다.`, '다른 상태를 선택해 확인할 수 있습니다.', button('승인 대기 보기', {href:'/admin/approvals'})) : `<div class="admin-mobile-selector">${selectField(`검토할 원단 · ${items.length}건`, 'reviewFabric', items.map(f=>({value:f.id,label:`${f.title} · ${f.store_name}`})), selected.id, `data-admin-select="${status}"`)}</div><div class="admin-review-workspace"><section class="panel admin-panel admin-candidates"><h2>원단 목록</h2><nav class="admin-candidate-list" aria-label="검토할 원단">${items.map(f=>`<a href="#/admin/approvals?status=${status}&id=${encodeURIComponent(f.id)}" ${f.id===selected.id?'aria-current="true"':''}><strong>${esc(f.title)}</strong><small>${esc(f.id===selected.id?`${f.store_name} · 선택됨`:`${date(f.created_at)} · ${FABRIC_STATUS[status]}`)}</small></a>`).join('')}</nav></section>
    <section class="panel admin-panel"><h2>선택한 원단 검토</h2>${statusBadge(status, FABRIC_STATUS)}<div class="admin-selected-product">${fabricImage(selected,'admin-review-image')}<div class="stack"><small class="muted">게시글 내용</small><h3>${esc(selected.title)}</h3>${details(fabricRows(selected).filter(([label])=>!['원단명','판매 형태','예약으로 확보된 길이','구매 가능한 길이'].includes(label)), 'admin-review-details')}</div></div>
    <hr class="admin-divider">${status==='PENDING'?`<h3>AI 정리 내용 · 판매자 확인 필요</h3><p>판매자가 입력한 소재·색상·치수 정보를 확인하세요. 사진과 게시글을 함께 검토해 주세요.</p>${notice('판매자 입력 보조정보이며, 게시 여부는 관리자가 최종 확인합니다.')}<div class="actions admin-review-actions">${button('게시글 거절',{href:`/admin/fabrics/${selected.id}?action=reject`,tone:'danger'})}${button('게시글 승인',{href:`/admin/fabrics/${selected.id}?action=approve`,tone:'primary'})}</div>`:`${details([['현재 상태',FABRIC_STATUS[status]],...(selected.reject_reason?[['거절 사유',selected.reject_reason]]:[])])}${button('원단 상세보기',{href:`/admin/fabrics/${selected.id}`})}`}</section></div>`}
    </section>`;
}

function filterPage() {
  return `<section class="admin-page stack" data-figma-node="131:9343">${pageHeading('상태별 상품 조회','원단 상태를 선택하면 해당 목록이 표시됩니다.')}<section class="panel admin-panel"><h2>원단 상태</h2><p>조회할 상태</p><p class="muted">아래에서 조회할 상태를 선택하세요.</p><div class="actions">${Object.entries(FABRIC_STATUS).map(([status,label])=>button(`${label} 보기`,{href:`/admin/fabrics?status=${status}`,tone:status==='PENDING'?'primary':'secondary'})).join('')}</div></section></section>`;
}

function serviceError(ctx) {
  const fabric=ctx.state.fabrics.find(f=>f.id===ctx.query.get('id')) || ctx.state.fabrics.find(f=>f.status==='PENDING');
  return `<section class="admin-page stack" data-figma-node="131:10248">${pageHeading('요청 결과를 확인하지 못했습니다','네트워크 연결을 확인하고 신청 정보를 다시 불러와 주세요.')}${notice('처리 결과를 확인하지 못했습니다. 신청 정보를 다시 불러와 주세요.','error')}<section class="panel admin-panel"><h2>확인할 신청</h2>${details([['원단명',fabric?.title],['판매자',fabric?.store_name],['마지막 확인 상태',FABRIC_STATUS[fabric?.status] || '확인 필요']])}</section><div class="actions">${button('신청 정보 다시 불러오기',{tone:'primary',attrs:`data-admin-reload="${esc(fabric?.id || '')}"`})}${button('관리자 홈으로',{href:'/admin/dashboard'})}</div></section>`;
}

export function renderAdmin(ctx) {
  // URL-only examples never change stored records; normal actions use the live mock state.
  if (ctx.query.has('sample') || ctx.query.has('empty')) {
    ctx = { ...ctx, state: structuredClone(ctx.state) };
    const status = ctx.query.get('sample');
    const fabric = ctx.state.fabrics.find(f => f.id === (ctx.path.split('/')[3] || 'fabric-pending-1'));
    if (fabric && ['POSTED', 'REJECTED', 'SOLD_OUT'].includes(status)) Object.assign(fabric, {status, reject_reason:status==='REJECTED'?'사용 가능한 전체 길이를 확인할 수 있는 사진을 보완해 주세요.':null});
    if (['APPROVED','SELLER_REJECTED'].includes(status)) { const seller=ctx.state.sellers.find(s=>s.id===(ctx.path.split('/')[3]||'seller-1')); if(seller)seller.seller_approval_status=status==='APPROVED'?'APPROVED':'REJECTED'; }
    if (ctx.query.has('empty')) ctx.state.fabrics=[];
  }
  if (ctx.path === '/admin/dashboard' || ctx.path === '/admin' || ctx.path === '/admin/') return dashboard(ctx);
  if (ctx.path === '/admin/approvals') return approvalList(ctx);
  if (ctx.path === '/admin/fabrics/filter') return filterPage();
  if (ctx.path === '/admin/error') return serviceError(ctx);
  if (ctx.path === '/admin/sellers') return sellerList(ctx);
  if (ctx.path === '/admin/fabrics') return fabricList(ctx);
  const match = ctx.path.match(/^\/admin\/(sellers|fabrics)\/([^/]+)$/);
  if (match) {
    let id;
    try { id = decodeURIComponent(match[2]); } catch { return missing('페이지를 찾을 수 없어요.', '/admin/dashboard', '대시보드 홈'); }
    return match[1] === 'sellers' ? sellerDetail(ctx, id) : fabricDetail(ctx, id);
  }
  return missing('페이지를 찾을 수 없어요.', '/admin/dashboard', '대시보드 홈');
}

export function bindAdmin(ctx) {
  let busy = false;
  let active = true;
  function showError(message) {
    const output = ctx.root.querySelector('[data-admin-error]');
    if (output) { output.textContent = message; output.hidden = false; output.focus(); }
    else ctx.notify(message);
  }
  async function mutate(task, success, destination) {
    if (busy) return;
    busy = true;
    const controls = [...ctx.root.querySelectorAll('[data-admin-review-seller], [data-admin-review-fabric] button[type="submit"]')];
    controls.forEach(control => { control.disabled = true; });
    try {
      await task();
      if (active) { if(destination)ctx.navigate(destination);else ctx.refresh(); ctx.notify(success); }
    } catch (error) {
      if (active) { if(error.code==='SERVICE_ERROR')ctx.navigate(`/admin/error?id=${encodeURIComponent(ctx.path.split('/')[3] || '')}`);else showError(error?.message || '처리 결과를 확인하지 못했어요. 현재 상태를 확인한 뒤 다시 시도해 주세요.'); }
    } finally {
      busy = false;
      if (active) controls.forEach(control => { control.disabled = false; });
    }
  }
  const click = (event) => {
    const reload=event.target.closest('[data-admin-reload]');
    if(reload){ void ctx.api.setDemo({adminResult:'SUCCESS'}).then(()=>ctx.navigate(reload.dataset.adminReload?`/admin/fabrics/${encodeURIComponent(reload.dataset.adminReload)}`:'/admin/approvals'));return; }
    const target = event.target.closest('[data-admin-review-seller]');
    if (!target || !ctx.root.contains(target)) return;
    const status = target.dataset.adminReviewSeller;
    void mutate(() => ctx.api.reviewSeller(target.dataset.id, status), status === 'APPROVED' ? '판매자를 승인했어요.' : '판매자 승인을 거절했어요.', detailPath('sellers', target.dataset.id));
  };
  const filter = () => {
    const select = ctx.root.querySelector('#admin-fabric-filter [name="status"]');
    if (select && Object.hasOwn(FABRIC_STATUS, select.value)) ctx.navigate(`/admin/fabrics?status=${select.value}`);
  };
  const change = (event) => {
    if (event.target.matches('#admin-fabric-filter [name="status"]')) filter();
    if (event.target.matches('[data-admin-select]')) ctx.navigate(`/admin/approvals?status=${event.target.dataset.adminSelect}&id=${encodeURIComponent(event.target.value)}`);
  };
  const input = (event) => {
    const form = event.target.closest('[data-admin-review-fabric="REJECTED"]');
    if (form && event.target.name === 'reason') ctx.drafts.set(`admin:reject:${form.dataset.id}`, event.target.value);
  };
  const submit = (event) => {
    const form = event.target;
    if (form.matches('[data-admin-filter]')) { event.preventDefault(); filter(); return; }
    if (!form.matches('[data-admin-review-fabric]')) return;
    event.preventDefault();
    if (busy) return;
    const status = form.dataset.adminReviewFabric;
    const reasonInput = form.querySelector('[name="reason"]');
    const reason = reasonInput?.value.trim() || '';
    if (status === 'REJECTED' && (reason.length < 1 || reason.length > 255)) {
      reasonInput.setAttribute('aria-invalid', 'true');
      showError('거절 사유를 1~255자로 입력해 주세요.');
      reasonInput.focus();
      return;
    }
    reasonInput?.removeAttribute('aria-invalid');
    void mutate(async () => { await ctx.api.reviewFabric(form.dataset.id, status, reason); ctx.drafts.delete(`admin:reject:${form.dataset.id}`); }, status === 'POSTED' ? '원단 게시를 승인했어요.' : '게시 승인을 거절했어요.', `/admin/fabrics/${encodeURIComponent(form.dataset.id)}?result=${status}`);
  };
  ctx.root.addEventListener('click', click);
  ctx.root.addEventListener('change', change);
  ctx.root.addEventListener('input', input);
  ctx.root.addEventListener('submit', submit);
  return () => {
    active = false;
    ctx.root.removeEventListener('click', click);
    ctx.root.removeEventListener('change', change);
    ctx.root.removeEventListener('input', input);
    ctx.root.removeEventListener('submit', submit);
  };
}
