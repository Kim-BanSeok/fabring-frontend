import { ApiError, createHttpClient } from './http-client.js';

export const AUTH_STORAGE_KEY = 'yangju-loop-auth-v1';
const roles = ['BUYER', 'SELLER', 'ADMIN'];
const blankProfile = () => ({ id: null, email: '', nickname: '', phone_number: null, hasStore: false, seller_approval_status: null });
const validUser = user => user && user.userId != null && roles.includes(user.role) && typeof user.hasStore === 'boolean' && typeof user.nickname === 'string';
const cancelled = () => new DOMException('Aborted', 'AbortError');

// This adapter contains no demo fixtures. Unconnected business operations never report success.
export function createLiveApi({ baseUrl = '/api/v1', fetchImpl, storage = globalThis.sessionStorage, now = Date.now, timeoutMs } = {}) {
  let credential = null, user = null, store = {}, storeError = '', restorePromise, revision = 0;
  let status = 'anonymous', error = '', expiryTimer;
  const listeners = new Set();
  try {
    const saved = JSON.parse(storage?.getItem(AUTH_STORAGE_KEY) || 'null');
    if (saved?.baseUrl === baseUrl && typeof saved.accessToken === 'string' && saved.accessToken && Number.isFinite(saved.expiresAt)) {
      if (saved.expiresAt > now()) { credential = saved; status = 'restoring'; }
      else { status = 'expired'; storage?.removeItem(AUTH_STORAGE_KEY); }
    }
  } catch { /* Storage may be unavailable; a memory-only session is still usable. */ }
  const emit = () => listeners.forEach(listener => listener());
  const persist = () => {
    try {
      if (credential) storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...credential, baseUrl }));
      else storage?.removeItem(AUTH_STORAGE_KEY);
    } catch { /* Do not turn a successful login into an error when storage is blocked. */ }
  };
  function clearSession(nextStatus = 'anonymous') {
    revision++; clearTimeout(expiryTimer);
    credential = null; user = null; store = {}; storeError = ''; error = ''; status = nextStatus;
    persist(); emit();
  }
  function checkExpiry() {
    if (credential && credential.expiresAt <= now()) clearSession('expired');
  }
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    if (!credential) return;
    expiryTimer = setTimeout(() => { checkExpiry(); scheduleExpiry(); }, Math.min(Math.max(credential.expiresAt - now(), 1), 2147483647));
    expiryTimer.unref?.();
  }
  const request = createHttpClient({ baseUrl, fetchImpl, timeoutMs,
    getToken: () => { checkExpiry(); return credential?.accessToken; },
    onUnauthorized: token => { if (token && token === credential?.accessToken) clearSession('expired'); },
  });
  async function account(token, signal, authenticated = false) {
    const profile = await request('/users/me', { token, signal, authenticated });
    if (!validUser(profile) || typeof profile.email !== 'string') throw new ApiError('INVALID_RESPONSE', '계정 정보를 확인하지 못했어요. 다시 로그인해 주세요.');
    let ownStore = {}, ownStoreError = '';
    if (profile.role === 'SELLER' && profile.hasStore) {
      try {
        const result = await request('/stores/me', { token, signal, authenticated });
        if (!result || result.storeId == null) throw new ApiError('INVALID_RESPONSE', '매장 정보를 확인하지 못했어요.');
        ownStore = { id: result.storeId, store_name: result.store_name, address: result.store_address, phone_number: result.store_phone, closed_days: result.closed_days, pickup_guide: result.pickup_guide };
      } catch (failure) {
        if (signal?.aborted || failure.status === 401) throw failure;
        ownStoreError = '매장 정보를 불러오지 못했어요. 다시 로그인하면 정보를 다시 확인합니다.';
      }
    }
    return { user: profile, store: ownStore, storeError: ownStoreError };
  }
  async function restore() {
    checkExpiry();
    if (!credential || status === 'authenticated') return;
    if (restorePromise) return restorePromise;
    const version = revision, token = credential.accessToken;
    status = 'restoring'; error = ''; emit();
    restorePromise = (async () => {
      try {
        const result = await account(token, undefined, true);
        if (revision !== version || credential?.accessToken !== token) return;
        ({ user, store, storeError } = result); status = 'authenticated'; scheduleExpiry();
      } catch (failure) {
        if (revision !== version) return;
        if (failure.status === 401 || failure.status === 404) { clearSession('expired'); return; }
        user = null; status = 'unavailable'; error = failure.message;
      } finally {
        restorePromise = null;
        emit();
      }
    })();
    return restorePromise;
  }
  const api = {
    mode: 'live',
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getAuth: () => ({ status, user: user ? structuredClone(user) : null, error, revision }),
    checkExpiry, restore,
    getState() {
      const profile = user ? { ...user, id: user.userId } : blankProfile();
      return {
        session: { role: user?.role || null, authenticated: status === 'authenticated' },
        buyer: user?.role === 'BUYER' ? profile : blankProfile(),
        seller: user?.role === 'SELLER' ? profile : blankProfile(), admin: user?.role === 'ADMIN' ? profile : blankProfile(),
        store: structuredClone(store), storeError, fabrics: [], sellers: [], reservations: [], inquiries: [], draft: null, upload: null, ai: null, demo: {},
      };
    },
    async signup(input, { signal } = {}) {
      if (!['BUYER', 'SELLER'].includes(input.role)) throw new ApiError('FORBIDDEN', '관리자 계정은 회원가입으로 만들 수 없어요.');
      const result = await request('/auth/signup', { method: 'POST', signal, body: {
        email: input.email.trim().toLowerCase(), password: input.password, nickname: input.nickname.trim(), role: input.role,
        phone_number: input.phone_number?.trim() || null, terms_agreed: input.terms === true, privacy_agreed: input.privacy === true,
      } });
      if (result?.userId == null || result.role !== input.role) throw new ApiError('INVALID_RESPONSE', '가입 결과를 확인하지 못했어요. 가입한 이메일로 로그인해 확인해 주세요.');
      return { ...result, email: input.email.trim().toLowerCase() };
    },
    async login(input, { signal } = {}) {
      const version = revision;
      const result = await request('/auth/login', { method: 'POST', signal, body: { email: input.email.trim().toLowerCase(), password: input.password } });
      if (typeof result?.accessToken !== 'string' || !result.accessToken || !Number.isFinite(result.expiresIn) || result.expiresIn <= 0 || !validUser(result.user)) throw new ApiError('INVALID_RESPONSE', '로그인 응답을 확인하지 못했어요. 다시 시도해 주세요.');
      const expiresAt = now() + result.expiresIn * 1000;
      const profile = await account(result.accessToken, signal);
      if (signal?.aborted || revision !== version) throw cancelled();
      if (profile.user.userId !== result.user.userId || profile.user.role !== result.user.role) throw new ApiError('INVALID_RESPONSE', '로그인한 계정 정보를 다시 확인해 주세요.');
      return { ...profile, role: profile.user.role, first_login: profile.user.role === 'SELLER' && !profile.user.hasStore,
        credential: { accessToken: result.accessToken, expiresAt }, revision: version };
    },
    // Commit only when the processing view consumes its still-active request.
    commitLogin(result) {
      if (result.revision !== revision) throw cancelled();
      if (result.credential.expiresAt <= now()) throw new ApiError('UNAUTHORIZED', '로그인 유효 시간이 지났어요. 다시 로그인해 주세요.');
      revision++; credential = result.credential; user = result.user; store = result.store; storeError = result.storeError;
      status = 'authenticated'; error = ''; persist(); scheduleExpiry(); emit();
    },
    async logout() { clearSession(); },
  };
  for (const name of ['updateProfile', 'updateSellerProfile', 'saveStore', 'createInquiry', 'answerInquiry', 'createReservation', 'cancelReservation', 'updateReservation', 'updateFabric', 'deleteFabric', 'prepareAiDraft', 'saveDraft', 'createFabric', 'uploadPhotos', 'retryPhotos', 'reviewSeller', 'reviewFabric']) {
    api[name] = async () => { throw new ApiError('NOT_CONNECTED', '이 기능은 아직 서버와 연결되지 않았어요. 전체 화면 미리보기에서 흐름을 확인할 수 있어요.'); };
  }
  return api;
}
