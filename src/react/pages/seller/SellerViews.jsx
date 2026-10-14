import RegistrationSteps from '../../components/RegistrationSteps.jsx';
import { SellerRuntime } from './SellerRuntime.js';
import { PHOTO_SLOTS, ownFabrics, fabricByQuery, draftFor, validateSellerDraft } from './sellerModel.js';
import { inquiryDraft, selectedPhotos, uploadPhotoSummary, sellerCalendar, stockAfterReservation } from './sellerUx.js';
import { formatPrice, formatLength, formatDate, formatDateTime } from '../../lib/format.js';
import { Fragment, useContext, useEffect, useRef } from 'react';
import { Button, Badge, Notice, PageHeading, EmptyState, FabricImage, Field, SelectField, } from '../../components/ui.jsx';


const keyed = nodes => nodes.length ? nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>) : null;
const badge = (children, tone) => <Badge tone={tone}>{children}</Badge>;
const notice = (children, tone) => <Notice tone={tone}>{children}</Notice>;
const pageHeading = (title, description) => <PageHeading title={title} description={description} />;
const emptyState = (title, description, children) => <EmptyState title={title} description={description}>{children}</EmptyState>;
const fabricImage = (fabric, className) => <FabricImage fabric={fabric} className={className} />;
const field = (label, name, { value = '', ...props } = {}) => <Field label={label} name={name} defaultValue={value ?? ''} {...props} />;
const selectField = (label, name, options, value) => <SelectField label={label} name={name} options={options} defaultValue={value} />;
const button = (label, props = {}) => <SellerButton {...props}>{label}</SellerButton>;
const action = (label, name, tone = 'secondary', props = {}) => <SellerButton {...props} tone={tone} data-seller-action={name}>{label}</SellerButton>;

function SellerButton({ children, ...props }) {
  const runtime = useContext(SellerRuntime);
  const name = props['data-seller-action'];
  function click(event) {
    if (name) runtime.action(name, props);
    else if (props['data-logout']) { event.preventDefault(); runtime.logout(); }
    else if (props['data-close-dialog']) runtime.closeDialog();
    else if (children === '취소') runtime.discardEdit();
  }
  return <Button {...props} disabled={props.disabled || (!props.href && runtime.busy)} onClick={click}>{children}</Button>;
}

function SellerError() {
  const { error } = useContext(SellerRuntime), ref = useRef(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  return <div ref={ref} id="seller-error" className="notice notice--error" role="alert" tabIndex={-1} hidden={!error}>{error}</div>;
}

// Source: connected Figma page 122:12. Each view retains its source frame ID.
const FABRIC_STATUS = {
  POSTED: '게시 중',
  PENDING: '승인 대기',
  REJECTED: '승인 거절',
  SOLD_OUT: '판매 완료'
};
const RESERVATION_STATUS = {
  REQUESTED: '요청됨',
  ACCEPTED: '수락됨',
  PICKED_UP: '수령 완료',
  REJECTED: '거절됨',
  CANCELED: '취소됨'
};

const MATERIALS = ['면', '린넨', '폴리에스터', '나일론', '레이온', '울', '혼방', '기타', '미확인'];
const href = path => `#${path}`;
const go = (label, path, tone = 'secondary') => button(label, {
  href: href(path),
  tone
});
const errorSlot = () => <SellerError />;
const wrap = (source, content, extra = '') => <><section className={"" + "seller-page stack " + extra} data-figma-node={source}>{errorSlot()}{content}</section></>;
const tone = status => ['REJECTED', 'CANCELED'].includes(status) ? 'red' : ['PENDING', 'REQUESTED'].includes(status) ? 'amber' : status === 'SOLD_OUT' || status === 'PICKED_UP' ? 'gray' : 'green';

const ownReservations = state => state.reservations.filter(r => r.seller_id === state.seller.id || ownFabrics(state).some(f => f.id === r.fabric_id));

const options = labels => labels.map(label => ({
  value: label,
  label
}));
const details = rows => <><dl className={"seller-details"}>{keyed(rows.map(([label, value]) => <><div><dt>{label}</dt><dd>{value ?? '—'}</dd></div></>))}</dl></>;
const record = (title, body, {
  meta = '',
  status = '',
  actions = ''
} = {}) => <><section className={"panel seller-panel seller-record"}>{status ? badge(status, /거절|취소/.test(status) ? 'red' : /대기|필요/.test(status) ? 'amber' : /판매 완료|수령 완료/.test(status) ? 'gray' : 'green') : ''}<h2>{title}</h2>{meta ? <><p className={"muted"}>{meta}</p></> : ''}{body}{actions ? <><div className={"actions"}>{actions}</div></> : ''}</section></>;

const fabricRoute = (f, action = 'detail') => `/seller/fabrics/${action}?id=${encodeURIComponent(f.id)}`;
const fabricRows = f => [['판매 형태', f.sale_type === 'ROLL' ? '롤 원단' : '자투리 · 1장'], ['폭 / 길이', `${f.width_cm}cm / ${f.sale_type === 'ROLL' ? f.remaining_length_cm : f.length_cm}cm`], ['소재 / 두께 / 색상', `${f.material || '미확인'} / ${f.thickness || '미확인'} / ${f.color || '미확인'}`], ['가격', `${formatPrice(f.price)} / ${f.sale_type === 'ROLL' ? '90cm(1마)' : '1장'}`], ['하자', f.has_defect ? f.defect_note || '내용 확인 필요' : '없음']];
const stockRows = f => f.sale_type === 'ROLL' ? [['물리적으로 남은 길이', formatLength(f.remaining_length_cm)], ['수락된 예약으로 확보', formatLength(f.reserved_length_cm || 0)], ['판매 가능 길이', formatLength(f.available_length_cm ?? f.remaining_length_cm - (f.reserved_length_cm || 0))]] : [['판매 형태', '자투리 1장'], ['상태', FABRIC_STATUS[f.status]]];
const missing = (source, title = '원단을 찾을 수 없어요') => wrap(source, emptyState(title, '목록에서 현재 항목을 확인해 주세요.', go('내 원단 목록', '/seller/fabrics')));
function statusTabs(path, labels, selected) {
  return <><nav className={"tabs seller-tabs"} aria-label={"상태 필터"}>{keyed(Object.entries(labels).map(([value, label]) => <><a className={"" + "button " + (selected === value ? 'seller-tab--active' : '')} href={href(`${path}?status=${encodeURIComponent(value)}`)} {...selected === value ? {
          "aria-current": "page"
        } : {}}>{label}</a></>))}</nav></>;
}
function approvalView(ctx, storeRequired = false) {
  const status = ctx.state.seller.seller_approval_status;
  const title = storeRequired ? '매장 정보가 필요해요' : status === 'APPROVED' ? '판매자 승인이 완료되었어요' : status === 'REJECTED' ? '판매자 승인이 거절되었어요' : '판매자 승인을 기다리고 있어요';
  const description = storeRequired ? '원단 등록 준비 · 매장 정보' : `판매자 계정 · ${status === 'APPROVED' ? '승인 완료' : status === 'REJECTED' ? '승인 거절' : '승인 대기'}`;
  const message = storeRequired ? '원단을 등록하려면 매장 정보를 먼저 입력해 주세요. 픽업 장소와 연락처를 확인해 주세요.' : status === 'APPROVED' ? '매장 정보가 등록되어 있으면 직접 입력과 AI 등록을 시작할 수 있어요.' : status === 'REJECTED' ? '현재 원단 등록과 AI 등록을 이용할 수 없어요. 매장명·픽업 주소·연락처가 정확한지 확인하고 필요한 정보를 수정해 주세요. 정보를 저장해도 승인 상태가 바뀌거나 재검토가 자동으로 요청되지는 않아요.' : '매장 정보는 먼저 등록할 수 있어요. 운영팀 승인 전에는 원단 등록과 AI 등록을 이용할 수 없어요.';
  return wrap(storeRequired ? '127:5978' : status === 'APPROVED' ? '209:8203' : status === 'REJECTED' ? '209:8167' : '209:8131', <>{pageHeading(title, description)}{notice(message, status === 'APPROVED' && !storeRequired ? 'info' : 'warning')}<div className={"actions"}>{go(status === 'APPROVED' && !storeRequired ? '원단 등록' : '매장 정보 확인', status === 'APPROVED' && !storeRequired ? '/seller/register' : '/seller/store', 'primary')}{action('승인 상태 다시 확인', 'refresh-approval')}</div></>, 'seller-state');
}
function dashboardView(ctx) {
  const fabrics = ownFabrics(ctx.state), reservations = ownReservations(ctx.state);
  if (!ctx.state.seller.hasStore || !fabrics.length && ctx.query.get('view') === 'new') return newDashboardView(ctx);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const pickups = reservations.filter(r => r.pickup_date === today && r.status === 'ACCEPTED').toSorted((a,b) => a.pickup_time.localeCompare(b.pickup_time));
  const requests = reservations.filter(r => r.status === 'REQUESTED');
  const inquiries = ctx.state.inquiries.filter(i => fabrics.some(f => f.id === i.fabric_id) && !i.answer);
  const title = item => item.fabric_title || fabrics.find(f => f.id === item.fabric_id)?.title || '원단 정보 확인 필요';
  return wrap('123:2473', <>{pageHeading('오늘 처리할 일', ctx.state.store?.store_name || ctx.state.seller.nickname)}<div className="actions">{go('원단 등록','/seller/register','primary')}</div>
    <div className="seller-overview-work"><section className="panel seller-panel"><div className="seller-section-heading"><h2>오늘의 픽업 · {pickups.length}건</h2>{go('일정 보기','/seller/calendar')}</div><p className="muted">{formatDate(today)}</p>{pickups.length ? <ul className="seller-today-list">{pickups.map(r => <li key={r.id}><time>{r.pickup_time}</time><div><strong>{title(r)}</strong><small>예약 #{r.id} · 수락됨</small></div>{go('예약 확인',`/seller/reservations?status=ACCEPTED&id=${encodeURIComponent(r.id)}`)}</li>)}</ul> : <p className="seller-empty-line">오늘 예정된 픽업이 없습니다.</p>}</section>
    <div className="stack"><section className="panel seller-panel"><h2>새 예약 요청 · {requests.length}건</h2>{requests.length ? <ul className="seller-today-list">{requests.map(r => <li key={r.id}><div><strong>{title(r)}</strong><small>{formatDate(r.pickup_date)} · {r.pickup_time}</small></div>{go('요청 검토',`/seller/reservations?status=REQUESTED&id=${encodeURIComponent(r.id)}`)}</li>)}</ul> : <p className="seller-empty-line">확인할 새 요청이 없습니다.</p>}</section><section className="panel seller-panel"><h2>답변을 기다리는 문의 · {inquiries.length}건</h2>{inquiries.length ? <ul className="seller-today-list">{inquiries.map(i => <li key={i.id}><div><strong>{title(i)}</strong><small>{i.content || i.question}</small></div>{go('답변 작성',`/seller/inquiries?id=${encodeURIComponent(i.id)}`)}</li>)}</ul> : <p className="seller-empty-line">미답변 문의가 없습니다.</p>}</section></div></div>
    <section className="panel seller-panel"><h2>내 원단 현황</h2>{details(Object.entries(FABRIC_STATUS).map(([key,label]) => [label,`${fabrics.filter(f => f.status === key).length}건`]))}{go('원단 관리','/seller/fabrics')}</section>
  </>);
}

function fabricsView(ctx) {
  const status = ctx.query.get('status') || 'ALL',
    all = ownFabrics(ctx.state),
    items = all.filter(f => status === 'ALL' || f.status === status);
  const selected = all.find(f => f.id === ctx.query.get('id'));
  if (selected) return fabricDetailView(ctx);
  if (status !== 'ALL' && FABRIC_STATUS[status]) return fabricStatusView(ctx, status, items);
  return wrap('123:2891', <>{pageHeading('내 원단 목록', '등록한 원단의 게시 상태와 예약을 관리하세요.')}{statusTabs('/seller/fabrics', {
      ALL: '전체',
      ...FABRIC_STATUS
    }, status)}{"\n    "}<section className={"panel seller-panel"}><h2>{"등록한 원단 "}{all.length}{"건"}</h2>{items.length ? <><div className={"table-wrapper"}><table className={"data-table seller-fabric-table"}><thead><tr><th>{"원단"}</th><th>{"치수 · 남은 길이 × 고정폭"}</th><th>{"가격"}</th><th>{"상태"}</th><th>{"예약"}</th><th>{"관리"}</th></tr></thead><tbody>{keyed(items.map(f => <><tr><td><div className={"seller-product-cell"}>{fabricImage(f, 'seller-thumb')}<div><strong>{f.title}</strong><small>{f.material}{" · "}{f.color}</small></div></div></td><td data-label="치수">{f.sale_type === 'ROLL' ? formatLength(f.remaining_length_cm) : `${f.length_cm}cm`}{" × "}{f.width_cm}{"cm"}</td><td data-label="가격">{formatPrice(f.price)}<small>{f.sale_type === 'ROLL' ? '90cm당' : '1장'}</small></td><td data-label="상태">{badge(FABRIC_STATUS[f.status] || f.status, tone(f.status))}</td><td data-label="예약">{ctx.state.reservations.some(r => r.fabric_id === f.id && ['REQUESTED', 'ACCEPTED'].includes(r.status)) ? '진행 중' : '없음'}</td><td className="seller-fabric-manage"><a className="button" href={href(`/seller/fabrics?status=${encodeURIComponent(status)}&id=${encodeURIComponent(f.id)}`)}>{"상세보기"}</a></td></tr></>))}</tbody></table></div></> : emptyState('해당 상태의 원단이 없어요', '다른 상태를 선택하거나 새 원단을 등록해 주세요.')}</section>{"\n    "}{selected ? <><section className={"panel seller-panel"} aria-label={"선택한 원단 상세"}><div className={"seller-product-cell"}>{fabricImage(selected, 'seller-detail-thumb')}<div><h2>{selected.title}</h2><p className={"muted"}>{selected.material}{" · "}{selected.color}</p></div></div>{details([['판매 형태', selected.sale_type === 'ROLL' ? '롤 원단' : '자투리 원단'], ['가격', `${formatPrice(selected.price)} / ${selected.sale_type === 'ROLL' ? '90cm' : '1장'}`], ['상태', FABRIC_STATUS[selected.status]], ['설명', selected.description || '등록된 설명이 없어요.']])}{selected.reject_reason ? notice(`거절 사유: ${selected.reject_reason}`, 'error') : ''}{go('예약 확인', `/seller/reservations?fabric=${encodeURIComponent(selected.id)}`)}</section></> : ''}{"\n    "}<div className={"actions"}>{go(`승인 거절 ${all.filter(f => f.status === 'REJECTED').length}건`, '/seller/fabrics?status=REJECTED', all.some(f => f.status === 'REJECTED') ? 'danger' : 'secondary')}{go('새 원단 등록', '/seller/register', 'primary')}</div></>);
}
function registrationView(ctx) {
  if (ctx.query.get('mode') === 'ai') return typeView(ctx);
  return wrap('123:3245', <>{pageHeading('새 원단 등록', '편한 방법으로 원단 정보를 입력하세요.')}<div className={"seller-columns seller-methods"}><section className={"panel seller-panel"}><h2>{"AI와 대화로 등록"}</h2><h3>{"원단에 대해 알려주세요."}</h3><p className={"muted"}>{"밴드에 올리던 짧은 메모로 소개글을 만들고, 판매자가 내용을 확인해요."}</p>{notice('사진은 게시물에 첨부해요. AI 대화에는 사진을 보내지 않아요.')}{go('AI와 대화 시작', '/seller/register?mode=ai', 'primary')}</section><section className={"panel seller-panel"}><h2>{"직접 입력"}</h2><h3>{"정보를 차례로 입력해요."}</h3><p className={"muted"}>{"사진, 소재, 치수와 가격을 직접 입력하고 등록 내용을 확인해요."}</p>{notice('이미 알고 있는 원단 정보를 빠르게 등록하세요.')}{go('직접 입력하기', '/seller/register/type')}</section></div></>);
}

function PhotoPreview({ photo, className = '' }) {
  return <div className={`seller-photo-preview ${className}`}><FabricImage fabric={{ title: photo.label, texture: photo.texture }} exampleLabel={false} /><span>예시 이미지</span></div>;
}
function photoGallery(draft) {
  const photos = selectedPhotos(draft);
  return photos.length ? <div className="seller-photo-gallery">{photos.map(photo => <figure key={photo.slot}><PhotoPreview photo={photo} /><figcaption><strong>{photo.label}</strong><span>{photo.name}</span><small className="muted">파일 선택됨 · 이미지는 질감 예시</small></figcaption></figure>)}</div> : notice('선택한 사진이 없어요. 입력 화면에서 사진을 추가해 주세요.', 'warning');
}
function photosFields(draft) {
  const photos = selectedPhotos(draft);
  return <section className="panel seller-panel seller-photo-section" data-seller-photos tabIndex={-1}><div className="seller-section-heading"><h2>사진</h2><span className="muted">{photos.length}/3장 선택</span></div><div className="seller-photos">{PHOTO_SLOTS.map(([slot, label, texture]) => {
    const name = photos.find(photo => photo.slot === slot)?.name;
    return <div className="seller-photo-slot" key={slot}>
      {name ? <PhotoPreview photo={{ label, texture }} className="seller-photo" /> : <div className="seller-photo seller-photo-empty" aria-label={`${label} 미선택`}><span aria-hidden="true">＋</span><span>미선택</span></div>}
      <strong>{label}</strong><label className="button seller-file-label">{name ? '사진 변경' : '사진 추가'}<input type="file" name={`photo_${slot}`} data-photo-slot={slot} accept="image/jpeg,image/png,image/webp" aria-label={`${label} 선택`} /></label>
      <small className="muted seller-photo-name">{name || '선택한 사진 없음'}</small>{name ? action('사진 제거', 'remove-photo', 'secondary', { 'data-slot': slot }) : null}
    </div>;
  })}</div><p className="muted seller-small">jpg·png·webp 최대 3장, 장당 5MB 이하 · 최종 등록 후 업로드돼요. 시연 이미지는 선택 파일의 실제 미리보기가 아니에요.</p></section>;
}
function manualView(ctx) {
  const draft = draftFor(ctx),
    scrap = draft.sale_type === 'SCRAP';
  return wrap(scrap ? '127:6196' : '123:3466', <>{pageHeading(scrap ? '자투리 원단 입력' : '원단 등록 · 직접 입력', scrap ? '1장 그대로 판매 · 직접 입력 또는 AI 초안 확인' : '원단 정보를 입력한 뒤 등록 내용을 확인해 주세요.')}<RegistrationSteps stage={1} /><nav className={"tabs seller-tabs"} aria-label={"판매 형태"}><a className={"" + "button " + (!scrap ? 'seller-tab--active' : '')} href={"#/seller/register/manual?type=ROLL"}>{"롤 원단"}</a><a className={"" + "button " + (scrap ? 'seller-tab--active' : '')} href={"#/seller/register/manual?type=SCRAP"}>{"자투리 원단"}</a></nav>{scrap ? notice('하자를 피해 사용할 수 있는 가장 큰 직사각형을 기준으로 재주세요.', 'warning') : ''}{"\n    "}<form id={"seller-fabric-form"} className={"stack"} data-sale-type={draft.sale_type} onSubmit={ctx.runtime.fabricSubmit} ref={ctx.runtime.fabricForm} onInput={ctx.runtime.rememberInput} onChange={ctx.runtime.photoChange}><p className="muted seller-form-progress">기본 정보 → 치수·가격 → 하자 → 사진 → 등록 내용 확인</p>{ctx.query.get('from') === 'ai' ? notice('AI 예시 초안을 가져왔어요. 입력 내용은 유지되어 있으며 사진과 세부 항목을 이어서 보완할 수 있어요.') : null}<section className={"panel seller-panel"}><h2>{"기본 정보"}</h2>{field('원단 이름', 'title', {
          value: draft.title,
          required: true,
          "maxLength": "100"
        })}<fieldset className={"seller-material"}><legend>{"소재"}</legend><div className={"seller-material-options"}>{keyed(MATERIALS.map(material => <><label className={"seller-material-option"}><input type={"radio"} name={"material"} value={material} {...draft.material === material ? {
                  "defaultChecked": true
                } : {}} /><span>{material}</span></label></>))}</div></fieldset><div className={scrap ? 'stack' : 'form-grid'}>{selectField('두께', 'thickness', options(['얇음', '중간 두께', '두꺼움']), draft.thickness)}{selectField('색상 계열', 'color', options(['흰색', '검정', '회색', '내추럴', '베이지', '갈색', '빨강', '분홍', '노랑', '올리브', '초록', '블루', '네이비', '보라', '혼합']), draft.color)}</div>{field('색상 상세 / 무늬', 'color_detail', {
          value: draft.color_detail || '',
          "maxLength": "100"
        })}</section>{"\n    "}<section className={"panel seller-panel"}><h2>{"치수 / 가격"}</h2><h3>{"사용 가능 치수"}</h3><div className={scrap ? 'stack' : 'form-grid'}>{field('가로(폭) · cm', 'width_cm', {
            value: draft.width_cm,
            type: 'number',
            required: true,
            "min": "1",
            "max": "1000",
            "step": "1",
            "inputMode": "numeric"
          })}{field(scrap ? '세로(길이) · cm' : '남은 길이 · cm', 'length_cm', {
            value: scrap ? draft.length_cm : draft.remaining_length_cm ?? draft.length_cm,
            type: 'number',
            required: true,
            "min": scrap ? '1' : '90',
            "step": "1",
            "inputMode": "numeric"
          })}</div><p className={"muted seller-small"}>{scrap ? '자투리 길이는 1cm 이상의 정수로 입력해 주세요.' : '롤 잔량은 90cm 이상인 cm 정수로 입력해 주세요.'}</p><div className={scrap ? '' : 'seller-half'}>{field(scrap ? '가격 · 원/장' : '90cm(1마)당 가격 · 원', 'price', {
            value: draft.price,
            type: 'number',
            required: true,
            "min": "1",
            "step": "1",
            "inputMode": "numeric"
          })}</div></section>{"\n    "}<section className={"panel seller-panel"}><h2>{"하자"}</h2><fieldset className={"seller-defect"}><legend>{"하자가 있나요?"}</legend><div className={"actions"}><label><input type={"radio"} name={"has_defect"} value={"false"} {...!draft.has_defect ? {
                "defaultChecked": true
              } : {}} />{" 없음"}</label><label><input type={"radio"} name={"has_defect"} value={"true"} {...draft.has_defect ? {
                "defaultChecked": true
              } : {}} />{" 있음"}</label></div></fieldset>{field('하자 위치 / 내용 / 크기', 'defect_note', {
          value: draft.defect_note || '',
          "maxLength": "255",
          "placeholder": "하자가 있다면 위치와 크기를 자세히 적어 주세요."
        })}</section>{photosFields(draft)}{draft.photo_names?.length ? action('선택한 사진 확인', 'review-photos') : ''}<div className={"actions"}>{go('이전', '/seller/register')}{button('등록 내용 확인', {
          type: 'submit',
          tone: 'primary'
        })}</div></form>{notice(scrap ? '자투리는 입력한 1장 전체를 판매해요.' : '가격은 90cm(1마)당 금액이에요. 잔량은 cm 정수로 입력하며 구매 요청만 90cm 단위로 선택해요.', 'info')}</>);
}
function reviewView(ctx) {
  const draft = ctx.state.draft;
  if (!draft || draft.editing_id) return wrap('123:4153', emptyState('작성 중인 원단이 없어요', '원단 정보를 입력한 뒤 등록 내용을 확인해 주세요.', go('원단 입력하기', '/seller/register/type', 'primary')));
  const scrap = draft.sale_type === 'SCRAP';
  return wrap(scrap ? '127:6325' : '123:4153', <>{pageHeading(scrap ? '자투리 등록 내용 확인' : '등록 내용 확인', '사진과 정보를 확인한 후 승인 신청을 보내 주세요.')}<RegistrationSteps stage={3} /><div className="seller-review">
    <section className="panel seller-panel"><h2>선택한 사진 {selectedPhotos(draft).length}장</h2>{photoGallery(draft)}</section>
    <section className="panel seller-panel"><h2>원단 정보</h2>{badge('승인 신청 전', 'gray')}<h3 className="seller-review-title">{draft.title}</h3>{details(fabricRows(draft))}<div className="actions">{action('확인 후 승인 신청', 'submit-fabric', 'primary')}{go('내용 수정', `/seller/register/manual?type=${draft.sale_type}`)}</div></section>
  </div></>);
}
function storeView(ctx) {
  const store = ctx.state.store || {}, editing = ctx.state.seller.hasStore;
  return wrap('127:5855', <>{pageHeading(ctx.state.seller.hasStore ? '매장 / 픽업 정보' : '매장 정보를 입력해 주세요', '구매자에게 표시할 픽업 장소와 연락처를 확인해 주세요.')}{editing ? notice('구매자가 방문할 장소와 연락처를 수정해요. 변경 사항은 저장 후 반영돼요.') : notice('매장 정보를 저장해도 판매자 승인 상태는 바뀌지 않아요. 운영팀의 판매자 승인이 완료되면 원단을 등록할 수 있어요.', 'warning')}<form id={"seller-store-form"} className={"panel seller-panel"} onSubmit={ctx.runtime.storeSubmit}><h2>{"매장 / 픽업 정보"}</h2>{field('매장명', 'store_name', {
        value: store.store_name || '',
        required: true,
        "maxLength": "100"
      })}{field('픽업 주소', 'address', {
        value: store.address || '',
        required: true,
        "maxLength": "255"
      })}{field('상세 위치', 'detail_address', {
        value: store.detail_address || '',
        "maxLength": "255"
      })}{field('매장 연락처', 'phone_number', {
        value: store.phone_number || '',
        type: 'tel',
        required: true,
        "maxLength": "20"
      })}{field('휴무일', 'closed_days', {
        value: store.closed_days || '',
        "maxLength": "100"
      })}<label className={"field"}><span>{"픽업 가능 요일 / 시간 및 안내"}</span><textarea name={"pickup_guide"} rows={"3"} maxLength={"5000"} defaultValue={store.pickup_guide || ''}></textarea></label><div className={"actions"}>{button('매장 정보 저장', {
          type: 'submit',
          tone: 'primary'
        })}{go(editing ? '마이페이지로 돌아가기' : '나중에 입력', editing ? '/seller/profile' : '/seller/dashboard')}</div></form></>);
}
function uploadView(ctx) {
  const upload = ctx.state.upload;
  if (!upload) return wrap('210:8608', emptyState('진행 중인 등록이 없어요', '원단 내용을 확인한 뒤 승인 신청을 보내 주세요.', go('내 원단 목록', '/seller/fabrics')));
  const content = {
    CREATING: ['원단을 등록하고 있어요', '등록 내용을 저장하는 중입니다.', '등록이 완료되면 선택한 사진을 이어서 업로드해요. 잠시만 기다려 주세요.'],
    UPLOADING: ['사진을 업로드하고 있어요', '등록한 원단에 사진을 첨부하는 중입니다.', '사진 업로드가 끝나면 승인 신청 완료 화면으로 이동해요. 사진은 게시물 표시용이며 AI 분석에 사용하지 않아요.'],
    PARTIAL: ['일부 사진을 업로드하지 못했어요', '원단 정보는 저장되어 있어요.', '원단을 새로 등록하지 않고 실패한 사진만 다시 업로드해 주세요. 이미 올라간 사진은 유지됩니다.'],
    UNKNOWN: ['등록 결과를 확인하지 못했어요', '입력한 내용은 유지되어 있어요.', '원단이 등록되었는지 먼저 내 원단 목록에서 확인해 주세요. 지금 다시 등록하면 중복될 수 있어요.'],
    DONE: ['승인 신청을 보냈어요', '운영팀이 원단 정보를 확인하고 있어요.', '원단 정보와 선택한 사진이 모두 저장되었어요. 승인되면 구매자에게 게시돼요.']
  }[upload.stage] || ['등록 상태를 확인해 주세요', '', '내 원단 목록에서 현재 상태를 확인할 수 있어요.'];
  const id = {
    CREATING: '210:8608',
    UPLOADING: '210:8618',
    PARTIAL: '210:8628',
    UNKNOWN: '210:8638',
    DONE: ctx.state.draft?.sale_type === 'SCRAP' ? '210:8648' : '127:6713'
  }[upload.stage];
  const saved = ctx.state.fabrics.find(f => f.id === upload.fabric_id);
  const photos = uploadPhotoSummary(upload, saved), uploaded = photos.filter(photo => photo.status === 'DONE').length;
  const photoStatus = { DONE: '업로드 완료', FAILED: '재시도 필요', WAITING: upload.stage === 'UNKNOWN' ? '등록 결과 확인 필요' : '업로드 대기' };

  return wrap(id, <>{pageHeading(content[0], content[1])}{notice(content[2], upload.stage === 'UNKNOWN' ? 'warning' : 'info')}{upload.stage === 'DONE' && saved ? record(saved.title, details(fabricRows(saved)), {
      status: '승인 대기'
    }) : ''}{['PARTIAL', 'UPLOADING', 'UNKNOWN'].includes(upload.stage) ? <section className="panel seller-panel seller-upload-summary"><h2>{saved?.title || ctx.state.draft?.title || '작성한 원단'}</h2><p>선택 {photos.length}장 · 업로드 완료 {uploaded}장{upload.stage === 'PARTIAL' ? ` · 재시도 ${photos.filter(photo => photo.status === 'FAILED').length}장` : ''}</p><ul className="seller-upload-files">{photos.map((photo, index) => <li key={`${photo.name}-${index}`}><span>{photo.name}</span>{badge(photoStatus[photo.status], photo.status === 'FAILED' ? 'red' : photo.status === 'DONE' ? 'green' : 'gray')}</li>)}</ul></section> : null}{['CREATING', 'UPLOADING'].includes(upload.stage) ? <><div className={"seller-progress"} role={"status"}><span className={"seller-spinner"} aria-hidden={"true"}></span>{"잠시만 기다려 주세요."}</div></> : ''}<div className={"actions"}>{upload.stage === 'PARTIAL' ? action('실패한 사진 다시 시도', 'retry-photos', 'primary') : ''}{!['CREATING', 'UPLOADING'].includes(upload.stage) ? go(upload.stage === 'DONE' ? '승인 대기 목록' : '내 원단 목록 확인', upload.stage === 'DONE' ? '/seller/fabrics?status=PENDING' : '/seller/fabrics', ['UNKNOWN', 'DONE'].includes(upload.stage) ? 'primary' : 'secondary') : ''}{upload.stage === 'DONE' ? <>{go('메인으로', '/seller/dashboard')}{action('다른 원단 등록', 'new-draft')}</> : ''}</div></>, 'seller-state');
}
function reservationsView(ctx) {
  const status = ctx.query.get('status') || 'REQUESTED';
  const items = ownReservations(ctx.state).filter(r => (status === 'ALL' || r.status === status) && (!ctx.query.get('fabric') || r.fabric_id === ctx.query.get('fabric')));
  const selected = items.find(r => r.id === ctx.query.get('id')) || items[0];
  const fabric = selected && (ctx.state.fabrics.find(f => f.id === selected.fabric_id) || {
    id: selected.fabric_id,
    title: selected.fabric_title,
    price: selected.display_price,
    sale_type: selected.sale_type,
    status: 'SOLD_OUT',
    material: '',
    color: '',
    remaining_length_cm: 0
  });
  let body = emptyState('해당 상태의 예약이 없어요', '다른 상태를 선택해 예약 내역을 확인하세요.');
  if (selected && fabric) {
    const roll = selected.sale_type === 'ROLL',
      available = fabric.available_length_cm ?? (fabric.remaining_length_cm || 0) - (fabric.reserved_length_cm || 0);
    const guidance = {
      REQUESTED: ['재고 확인 후 처리', '이번 요청 수량', '실제 남은 원단과 픽업 가능 시간을 확인해 주세요.'],
      ACCEPTED: ['수령 확인', '이번 예약 확보 수량', '원단을 전달한 뒤 수령 완료로 처리해 주세요. 수령 완료 시 남은 재고에서 전달한 수량이 차감돼요.'],
      PICKED_UP: ['수령 완료 · 현재 재고', '전달한 수량', '전달한 수량을 재고에 반영했어요. 완료된 예약은 다시 처리하거나 취소할 수 없어요.'],
      REJECTED: ['거절된 예약 · 현재 재고', '거절한 요청 수량', '예약 요청을 거절했어요. 이 요청으로 확보되거나 차감된 재고는 없어요.'],
      CANCELED: ['취소된 예약 · 현재 재고', '취소한 수량', '취소된 예약은 재고를 확보하지 않아요. 처리 내역과 현재 판매 가능한 재고를 확인할 수 있어요.']
    }[selected.status];
    body = <><div className={"seller-columns"}><section className={"panel seller-panel"}><h2>{selected.status === 'REQUESTED' ? '새 픽업 예약 요청' : RESERVATION_STATUS[selected.status] + ' 예약'}</h2><div className={"seller-product-cell"}>{fabricImage(fabric, 'seller-reservation-image')}<div><h3>{selected.fabric_title}</h3><p className={"muted"}>{fabric.material}{" · "}{fabric.color}</p></div></div>{details([['구매자', selected.buyer_nickname], ['요청 수량', roll ? formatLength(selected.requested_length_cm) : '1장'], ['픽업 희망일', `${selected.pickup_date} ${selected.pickup_time}`], ['구매 요청 금액', formatPrice(selected.display_price ?? selected.estimated_price ?? fabric.price)], ['요청 사항', selected.memo || '없음']])}{badge(`현재 상태: ${RESERVATION_STATUS[selected.status]}`, tone(selected.status))}</section><section className={"panel seller-panel"}><h2>{guidance[0]}</h2>{details(roll ? [['현재 남은 길이', formatLength(fabric.remaining_length_cm)], ['현재 수락된 예약 길이', formatLength(fabric.reserved_length_cm || 0)], [guidance[1], formatLength(selected.requested_length_cm)], ['현재 판매 가능 길이', formatLength(available)]] : [['판매 형태', '자투리 · 1장'], ['현재 원단 상태', FABRIC_STATUS[fabric.status]]])}{notice(guidance[2])}{selected.reject_reason ? notice(selected.reject_reason, 'error') : ''}<div className={"actions seller-reservation-actions"}>{selected.status === 'REQUESTED' ? <>{go('거절', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=REJECTED`, 'danger')}{go('수락', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=ACCEPTED`, 'primary')}</> : selected.status === 'ACCEPTED' ? <>{go('예약 취소', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=CANCELED`, 'danger')}{go('수령 완료', `/seller/reservations/confirm?id=${encodeURIComponent(selected.id)}&action=PICKED_UP`, 'primary')}</> : <>{<><p className={"muted"}>{"처리가 완료된 예약이에요."}</p></>}{selected.status === 'PICKED_UP' && ctx.state.fabrics.some(f => f.id === selected.fabric_id) ? go('변경된 재고 확인', `/seller/fabrics/detail?id=${encodeURIComponent(selected.fabric_id)}&after=pickup`) : ''}</>}</div></section></div></>;
  }
  return wrap({
    ACCEPTED: '127:7621',
    REJECTED: '127:7753',
    PICKED_UP: '127:7892',
    CANCELED: '127:8022'
  }[status] || '123:4387', <>{pageHeading({
      ACCEPTED: '수락된 예약',
      REJECTED: '거절된 예약',
      PICKED_UP: '수령 완료 예약',
      CANCELED: '취소된 예약'
    }[status] || '판매 내역', ['PICKED_UP', 'REJECTED', 'CANCELED'].includes(status) ? '처리 결과와 현재 재고를 확인하세요.' : '픽업 예약 내용을 확인하고 처리하세요.')}{statusTabs('/seller/reservations', {
      ALL: '전체',
      ...RESERVATION_STATUS
    }, status)}{items.length > 1 ? <><nav className={"seller-reservation-list"} aria-label={"예약 선택"}>{keyed(items.map(r => <><a href={href(`/seller/reservations?status=${status}&id=${encodeURIComponent(r.id)}`)} className={"" + "button " + (selected?.id === r.id ? 'seller-tab--active' : '')}>{r.fabric_title}{" · "}{r.pickup_date}</a></>))}</nav></> : ''}{body}<dialog ref={ctx.runtime.dialogRef} id={"seller-reservation-dialog"} className={"seller-dialog"} aria-labelledby={"seller-dialog-title"}><form id={"seller-reservation-confirm"} className={"seller-panel"} onSubmit={ctx.runtime.dialogSubmit}><h2 id={"seller-dialog-title"}>{ctx.runtime.dialog?.title || "예약을 처리할까요?"}</h2><p id={"seller-dialog-description"}>{ctx.runtime.dialog?.description}</p><div className={"actions"}>{button('돌아가기', {
            "data-close-dialog": true
          })}{button('확인', {
            type: 'submit',
            tone: 'primary'
          })}</div></form></dialog></>);
}
function inquiriesView(ctx) {
  const done = ctx.query.get('status') === 'DONE',
    own = ownFabrics(ctx.state);
  const items = ctx.state.inquiries.filter(i => own.some(f => f.id === i.fabric_id) && Boolean(i.answer) === done);
  const selected = items.find(i => i.id === ctx.query.get('id')) || items[0];
  return wrap('123:4559', <>{pageHeading('문의 내역', '구매자의 문의와 답변 내용을 확인하세요.')}{statusTabs('/seller/inquiries', {
      WAITING: '답변 대기',
      DONE: '답변 완료'
    }, done ? 'DONE' : 'WAITING')}<div className={"seller-inquiries"}><section className={"panel seller-panel"}><h2>{"문의 목록"}</h2>{items.length ? <><div className={"table-wrapper"}><table className={"data-table"}><thead><tr><th>{"일자"}</th><th>{"원단"}</th><th>{"상태"}</th></tr></thead><tbody>{keyed(items.map(i => <><tr><td>{formatDate(i.created_at)}</td><td><a href={href(`/seller/inquiries?status=${done ? 'DONE' : 'WAITING'}&id=${encodeURIComponent(i.id)}`)}>{i.fabric_title}</a></td><td>{badge(done ? '답변 완료' : '답변 대기', done ? 'green' : 'amber')}</td></tr></>))}</tbody></table></div></> : emptyState('문의가 없어요', '새 문의가 들어오면 이곳에서 확인할 수 있어요.')}</section><section className={"panel seller-panel"}><h2>{"선택한 문의"}</h2>{selected ? <><h3>{selected.fabric_title}</h3><p className={"muted"}>{formatDateTime(selected.created_at)}</p>{notice(selected.content)}<div className={"field"}><span>{"판매자 답변"}</span><p className={"seller-answer"}>{selected.answer || '아직 등록된 답변이 없어요.'}</p></div><form id={"seller-inquiry-form"} className={"stack"} key={selected.id} data-inquiry-id={selected.id} onSubmit={ctx.runtime.inquirySubmit} onInput={ctx.runtime.rememberInquiry}><label className={"field"}><span>{selected.answer ? '답변 수정' : '답변 작성'}</span><textarea name={"answer"} rows={"4"} required={true} maxLength={"1000"} placeholder={"구매자에게 답변을 남겨 주세요."} defaultValue={inquiryDraft(ctx.drafts, selected)}></textarea></label>{button('답변 등록', {
              type: 'submit',
              tone: 'primary'
            })}</form></> : <><p className={"muted"}>{"확인할 문의를 선택해 주세요."}</p></>}</section></div></>);
}
function profileView(ctx) {
  const s = ctx.state.seller,
    store = ctx.state.store || {};
  return wrap('123:4699', <>{pageHeading('마이페이지', '계정과 매장 정보를 최신 상태로 관리하세요.')}<form id={"seller-profile-form"} className="stack" onSubmit={ctx.runtime.profileSubmit}><div className="seller-columns"><section className={"panel seller-panel"}><h2>{"계정 정보"}</h2>{field('닉네임', 'nickname', {
          value: s.nickname,
          required: true,
          "maxLength": "50"
        })}{field('로그인 이메일 · 변경 불가', 'email', {
          value: s.email,
          readOnly: true
        })}{field('연락처', 'phone_number', {
          value: s.phone_number || '',
          type: 'tel',
          "maxLength": "20"
        })}{badge(s.seller_approval_status === 'APPROVED' ? '승인 완료' : s.seller_approval_status === 'REJECTED' ? '승인 거절' : '승인 대기', tone(s.seller_approval_status))}{go('판매자 승인 상태 확인', '/seller/approval')}</section><section className={"panel seller-panel"}><h2>{"매장 / 픽업 정보"}</h2>{field('매장명', 'store_name', {
          value: store.store_name || '',
          required: true,
          "maxLength": "100"
        })}{field('픽업 주소 / 상세 위치', 'address', {
          value: store.address || '',
          required: true,
          "maxLength": "255"
        })}{field('매장 연락처', 'store_phone', {
          value: store.phone_number || '',
          required: true,
          type: 'tel',
          "maxLength": "20"
        })}<label className={"field"}><span>{"픽업 가능 요일 / 시간"}</span><textarea name={"pickup_guide"} maxLength={"5000"} rows={"3"} defaultValue={store.pickup_guide || ''}></textarea></label>{go('매장 정보 전체 수정', '/seller/store')}</section></div><div className="panel seller-profile-save"><p>계정 정보와 매장 정보를 함께 저장해요.</p>{button('계정·매장 변경사항 저장', { type: 'submit', tone: 'primary' })}</div></form><div className={"actions"}>{button('로그아웃', {
        "data-logout": "SELLER"
      })}</div></>);
}
function savedView() {
  return wrap('127:5927', <>{pageHeading('변경 사항을 저장했어요', '계정 및 매장 정보')}{notice('입력한 정보가 저장되었어요.')}{record('다음 단계', details([['원단 등록', '매장 정보와 판매자 승인이 모두 확인되어야 원단을 등록할 수 있어요.'], ['정보 확인', '마이페이지에서 변경한 내용을 확인할 수 있어요.']]))}<div className={"actions"}>{go('마이페이지 확인', '/seller/profile', 'primary')}{go('메인으로', '/seller/dashboard')}{go('새 원단 등록', '/seller/register')}</div></>);
}
function newDashboardView(ctx) {
  const own = ownFabrics(ctx.state),
    rs = ownReservations(ctx.state);
  return wrap('144:6910', <>{pageHeading('판매를 시작할 준비를 해볼까요?', '매장 정보와 판매자 승인 상태를 확인해 주세요.')}{notice('상품을 등록하기 전에 구매자가 방문할 매장 정보를 입력해 주세요.', 'warning')}{record('나의 판매 현황', details([['등록 원단', `${own.length}개`], ['픽업 요청', `${rs.filter(r => r.status === 'REQUESTED').length}건`], ['새 문의', `${ctx.state.inquiries.filter(i => own.some(f => f.id === i.fabric_id) && !i.answer).length}건`]]))}{record('매장 정보 등록', <><p>{"매장 등록과 판매자 승인을 모두 마치면 원단을 등록할 수 있어요."}</p></>, {
      meta: '매장명 · 픽업 주소 · 연락처 · 운영 시간',
      status: ctx.state.seller.hasStore ? '등록됨' : '입력 필요',
      actions: <>{go('매장 정보 입력', '/seller/store', 'primary')}{go('새 원단 등록', '/seller/register')}</>
    })}</>);
}
function typeView(ctx) {
  const ai = ctx.query.get('mode') === 'ai';
  const next = type => `/seller/register/${ai ? 'ai' : 'manual'}?type=${type}`;
  return wrap(ai ? '127:6105' : '127:6016', <>{pageHeading(ai ? '어떤 형태의 원단인가요?' : '어떤 형태로 판매하나요?', ai ? 'AI 등록 도우미 · 예시 대화' : '직접 입력 · 판매 형태 선택')}{ai ? notice('판매 형태에 맞춰 필요한 정보를 하나씩 확인해요. 이 화면은 AI 연결 전 예시 흐름이에요.') : ''}{record('롤 원단', <><p>{"폭은 그대로 두고 길이 방향으로 90cm(1마) 단위로 판매해요."}</p></>, {
      status: '길이로 판매',
      meta: '재고 · 이월 원단',
      actions: go(ai ? '롤 원단으로 시작' : '롤 원단 입력', next('ROLL'), 'primary')
    })}{record('자투리 원단', <><p>{"한 장을 그대로 판매해요. 사용 가능한 직사각형의 치수를 입력해 주세요."}</p></>, {
      status: '1장 그대로 판매',
      meta: '롤을 팔고 남은 끝단',
      actions: go(ai ? '자투리 원단으로 시작' : '자투리 원단 입력', next('SCRAP'), 'primary')
    })}<div className={"actions"}>{go('이전', '/seller/register')}</div></>);
}
function aiView(ctx) {
  const draft = draftFor(ctx),
    scrap = draft.sale_type === 'SCRAP',
    step = ctx.query.get('step') || 'chat',
    manual = `/seller/register/manual?type=${draft.sale_type}&from=ai`;
  const photoManual = `${manual}&focus=photos`;
  const message = (ctx.state.ai?.sale_type === draft.sale_type ? ctx.state.ai.message : '') || draft.ai_request || '';
  const example = scrap ? '아이보리 면 거즈예요. 가로 110cm, 세로 80cm이고 얇아요. 하자는 없고 한 장에 8,000원이에요.' : '내추럴 색상의 면 캔버스예요. 폭은 150cm이고 5마 남았어요. 두께는 보통이고 하자는 없어요. 1마당 5,000원입니다.';
  const disclosure = notice('예시 AI 대화예요. 입력한 설명을 보관하고 정해진 예시 초안을 보여줘요. 실제 AI 요청은 보내지 않아요.');
  if (step === 'processing') return wrap('127:6487', <>{pageHeading('답변을 정리하고 있어요', 'AI 등록 도우미 · 예시 처리 중')}<RegistrationSteps stage={1} mode="AI" />{disclosure}{record('보낸 답변', <><p>{message || '입력한 답변을 확인하고 있어요.'}</p></>)}<div className={"seller-progress"} role={"status"}><span className={"seller-spinner"} aria-hidden={"true"}></span>{"예시 초안을 준비하고 있어요."}</div><div className={"actions"}>{go('직접 입력으로 계속', manual)}</div></>);
  if (step === 'error') return wrap('127:6588', <>{pageHeading('응답을 받지 못했어요', 'AI 응답 실패 예시')}{notice('지금까지 입력한 내용은 유지했어요. 직접 입력에서 이어서 확인해 주세요.', 'error')}{record('유지된 항목', details(fabricRows(draft)))}{record('보낸 답변', <><p>{message || '아직 입력한 답변이 없어요.'}</p></>)}<div className={"actions"}>{go('직접 입력으로 계속', manual, 'primary')}{go('등록 방식으로', '/seller/register')}</div></>);
  if (step === 'result') return wrap('127:6528', <>{pageHeading('AI가 정리한 내용을 확인해 주세요', '예시 초안 · 판매자 확인 전에는 게시되지 않아요.')}{disclosure}{record('정리된 등록 항목', details(fabricRows(draft)))}{message ? record('입력한 설명', <><p>{message}</p></>) : ''}<div className={"actions"}>{go('등록 내용 확인', '/seller/register/review', 'primary')}{go('항목 직접 수정', manual)}{go('사진 추가·내용 보완', photoManual)}</div></>);
  const form = <><form id={"seller-ai-form"} className={"panel seller-panel"} data-sale-type={draft.sale_type} onSubmit={ctx.runtime.aiSubmit} ref={ctx.runtime.aiForm}><h2>{"판매자 답변"}</h2><label className={"field"}><span>{"메시지"}</span><textarea name={"ai_request"} rows={"3"} required={true} maxLength={"1000"} placeholder={"원단에 대해 알려주세요."} defaultValue={message || example}></textarea></label><div className={"actions"}>{button(scrap ? '답변 정리하기' : '보내기', {
          type: 'submit',
          tone: 'primary'
        })}{button('직접 입력으로 계속', {
          type: 'submit',
          "data-ai-direct": true
        })}{button('응답 실패 예시 보기', {
          type: 'submit',
          "data-ai-error": true
        })}</div></form></>;
  if (scrap) return wrap('127:6410', <>{pageHeading('자투리 정보를 알려주세요', 'AI 등록 도우미 · 입력한 내용은 직접 입력으로 이어갈 수 있어요.')}{disclosure}{record('원단 등록 도우미', <><p>{"자투리의 가로와 세로, 소재, 두께와 장당 가격을 알려주세요."}</p></>, {
      status: 'AI 질문'
    })}{form}{notice('사진으로 치수나 소재를 자동 판별하지 않아요. 알려주신 값을 확인해 주세요.')}</>);
  return wrap('123:3842', <>{pageHeading('원단 등록 · AI와 대화로', '대화로 정리한 내용을 직접 확인하고 수정할 수 있어요.')}{disclosure}<div className={"seller-ai-layout"}><div className={"stack"}>{record('원단 등록 도우미', <><div className={"seller-chat"}>{notice('어떤 원단을 판매하시나요? 소재와 남은 길이를 알려주세요.')}<p className={"seller-chat-user"}>{message || example}</p>{notice('예시 초안에 소재와 치수를 정리했어요. 두께, 하자 여부와 가격도 확인해 주세요.')}</div></>)}{form}</div>{record('정리된 등록 항목', <>{details([['판매 형태', '롤 원단'], ['원단 이름', draft.title], ['폭', `${draft.width_cm}cm`], ['남은 길이', formatLength(draft.remaining_length_cm)], ['소재', draft.material], ['두께', draft.thickness], ['색상 계열', draft.color], ['하자', draft.has_defect ? draft.defect_note : '없음'], ['90cm당 가격', formatPrice(draft.price)]])}{selectedPhotos(draft).length ? photoGallery(draft) : <p className="muted">선택한 사진이 없어요. 사진 추가·내용 보완에서 이어서 입력해 주세요.</p>}</>, {
        actions: <>{<>{action('사진 추가·내용 보완', 'ai-continue', 'secondary', {
              "data-path": photoManual
            })}{action('항목 직접 수정', 'ai-continue', 'secondary', {
              "data-path": manual
            })}</>}{action('등록 내용 확인', 'ai-continue', 'primary', {
            "data-path": "/seller/register/review"
          })}</>
      })}</div></>);
}
function photoView(ctx) {
  const d = draftFor(ctx), photos = selectedPhotos(d);
  return wrap('127:6637', <>{pageHeading('선택한 사진을 확인해 주세요', `사진 ${photos.length}장 선택 · 아직 업로드 전`)}<RegistrationSteps stage={2} /><section className="panel seller-panel">{photoGallery(d)}<p className="muted">사진은 원단 상세에 표시돼요. 치수·혼용률을 자동으로 판별하지 않아요.</p><div className="actions">{action('등록 내용 확인', 'photos-to-review', 'primary')}{action('입력하던 곳으로 돌아가기', 'photos-back')}</div></section></>);
}
function inputErrorView(ctx) {
  const d = draftFor(ctx),
    message = validateSellerDraft(d) || '입력한 항목과 사진을 다시 확인해 주세요.';
  return wrap('127:8297', <>{pageHeading('입력한 항목을 확인해 주세요', '원단 등록 내용을 확인하지 못했어요.')}{notice(message, 'error')}{record('확인이 필요한 항목', <>{field('사용 가능 세로(길이) · cm', 'error_length', {
        value: d.sale_type === 'ROLL' ? d.remaining_length_cm : d.length_cm,
        readOnly: true
      })}{field('가격', 'error_price', {
        value: d.price,
        readOnly: true
      })}{field('사진', 'error_photos', {
        value: (d.photo_names || []).join(', ') || '미선택',
        readOnly: true
      })}</>)}<div className={"actions"}>{go('입력 수정', `/seller/register/manual?type=${d.sale_type}`, 'primary')}{go('롤로 등록하기', '/seller/register/manual?type=ROLL')}</div></>);
}
function fabricStatusView(ctx, status, items) {
  const meta = {
    POSTED: ['127:6779', '게시 중인 원단', '구매자에게 공개된 원단을 관리하세요.'],
    PENDING: ['127:6879', '승인 대기 중인 원단', '등록 내용을 저장했어요. 운영팀 승인 후 구매자에게 공개돼요.'],
    REJECTED: ['127:7011', '승인 거절 사유를 확인해 주세요', '내용을 보완하고 다시 승인 신청할 수 있어요.'],
    SOLD_OUT: ['127:7076', '판매 완료 원단', '현재 구매자에게 노출되지 않는 원단이에요.']
  }[status];
  return wrap(meta[0], <>{pageHeading(meta[1], meta[2])}{statusTabs('/seller/fabrics', {
      ALL: '전체',
      ...FABRIC_STATUS
    }, status)}{items.length ? keyed(items.map(f => record(f.title, <><p>{f.reject_reason || `${formatPrice(f.price)} / ${f.sale_type === 'ROLL' ? '90cm' : '1장'}`}</p></>, {
      status: FABRIC_STATUS[f.status],
      meta: `${f.sale_type === 'ROLL' ? '롤' : '자투리'} · 폭 ${f.width_cm}cm · 길이 ${f.remaining_length_cm ?? f.length_cm}cm`,
      actions: <>{go(status === 'REJECTED' ? '내용 보완하기' : status === 'PENDING' ? '등록 내용 확인' : '상세보기', fabricRoute(f, status === 'REJECTED' ? 'edit' : 'detail'), status === 'REJECTED' ? 'primary' : 'secondary')}{status === 'POSTED' ? go('삭제', fabricRoute(f, 'delete'), 'danger') : ''}</>
    }))) : emptyState('해당 상태의 원단이 없어요', '다른 상태를 선택해 주세요.')}{status === 'SOLD_OUT' ? notice('롤은 남은 길이가 90cm 미만이면 판매 완료로 처리해요. 남은 원단을 판매하려면 자투리로 새로 등록해 주세요.') : ''}<div className={"actions"}>{go('새 원단 등록', '/seller/register', 'primary')}</div></>);
}
function fabricDetailView(ctx) {
  const f = fabricByQuery(ctx);
  if (!f) return missing('127:7149');
  const after = ctx.query.get('after') === 'pickup';
  return wrap(after ? '129:5726' : '127:7149', <>{pageHeading(after ? '내 원단 목록' : '내 원단 상세', after ? '수령 확인으로 변경된 원단 재고를 확인하세요.' : f.title)}{after ? notice('수령 완료된 수량을 현재 남은 길이에 반영했어요.') : fabricImage(f, 'seller-banner-image')}{record('원단 정보', <>{details(fabricRows(f))}{f.description ? <section className="seller-listing-copy"><h3>원단 소개</h3><p>{f.description}</p></section> : null}{f.reject_reason ? notice(`거절 사유: ${f.reject_reason}`, 'error') : ''}</>, {
      status: FABRIC_STATUS[f.status]
    })}{record('재고 현황', details(stockRows(f)))}<div className={"actions"}>{f.status !== 'SOLD_OUT' ? go(f.status === 'REJECTED' ? '내용 보완하기' : '정보 수정', fabricRoute(f, 'edit'), 'primary') : ''}{go('판매 내역 확인', `/seller/reservations?status=ALL&fabric=${encodeURIComponent(f.id)}`)}{go('삭제', fabricRoute(f, 'delete'), 'danger')}{go('원단 목록', '/seller/fabrics')}</div></>);
}
function fabricEditView(ctx) {
  const f = fabricByQuery(ctx);
  if (!f) return missing('127:7250');
  if (f.status === 'SOLD_OUT') return wrap('127:7076', <>{pageHeading('판매 완료 원단은 수정할 수 없어요')}{go('원단 상세로', fabricRoute(f))}</>);
  const d = draftFor(ctx),
    rejected = f.status === 'REJECTED',
    scrap = f.sale_type === 'SCRAP';
  return wrap(rejected ? '127:7322' : '127:7250', <>{pageHeading(rejected ? '거절된 원단 보완' : '원단 정보 수정', rejected ? `${f.title} · 승인 거절 항목 수정` : '게시 중인 원단의 수정 내용은 저장 즉시 반영돼요.')}{notice(rejected ? `거절 사유: ${f.reject_reason || '등록 내용을 확인해 주세요.'}` : `예약된 길이 ${formatLength(f.reserved_length_cm || 0)}보다 재고를 적게 변경할 수 없어요.`, rejected ? 'error' : 'warning')}<form id={"seller-fabric-form"} className={"panel seller-panel"} data-sale-type={f.sale_type} data-edit-id={f.id} onSubmit={ctx.runtime.fabricSubmit} ref={ctx.runtime.fabricForm} onInput={ctx.runtime.rememberInput} onChange={ctx.runtime.photoChange}><h2>{rejected ? '보완한 내용' : '원단 정보'}</h2>{field('원단 이름', 'title', {
        value: d.title,
        required: true,
        "maxLength": "100"
      })}{field('판매 형태', 'sale_type_label', {
        value: scrap ? '자투리' : '롤',
        readOnly: true
      })}<div className={"form-grid"}>{field('가로(폭) · cm', 'width_cm', {
          value: d.width_cm,
          type: 'number',
          required: true,
          "min": "1",
          "max": "1000",
          "step": "1"
        })}{field(scrap ? '세로(길이) · cm' : '남은 길이 · cm', 'length_cm', {
          value: scrap ? d.length_cm : d.remaining_length_cm,
          type: 'number',
          required: true,
          "min": scrap ? 1 : Math.max(90, f.reserved_length_cm || 0),
          "step": "1"
        })}</div>{field(scrap ? '가격 · 원/장' : '가격 · 원/90cm', 'price', {
        value: d.price,
        type: 'number',
        required: true,
        "min": "1",
        "step": "1"
      })}<label className={"field"}><span>{"판매자 설명"}</span><textarea name={"description"} rows={"3"} maxLength={"5000"} defaultValue={d.description || ''}></textarea></label><label className={"seller-defect"}><input type={"checkbox"} name={"has_defect"} value={"true"} {...d.has_defect ? {
          "defaultChecked": true
        } : {}} />{" 하자 있음"}</label>{field('하자 위치 / 내용 / 크기', 'defect_note', {
        value: d.defect_note || '',
        "maxLength": "255"
      })}{rejected ? photosFields(d) : ''}<div className={"actions"}>{button(rejected ? '확인 후 다시 승인 신청' : '수정 내용 저장', {
          type: 'submit',
          tone: 'primary'
        })}{go('취소', fabricRoute(f))}</div></form></>);
}
function deleteView(ctx) {
  const f = fabricByQuery(ctx);
  if (!f) return missing('127:7448');
  const active = ownReservations(ctx.state).filter(r => r.fabric_id === f.id && ['REQUESTED', 'ACCEPTED'].includes(r.status));
  if (active.length) return wrap('127:7402', <>{pageHeading('진행 중인 예약을 확인해 주세요', '원단 삭제 제한')}{notice('요청됨 또는 수락됨 상태의 예약이 있어 원단을 삭제할 수 없어요.', 'warning')}{record(f.title, details(active.map(r => ['진행 중 예약', `${r.buyer_nickname} · ${RESERVATION_STATUS[r.status]} · ${r.sale_type === 'ROLL' ? formatLength(r.requested_length_cm) : '1장'}`])))}<div className={"actions"}>{go('판매 내역 확인', `/seller/reservations?status=ALL&fabric=${encodeURIComponent(f.id)}`, 'primary')}{go('원단 상세로', fabricRoute(f))}</div></>);
  return wrap('127:7448', <>{pageHeading(`${f.sale_type === 'SCRAP' ? '자투리' : '롤'} 원단 상세 · 삭제 확인`, `${f.title} · 진행 중인 예약 없음`)}{notice('삭제하면 원단이 구매자 목록에서 사라져요.', 'warning')}{record('삭제할 원단', details(fabricRows(f)))}<div className={"actions"}>{action('원단 삭제', 'delete-fabric', 'danger', {
        "data-id": f.id
      })}{go('취소', fabricRoute(f))}</div></>);
}
function deletedView(ctx) {
  return wrap('127:7497', <>{pageHeading('원단을 삭제했어요', '삭제한 원단은 구매자에게 표시되지 않아요.')}{notice('원단을 삭제했어요. 구매자에게 표시되지 않아요.')}{record('남은 원단', <><div className={"table-wrapper"}><table className={"data-table"}><thead><tr><th>{"원단"}</th><th>{"판매 형태"}</th><th>{"상태"}</th></tr></thead><tbody>{keyed(ownFabrics(ctx.state).map(f => <><tr><td><a href={"" + "#" + fabricRoute(f)}>{f.title}</a></td><td>{f.sale_type === 'ROLL' ? '롤' : '자투리'}</td><td>{FABRIC_STATUS[f.status]}</td></tr></>))}</tbody></table></div></>)}<div className={"actions"}>{go('메인으로', '/seller/dashboard', 'primary')}{go('새 원단 등록', '/seller/register')}</div></>);
}
function calendarView(ctx) {
  const now = new Date(), fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(ctx.query.get('month') || '') ? ctx.query.get('month') : fallback;
  const { year, number: num, offset, days, selected } = sellerCalendar(month, ctx.query.get('date'));
  const rs = ownReservations(ctx.state).filter(r => r.status === 'ACCEPTED' && r.pickup_date.startsWith(month));
  const shown = rs.filter(r => !selected || r.pickup_date === selected);
  const resultTitle = `${selected ? formatDate(selected) : `${year}년 ${num}월 전체`} · 픽업 ${shown.length}건`;
  const monthRoute = shift => {
    const d = new Date(year, num - 1 + shift, 1);
    return `/seller/calendar?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const source = num === 9 ? '142:6789' : num === 11 ? '142:7090' : '142:6919';
  return wrap(source, <>{pageHeading('픽업 일정', '날짜를 선택하면 그날 수락된 예약을 확인할 수 있어요.')}
    <div className="actions seller-calendar-actions">{go('이전 달', monthRoute(-1))}{go('대시보드로', '/seller/dashboard')}{go('다음 달', monthRoute(1))}</div>
    {record(`${year}년 ${num}월`, <div className="seller-calendar seller-calendar-full" aria-label="월요일부터 시작하는 픽업 달력">
      {['월', '화', '수', '목', '금', '토', '일'].map(day => <span key={day} className="seller-calendar-weekday">{day}</span>)}
      {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`, items = rs.filter(r => r.pickup_date === date);
        const route = `/seller/calendar?month=${month}&date=${date}`;
        return <a key={date} className={`seller-calendar-day ${items.length ? 'has-pickup' : ''} ${selected === date ? 'is-selected' : ''}`} href={href(route)} onClick={event => { event.preventDefault(); ctx.navigate(route, { preserveScroll: true }); }} aria-current={selected === date ? 'date' : undefined} aria-label={`${year}년 ${num}월 ${i + 1}일 · 픽업 ${items.length}건`}><span>{i + 1}</span>{items.length ? <span className="seller-calendar-pickup"><span className="seller-calendar-pickup-label">픽업 </span>{items.length}건</span> : null}</a>;
      })}
    </div>)}
    <section className="stack" aria-live="polite"><div className="seller-section-heading"><h2>{resultTitle}</h2>{selected ? <a href={href(`/seller/calendar?month=${month}`)} onClick={event => { event.preventDefault(); ctx.navigate(`/seller/calendar?month=${month}`, { preserveScroll: true }); }}>이번 달 전체 보기</a> : null}</div>
      {shown.length ? shown.map(r => <Fragment key={r.id}>{record(r.fabric_title, <p>{r.buyer_nickname} · {formatDate(r.pickup_date)} {r.pickup_time} · {r.sale_type === 'ROLL' ? formatLength(r.requested_length_cm) : '1장'}</p>, { status: '수락됨', actions: go('판매 내역 확인', `/seller/reservations?status=ACCEPTED&id=${encodeURIComponent(r.id)}`, 'primary') })}</Fragment>) : notice(`${selected ? formatDate(selected) : `${num}월`}에 등록된 픽업 일정이 없어요.`)}
    </section>
  </>);
}
function reservationConfirmView(ctx) {
  const r = ownReservations(ctx.state).find(x => x.id === ctx.query.get('id')),
    next = ctx.query.get('action'),
    f = r && ctx.state.fabrics.find(x => x.id === r.fabric_id);
  if (!r || !f) return wrap('127:7558', emptyState('예약을 찾을 수 없어요', '판매 내역에서 확인해 주세요.', go('판매 내역', '/seller/reservations')));
  const data = {
    ACCEPTED: ['127:7558', '예약을 수락할까요?', '확인 후 수락', '수락하면 요청 수량이 확보돼요. 실제 재고는 수령 완료 시 차감돼요.'],
    REJECTED: ['127:7692', '예약 거절 사유를 입력해 주세요', '거절 확정', '거절 사유는 구매자에게 표시돼요.'],
    PICKED_UP: ['127:7829', '원단 전달을 완료했나요?', '전달 완료 · 수령 확인', '수령 완료 후 요청 길이만큼 실제 재고가 차감되고 취소할 수 없어요.'],
    CANCELED: ['127:7974', '예약을 취소할까요?', '예약 취소 확정', '취소하면 확보했던 수량이 풀려 다른 구매자가 예약할 수 있어요.']
  }[next];
  if (!data || !(r.status === 'REQUESTED' ? ['ACCEPTED', 'REJECTED'] : r.status === 'ACCEPTED' ? ['PICKED_UP', 'CANCELED'] : []).includes(next)) return wrap('127:7558', emptyState('현재 상태에서는 처리할 수 없어요', '예약 상태를 다시 확인해 주세요.', go('예약 확인', `/seller/reservations?status=${r.status}&id=${encodeURIComponent(r.id)}`)));
  const stock = stockAfterReservation(f, r, next);
  const transition = value => `${formatLength(stock.before[value])} → ${formatLength(stock.after[value])}`;
  const stockSummary = stock ? details([['판매 가능 길이', transition('available')], ['예약 확보 길이', transition('reserved')], ['실제 남은 길이', transition('remaining')]]) : details([['자투리 1장', next === 'ACCEPTED' ? '예약 가능 → 이번 예약으로 확보' : next === 'PICKED_UP' ? '예약 확보 → 수령 완료' : next === 'CANCELED' ? '예약 확보 → 예약 가능' : '재고 변경 없음']]);
  return wrap(data[0], <>{pageHeading(data[1], '픽업 일시와 처리 후 재고를 확인해 주세요.')}<form id="seller-reservation-page-confirm" className="panel seller-panel seller-confirm" data-reservation-id={r.id} data-status={next} onSubmit={ctx.runtime.reservationSubmit}>
    <div className="seller-columns"><section className="stack"><h2>예약 요약</h2>{details([['구매자', r.buyer_nickname], ['원단 / 요청 길이', `${r.fabric_title} / ${r.sale_type === 'ROLL' ? formatLength(r.requested_length_cm) : '1장'}`], ['픽업 일시', `${formatDate(r.pickup_date)} ${r.pickup_time}`], ['예상 금액', formatPrice(r.display_price ?? r.estimated_price ?? f.price)]])}</section>
      {next !== 'REJECTED' ? <section className="stack"><h2>처리 전 → 처리 후 재고</h2>{stockSummary}</section> : null}
    </div>{notice(data[3], 'warning')}
    {next === 'REJECTED' ? field('거절 사유', 'reason', { required: true, maxLength: 255, placeholder: '거절 사유를 입력해 주세요.' }) : null}
    {next === 'CANCELED' ? <p className="muted">구매자와 취소 여부를 확인해 주세요.</p> : null}
    <div className="actions">{button(data[2], { type: 'submit', tone: ['REJECTED', 'CANCELED'].includes(next) ? 'danger' : 'primary' })}{go('돌아가기', `/seller/reservations?status=${r.status}&id=${encodeURIComponent(r.id)}`)}</div>
  </form></>);
}
function inquiryAnsweredView(ctx) {
  const own = ownFabrics(ctx.state),
    i = ctx.state.inquiries.find(x => x.id === ctx.query.get('id') && own.some(f => f.id === x.fabric_id));
  if (!i?.answer) return wrap('127:8098', emptyState('등록된 답변이 없어요', '문의 내역에서 답변할 문의를 확인해 주세요.', go('문의 내역', '/seller/inquiries')));
  return wrap('127:8098', <>{pageHeading('답변을 등록했어요', '구매자가 내 문의에서 답변을 확인할 수 있어요.')}{statusTabs('/seller/inquiries', {
      WAITING: '답변 대기',
      DONE: '답변 완료'
    }, 'DONE')}{record(i.fabric_title, <><p>{i.content}</p></>, {
      meta: formatDateTime(i.created_at),
      status: '답변 완료'
    })}{record('판매자 답변', details([['답변', i.answer], ['등록일', formatDateTime(i.answered_at || i.created_at)]]))}<div className={"actions"}>{go('다른 문의 확인', '/seller/inquiries')}</div></>);
}
export function SellerScreen({
  ctx
}) {
  if (ctx.path.startsWith('/seller/register')) {
    if (ctx.state.seller.seller_approval_status !== 'APPROVED') return approvalView(ctx);
    if (!ctx.state.seller.hasStore) return approvalView(ctx, true);
    if (ctx.state.upload && ['CREATING', 'UPLOADING', 'PARTIAL', 'UNKNOWN'].includes(ctx.state.upload.stage)) return uploadView(ctx);
  }
  switch (ctx.path) {
    case '/seller/fabrics':
      return fabricsView(ctx);
    case '/seller/fabrics/detail':
      return fabricDetailView(ctx);
    case '/seller/fabrics/edit':
      return fabricEditView(ctx);
    case '/seller/fabrics/delete':
      return deleteView(ctx);
    case '/seller/fabrics/deleted':
      return deletedView(ctx);
    case '/seller/register':
      return registrationView(ctx);
    case '/seller/register/type':
      return typeView(ctx);
    case '/seller/register/ai':
      return aiView(ctx);
    case '/seller/register/photos':
      return photoView(ctx);
    case '/seller/register/error':
      return inputErrorView(ctx);
    case '/seller/register/manual':
      return manualView(ctx);
    case '/seller/register/review':
      return reviewView(ctx);
    case '/seller/store':
      return storeView(ctx);
    case '/seller/profile':
      return profileView(ctx);
    case '/seller/profile/saved':
      return savedView(ctx);
    case '/seller/calendar':
      return calendarView(ctx);
    case '/seller/approval':
      return approvalView(ctx, ctx.state.seller.seller_approval_status === 'APPROVED' && !ctx.state.seller.hasStore);
    case '/seller/upload':
      return uploadView(ctx);
    case '/seller/reservations':
      return reservationsView(ctx);
    case '/seller/reservations/confirm':
      return reservationConfirmView(ctx);
    case '/seller/inquiries':
      return inquiriesView(ctx);
    case '/seller/inquiries/answered':
      return inquiryAnsweredView(ctx);
    default:
      return dashboardView(ctx);
  }
}




export function UploadState({ ctx }) { return uploadView(ctx); }
