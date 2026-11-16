/**
 * Unit test TakarKopi (Vitest).
 *
 * Fokus pengujian:
 *  - calculateDailyPrep : berbagai kombinasi cuaca (panas/berawan/hujan) & event (biasa/weekend/gajian/ujian)
 *  - getExpiryStatus    : batas H-2, H-0, dan tanggal yang sudah lewat
 *  - filterIngredients  : query, kategori, onlyShortage
 *  - validasi input negatif (nama, stok, pemakaian, kategori, tanggal)
 *  - parsing impor JSON rusak
 *
 * Jalankan: npm test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  calculateDailyPrep,
  getExpiryStatus,
  filterIngredients,
  normalizeWeatherId,
  normalizeEventId,
  computePrediction,
  expiryStatus,
  addDays,
} from '../src/predictor.js';

import {
  validateIngredient,
  parseImport,
  loadIngredients,
  demoIngredients,
  ValidationError,
  STORAGE_KEY,
  sanitizeImageUrl,
  defaultImageFor,
  withDefaultImages,
  IMAGE_BY_ID,
} from '../src/ingredients.js';

const TODAY = new Date(2026, 10, 16); // 16 Nov 2026

/** Baris bahan valid sebagai basis pengujian. */
const validRow = () => ({
  nama: 'Susu',
  kategori: 'Minuman Dingin',
  satuan: 'ml',
  stokSaatIni: 100,
  pemakaianDasar: 50,
  tanggalKedaluwarsa: '2026-12-01',
});

/** localStorage palsu untuk menguji jalur penyimpanan. */
function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ================================================================== */
/* 1. calculateDailyPrep                                              */
/* ================================================================== */

describe('calculateDailyPrep — kombinasi cuaca & event', () => {
  const susu = { nama: 'Susu', kategori: 'Minuman Dingin', satuan: 'ml', pemakaianDasar: 5000 };

  it('panas + weekend menaikkan minuman dingin (aditif)', () => {
    const r = calculateDailyPrep(susu, { weather: 'panas', eventDay: 'weekend' });
    // 5000 × (1 + 0.30 + 0.25) × 1 = 7750
    expect(r.jumlah).toBe(7750);
  });

  it('panas + hari biasa menaikkan +30% saja', () => {
    const r = calculateDailyPrep(susu, { weather: 'panas', eventDay: 'biasa' });
    expect(r.jumlah).toBe(6500); // 5000 × 1.30
  });

  it('berawan + hari biasa bersifat netral', () => {
    const r = calculateDailyPrep(susu, { weather: 'berawan', eventDay: 'biasa' });
    expect(r.jumlah).toBe(5000);
    expect(r.cuaca).toBe(0);
    expect(r.event).toBe(0);
  });

  it('hujan menurunkan minuman dingin (-20%)', () => {
    const r = calculateDailyPrep(susu, { weather: 'hujan', eventDay: 'biasa' });
    expect(r.jumlah).toBe(4000); // 5000 × 0.80
  });

  it('hujan menaikkan minuman panas (+30% lalu faktor kategori 0.9)', () => {
    const matcha = { kategori: 'Minuman Panas', satuan: 'gram', pemakaianDasar: 1000 };
    const r = calculateDailyPrep(matcha, { weather: 'hujan', eventDay: 'biasa' });
    expect(r.jumlah).toBe(1170); // 1000 × 1.30 × 0.9
    expect(r.kategoriFaktor).toBe(0.9);
  });

  it('istilah "gajian" dipetakan ke event payday', () => {
    const dingin = { kategori: 'Minuman Dingin', satuan: 'ml', pemakaianDasar: 1000 };
    const r = calculateDailyPrep(dingin, { weather: 'berawan', eventDay: 'gajian' });
    expect(r.eventId).toBe('payday');
    expect(r.jumlah).toBe(1200); // 1000 × (1 + 0.20)
  });

  it('hujan + musim ujian menaikkan minuman panas', () => {
    const matcha = { kategori: 'Minuman Panas', satuan: 'gram', pemakaianDasar: 1000 };
    const r = calculateDailyPrep(matcha, { weather: 'hujan', eventDay: 'ujian' });
    expect(r.jumlah).toBe(1395); // 1000 × (1 + 0.30 + 0.25) × 0.9
  });

  it('faktor karakteristik pastry ×0.8 diterapkan', () => {
    const croissant = { kategori: 'Pastry', satuan: 'pcs', pemakaianDasar: 24 };
    const r = calculateDailyPrep(croissant, { weather: 'berawan', eventDay: 'biasa' });
    expect(r.jumlah).toBe(19); // round(24 × 0.8)
  });

  it('hujan menurunkan pastry lebih jauh', () => {
    const croissant = { kategori: 'Pastry', satuan: 'pcs', pemakaianDasar: 24 };
    const r = calculateDailyPrep(croissant, { weather: 'hujan', eventDay: 'biasa' });
    expect(r.jumlah).toBe(17); // round(24 × 0.90 × 0.8)
  });

  it('menjaga minimal 1 unit untuk bahan berukuran sangat kecil', () => {
    const kecil = { kategori: 'Bahan Umum', satuan: 'gram', pemakaianDasar: 0.5 };
    const r = calculateDailyPrep(kecil, { weather: 'hujan', eventDay: 'biasa' });
    expect(r.jumlah).toBe(1); // round(0.375) = 0 -> dinaikkan ke 1
  });

  it('mengembalikan satuan dan teks penjelasan rumus', () => {
    const r = calculateDailyPrep(susu, { weather: 'panas', eventDay: 'weekend' });
    expect(r.satuan).toBe('ml');
    expect(r.penjelasan).toMatch(/Dasar 5\.000 ml/);
    expect(r.penjelasan).toMatch(/\+30%/);
    expect(r.penjelasan).toMatch(/\+25%/);
  });

  it('menormalkan istilah & fallback ke default untuk nilai tak dikenal', () => {
    expect(normalizeWeatherId('panas')).toBe('cerah');
    expect(normalizeWeatherId('hujan')).toBe('hujan');
    expect(normalizeWeatherId('entah')).toBe('cerah');
    expect(normalizeEventId('gajian')).toBe('payday');
    expect(normalizeEventId('weekend')).toBe('weekend');
    expect(normalizeEventId('entah')).toBe('weekend');
  });

  it('computePrediction tetap konsisten dengan calculateDailyPrep', () => {
    const viaBaru = calculateDailyPrep(susu, { weather: 'cerah', eventDay: 'weekend' });
    const viaLama = computePrediction(susu, 'cerah', 'weekend');
    expect(viaLama.kebutuhan).toBe(viaBaru.jumlah);
    expect(viaLama.alasan).toBe(viaBaru.penjelasan);
  });
});

/* ================================================================== */
/* 2. getExpiryStatus                                                 */
/* ================================================================== */

describe('getExpiryStatus — batas H-2, H-0, dan lewat tanggal', () => {
  it('H-2 (batas atas peringatan) → peringatan', () => {
    expect(getExpiryStatus(addDays(TODAY, 2), TODAY).status).toBe('peringatan');
  });

  it('H-1 → peringatan', () => {
    expect(getExpiryStatus(addDays(TODAY, 1), TODAY).status).toBe('peringatan');
  });

  it('H-0 (kedaluwarsa hari ini) → peringatan dengan label khusus', () => {
    const s = getExpiryStatus(addDays(TODAY, 0), TODAY);
    expect(s.status).toBe('peringatan');
    expect(s.hari).toBe(0);
    expect(s.label).toBe('⚠️ Peringatan · kedaluwarsa hari ini');
  });

  it('H-3 (di luar ambang) → aman', () => {
    expect(getExpiryStatus(addDays(TODAY, 3), TODAY).status).toBe('aman');
  });

  it('H-6 → aman', () => {
    expect(getExpiryStatus(addDays(TODAY, 6), TODAY).status).toBe('aman');
  });

  it('tanggal yang sudah lewat → kedaluwarsa', () => {
    const s = getExpiryStatus(addDays(TODAY, -1), TODAY);
    expect(s.status).toBe('kedaluwarsa');
    expect(s.hari).toBe(-1);
  });

  it('tanpa tanggal → aman dengan keterangan kosong', () => {
    expect(getExpiryStatus('', TODAY).status).toBe('aman');
    expect(getExpiryStatus('', TODAY).label).toBe('Tanpa tanggal');
  });

  it('menghormati parameter referenceDate', () => {
    // Relatif ke 10 Nov 2026, tanggal 18 Nov 2026 berjarak 8 hari -> aman
    expect(getExpiryStatus('2026-11-18', new Date(2026, 10, 10)).status).toBe('aman');
    // Relatif ke 16 Nov 2026 berjarak 2 hari -> peringatan
    expect(getExpiryStatus('2026-11-18', TODAY).status).toBe('peringatan');
  });

  it('expiryStatus (label UI) tetap 4 tingkat di atas getExpiryStatus', () => {
    expect(expiryStatus(addDays(TODAY, 2), TODAY).level).toBe('kritis');
    expect(expiryStatus(addDays(TODAY, 4), TODAY).level).toBe('perhatian');
    expect(expiryStatus(addDays(TODAY, 6), TODAY).level).toBe('aman');
    expect(expiryStatus(addDays(TODAY, -1), TODAY).level).toBe('lewat');
  });
});

/* ================================================================== */
/* 3. filterIngredients                                               */
/* ================================================================== */

describe('filterIngredients — query, kategori, onlyShortage', () => {
  const items = [
    { id: 'a', nama: 'Susu Fresh Milk', kategori: 'Minuman Dingin', ikon: '🥛', stokSaatIni: 100, pemakaianDasar: 5000 },
    { id: 'b', nama: 'Croissant Butter', kategori: 'Pastry', ikon: '🥐', stokSaatIni: 50, pemakaianDasar: 24 },
    { id: 'c', nama: 'Matcha Powder', kategori: 'Minuman Panas', ikon: '🍵', stokSaatIni: 1500, pemakaianDasar: 800 },
  ];

  it('tanpa opsi mengembalikan seluruh bahan', () => {
    expect(filterIngredients(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('menyaring berdasarkan kategori', () => {
    expect(filterIngredients(items, { kategori: 'Pastry' }).map((i) => i.id)).toEqual(['b']);
  });

  it('kategori "all"/"semua"/kosong tidak menyaring', () => {
    expect(filterIngredients(items, { kategori: 'all' })).toHaveLength(3);
    expect(filterIngredients(items, { kategori: 'semua' })).toHaveLength(3);
    expect(filterIngredients(items, { kategori: '' })).toHaveLength(3);
  });

  it('query tidak peka huruf besar/kecil pada nama & kategori', () => {
    expect(filterIngredients(items, { query: 'MINUMAN' }).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterIngredients(items, { query: 'matcha' }).map((i) => i.id)).toEqual(['c']);
  });

  it('query juga mencocokkan ikon emoji', () => {
    expect(filterIngredients(items, { query: '🥐' }).map((i) => i.id)).toEqual(['b']);
  });

  it('onlyShortage hanya menyisakan stok < pemakaian dasar', () => {
    expect(filterIngredients(items, { onlyShortage: true }).map((i) => i.id)).toEqual(['a']);
  });

  it('kombinasi kategori + onlyShortage', () => {
    expect(filterIngredients(items, { kategori: 'Minuman Panas', onlyShortage: true })).toEqual([]);
  });

  it('query tanpa hasil mengembalikan array kosong', () => {
    expect(filterIngredients(items, { query: 'tidak-ada' })).toEqual([]);
  });

  it('input bukan array ditangani aman', () => {
    expect(filterIngredients(null)).toEqual([]);
    expect(filterIngredients(undefined, { query: 'x' })).toEqual([]);
  });
});

/* ================================================================== */
/* 4. Validasi input negatif                                          */
/* ================================================================== */

describe('validasi input negatif (validateIngredient)', () => {
  it('objek kosong → error untuk semua field wajib', () => {
    let err;
    try {
      validateIngredient({});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys(err.fields).sort()).toEqual(
      ['kategori', 'nama', 'pemakaianDasar', 'satuan', 'stokSaatIni', 'tanggalKedaluwarsa'].sort(),
    );
  });

  it('stokSaatIni negatif ditolak', () => {
    let err;
    try {
      validateIngredient({ ...validRow(), stokSaatIni: -1 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields.stokSaatIni).toMatch(/>= 0/);
  });

  it('pemakaianDasar 0 atau negatif ditolak', () => {
    let err;
    try {
      validateIngredient({ ...validRow(), pemakaianDasar: 0 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields.pemakaianDasar).toMatch(/> 0/);
    expect(() => validateIngredient({ ...validRow(), pemakaianDasar: -5 })).toThrow(ValidationError);
  });

  it('kategori tidak dikenal ditolak', () => {
    let err;
    try {
      validateIngredient({ ...validRow(), kategori: 'Teh Herbal' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields.kategori).toMatch(/Kategori harus salah satu/);
  });

  it('tanggal kedaluwarsa tidak valid ditolak', () => {
    for (const bad of ['2026-02-30', '16-11-2026', '2026-13-40', '']) {
      let err;
      try {
        validateIngredient({ ...validRow(), tanggalKedaluwarsa: bad });
      } catch (e) {
        err = e;
      }
      expect(err, `tanggal "${bad}" harus ditolak`).toBeInstanceOf(ValidationError);
      expect(err.fields.tanggalKedaluwarsa).toMatch(/YYYY-MM-DD/);
    }
  });

  it('data valid dinormalisasi (string→angka, trim nama, ikon default)', () => {
    const clean = validateIngredient({
      nama: '  Matcha  ',
      kategori: 'Minuman Panas',
      satuan: 'gram',
      stokSaatIni: '1500',
      pemakaianDasar: '800',
      tanggalKedaluwarsa: '2026-12-01',
    });
    expect(clean.nama).toBe('Matcha');
    expect(clean.stokSaatIni).toBe(1500);
    expect(clean.pemakaianDasar).toBe(800);
    expect(clean.ikon).toBe('📦');
  });

  it('stokSaatIni = 0 diterima (batas bawah inklusif)', () => {
    const clean = validateIngredient({ ...validRow(), stokSaatIni: '0' });
    expect(clean.stokSaatIni).toBe(0);
  });
});

/* ================================================================== */
/* 5. Parsing impor JSON rusak                                        */
/* ================================================================== */

describe('parsing impor JSON rusak (parseImport & loadIngredients)', () => {
  it('JSON rusak ditolak dengan pesan parse', () => {
    const r = parseImport('{bukan json');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parse/i);
  });

  it('konten kosong / hanya spasi ditolak', () => {
    expect(parseImport('').ok).toBe(false);
    expect(parseImport('   ').ok).toBe(false);
  });

  it('JSON valid tapi skema tidak dikenali ditolak', () => {
    expect(parseImport('{"a":1}').ok).toBe(false);
  });

  it('daftar kosong ditolak', () => {
    expect(parseImport('[]').ok).toBe(false);
  });

  it('array bahan valid diterima', () => {
    const r = parseImport(JSON.stringify([validRow()]));
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(1);
  });

  it('satu baris invalid membatalkan seluruh impor (data lama aman)', () => {
    const r = parseImport(JSON.stringify([validRow(), { nama: '' }]));
    expect(r.ok).toBe(false);
    expect(r.items).toBeUndefined();
  });

  it('loadIngredients: localStorage rusak → fallback data demo + error', () => {
    vi.stubGlobal('localStorage', makeStorage({ [STORAGE_KEY]: '{rusak json' }));
    const res = loadIngredients(TODAY);
    expect(res.source).toBe('demo');
    expect(res.items).toHaveLength(8);
    expect(res.error).toBeTruthy();
  });

  it('loadIngredients: payload valid dimuat dari storage', () => {
    vi.stubGlobal(
      'localStorage',
      makeStorage({ [STORAGE_KEY]: JSON.stringify({ ingredients: [{ ...validRow(), id: 'ing-01' }] }) }),
    );
    const res = loadIngredients(TODAY);
    expect(res.source).toBe('storage');
    expect(res.items).toHaveLength(1);
  });

  it('kunci penyimpanan sesuai spesifikasi', () => {
    expect(STORAGE_KEY).toBe('takarkopi:ingredients:v1');
  });

  it('data demo berisi 8 bahan dengan tanggal teresolusi', () => {
    const demo = demoIngredients(TODAY);
    expect(demo).toHaveLength(8);
    expect(demo.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.tanggalKedaluwarsa))).toBe(true);
  });
});

/* ================================================================== */
/* 6. Keamanan URL/path gambar bahan                                  */
/* ================================================================== */

describe('sanitizeImageUrl — hanya path ./images/... atau https://', () => {
  it('mengizinkan path relatif lokal ./images/...', () => {
    expect(sanitizeImageUrl('./images/milk.svg')).toBe('./images/milk.svg');
    expect(sanitizeImageUrl('./images/sub/aren.svg')).toBe('./images/sub/aren.svg');
  });

  it('mengizinkan URL absolut https://', () => {
    const url = 'https://example.com/foto.png';
    expect(sanitizeImageUrl(url)).toBe(url);
  });

  it('menolak javascript: dan data:text/html', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeImageUrl('JaVaScRiPt:alert(1)')).toBe('');
  });

  it('menolak path http:// tidak aman, file lokal, dan traversal', () => {
    expect(sanitizeImageUrl('http://example.com/x.png')).toBe('');
    expect(sanitizeImageUrl('images/milk.svg')).toBe('');
    expect(sanitizeImageUrl('/etc/passwd')).toBe('');
    expect(sanitizeImageUrl('./images/../../secret.svg')).toBe('');
  });

  it('nilai kosong / bukan string dikembalikan sebagai string kosong', () => {
    expect(sanitizeImageUrl('')).toBe('');
    expect(sanitizeImageUrl('   ')).toBe('');
    expect(sanitizeImageUrl(null)).toBe('');
    expect(sanitizeImageUrl(undefined)).toBe('');
    expect(sanitizeImageUrl(42)).toBe('');
  });

  it('validateIngredient menjaga kompatibilitas: imageUrl opsional & tersanitasi', () => {
    // Data lama tanpa imageUrl tetap valid -> ''.
    expect(validateIngredient(validRow()).imageUrl).toBe('');
    // imageUrl berbahaya dibersihkan tanpa menggagalkan validasi.
    const evil = validateIngredient({ ...validRow(), imageUrl: 'javascript:alert(1)' });
    expect(evil.imageUrl).toBe('');
    // imageUrl aman dipertahankan.
    const ok = validateIngredient({ ...validRow(), imageUrl: './images/matcha.svg' });
    expect(ok.imageUrl).toBe('./images/matcha.svg');
  });

  it('data demo memakai 8 path gambar ./images/... yang berbeda', () => {
    const demo = demoIngredients(TODAY);
    const urls = demo.map((d) => d.imageUrl);
    expect(urls.every((u) => sanitizeImageUrl(u) === u)).toBe(true);
    expect(new Set(urls).size).toBe(8);
  });
});

/* ================================================================== */
/* 7. Gambar default bahan & backfill data lama                       */
/* ================================================================== */

describe('gambar default bahan (defaultImageFor & withDefaultImages)', () => {
  it('memetakan 8 id demo ke path ./images/... yang benar', () => {
    expect(Object.keys(IMAGE_BY_ID)).toHaveLength(8);
    expect(defaultImageFor({ id: 'ing-01' })).toBe('./images/milk.svg');
    expect(defaultImageFor({ id: 'ing-04' })).toBe('./images/ice.svg');
    expect(defaultImageFor({ id: 'ing-08' })).toBe('./images/matcha.svg');
  });

  it('fallback ke kategori bila id tidak dikenal', () => {
    expect(defaultImageFor({ id: 'x', kategori: 'Pastry' })).toBe('./images/croissant.svg');
    expect(defaultImageFor({ id: 'x', kategori: 'Minuman Panas' })).toBe('./images/coffee.svg');
    expect(defaultImageFor({ id: 'x', kategori: 'Bahan Umum' })).toBe('./images/syrup.svg');
  });

  it('mengembalikan string kosong untuk input tak dikenal', () => {
    expect(defaultImageFor({})).toBe('');
    expect(defaultImageFor(null)).toBe('');
    expect(defaultImageFor({ kategori: 'Entah' })).toBe('');
  });

  it('withDefaultImages hanya melengkapi yang masih kosong', () => {
    const items = withDefaultImages([
      { id: 'ing-03', kategori: 'Bahan Umum', imageUrl: '' },
      { id: 'ing-06', kategori: 'Pastry', imageUrl: 'https://example.com/x.png' },
    ]);
    expect(items[0].imageUrl).toBe('./images/syrup.svg');
    expect(items[1].imageUrl).toBe('https://example.com/x.png');
  });

  it('loadIngredients melengkapi data lama tanpa imageUrl dari localStorage', () => {
    vi.stubGlobal(
      'localStorage',
      makeStorage({ [STORAGE_KEY]: JSON.stringify([{ ...validRow(), id: 'ing-05' }]) }),
    );
    const res = loadIngredients(TODAY);
    expect(res.source).toBe('storage');
    expect(res.items[0].imageUrl).toBe('./images/coffee.svg');
  });
});
