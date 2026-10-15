import { useEffect, useRef } from 'react';
import { Button, Notice } from './ui.jsx';
import { POLICIES } from '../content/policies.js';

export default function PolicyViewer({ policyKey, onClose, closeLabel = '닫기' }) {
  const ref = useRef(null);
  const policy = POLICIES[policyKey];
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="policy-dialog" aria-labelledby="policy-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="policy-title">{policy.title}</h2><button className="policy-close" type="button" aria-label="내용 보기 닫기" onClick={onClose}>닫기</button></header>
    {policy.status === 'published' ? policy.sections.map(section => <section key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p>{section.links?.length > 0 && <ul>{section.links.map(({ label, href }) => <li key={href}><a href={href} target="_blank" rel="noopener noreferrer">{label} (새 창)</a></li>)}</ul>}</section>) : <Notice><strong>문안 준비 중</strong><p>아직 확정된 내용이 등록되지 않았어요. 문안이 준비되면 이 화면에서 확인할 수 있어요.</p></Notice>}
    <Button onClick={onClose} tone="primary">{closeLabel}</Button>
  </dialog>;
}
