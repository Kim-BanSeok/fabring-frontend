import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Notice, SelectField } from '../../components/ui.jsx';
import { FABRIC_FILTER_OPTIONS } from '../../services/fabric-contract.js';
import { formatLength, formatPrice } from '../../lib/format.js';
import { LIVE_FABRIC_STATUS, LIVE_PHOTO_SLOTS, liveFabricPath, readLiveFabricForm, validateLivePhoto } from './sellerLiveFabricModel.js';

export const FabricLink = ({ path, children, ...props }) => <Button href={path} {...props}>{children}</Button>;
export const FabricStatus = ({ status }) => <Badge tone={status === 'REJECTED' ? 'red' : status === 'PENDING' ? 'amber' : status === 'SOLD_OUT' ? 'gray' : 'green'}>{LIVE_FABRIC_STATUS[status]}</Badge>;
export const FabricDetails = ({ rows }) => <dl className="seller-details">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '정보 없음'}</dd></div>)}</dl>;
export function LiveFabricInfo({ fabric }) {
  return <FabricDetails rows={[
    ['판매 형태', fabric.sale_type === 'ROLL' ? '롤 원단' : '자투리 · 1장'],
    ['폭 / 길이', `${fabric.width_cm}cm / ${fabric.sale_type === 'ROLL' ? fabric.remaining_length_cm : fabric.length_cm}cm`],
    ['소재 / 두께 / 색상', `${fabric.material} / ${fabric.thickness} / ${fabric.color}`],
    ['색상 상세 / 무늬', fabric.color_detail || '입력하지 않음'],
    ['가격', `${formatPrice(fabric.price)} / ${fabric.sale_type === 'ROLL' ? '90cm(1마)' : '1장'}`],
    ['하자', fabric.has_defect ? fabric.defect_note : '없음'], ['설명', fabric.description || '입력하지 않음'],
  ]} />;
}
export function LiveStockInfo({ fabric }) {
  return <FabricDetails rows={fabric.sale_type === 'ROLL' ? [
    ['물리적으로 남은 길이', formatLength(fabric.remaining_length_cm)], ['수락된 예약으로 확보', formatLength(fabric.reserved_length_cm)], ['판매 가능 길이', formatLength(fabric.available_length_cm)],
  ] : [['판매 형태', '자투리 1장'], ['예약 확보', fabric.is_reserved ? '수락된 예약이 있어요' : '수락된 예약 없음']]} />;
}

export function LocalPhoto({ photo, className = 'seller-photo' }) {
  const image = useRef(null), [failedFile, setFailedFile] = useState(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.file);
    if (image.current) image.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.file]);
  return failedFile === photo.file ? <div className={`seller-photo-empty ${className}`} role="img" aria-label={`${photo.file.name} 미리보기 실패`}>사진을 읽을 수 없어요</div> : <img ref={image} alt={photo.file.name} className={`fabric-art ${className}`} onError={() => setFailedFile(photo.file)} />;
}
export function LocalPhotoGallery({ photos }) {
  return <div className="seller-photo-gallery">{photos.map(photo => <figure key={photo.slot}><LocalPhoto photo={photo} className="seller-photo-preview" /><figcaption><strong>{LIVE_PHOTO_SLOTS.find(([slot]) => slot === photo.slot)?.[1]}</strong><span>{photo.file.name}</span><small className="muted">선택한 파일 · 업로드 전</small></figcaption></figure>)}</div>;
}
export function LiveFabricForm({ ctx, initial, onRemember, onSubmit, busy, edit = false, children, submitLabel }) {
  const formRef = useRef(null), photoSection = useRef(null);
  const [draft, setDraft] = useState(initial);
  const [photoError, setPhotoError] = useState('');
  const scrap = initial.sale_type === 'SCRAP';
  const remember = () => { const value = readLiveFabricForm(formRef.current, draft); onRemember(value); return value; };
  const updatePhotos = photos => { const value = { ...remember(), photos }; onRemember(value); setDraft(value); };
  const photoChange = (event, slot) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    const error = validateLivePhoto(file); setPhotoError(error); if (error) return;
    updatePhotos(LIVE_PHOTO_SLOTS.map(([key]) => key === slot ? { slot, file } : draft.photos?.find(photo => photo.slot === key)).filter(Boolean));
  };
  useEffect(() => {
    if (ctx.query.get('focus') === 'photos') { photoSection.current?.focus({ preventScroll: true }); photoSection.current?.scrollIntoView({ block: 'start' }); }
  }, [ctx.query]);
  const photosPath = `/seller/register/photos?type=${initial.sale_type}`;
  const reviewPhotos = event => {
    event.preventDefault(); remember(); ctx.drafts.set(`seller:live:photo-return:${initial.sale_type}`, window.scrollY); ctx.navigate(photosPath);
  };
  return <form ref={formRef} id="seller-fabric-form" className="stack" onInput={remember} onChange={event => { if (event.target.type !== 'file') remember(); }} onSubmit={event => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(remember()); }}>
    <fieldset className="seller-live-fieldset stack" disabled={busy}>
      <p className="muted seller-form-progress">기본 정보 → 치수·가격 → 하자{!edit && ' → 사진'} → {edit ? '저장' : '등록 내용 확인'}</p>
      <section className="panel seller-panel"><h2>기본 정보</h2>
        <Field label="원단 이름" name="title" defaultValue={initial.title} required maxLength={100} />
        {edit && <Field label="판매 형태" name="sale_type_label" defaultValue={scrap ? '자투리' : '롤'} readOnly hint="판매 형태는 변경할 수 없어요." />}
        <fieldset className="seller-material"><legend>소재</legend><div className="seller-material-options">{FABRIC_FILTER_OPTIONS.material.map(({ value, label }) => <label key={value} className="seller-material-option"><input type="radio" name="material" value={value} defaultChecked={initial.material === value} /><span>{label}</span></label>)}</div></fieldset>
        <div className="form-grid"><SelectField label="두께" name="thickness" options={[{ value: '', label: '두께 선택' }, ...FABRIC_FILTER_OPTIONS.thickness]} defaultValue={initial.thickness} required /><SelectField label="색상 계열" name="color" options={[{ value: '', label: '색상 선택' }, ...FABRIC_FILTER_OPTIONS.color]} defaultValue={initial.color} required /></div>
        <Field label="색상 상세 / 무늬" name="color_detail" defaultValue={initial.color_detail || ''} maxLength={100} />
        <label className="field"><span>판매자 설명</span><textarea name="description" defaultValue={initial.description || ''} rows={3} maxLength={5000} /></label>
      </section>
      <section className="panel seller-panel"><h2>치수 / 가격</h2><h3>사용 가능 치수</h3><div className="form-grid">
        <Field label="가로(폭) · cm" name="width_cm" defaultValue={initial.width_cm} type="number" min={1} max={1000} step={1} required inputMode="numeric" />
        <Field label={scrap ? '세로(길이) · cm' : '남은 길이 · cm'} name="length_cm" defaultValue={scrap ? initial.length_cm : initial.remaining_length_cm} type="number" min={scrap ? 30 : Math.max(90, initial.reserved_length_cm || 0)} max={scrap ? 90 : 2147483647} step={1} required inputMode="numeric" />
      </div><p className="muted seller-small">{scrap ? '하자를 피한 가장 큰 직사각형 기준 · 자투리 길이 30~90cm' : '롤 잔량은 90cm 이상인 정수예요. 90cm의 배수일 필요는 없어요.'}</p>
        <Field label={scrap ? '가격 · 원/장' : '90cm(1마)당 가격 · 원'} name="price" defaultValue={initial.price} type="number" min={1} max={2147483647} step={1} required inputMode="numeric" />
      </section>
      <section className="panel seller-panel"><h2>하자</h2><fieldset className="seller-defect"><legend>하자가 있나요?</legend><div className="actions"><label><input type="radio" name="has_defect" value="false" defaultChecked={!initial.has_defect} /> 없음</label><label><input type="radio" name="has_defect" value="true" defaultChecked={initial.has_defect} /> 있음</label></div></fieldset><Field label="하자 위치 / 내용 / 크기" name="defect_note" defaultValue={initial.defect_note || ''} maxLength={255} /></section>
      {!edit && <section ref={photoSection} className="panel seller-panel seller-photo-section" data-seller-photos tabIndex={-1}>
        <div className="seller-section-heading"><h2>사진</h2><span className="muted">{draft.photos.length}/3장 선택</span></div>{photoError && <Notice tone="error">{photoError}</Notice>}
        <div className="seller-photos">{LIVE_PHOTO_SLOTS.map(([slot, label]) => { const photo = draft.photos.find(value => value.slot === slot); return <div className="seller-photo-slot" key={slot}>
          {photo ? <LocalPhoto photo={photo} /> : <div className="seller-photo seller-photo-empty"><span aria-hidden="true">＋</span><span>미선택</span></div>}<strong>{label}</strong>
          <label className="button seller-file-label">{photo ? '사진 변경' : '사진 추가'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => photoChange(event, slot)} aria-label={`${label} 선택`} /></label>
          <small className="muted seller-photo-name">{photo?.file.name || '선택한 사진 없음'}</small>{photo && <Button onClick={() => updatePhotos(draft.photos.filter(value => value.slot !== slot))}>사진 제거</Button>}
        </div>; })}</div><p className="muted seller-small">jpg·png·webp 최대 3장, 장당 5MB 이하 · 원단 정보 저장 후 한 장씩 업로드해요.</p>
        {draft.photos.length > 0 && <FabricLink path={photosPath} data-seller-action="review-photos" onClick={reviewPhotos}>선택한 사진 확인</FabricLink>}
      </section>}
      {children}<div className="actions"><Button tone="primary" type="submit">{busy ? '저장 중' : submitLabel || '등록 내용 확인'}</Button><FabricLink path={edit ? liveFabricPath(ctx, initial.id) : '/seller/register'}>돌아가기</FabricLink></div>
    </fieldset>
  </form>;
}
