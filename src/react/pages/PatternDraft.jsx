import { useState } from 'react';
import { Button, Field, Notice } from '../components/ui.jsx';
import useReservationMutation from '../hooks/useReservationMutation.js';

import { patternPages, patternPageSvg, patternSvg } from './pattern-draft-svg.js';

export default function PatternDraftPanel({ ctx, fabric }) {
  const [itemName, setItemName] = useState('슬리퍼');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(null);
  const mutation = useReservationMutation(ctx);
  const submit = (event) => {
    event.preventDefault();
    mutation.run(async ({ signal, isCurrent }) => {
      const next = await ctx.api.createPatternDraft({ fabric_id: fabric.id, item_name: itemName.trim(), note: note.trim() }, { signal });
      if (isCurrent()) setDraft(next);
    });
  };
  const download = () => {
    const blob = new Blob([patternSvg(draft, { watermark: true })], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fabring-pattern.svg';
    link.click();
    URL.revokeObjectURL(url);
  };
  return <section className="buyer-page" aria-labelledby="buyer-pattern-draft-title">
    <div className="buyer-home-section-heading"><h2 id="buyer-pattern-draft-title">도안 초안</h2></div>
    <p className="buyer-muted">AI가 조각 치수를 정하면 재단선, 시접, 식서, 부품표, 5cm 칸이 있는 도안 시트로 그립니다. 추천 판정에 넣지 않고 저장하지 않아요.</p>
    <form className="panel buyer-page" onSubmit={submit}>
      <Field label="만들고 싶은 것" name="item_name" required maxLength={40} value={itemName} onChange={event => setItemName(event.target.value)} />
      <Field label="추가 요청" name="note" maxLength={200} value={note} onChange={event => setNote(event.target.value)} />
      <Button type="submit" tone="primary" disabled={mutation.busy}>{mutation.busy ? '초안 만드는 중' : '초안 SVG 받아보기'}</Button>
      {mutation.error && <Notice tone="error">{mutation.error}</Notice>}
    </form>
    {draft && <article className="panel">
      <h3>{draft.title}</h3>
      <Notice>{draft.notice}</Notice>
      <p className="buyer-muted">조각 {draft.parts.length}개 · 시트 {patternPages(draft.parts).length}장</p>
      {patternPages(draft.parts).map((page, index, pages) => <figure key={`${page[0]?.part_name || 'sheet'}-${index}`} className="buyer-pattern-sheet">
        <figcaption>{index + 1} / {pages.length} · {page.map((part) => part.part_name).join(' · ')}</figcaption>
        <div className="buyer-pattern-svg" dangerouslySetInnerHTML={{ __html: patternPageSvg(draft, index) }} />
      </figure>)}
      {draft.steps?.length ? <ol>{draft.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
      <Button onClick={download}>실제 크기로 다운로드</Button>
    </article>}
  </section>;
}
