export const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const formatPrice = value => `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
export const formatLength = cm => `${new Intl.NumberFormat('ko-KR').format(Number(cm) || 0)}cm${cm && cm % 90 === 0 ? ` (${cm / 90}마)` : ''}`;
export const badge = (label, tone = 'green') => `<span class="badge badge--${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
export const notice = (message, tone = 'info') => `<div class="notice notice--${escapeHtml(tone)}"${tone === 'error' ? ' role="alert"' : ''}>${escapeHtml(message)}</div>`;
export const pageHeading = (title, description = '') => `<header class="page-heading"><h1 tabindex="-1">${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</header>`;
export function button(label, { href, type = 'button', tone = 'secondary', disabled = false, attrs = '' } = {}) {
  const classes = `button button--${escapeHtml(tone)}`;
  return href && !disabled ? `<a class="${classes}" href="${escapeHtml(href.startsWith('#') ? href : `#${href}`)}" ${attrs}>${escapeHtml(label)}</a>` : `<button class="${classes}" type="${escapeHtml(type)}" ${disabled ? 'disabled' : ''} ${attrs}>${escapeHtml(label)}</button>`;
}
export const emptyState = (title, description = '', actionHtml = '') => `<section class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${actionHtml ? `<div class="actions">${actionHtml}</div>` : ''}</section>`;
export function fabricImage(fabric, extraClass = '') {
  const texture = ['linen', 'gingham', 'canvas', 'denim'].includes(fabric.texture) ? fabric.texture : 'canvas';
  const label = `${fabric.title} 질감 예시`;
  if (fabric.image_url && /^(https?:|blob:|\/)/.test(fabric.image_url)) return `<img class="fabric-art ${escapeHtml(extraClass)}" src="${escapeHtml(fabric.image_url)}" alt="${escapeHtml(fabric.title)}" />`;
  return `<div class="fabric-art fabric-art--${texture} ${escapeHtml(extraClass)}" role="img" aria-label="${escapeHtml(label)}"><span aria-hidden="true"></span></div>`;
}
export function field(label, name, { value = '', type = 'text', required = false, readonly = false, hint = '', attrs = '' } = {}) {
  const id = `field-${name}`;
  return `<div class="field"><label for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span aria-hidden="true">*</span>' : ''}</label><input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${readonly ? 'readonly' : ''} ${hint ? `aria-describedby="${escapeHtml(id)}-hint"` : ''} ${attrs}>${hint ? `<p id="${escapeHtml(id)}-hint" class="field-hint">${escapeHtml(hint)}</p>` : ''}</div>`;
}
export function selectField(label, name, options, value = '', attrs = '') {
  return `<div class="field"><label for="field-${escapeHtml(name)}">${escapeHtml(label)}</label><select id="field-${escapeHtml(name)}" name="${escapeHtml(name)}" ${attrs}>${options.map(o => `<option value="${escapeHtml(o.value)}" ${String(value) === String(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
}
