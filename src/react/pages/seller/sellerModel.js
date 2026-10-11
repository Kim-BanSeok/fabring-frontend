export const PHOTO_SLOTS = [['FULL', '전체 사진', 'canvas'], ['ZOOM', '확대 사진', 'linen'], ['DEFECT', '하자 사진', 'gingham']];

export const ownFabrics = state => state.fabrics.filter(f => f.seller_id === state.seller.id);

export const canRegister = state => state.seller.seller_approval_status === 'APPROVED' && state.seller.hasStore;

export const fabricByQuery = ctx => ownFabrics(ctx.state).find(f => f.id === ctx.query.get('id'));

export function draftFor(ctx) {
  if (ctx.path === '/seller/fabrics/edit') {
    const fabric = fabricByQuery(ctx);
    if (fabric) return ctx.drafts?.get(`seller:edit:${fabric.id}`) || {
      ...fabric,
      editing_id: fabric.id,
      photo_names: fabric.photo_names || fabric.photos || [],
      photo_slots: fabric.photo_slots || {}
    };
  }
  const type = ctx.query.get('type') === 'SCRAP' ? 'SCRAP' : ctx.query.get('type') === 'ROLL' ? 'ROLL' : ctx.state.draft?.sale_type || 'ROLL';
  if (ctx.drafts?.has(`seller:register:${type}`)) return ctx.drafts.get(`seller:register:${type}`);
  if (ctx.state.draft?.sale_type === type && !ctx.state.draft.editing_id) return ctx.state.draft;
  return {
    sale_type: type,
    title: type === 'ROLL' ? '내추럴 코튼 캔버스' : '포근한 더블 거즈',
    material: '면',
    thickness: type === 'ROLL' ? '중간 두께' : '얇음',
    color: type === 'ROLL' ? '내추럴' : '흰색',
    color_detail: type === 'ROLL' ? '내추럴 · 무지' : '아이보리 · 무지',
    width_cm: type === 'ROLL' ? 150 : 110,
    length_cm: type === 'ROLL' ? 450 : 80,
    remaining_length_cm: type === 'ROLL' ? 450 : null,
    price: type === 'ROLL' ? 5000 : 8000,
    has_defect: false,
    defect_note: '',
    photo_names: [],
    photo_slots: {},
    ai_request: ctx.state.draft?.sale_type === type ? ctx.state.draft.ai_request || '' : ''
  };
}

export function formDraft(form, previous = {}) {
  const data = new FormData(form),
    type = form.dataset.saleType;
  const length = Number(data.get('length_cm'));
  const slots = previous.photo_slots && Object.keys(previous.photo_slots).length ? previous.photo_slots : Object.fromEntries(PHOTO_SLOTS.map(([slot], i) => [slot, previous.photo_names?.[i]]).filter(([, name]) => name));
  return {
    ...previous,
    sale_type: type,
    title: String(data.get('title') || '').trim(),
    material: String(data.get('material') || previous.material || '미확인'),
    thickness: String(data.get('thickness') || previous.thickness || ''),
    color: String(data.get('color') || previous.color || ''),
    color_detail: String(data.get('color_detail') ?? previous.color_detail ?? '').trim(),
    description: String(data.get('description') ?? previous.description ?? '').trim(),
    width_cm: Number(data.get('width_cm')),
    length_cm: length,
    remaining_length_cm: type === 'ROLL' ? length : null,
    price: Number(data.get('price')),
    has_defect: data.get('has_defect') === 'true',
    defect_note: String(data.get('defect_note') || '').trim(),
    photo_names: previous.photo_names || [],
    photo_slots: slots
  };
}

export function unfinishedDraft(form, previous) {
  const draft = formDraft(form, previous),
    values = new FormData(form);
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
