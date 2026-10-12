export const SELLER_STORE_DRAFT_KEY = 'seller:live:store-draft';
export const SELLER_STORE_OPERATION_KEY = 'seller:live:store-operation';
export const SELLER_STORE_FIELDS = ['store_name', 'address', 'phone_number', 'closed_days', 'pickup_guide'];
export const SELLER_APPROVAL_LABELS = { APPROVED: '승인 완료', PENDING: '승인 대기', REJECTED: '승인 거절' };

export function sellerStoreDraft(store) {
  return Object.fromEntries(SELLER_STORE_FIELDS.map(key => [key, store?.[key] ?? '']));
}
export function readSellerStoreForm(form) {
  const data = new FormData(form);
  return Object.fromEntries(SELLER_STORE_FIELDS.map(key => [key, String(data.get(key) || '')]));
}
export function sellerStoreInput(draft) {
  return Object.fromEntries(SELLER_STORE_FIELDS.map(key => {
    const value = String(draft[key] ?? '').trim();
    return [key, ['closed_days', 'pickup_guide'].includes(key) ? value || null : value];
  }));
}
export function sellerStoreValidation(draft) {
  const fields = [['store_name', '매장명', 100, true], ['address', '픽업 주소 / 상세 위치', 255, true], ['phone_number', '매장 연락처', 20, true], ['closed_days', '휴무일', 100, false], ['pickup_guide', '픽업 안내', 5000, false]];
  for (const [key, label, max, required] of fields) {
    const text = String(draft[key] ?? '').trim();
    if (required && !text) return `${label}를 입력해 주세요.`;
    if (text.length > max) return `${label}는 ${max.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`;
  }
  return '';
}
export function sellerStoreNeedsReview(error) {
  return Boolean(error?.outcomeUnknown || ['STORE_ALREADY_EXISTS', 'NOT_FOUND'].includes(error?.code));
}
export function sellerStoreFailure(error) {
  if (!error) return '';
  if (error.outcomeUnknown) return '저장 결과를 확인하지 못했어요. 같은 요청을 다시 보내기 전에 서버의 매장 정보를 조회해 주세요.';
  if (error.code === 'STORE_ALREADY_EXISTS') return '이미 등록된 매장이 있어요. 입력 내용은 유지했습니다. 서버의 매장을 확인한 뒤 수정 여부를 선택해 주세요.';
  if (error.code === 'NOT_FOUND') return '매장 정보를 찾을 수 없어요. 현재 등록 여부를 다시 조회해 주세요.';
  return error.message || '처리하지 못했어요. 잠시 후 다시 확인해 주세요.';
}

// A fresh profile is read first. A failed store read is never converted into an
// empty registration form: only the adapter's precise NOT_FOUND result is null.
export function startSellerStoreRead(api, profileOnly, onSuccess, onFailure) {
  const controller = new AbortController(); let active = true;
  Promise.resolve().then(async () => {
    if (!active) return;
    const seller = await api.refreshSellerProfile({ signal: controller.signal });
    if (!active) return;
    const store = profileOnly ? null : await api.getMyStore({ signal: controller.signal });
    if (active) onSuccess({ seller, store });
  }).catch(error => { if (active && !controller.signal.aborted && error?.name !== 'AbortError') onFailure(error); });
  return () => { active = false; controller.abort(); };
}

// Persist UNKNOWN before sending so a page leave cannot silently unlock a POST.
// Persist the acknowledgement before later reads; a failed GET must not cause a
// successful registration to be submitted again.
export async function saveSellerStore(api, { existing, draft, signal, isCurrent = () => true, onOperation }) {
  const message = sellerStoreValidation(draft); if (message) throw new Error(message);
  const input = sellerStoreInput(draft), kind = existing ? 'update' : 'create';
  const pending = { kind, status: 'UNKNOWN', input };
  if (!isCurrent()) return null;
  onOperation(pending);
  let result;
  try { result = existing ? await api.updateStore(input, { signal }) : await api.createStore(input, { signal }); }
  catch (error) {
    if (isCurrent()) onOperation(sellerStoreNeedsReview(error) ? { ...pending, code: error.code, message: sellerStoreFailure(error) } : null);
    throw error;
  }
  if (!isCurrent()) return null;
  const confirmed = { ...pending, status: 'CONFIRMED', id: result.id };
  onOperation(confirmed); return confirmed;
}
