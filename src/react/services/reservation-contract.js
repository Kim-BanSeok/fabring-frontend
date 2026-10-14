import { ApiError } from './http-client.js';

export const RESERVATION_STATUSES = ['REQUESTED', 'ACCEPTED', 'PICKED_UP', 'CANCELED', 'REJECTED'];
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const nullableText = value => value === null || text(value);
const invalid = () => { throw new ApiError('INVALID_RESPONSE', '예약 정보를 확인하지 못했어요. 예약 내역에서 다시 확인해 주세요.'); };
const validation = message => { throw new ApiError('VALIDATION_ERROR', message, { status: 400 }); };
const isoDate = value => text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const nullableDate = value => value === null || isoDate(value);
const imageUrl = value => {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

export function reservationIdentifier(value) {
  if (!/^\d+$/.test(String(value)) || !integer(Number(value), 1)) validation('예약 번호가 올바르지 않아요. 내역에서 다시 선택해 주세요.');
  return String(Number(value));
}

export function pickupAtKst(date, time, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) validation('픽업 날짜와 시간을 확인해 주세요.');
  const value = `${date}T${time}:00+09:00`, instant = Date.parse(value);
  // Round-trip rejects impossible calendar dates; the browser's timezone is irrelevant.
  if (!Number.isFinite(instant) || new Date(instant + 9 * 3600000).toISOString().slice(0, 16) !== `${date}T${time}`) validation('픽업 날짜와 시간을 확인해 주세요.');
  if (instant <= now) validation('픽업 희망 날짜와 시간은 현재보다 이후로 선택해 주세요.');
  return value;
}

export function reservationInput(input, now = Date.now()) {
  if (!record(input)) validation('예약 내용을 확인해 주세요.');
  const fabricId = Number(input.fabric_id);
  if (!/^\d+$/.test(String(input.fabric_id)) || !integer(fabricId, 1)) validation('원단 번호를 확인해 주세요.');
  const length = input.requested_length_cm ?? null;
  if (length !== null && (!integer(length, 1) || length > 2147483647 || length % 90 !== 0)) validation('구매할 길이는 1마(90cm) 단위로 선택해 주세요.');
  const sheets = input.requested_sheet_count ?? null;
  if (sheets !== null && (!integer(sheets, 1) || sheets > 9999)) validation('구매할 장수는 1장 이상 9,999장 이하로 선택해 주세요.');
  if (length !== null && sheets !== null) validation('길이와 장수를 함께 보낼 수 없어요.');
  if (input.memo != null && !text(input.memo)) validation('요청 사항을 확인해 주세요.');
  const memo = input.memo?.trim() || null;
  if (memo?.length > 500) validation('요청 사항은 500자 이내로 입력해 주세요.');
  const patternId = input.pattern_id == null ? null : Number(input.pattern_id);
  if (patternId !== null && (!/^\d+$/.test(String(input.pattern_id)) || !integer(patternId, 1))) validation('도안 번호를 확인해 주세요. 도안 추천에서 다시 선택해 주세요.');
  return { fabric_id: fabricId, pickup_at: pickupAtKst(input.pickup_date, input.pickup_time, now), memo, requested_length_cm: length, pattern_id: patternId, ...(sheets !== null ? { requested_sheet_count: sheets } : {}) };
}

export function reservationQuery(input = {}) {
  const read = name => input instanceof URLSearchParams ? input.get(name) : input[name];
  const query = new URLSearchParams();
  const status = read('status');
  if (status) {
    if (!RESERVATION_STATUSES.includes(status)) validation('예약 상태를 다시 선택해 주세요.');
    query.set('status', status);
  }
  for (const [name, fallback, min, max] of [['page', 0, 0, Number.MAX_SAFE_INTEGER], ['size', 20, 1, 50]]) {
    const raw = read(name), value = raw == null || raw === '' ? fallback : Number(raw);
    if (!integer(value, min) || value > max) validation('예약 내역의 페이지 범위를 확인해 주세요.');
    query.set(name, String(value));
  }
  return query;
}

export function receivedReservationQuery(input = {}) {
  const query = reservationQuery(input);
  const fabricId = input instanceof URLSearchParams ? input.get('fabric_id') : input.fabric_id;
  if (fabricId != null && fabricId !== '') query.set('fabric_id', reservationIdentifier(fabricId));
  return query;
}

export function acceptReservationInput(input = {}, now = Date.now()) {
  if (!record(input)) validation('수락할 예약 내용을 확인해 주세요.');
  // Keeping the requested time requires no body, even when that original time has passed.
  if (input.pickup_date === undefined && input.pickup_time === undefined) return undefined;
  return { pickup_at: pickupAtKst(input.pickup_date, input.pickup_time, now) };
}

export function rejectReservationInput(reason) {
  if (!text(reason) || !reason.trim() || reason.trim().length > 255) validation('거절 사유를 1~255자로 입력해 주세요.');
  return { reason: reason.trim() };
}

function baseReservation(raw) {
  if (!record(raw) || !integer(raw.reservationId, 1) || !RESERVATION_STATUSES.includes(raw.status) || !isoDate(raw.pickup_at)
    || !nullableText(raw.reject_reason)) invalid();
  // API 26 omits sale_type. The contract uses null length for SCRAP and 90cm multiples for ROLL.
  const roll = raw.requested_length_cm !== null;
  const sheets = Object.hasOwn(raw, 'requested_sheet_count') ? raw.requested_sheet_count : null;
  if (roll) {
    if (sheets != null || !integer(raw.requested_length_cm, 1) || raw.requested_length_cm % 90 !== 0 || !integer(raw.estimated_price)) invalid();
  } else if (sheets == null) {
    if (raw.estimated_price !== null) invalid();
  } else if (!integer(sheets, 1) || sheets > 9999 || !integer(raw.estimated_price)) invalid();
  const kst = new Date(Date.parse(raw.pickup_at) + 9 * 3600000).toISOString();
  return {
    source: 'api', id: String(raw.reservationId), status: raw.status, sale_type: roll ? 'ROLL' : 'SCRAP',
    requested_length_cm: raw.requested_length_cm, requested_sheet_count: sheets, estimated_price: raw.estimated_price, display_price: raw.estimated_price,
    pickup_at: raw.pickup_at, pickup_date: kst.slice(0, 10), pickup_time: kst.slice(11, 16),
    reject_reason: raw.reject_reason, rejection_reason: raw.reject_reason,
  };
}

export function reservationSummary(raw) {
  const item = baseReservation(raw);
  if (!integer(raw.fabricId, 1) || !text(raw.title) || !text(raw.store_name) || !nullableText(raw.thumbnail_url)
    || (item.status === 'ACCEPTED' && (!text(raw.store_address) || !nullableText(raw.pickup_guide)))) invalid();
  return { ...item, fabric_id: String(raw.fabricId), fabric_title: raw.title, image_url: imageUrl(raw.thumbnail_url), store_name: raw.store_name, memo: null,
    store: item.status === 'ACCEPTED' ? { store_name: raw.store_name, address: raw.store_address, pickup_guide: raw.pickup_guide } : null };
}

function pageWith(raw, toItem) {
  if (!record(raw) || !Array.isArray(raw.content) || !integer(raw.page) || !integer(raw.size, 1) || raw.size > 50
    || !integer(raw.totalElements) || !integer(raw.totalPages) || raw.totalPages !== Math.ceil(raw.totalElements / raw.size)
    || raw.content.length > raw.size || raw.content.length > raw.totalElements) invalid();
  return { content: raw.content.map(toItem), page: raw.page, size: raw.size, totalElements: raw.totalElements, totalPages: raw.totalPages };
}

export function reservationPage(raw) { return pageWith(raw, reservationSummary); }

export function receivedReservationSummary(raw) {
  if (!record(raw) || !integer(raw.fabricId, 1) || !text(raw.title) || !text(raw.buyer_nickname) || !nullableText(raw.memo)) invalid();
  // API 27 has neither rejection reason nor photo/store fields. Read the detail for those.
  const item = baseReservation({ ...raw, reject_reason: null });
  return { ...item, fabric_id: String(raw.fabricId), fabric_title: raw.title, buyer_nickname: raw.buyer_nickname, memo: raw.memo,
    image_url: null, store_name: null, store: null };
}

export function receivedReservationPage(raw) { return pageWith(raw, receivedReservationSummary); }

export function reservationDetail(raw) {
  const item = baseReservation(raw), fabric = raw.fabric, store = raw.store;
  if (!record(fabric) || !integer(fabric.fabricId, 1) || !text(fabric.title) || fabric.sale_type !== item.sale_type
    || !['PENDING', 'POSTED', 'REJECTED', 'SOLD_OUT'].includes(fabric.status) || !nullableText(fabric.thumbnail_url)
    || !record(store) || !text(store.store_name) || !text(store.store_address)
    || !nullableText(store.store_phone) || !nullableText(store.closed_days) || !nullableText(store.pickup_guide)
    || !nullableText(raw.memo) || !text(raw.buyer_nickname) || !nullableText(raw.pattern_name)
    || ![null, 'BUYER', 'SELLER'].includes(raw.canceled_by) || !isoDate(raw.created_at)
    || !nullableDate(raw.accepted_at) || !nullableDate(raw.picked_up_at) || !nullableDate(raw.canceled_at)) invalid();
  const publicStore = { store_name: store.store_name, address: store.store_address, phone_number: store.store_phone, closed_days: store.closed_days, pickup_guide: store.pickup_guide };
  return { ...item, fabric_id: String(fabric.fabricId), fabric_title: fabric.title, fabric_status: fabric.status, image_url: imageUrl(fabric.thumbnail_url), store_name: store.store_name,
    fabric: { source: 'api', id: String(fabric.fabricId), title: fabric.title, sale_type: fabric.sale_type, status: fabric.status, image_url: imageUrl(fabric.thumbnail_url), store_name: store.store_name, store: publicStore },
    store: publicStore, memo: raw.memo, buyer_nickname: raw.buyer_nickname, pattern_name: raw.pattern_name,
    canceled_by: raw.canceled_by, accepted_at: raw.accepted_at, picked_up_at: raw.picked_up_at, canceled_at: raw.canceled_at, created_at: raw.created_at };
}

export function reservationMutation(raw, status, { id, length, sheets = null } = {}) {
  if (!record(raw) || !integer(raw.reservationId, 1) || raw.status !== status || (id && String(raw.reservationId) !== id)) invalid();
  if (status === 'REQUESTED' && (sheets != null ? !integer(raw.estimated_price) : length == null ? raw.estimated_price !== null : !integer(raw.estimated_price))) invalid();
  return { id: String(raw.reservationId), status: raw.status, ...(status === 'REQUESTED' ? { estimated_price: raw.estimated_price } : {}) };
}
