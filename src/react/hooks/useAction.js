import { useEffect, useRef, useState } from 'react';

// Guard against double clicks and avoid updating a view after its route unmounts.
export function useAction({ onError } = {}) {
  const active = useRef(true);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function run(task, onSuccess) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await task();
      if (active.current) await onSuccess?.(result);
    } catch (failure) {
      if (active.current) {
        setError(failure?.message || '처리 결과를 확인하지 못했어요. 현재 상태를 확인한 뒤 다시 시도해 주세요.');
        onError?.(failure);
      }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
