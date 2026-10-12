export class ApiError extends Error {
  constructor(code, message, { status = 0, details = [], retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, { code, status, details, retryAfter });
  }
}

export function createHttpClient({ baseUrl = '/api/v1', fetchImpl = globalThis.fetch, timeoutMs = 15000, getToken = () => null, onUnauthorized = () => {} } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  return async function request(path, { method = 'GET', body, signal, authenticated = false, token } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const accessToken = token ?? (authenticated ? getToken() : null);
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method, signal: controller.signal, credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/json', ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
      });
      if (response.status === 401 && authenticated) onUnauthorized(accessToken);
      let payload;
      try { payload = await response.json(); }
      catch {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        throw new ApiError('INVALID_RESPONSE', '서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', { status: response.status });
      }
      if (!response.ok || payload?.success === false) {
        throw new ApiError(payload?.error?.code || 'HTTP_ERROR', payload?.error?.message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', {
          status: response.status, details: Array.isArray(payload?.error?.details) ? payload.error.details : [], retryAfter: response.headers.get('Retry-After'),
        });
      }
      if (payload?.success !== true || !Object.hasOwn(payload, 'data')) throw new ApiError('INVALID_RESPONSE', '서버 응답 형식이 올바르지 않아요. 잠시 후 다시 시도해 주세요.');
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return payload.data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (timedOut) throw new ApiError('TIMEOUT', '서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.');
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
