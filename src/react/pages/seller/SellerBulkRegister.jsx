import { useRef, useState } from 'react';
import { Button, Notice, PageHeading } from '../../components/ui.jsx';
import { FABRIC_FILTER_OPTIONS } from '../../services/fabric-contract.js';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import { FabricLink } from './SellerLiveFabricParts.jsx';
import { validateLiveFabricDraft, validateLivePhoto } from './sellerLiveFabricModel.js';
import RollSaleUnit from './RollSaleUnit.jsx';

const THICKNESS_CODE = { '얇음': 'THIN', '중간 두께': 'NORMAL', '두꺼움': 'THICK' };

const blank = (sale_type = 'SCRAP') => ({
  key: `${Date.now()}-${Math.random()}`,
  sale_type,
  title: '',
  material: '면',
  thickness: '중간 두께',
  color: '네이비',
  width_cm: '',
  length_cm: '',
  sheet_count: sale_type === 'SCRAP' ? 1 : '',
  price: '',
  description: '',
  savedId: '',
  error: '',
});

const numberOrBlank = (value) => value === '' ? '' : Number(value);

function toDraft(row) {
  const roll = row.sale_type === 'ROLL';
  const length = numberOrBlank(row.length_cm);
  return {
    sale_type: row.sale_type,
    title: row.title.trim(),
    material: row.material,
    thickness: row.thickness,
    color: row.color,
    width_cm: numberOrBlank(row.width_cm),
    length_cm: roll ? null : length,
    remaining_length_cm: roll ? length : null,
    sheet_count: roll ? null : numberOrBlank(row.sheet_count),
    price: numberOrBlank(row.price),
    has_defect: false,
    defect_note: '',
    description: row.description || '',
    photos: [],
  };
}

async function photoPayload(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { media_type: 'image/jpeg', data: btoa(binary) };
}

export default function SellerBulkRegister({ ctx }) {
  const [rows, setRows] = useState(() => ctx.drafts.get('seller:live:bulk') || [blank(), blank()]);
  const [photos, setPhotos] = useState({});
  const [summary, setSummary] = useState('');
  const fileRef = useRef(null);
  const mutation = useReservationMutation(ctx);
  const remember = (next) => { ctx.drafts.set('seller:live:bulk', next); setRows(next); };
  const patch = (key, field, value) => remember(rows.map((row) => row.key === key ? { ...row, [field]: value, error: '', ...(field === 'sale_type' && value === 'ROLL' ? { sheet_count: '' } : {}) } : row));
  const downloadSheet = () => mutation.run(async () => {
    const blob = await ctx.api.downloadFabricSheet();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fabring-fabrics.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  });
  const importSheet = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    mutation.run(async ({ signal, isCurrent }) => {
      const imported = await ctx.api.parseFabricSheet(file, { signal });
      if (!isCurrent()) return;
      const kept = rows.filter((row) => row.savedId);
      const next = [...kept, ...imported.map((row) => ({ ...blank(row.sale_type), ...row, description: '', savedId: '', key: `${Date.now()}-${Math.random()}` }))];
      setPhotos({});
      remember(next);
      setSummary(`${imported.length}줄을 표에 넣었어요. 예시 행은 빠집니다. 사진은 줄마다 고르면 그 줄만 소개를 씁니다.`);
    });
  };
  const choosePhoto = (key, file) => {
    const message = validateLivePhoto(file);
    if (message) {
      remember(rows.map((row) => row.key === key ? { ...row, error: message } : row));
      return;
    }
    setPhotos((current) => ({ ...current, [key]: file }));
    patch(key, 'error', '');
  };
  const writeDescriptions = () => mutation.run(async ({ signal, isCurrent }) => {
    const targets = rows.filter((row) => !row.savedId && photos[row.key] && !row.description).slice(0, 10);
    if (!targets.length) throw new Error('사진을 고른 줄이 없거나 이미 소개가 있어요. 사진이 없는 줄은 소개를 쓰지 않아요.');
    let next = rows.map((row) => ({ ...row }));
    let wrote = 0;
    for (const row of targets) {
      const draft = toDraft(row);
      const code = THICKNESS_CODE[row.thickness];
      if (!code || validateLiveFabricDraft(draft, false)) {
        next = next.map((item) => item.key === row.key ? { ...item, error: '치수와 가격을 맞춘 뒤에 소개를 쓸 수 있어요.' } : item);
        if (isCurrent()) remember(next);
        continue;
      }
      try {
        const image = await photoPayload(photos[row.key]);
        if (!isCurrent()) return;
        const session = await ctx.api.composeAiListing({
          material_text: row.material,
          thickness: code,
          thickness_label: row.thickness,
          width_cm: Number(row.width_cm),
          length_cm: Number(row.length_cm),
          sale_type: row.sale_type,
          ...(row.sale_type === 'SCRAP' ? { sheet_count: Number(row.sheet_count) } : {}),
          images: [image],
        }, { signal });
        const description = session.ai_draft?.description || '';
        if (!description) throw new Error('소개를 받지 못했어요.');
        wrote += 1;
        next = next.map((item) => item.key === row.key ? { ...item, description, error: '' } : item);
      } catch (error) {
        next = next.map((item) => item.key === row.key ? { ...item, error: error.message || '이 줄의 소개를 쓰지 못했어요.' } : item);
      }
      if (isCurrent()) remember(next);
    }
    if (isCurrent()) setSummary(`${wrote}줄 소개를 채웠어요. 사진이 없는 줄은 바꾸지 않았어요.`);
  });
  const submit = (event) => {
    event.preventDefault();
    const pending = rows.filter((row) => !row.savedId);
    const checked = pending.map((row) => ({ row, draft: toDraft(row), message: validateLiveFabricDraft(toDraft(row), false) || row.error }));
    if (checked.some((item) => item.message)) {
      remember(rows.map((row) => ({ ...row, error: checked.find((item) => item.row.key === row.key)?.message || (row.savedId ? row.error : '') })));
      return;
    }
    mutation.run(async ({ signal, isCurrent }) => {
      let next = rows.map((row) => ({ ...row }));
      let saved = 0;
      for (const item of checked) {
        try {
          const result = await ctx.api.createFabric(item.draft, { signal });
          saved += 1;
          let photoError = '';
          if (photos[item.row.key]) {
            try { await ctx.api.uploadFabricImage(result.id, photos[item.row.key], 'FULL', { signal }); }
            catch (error) { photoError = error.message || '원단은 저장됐어요. 사진은 사진 올리기에서 다시 올려 주세요.'; }
          }
          next = next.map((row) => row.key === item.row.key ? { ...row, savedId: result.id, error: photoError } : row);
          if (isCurrent()) remember(next);
        } catch (error) {
          if (isCurrent()) remember(next.map((row) => row.key === item.row.key ? { ...row, error: error.message || '이 줄은 저장하지 못했어요.' } : row));
          throw error;
        }
      }
      if (isCurrent()) setSummary(`${saved}건을 승인 대기로 저장했어요. 사진이 없는 원단은 사진 올리기에서 이어서 올릴 수 있어요.`);
    });
  };
  return <section className="seller-page stack">
    <PageHeading title="여러 원단 등록" description="엑셀로 줄을 채우거나 표에 직접 입력합니다. 사진을 고른 줄만 AI가 소개를 씁니다." />
    {rows.some(row => row.sale_type === 'ROLL') && <RollSaleUnit />}
    <Notice>사진이 없는 줄은 소개를 만들지 않고, 승인 대기에서 멈춥니다. 관리자는 사진이 있어야 게시할 수 있어요.</Notice>
    {summary && <Notice>{summary}</Notice>}
    {mutation.error && <Notice tone="error">{mutation.error}</Notice>}
    <div className="actions">
      <Button type="button" onClick={downloadSheet} disabled={mutation.busy}>엑셀 양식 받기</Button>
      <Button type="button" onClick={() => fileRef.current?.click()} disabled={mutation.busy}>엑셀 올리기</Button>
      <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={importSheet} aria-label="원단 엑셀 파일" />
      <Button type="button" onClick={writeDescriptions} disabled={mutation.busy}>{mutation.busy ? '처리 중' : '사진 있는 줄 AI 소개'}</Button>
    </div>
    <form className="stack" onSubmit={submit}>
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>형태</th><th>이름</th><th>소재</th><th>두께</th><th>색</th><th>폭</th><th>길이</th><th>장수</th><th>가격</th><th>사진</th><th>결과</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.key}>
            <td><select aria-label="판매 형태" value={row.sale_type} disabled={Boolean(row.savedId)} onChange={event => patch(row.key, 'sale_type', event.target.value)}><option value="SCRAP">자투리</option><option value="ROLL">롤</option></select></td>
            <td><input aria-label="원단 이름" value={row.title} disabled={Boolean(row.savedId)} maxLength={100} onChange={event => patch(row.key, 'title', event.target.value)} /></td>
            <td><select aria-label="소재" value={row.material} disabled={Boolean(row.savedId)} onChange={event => patch(row.key, 'material', event.target.value)}>{FABRIC_FILTER_OPTIONS.material.map((option) => <option key={option.value}>{option.label}</option>)}</select></td>
            <td><select aria-label="두께" value={row.thickness} disabled={Boolean(row.savedId)} onChange={event => patch(row.key, 'thickness', event.target.value)}>{FABRIC_FILTER_OPTIONS.thickness.map((option) => <option key={option.value}>{option.label}</option>)}</select></td>
            <td><select aria-label="색상" value={row.color} disabled={Boolean(row.savedId)} onChange={event => patch(row.key, 'color', event.target.value)}>{FABRIC_FILTER_OPTIONS.color.map((option) => <option key={option.value}>{option.label}</option>)}</select></td>
            <td><input aria-label="폭" inputMode="numeric" value={row.width_cm} disabled={Boolean(row.savedId)} onChange={event => patch(row.key, 'width_cm', event.target.value)} /></td>
            <td><input aria-label={row.sale_type === 'ROLL' ? '남은 길이' : '길이'} inputMode="numeric" value={row.length_cm} disabled={Boolean(row.savedId)} onChange={event => patch(row.key, 'length_cm', event.target.value)} /></td>
            <td><input aria-label="판매 장수" inputMode="numeric" value={row.sheet_count} disabled={Boolean(row.savedId) || row.sale_type === 'ROLL'} onChange={event => patch(row.key, 'sheet_count', event.target.value)} /></td>
            <td><input aria-label="가격" inputMode="numeric" value={row.price} disabled={Boolean(row.savedId)} onChange={event => patch(row.key, 'price', event.target.value)} /></td>
            <td>{row.savedId ? '저장됨' : <input aria-label="대표 사진" type="file" accept="image/jpeg,image/png,image/webp" disabled={mutation.busy} onChange={event => { const file = event.target.files?.[0]; if (file) choosePhoto(row.key, file); }} />}</td>
            <td>{row.savedId ? <FabricLink path={`/seller/fabrics/photos?id=${row.savedId}`}>사진 올리기</FabricLink> : <>{row.description ? '소개 있음 · ' : ''}{photos[row.key] ? '사진 선택 · ' : ''}{row.error || '대기'}</>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="actions">
        <Button type="button" onClick={() => remember([...rows, blank(rows.at(-1)?.sale_type || 'SCRAP')])}>줄 추가</Button>
        <Button type="submit" tone="primary" disabled={mutation.busy}>{mutation.busy ? '저장 중' : '맞는 줄 승인 대기 저장'}</Button>
        <FabricLink path="/seller/register">등록 방식으로</FabricLink>
      </div>
    </form>
  </section>;
}
