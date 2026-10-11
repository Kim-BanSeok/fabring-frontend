const storeKey = 'auth:state';

// A service-local transient model: form passwords never enter persistent API state.
class AuthState {
  #owner;
  #forms = new Map();
  #failures = new Map();
  #consentPreviews = new Map();
  #pending = null;

  constructor(owner) { this.#owner = owner; }

  #draft(state, role, kind) {
    const key = `${role}:${kind}`;
    if (!this.#forms.has(key)) {
      const profile = state[role] || { email: 'admin@example.com' };
      this.#forms.set(key, {
        email: profile.email || '', nickname: profile.nickname || '',
        password: '', confirm: '', terms: false, privacy: false,
      });
    }
    return this.#forms.get(key);
  }

  initialForm(state, role, kind, preview) {
    const data = this.#draft(state, role, kind);
    if (kind === 'signup') {
      const key = `${role}:${preview}`;
      if (/^[01]{2}$/.test(preview || '') && this.#consentPreviews.get(role) !== key) {
        data.terms = preview[0] === '1'; data.privacy = preview[1] === '1';
        this.#consentPreviews.set(role, key);
      } else if (!preview) this.#consentPreviews.delete(role);
    }
    return { ...data };
  }

  updateForm(state, role, kind, name, value) {
    const next = { ...this.#draft(state, role, kind), [name]: value };
    this.#forms.set(`${role}:${kind}`, next);
    return { ...next };
  }

  recordFailure(role, kind, record) { this.#failures.set(`${role}:${kind}`, record); }
  failure(role, kind) { return this.#failures.get(`${role}:${kind}`); }
  pending(role) { return this.#pending?.role === role ? this.#pending : null; }

  startRequest({ api, role, kind, scenario, first, input }) {
    if (this.#pending) { this.#pending.cancelled = true; this.#pending.controller.abort(); }
    const operation = {
      role, kind, scenario, first, status: 'RUNNING', consumed: false,
      cancelled: false, consumers: 0, promise: null,
      controller: new AbortController(),
    };
    // Only the submit event calls this method. React effects never start requests.
    operation.promise = (api.mode === 'live' ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, 550))).then(() => {
      if (operation.cancelled || this.#pending !== operation || this.#owner.get(storeKey) !== this) {
        throw new Error('요청이 취소되었어요.');
      }
      if (api.mode !== 'live' && (scenario === 'error' || scenario === 'network')) {
        throw new Error(scenario === 'network' ? '연결 상태를 확인한 뒤 다시 시도해 주세요.'
          : kind === 'signup' ? '이미 사용 중인 이메일입니다. 다른 이메일로 다시 시도해 주세요.'
            : '입력한 정보를 확인한 뒤 다시 로그인해 주세요.');
      }
      if (api.mode === 'live') return kind === 'signup' ? api.signup(input, { signal: operation.controller.signal }) : api.login(input, { signal: operation.controller.signal });
      return kind === 'signup' ? api.signupDemo(input) : api.loginDemo(input);
    }).finally(() => { input.password = ''; operation.status = 'SETTLED'; });
    // Leaving processing is safe even if the local request later rejects.
    operation.promise.catch(() => {});
    this.#pending = operation;
    return operation;
  }

  subscribe(operation, onSuccess, onFailure) {
    let active = true;
    operation.consumers += 1;
    const consume = () => {
      if (!active || operation.consumed || operation.cancelled || this.#pending !== operation || this.#owner.get(storeKey) !== this) return false;
      operation.consumed = true;
      this.#pending = null;
      return true;
    };
    operation.promise.then(
      result => { if (consume()) onSuccess(result); },
      error => { if (consume()) onFailure(error); },
    );
    return () => {
      active = false;
      operation.consumers -= 1;
      // StrictMode reattaches before this microtask; a real departure cancels the request.
      queueMicrotask(() => {
        if (operation.consumers === 0 && !operation.consumed && this.#pending === operation) {
          operation.cancelled = true;
          operation.controller.abort();
          this.#pending = null;
        }
      });
    };
  }

  finishSuccess(state, role, operation, result) {
    const form = this.#draft(state, role, operation.kind);
    form.password = ''; form.confirm = '';
    this.#failures.delete(`${role}:${operation.kind}`);
    if (operation.kind === 'signup') {
      const login = this.#draft(state, role, 'login');
      login.email = result.email || form.email;
      login.password = '';
    }
  }
}

export function getAuthState(drafts) {
  if (!drafts.has(storeKey)) drafts.set(storeKey, new AuthState(drafts));
  return drafts.get(storeKey);
}
