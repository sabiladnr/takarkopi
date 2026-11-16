/**
 * ingredients.js — domain bahan baku TakarKopi.
 *
 * Berisi:
 *  - Konstanta kategori/satuan & data contoh (8 bahan baku kafe).
 *  - Validasi skema ketat (`Ingredient` & payload import JSON).
 *  - Persistensi `localStorage` (key `takarkopi:ingredients:v1`) + export/import.
 *  - Operasi CRUD & penyesuaian stok.
 *
 * Modul ini murni logika (tanpa DOM).
 */

import { resolveRelativeDate, isValidISODate } from './predictor.js';

/* ================================================================== */
/* 1. Konstanta & data contoh                                         */
/* ================================================================== */

/** Kategori bahan baku yang diizinkan. */
export const KATEGORI = ['Minuman Dingin', 'Minuman Panas', 'Pastry', 'Bahan Umum'];

/** Satuan ukur yang disarankan (boleh teks bebas). */
export const SATUAN = ['ml', 'gram', 'pcs', 'kg', 'liter'];

/** Key penyimpanan sesuai spesifikasi. */
export const STORAGE_KEY = 'takarkopi:ingredients:v1';

/**
 * Data demo 8 bahan baku kafe.
 * `tanggalKedaluwarsa` memakai token relatif (`@+2`) dan diresolusi saat load
 * agar demo selalu menampilkan status kedaluwarsa yang relevan.
 */
export const DEMO_INGREDIENTS = [
  { id: 'ing-01', nama: 'Susu Fresh Milk', kategori: 'Minuman Dingin', satuan: 'ml', stokSaatIni: 12000, pemakaianDasar: 5000, tanggalKedaluwarsa: '@+2', ikon: '🥛', imageUrl: './images/milk.svg' },
  { id: 'ing-02', nama: 'Susu UHT Full Cream', kategori: 'Minuman Dingin', satuan: 'ml', stokSaatIni: 8000, pemakaianDasar: 3000, tanggalKedaluwarsa: '@+20', ikon: '🧴', imageUrl: './images/uht.svg' },
  { id: 'ing-03', nama: 'Simple Syrup', kategori: 'Bahan Umum', satuan: 'ml', stokSaatIni: 4000, pemakaianDasar: 2000, tanggalKedaluwarsa: '@+30', ikon: '🍯', imageUrl: './images/syrup.svg' },
  { id: 'ing-04', nama: 'Es Batu Kristal', kategori: 'Minuman Dingin', satuan: 'gram', stokSaatIni: 6000, pemakaianDasar: 5000, tanggalKedaluwarsa: '@+60', ikon: '🧊', imageUrl: './images/ice.svg' },
  { id: 'ing-05', nama: 'Espresso Blend', kategori: 'Minuman Panas', satuan: 'gram', stokSaatIni: 3500, pemakaianDasar: 1500, tanggalKedaluwarsa: '@+45', ikon: '☕', imageUrl: './images/coffee.svg' },
  { id: 'ing-06', nama: 'Croissant Butter', kategori: 'Pastry', satuan: 'pcs', stokSaatIni: 20, pemakaianDasar: 24, tanggalKedaluwarsa: '@+4', ikon: '🥐', imageUrl: './images/croissant.svg' },
  { id: 'ing-07', nama: 'Sirup Aren Cair', kategori: 'Bahan Umum', satuan: 'ml', stokSaatIni: 3000, pemakaianDasar: 1200, tanggalKedaluwarsa: '@+15', ikon: '🟤', imageUrl: './images/aren.svg' },
  { id: 'ing-08', nama: 'Matcha Powder', kategori: 'Minuman Panas', satuan: 'gram', stokSaatIni: 1500, pemakaianDasar: 800, tanggalKedaluwarsa: '@+12', ikon: '🍵', imageUrl: './images/matcha.svg' },
];

/* ================================================================== */
/* 2. Validasi                                                        */
/* ================================================================== */

/**
 * Peta gambar default per id bahan demo.
 * Dipakai untuk melengkapi data lama yang belum punya `imageUrl`.
 */
export const IMAGE_BY_ID = {
  'ing-01': './images/milk.svg',
  'ing-02': './images/uht.svg',
  'ing-03': './images/syrup.svg',
  'ing-04': './images/ice.svg',
  'ing-05': './images/coffee.svg',
  'ing-06': './images/croissant.svg',
  'ing-07': './images/aren.svg',
  'ing-08': './images/matcha.svg',
};

/** Peta gambar default per kategori (cadangan bila id tidak dikenal). */
export const IMAGE_BY_KATEGORI = {
  'Minuman Dingin': './images/milk.svg',
  'Minuman Panas': './images/coffee.svg',
  Pastry: './images/croissant.svg',
  'Bahan Umum': './images/syrup.svg',
};

/**
 * Gambar default untuk sebuah bahan: utamakan kecocokan `id`, lalu `kategori`.
 * @param {object} ingredient
 * @returns {string} path gambar default, atau '' bila tidak ada.
 */
export function defaultImageFor(ingredient) {
  if (!ingredient) return '';
  const byId = IMAGE_BY_ID[ingredient.id];
  if (byId) return byId;
  return IMAGE_BY_KATEGORI[ingredient.kategori] ?? '';
}

/**
 * Lengkapi `imageUrl` yang kosong dengan gambar default (berdasarkan id/kategori).
 * Data yang sudah punya `imageUrl` tidak diubah.
 * @param {Array} items
 * @returns {Array}
 */
export function withDefaultImages(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((it) => (it && !it.imageUrl ? { ...it, imageUrl: defaultImageFor(it) } : it));
}

export class ValidationError extends Error {
  /** @param {Record<string,string>} fields peta field -> pesan error */
  constructor(fields, message = 'Data tidak valid.') {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields || {};
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const toNumber = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
};

/**
 * Bersihkan URL/path gambar bahan (anti-XSS).
 * Hanya mengizinkan path relatif `./images/...` atau URL absolut `https://...`.
 * Menolak skema berbahaya seperti `javascript:` / `data:text/html`.
 * @param {unknown} value
 * @returns {string} URL aman, atau '' bila tidak diizinkan.
 */
export function sanitizeImageUrl(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (raw === '') return '';

  // Path relatif lokal: ./images/<file> (tanpa keluar folder / traversal).
  const relative = /^\.\/images\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
  if (relative.test(raw) && !raw.split('/').includes('..')) return raw;

  // URL absolut yang aman.
  if (/^https:\/\/[^\s"'<>]+$/i.test(raw)) return raw;

  return '';
}

/**
 * Normalisasi + validasi satu objek ingredient mentah.
 * @returns {{ id:string, nama:string, kategori:string, satuan:string,
 *   stokSaatIni:number, pemakaianDasar:number, tanggalKedaluwarsa:string,
 *   ikon:string, imageUrl:string }}
 */
export function validateIngredient(raw, opts = {}) {
  const fields = {};
  const label = opts.index != null ? `Baris ${opts.index + 1}: ` : '';

  if (!isPlainObject(raw)) {
    throw new ValidationError({ _: `${label}Data bahan harus berupa objek.` }, 'Struktur data bahan tidak valid.');
  }

  const nama = typeof raw.nama === 'string' ? raw.nama.trim() : '';
  if (nama.length < 1) fields.nama = `${label}Nama wajib diisi (minimal 1 karakter).`;

  const kategori = typeof raw.kategori === 'string' ? raw.kategori.trim() : '';
  if (!KATEGORI.includes(kategori)) {
    fields.kategori = `${label}Kategori harus salah satu dari: ${KATEGORI.join(', ')}.`;
  }

  const satuan = typeof raw.satuan === 'string' ? raw.satuan.trim() : '';
  if (satuan.length < 1) fields.satuan = `${label}Satuan wajib diisi (mis. ml, gram, pcs).`;

  const stokSaatIni = toNumber(raw.stokSaatIni);
  if (!Number.isFinite(stokSaatIni) || stokSaatIni < 0) {
    fields.stokSaatIni = `${label}Stok saat ini harus angka >= 0.`;
  }

  const pemakaianDasar = toNumber(raw.pemakaianDasar);
  if (!Number.isFinite(pemakaianDasar) || pemakaianDasar <= 0) {
    fields.pemakaianDasar = `${label}Pemakaian dasar harus angka > 0.`;
  }

  const tanggalKedaluwarsa = typeof raw.tanggalKedaluwarsa === 'string' ? raw.tanggalKedaluwarsa.trim() : '';
  if (!isValidISODate(tanggalKedaluwarsa)) {
    fields.tanggalKedaluwarsa = `${label}Tanggal kedaluwarsa harus format YYYY-MM-DD.`;
  }

  const ikon = typeof raw.ikon === 'string' && raw.ikon.trim() !== '' ? raw.ikon.trim() : '📦';
  const id = typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : '';
  // Opsional & aman: data lama tanpa imageUrl tetap valid (menjadi '').
  const imageUrl = sanitizeImageUrl(raw.imageUrl);

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields, 'Beberapa kolom bahan belum valid.');
  }

  return { id, nama, kategori, satuan, stokSaatIni, pemakaianDasar, tanggalKedaluwarsa, ikon, imageUrl };
}

/**
 * Validasi payload import: menerima array bahan, atau objek { ingredients: [...] }.
 * @returns {Array} daftar bahan tervalidasi
 */
export function validateImportPayload(payload) {
  const list = Array.isArray(payload)
    ? payload
    : isPlainObject(payload) && Array.isArray(payload.ingredients)
      ? payload.ingredients
      : null;

  if (!list) {
    throw new ValidationError(
      { _: 'Format tidak dikenali.' },
      'Format JSON tidak dikenali. Harapkan array bahan atau objek { "ingredients": [...] }.',
    );
  }
  if (list.length === 0) {
    throw new ValidationError({ _: 'Daftar kosong.' }, 'Daftar bahan pada file kosong.');
  }

  const out = [];
  const usedIds = new Set();
  list.forEach((raw, index) => {
    const item = validateIngredient(raw, { index });
    // Pastikan id unik; buat baru bila kosong/duplikat.
    if (!item.id || usedIds.has(item.id)) item.id = nextId(out);
    usedIds.add(item.id);
    out.push(item);
  });
  return out;
}

/**
 * Buat id bahan berikutnya dengan pola `ing-NN`.
 * @param {Array<{id?:string}>} existing
 */
export function nextId(existing = []) {
  let max = 0;
  for (const item of existing) {
    const m = String(item?.id ?? '').match(/^ing-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ing-${String(max + 1).padStart(2, '0')}`;
}

/* ================================================================== */
/* 3. Persistensi localStorage                                        */
/* ================================================================== */

/** Bungkus akses localStorage agar aman saat private mode / quota penuh. */
function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Kembalikan salinan data demo dengan tanggal kedaluwarsa relatif diresolusi. */
export function demoIngredients(today = new Date()) {
  return DEMO_INGREDIENTS.map((ing) => ({
    ...ing,
    tanggalKedaluwarsa: resolveRelativeDate(ing.tanggalKedaluwarsa, today),
  }));
}

/**
 * Muat bahan dari localStorage. Bila kosong / rusak / tidak valid -> data demo.
 * @returns {{ items:Array, source:'storage'|'demo', error?:string }}
 */
export function loadIngredients(today = new Date()) {
  const storage = safeStorage();
  if (!storage) return { items: demoIngredients(today), source: 'demo' };

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { items: demoIngredients(today), source: 'demo' };

  try {
    const parsed = JSON.parse(raw); // dibungkus try/catch sesuai spesifikasi
    const validated = validateImportPayload(parsed);
    // Data lama tanpa `imageUrl` otomatis dilengkapi gambar default (id/kategori).
    const items = withDefaultImages(validated);
    const backfilled = items.some((it, i) => it !== validated[i]);
    return { items, source: 'storage', backfilled };
  } catch (err) {
    const msg = err instanceof ValidationError ? err.message : 'bukan JSON valid / rusak.';
    return { items: demoIngredients(today), source: 'demo', error: msg };
  }
}

/**
 * Simpan bahan ke localStorage (divalidasi ulang sebelum menulis).
 * @returns {{ ok:boolean, error?:string }}
 */
export function saveIngredients(items) {
  const storage = safeStorage();
  if (!storage) return { ok: false, error: 'localStorage tidak tersedia pada browser ini.' };
  try {
    const clean = items.map((it) => validateIngredient(it));
    storage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return { ok: true };
  } catch (err) {
    const msg = err instanceof ValidationError ? err.message : 'Gagal menyimpan (penyimpanan penuh?).';
    return { ok: false, error: msg };
  }
}

/** Hapus data tersimpan (untuk Reset Data Demo). */
export function clearIngredients() {
  const storage = safeStorage();
  if (!storage) return { ok: false, error: 'localStorage tidak tersedia.' };
  try {
    storage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Gagal menghapus data.' };
  }
}

/** Serialisasi ke JSON rapi untuk fitur Export. */
export function serializeExport(items, today = new Date()) {
  return JSON.stringify(
    { app: 'TakarKopi', version: 1, exportedAt: new Date(today).toISOString(), ingredients: items },
    null,
    2,
  );
}

/**
 * Parse teks JSON dari fitur Import.
 * @returns {{ ok:true, items:Array } | { ok:false, error:string, fields?:object }}
 */
export function parseImport(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'File/konten JSON kosong.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON tidak valid (gagal di-parse).' };
  }
  try {
    return { ok: true, items: validateImportPayload(parsed) };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message, fields: err.fields };
    return { ok: false, error: 'Skema data tidak sesuai.' };
  }
}

/* ================================================================== */
/* 4. CRUD & stok                                                     */
/* ================================================================== */

/** Tambah bahan baru (divalidasi, gambar default otomatis bila kosong). */
export function addIngredient(items, values) {
  const base = validateIngredient({ ...values, id: values?.id || nextId(items) });
  const item = base.imageUrl ? base : { ...base, imageUrl: defaultImageFor(base) };
  return { items: [...items, item], item };
}

/** Perbarui bahan berdasarkan id (divalidasi, gambar default otomatis bila kosong). */
export function updateIngredient(items, id, values) {
  const base = validateIngredient({ ...values, id });
  const item = base.imageUrl ? base : { ...base, imageUrl: defaultImageFor(base) };
  return { items: items.map((it) => (it.id === id ? item : it)), item };
}

/** Hapus bahan berdasarkan id. */
export function removeIngredient(items, id) {
  const item = items.find((it) => it.id === id) ?? null;
  return { items: items.filter((it) => it.id !== id), item };
}

/** Langkah perubahan stok yang masuk akal per satuan (ml/gram -> 100, pcs -> 1, kg/liter -> 0,5). */
export function stockStep(ingredient) {
  const unit = String(ingredient?.satuan || '').toLowerCase();
  if (unit === 'pcs') return 1;
  if (unit === 'kg' || unit === 'liter' || unit === 'l') return 0.5;
  if (unit === 'ml' || unit === 'gram' || unit === 'g') return 100;
  return 1;
}

/**
 * Hitung nilai stok baru setelah penyesuaian, dibatasi >= 0.
 * @param {number} current
 * @param {number} direction +1 / -1
 * @param {number} step
 */
export function nextStockValue(current, direction, step) {
  const value = Number(current) + direction * step;
  return Math.max(0, Math.round(value * 100) / 100);
}
