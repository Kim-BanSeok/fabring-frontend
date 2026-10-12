import { useEffect, useRef, useState } from 'react';

// A pending POST may still reach the server after abort. Cleanup prevents stale
// UI effects; it must never be interpreted as proof that a reservation was not made.
export function createReservationMutation({ isSessionCurrent = () => true, onBusy, onFailure }) {
  let active = true, pending = false, controller = null;
  const isCurrent = () => active && isSessionCurrent() && !controller?.signal.aborted;
  return {
    async run(action) {
      if (pending || !isCurrent()) return;
      pending = true;
      controller = new AbortController();
      onBusy(true); onFailure(null);
      try { await action({ signal: controller.signal, isCurrent }); }
      catch (failure) { if (isCurrent()) onFailure(failure); }
      finally { pending = false; if (isCurrent()) onBusy(false); }
    },
    dispose() { active = false; controller?.abort(); },
  };
}

export default function useReservationMutation(ctx) {
  const runner = useRef(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const api = ctx.api, live = ctx.mode === 'live', revision = ctx.auth?.revision;
  useEffect(() => {
    const operation = createReservationMutation({
      isSessionCurrent: () => !live || (api.getAuth().status === 'authenticated' && api.getAuth().revision === revision),
      onBusy: setBusy, onFailure: setFailure,
    });
    runner.current = operation;
    return () => { operation.dispose(); };
  }, [api, live, revision]);
  return {
    busy, failure, error: failure?.message || '',
    setError: message => setFailure(message ? new Error(message) : null),
    run: action => runner.current?.run(action),
  };
}
