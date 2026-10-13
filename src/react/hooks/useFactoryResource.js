import { useCallback, useEffect, useState } from 'react';
import { loadSupplyFactories } from '../services/factory-contract.js';

export default function useFactoryResource(api) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(), identity = { api, attempt };
    loadSupplyFactories(api, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setResult({ ...identity, data, error: null }); },
      (error) => { if (!controller.signal.aborted) setResult({ ...identity, data: null, error }); },
    );
    return () => controller.abort();
  }, [api, attempt]);
  const current = result?.api === api && result?.attempt === attempt;
  return { loading: !current, data: current ? result.data : null, error: current ? result.error : null, retry };
}
