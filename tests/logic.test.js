/**
 * Uji logika inti TakarKopi (tanpa DOM) — dijalankan dengan Vitest.
 * Menggunakan `node:assert/strict` di dalam test Vitest.
 *
 * Jalankan: npm test
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  computePrediction,
  calculateDailyPrep,
  getExpiryStatus,
  filterIngredients,
  sortIngredients,
  normalizeWeatherId,
  normalizeEventId,
  expiryStatus,
  buildChecklist,
  sortChecklist,
  filterChecklist,
  daysUntil,
  resolveRelativeDate,
  isValidISODate,
  toISODate,
  addDays,
  isValidWhatsAppNumber,
  buildWhatsAppUrl,
} from '../src/predictor.js';
import {
  validateIngredient,
  validateImportPayload,
  ValidationError,
  nextId,
  parseImport,
  demoIngredients,
  serializeExport,
  SUPPLIER_WHATSAPP_NUMBER,
} from '../src/ingredients.js';

const TODAY = new Date(2026, 10, 16); // 16 Nov 2026

/* ----------------------------- prediksi ----------------------------- */

test('prediksi: panas + weekend menaikkan minuman dingin secara aditif', () => {
  const susu = { nama: 'Susu', kategori: 'Minuman Dingin', satuan: 'ml', pemakaianDasar: 5000 };
  const p = computePrediction(susu, 'cerah', 'weekend');
  // 5000 × (1 + 0.30 + 0.25) × faktor kategori 1 = 7750
  assert.equal(p.kebutuhan, Math.round(5000 * 1.55));
  assert.equal(p.kebutuhan, 7750);
  assert.match(p.alasan, /Dasar 5\.000 ml/);
  assert.match(p.alasan, /\+30%/);
  assert.match(p.alasan, /\+25%/);
});

test('prediksi: hujan menurunkan minuman dingin & menaikkan minuman panas', () => {
  const dingin = { kategori: 'Minuman Dingin', satuan: 'ml', pemakaianDasar: 1000 };
  const panas = { kategori: 'Minuman Panas', satuan: 'gram', pemakaianDasar: 1000 };
  const pd = computePrediction(dingin, 'hujan', 'biasa');
  const pp = computePrediction(panas, 'hujan', 'biasa');
  assert.ok(pd.kebutuhan < 1000, 'minuman dingin turun saat hujan');
  assert.ok(pp.kebutuhan > 1000, 'minuman panas naik saat hujan');
});

test('prediksi: faktor karakter bahan diterapkan (pastry ×0.8)', () => {
  const croissant = { kategori: 'Pastry', satuan: 'pcs', pemakaianDasar: 24 };
  const p = computePrediction(croissant, 'berawan', 'biasa');
  assert.equal(p.kebutuhan, Math.round(24 * 0.8));
  assert.match(p.alasan, /Faktor Pastry/);
});

test('prediksi: minimal 1 unit untuk bahan dengan dasar kecil', () => {
  const kecil = { kategori: 'Bahan Umum', satuan: 'gram', pemakaianDasar: 1 };
  const p = computePrediction(kecil, 'hujan', 'biasa');
  assert.ok(p.kebutuhan >= 1);
});

/* ----------------------------- kedaluwarsa ----------------------------- */

test('expiry: label kritis/perhatian/aman/lewat', () => {
  assert.equal(expiryStatus(addDays(TODAY, 0), TODAY).level, 'kritis');
  assert.equal(expiryStatus(addDays(TODAY, 2), TODAY).level, 'kritis');
  assert.equal(expiryStatus(addDays(TODAY, 3), TODAY).level, 'perhatian');
  assert.equal(expiryStatus(addDays(TODAY, 5), TODAY).level, 'perhatian');
  assert.equal(expiryStatus(addDays(TODAY, 6), TODAY).level, 'aman');
  assert.equal(expiryStatus(addDays(TODAY, -1), TODAY).level, 'lewat');
});

test('expiry: label memakai gaya H-N dan menandai kondisi khusus', () => {
  assert.equal(expiryStatus(addDays(TODAY, 0), TODAY).label, '🚨 Kritis · hari ini');
  assert.equal(expiryStatus(addDays(TODAY, 1), TODAY).label, '🚨 Kritis · H-1');
  assert.equal(expiryStatus(addDays(TODAY, 4), TODAY).label, '⚠️ Perhatian · H-4');
  assert.equal(expiryStatus(addDays(TODAY, 20), TODAY).label, '✅ Aman · H-20');
  assert.equal(expiryStatus(addDays(TODAY, -3), TODAY).label, '⛔ Lewat 3 hari');
});

/* ------------------- API baru: calculateDailyPrep ------------------- */

test('calculateDailyPrep: menerima istilah cuaca/event & mengembalikan penjelasan rumus', () => {
  const susu = { nama: 'Susu', kategori: 'Minuman Dingin', satuan: 'ml', pemakaianDasar: 5000 };
  const r = calculateDailyPrep(susu, { weather: 'panas', eventDay: 'weekend' });
  // 5000 × (1 + 0.30 + 0.25) × 1 = 7750
  assert.equal(r.jumlah, 7750);
  assert.equal(r.satuan, 'ml');
  assert.equal(r.weatherId, 'cerah');
  assert.equal(r.eventId, 'weekend');
  assert.match(r.penjelasan, /Dasar 5\.000 ml/);
  assert.match(r.penjelasan, /\+30%/);
  assert.match(r.penjelasan, /\+25%/);
});

test('calculateDailyPrep: alias gajian->payday & fallback default', () => {
  const bahan = { kategori: 'Pastry', satuan: 'pcs', pemakaianDasar: 24 };
  assert.equal(normalizeWeatherId('panas'), 'cerah');
  assert.equal(normalizeEventId('gajian'), 'payday');
  assert.equal(normalizeWeatherId('entah'), 'cerah');
  assert.equal(normalizeEventId('entah'), 'weekend');
  const r = calculateDailyPrep(bahan, { weather: 'berawan', eventDay: 'biasa' });
  assert.equal(r.jumlah, Math.round(24 * 0.8));
});

/* -------------------- API baru: getExpiryStatus -------------------- */

test('getExpiryStatus: aman / peringatan (<=2 hari) / kedaluwarsa', () => {
  assert.equal(getExpiryStatus(addDays(TODAY, 6), TODAY).status, 'aman');
  assert.equal(getExpiryStatus(addDays(TODAY, 3), TODAY).status, 'aman');
  assert.equal(getExpiryStatus(addDays(TODAY, 2), TODAY).status, 'peringatan');
  assert.equal(getExpiryStatus(addDays(TODAY, 0), TODAY).status, 'peringatan');
  assert.equal(getExpiryStatus(addDays(TODAY, -1), TODAY).status, 'kedaluwarsa');
  assert.equal(getExpiryStatus('', TODAY).status, 'aman');
});

/* ------------------- API baru: filterIngredients ------------------- */

test('filterIngredients: query, kategori, dan onlyShortage', () => {
  const items = [
    { id: 'a', nama: 'Susu Fresh Milk', kategori: 'Minuman Dingin', ikon: '🥛', stokSaatIni: 100, pemakaianDasar: 5000 },
    { id: 'b', nama: 'Croissant Butter', kategori: 'Pastry', ikon: '🥐', stokSaatIni: 50, pemakaianDasar: 24 },
    { id: 'c', nama: 'Matcha Powder', kategori: 'Minuman Panas', ikon: '🍵', stokSaatIni: 1500, pemakaianDasar: 800 },
  ];

  assert.equal(filterIngredients(items).length, 3);
  assert.deepEqual(filterIngredients(items, { kategori: 'Pastry' }).map((i) => i.id), ['b']);
  assert.deepEqual(filterIngredients(items, { kategori: 'all' }).map((i) => i.id), ['a', 'b', 'c']);
  assert.deepEqual(filterIngredients(items, { query: 'MINUMAN' }).map((i) => i.id), ['a', 'c']);
  assert.deepEqual(filterIngredients(items, { query: 'matcha' }).map((i) => i.id), ['c']);
  assert.deepEqual(filterIngredients(items, { onlyShortage: true }).map((i) => i.id), ['a']);
  assert.deepEqual(
    filterIngredients(items, { kategori: 'Minuman Panas', onlyShortage: true }).map((i) => i.id),
    [],
  );
  assert.equal(filterIngredients(items, { query: 'tidak-ada' }).length, 0);
});

test('filterIngredients: mendukung sort "fifo", "shortage", dan "name-asc"', () => {
  const list = [
    { id: '1', nama: 'Z-Susu', tanggalKedaluwarsa: '2026-11-20', stokSaatIni: 100, pemakaianDasar: 500 },
    { id: '2', nama: 'A-Kopi', tanggalKedaluwarsa: '2026-11-17', stokSaatIni: 200, pemakaianDasar: 300 },
    { id: '3', nama: 'M-Sirup', tanggalKedaluwarsa: '2026-11-25', stokSaatIni: 50, pemakaianDasar: 950 },
  ];

  // Default fifo -> ED terdekat dulu: 2 (17 Nov), 1 (20 Nov), 3 (25 Nov)
  assert.deepEqual(filterIngredients(list).map((x) => x.id), ['2', '1', '3']);
  assert.deepEqual(filterIngredients(list, { sort: 'fifo' }).map((x) => x.id), ['2', '1', '3']);

  // shortage -> kekurangan terbanyak dulu: 3 (kurang 900), 1 (kurang 400), 2 (kurang 100)
  assert.deepEqual(filterIngredients(list, { sort: 'shortage' }).map((x) => x.id), ['3', '1', '2']);

  // name-asc -> A-Z: 2 (A-Kopi), 3 (M-Sirup), 1 (Z-Susu)
  assert.deepEqual(filterIngredients(list, { sort: 'name-asc' }).map((x) => x.id), ['2', '3', '1']);
});

test('WhatsApp Restock: konstanta SUPPLIER_WHATSAPP_NUMBER dan buildWhatsAppUrl', () => {
  assert.equal(SUPPLIER_WHATSAPP_NUMBER, '6281234567890');
  assert.equal(isValidWhatsAppNumber(SUPPLIER_WHATSAPP_NUMBER), true);

  const item = { nama: 'Espresso Blend', satuan: 'gram' };
  const url = buildWhatsAppUrl(SUPPLIER_WHATSAPP_NUMBER, item, 1500);
  assert.ok(url.startsWith('https://wa.me/6281234567890?text='));
  assert.ok(url.includes(encodeURIComponent('Espresso Blend')));
  assert.ok(url.includes(encodeURIComponent('1.500 gram')));

  // Nomor tidak valid
  assert.equal(buildWhatsAppUrl('081234567890', item, 100), '');
  assert.equal(buildWhatsAppUrl('+6281234567890', item, 100), '');
  assert.equal(buildWhatsAppUrl('abc', item, 100), '');
  assert.equal(buildWhatsAppUrl('', item, 100), '');
});

/* ----------------------------- checklist ----------------------------- */

test('checklist: menandai kekurangan stok & menghitung statistik', () => {
  const items = [
    // stok kurang: butuh 7750, stok 5000
    { id: 'a', nama: 'Susu', kategori: 'Minuman Dingin', satuan: 'ml', stokSaatIni: 5000, pemakaianDasar: 5000, tanggalKedaluwarsa: addDays(TODAY, 10), ikon: '🥛' },
    // stok cukup
    { id: 'b', nama: 'Syrup', kategori: 'Bahan Umum', satuan: 'ml', stokSaatIni: 99999, pemakaianDasar: 100, tanggalKedaluwarsa: addDays(TODAY, 30), ikon: '🍯' },
    // kritis
    { id: 'c', nama: 'Croissant', kategori: 'Pastry', satuan: 'pcs', stokSaatIni: 100, pemakaianDasar: 10, tanggalKedaluwarsa: addDays(TODAY, 1), ikon: '🥐' },
  ];
  const { items: rows, stats } = buildChecklist(items, 'cerah', 'weekend', TODAY);
  assert.equal(stats.totalJenis, 3);
  assert.equal(stats.perluBelanja, 1);
  assert.equal(stats.mendekatiKedaluwarsa, 1);
  assert.equal(rows[0].ingredient.id, 'c', 'item kritis diurutkan lebih dulu');
  const susu = rows.find((r) => r.ingredient.id === 'a');
  assert.equal(susu.cukup, false);
  assert.equal(susu.kekurangan, 7750 - 5000);
});

test('checklist: sortChecklist menaruh item kritis lalu kekurangan besar', () => {
  const mk = (id, level, cukup, kekurangan) => ({
    ingredient: { id, nama: id },
    expiry: { level },
    cukup,
    kekurangan,
  });
  const sorted = sortChecklist([
    mk('aman-cukup', 'aman', true, 0),
    mk('kritis', 'kritis', true, 0),
    mk('aman-kurang-besar', 'aman', false, 100),
    mk('aman-kurang-kecil', 'aman', false, 10),
  ]);
  assert.deepEqual(
    sorted.map((s) => s.ingredient.id),
    ['kritis', 'aman-kurang-besar', 'aman-kurang-kecil', 'aman-cukup'],
  );
});

test('filterChecklist: menyaring berdasarkan status, kategori, dan kata kunci', () => {
  const rows = [
    { ingredient: { id: 'a', nama: 'Susu Fresh Milk', kategori: 'Minuman Dingin', ikon: '🥛' }, expiry: { level: 'kritis' }, cukup: false },
    { ingredient: { id: 'b', nama: 'Croissant Butter', kategori: 'Pastry', ikon: '🥐' }, expiry: { level: 'aman' }, cukup: true },
    { ingredient: { id: 'c', nama: 'Matcha Powder', kategori: 'Minuman Panas', ikon: '🍵' }, expiry: { level: 'perhatian' }, cukup: true },
  ];

  assert.equal(filterChecklist(rows, { filter: 'all' }).length, 3);
  assert.deepEqual(filterChecklist(rows, { filter: 'kurang' }).map((r) => r.ingredient.id), ['a']);
  assert.deepEqual(filterChecklist(rows, { filter: 'kritis' }).map((r) => r.ingredient.id), ['a']);
  assert.deepEqual(filterChecklist(rows, { filter: 'kedaluwarsa' }).map((r) => r.ingredient.id), ['a', 'c']);
  assert.deepEqual(filterChecklist(rows, { filter: 'Pastry' }).map((r) => r.ingredient.id), ['b']);
  assert.deepEqual(filterChecklist(rows, { query: 'matcha' }).map((r) => r.ingredient.id), ['c']);
  assert.deepEqual(filterChecklist(rows, { query: 'MINUMAN' }).map((r) => r.ingredient.id), ['a', 'c']);
  assert.equal(filterChecklist(rows, { query: 'tidak-ada' }).length, 0);
});

/* ----------------------------- validasi ----------------------------- */

test('validate: menolak data tidak lengkap dengan pesan per field', () => {
  assert.throws(
    () => validateIngredient({ nama: '  ', kategori: 'Salah', satuan: '', stokSaatIni: -1, pemakaianDasar: 0, tanggalKedaluwarsa: '2026-13-40' }),
    (err) => {
      assert.ok(err instanceof ValidationError);
      for (const f of ['nama', 'kategori', 'satuan', 'stokSaatIni', 'pemakaianDasar', 'tanggalKedaluwarsa']) {
        assert.ok(err.fields[f], `field ${f} harus error`);
      }
      return true;
    },
  );
});

test('validate: menerima & menormalkan data valid (angka dari string)', () => {
  const clean = validateIngredient({
    id: 'ing-99',
    nama: '  Matcha  ',
    kategori: 'Minuman Panas',
    satuan: 'gram',
    stokSaatIni: '1500',
    pemakaianDasar: '800',
    tanggalKedaluwarsa: '2026-12-01',
    ikon: '🍵',
  });
  assert.equal(clean.nama, 'Matcha');
  assert.equal(clean.stokSaatIni, 1500);
  assert.equal(clean.pemakaianDasar, 800);
});

test('validate: import payload menerima array & objek, menolak bentuk lain', () => {
  const row = { nama: 'X', kategori: 'Pastry', satuan: 'pcs', stokSaatIni: 1, pemakaianDasar: 1, tanggalKedaluwarsa: '2026-12-01' };
  assert.equal(validateImportPayload([row]).length, 1);
  assert.equal(validateImportPayload({ ingredients: [row] }).length, 1);
  assert.throws(() => validateImportPayload({ nope: true }), ValidationError);
  assert.throws(() => validateImportPayload([]), ValidationError);
});

test('nextId: menghasilkan id berurutan', () => {
  assert.equal(nextId([]), 'ing-01');
  assert.equal(nextId([{ id: 'ing-01' }, { id: 'ing-07' }]), 'ing-08');
});

/* ----------------------------- import/export ----------------------------- */

test('parseImport: menolak JSON rusak & skema salah, menerima yang valid', () => {
  assert.equal(parseImport('{bukan json').ok, false);
  assert.equal(parseImport('{"a":1}').ok, false);
  const ok = parseImport(JSON.stringify({ ingredients: [{ nama: 'A', kategori: 'Bahan Umum', satuan: 'ml', stokSaatIni: 0, pemakaianDasar: 5, tanggalKedaluwarsa: '2026-12-01' }] }));
  assert.equal(ok.ok, true);
  assert.equal(ok.items.length, 1);
});

test('data demo: 8 bahan dengan tanggal kedaluwarsa teresolusi', () => {
  const demo = demoIngredients(TODAY);
  assert.equal(demo.length, 8);
  assert.ok(demo.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.tanggalKedaluwarsa)));
  const susu = demo.find((d) => d.id === 'ing-01');
  assert.equal(susu.tanggalKedaluwarsa, toISODate(addDays(TODAY, 2)));
});

test('export -> import round-trip mempertahankan seluruh bahan', () => {
  const demo = demoIngredients(TODAY);
  const json = serializeExport(demo, TODAY);
  const parsed = JSON.parse(json);
  assert.equal(parsed.app, 'TakarKopi');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.ingredients.length, 8);

  const back = parseImport(json);
  assert.equal(back.ok, true);
  assert.deepEqual(back.items, demo);
});

/* ----------------------------- tanggal ----------------------------- */

test('tanggal: daysUntil, resolveRelativeDate, isValidISODate', () => {
  assert.equal(daysUntil('2026-11-18', TODAY), 2);
  assert.equal(daysUntil('2026-11-15', TODAY), -1);
  assert.equal(resolveRelativeDate('@+3', TODAY), '2026-11-19');
  assert.equal(resolveRelativeDate('2026-01-01', TODAY), '2026-01-01');
  assert.equal(isValidISODate('2026-11-16'), true);
  assert.equal(isValidISODate('2026-02-30'), false);
  assert.equal(isValidISODate('16-11-2026'), false);
});
