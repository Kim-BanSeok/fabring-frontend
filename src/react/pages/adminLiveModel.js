import { adminRoute, canReviewSeller } from './admin-review.js';

export const ADMIN_SELLER_STATUS = { PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '승인 거절' };
export const ADMIN_FABRIC_STATUS = { PENDING: '승인 대기', POSTED: '게시 중', REJECTED: '승인 거절', SOLD_OUT: '판매 완료' };
export const adminOperationKey = (kind, id) => `admin:live:review:${kind}:${id}`;
export const adminReasonKey = id => `admin:live:reason:${id}`;

const integer = (value, fallback, min, max) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;
export function adminListQuery(query, kind = 'fabrics') {
  const labels = kind === 'sellers' ? ADMIN_SELLER_STATUS : ADMIN_FABRIC_STATUS;
  return { status: Object.hasOwn(labels, query.get('status')) ? query.get('status') : 'PENDING', page: integer(query.get('page'), 0, 0, Number.MAX_SAFE_INTEGER), size: integer(query.get('size'), 20, 1, 50) };
}

export function safeLiveAdminReturn(value, fallback = '/admin/dashboard') {
  if (typeof value !== 'string' || !value.startsWith('/admin/')) return fallback;
  try {
    const url = new URL(value, 'https://admin.local');
    if (url.origin !== 'https://admin.local' || !/^\/admin\/(dashboard|approvals|sellers(?:\/[^/]+)?|fabrics(?:\/[^/]+)?)$/.test(url.pathname)) return fallback;
    const params = {};
    for (const key of ['status', 'id', 'listStatus', 'page', 'size', 'from', 'result', 'preview']) if (url.searchParams.has(key)) params[key] = url.searchParams.get(key);
    return adminRoute(url.pathname, params);
  } catch { return fallback; }
}

export function adminListBack(kind, query, status = 'PENDING') {
  const base = kind === 'fabrics' && query.get('from') === 'approvals' ? '/admin/approvals' : `/admin/${kind}`;
  return adminRoute(base, { ...adminListQuery(new URLSearchParams({ status: query.get('listStatus') || status, page: query.get('page') || '0', size: query.get('size') || '20' }), kind) });
}

export function adminItemPath(kind, id, listPath) {
  const safe = safeLiveAdminReturn(listPath, `/admin/${kind}?status=PENDING`);
  const list = new URL(safe, 'https://admin.local');
  const query = adminListQuery(list.searchParams, kind);
  return adminRoute(`/admin/${kind}/${encodeURIComponent(id)}`, { listStatus: query.status, page: query.page, size: query.size, from: list.pathname === '/admin/approvals' ? 'approvals' : undefined });
}

export function adminReviewPath(kind, id, next, returnTo, listPath) {
  const item = new URL(adminItemPath(kind, id, listPath), 'https://admin.local');
  return adminRoute(item.pathname, { ...Object.fromEntries(item.searchParams), action: next === 'REJECTED' ? 'reject' : 'approve', returnTo: safeLiveAdminReturn(returnTo, item.pathname) });
}

export function adminCanReview(kind, item, next) {
  if (kind === 'sellers') return canReviewSeller(item.seller_approval_status, next);
  return item.status === 'PENDING' && ['POSTED', 'REJECTED'].includes(next);
}
export function adminHasPhotos(item) { return Array.isArray(item.images) && item.images.length > 0; }
export function adminReviewConfirmed(operation, next, currentStatus) {
  // A seller may resubmit a rejected fabric. Its previous ACK cannot lock a new
  // PENDING review cycle, even when the administrator chooses the same decision.
  return operation?.status === 'CONFIRMED' && operation.next === next && currentStatus === next;
}

// Only compare fields supplied by the real administrative list contract.
export function adminReviewSignature(kind, item) {
  return JSON.stringify(kind === 'sellers'
    ? [item.id, item.seller_approval_status, item.nickname, item.email, item.phone_number, item.store]
    : [item.id, item.status, item.title, item.sale_type, item.price, item.remaining_length_cm, item.reserved_length_cm, item.available_length_cm, item.store_name, item.store, item.material, item.thickness, item.color, item.color_detail, item.width_cm, item.length_cm, item.has_defect, item.defect_note, item.blend_ratio, item.weave, item.grain_direction, item.description, item.images]);
}
function reviewError(code, message) { return Object.assign(new Error(message), { code }); }
export function adminReviewNeedsRead(error) {
  return Boolean(error?.outcomeUnknown || ['INVALID_STATUS', 'IMAGE_REQUIRED', 'NOT_FOUND', 'REVIEW_CHANGED', 'DATA_CHANGED', 'LOOKUP_INCOMPLETE'].includes(error?.code));
}
export function adminReviewFailure(error) {
  if (error?.outcomeUnknown) return '서버의 처리 결과를 확인하지 못했어요. 같은 처리를 반복하지 말고 최신 상태를 먼저 확인해 주세요.';
  if (error?.code === 'INVALID_STATUS') return '승인 상태가 변경되어 처리하지 못했어요. 최신 상태를 확인해 주세요.';
  if (error?.code === 'IMAGE_REQUIRED') return '등록 사진이 없어 게시할 수 없어요. 최신 원단 정보를 확인해 주세요.';
  if (error?.code === 'NOT_FOUND') return '현재 목록에서 대상을 찾을 수 없어요. 목록과 최신 상태를 다시 확인해 주세요.';
  return error?.message || '처리하지 못했어요. 잠시 후 다시 확인해 주세요.';
}

export function startAdminRead(api, request, onSuccess, onError) {
  const controller = new AbortController(); let active = true;
  Promise.resolve().then(() => {
    if (!active) return undefined;
    const options = { signal: controller.signal, statusHint: request.statusHint };
    if (request.type === 'dashboard') return api.getAdminDashboard(options);
    if (request.type === 'detail') return request.kind === 'sellers' ? api.getAdminSeller(request.id, options) : api.getAdminFabric(request.id, options);
    return request.kind === 'sellers' ? api.listAdminSellers(request.query, options) : api.listAdminFabrics(request.query, options);
  }).then(data => { if (active) onSuccess(data); }, error => {
    if (!active || controller.signal.aborted) return;
    // A completed mutation can invalidate a GET started in the destination
    // route. That live screen still needs an error/retry, not endless loading.
    onError(error?.name === 'AbortError'
      ? reviewError('DATA_CHANGED', '조회 중 관리 정보가 변경됐어요. 최신 정보를 다시 조회해 주세요.')
      : error);
  });
  return () => { active = false; controller.abort(); };
}

export async function submitAdminReview(api, { kind, item, next, reason = '', signal, isCurrent = () => true, onOperation = () => {} }) {
  const trimmed = reason.trim();
  if (!adminCanReview(kind, item, next)) throw reviewError('INVALID_STATUS', '현재 상태에서는 이 처리를 할 수 없어요.');
  if (kind === 'fabrics' && next === 'REJECTED' && (!trimmed || trimmed.length > 255)) throw reviewError('VALIDATION_ERROR', '거절 사유를 1~255자로 입력해 주세요.');
  let pending;
  try {
    const options = { signal, statusHint: kind === 'sellers' ? item.seller_approval_status : item.status };
    const fresh = kind === 'sellers' ? await api.getAdminSeller(item.id, options) : await api.getAdminFabric(item.id, options);
    if (!isCurrent()) return null;
    if (!adminCanReview(kind, fresh, next)) throw reviewError('INVALID_STATUS', '현재 상태에서는 이 처리를 할 수 없어요.');
    if (adminReviewSignature(kind, fresh) !== adminReviewSignature(kind, item)) throw reviewError('REVIEW_CHANGED', '검토 중 등록 내용이 변경됐어요. 최신 정보를 다시 읽고 확인해 주세요.');
    if (kind === 'fabrics' && next === 'POSTED' && !adminHasPhotos(fresh)) throw reviewError('IMAGE_REQUIRED', '사진이 등록된 원단만 승인할 수 있어요.');
    pending = { kind, id: String(item.id), next, status: 'UNKNOWN', reason: kind === 'fabrics' && next === 'REJECTED' ? trimmed : null, title: kind === 'sellers' ? item.nickname : item.title };
    onOperation(pending);
    const result = kind === 'sellers' ? await api.reviewSeller(item.id, next, { signal }) : await api.reviewFabric(item.id, next, trimmed, { signal });
    if (!isCurrent()) return null;
    const operation = { ...pending, status: 'CONFIRMED', result };
    onOperation(operation); return operation;
  } catch (error) {
    if (isCurrent()) {
      if (adminReviewNeedsRead(error)) onOperation({ ...(pending || { kind, id: String(item.id), next }), status: error?.outcomeUnknown ? 'UNKNOWN' : 'REVIEW_REQUIRED', code: error.code, message: adminReviewFailure(error) });
      else onOperation(null);
    }
    throw error;
  }
}
