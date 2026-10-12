export const INQUIRY_PAGE_SIZE = 10;
export const inquiryCreateKey = id => `live:inquiry:create:${id}`;
export const inquiryAnswerKey = id => `live:inquiry:answer:${id}`;
export const INQUIRY_TARGETS_KEY = 'live:inquiry:targets';
export const INQUIRY_RECEIPT_KEY = 'live:inquiry:receipt';

export function inquiryPath(fabricId, values = {}) {
  const query = new URLSearchParams({ fabric_id: String(fabricId) });
  for (const [key, value] of Object.entries(values)) if (value != null && value !== '') query.set(key, String(value));
  return `/buyer/inquiries?${query}`;
}

export function sellerInquiryPath(values = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value != null && value !== '') query.set(key, String(value));
  return `/seller/inquiries${query.size ? `?${query}` : ''}`;
}

export function inquiryPageQuery(query, seller = false) {
  const result = { page: query.get('page') ?? 0, size: INQUIRY_PAGE_SIZE };
  const status = query.get('status') || 'WAITING';
  if (seller && status !== 'ALL') result.status = status === 'DONE' ? 'ANSWERED' : status;
  return result;
}

export function rememberInquiryTarget(drafts, fabric) {
  const current = drafts.get(INQUIRY_TARGETS_KEY) || [];
  // These are navigation shortcuts, never a substitute for the server's inquiries.
  drafts.set(INQUIRY_TARGETS_KEY, [{ id: fabric.id, title: fabric.title }, ...current.filter(item => item.id !== fabric.id)].slice(0, 20));
}

export function inquiryFailure(error, answering = false) {
  if (!error) return '';
  if (error.outcomeUnknown) return answering ? '답변이 저장되었는지 아직 확인하지 못했어요. 현재 문의를 다시 조회해 주세요.' : '문의가 등록되었는지 아직 확인하지 못했어요. 같은 문의를 다시 보내기 전에 원단의 문의 목록을 확인해 주세요.';
  if (error.status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
  if (error.status === 403) return answering ? '이 문의에 답변할 권한이 없어요.' : '이 작업을 할 수 있는 계정인지 확인해 주세요.';
  if (error.status === 404) return answering ? '문의가 없거나 더 이상 답변할 수 없어요.' : '원단이 게시 중이 아니거나 더 이상 조회할 수 없어요.';
  return error.message || '연결 상태를 확인하고 다시 시도해 주세요.';
}

// A matching question cannot prove ownership: the DTO intentionally has no buyer ID.
// In particular, do not clear an unknown create merely because its text appears in a list.
export function reconcileInquiryAnswer(operation, item) {
  return operation?.status === 'UNKNOWN' && item?.id === operation.id && item.status === 'ANSWERED' && item.answer === operation.answer
    ? { ...operation, status: 'OBSERVED' }
    : operation;
}

export async function sendInquiry(api, fabric, input, { signal, isCurrent = () => true, remember }) {
  const operation = { status: 'UNKNOWN', fabric_id: fabric.id, input: { ...input } };
  remember(operation);
  try {
    const result = await api.createInquiry(fabric.id, input, { signal });
    if (!isCurrent()) return null;
    remember({ ...operation, status: 'CONFIRMED', id: result.id });
    return result;
  } catch (error) {
    if (isCurrent() && error.name !== 'AbortError' && !error.outcomeUnknown) remember(null);
    throw error;
  }
}

export async function sendInquiryAnswer(api, item, answer, { signal, isCurrent = () => true, remember }) {
  const operation = { status: 'UNKNOWN', id: item.id, answer };
  remember(operation);
  try {
    const result = await api.answerInquiry(item.id, { answer }, { signal });
    if (!isCurrent()) return null;
    remember({ ...operation, status: 'CONFIRMED' });
    return result;
  } catch (error) {
    if (isCurrent() && error.name !== 'AbortError' && !error.outcomeUnknown) remember(null);
    throw error;
  }
}

export function startInquiryRead(api, request, success, failure) {
  const controller = new AbortController();
  let active = true;
  Promise.resolve().then(() => {
    if (!active) return undefined;
    const options = { signal: controller.signal };
    if (request.kind === 'fabric') return api.listFabricInquiries(request.id, request.query, options);
    if (request.kind === 'detail') return api.getFabric(request.id, options);
    return api.listSellerInquiries(request.query, options);
  }).then(value => { if (active) success(value); }, error => {
    if (!active || controller.signal.aborted) return;
    // A live adapter can discard a read when a concurrent write changes its
    // version. The route is still mounted, so resolve loading with a retry UI.
    failure(error?.name === 'AbortError'
      ? Object.assign(new Error('문의 정보가 변경되어 최신 목록을 다시 조회해야 해요.'), { code: 'STALE_INQUIRY_READ' })
      : error);
  });
  return () => { active = false; controller.abort(); };
}
