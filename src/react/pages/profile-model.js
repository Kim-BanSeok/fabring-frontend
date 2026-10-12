export const profileDraftKey = user => `profile:live:${user.role}:${user.userId ?? user.id}:draft`;
export const profileOperationKey = user => `profile:live:${user.role}:${user.userId ?? user.id}:operation`;
export const profileDraft = user => ({ nickname: user.nickname || '', phone_number: user.phone_number || '' });
export const profileInput = draft => ({ nickname: String(draft.nickname ?? '').trim(), phone_number: String(draft.phone_number ?? '').trim() || null });
export function profileValidation(draft) {
  const input = profileInput(draft);
  if (!input.nickname) return '닉네임을 입력해 주세요.';
  if (input.nickname.length > 50) return '닉네임은 50자 이하로 입력해 주세요.';
  if ((input.phone_number || '').length > 20) return '전화번호는 20자 이하로 입력해 주세요.';
  return '';
}
export const profileMatches = (user, input) => user.nickname === input.nickname && (user.phone_number || null) === input.phone_number;
export const sameProfileAccount = (left, right) => left.role === right.role && String(left.userId ?? left.id) === String(right.userId ?? right.id);
export function profileReadFailure(error) {
  if (error?.name !== 'AbortError') return error;
  const failure = new Error('조회 중 회원 정보가 변경되었어요. 현재 회원 정보를 다시 조회해 주세요.');
  failure.code = 'STALE_PROFILE_READ';
  return failure;
}

export function startProfileRead(api, onSuccess, onFailure) {
  const controller = new AbortController(), revision = api.getAuth().revision;
  let active = true;
  const current = () => active && !controller.signal.aborted && api.getAuth().status === 'authenticated' && api.getAuth().revision === revision;
  Promise.resolve().then(async () => {
    if (!current()) return;
    const result = await api.getMyProfile({ signal: controller.signal });
    if (current()) onSuccess(result);
  }).catch(error => { if (current()) onFailure(profileReadFailure(error)); });
  return () => { active = false; controller.abort(); };
}

// Record uncertainty before sending: leaving the page cannot silently unlock a
// pending PATCH. A later GET can establish what is currently stored, never prove
// that a different in-flight value will not still arrive.
export async function saveProfile(api, { user, draft, signal, isCurrent = () => true, onOperation }) {
  const error = profileValidation(draft); if (error) throw new Error(error);
  const input = profileInput(draft), operation = { status: 'UNKNOWN', input };
  if (!isCurrent()) return null;
  onOperation(operation);
  let result;
  try { result = await api.updateProfile(input, { signal }); }
  catch (failure) {
    if (isCurrent()) onOperation(failure.outcomeUnknown || failure.name === 'AbortError' ? operation : null);
    throw failure;
  }
  if (!isCurrent()) return null;
  if (!sameProfileAccount(user, result) || !profileMatches(result, input)) {
    const failure = new Error('저장 결과를 확인하지 못했어요. 현재 회원 정보를 다시 조회해 주세요.');
    failure.outcomeUnknown = true;
    throw failure;
  }
  onOperation({ ...operation, status: 'CONFIRMED' });
  return result;
}
