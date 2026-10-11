import { PHOTO_SLOTS } from './sellerModel.js';

export const inquiryDraftKey = id => `seller:inquiry:${id}`;
export const inquiryDraft = (drafts, inquiry) => drafts.get(inquiryDraftKey(inquiry.id)) ?? inquiry.answer ?? '';

// A failed request must leave the exact local text available for retry.
export async function submitInquiryDraft(api, drafts, id, content) {
  const result = await api.answerInquiry(id, content);
  drafts.delete(inquiryDraftKey(id));
  return result;
}

export function selectedPhotos(draft = {}) {
  const slots = draft.photo_slots;
  return PHOTO_SLOTS.map(([slot, label, texture], index) => ({
    slot, label, texture,
    name: slots && Object.keys(slots).length ? slots[slot] : draft.photo_names?.[index],
  })).filter(photo => photo.name);
}

export function uploadPhotoSummary(upload, fabric) {
  const completed = [...(fabric?.photos || [])];
  return (upload?.photo_names || []).map(name => {
    const index = completed.indexOf(name);
    if (index >= 0) { completed.splice(index, 1); return { name, status: 'DONE' }; }
    return { name, status: upload.stage === 'PARTIAL' ? 'FAILED' : 'WAITING' };
  });
}

// Both calendars start on Monday. Ignore an invalid or out-of-month selection.
export function sellerCalendar(month, date) {
  const [year, number] = month.split('-').map(Number);
  const days = new Date(year, number, 0).getDate();
  const selected = typeof date === 'string' && date.startsWith(`${month}-`) && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number(date.slice(-2)) >= 1 && Number(date.slice(-2)) <= days ? date : '';
  return { year, number, days, offset: (new Date(year, number - 1, 1).getDay() + 6) % 7, selected };
}

export function stockAfterReservation(fabric, reservation, next) {
  if (fabric.sale_type !== 'ROLL') return null;
  const remaining = Number(fabric.remaining_length_cm) || 0;
  const reserved = Number(fabric.reserved_length_cm) || 0;
  const quantity = Number(reservation.requested_length_cm) || 0;
  const before = { remaining, reserved, available: remaining - reserved };
  const after = {
    remaining: next === 'PICKED_UP' ? remaining - quantity : remaining,
    reserved: next === 'ACCEPTED' ? reserved + quantity : ['PICKED_UP', 'CANCELED'].includes(next) ? reserved - quantity : reserved,
  };
  after.available = after.remaining - after.reserved;
  return { before, after };
}
