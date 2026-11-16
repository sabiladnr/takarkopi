/**
 * ui.js — seluruh lapisan tampilan TakarKopi.
 *
 * Berisi helper DOM yang aman (anti-XSS: semua teks pengguna lewat textContent),
 * notifikasi toast, pemilih trigger cuaca/kalender, kartu statistik, checklist prep,
 * tabel CRUD bahan + form modal, dan dialog export/import.
 */

import {
  KATEGORI,
  SATUAN,
  validateIngredient,
  ValidationError,
  nextId,
  parseImport,
  sanitizeImageUrl,
} from './ingredients.js';
import { expiryStatus, formatHumanDate } from './predictor.js';

/* ================================================================== */
/* 1. Helper DOM                                                      */
/* ================================================================== */

/**
 * Buat elemen dengan atribut & anak. Teks pengguna masuk lewat textContent
 * sehingga otomatis ter-escape (anti-XSS).
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null) continue;
    if (key === 'className') node.className = value;
    else if (key === 'textContent') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'attrs') {
      for (const [a, v] of Object.entries(value)) {
        if (v != null && v !== false) node.setAttribute(a, String(v));
      }
    } else {
      node.setAttribute(key, String(value));
    }
  }

  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Hapus seluruh isi sebuah elemen. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Ganti seluruh isi elemen dengan anak baru. */
export function mount(node, children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

/** Cari satu elemen, error jelas bila tidak ada. */
export function must(selector, root = document) {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`Elemen tidak ditemukan: ${selector}`);
  return node;
}

/** Format angka gaya Indonesia. */
export function fmt(n) {
  return (Number(n) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/* ================================================================== */
/* 1b. Gambar aman (thumbnail bahan & banner hero)                    */
/* ================================================================== */

/**
 * Buat elemen visual bahan: thumbnail `<img>` bila `imageUrl` aman, atau
 * fallback emoji. Bila gambar gagal dimuat, otomatis diganti emoji.
 * @param {object} ingredient
 * @param {string} fallbackClass kelas untuk fallback emoji
 */
export function ingredientVisual(ingredient, fallbackClass = 'ingredient-emoji') {
  const emoji = ingredient?.ikon || '📦';
  const makeFallback = () =>
    el('span', { className: fallbackClass, textContent: emoji, attrs: { 'aria-hidden': 'true' } });

  // Sanitasi ulang di lapisan tampilan (pertahanan berlapis).
  const url = sanitizeImageUrl(ingredient?.imageUrl);
  if (!url) return makeFallback();

  const img = el('img', {
    className: 'ingredient-thumb',
    attrs: {
      src: url,
      alt: ingredient?.nama ? `Ilustrasi ${ingredient.nama}` : '',
      loading: 'lazy',
      decoding: 'async',
    },
  });
  img.addEventListener(
    'error',
    () => {
      const fb = makeFallback();
      if (img.parentNode) img.parentNode.replaceChild(fb, img);
    },
    { once: true },
  );
  return img;
}

/**
 * Tampilkan banner ilustrasi kafe di header. Bila gambar gagal dimuat,
 * banner disembunyikan dengan rapi (kelas `is-missing`).
 * @param {HTMLElement} host
 * @param {string} src
 */
export function renderHero(host, src) {
  const url = sanitizeImageUrl(src) || './images/cafe-hero.svg';
  const img = el('img', {
    className: 'hero__img',
    attrs: { src: url, alt: 'Ilustrasi suasana kafe TakarKopi', decoding: 'async' },
  });
  img.addEventListener(
    'error',
    () => {
      host.classList.add('is-missing');
    },
    { once: true },
  );
  mount(host, [img]);
  return host;
}

/* ================================================================== */
/* 2. Toast                                                           */
/* ================================================================== */

let toastHost = null;
let toastSeq = 0;

function ensureToastHost() {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = el('div', { className: 'toast-stack', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
  document.body.append(toastHost);
  return toastHost;
}

/**
 * Tampilkan toast.
 * @param {string} message
 * @param {{ type?: 'success'|'error'|'info', duration?: number }} [opts]
 */
export function toast(message, opts = {}) {
  const { type = 'info', duration = 4200 } = opts;
  const host = ensureToastHost();

  const node = el('div', { className: `toast toast--${type}`, attrs: { role: 'status' } }, [
    el('span', { className: 'toast__icon', textContent: type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️' }),
    el('span', { className: 'toast__text', textContent: message }),
    el('button', {
      className: 'toast__close',
      textContent: '✕',
      attrs: { type: 'button', 'aria-label': 'Tutup notifikasi' },
      onClick: () => removeToast(node),
    }),
  ]);

  host.append(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  if (duration > 0) setTimeout(() => removeToast(node), duration);
}

function removeToast(node) {
  if (!node || !node.parentNode) return;
  node.classList.remove('is-visible');
  node.addEventListener('transitionend', () => node.remove(), { once: true });
  setTimeout(() => node.remove(), 400);
}

/* ================================================================== */
/* 3. Trigger cuaca & kalender                                        */
/* ================================================================== */

/**
 * @param {HTMLElement} host
 * @param {{ weatherId:string, calendarId:string,
 *   onWeather:(id:string)=>void, onCalendar:(id:string)=>void, WEATHER:object, CALENDAR:object }} opts
 */
export function renderTriggers(host, opts) {
  const { weatherId, calendarId, onWeather, onCalendar, WEATHER, CALENDAR } = opts;

  const weatherRow = triggerRow(
    'Cuaca:',
    '☀️',
    Object.values(WEATHER).map((w) => ({ id: w.id, label: w.short, full: w.label, emoji: w.emoji })),
    weatherId,
    onWeather,
    'weather',
  );

  const calendarRow = triggerRow(
    'Kalender:',
    '📅',
    Object.values(CALENDAR).map((c) => ({ id: c.id, label: c.short, full: c.label, emoji: c.emoji })),
    calendarId,
    onCalendar,
    'calendar',
  );

  mount(host, [weatherRow, calendarRow]);
}

function triggerRow(label, icon, options, activeId, onSelect, name) {
  const buttons = options.map((opt) => {
    const isActive = opt.id === activeId;
    return el(
      'button',
      {
        className: `trigger-btn ${isActive ? 'is-active' : ''}`,
        attrs: {
          type: 'button',
          role: 'radio',
          'aria-checked': isActive ? 'true' : 'false',
          'aria-label': opt.full,
          'data-value': opt.id,
          title: opt.full,
        },
        onClick: () => onSelect(opt.id),
      },
      [
        el('span', { className: 'trigger-btn__emoji', textContent: opt.emoji, attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'trigger-btn__label', textContent: opt.label }),
      ],
    );
  });

  return el('div', { className: 'trigger-row', dataset: { group: name } }, [
    el('span', { className: 'trigger-row__label', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { className: 'trigger-row__icon', textContent: icon }),
      label,
    ]),
    el('div', { className: 'trigger-row__options', attrs: { role: 'radiogroup', 'aria-label': label } }, buttons),
  ]);
}

/* ================================================================== */
/* 4. Kartu statistik                                                 */
/* ================================================================== */

/**
 * @param {HTMLElement} host
 * @param {{ totalJenis:number, perluBelanja:number, mendekatiKedaluwarsa:number }} stats
 */
export function renderStats(host, stats) {
  const cards = [
    { key: 'total', icon: '🧾', label: 'Total Bahan', value: stats.totalJenis, tone: 'neutral', title: 'Jumlah jenis bahan baku terdaftar' },
    { key: 'kurang', icon: '⚠️', label: 'Kurang Stok', value: stats.perluBelanja, tone: stats.perluBelanja > 0 ? 'warn' : 'ok', title: 'Stok di bawah rekomendasi prep hari ini' },
    { key: 'expiry', icon: '⏳', label: 'Hampir Kedaluwarsa', value: stats.mendekatiKedaluwarsa, tone: stats.mendekatiKedaluwarsa > 0 ? 'danger' : 'ok', title: 'Kedaluwarsa dalam ≤ 5 hari atau sudah lewat' },
  ];

  mount(
    host,
    cards.map((c) =>
      el('article', { className: `stat-card stat-card--${c.tone}`, dataset: { stat: c.key }, attrs: { title: c.title } }, [
        el('span', { className: 'stat-card__icon', textContent: c.icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'stat-card__label', textContent: `${c.label}:` }),
        el('span', { className: 'stat-card__value', textContent: fmt(c.value) }),
      ]),
    ),
  );
}

/* ================================================================== */
/* 5. Smart Prep Checklist                                            */
/* ================================================================== */

/**
 * @param {HTMLElement} host
 * @param {{ items:Array, allItems?:Array, checked:Set<string>, onToggle:(id:string, checked:boolean)=>void }} opts
 */
export function renderChecklist(host, opts) {
  const { items, allItems = items, checked, onToggle } = opts;

  if (!allItems.length) {
    mount(host, [
      el('div', { className: 'empty-state' }, [
        el('p', { className: 'empty-state__icon', textContent: '🍽️' }),
        el('p', { textContent: 'Belum ada bahan baku. Tambahkan bahan dulu di bagian Manajemen Bahan.' }),
      ]),
    ]);
    return;
  }

  const done = allItems.filter((it) => checked.has(it.ingredient.id)).length;
  const percent = Math.round((done / allItems.length) * 100);

  const header = el('div', { className: 'prep-progress' }, [
    el(
      'div',
      { className: 'prep-progress__bar', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) } },
      [el('span', { className: 'prep-progress__fill', style: { width: `${percent}%` } })],
    ),
    el('p', { className: 'prep-progress__text', textContent: `${done} dari ${allItems.length} bahan selesai disiapkan (${percent}%)` }),
  ]);

  if (!items.length) {
    mount(host, [
      header,
      el('div', { className: 'empty-state' }, [
        el('p', { className: 'empty-state__icon', textContent: '🔍' }),
        el('p', { textContent: 'Tidak ada bahan yang cocok dengan filter / kata kunci.' }),
      ]),
    ]);
    return;
  }

  const list = el('ul', { className: 'checklist' }, items.map((item) => checklistItem(item, checked, onToggle)));
  mount(host, [header, list]);
}

function checklistItem(item, checked, onToggle) {
  const { ingredient, prediksi, expiry, stok, selisih, cukup, kekurangan } = item;
  const id = ingredient.id;
  const isDone = checked.has(id);

  const checkbox = el('input', { className: 'checklist__checkbox', attrs: { type: 'checkbox', id: `prep-${id}` } });
  checkbox.checked = isDone;
  checkbox.addEventListener('change', () => onToggle(id, checkbox.checked));

  const title = el('label', { className: 'checklist__title', attrs: { for: `prep-${id}` } }, [
    ingredientVisual(ingredient, 'checklist__emoji'),
    el('span', { className: 'checklist__name', textContent: ingredient.nama }),
    el('span', { className: 'checklist__kategori', textContent: `(${ingredient.kategori})` }),
  ]);

  const expiryChip = el('span', {
    className: `chip chip--expiry chip--${expiry.level}`,
    textContent: expiry.label,
    attrs: { title: `${expiry.keterangan} ED ${formatHumanDate(ingredient.tanggalKedaluwarsa)}` },
  });

  const prepLine = el('p', { className: 'checklist__prep' }, [
    el('span', { className: 'checklist__prep-label', textContent: 'Rekomendasi Prep:' }),
    el('strong', { className: 'checklist__prep-value', textContent: `${fmt(prediksi.kebutuhan)} ${ingredient.satuan}` }),
    el('span', { className: 'checklist__reason', textContent: `(${prediksi.alasan})` }),
  ]);

  const badge = el('span', {
    className: `stock-badge ${cukup ? 'stock-badge--ok' : 'stock-badge--short'}`,
    textContent: cukup
      ? `✅ Stok Cukup · sisa ${fmt(selisih)} ${ingredient.satuan}`
      : `⚠️ Kurang ${fmt(kekurangan)} ${ingredient.satuan} · Belanja!`,
  });

  const stockLine = el('p', { className: 'checklist__stock-line' }, [
    el('span', { className: 'checklist__stock-label', textContent: 'Stok Kulkas:' }),
    el('span', { className: 'checklist__stock-value', textContent: `${fmt(stok)} ${ingredient.satuan}` }),
    el('span', { className: 'checklist__arrow', textContent: '→', attrs: { 'aria-hidden': 'true' } }),
    badge,
  ]);

  return el(
    'li',
    { className: `checklist__item ${isDone ? 'is-done' : ''} ${cukup ? '' : 'is-short'}`, dataset: { id } },
    [checkbox, el('div', { className: 'checklist__main' }, [
      el('div', { className: 'checklist__head' }, [title, expiryChip]),
      prepLine,
      stockLine,
    ])],
  );
}

/* ================================================================== */
/* 6. Tabel bahan baku (CRUD)                                         */
/* ================================================================== */

/**
 * @param {HTMLElement} host
 * @param {{ items:Array, onAdd:()=>void, onEdit:(id:string)=>void,
 *   onDelete:(id:string)=>void, onAdjustStock:(id:string, delta:number)=>void }} opts
 */
export function renderIngredientTable(host, opts) {
  const { items, onAdd, onEdit, onDelete, onAdjustStock } = opts;

  const toolbar = el('div', { className: 'toolbar' }, [
    el('p', { className: 'toolbar__info', textContent: `${items.length} bahan baku tersimpan` }),
    el('button', { className: 'btn btn--primary', textContent: '+ Tambah Bahan', attrs: { type: 'button' }, onClick: onAdd }),
  ]);

  if (!items.length) {
    mount(host, [
      toolbar,
      el('div', { className: 'empty-state' }, [
        el('p', { className: 'empty-state__icon', textContent: '📦' }),
        el('p', { textContent: 'Belum ada bahan. Klik "Tambah Bahan" atau pulihkan Data Demo.' }),
      ]),
    ]);
    return;
  }

  const thead = el('thead', {}, [
    el('tr', {}, [
      el('th', { textContent: 'Bahan' }),
      el('th', { textContent: 'Kategori' }),
      el('th', { className: 'num', textContent: 'Stok' }),
      el('th', { className: 'num', textContent: 'Pemakaian Dasar' }),
      el('th', { textContent: 'Kedaluwarsa' }),
      el('th', { className: 'actions', textContent: 'Aksi' }),
    ]),
  ]);

  const tbody = el('tbody', {}, items.map((ing) => ingredientRow(ing, { onEdit, onDelete, onAdjustStock })));
  const table = el('div', { className: 'table-wrap' }, [el('table', { className: 'data-table' }, [thead, tbody])]);

  mount(host, [toolbar, table]);
}

function ingredientRow(ing, { onEdit, onDelete, onAdjustStock }) {
  const expiry = expiryStatus(ing.tanggalKedaluwarsa);

  return el('tr', { dataset: { id: ing.id } }, [
    el('td', { dataset: { label: 'Bahan' } }, [
      el('div', { className: 'cell-ingredient' }, [
        ingredientVisual(ing, 'cell-ingredient__emoji'),
        el('span', { className: 'cell-ingredient__name', textContent: ing.nama }),
      ]),
    ]),
    el('td', { dataset: { label: 'Kategori' } }, [el('span', { className: 'chip chip--kategori', textContent: ing.kategori })]),
    el('td', { className: 'num', dataset: { label: 'Stok' } }, [
      el('div', { className: 'cell-stock' }, [
        el('button', { className: 'btn btn--tiny', textContent: '−', attrs: { type: 'button', 'aria-label': `Kurangi stok ${ing.nama}` }, onClick: () => onAdjustStock(ing.id, -1) }),
        el('span', { className: 'cell-stock__value', textContent: `${fmt(ing.stokSaatIni)} ${ing.satuan}` }),
        el('button', { className: 'btn btn--tiny', textContent: '+', attrs: { type: 'button', 'aria-label': `Tambah stok ${ing.nama}` }, onClick: () => onAdjustStock(ing.id, 1) }),
      ]),
    ]),
    el('td', { className: 'num', dataset: { label: 'Pemakaian Dasar' } }, [
      el('span', { textContent: `${fmt(ing.pemakaianDasar)} ${ing.satuan}` }),
    ]),
    el('td', { dataset: { label: 'Kedaluwarsa' } }, [
      el('div', { className: 'cell-expiry' }, [
        el('span', { className: `chip chip--expiry chip--${expiry.level}`, textContent: expiry.label }),
        el('span', { className: 'cell-expiry__date', textContent: formatHumanDate(ing.tanggalKedaluwarsa) }),
      ]),
    ]),
    el('td', { className: 'actions', dataset: { label: 'Aksi' } }, [
      el('div', { className: 'row-actions' }, [
        el('button', { className: 'btn btn--ghost', textContent: 'Edit', attrs: { type: 'button' }, onClick: () => onEdit(ing.id) }),
        el('button', { className: 'btn btn--danger-ghost', textContent: 'Hapus', attrs: { type: 'button' }, onClick: () => onDelete(ing.id) }),
      ]),
    ]),
  ]);
}

/* ================================================================== */
/* 7. Form modal bahan (Tambah / Edit)                                */
/* ================================================================== */

/**
 * Buka dialog form bahan.
 * @param {{ title:string, initial?:object, existingIds?:string[], onSubmit:(values:object)=>void }} opts
 */
export function openIngredientForm({ title, initial = null, existingIds = [], onSubmit }) {
  const isEdit = Boolean(initial);
  const dialog = el('dialog', { className: 'modal' });

  const fields = {
    nama: fieldInput('text', 'Nama bahan', { placeholder: 'mis. Susu Fresh Milk', maxlength: '80' }),
    kategori: fieldSelect('Kategori', KATEGORI),
    satuan: fieldInput('text', 'Satuan', { placeholder: 'ml / gram / pcs', list: 'satuan-list', maxlength: '16' }),
    stokSaatIni: fieldInput('number', 'Stok saat ini', { min: '0', step: '0.01' }),
    pemakaianDasar: fieldInput('number', 'Pemakaian dasar harian', { min: '0.01', step: '0.01' }),
    tanggalKedaluwarsa: fieldInput('date', 'Tanggal kedaluwarsa'),
    ikon: fieldInput('text', 'Ikon (emoji)', { maxlength: '8', placeholder: '🥛' }),
  };

  if (initial) {
    fields.nama.control.value = initial.nama ?? '';
    fields.kategori.control.value = initial.kategori ?? KATEGORI[0];
    fields.satuan.control.value = initial.satuan ?? '';
    fields.stokSaatIni.control.value = String(initial.stokSaatIni ?? '');
    fields.pemakaianDasar.control.value = String(initial.pemakaianDasar ?? '');
    fields.tanggalKedaluwarsa.control.value = initial.tanggalKedaluwarsa ?? '';
    fields.ikon.control.value = initial.ikon ?? '';
  } else {
    fields.kategori.control.value = KATEGORI[0];
  }

  const errorSlots = {};
  const rows = Object.entries(fields).map(([key, f]) => {
    const err = el('p', { className: 'field-error', attrs: { role: 'alert' } });
    errorSlots[key] = err;
    return el('div', { className: 'field' }, [f.wrap, err]);
  });

  const emojiBar = el('div', { className: 'emoji-bar' }, ['🥛', '🧴', '🧊', '☕', '🥐', '🍯', '🍵', '🍫', '🍓', '🍊', '🟤', '📦'].map((emoji) =>
    el('button', {
      className: 'emoji-bar__btn',
      textContent: emoji,
      attrs: { type: 'button', 'aria-label': `Gunakan ikon ${emoji}` },
      onClick: () => {
        fields.ikon.control.value = emoji;
        fields.ikon.control.focus();
      },
    }),
  ));

  const generalError = el('p', { className: 'form-error', attrs: { role: 'alert' } });

  const form = el('form', { className: 'modal__form', attrs: { novalidate: 'novalidate' } }, [
    el('div', { className: 'field-grid' }, rows),
    el('div', { className: 'field' }, [el('span', { className: 'field__label', textContent: 'Pilih ikon cepat' }), emojiBar]),
    generalError,
    el('div', { className: 'modal__actions' }, [
      el('button', { className: 'btn btn--ghost', textContent: 'Batal', attrs: { type: 'button' }, onClick: () => close() }),
      el('button', { className: 'btn btn--primary', textContent: isEdit ? 'Simpan Perubahan' : 'Tambah Bahan', attrs: { type: 'submit' } }),
    ]),
  ]);

  dialog.append(
    el('div', { className: 'modal__panel' }, [
      el('header', { className: 'modal__header' }, [
        el('h3', { className: 'modal__title', textContent: title }),
        el('button', { className: 'modal__close', textContent: '✕', attrs: { type: 'button', 'aria-label': 'Tutup' }, onClick: () => close() }),
      ]),
      form,
    ]),
  );

  function close() {
    dialog.close();
    dialog.remove();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();
    const raw = {
      id: isEdit ? initial.id : nextId(existingIds.map((id) => ({ id }))),
      nama: fields.nama.control.value,
      kategori: fields.kategori.control.value,
      satuan: fields.satuan.control.value,
      stokSaatIni: fields.stokSaatIni.control.value,
      pemakaianDasar: fields.pemakaianDasar.control.value,
      tanggalKedaluwarsa: fields.tanggalKedaluwarsa.control.value,
      ikon: fields.ikon.control.value,
      // Pertahankan gambar lama saat edit (tidak diubah lewat form ini).
      imageUrl: initial?.imageUrl ?? '',
    };

    try {
      onSubmit(validateIngredient(raw));
      close();
    } catch (err) {
      if (err instanceof ValidationError) {
        for (const [field, message] of Object.entries(err.fields)) {
          if (errorSlots[field]) errorSlots[field].textContent = message;
          else generalError.textContent = message;
        }
        generalError.textContent = generalError.textContent || err.message;
        const first = Object.keys(err.fields)[0];
        if (first && fields[first]) fields[first].control.focus();
      } else {
        generalError.textContent = 'Terjadi kesalahan tak terduga saat menyimpan.';
      }
    }
  });

  function clearErrors() {
    for (const slot of Object.values(errorSlots)) slot.textContent = '';
    generalError.textContent = '';
  }

  if (!document.getElementById('satuan-list')) {
    document.body.append(el('datalist', { attrs: { id: 'satuan-list' } }, SATUAN.map((s) => el('option', { attrs: { value: s } }))));
  }

  document.body.append(dialog);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.showModal();
  fields.nama.control.focus();
  return dialog;
}

function fieldInput(type, label, attrs = {}) {
  const control = el('input', { className: 'field__control', attrs: { type, ...attrs } });
  return { control, wrap: wrapField(label, control) };
}

function fieldSelect(label, options) {
  const control = el('select', { className: 'field__control' }, options.map((o) => el('option', { textContent: o, attrs: { value: o } })));
  return { control, wrap: wrapField(label, control) };
}

function wrapField(label, control) {
  return el('label', { className: 'field__wrap' }, [
    el('span', { className: 'field__label', textContent: label }),
    control,
  ]);
}

/* ================================================================== */
/* 8. Dialog konfirmasi                                               */
/* ================================================================== */

/**
 * Dialog konfirmasi (mis. hapus bahan).
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel = 'Hapus', danger = true }) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { className: 'modal modal--sm' });
    let answered = false;

    const finish = (value) => {
      if (answered) return;
      answered = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    const form = el('form', { className: 'modal__form', attrs: { method: 'dialog' } }, [
      el('p', { className: 'confirm__message', textContent: message }),
      el('div', { className: 'modal__actions' }, [
        el('button', { className: 'btn btn--ghost', textContent: 'Batal', attrs: { type: 'button' }, onClick: () => finish(false) }),
        el('button', {
          className: danger ? 'btn btn--danger' : 'btn btn--primary',
          textContent: confirmLabel,
          attrs: { type: 'button' },
          onClick: () => finish(true),
        }),
      ]),
    ]);

    dialog.append(
      el('div', { className: 'modal__panel' }, [
        el('header', { className: 'modal__header' }, [el('h3', { className: 'modal__title', textContent: title })]),
        form,
      ]),
    );

    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    dialog.addEventListener('close', () => finish(false));

    document.body.append(dialog);
    dialog.showModal();
    const confirmBtn = dialog.querySelector('.btn--danger, .btn--primary');
    if (confirmBtn) confirmBtn.focus();
  });
}

/* ================================================================== */
/* 9. Export / Import JSON                                            */
/* ================================================================== */

/** Unduh teks sebagai file. */
export function downloadJSON(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { attrs: { href: url, download: filename, hidden: 'hidden' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Dialog import: tempel JSON atau pilih file, divalidasi sebelum diterapkan.
 * @param {{ onImport:(items:Array)=>void }} opts
 */
export function openImportDialog({ onImport }) {
  const dialog = el('dialog', { className: 'modal' });

  const textarea = el('textarea', {
    className: 'field__control field__control--area',
    attrs: { rows: '10', placeholder: 'Tempel isi JSON backup di sini…', spellcheck: 'false' },
  });

  const fileInput = el('input', { className: 'field__control', attrs: { type: 'file', accept: 'application/json,.json' } });
  const status = el('p', { className: 'form-hint' });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      textarea.value = await file.text();
      status.textContent = `File "${file.name}" dimuat. Klik "Impor" untuk memvalidasi & menerapkan.`;
      status.className = 'form-hint';
    } catch {
      status.textContent = 'Gagal membaca file.';
      status.className = 'form-error';
    }
  });

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  const form = el('form', { className: 'modal__form', attrs: { novalidate: 'novalidate' } }, [
    el('div', { className: 'field' }, [el('span', { className: 'field__label', textContent: 'Pilih file JSON' }), fileInput]),
    el('div', { className: 'field' }, [el('span', { className: 'field__label', textContent: 'Atau tempel JSON' }), textarea]),
    status,
    el('div', { className: 'modal__actions' }, [
      el('button', { className: 'btn btn--ghost', textContent: 'Batal', attrs: { type: 'button' }, onClick: close }),
      el('button', {
        className: 'btn btn--primary',
        textContent: 'Impor & Ganti Data',
        attrs: { type: 'button' },
        onClick: () => {
          const result = parseImport(textarea.value);
          if (!result.ok) {
            status.textContent = `Gagal: ${result.error}`;
            status.className = 'form-error';
            return;
          }
          onImport(result.items);
          close();
        },
      }),
    ]),
  ]);

  dialog.append(
    el('div', { className: 'modal__panel' }, [
      el('header', { className: 'modal__header' }, [
        el('h3', { className: 'modal__title', textContent: 'Import JSON Bahan Baku' }),
        el('button', { className: 'modal__close', textContent: '✕', attrs: { type: 'button', 'aria-label': 'Tutup' }, onClick: close }),
      ]),
      form,
    ]),
  );

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  document.body.append(dialog);
  dialog.showModal();
  textarea.focus();
}
