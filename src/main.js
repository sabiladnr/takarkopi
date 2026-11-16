/**
 * main.js — entry point TakarKopi.
 * Menyambungkan state, logika prediksi (predictor.js), domain bahan (ingredients.js),
 * dan seluruh komponen tampilan (ui.js).
 */

import './style.css';

import {
  must,
  el,
  mount,
  toast,
  renderTriggers,
  renderStats,
  renderChecklist,
  renderIngredientTable,
  openIngredientForm,
  confirmDialog,
  downloadJSON,
  openImportDialog,
  renderHero,
} from './ui.js';

import {
  WEATHER,
  CALENDAR,
  DEFAULT_WEATHER,
  DEFAULT_CALENDAR,
  buildChecklist,
  filterChecklist,
  formatWeekday,
  formatHumanDate,
  toISODate,
} from './predictor.js';

import {
  loadIngredients,
  saveIngredients,
  clearIngredients,
  demoIngredients,
  serializeExport,
  addIngredient,
  updateIngredient,
  removeIngredient,
  stockStep,
  nextStockValue,
} from './ingredients.js';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  items: [],
  weatherId: DEFAULT_WEATHER,
  calendarId: DEFAULT_CALENDAR,
  checked: new Set(),
  query: '',
  filter: 'all',
};

const dom = {
  hero: must('#hero'),
  triggers: must('#triggers'),
  stats: must('#stats'),
  checklist: must('#checklist'),
  ingredients: must('#ingredients'),
  dataActions: must('#data-actions'),
  todayLabel: must('#today-label'),
  prepFilter: must('#prep-filter'),
  prepSearch: must('#prep-search'),
  dashboardBtn: must('#btn-dashboard'),
};

/* ------------------------------------------------------------------ */
/* Persistensi                                                         */
/* ------------------------------------------------------------------ */

function persist() {
  const res = saveIngredients(state.items);
  if (!res.ok) toast(res.error, { type: 'error' });
  return res.ok;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function currentChecklist() {
  return buildChecklist(state.items, state.weatherId, state.calendarId);
}

function renderTriggersSection() {
  renderTriggers(dom.triggers, {
    weatherId: state.weatherId,
    calendarId: state.calendarId,
    WEATHER,
    CALENDAR,
    onWeather: (id) => {
      state.weatherId = id;
      renderTriggersSection();
      renderPredictionSections();
    },
    onCalendar: (id) => {
      state.calendarId = id;
      renderTriggersSection();
      renderPredictionSections();
    },
  });
}

function renderChecklistSection() {
  const { items } = currentChecklist();
  renderChecklist(dom.checklist, {
    items: filterChecklist(items, { query: state.query, filter: state.filter }),
    allItems: items,
    checked: state.checked,
    onToggle: handleToggle,
  });
}

function renderPredictionSections() {
  renderStats(dom.stats, currentChecklist().stats);
  renderChecklistSection();
}

function renderTableSection() {
  renderIngredientTable(dom.ingredients, {
    items: state.items,
    onAdd: handleAdd,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onAdjustStock: adjustStock,
  });
}

function renderDataActions() {
  mount(dom.dataActions, [
    el('button', { className: 'btn btn--ghost', textContent: '⬇️ Export JSON', attrs: { type: 'button' }, onClick: handleExport }),
    el('button', { className: 'btn btn--ghost', textContent: '⬆️ Import JSON', attrs: { type: 'button' }, onClick: handleImport }),
    el('button', { className: 'btn btn--danger-ghost', textContent: '♻️ Reset Data Demo', attrs: { type: 'button' }, onClick: handleReset }),
  ]);
}

function renderAll() {
  renderTriggersSection();
  renderPredictionSections();
  renderTableSection();
}

/* ------------------------------------------------------------------ */
/* Interaksi checklist                                                 */
/* ------------------------------------------------------------------ */

function handleToggle(id, checked) {
  if (checked) state.checked.add(id);
  else state.checked.delete(id);

  const row = dom.checklist.querySelector(`li[data-id="${cssEscape(id)}"]`);
  if (row) row.classList.toggle('is-done', checked);
  updateProgress();
}

function updateProgress() {
  const total = state.items.length;
  const done = [...state.checked].filter((id) => state.items.some((it) => it.id === id)).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = dom.checklist.querySelector('.prep-progress__bar');
  const fill = dom.checklist.querySelector('.prep-progress__fill');
  const text = dom.checklist.querySelector('.prep-progress__text');
  if (bar) bar.setAttribute('aria-valuenow', String(percent));
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = `${done} dari ${total} bahan selesai disiapkan (${percent}%)`;
}

/* ------------------------------------------------------------------ */
/* CRUD bahan                                                          */
/* ------------------------------------------------------------------ */

function adjustStock(id, direction) {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  const next = nextStockValue(item.stokSaatIni, direction, stockStep(item));
  if (next === item.stokSaatIni) return;
  item.stokSaatIni = next;
  persist();
  renderPredictionSections();
  renderTableSection();
}

function handleAdd() {
  openIngredientForm({
    title: 'Tambah Bahan Baku',
    existingIds: state.items.map((it) => it.id),
    onSubmit: (values) => {
      const { items, item } = addIngredient(state.items, values);
      state.items = items;
      persist();
      toast(`${item.nama} ditambahkan ke daftar bahan.`, { type: 'success' });
      renderAll();
    },
  });
}

function handleEdit(id) {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  openIngredientForm({
    title: `Edit: ${item.nama}`,
    initial: item,
    existingIds: state.items.map((it) => it.id),
    onSubmit: (values) => {
      const { items, item: updated } = updateIngredient(state.items, id, values);
      state.items = items;
      persist();
      toast(`Perubahan ${updated.nama} disimpan.`, { type: 'success' });
      renderAll();
    },
  });
}

async function handleDelete(id) {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  const ok = await confirmDialog({
    title: 'Hapus Bahan Baku',
    message: `Yakin ingin menghapus "${item.nama}"? Tindakan ini tidak dapat dibatalkan.`,
    confirmLabel: 'Hapus',
  });
  if (!ok) return;
  const { items } = removeIngredient(state.items, id);
  state.items = items;
  state.checked.delete(id);
  persist();
  toast(`${item.nama} dihapus.`, { type: 'info' });
  renderAll();
}

/* ------------------------------------------------------------------ */
/* Export / Import / Reset                                             */
/* ------------------------------------------------------------------ */

function handleExport() {
  const filename = `takarkopi-backup-${toISODate(new Date())}.json`;
  downloadJSON(filename, serializeExport(state.items));
  toast(`Backup ${state.items.length} bahan diunduh (${filename}).`, { type: 'success' });
}

function handleImport() {
  openImportDialog({
    onImport: (items) => {
      state.items = items;
      state.checked.clear();
      persist();
      toast(`Berhasil mengimpor ${items.length} bahan.`, { type: 'success' });
      renderAll();
    },
  });
}

async function handleReset() {
  const ok = await confirmDialog({
    title: 'Reset Data Demo',
    message: 'Ganti seluruh data dengan 8 bahan contoh TakarKopi? Data saat ini akan hilang.',
    confirmLabel: 'Reset',
    danger: false,
  });
  if (!ok) return;
  clearIngredients();
  state.items = demoIngredients();
  state.checked.clear();
  persist();
  toast('Data demo dipulihkan.', { type: 'success' });
  renderAll();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function cssEscape(value) {
  if (globalThis.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

function wireEvents() {
  dom.prepFilter.value = state.filter;
  dom.prepFilter.addEventListener('change', () => {
    state.filter = dom.prepFilter.value;
    renderChecklistSection();
  });

  dom.prepSearch.addEventListener('input', () => {
    state.query = dom.prepSearch.value;
    renderChecklistSection();
  });

  // Tombol "Dashboard Bahan" -> gulir ke Manajemen Bahan.
  dom.dashboardBtn.addEventListener('click', () => {
    const target = must('#manage');
    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    target.classList.add('is-flash');
    setTimeout(() => target.classList.remove('is-flash'), 1200);
    // Jaring pengaman: bila smooth-scroll tidak berjalan (mis. tab non-aktif), lompat instan.
    setTimeout(() => {
      const rect = target.getBoundingClientRect();
      if (rect.top < -4 || rect.top > window.innerHeight) target.scrollIntoView({ block: 'start' });
    }, 650);
  });
}

function boot() {
  const loaded = loadIngredients();
  state.items = loaded.items;

  if (loaded.source === 'demo') {
    // Simpan agar sesi berikutnya memakai data yang sama (persistensi tervalidasi).
    saveIngredients(state.items);
    if (loaded.error) {
      toast(`Data tersimpan bermasalah: ${loaded.error} Data demo dimuat.`, { type: 'error', duration: 6000 });
    } else {
      toast('Data demo TakarKopi dimuat (8 bahan baku).', { type: 'info' });
    }
  } else if (loaded.backfilled) {
    // Data lama tanpa imageUrl sudah dilengkapi gambar default — simpan kembali.
    saveIngredients(state.items);
  }

  const today = new Date();
  dom.todayLabel.textContent = `${formatWeekday(today)} · ${formatHumanDate(toISODate(today))}`;

  renderHero(dom.hero, './images/cafe-hero.svg');
  wireEvents();
  renderDataActions();
  renderAll();
}

boot();
