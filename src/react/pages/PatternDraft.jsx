import { useState } from 'react';
import { Button, Field, Notice } from '../components/ui.jsx';
import useReservationMutation from '../hooks/useReservationMutation.js';

const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const n = (value) => Math.round(value * 10) / 10;
const MARKS = ['①', '②', '③', '④', '⑤', '⑥'];

function outlinePath(kind, w, h) {
  if (kind === 'sole') {
    return `M ${n(w * 0.04)} ${n(h * 0.5)} C ${n(w * 0.04)} ${n(h * 0.16)} ${n(w * 0.24)} ${n(h * 0.04)} ${n(w * 0.5)} ${n(h * 0.1)} C ${n(w * 0.76)} ${n(h * 0.04)} ${n(w * 0.98)} ${n(h * 0.18)} ${n(w * 0.98)} ${n(h * 0.42)} C ${n(w * 0.98)} ${n(h * 0.66)} ${n(w * 0.74)} ${n(h * 0.98)} ${n(w * 0.48)} ${n(h * 0.92)} C ${n(w * 0.2)} ${n(h * 0.98)} ${n(w * 0.02)} ${n(h * 0.78)} ${n(w * 0.04)} ${n(h * 0.5)} Z`;
  }
  if (kind === 'upper') {
    return `M ${n(w * 0.02)} ${n(h * 0.22)} C ${n(w * 0.16)} ${n(h * 0.02)} ${n(w * 0.38)} ${n(h * 0.08)} ${n(w * 0.46)} ${n(h * 0.28)} L ${n(w * 0.98)} ${n(h * 0.16)} L ${n(w * 0.98)} ${n(h * 0.84)} L ${n(w * 0.46)} ${n(h * 0.74)} C ${n(w * 0.34)} ${n(h * 0.96)} ${n(w * 0.12)} ${n(h)} ${n(w * 0.02)} ${n(h * 0.78)} Z`;
  }
  const r = Math.min(w, h) * 0.08;
  return `M ${n(r)} 0 H ${n(w - r)} Q ${n(w)} 0 ${n(w)} ${n(r)} V ${n(h - r)} Q ${n(w)} ${n(h)} ${n(w - r)} ${n(h)} H ${n(r)} Q 0 ${n(h)} 0 ${n(h - r)} V ${n(r)} Q 0 0 ${n(r)} 0 Z`;
}

function patternPiece(part, x, y, w, h, index) {
  const seam = Math.min(w, h) > 28 ? 10 * Math.min(w / (part.width_cm * 10), h / (part.height_cm * 10)) : 0;
  const sx = w > seam * 2 ? (w - seam * 2) / w : 1;
  const sy = h > seam * 2 ? (h - seam * 2) / h : 1;
  const path = outlinePath(part.outline || 'rect', w, h);
  const fold = part.outline === 'upper'
    ? `<line x1="${n(x + w * 0.7)}" y1="${n(y + h * 0.22)}" x2="${n(x + w * 0.7)}" y2="${n(y + h * 0.78)}" stroke="#111" stroke-width="0.45" stroke-dasharray="3 1.2 0.4 1.2"/>`
    : '';
  return `<g>
    <path d="${path}" transform="translate(${n(x)} ${n(y)})" fill="none" stroke="#111" stroke-width="0.7"/>
    <g transform="translate(${n(x + w / 2)} ${n(y + h / 2)}) scale(${n(sx)} ${n(sy)}) translate(${n(-w / 2)} ${n(-h / 2)})"><path d="${path}" fill="none" stroke="#111" stroke-width="0.45" stroke-dasharray="2.2 1.3"/></g>
    ${fold}
    <line x1="${n(x + w * 0.5)}" y1="${n(y + h * 0.34)}" x2="${n(x + w * 0.5)}" y2="${n(y + h * 0.72)}" stroke="#111" stroke-width="0.45"/>
    <path d="M ${n(x + w * 0.5 - 1.4)} ${n(y + h * 0.4)} L ${n(x + w * 0.5)} ${n(y + h * 0.34)} L ${n(x + w * 0.5 + 1.4)} ${n(y + h * 0.4)}" fill="none" stroke="#111" stroke-width="0.45"/>
    <text x="${n(x + w * 0.5)}" y="${n(y + h * 0.28)}" text-anchor="middle" font-size="3.4" font-family="Malgun Gothic, sans-serif">${MARKS[index] || ''} ${escapeXml(part.part_name)}</text>
    <text x="${n(x + w * 0.5)}" y="${n(y + h * 0.8)}" text-anchor="middle" font-size="2.5" font-family="Malgun Gothic, sans-serif">${part.quantity}장 · ${part.width_cm}×${part.height_cm}cm</text>
    <text x="${n(x + w * 0.5)}" y="${n(y + h * 0.88)}" text-anchor="middle" font-size="2.2" font-family="Malgun Gothic, sans-serif" fill="#444">식서</text>
  </g>`;
}

function legendBlock(x, y) {
  const rows = [
    ['실선', '재단선', ''],
    ['점선', '시접 1cm', '2.2 1.3'],
    ['일점쇄선', '접는 선', '3 1.2 0.4 1.2'],
  ];
  const lines = rows.map(([name, meaning, dash], index) => {
    const top = y + 8 + index * 7;
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<line x1="${x}" y1="${top}" x2="${x + 16}" y2="${top}" stroke="#111" stroke-width="0.5"${dashAttr}/><text x="${x + 18}" y="${top + 1}" font-size="2.4" font-family="Malgun Gothic, sans-serif">${name} · ${meaning}</text>`;
  }).join('');
  return `<text x="${x}" y="${y}" font-size="3" font-family="Malgun Gothic, sans-serif">선 · 기호</text>${lines}`;
}

function tableBlock(parts, x, y, width) {
  const rowH = 6.2;
  const head = y + 6;
  const columns = [0, width * 0.34, width * 0.52, width * 0.7, width * 0.82];
  const labels = ['부품', '가로', '세로', '장수', '비고'];
  const header = labels.map((label, index) => `<text x="${n(x + columns[index] + 1)}" y="${head - 1.2}" font-size="2.3" font-family="Malgun Gothic, sans-serif">${label}</text>`).join('');
  const body = parts.map((part, index) => {
    const top = head + (index + 1) * rowH;
    const cells = [part.part_name, part.width_cm, part.height_cm, part.quantity, part.note || '실선 재단'];
    return `<line x1="${x}" y1="${n(top - rowH + 1.4)}" x2="${x + width}" y2="${n(top - rowH + 1.4)}" stroke="#111" stroke-width="0.25"/>${cells.map((cell, cellIndex) => `<text x="${n(x + columns[cellIndex] + 1)}" y="${n(top)}" font-size="2.3" font-family="Malgun Gothic, sans-serif">${escapeXml(cell)}</text>`).join('')}`;
  }).join('');
  const bottom = head + parts.length * rowH + 1.4;
  return `<text x="${x}" y="${y}" font-size="3" font-family="Malgun Gothic, sans-serif">부품 목록 (cm · 시접 포함)</text><line x1="${x}" y1="${n(head - 4)}" x2="${x + width}" y2="${n(head - 4)}" stroke="#111" stroke-width="0.35"/>${header}${body}<line x1="${x}" y1="${n(bottom)}" x2="${x + width}" y2="${n(bottom)}" stroke="#111" stroke-width="0.35"/>`;
}

function placedPiece(part, x, y, maxW, maxH, index) {
  const scale = Math.min(maxW / (part.width_cm * 10), maxH / (part.height_cm * 10), 1);
  const w = part.width_cm * 10 * scale;
  const h = part.height_cm * 10 * scale;
  return patternPiece(part, x + (maxW - w) / 2, y + (maxH - h) / 2, w, h, index);
}

export function patternPages(parts) {
  const pages = [];
  for (let index = 0; index < parts.length; index += 2) pages.push(parts.slice(index, index + 2));
  return pages.length ? pages : [[]];
}

function sheetPage(draft, parts, pageIndex, pageCount, watermark) {
  const gap = 8;
  const drawW = 281;
  const drawH = 112;
  const cellW = parts.length > 1 ? (drawW - gap) / parts.length : drawW;
  const pieces = parts.map((part, index) => placedPiece(
    part,
    8 + index * (cellW + gap),
    16,
    cellW,
    drawH,
    pageIndex * 2 + index,
  )).join('');
  const squareX = 239;
  const squareY = 136;
  const mark = watermark ? '<text x="250" y="10" text-anchor="end" font-size="4.5" fill="#1b7a34" fill-opacity="0.45" font-family="Malgun Gothic, sans-serif">패브링</text>' : '';
  return `<g>
    <rect x="0.4" y="0.4" width="296.2" height="209.2" fill="#fff" stroke="#111" stroke-width="0.4"/>
    <text x="8" y="8" font-size="4.2" font-family="Malgun Gothic, sans-serif">${escapeXml(draft.title)} · ${pageIndex + 1}/${pageCount}</text>
    <text x="289" y="8" text-anchor="end" font-size="2.3" font-family="Malgun Gothic, sans-serif">A4 가로 · 시접 1cm · 인쇄 배율 100%</text>
    ${pieces}
    ${legendBlock(188, 138)}
    ${tableBlock(parts, 8, 136, 172)}
    <rect x="${squareX}" y="${squareY}" width="50" height="50" fill="#fff" stroke="#111" stroke-width="0.45"/>
    <text x="${squareX + 25}" y="${squareY + 22}" text-anchor="middle" font-size="3.2" font-family="Malgun Gothic, sans-serif">5 × 5 cm</text>
    <text x="${squareX + 25}" y="${squareY + 28}" text-anchor="middle" font-size="2.1" font-family="Malgun Gothic, sans-serif">인쇄 배율 확인</text>
    ${mark}
  </g>`;
}

export function patternPageSvg(draft, pageIndex) {
  const pages = patternPages(draft.parts || []);
  const page = pages[pageIndex] || [];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 297 210" role="img" aria-label="${escapeXml(`${draft.title} ${pageIndex + 1}/${pages.length}`)}">${sheetPage(draft, page, pageIndex, pages.length, false)}</svg>`;
}

export function patternSvg(draft, { watermark = false } = {}) {
  const pages = patternPages(draft.parts || []);
  const height = pages.length * 210;
  const body = pages.map((page, index) => `<g transform="translate(0 ${index * 210})">${sheetPage(draft, page, index, pages.length, watermark)}</g>`).join('');
  const size = watermark ? ` width="297mm" height="${height}mm"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 297 ${height}" role="img" aria-label="${escapeXml(draft.title)}">${body}</svg>`;
}

export default function PatternDraftPanel({ ctx, fabric }) {
  const [open, setOpen] = useState(false);
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
    <div className="buyer-home-section-heading"><h2 id="buyer-pattern-draft-title">이 원단 치수로 그리는 도안 초안</h2></div>
    <p className="buyer-muted">만들고 싶은 이름을 적으면 재단선, 시접, 식서, 부품표, 5cm 칸이 있는 시트를 그립니다. 위쪽 등록 도안 비교와 다르고, 추천 판정에 넣거나 저장하지 않아요.</p>
    {!open && !draft ? <div className="actions"><Button onClick={() => setOpen(true)}>도안 초안 입력 열기</Button></div> : null}
    {(open || draft) && <>
    <form className="panel buyer-page" onSubmit={submit}>
      <Field label="만들고 싶은 것" name="item_name" required maxLength={40} value={itemName} onChange={event => setItemName(event.target.value)} />
      <Field label="추가 요청" name="note" maxLength={200} value={note} onChange={event => setNote(event.target.value)} />
      <Button type="submit" tone="primary" disabled={mutation.busy}>{mutation.busy ? '도안 초안을 그리는 중' : '이 치수로 도안 시트 만들기'}</Button>
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
      <Button onClick={download}>A4 실제 크기 SVG 다운로드</Button>
    </article>}
    </>}
  </section>;
}
