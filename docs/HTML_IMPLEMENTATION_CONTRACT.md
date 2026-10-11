# HTML prototype implementation contract
Historical contract for the preserved html-reference.html entry. The default index.html now runs React; see [REACT_MIGRATION.md](REACT_MIGRATION.md) for current component and state contracts. Existing domain, service, data and CSS resources remain shared.

Root owns src/prototype/shared/*, services/*, data/*, main.js, styles/* and entry/build.
Agents own pages/{buyer,seller,admin}.{js,css}. React is installed, but this entry uses no React.

## Context and exports
Each page exports renderBuyer(ctx)/bindBuyer(ctx), likewise Seller/Admin.
ctx = { path: '/buyer/fabrics', query: URLSearchParams, state, root: HTMLElement, navigate(path, { replace = false } = {}), refresh(), notify(message), api, drafts: Map }.
render returns HTML string. bind attaches listeners within ctx.root and optionally returns a cleanup function.
refresh re-renders using latest service state. navigate accepts '/buyer/...' (root adds #).
Use replace for completed processing routes so browser Back does not return to a dead loading screen. drafts contains tab-memory-only form values, isolated by API object; clear the relevant key after successful submission and clear all current drafts at logout/reset. Never place credentials or business-state authority there. Success feedback is scoped to its result route and does not block pointer events.
No inline handlers. Escape all dynamic text and attribute values. Never use mutable module data for business state.

## Shared UI exports (src/prototype/shared/ui.js)
escapeHtml(value), formatPrice(number), formatLength(cm)
badge(label, tone = 'green')
notice(message, tone = 'info')
pageHeading(title, description = '')
button(label, { href, type = 'button', tone = 'secondary', disabled = false, attrs = '' } = {})
emptyState(title, description = '', actionHtml = '')
fabricImage(fabric, extraClass = '') // renders local CSS fabric illustrations matching Figma shapes, respects image_url when supplied.
field(label, name, { value = '', type = 'text', required = false, readonly = false, hint = '', attrs = '' } = {})
selectField(label, name, options, value = '', attrs = '') // options [{value,label}]
No font/logo downloads by agents; root handles assets. Tote src '/assets/figma/tote.svg'.
Shared CSS: page-heading (h1+p), stack, panel, button, button--primary, button--danger, notice, notice--error, badge, field, form-grid, tabs, actions, table-wrapper, data-table, empty-state, muted, split, stat-grid, stat-card. Responsive grids fold on small screens.
Main shell renders role header/sidebar, <main id="main-content"> page HTML. Pages do not render role navigation.

## State (plain cloned snapshot from api.getState())
state.session = { role: 'BUYER'|'SELLER'|'ADMIN' }
state.buyer = { id:'buyer-1', email:'loop@example.com', nickname:'김루프', phone_number:'010-0000-0000' }
state.seller = { id:'seller-1', email:'seller@example.com', nickname:'이정원', phone_number:'010-1234-5678', seller_approval_status:'PENDING', hasStore:true }
state.store = { id:'store-1', store_name:'양주 원단상회', address:'경기도 양주시 평화로 1450', detail_address:'1층', phone_number:'031-000-0000', closed_days:'일요일 휴무', pickup_guide:'평일 10:00~18:00 방문 가능. 요청 후 판매자의 수락을 확인해 주세요.', description:'남은 원단을 새로운 쓰임으로 연결합니다.' }
state.sellers = [ { ...same seller shape, store_name }, ...4 APPROVED sellers ]
state.fabrics = [{
 id:'fabric-scrap-1'|'fabric-scrap-2'|'fabric-roll-1'|'fabric-pending-1'|...,
 title, description, sale_type:'SCRAP'|'ROLL', status:'POSTED'|'PENDING'|'REJECTED'|'SOLD_OUT',
 seller_id:'seller-1', store_name, material:'면'|'혼방', thickness:'얇음'|'중간 두께'|'두꺼움', color:'블루'|'올리브'|'내추럴',
 price:number, width_cm:number, length_cm:number|null,
 remaining_length_cm:number|null, reserved_length_cm:number, available_length_cm:number|null,
 texture:'linen'|'gingham'|'canvas', image_url:null, created_at:'2026-10-11',
 photos: [], reject_reason:null
}]
state.reservations = [{ id, fabric_id, fabric_title, sale_type, requested_length_cm:null|number, pickup_date:'YYYY-MM-DD', pickup_time:'HH:mm', memo:'', status:'REQUESTED'|'ACCEPTED'|'REJECTED'|'CANCELED'|'PICKED_UP', estimated_price:null|number, display_price:number, buyer_nickname, created_at }]
Reservation display_price/title are explicit demo-only snapshots pending B1 API agreement, not claimed wire fields.
state.inquiries = [{ id, fabric_id, fabric_title, content, is_private:false, answer:null|string, created_at }]
state.draft = null | { ...registration form data, photo_names:[] }
state.upload = null | { fabric_id, stage:'CREATING'|'UPLOADING'|'PARTIAL'|'UNKNOWN'|'DONE', failed_count:0|number }
state.demo = { createResult:'SUCCESS'|'UNKNOWN', uploadResult:'SUCCESS'|'PARTIAL' } // QA panel settable.

## Mock service methods (async mutations, getState sync)
api.getState() -> fresh snapshot
api.setRole(role) -> Promise<void>
api.reset() -> Promise<void>
api.updateProfile({nickname, phone_number}) -> Promise<buyer>
api.createInquiry({fabric_id, content, is_private:false}) -> Promise<inquiry>
api.createReservation({fabric_id, requested_length_cm, pickup_date, pickup_time, memo}) -> Promise<reservation>
api.cancelReservation(id) -> Promise<reservation>
api.updateReservation(id, status) -> Promise<reservation> // SELLER accept/reject/received, validated state machine
api.saveStore(fields) -> Promise<store> // hasStore true, never approves seller
api.saveDraft(fields) -> Promise<draft>
api.createFabric() -> Promise<fabric> // reads validated draft, approval+store gate; sets upload.UPLOADING or UNKNOWN, prevents duplicate create while unresolved
api.uploadPhotos() -> Promise<upload> // uses state.demo.uploadResult; PARTIAL or DONE; no duplicate creation
api.retryPhotos() -> Promise<upload> // retry only, sets DONE
api.setDemo({seller_approval_status?, hasStore?, createResult?, uploadResult?}) -> Promise<void>
api.reviewSeller(id, 'APPROVED'|'REJECTED') -> Promise<seller>
api.reviewFabric(id, 'POSTED'|'REJECTED', reason = '') -> Promise<fabric>
All methods throw Error with .code string on invalid operation; display human-friendly err.message, not code. Pure rules exported from shared/domain.js for tests.

## Scope, traceability
The full active Figma flow is represented by reusable pages and states. Auth and AI are explicit local simulations; never claim live authentication, AI inference, or server success.
A root review toolbar (outside service UI) switches roles/resets/scenarios so users can inspect role-specific states. Service app should not contain developer jargon.
Each implemented page retains a Figma source id annotation and a coverage record. screen-coverage.json maps all177 active frames and records8 excluded HOLD frames; shared pages may represent multiple data/state frames.

## Phase2 additions
- Pages auth.js/auth.css and preview.js provide authentication forms and the whole-flow index.
- loginDemo({role,email,password}), signupDemo({role,email,nickname,password,phone_number,terms,privacy}), logoutDemo() simulate form flow without storing passwords or tokens.
- updateSellerProfile({nickname,phone_number}), updateFabric(id,fields), deleteFabric(id), answerInquiry(id,content), prepareAiDraft({sale_type,message}) implement the remaining local transitions.
- updateFabric preserves sale_type, cannot edit SOLD_OUT or reduce roll stock below reserved length, returns REJECTED to PENDING and synchronizes selected photo names. Real image APIs remain separate integration work.
- deleteFabric soft-deletes only when no REQUESTED/ACCEPTED reservation exists; deletion of its unresolved upload record clears that local creation lock.
- getState() filters deleted fabrics but keeps reservation snapshots. SOLD_OUT after pickup rejects other pending requests for that fabric.
- data/scenarios.js creates an isolated in-memory API per screen-index scenario. main.js retains that API while following links and returns to saved data at /preview. A scenario never writes over the saved prototype.
- ?sample=1 keeps selected loading states still for inspection. Actual button flows transition through loading and results.

