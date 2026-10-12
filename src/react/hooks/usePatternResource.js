import { useCallback, useEffect, useState } from 'react';

export function startPatternRequest(api, request, onSuccess, onError) {
  const controller = new AbortController();
  let active = true;
  const options = { signal: controller.signal };
  Promise.resolve().then(() => {
    if (!active) return undefined;
    if (request.kind === 'list') return api.listPatterns(request.query, options);
    if (request.kind === 'detail') return api.getPattern(request.id, options);
    if (request.kind === 'recommendations') return api.getRecommendations(request.id, options);
    if (request.kind === 'pickup') return Promise.all([api.getRecommendations(request.id, options), api.getPattern(request.patternId, options)]).then(([recommendations, pattern]) => ({ recommendations, pattern }));
    return Promise.all([api.getFabric(request.id, options), api.getRecommendations(request.id, options)]).then(([fabric, recommendations]) => ({ fabric, recommendations }));
  }).then(data => { if (active) onSuccess(data); }, error => {
    if (!active || controller.signal.aborted) return;
    // A service-level invalidation still needs a recoverable visible state.
    onError(error?.name === 'AbortError' ? Object.assign(new Error('정보가 변경되었어요. 다시 불러와 주세요.'), { code: 'DATA_CHANGED' }) : error);
  });
  return () => { active = false; controller.abort(); };
}

export default function usePatternResource(api, request) {
  const key = request ? JSON.stringify(request) : '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!key) return undefined;
    const identity = { api, key, attempt };
    return startPatternRequest(api, JSON.parse(key),
      data => setResult({ ...identity, data, error: null }),
      error => setResult({ ...identity, data: null, error }));
  }, [api, key, attempt]);
  const current = result?.api === api && result?.key === key && result?.attempt === attempt;
  return { loading: Boolean(key) && !current, data: current ? result.data : null, error: current ? result.error : null, retry };
}
