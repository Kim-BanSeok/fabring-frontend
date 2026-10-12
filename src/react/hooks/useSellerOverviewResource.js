import { useCallback, useEffect, useState } from 'react';

const requests = {
  fabrics: (api, options) => api.getSellerFabricCounts(options),
  inquiries: (api, options) => api.getSellerInquiryCounts(options),
  requested: (api, options) => api.listReceivedReservations({ status: 'REQUESTED', page: 0, size: 1 }, options),
  calendar: (api, options) => api.getSellerPickupCalendar(options),
};

// A failed section must not erase another section's successful data or become zero.
export function startSellerOverviewRequest(api, kind, onSuccess, onError) {
  const controller = new AbortController();
  let active = true;
  Promise.resolve().then(() => active ? requests[kind](api, { signal: controller.signal }) : undefined)
    .then(data => { if (active) onSuccess(data); }, error => {
      if (!active || controller.signal.aborted) return;
      onError(error?.name === 'AbortError'
        ? Object.assign(new Error('처리 중인 정보가 변경되어 최신 현황을 다시 조회해야 해요.'), { code: 'STALE_OVERVIEW_READ' })
        : error);
    });
  return () => { active = false; controller.abort(); };
}

export default function useSellerOverviewResource(api, kind) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => startSellerOverviewRequest(api, kind,
    data => setResult({ api, kind, attempt, data, error: null }),
    error => setResult({ api, kind, attempt, data: null, error })), [api, kind, attempt]);
  const current = result?.api === api && result?.kind === kind && result?.attempt === attempt;
  return { loading: !current, data: current ? result.data : null, error: current ? result.error : null, retry };
}
