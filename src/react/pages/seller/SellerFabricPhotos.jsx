import { useEffect, useRef, useState } from 'react';
import { Button, FabricImage, Notice, SelectField } from '../../components/ui.jsx';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import { FabricLink, LocalPhoto } from './SellerLiveFabricParts.jsx';
import { LIVE_PHOTO_SLOTS, LIVE_UPLOAD_KEY, liveFabricFailure, validateLivePhoto } from './sellerLiveFabricModel.js';

export default function SellerFabricPhotos({ ctx, fabric: initial }) {
  const [fabric, setFabric] = useState(initial), [file, setFile] = useState(null), [type, setType] = useState('FULL');
  const key = `seller:live:photo-operation:${initial.id}`;
  const [uncertain, setUncertain] = useState(() => ctx.drafts.get(key) || null);
  const [serverChecked, setServerChecked] = useState(true), [needsRefresh, setNeedsRefresh] = useState(false);
  const [notice, setNotice] = useState(''), [job, setJob] = useState(() => ctx.drafts.get(LIVE_UPLOAD_KEY));
  const [deleting, setDeleting] = useState(null), dialog = useRef(null);
  const mutation = useReservationMutation(ctx), failure = liveFabricFailure(mutation.failure);
  const recovery = job?.fabric_id === fabric.id && job.stage !== 'DONE' ? job : null;
  const rememberUncertain = value => { if (value) ctx.drafts.set(key, value); else ctx.drafts.delete(key); setUncertain(value); };
  const readFresh = async ({ signal, isCurrent }) => {
    const result = await ctx.api.getSellerFabric(initial.id, { signal });
    if (isCurrent()) { setFabric(result); setServerChecked(true); setNeedsRefresh(false); }
    return result;
  };
  const refresh = () => mutation.run(async context => { await readFresh(context); if (context.isCurrent()) setNotice('현재 서버에 등록된 사진을 다시 확인했어요.'); });
  const upload = () => mutation.run(async context => {
    if (uncertain || needsRefresh) return;
    const message = validateLivePhoto(file); if (message) throw new Error(message);
    rememberUncertain({ kind: 'upload', name: file.name }); setServerChecked(false); setNotice('');
    try { await ctx.api.uploadFabricImage(fabric.id, file, type, { signal: context.signal }); }
    catch (error) { if (context.isCurrent() && !error.outcomeUnknown) rememberUncertain(null); throw error; }
    if (!context.isCurrent()) return;
    rememberUncertain(null); setNeedsRefresh(true); setFile(null); setNotice('사진 업로드는 완료됐어요. 등록된 사진을 다시 확인하고 있어요.');
    await readFresh(context); if (context.isCurrent()) setNotice('사진 업로드를 완료했어요.');
  });
  const remove = () => mutation.run(async context => {
    if (uncertain || needsRefresh) return;
    const image = deleting; setDeleting(null); rememberUncertain({ kind: 'delete', imageId: image.id }); setServerChecked(false); setNotice('');
    try { await ctx.api.deleteFabricImage(fabric.id, image.id, { signal: context.signal }); }
    catch (error) { if (context.isCurrent() && !error.outcomeUnknown) rememberUncertain(null); throw error; }
    if (!context.isCurrent()) return;
    rememberUncertain(null); setNeedsRefresh(true); setNotice('사진 삭제는 완료됐어요. 남은 사진을 다시 확인하고 있어요.');
    await readFresh(context); if (context.isCurrent()) setNotice('사진 삭제를 완료했어요.');
  });
  const resolveJobPhoto = (slot, status) => {
    const next = { ...job, photos: job.photos.map(photo => photo.slot === slot ? { ...photo, status, error: '' } : photo) };
    next.stage = next.photos.every(photo => ['DONE', 'SKIPPED'].includes(photo.status)) ? 'DONE' : 'PARTIAL';
    ctx.drafts.set(LIVE_UPLOAD_KEY, next); setJob(next);
  };
  useEffect(() => {
    const element = dialog.current; if (deleting && element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, [deleting]);
  const chooseFile = event => {
    const next = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!next) return;
    const error = validateLivePhoto(next); mutation.setError(error); if (!error) setFile(next);
  };
  return <section className="panel seller-panel">
    <div className="seller-section-heading"><h2>등록된 사진 {fabric.images.length}/3장</h2><Button onClick={refresh} disabled={mutation.busy}>서버 사진 다시 조회</Button></div>
    {notice && <Notice>{notice}</Notice>}{failure && <Notice tone="error">{failure.message}{notice && ' 처리를 다시 보내지 말고 사진 조회만 다시 시도해 주세요.'}</Notice>}
    {fabric.images.length ? <div className="seller-photo-gallery">{fabric.images.map((image, index) => <figure key={image.id}><FabricImage fabric={{ source: 'api', title: `${fabric.title} 사진 ${index + 1}`, image_url: image.image_url }} className="seller-photo-preview" /><figcaption><strong>{index === 0 ? '대표 사진' : `사진 ${index + 1}`} · {LIVE_PHOTO_SLOTS.find(([slot]) => slot === image.image_type)?.[1] || '유형 미지정'}</strong><Button tone="danger" onClick={() => setDeleting(image)} disabled={mutation.busy || Boolean(uncertain) || needsRefresh}>사진 삭제</Button></figcaption></figure>)}</div> : <Notice>현재 등록된 사진이 없어요. 사진을 추가하면 원단 상세에 표시됩니다.</Notice>}
    {uncertain && <Notice tone="warning"><div className="stack"><p>{uncertain.kind === 'upload' ? `“${uncertain.name}” 업로드` : '사진 삭제'} 결과를 확인해야 해요. 위 서버 사진을 다시 조회한 뒤 원하는 사진이 있는지 확인해 주세요. 업로드를 다시 하면 같은 사진이 추가될 수 있습니다.</p><Button onClick={() => { rememberUncertain(null); mutation.setError(''); setFile(null); }} disabled={mutation.busy || !serverChecked || needsRefresh}>서버 사진 확인을 마쳤어요</Button></div></Notice>}
    {recovery && <section className="stack"><h3>등록 중 남은 사진 복구</h3><p className="muted">서버 사진과 선택한 파일을 비교해 주세요. 결과가 불확실한 파일은 자동으로 다시 올리지 않습니다.</p><ul className="seller-upload-recovery">{recovery.photos.filter(photo => !['DONE', 'SKIPPED'].includes(photo.status)).map(photo => <li key={photo.slot}><LocalPhoto photo={photo} className="seller-recovery-preview" /><div className="stack"><strong>{photo.file.name}</strong><span className="muted">{photo.status === 'UNKNOWN' ? '업로드 결과 확인 필요' : photo.status === 'FAILED' ? '업로드 실패' : '아직 업로드하지 않음'}</span><div className="actions"><Button onClick={() => resolveJobPhoto(photo.slot, 'DONE')} disabled={mutation.busy || !serverChecked || needsRefresh}>서버 사진에서 확인했어요</Button><Button onClick={() => resolveJobPhoto(photo.slot, 'SKIPPED')} disabled={mutation.busy || !serverChecked || needsRefresh}>이 파일 추가 업로드 생략</Button></div></div></li>)}</ul><FabricLink path="/seller/upload">등록 진행 상태 · 남은 사진 업로드</FabricLink></section>}
    <p className="muted">사진은 최대 3장이에요. 첫 번째 사진이 대표 사진이며 삭제하면 남은 사진 순서가 당겨져요. 사진만 바꿔도 원단 승인 상태는 변경되지 않습니다.</p>
    {fabric.images.length < 3 && <div className="stack"><SelectField label="추가할 사진 유형" name="new_image_type" options={LIVE_PHOTO_SLOTS.map(([value, label]) => ({ value, label }))} value={type} onChange={event => setType(event.target.value)} disabled={mutation.busy || Boolean(uncertain) || needsRefresh} /><label className="button seller-file-label">사진 파일 선택<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={mutation.busy || Boolean(uncertain) || needsRefresh} aria-label="추가할 사진 파일 선택" /></label>{file && <div className="seller-upload-selection"><LocalPhoto photo={{ file }} className="seller-recovery-preview" /><span>{file.name}</span></div>}<Button onClick={upload} tone="primary" disabled={!file || mutation.busy || Boolean(uncertain) || needsRefresh}>선택한 사진 업로드</Button></div>}
    <dialog ref={dialog} className="seller-dialog" aria-labelledby="seller-photo-delete-title" onCancel={() => setDeleting(null)} onClose={() => setDeleting(null)}><form onSubmit={event => { event.preventDefault(); remove(); }} className="stack"><h2 id="seller-photo-delete-title">사진을 삭제할까요?</h2><p>삭제한 사진은 복원할 수 없어요. 필요하면 원본 파일을 다시 업로드해야 합니다.</p>{fabric.images.length === 1 && <Notice tone="warning">마지막 사진을 삭제하면 이 원단은 사진 없이 표시돼요.</Notice>}<div className="actions"><Button type="submit" tone="danger" disabled={mutation.busy}>사진 삭제</Button><Button onClick={() => setDeleting(null)}>취소</Button></div></form></dialog>
  </section>;
}
