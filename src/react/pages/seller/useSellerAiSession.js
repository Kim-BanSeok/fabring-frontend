import { useCallback, useEffect, useState } from 'react';
import { aiDraftKey, reconcileAiRead } from './sellerAiModel.js';

export default function useSellerAiSession(ctx, id) {
  const { api, drafts } = ctx, revision = ctx.auth?.revision;
  const [record, setRecord] = useState(() => drafts.get(aiDraftKey(id)) || {});
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const save = useCallback(value => {
    drafts.set(aiDraftKey(id), value); setRecord(value);
  }, [drafts, id]);
  const accept = useCallback(session => {
    const next = reconcileAiRead(drafts.get(aiDraftKey(id)) || {}, session);
    save(next); setError(null); return next;
  }, [drafts, id, save]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController(); let active = true;
    const current = () => active && !controller.signal.aborted && api.getAuth().status === 'authenticated' && api.getAuth().revision === revision;
    api.getAiSession(id, { signal: controller.signal }).then(value => {
      if (current()) accept(value);
    }, failure => {
      if (current()) setError(failure.name === 'AbortError' ? new Error('대화 상태가 바뀌었어요. 다시 조회해 주세요.') : failure);
    }).finally(() => { if (current()) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [api, id, revision, version, accept]);
  return { record, save, accept, loading, error, retry: () => { setLoading(true); setError(null); setVersion(value => value + 1); } };
}
