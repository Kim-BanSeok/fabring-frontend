import { useCallback, useEffect, useState } from 'react';

// Disposing a view aborts HTTP and also guards adapters that cannot cancel a late response.
export function startFabricRequest(api, request, onSuccess, onError) {
  const controller = new AbortController();
  let active = true;
  Promise.resolve().then(() => {
    if (!active) return undefined;
    return request.kind === 'list'
      ? api.listFabrics(request.query, { signal: controller.signal })
      : api.getFabric(request.id, { signal: controller.signal });
  }).then(data => {
    if (active) onSuccess(data);
  }, error => {
    if (active && !controller.signal.aborted && error?.name !== 'AbortError') onError(error);
  });
  return () => { active = false; controller.abort(); };
}

export default function useFabricResource(api, request) {
  const key = request ? JSON.stringify(request) : '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!key) return undefined;
    const identity = { api, key, attempt };
    return startFabricRequest(api, JSON.parse(key),
      data => setResult({ ...identity, data, error: null }),
      error => setResult({ ...identity, data: null, error }));
  }, [api, key, attempt]);
  const current = result?.api === api && result?.key === key && result?.attempt === attempt;
  return { loading: Boolean(key) && !current, data: current ? result.data : null, error: current ? result.error : null, retry };
}
