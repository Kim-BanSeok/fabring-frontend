import { ApiError, createHttpClient } from './http-client.js';
import { fabricQuery, fabricPage, fabricDetail, fabricIdentifier } from './fabric-contract.js';
import { reservationQuery, reservationPage, reservationDetail, reservationIdentifier, reservationInput, reservationMutation,
  receivedReservationQuery, receivedReservationPage, acceptReservationInput, rejectReservationInput } from './reservation-contract.js';
import { SELLER_FABRIC_STATUSES, SELLER_INQUIRY_STATUSES, sellerStatusCount, collectSellerPickups } from './seller-dashboard-contract.js';
import { ownFabricQuery, ownFabricPage, ownFabricDetail, sellerFabricInput, fabricMutation, fabricDeletion, imageUploadBody, fabricImage } from './seller-fabric-contract.js';
import { storeInput, storeDetail, storeCreated } from './store-contract.js';
import { ADMIN_FABRIC_STATUSES, ADMIN_SELLER_STATUSES, adminQuery, adminPage, adminReview, adminReviewResult, findAdminSeller } from './admin-contract.js';

export const AUTH_STORAGE_KEY = 'yangju-loop-auth-v1';
const roles = ['BUYER', 'SELLER', 'ADMIN'];
const blankProfile = () => ({ id: null, email: '', nickname: '', phone_number: null, hasStore: false, seller_approval_status: null });
const validUser = user => user && user.userId != null && roles.includes(user.role) && typeof user.hasStore === 'boolean' && typeof user.nickname === 'string';
const cancelled = () => new DOMException('Aborted', 'AbortError');

// This adapter contains no demo fixtures. Unconnected business operations never report success.
export function createLiveApi({ baseUrl = '/api/v1', fetchImpl, storage = globalThis.sessionStorage, now = Date.now, timeoutMs } = {}) {
  let credential = null, user = null, store = {}, storeError = '', restorePromise, revision = 0;
  let status = 'anonymous', error = '', expiryTimer, storeVersion = 0, adminVersion = 0;
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
        ownStore = storeDetail(await request('/stores/me', { token, signal, authenticated }));
      } catch (failure) {
        if (signal?.aborted || failure.status === 401) throw failure;
        ownStoreError = '매장 정보를 불러오지 못했어요. 마이페이지에서 다시 조회해 주세요.';
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
  function requireSession(allowed = ['BUYER', 'SELLER']) {
    checkExpiry();
    if (status !== 'authenticated' || !credential) throw new ApiError('UNAUTHORIZED', '다시 로그인해 주세요.', { status: 401 });
    if (!allowed.includes(user?.role)) throw new ApiError('FORBIDDEN', '이 계정에서는 이 기능을 사용할 수 없어요.', { status: 403 });
  }
  async function reservationRequest(path, { signal, body, method = 'GET', decode }) {
    const version = revision;
    try {
      const result = await request(path, { signal, body, method, authenticated: true });
      if (signal?.aborted || revision !== version) throw cancelled();
      return decode(result);
    } catch (failure) {
      if (signal?.aborted || revision !== version) throw cancelled();
      if (method === 'POST' && (['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(failure.code) || failure.status >= 500)) {
        failure.outcomeUnknown = true;
        failure.message = '처리 결과를 확인하지 못했어요. 다시 보내기 전에 예약 내역에서 현재 상태를 확인해 주세요.';
      }
      throw failure;
    }
  }
  async function sellerFabricRequest(path, { signal, body, method = 'GET', decode, photo = false }) {
    requireSession(['SELLER']);
    const version = revision;
    try {
      const result = await request(path, { signal, body, method, authenticated: true });
      if (signal?.aborted || revision !== version) throw cancelled();
      return decode(result);
    } catch (failure) {
      if (signal?.aborted || revision !== version) throw cancelled();
      if (method !== 'GET' && (['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(failure.code) || failure.status >= 500)) {
        failure.outcomeUnknown = true;
        failure.message = photo
          ? '사진 처리 결과를 확인하지 못했어요. 다시 보내기 전에 원단 상세의 저장된 사진을 확인해 주세요.'
          : '원단 처리 결과를 확인하지 못했어요. 다시 보내기 전에 내 원단 목록과 상세에서 최신 상태를 확인해 주세요.';
      }
      throw failure;
    }
  }
  async function sellerStoreRequest(path, { signal, body, method = 'GET', decode }) {
    requireSession(['SELLER']);
    const version = revision;
    try {
      const result = await request(path, { signal, body, method, authenticated: true });
      if (signal?.aborted || revision !== version) throw cancelled();
      return decode(result);
    } catch (failure) {
      if (signal?.aborted || revision !== version) throw cancelled();
      if (method !== 'GET' && (['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(failure.code) || failure.status >= 500)) {
        failure.outcomeUnknown = true;
        failure.message = '매장 저장 결과를 확인하지 못했어요. 다시 보내기 전에 현재 매장 정보를 조회해 주세요.';
      }
      throw failure;
    }
  }
  async function adminRequest(path, { signal, body, method = 'GET', decode }) {
    requireSession(['ADMIN']);
    const version = revision;
    if (method !== 'GET') adminVersion++;
    const readVersion = adminVersion;
    try {
      const result = await request(path, { signal, body, method, authenticated: true });
      if (signal?.aborted || revision !== version || (method === 'GET' && readVersion !== adminVersion)) throw cancelled();
      return decode(result);
    } catch (failure) {
      if (signal?.aborted || revision !== version || (method === 'GET' && readVersion !== adminVersion)) throw cancelled();
      if (method !== 'GET' && (['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(failure.code) || failure.status >= 500)) {
        failure.outcomeUnknown = true;
        failure.message = '승인 처리 결과를 확인하지 못했어요. 다시 처리하기 전에 최신 상태를 조회해 주세요.';
      }
      throw failure;
    } finally {
      if (method !== 'GET' && revision === version) adminVersion++;
    }
  }
  const api = {
    mode: 'live',
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getAuth: () => ({ status, user: user ? structuredClone(user) : null, error, revision }),
    checkExpiry, restore,
    async listAdminSellers(input = {}, { signal } = {}) {
      const query = adminQuery('sellers', input);
      return adminRequest(`/admin/sellers?${query}`, { signal, decode: raw => adminPage('sellers', raw, query) });
    },
    async listAdminFabrics(input = {}, { signal } = {}) {
      const query = adminQuery('fabrics', input);
      return adminRequest(`/admin/fabrics?${query}`, { signal, decode: raw => adminPage('fabrics', raw, query) });
    },
    async getAdminSeller(id, options = {}) {
      requireSession(['ADMIN']);
      const version = revision, readVersion = adminVersion;
      const result = await findAdminSeller(api.listAdminSellers, id, options);
      if (options.signal?.aborted || revision !== version || readVersion !== adminVersion) throw cancelled();
      return result;
    },
    async getAdminFabric(id, { signal } = {}) {
      const identifier = fabricIdentifier(id);
      return adminRequest(`/fabrics/${identifier}`, { signal, decode: raw => {
        const result = ownFabricDetail(raw);
        if (result.id !== identifier) throw new ApiError('INVALID_RESPONSE', '선택한 원단 정보를 다시 조회해 주세요.');
        return result;
      } });
    },
    async getAdminDashboard({ signal } = {}) {
      requireSession(['ADMIN']);
      const version = revision, readVersion = adminVersion;
      const [fabrics, sellers] = await Promise.all([
        Promise.all(ADMIN_FABRIC_STATUSES.map(status => api.listAdminFabrics({ status, page: 0, size: status === 'PENDING' ? 3 : 1 }, { signal }))),
        Promise.all(ADMIN_SELLER_STATUSES.map(status => api.listAdminSellers({ status, page: 0, size: 1 }, { signal }))),
      ]);
      if (signal?.aborted || revision !== version || readVersion !== adminVersion) throw cancelled();
      return { fabricCounts: Object.fromEntries(ADMIN_FABRIC_STATUSES.map((status, i) => [status, fabrics[i].totalElements])),
        sellerCounts: Object.fromEntries(ADMIN_SELLER_STATUSES.map((status, i) => [status, sellers[i].totalElements])), pendingFabrics: fabrics[0].items };
    },
    async reviewSeller(id, next, { signal } = {}) {
      requireSession(['ADMIN']);
      const { identifier, action } = adminReview('sellers', id, next);
      return adminRequest(`/admin/sellers/${identifier}/${action}`, { signal, method: 'POST', decode: raw => adminReviewResult('sellers', raw, identifier, next) });
    },
    async reviewFabric(id, next, reason = '', { signal } = {}) {
      requireSession(['ADMIN']);
      const { identifier, action, body } = adminReview('fabrics', id, next, reason);
      return adminRequest(`/admin/fabrics/${identifier}/${action}`, { signal, method: 'POST', body, decode: raw => adminReviewResult('fabrics', raw, identifier, next) });
    },
    async refreshSellerProfile({ signal } = {}) {
      requireSession(['SELLER']);
      const version = storeVersion;
      const result = await sellerStoreRequest('/users/me', { signal, decode: raw => {
        if (!validUser(raw) || raw.role !== 'SELLER' || raw.userId !== user.userId || typeof raw.email !== 'string'
          || !['PENDING', 'APPROVED', 'REJECTED'].includes(raw.seller_approval_status)) throw new ApiError('INVALID_RESPONSE', '판매자 계정 정보를 확인하지 못했어요. 다시 조회해 주세요.');
        return raw;
      } });
      if (storeVersion !== version) throw cancelled();
      user = result;
      if (!user.hasStore) { store = {}; storeError = ''; }
      emit();
      return { ...structuredClone(user), id: user.userId };
    },
    async getMyStore({ signal } = {}) {
      const version = storeVersion;
      let result;
      try { result = await sellerStoreRequest('/stores/me', { signal, decode: storeDetail }); }
      catch (failure) {
        if (failure.status !== 404 || failure.code !== 'NOT_FOUND') throw failure;
        result = null;
      }
      if (storeVersion !== version) throw cancelled();
      store = result || {}; storeError = ''; user = { ...user, hasStore: Boolean(result) };
      emit();
      return result ? structuredClone(result) : null;
    },
    async createStore(input, { signal } = {}) {
      requireSession(['SELLER']);
      const body = storeInput(input); storeVersion++;
      const result = await sellerStoreRequest('/stores', { signal, method: 'POST', body, decode: storeCreated });
      storeVersion++;
      user = { ...user, hasStore: true };
      storeError = '';
      emit();
      return result;
    },
    async updateStore(input, { signal } = {}) {
      requireSession(['SELLER']);
      const body = storeInput(input, { partial: true }), expectedId = store.id; storeVersion++;
      const result = await sellerStoreRequest('/stores/me', { signal, method: 'PATCH', body, decode: raw => {
        const next = storeDetail(raw);
        if (expectedId && next.id !== expectedId) throw new ApiError('INVALID_RESPONSE', '변경된 매장 정보를 확인하지 못했어요. 다시 조회해 주세요.');
        return next;
      } });
      storeVersion++;
      store = result; storeError = ''; user = { ...user, hasStore: true };
      emit();
      return structuredClone(result);
    },
    async listMyFabrics(filters = {}, { signal } = {}) {
      requireSession(['SELLER']);
      return sellerFabricRequest(`/sellers/me/fabrics?${ownFabricQuery(filters)}`, { signal, decode: ownFabricPage });
    },
    async getSellerFabric(id, { signal } = {}) {
      requireSession(['SELLER']);
      const identifier = fabricIdentifier(id);
      return sellerFabricRequest(`/fabrics/${identifier}`, { signal, decode: raw => {
        const fabric = ownFabricDetail(raw);
        if (fabric.id !== identifier) throw new ApiError('INVALID_RESPONSE', '선택한 원단 정보를 확인하지 못했어요. 내 원단에서 다시 선택해 주세요.');
        return fabric;
      } });
    },
    async createFabric(input, { signal } = {}) {
      requireSession(['SELLER']);
      return sellerFabricRequest('/fabrics', { signal, method: 'POST', body: sellerFabricInput(input), decode: raw => fabricMutation(raw, { created: true }) });
    },
    async updateFabric(id, input, { signal } = {}) {
      requireSession(['SELLER']);
      const identifier = fabricIdentifier(id);
      return sellerFabricRequest(`/fabrics/${identifier}`, { signal, method: 'PATCH', body: sellerFabricInput(input, { partial: true }), decode: raw => fabricMutation(raw, { id: identifier }) });
    },
    async deleteFabric(id, { signal } = {}) {
      requireSession(['SELLER']);
      return sellerFabricRequest(`/fabrics/${fabricIdentifier(id)}`, { signal, method: 'DELETE', decode: fabricDeletion });
    },
    async uploadFabricImage(id, file, imageType, { signal } = {}) {
      requireSession(['SELLER']);
      return sellerFabricRequest(`/fabrics/${fabricIdentifier(id)}/images`, { signal, method: 'POST', body: imageUploadBody(file, imageType), photo: true, decode: raw => fabricImage(raw, imageType) });
    },
    async deleteFabricImage(id, imageId, { signal } = {}) {
      requireSession(['SELLER']);
      return sellerFabricRequest(`/fabrics/${fabricIdentifier(id)}/images/${fabricIdentifier(imageId)}`, { signal, method: 'DELETE', photo: true, decode: fabricDeletion });
    },
    async getSellerFabricCounts({ signal } = {}) {
      requireSession(['SELLER']);
      const version = revision;
      const counts = await Promise.all(SELLER_FABRIC_STATUSES.map(async status => [status, await reservationRequest(`/sellers/me/fabrics?status=${status}&page=0&size=1`, {
        signal, decode: raw => sellerStatusCount(raw, status, 'fabric'),
      })]));
      if (revision !== version || signal?.aborted) throw cancelled();
      return { ...Object.fromEntries(counts), total: counts.reduce((sum, [, count]) => sum + count, 0) };
    },
    async getSellerInquiryCounts({ signal } = {}) {
      requireSession(['SELLER']);
      const version = revision;
      const counts = await Promise.all(SELLER_INQUIRY_STATUSES.map(async status => [status, await reservationRequest(`/sellers/me/inquiries?status=${status}&page=0&size=1`, {
        signal, decode: raw => sellerStatusCount(raw, status, 'inquiry'),
      })]));
      if (revision !== version || signal?.aborted) throw cancelled();
      return { ...Object.fromEntries(counts), total: counts.reduce((sum, [, count]) => sum + count, 0) };
    },
    async getSellerPickupCalendar({ signal } = {}) {
      requireSession(['SELLER']);
      const version = revision;
      const result = await collectSellerPickups((filters, options) => {
        if (revision !== version || signal?.aborted) throw cancelled();
        return api.listReceivedReservations(filters, options);
      }, { signal, now });
      if (revision !== version || signal?.aborted) throw cancelled();
      return result;
    },
    async listReservations(filters = {}, { signal } = {}) {
      requireSession(['BUYER']);
      return reservationRequest(`/reservations/me?${reservationQuery(filters)}`, { signal, decode: reservationPage });
    },
    async listReceivedReservations(filters = {}, { signal } = {}) {
      requireSession(['SELLER']);
      return reservationRequest(`/sellers/me/reservations?${receivedReservationQuery(filters)}`, { signal, decode: receivedReservationPage });
    },
    async acceptReservation(id, input = {}, { signal } = {}) {
      requireSession(['SELLER']);
      const identifier = reservationIdentifier(id), body = acceptReservationInput(input, now());
      return reservationRequest(`/reservations/${identifier}/accept`, { signal, body, method: 'POST', decode: raw => reservationMutation(raw, 'ACCEPTED', { id: identifier }) });
    },
    async rejectReservation(id, reason, { signal } = {}) {
      requireSession(['SELLER']);
      const identifier = reservationIdentifier(id), body = rejectReservationInput(reason);
      return reservationRequest(`/reservations/${identifier}/reject`, { signal, body, method: 'POST', decode: raw => reservationMutation(raw, 'REJECTED', { id: identifier }) });
    },
    async confirmPickup(id, { signal } = {}) {
      requireSession(['SELLER']);
      const identifier = reservationIdentifier(id);
      return reservationRequest(`/reservations/${identifier}/pickup`, { signal, method: 'POST', decode: raw => reservationMutation(raw, 'PICKED_UP', { id: identifier }) });
    },
    async getReservation(id, { signal } = {}) {
      requireSession();
      const identifier = reservationIdentifier(id);
      return reservationRequest(`/reservations/${identifier}`, { signal, decode: raw => {
        const item = reservationDetail(raw);
        if (item.id !== identifier) throw new ApiError('INVALID_RESPONSE', '선택한 예약 정보를 확인하지 못했어요. 내역에서 다시 선택해 주세요.');
        return item;
      } });
    },
    async createReservation(input, { signal } = {}) {
      requireSession(['BUYER']);
      const body = reservationInput(input, now());
      return reservationRequest('/reservations', { signal, method: 'POST', body, decode: raw => reservationMutation(raw, 'REQUESTED', { length: body.requested_length_cm }) });
    },
    async cancelReservation(id, { signal } = {}) {
      requireSession();
      const identifier = reservationIdentifier(id);
      return reservationRequest(`/reservations/${identifier}/cancel`, { signal, method: 'POST', decode: raw => reservationMutation(raw, 'CANCELED', { id: identifier }) });
    },
    async listFabrics(filters = {}, { signal } = {}) {
      const version = revision;
      const result = await request(`/fabrics?${fabricQuery(filters)}`, { signal, authenticated: true });
      if (signal?.aborted || revision !== version) throw cancelled();
      return fabricPage(result);
    },
    async getFabric(id, { signal } = {}) {
      const identifier = fabricIdentifier(id), version = revision;
      const result = await request(`/fabrics/${identifier}`, { signal, authenticated: true });
      if (signal?.aborted || revision !== version) throw cancelled();
      const fabric = fabricDetail(result);
      if (fabric.id !== identifier) throw new ApiError('INVALID_RESPONSE', '선택한 원단 정보를 확인하지 못했어요. 목록에서 다시 선택해 주세요.');
      return fabric;
    },
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
  for (const name of ['updateProfile', 'updateSellerProfile', 'saveStore', 'createInquiry', 'answerInquiry', 'updateReservation', 'prepareAiDraft', 'saveDraft', 'uploadPhotos', 'retryPhotos']) {
    api[name] = async () => { throw new ApiError('NOT_CONNECTED', '이 기능은 아직 서버와 연결되지 않았어요. 전체 화면 미리보기에서 흐름을 확인할 수 있어요.'); };
  }
  return api;
}
