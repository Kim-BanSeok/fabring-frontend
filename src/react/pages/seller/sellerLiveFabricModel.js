import { validateSellerDraft } from './sellerModel.js';

export const LIVE_FABRIC_STATUS = { POSTED: '게시 중', PENDING: '승인 대기', REJECTED: '승인 거절', SOLD_OUT: '판매 완료' };
export const LIVE_PHOTO_SLOTS = [['FULL', '전체 사진'], ['ZOOM', '확대 사진'], ['DEFECT', '하자 사진']];
export const LIVE_UPLOAD_KEY = 'seller:live:upload';
export const liveFabricDraftKey = type => `seller:live:register:${type}`;
export const liveEditDraftKey = id => `seller:live:edit:${id}`;
export const liveFabricType = ctx => ctx.query.get('type') === 'SCRAP' ? 'SCRAP' : ctx.query.get('type') === 'ROLL' ? 'ROLL' : ctx.drafts.get('seller:live:last-type') || 'ROLL';
export function emptyLiveFabricDraft(type) {
  return { sale_type: type, title: '', material: '미확인', thickness: '', color: '', color_detail: '', width_cm: '', length_cm: '', remaining_length_cm: type === 'ROLL' ? '' : null, price: '', has_defect: false, defect_note: '', description: '', photos: [] };
}
export function readLiveFabricForm(form, previous) {
  const data = new FormData(form), result = { ...previous };
  for (const key of ['title', 'material', 'thickness', 'color', 'color_detail', 'description', 'defect_note']) if (data.has(key)) result[key] = String(data.get(key));
  for (const key of ['width_cm', 'length_cm', 'price']) if (data.has(key)) result[key] = data.get(key) === '' ? '' : Number(data.get(key));
  if (data.has('has_defect')) result.has_defect = data.get('has_defect') === 'true';
  if (result.sale_type === 'ROLL') result.remaining_length_cm = result.length_cm;
  return result;
}
export function validateLiveFabricDraft(draft, photosRequired = false) {
  const result = validateSellerDraft(draft, false);
  if (result) return result;
  if (!draft.thickness || !draft.color) return '두께와 색상 계열을 선택해 주세요.';
  if (typeof draft.has_defect !== 'boolean') return '하자 여부를 확인해 선택해 주세요.';
  if (draft.price > 2147483647 || (draft.remaining_length_cm || 0) > 2147483647) return '가격과 남은 길이는 2,147,483,647 이하의 정수로 입력해 주세요.';
  if ((draft.description || '').length > 5000) return '판매자 설명은 5,000자 이하로 입력해 주세요.';
  if (photosRequired && !draft.photos?.length) return '원단 사진을 한 장 이상 선택해 주세요.';
  return '';
}
export function validateLivePhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) return '0바이트보다 크고 5MB 이하인 jpg·png·webp 사진을 선택해 주세요.';
  return '';
}

const listKeys = ['status', 'page', 'size', 'mode'];
export function liveFabricListPath(ctx, changes = {}) {
  const raw = ctx.path === '/seller/fabrics' ? ctx.query : new URLSearchParams(safeFabricReturn(ctx.query.get('return')).split('?')[1]);
  const query = new URLSearchParams(listKeys.filter(key => raw.has(key)).map(key => [key, raw.get(key)]));
  for (const [key, value] of Object.entries(changes)) {
    if (!listKeys.includes(key)) continue;
    if (value == null || value === '') query.delete(key); else query.set(key, String(value));
  }
  return `/seller/fabrics${query.size ? `?${query}` : ''}`;
}
function safeFabricReturn(value) {
  return value && !/[\\#\r\n]/.test(value) && value.split('?')[0] === '/seller/fabrics' ? value : '/seller/fabrics';
}
export function liveFabricPath(ctx, id, action = 'detail') {
  return `/seller/fabrics/${action}?${new URLSearchParams({ id: String(id), return: liveFabricListPath(ctx) })}`;
}
export function liveFabricListQuery(query) {
  const result = {};
  if (query.get('status') && query.get('status') !== 'ALL') result.status = query.get('status');
  for (const key of ['page', 'size']) if (query.has(key)) result[key] = query.get(key);
  return result;
}
export function liveFabricFailure(error) {
  if (!error) return null;
  if (error.outcomeUnknown) return { locked: true, message: '처리 결과를 확인하지 못했어요. 같은 요청을 다시 보내기 전에 현재 원단과 사진을 조회해 주세요. 서버에 이미 저장되었을 수 있습니다.' };
  const messages = {
    FABRIC_HAS_ACTIVE_RESERVATION: '요청됨 또는 수락됨 예약이 있어 삭제할 수 없어요. 판매 내역을 확인해 주세요.',
    INSUFFICIENT_LENGTH: '수락된 예약이 확보한 길이보다 적게 줄일 수 없어요. 현재 재고와 예약을 다시 확인해 주세요.',
    INVALID_STATUS: '원단 상태가 바뀌었어요. 현재 원단 정보를 다시 확인해 주세요.',
    SELLER_NOT_APPROVED: '판매자 승인이 완료되어야 원단을 등록할 수 있어요.',
    STORE_REQUIRED: '원단 등록 전에 매장 정보가 필요해요. 마이페이지에서 매장 정보를 등록해 주세요.',
    IMAGE_LIMIT_EXCEEDED: '사진은 원단당 최대 3장이에요. 현재 등록된 사진을 다시 확인해 주세요.',
  };
  return { locked: ['INVALID_STATUS', 'NOT_FOUND', 'FORBIDDEN', 'SELLER_NOT_APPROVED', 'STORE_REQUIRED'].includes(error.code), message: messages[error.code] || error.message || '처리하지 못했어요. 입력 내용과 현재 상태를 확인해 주세요.' };
}

// Record uncertain state before each POST. If the view is disposed, the next
// visit must not interpret an aborted request as proof that the photo was not saved.
export async function uploadLiveFabricPhotos(api, initial, { signal, isCurrent = () => true, onChange }) {
  // Even a caller outside the recovery screen cannot resume an uncertain batch.
  // The user must first compare server photos and resolve the uncertain entry.
  if (initial.photos.some(photo => photo.status === 'UNKNOWN')) return initial;
  let job = { ...initial, photos: initial.photos.map(photo => ({ ...photo })) };
  const publish = () => { if (isCurrent()) onChange({ ...job, photos: job.photos.map(photo => ({ ...photo })) }); };
  for (let index = 0; index < job.photos.length; index++) {
    const photo = job.photos[index];
    if (!['PENDING', 'FAILED'].includes(photo.status)) continue;
    if (!isCurrent()) return job;
    photo.status = 'UNKNOWN'; photo.error = ''; job.stage = 'PARTIAL'; publish();
    try {
      const result = await api.uploadFabricImage(job.fabric_id, photo.file, photo.slot, { signal });
      if (!isCurrent()) return job;
      Object.assign(photo, { status: 'DONE', imageId: result.id, image_url: result.image_url }); publish();
    } catch (error) {
      if (!isCurrent()) return job;
      Object.assign(photo, { status: error.outcomeUnknown ? 'UNKNOWN' : 'FAILED', error: error.message }); publish();
      if (error.outcomeUnknown) break;
    }
  }
  job.stage = job.photos.every(photo => ['DONE', 'SKIPPED'].includes(photo.status)) ? 'DONE' : 'PARTIAL';
  publish(); return job;
}
