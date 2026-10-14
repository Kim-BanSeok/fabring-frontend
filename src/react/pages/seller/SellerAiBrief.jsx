import { useState } from 'react';
import RegistrationSteps from '../../components/RegistrationSteps.jsx';
import { Button, Field, Notice, PageHeading } from '../../components/ui.jsx';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import { LocalPhoto, LocalPhotoGallery } from './SellerLiveFabricParts.jsx';
import { validateLivePhoto } from './sellerLiveFabricModel.js';
import { AI_ACTIVE_KEY, aiDraftKey, aiFabricDraft, aiFailureMessage, aiPath } from './sellerAiModel.js';
import RollSaleUnit from './RollSaleUnit.jsx';

const BRIEF_KEY = 'seller:live:ai:brief';
const STEPS = ['photos', 'required', 'optional', 'preview', 'generate'];
const THICKNESS = [['THIN', '얇음'], ['NORMAL', '보통'], ['THICK', '두꺼움'], ['UNKNOWN', '모름']];
const FEEL = ['매끈함', '보송함', '약간 거침', '탄탄함', '유연함'];
const STRETCH = ['거의 없음', '약간 늘어남', '잘 늘어남', '모름'];
const emptyBrief = () => ({ photos: [], material_text: '', thickness: '', width_cm: '', length_cm: '', sheet_count: '', feel: [], stretch: '', memo: '' });

function briefPath(step, type) {
  return `/seller/register/ai?${new URLSearchParams({ step, type })}`;
}

function StepBack({ label, onClick, disabled = false }) {
  if (!label) return null;
  return <button type="button" className="seller-step-back" onClick={onClick} disabled={disabled}>← {label}</button>;
}

async function photoPayload(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { media_type: 'image/jpeg', data: btoa(binary) };
}

export default function SellerAiBrief({ ctx }) {
  const mutation = useReservationMutation(ctx);
  const [brief, setBrief] = useState(() => ({ ...emptyBrief(), ...(ctx.drafts.get(BRIEF_KEY) || {}) }));
  const [photoError, setPhotoError] = useState('');
  const requested = ctx.query.get('step');
  const step = STEPS.includes(requested) ? requested : 'photos';
  const saleType = ctx.query.get('type') === 'SCRAP' ? 'SCRAP' : 'ROLL';
  const roll = saleType === 'ROLL';
  const stage = STEPS.indexOf(step) + 1;
  const remember = (patch) => {
    const next = { ...brief, ...patch };
    ctx.drafts.set(BRIEF_KEY, next);
    setBrief(next);
    return next;
  };
  const go = (name) => ctx.navigate(briefPath(name, saleType));
  const setPhoto = (slot, file) => {
    const error = validateLivePhoto(file);
    setPhotoError(error);
    if (error) return;
    remember({ photos: [...brief.photos.filter(photo => photo.slot !== slot), { slot, file }] });
  };
  const lengthOk = roll ? Number(brief.length_cm) >= 90 : Number(brief.length_cm) >= 1;
  const requiredReady = brief.material_text.trim() && brief.thickness && Number(brief.width_cm) >= 1 && lengthOk && (roll || Number(brief.sheet_count) >= 1);
  const write = () => mutation.run(async ({ signal, isCurrent }) => {
    const images = [];
    for (const photo of brief.photos.slice(0, 2)) images.push(await photoPayload(photo.file));
    if (!isCurrent()) return;
    const thicknessLabel = THICKNESS.find(([value]) => value === brief.thickness)?.[1] || brief.thickness;
    const session = await ctx.api.composeAiListing({
      material_text: brief.material_text.trim(),
      thickness: brief.thickness,
      thickness_label: thicknessLabel,
      width_cm: Number(brief.width_cm),
      length_cm: Number(brief.length_cm),
      sale_type: saleType,
      ...(roll ? {} : { sheet_count: Number(brief.sheet_count) }),
      ...(brief.feel.length ? { feel: brief.feel.join(', ') } : {}),
      ...(brief.stretch ? { stretch: brief.stretch } : {}),
      ...(brief.memo.trim() ? { memo: brief.memo.trim() } : {}),
      images,
    }, { signal });
    if (!isCurrent()) return;
    const draft = aiFabricDraft(session, { photos: brief.photos, color_detail: brief.material_text.trim(), ...(roll ? {} : { sheet_count: Number(brief.sheet_count) }) });
    ctx.drafts.set(AI_ACTIVE_KEY, session.sessionId);
    ctx.drafts.set(aiDraftKey(session.sessionId), { session, draft, answer: '' });
    ctx.drafts.delete(BRIEF_KEY);
    ctx.navigate(aiPath(session.sessionId, 'edit'));
  });

  return <section className="seller-page stack">
    <PageHeading title={`원단 등록 · ${roll ? '롤' : '자투리'}`} description="사진과 짧은 입력을 보내면 AI가 고객용 소개를 써요. 소재와 치수는 입력한 값 그대로 남아요." />
    <p className="seller-register-kind">{roll ? '롤 원단' : '자투리 원단'}으로 등록하고 있어요. {roll ? '남은 길이는 90cm 이상입니다.' : '잘라 둔 조각의 길이와 장수를 입력합니다.'}</p>
    <RegistrationSteps mode="AI_BRIEF" stage={stage} />
    {mutation.failure && <Notice tone="error">{aiFailureMessage(mutation.failure)}</Notice>}
    <StepBack
      label={step === 'required' ? '사진으로 이동' : step === 'optional' ? '필수 입력으로 이동' : step === 'preview' ? '선택 입력으로 이동' : step === 'generate' ? '내용 확인으로 이동' : ''}
      onClick={() => go(step === 'required' ? 'photos' : step === 'optional' ? 'required' : step === 'preview' ? 'optional' : 'preview')}
      disabled={mutation.busy}
    />
    {step === 'photos' && <section className="panel seller-panel stack">
      <h2>원단 사진</h2>
      <p className="muted">전체 사진 1장은 필수예요. 확대 사진은 표면을 같이 볼 때 넣어요. jpg·png·webp, 장당 5MB 이하.</p>
      {photoError && <Notice tone="error">{photoError}</Notice>}
      <div className="seller-photos">{[['FULL', '전체'], ['ZOOM', '확대']].map(([slot, label]) => {
        const photo = brief.photos.find(item => item.slot === slot);
        return <div className="seller-photo-slot" key={slot}>
          {photo ? <LocalPhoto photo={photo} /> : <div className="seller-photo seller-photo-empty"><span aria-hidden="true">＋</span><span>미선택</span></div>}
          <strong>{label}</strong>
          <label className="button seller-file-label">{photo ? '사진 변경' : '사진 추가'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`${label} 사진`} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) setPhoto(slot, file); }} /></label>
          {photo && <Button onClick={() => remember({ photos: brief.photos.filter(item => item.slot !== slot) })}>사진 제거</Button>}
        </div>;
      })}</div>
      <div className="actions"><Button tone="primary" disabled={!brief.photos.some(photo => photo.slot === 'FULL')} onClick={() => go('required')}>필수 입력으로 이동</Button></div>
    </section>}
    {step === 'required' && <form className="panel seller-panel stack" onSubmit={event => { event.preventDefault(); if (requiredReady) go('optional'); }}>
      <h2>필수 입력 · {roll ? '롤' : '자투리'}</h2>
      {roll && <RollSaleUnit />}
      <Field label="소재·원단 종류" name="material_text" value={brief.material_text} maxLength={100} required onChange={event => remember({ material_text: event.target.value })} placeholder="예: 면 혼방 데님" />
      <fieldset className="seller-material"><legend>두께</legend><div className="actions">{THICKNESS.map(([value, label]) => <Button key={value} type="button" tone={brief.thickness === value ? 'primary' : 'secondary'} aria-pressed={brief.thickness === value} onClick={() => remember({ thickness: value })}>{label}</Button>)}</div></fieldset>
      <div className="form-grid">
        <Field label="폭 · cm" name="width_cm" type="number" min={1} max={1000} step={1} required inputMode="numeric" value={brief.width_cm} onChange={event => remember({ width_cm: event.target.value })} />
        <Field label={roll ? '전체 남은 길이 · cm' : '길이 · cm'} name="length_cm" type="number" min={roll ? 90 : 1} max={2147483647} step={1} required inputMode="numeric" value={brief.length_cm} onChange={event => remember({ length_cm: event.target.value })} />
        {!roll && <Field label="판매 장수" name="sheet_count" type="number" min={1} max={9999} step={1} required inputMode="numeric" value={brief.sheet_count} onChange={event => remember({ sheet_count: event.target.value })} />}
      </div>
      {roll && brief.length_cm !== '' && Number(brief.length_cm) < 90 && <Notice tone="warning">롤은 남은 길이를 90cm 이상으로 입력해 주세요. 60cm처럼 더 짧은 조각은 자투리로 등록해요.</Notice>}
      <div className="actions"><Button type="submit" tone="primary" disabled={!requiredReady}>선택 입력으로 이동</Button></div>
    </form>}
    {step === 'optional' && <form className="panel seller-panel stack" onSubmit={event => { event.preventDefault(); go('preview'); }}>
      <h2>선택 입력</h2>
      <fieldset className="seller-material"><legend>촉감</legend><div className="actions">{FEEL.map(label => <Button key={label} type="button" tone={brief.feel.includes(label) ? 'primary' : 'secondary'} aria-pressed={brief.feel.includes(label)} onClick={() => remember({ feel: brief.feel.includes(label) ? brief.feel.filter(item => item !== label) : [...brief.feel, label] })}>{label}</Button>)}</div></fieldset>
      <fieldset className="seller-material"><legend>신축성</legend><div className="actions">{STRETCH.map(label => <Button key={label} type="button" tone={brief.stretch === label ? 'primary' : 'secondary'} aria-pressed={brief.stretch === label} onClick={() => remember({ stretch: brief.stretch === label ? '' : label })}>{label}</Button>)}</div></fieldset>
      <label className="field"><span>추가 메모</span><textarea rows={4} maxLength={1000} value={brief.memo} onChange={event => remember({ memo: event.target.value })} placeholder="고객에게 바로 보이지 않아요. 확인할 내용만 적어도 돼요." /></label>
      <div className="actions"><Button type="submit" tone="primary">내용 확인으로 이동</Button></div>
    </form>}
    {step === 'preview' && <section className="panel seller-panel stack">
      <h2>사진과 입력 내용</h2>
      <LocalPhotoGallery photos={brief.photos.filter(photo => ['FULL', 'ZOOM'].includes(photo.slot))} />
      <dl className="seller-details">
        {[['판매 형태', roll ? '롤 원단' : '자투리 원단'], ['소재·원단 종류', brief.material_text], ['두께', THICKNESS.find(([value]) => value === brief.thickness)?.[1]], ['폭', `${brief.width_cm}cm`], [roll ? '남은 길이' : '길이', `${brief.length_cm}cm`], ...(roll ? [] : [['판매 장수', `${brief.sheet_count}장`]]), ['촉감', brief.feel.join(', ') || '미입력'], ['신축성', brief.stretch || '미입력'], ['추가 메모', brief.memo || '미입력']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="actions"><Button tone="primary" onClick={() => go('generate')}>AI 작성으로 이동</Button></div>
    </section>}
    {step === 'generate' && <section className="panel seller-panel stack">
      <h2>상세설명 작성</h2>
      <p>사진 {brief.photos.length}장과 입력한 소재, 두께, 치수{roll ? '' : ', 장수'}로 고객용 소개를 씁니다. 폭 {brief.width_cm}cm, {roll ? '남은 길이' : '길이'} {brief.length_cm}cm{roll ? '' : `, ${brief.sheet_count}장`}은 바꾸지 않아요.</p>
      <div className="actions"><Button tone="primary" onClick={write} disabled={mutation.busy || !brief.photos.length || !requiredReady}>{mutation.busy ? '상세설명을 쓰는 중' : 'AI에게 작성 맡기기'}</Button></div>
    </section>}
    <p className="muted">이 단계의 사진과 입력은 이 탭에만 남아요. 새로고침하면 다시 선택해야 해요.</p>
  </section>;
}
