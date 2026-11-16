/**
 * components.js — komponen tampilan lintas peran.
 * Semua teks pengguna dirender via textContent (anti-XSS).
 */

import { el, mount } from './ui.js';
import { sanitizeImageUrl } from './ingredients.js';
import {
  formatIDR,
  formatDateTime,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_ICON,
  ROLE_LABEL,
  ROLE_ICON,
  defaultProductImage,
  PRODUCT_EMOJI_BY_KATEGORI,
  TRANSITION_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_ICON,
} from './domain.js';

/* ------------------------------------------------------------------ */
/* Potongan halaman                                                    */
/* ------------------------------------------------------------------ */

export function pageHead(title, subtitle, actions = []) {
  return el('div', { className: 'page-head' }, [
    el('div', { className: 'page-head__text' }, [
      el('h1', { className: 'page-title', textContent: title }),
      subtitle ? el('p', { className: 'page-sub', textContent: subtitle }) : null,
    ]),
    actions.length ? el('div', { className: 'page-head__actions' }, actions) : null,
  ]);
}

export function panel(title, note, children) {
  return el('section', { className: 'panel' }, [
    el('div', { className: 'panel__head' }, [el('h2', { className: 'panel__title', textContent: title })]),
    note ? el('p', { className: 'panel__note', textContent: note }) : null,
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

export function statGrid(cards) {
  return el(
    'div',
    { className: 'stats-grid' },
    cards.map((c) =>
      el('article', { className: `stat-card ${c.tone ? `stat-card--${c.tone}` : ''}` }, [
        el('span', { className: 'stat-card__icon', textContent: c.icon ?? '📊', attrs: { 'aria-hidden': 'true' } }),
        el('div', { className: 'stat-card__body' }, [
          el('span', { className: 'stat-card__label', textContent: c.label }),
          c.hint ? el('span', { className: 'stat-card__hint', textContent: c.hint }) : null,
        ]),
        el('span', { className: 'stat-card__value', textContent: String(c.value) }),
      ]),
    ),
  );
}

export function emptyState(icon, title, text, action = null) {
  return el('div', { className: 'empty-state' }, [
    el('p', { className: 'empty-state__icon', textContent: icon }),
    el('p', { className: 'empty-state__title', textContent: title }),
    text ? el('p', { className: 'empty-state__text', textContent: text }) : null,
    action ? el('div', { className: 'empty-state__action' }, [action]) : null,
  ]);
}

export function statusChip(status) {
  return el('span', {
    className: `status-chip status-chip--${status}`,
    textContent: `${ORDER_STATUS_ICON[status] ?? ''} ${ORDER_STATUS_LABEL[status] ?? status}`.trim(),
  });
}

export function roleBadge(role) {
  return el('span', {
    className: `role-badge role-badge--${role}`,
    textContent: `${ROLE_ICON[role] ?? ''} ${ROLE_LABEL[role] ?? role}`.trim(),
  });
}

/* ------------------------------------------------------------------ */
/* Gambar produk dengan fallback                                      */
/* ------------------------------------------------------------------ */

export function productImage(product, className = 'product-thumb') {
  const fallback = defaultProductImage(product?.kategori);
  const primary = sanitizeImageUrl(product?.imageUrl) || fallback;
  const emoji = PRODUCT_EMOJI_BY_KATEGORI[product?.kategori] ?? '📦';

  const img = el('img', {
    className,
    attrs: {
      src: primary,
      alt: product?.nama ? `Foto ${product.nama}` : 'Produk',
      loading: 'lazy',
      decoding: 'async',
    },
  });
  img.addEventListener('error', () => {
    if (img.getAttribute('src') !== fallback) {
      img.setAttribute('src', fallback);
      return;
    }
    img.replaceWith(el('span', { className: `${className} ${className}--fallback`, textContent: emoji }));
  });
  return img;
}

/* ------------------------------------------------------------------ */
/* Form helpers                                                       */
/* ------------------------------------------------------------------ */

export function field(label, control, errorEl = null) {
  return el('div', { className: 'field' }, [
    el('label', { className: 'field__wrap' }, [
      el('span', { className: 'field__label', textContent: label }),
      control,
    ]),
    errorEl ?? el('p', { className: 'field-error', attrs: { role: 'alert' } }),
  ]);
}

export function input(attrs = {}) {
  return el('input', { className: 'field__control', attrs: { type: 'text', ...attrs } });
}

export function select(options, value = '', attrs = {}) {
  const node = el(
    'select',
    { className: 'field__control', attrs },
    options.map((opt) => {
      const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const item = el('option', { textContent: o.label ?? o.value, attrs: { value: o.value } });
      if (o.value === value) item.selected = true;
      return item;
    }),
  );
  return node;
}

export function textarea(attrs = {}) {
  return el('textarea', { className: 'field__control field__control--area', attrs: { rows: '3', ...attrs } });
}

export function errorSlot() {
  return el('p', { className: 'field-error', attrs: { role: 'alert' } });
}

/** Tampilkan peta error field -> pesan. */
export function showErrors(slots, errors) {
  for (const [key, slot] of Object.entries(slots)) slot.textContent = '';
  for (const [key, message] of Object.entries(errors ?? {})) {
    if (slots[key]) slots[key].textContent = message;
  }
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */

/**
 * Buka dialog modal generik.
 * @param {{ title:string, children:any[], submitLabel?:string, onSubmit:(ctx:{close:Function, controls:object})=>void,
 *   controls?:object, errorSlot?:HTMLElement, secondary?:HTMLElement[] }} opts
 */
export function openModal(opts) {
  const dialog = el('dialog', { className: 'modal' });
  const general = opts.errorSlot ?? el('p', { className: 'form-error', attrs: { role: 'alert' } });
  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };

  const form = el('form', { className: 'modal__form', attrs: { novalidate: 'novalidate' } }, [
    ...opts.children,
    general,
    el('div', { className: 'modal__actions' }, [
      el('button', { className: 'btn btn--ghost', textContent: 'Batal', attrs: { type: 'button' }, onClick: close }),
      ...(opts.secondary ?? []),
      el('button', { className: 'btn btn--primary', textContent: opts.submitLabel ?? 'Simpan', attrs: { type: 'submit' } }),
    ]),
  ]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    general.textContent = '';
    opts.onSubmit({ close, controls: opts.controls ?? {}, form, errorSlot: general });
  });

  dialog.append(
    el('div', { className: 'modal__panel' }, [
      el('header', { className: 'modal__header' }, [
        el('h3', { className: 'modal__title', textContent: opts.title }),
        el('button', {
          className: 'modal__close',
          textContent: '✕',
          attrs: { type: 'button', 'aria-label': 'Tutup' },
          onClick: close,
        }),
      ]),
      form,
    ]),
  );

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  document.body.append(dialog);
  dialog.showModal();
  const first = form.querySelector('input, select, textarea');
  if (first) first.focus();
  return { dialog, close };
}

/* ------------------------------------------------------------------ */
/* Kartu pesanan                                                      */
/* ------------------------------------------------------------------ */

/**
 * Kartu pesanan yang dipakai pembeli, seller, dan admin.
 * @param {object} order
 * @param {{ buyerName?:string, sellerName?:string, showBuyer?:boolean, showSeller?:boolean,
 *   actions?:Array<{status:string,label?:string,onClick:Function,variant?:string}> }} opts
 */
export function orderCard(order, opts = {}) {
  const actions = opts.actions ?? [];

  const meta = [];
  if (opts.showSeller) meta.push(`Toko: ${opts.sellerName ?? '-'}`);
  if (opts.showBuyer) meta.push(`Pembeli: ${opts.buyerName ?? '-'}`);

  const items = el(
    'ul',
    { className: 'order-items' },
    order.items.map((item) =>
      el('li', { className: 'order-item' }, [
        productImage({ ...item, kategori: item.kategori }, 'order-thumb'),
        el('div', { className: 'order-item__info' }, [
          el('span', { className: 'order-item__name', textContent: item.nama }),
          el('span', { className: 'order-item__meta', textContent: `${item.qty} ${item.satuan} × ${formatIDR(item.harga)}` }),
        ]),
        el('span', { className: 'order-item__total', textContent: formatIDR(item.qty * item.harga) }),
      ]),
    ),
  );

  const timeline = el(
    'ol',
    { className: 'order-timeline' },
    order.timeline.map((event) =>
      el('li', { className: `order-timeline__step is-${event.status}` }, [
        el('span', { className: 'order-timeline__dot', attrs: { 'aria-hidden': 'true' } }),
        el('div', { className: 'order-timeline__body' }, [
          el('span', { className: 'order-timeline__label', textContent: ORDER_STATUS_LABEL[event.status] ?? event.status }),
          el('span', { className: 'order-timeline__time', textContent: formatDateTime(event.at) }),
        ]),
      ]),
    ),
  );

  const actionButtons = actions.map((action) =>
    el('button', {
      className: `btn ${action.variant ? `btn--${action.variant}` : 'btn--primary'} btn--sm`,
      textContent: action.label ?? TRANSITION_LABEL[action.status] ?? action.status,
      attrs: { type: 'button' },
      onClick: action.onClick,
    }),
  );

  return el('article', { className: `order-card order-card--${order.status}` }, [
    el('header', { className: 'order-card__head' }, [
      el('div', { className: 'order-card__id' }, [
        el('strong', { textContent: order.kode }),
        el('span', { className: 'order-card__date', textContent: formatDateTime(order.createdAt) }),
      ]),
      el('div', { className: 'order-card__badges' }, [
        statusChip(order.status),
        order.paymentBatchId
          ? el('span', {
              className: `pay-chip pay-chip--${String(order.paymentStatus ?? 'menunggu_pembayaran').replace(/_/g, '-')}`,
              textContent: `${PAYMENT_STATUS_ICON[order.paymentStatus] ?? '💳'} ${
                PAYMENT_STATUS_LABEL[order.paymentStatus] ?? 'Transfer'
              }`,
            })
          : null,
      ]),
    ]),
    meta.length ? el('p', { className: 'order-card__meta', textContent: meta.join(' · ') }) : null,
    items,
    el('div', { className: 'order-card__foot' }, [
      el('div', { className: 'order-card__total' }, [
        el('span', { textContent: `Subtotal ${formatIDR(order.subtotal)} · Ongkir ${formatIDR(order.ongkir)}` }),
        el('strong', { textContent: formatIDR(order.total) }),
      ]),
      actionButtons.length ? el('div', { className: 'order-card__actions' }, actionButtons) : null,
    ]),
    el('details', { className: 'order-details' }, [
      el('summary', { textContent: 'Alamat, catatan & riwayat status' }),
      el('div', { className: 'order-details__body' }, [
        el('p', { className: 'order-details__label', textContent: 'Alamat pengiriman' }),
        el('p', { textContent: order.alamat }),
        order.catatan ? el('p', { className: 'order-details__note', textContent: `Catatan: ${order.catatan}` }) : null,
        order.paymentBatchId
          ? el('p', {
              className: 'order-details__note',
              textContent: `Pembayaran: transfer bank · ${PAYMENT_STATUS_LABEL[order.paymentStatus] ?? 'Menunggu Transfer'}`,
            })
          : null,
        el('p', { className: 'order-details__label', textContent: 'Riwayat status' }),
        timeline,
      ]),
    ]),
  ]);
}

/* Re-export helper kecil agar view tidak perlu dua import. */
export { formatIDR, formatDateTime, mount };
