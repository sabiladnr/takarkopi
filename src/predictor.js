/**
 * predictor.js — "otak" TakarKopi.
 *
 * Berisi:
 *  - Skenario cuaca & kalender (pemicu eksternal) + faktor karakteristik bahan.
 *  - Util tanggal (untuk perhitungan kedaluwarsa / FIFO).
 *  - Mesin prediksi prep, label kedaluwarsa, dan penyaringan checklist.
 *
 * Model prediksi (aditif & transparan):
 *   prep = round( pemakaianDasar × (1 + adjustCuaca + adjustKalender) × faktorKarakteristik )
 *
 * Modul ini murni logika (tanpa DOM) agar mudah diuji.
 */

/* ================================================================== */
/* 1. Konstanta skenario                                              */
/* ================================================================== */

/**
 * Skenario cuaca. `adjust` = penambahan rasio (aditif) per kategori.
 * Contoh: 0.30 = +30%.
 */
export const WEATHER = {
  cerah: {
    id: 'cerah',
    label: 'Cerah / Panas',
    emoji: '☀️',
    short: 'Panas',
    adjust: { 'Minuman Dingin': 0.3, 'Minuman Panas': -0.15, Pastry: 0, 'Bahan Umum': 0 },
  },
  berawan: {
    id: 'berawan',
    label: 'Berawan',
    emoji: '⛅',
    short: 'Berawan',
    adjust: { 'Minuman Dingin': 0, 'Minuman Panas': 0, Pastry: 0, 'Bahan Umum': 0 },
  },
  hujan: {
    id: 'hujan',
    label: 'Hujan',
    emoji: '🌧️',
    short: 'Hujan',
    adjust: { 'Minuman Dingin': -0.2, 'Minuman Panas': 0.3, Pastry: -0.1, 'Bahan Umum': 0 },
  },
};

/** Skenario kalender / event lokal. */
export const CALENDAR = {
  biasa: {
    id: 'biasa',
    label: 'Hari Biasa',
    emoji: '📅',
    short: 'Hari Biasa',
    adjust: { 'Minuman Dingin': 0, 'Minuman Panas': 0, Pastry: 0, 'Bahan Umum': 0 },
  },
  weekend: {
    id: 'weekend',
    label: 'Akhir Pekan (Weekend)',
    emoji: '🎉',
    short: 'Weekend',
    adjust: { 'Minuman Dingin': 0.25, 'Minuman Panas': 0.15, Pastry: 0.3, 'Bahan Umum': 0.1 },
  },
  payday: {
    id: 'payday',
    label: 'Tanggal Gajian (Payday)',
    emoji: '💸',
    short: 'Gajian',
    adjust: { 'Minuman Dingin': 0.2, 'Minuman Panas': 0.15, Pastry: 0.25, 'Bahan Umum': 0.1 },
  },
  ujian: {
    id: 'ujian',
    label: 'Musim Ujian Kampus',
    emoji: '📚',
    short: 'Musim Ujian',
    adjust: { 'Minuman Dingin': 0.15, 'Minuman Panas': 0.25, Pastry: 0.2, 'Bahan Umum': 0.15 },
  },
};

/**
 * Faktor karakteristik bahan terhadap trafik secara umum.
 * Bahan yang tidak elastis terhadap lonjakan bernilai lebih kecil.
 */
export const CATEGORY_FACTOR = {
  'Minuman Dingin': 1,
  'Minuman Panas': 0.9,
  Pastry: 0.8,
  'Bahan Umum': 0.75,
};

export const DEFAULT_WEATHER = 'cerah';
export const DEFAULT_CALENDAR = 'weekend';

/** Ambang label kedaluwarsa (dalam hari). */
export const EXPIRY_THRESHOLDS = { kritis: 2, perhatian: 5 };

/* ================================================================== */
/* 2. Util tanggal                                                    */
/* ================================================================== */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Ubah Date / string menjadi Date tengah malam (local). */
export function startOfDay(value = new Date()) {
  const d = value instanceof Date ? new Date(value) : parseISODate(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format Date ke ISO `YYYY-MM-DD` (local, bukan UTC). */
export function toISODate(date) {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ambil `YYYY-MM-DD` dari awal sebuah string ISO (tahan terhadap timezone). */
export function parseISODate(value) {
  if (value instanceof Date) return startOfDay(value);
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(NaN);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** Validasi format tanggal ISO `YYYY-MM-DD` yang benar-benar ada di kalender. */
export function isValidISODate(value) {
  const d = parseISODate(value);
  if (Number.isNaN(d.getTime())) return false;
  return toISODate(d) === String(value).slice(0, 10);
}

/**
 * Selisih hari dari `from` (default hari ini) ke `to`.
 * Nilai negatif berarti sudah lewat / kedaluwarsa.
 */
export function daysUntil(to, from = new Date()) {
  const a = startOfDay(to);
  const b = startOfDay(from);
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/** Tambah `n` hari ke sebuah tanggal (Date atau ISO), kembalikan ISO. */
export function addDays(value, n) {
  const d = startOfDay(value);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/**
 * Resolusi token tanggal relatif pada data demo: `@+2` => ISO hari ini + 2.
 * Nilai ISO biasa dikembalikan apa adanya.
 */
export function resolveRelativeDate(value, today = new Date()) {
  const raw = String(value ?? '').trim();
  const rel = raw.match(/^@([+-])(\d+)$/);
  if (rel) {
    const n = Number(rel[2]) * (rel[1] === '-' ? -1 : 1);
    return addDays(today, n);
  }
  return raw;
}

/** Format ISO menjadi teks lokal Indonesia, mis. "16 Nov 2026". */
export function formatHumanDate(value) {
  const d = parseISODate(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Nama hari panjang, mis. "Senin". */
export function formatWeekday(value = new Date()) {
  const d = startOfDay(value);
  return d.toLocaleDateString('id-ID', { weekday: 'long' });
}

/* ================================================================== */
/* 3. Prediksi prep                                                   */
/* ================================================================== */

/** Pembulatan tampilan angka (hindari 1234.0000001). */
function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Format angka gaya Indonesia: 5000 -> "5.000", 24.5 -> "24,5". */
export function formatNumber(n) {
  const v = round(Number(n) || 0, 2);
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/** Format persentase bertanda: 0.3 -> "+30%", -0.15 -> "-15%". */
export function formatPercent(ratio) {
  const pct = Math.round(ratio * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/** Ambil objek skenario cuaca; fallback ke default bila id tak dikenal. */
export function getWeather(id) {
  return WEATHER[id] ?? WEATHER[DEFAULT_WEATHER];
}

/** Ambil objek skenario kalender; fallback ke default bila id tak dikenal. */
export function getCalendar(id) {
  return CALENDAR[id] ?? CALENDAR[DEFAULT_CALENDAR];
}

/** Penambahan rasio cuaca untuk kategori tertentu (0 bila tak ada). */
export function weatherAdjust(weatherId, kategori) {
  return getWeather(weatherId).adjust[kategori] ?? 0;
}

/** Penambahan rasio kalender untuk kategori tertentu (0 bila tak ada). */
export function calendarAdjust(calendarId, kategori) {
  return getCalendar(calendarId).adjust[kategori] ?? 0;
}

/* --- Normalisasi kosakata pemicu (terima istilah sederhana & id internal) --- */

/** Alias cuaca: istilah `panas` dipetakan ke skenario internal `cerah`. */
const WEATHER_ALIAS = { panas: 'cerah', cerah: 'cerah', berawan: 'berawan', hujan: 'hujan' };

/** Alias event: istilah `gajian` dipetakan ke id internal `payday`. */
const EVENT_ALIAS = { biasa: 'biasa', weekend: 'weekend', gajian: 'payday', payday: 'payday', ujian: 'ujian' };

/** Normalisasi istilah/id cuaca ke id internal yang dikenal (fallback ke default). */
export function normalizeWeatherId(id) {
  const key = String(id ?? '').trim().toLowerCase();
  if (WEATHER_ALIAS[key]) return WEATHER_ALIAS[key];
  return WEATHER[key] ? key : DEFAULT_WEATHER;
}

/** Normalisasi istilah/id event kalender ke id internal yang dikenal (fallback ke default). */
export function normalizeEventId(id) {
  const key = String(id ?? '').trim().toLowerCase();
  if (EVENT_ALIAS[key]) return EVENT_ALIAS[key];
  return CALENDAR[key] ? key : DEFAULT_CALENDAR;
}

/**
 * Hitung rekomendasi takaran prep harian untuk satu bahan (fungsi murni).
 *
 * Rumus (aditif & transparan):
 *   jumlah = round( pemakaianDasar × (1 + pengaliCuaca + pengaliEvent) × faktorKategori )
 *
 * @param {object} ingredient bahan (butuh `pemakaianDasar`, `kategori`, `satuan`)
 * @param {{ weather?: string, eventDay?: string }} [opts]
 *   `weather` menerima 'panas' | 'berawan' | 'hujan' (id internal juga diterima).
 *   `eventDay` menerima 'biasa' | 'weekend' | 'gajian' | 'ujian' (id internal juga diterima).
 * @returns {{ jumlah:number, satuan:string, dasar:number, faktor:number,
 *   cuaca:number, event:number, kategoriFaktor:number, raw:number,
 *   weatherId:string, eventId:string, penjelasan:string }}
 */
export function calculateDailyPrep(ingredient, opts = {}) {
  const weatherId = normalizeWeatherId(opts.weather);
  const eventId = normalizeEventId(opts.eventDay);

  const dasar = Number(ingredient?.pemakaianDasar) || 0;
  const kategori = ingredient?.kategori;
  const cuaca = weatherAdjust(weatherId, kategori);
  const event = calendarAdjust(eventId, kategori);
  const kategoriFaktor = CATEGORY_FACTOR[kategori] ?? 1;
  const faktor = (1 + cuaca + event) * kategoriFaktor;

  const raw = dasar * faktor;
  // Minimal 1 unit agar checklist tetap bermakna untuk item kecil.
  const jumlah = Math.max(dasar > 0 ? 1 : 0, Math.round(raw));

  const penjelasan = buildReason(
    ingredient,
    { dasar, cuaca, kalender: event, kategoriFaktor },
    weatherId,
    eventId,
  );

  return {
    jumlah,
    satuan: ingredient?.satuan ?? '',
    dasar,
    faktor: round(faktor, 4),
    cuaca,
    event,
    kategoriFaktor,
    raw: round(raw, 2),
    weatherId,
    eventId,
    penjelasan,
  };
}

/**
 * Bentuk lama (tanda tangan posisional) yang dipakai UI & checklist.
 * Delegasi ke `calculateDailyPrep` agar perhitungan tetap satu sumber kebenaran.
 * @returns {{ dasar:number, kebutuhan:number, faktor:number, cuaca:number,
 *   kalender:number, kategoriFaktor:number, raw:number, alasan:string }}
 */
export function computePrediction(ingredient, weatherId, calendarId) {
  const hasil = calculateDailyPrep(ingredient, { weather: weatherId, eventDay: calendarId });
  return {
    dasar: hasil.dasar,
    kebutuhan: hasil.jumlah,
    faktor: hasil.faktor,
    cuaca: hasil.cuaca,
    kalender: hasil.event,
    kategoriFaktor: hasil.kategoriFaktor,
    raw: hasil.raw,
    alasan: hasil.penjelasan,
  };
}

/** Susun string alasan kalkulasi yang transparan. */
export function buildReason(ingredient, parts, weatherId, calendarId) {
  const satuan = ingredient.satuan ? ` ${ingredient.satuan}` : '';
  const bits = [`Dasar ${formatNumber(parts.dasar)}${satuan}`];

  const w = getWeather(weatherId);
  const c = getCalendar(calendarId);

  if (parts.cuaca !== 0) bits.push(`Cuaca ${w.short} (${formatPercent(parts.cuaca)})`);
  else bits.push(`Cuaca ${w.short} (netral)`);

  if (parts.kalender !== 0) bits.push(`${c.short} (${formatPercent(parts.kalender)})`);
  else bits.push(`${c.short} (netral)`);

  if (parts.kategoriFaktor !== 1) {
    bits.push(`Faktor ${ingredient.kategori} (×${formatNumber(parts.kategoriFaktor)})`);
  }

  return bits.join(' × ');
}

/** Nilai status kedaluwarsa sederhana. */
export const EXPIRY_STATUS = { AMAN: 'aman', PERINGATAN: 'peringatan', KEDALUWARSA: 'kedaluwarsa' };

/**
 * Status kedaluwarsa sederhana (fungsi murni).
 *  - `kedaluwarsa` : tanggal sudah lewat (hari < 0)
 *  - `peringatan`  : tersisa <= 2 hari (hari 0..2)
 *  - `aman`        : masih lebih dari 2 hari
 *
 * @param {string|Date} tanggalKedaluwarsa
 * @param {Date} [referenceDate] tanggal acuan (default: hari ini)
 * @returns {{ status:'aman'|'peringatan'|'kedaluwarsa', hari:number, label:string, keterangan:string }}
 */
export function getExpiryStatus(tanggalKedaluwarsa, referenceDate = new Date()) {
  const hari = daysUntil(tanggalKedaluwarsa, referenceDate);

  if (Number.isNaN(hari)) {
    return { status: 'aman', hari, label: 'Tanpa tanggal', keterangan: 'Tanggal kedaluwarsa belum diisi.' };
  }
  if (hari < 0) {
    return {
      status: 'kedaluwarsa',
      hari,
      label: `⛔ Kedaluwarsa · ${Math.abs(hari)} hari lalu`,
      keterangan: 'Sudah melewati tanggal kedaluwarsa. Periksa & buang bila tidak layak.',
    };
  }
  if (hari <= EXPIRY_THRESHOLDS.kritis) {
    return {
      status: 'peringatan',
      hari,
      label: hari === 0 ? '⚠️ Peringatan · kedaluwarsa hari ini' : `⚠️ Peringatan · H-${hari}`,
      keterangan: 'Segera pakai (FIFO): kedaluwarsa dalam ≤ 2 hari.',
    };
  }
  return { status: 'aman', hari, label: `✅ Aman · H-${hari}`, keterangan: 'Kondisi normal.' };
}

/**
 * Label kedaluwarsa detail untuk tampilan (4 tingkat: kritis/perhatian/aman/lewat).
 * Dibangun di atas `getExpiryStatus` agar perhitungan hari tetap satu sumber.
 * @returns {{ hari:number, level:'kritis'|'perhatian'|'aman'|'lewat', label:string, keterangan:string }}
 */
export function expiryStatus(tanggalKedaluwarsa, today = new Date()) {
  const s = getExpiryStatus(tanggalKedaluwarsa, today);
  const { hari } = s;

  if (Number.isNaN(hari)) {
    return { hari, level: 'aman', label: 'Tanpa tanggal', keterangan: s.keterangan };
  }
  if (s.status === 'kedaluwarsa') {
    return {
      hari,
      level: 'lewat',
      label: `⛔ Lewat ${Math.abs(hari)} hari`,
      keterangan: 'Sudah melewati tanggal kedaluwarsa. Periksa & buang bila tidak layak.',
    };
  }
  if (s.status === 'peringatan') {
    return {
      hari,
      level: 'kritis',
      label: hari === 0 ? '🚨 Kritis · hari ini' : `🚨 Kritis · H-${hari}`,
      keterangan: 'Prioritaskan pemakaian hari ini (FIFO).',
    };
  }
  if (hari <= EXPIRY_THRESHOLDS.perhatian) {
    return { hari, level: 'perhatian', label: `⚠️ Perhatian · H-${hari}`, keterangan: 'Pantau pemakaian.' };
  }
  return { hari, level: 'aman', label: `✅ Aman · H-${hari}`, keterangan: 'Kondisi normal.' };
}

/** Bangun satu baris checklist prep lengkap untuk sebuah bahan. */
export function buildChecklistItem(ingredient, weatherId, calendarId, today = new Date()) {
  const prediksi = computePrediction(ingredient, weatherId, calendarId);
  const expiry = expiryStatus(ingredient.tanggalKedaluwarsa, today);
  const stok = Number(ingredient.stokSaatIni) || 0;
  const selisih = round(stok - prediksi.kebutuhan, 2);
  const cukup = selisih >= 0;

  return {
    ingredient,
    prediksi,
    expiry,
    stok,
    selisih,
    cukup,
    kekurangan: cukup ? 0 : Math.abs(selisih),
  };
}

const EXPIRY_WEIGHT = { lewat: 0, kritis: 1, perhatian: 2, aman: 3 };

/**
 * Urutkan checklist: kedaluwarsa paling mendesak dulu, lalu item yang kurang stok.
 */
export function sortChecklist(items) {
  return [...items].sort((a, b) => {
    const wa = EXPIRY_WEIGHT[a.expiry.level] ?? 9;
    const wb = EXPIRY_WEIGHT[b.expiry.level] ?? 9;
    if (wa !== wb) return wa - wb;
    if (a.cukup !== b.cukup) return a.cukup ? 1 : -1;
    if (!a.cukup && !b.cukup) return b.kekurangan - a.kekurangan;
    return String(a.ingredient.nama).localeCompare(String(b.ingredient.nama), 'id');
  });
}

/** Bangun seluruh checklist + ringkasan statistik. */
export function buildChecklist(ingredients, weatherId, calendarId, today = new Date()) {
  const items = ingredients.map((ing) => buildChecklistItem(ing, weatherId, calendarId, today));
  const sorted = sortChecklist(items);

  const perluBelanja = sorted.filter((it) => !it.cukup);
  const mendekatiKedaluwarsa = sorted.filter((it) =>
    ['kritis', 'perhatian', 'lewat'].includes(it.expiry.level),
  );

  return {
    items: sorted,
    stats: {
      totalJenis: ingredients.length,
      perluBelanja: perluBelanja.length,
      mendekatiKedaluwarsa: mendekatiKedaluwarsa.length,
    },
  };
}

/** Nilai filter status (selain ini diperlakukan sebagai nama kategori). */
export const STATUS_FILTERS = ['all', 'kurang', 'kedaluwarsa', 'kritis'];

/**
 * Filter daftar checklist berdasarkan kata kunci & filter status/kategori.
 * Bila `sort` diberikan, hasilnya diurutkan ulang (lihat `sortChecklistItems`).
 * @param {Array} items hasil buildChecklist
 * @param {{ query?: string, filter?: string, sort?: 'fifo'|'shortage'|'name-asc' }} [opts]
 */
export function filterChecklist(items, opts = {}) {
  const query = String(opts.query ?? '').trim().toLowerCase();
  const filter = opts.filter ?? 'all';
  const isStatus = STATUS_FILTERS.includes(filter);

  const filtered = items.filter((it) => {
    const ing = it.ingredient;

    if (filter === 'kurang' && it.cukup) return false;
    if (filter === 'kedaluwarsa' && !['kritis', 'perhatian', 'lewat'].includes(it.expiry.level)) return false;
    if (filter === 'kritis' && !['kritis', 'lewat'].includes(it.expiry.level)) return false;
    if (!isStatus && ing.kategori !== filter) return false;

    if (query) {
      const haystack = `${ing.nama} ${ing.kategori} ${ing.ikon ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  // Tanpa `sort`, urutan asli (yang sudah FIFO dari buildChecklist) dipertahankan.
  return opts.sort ? sortChecklistItems(filtered, opts.sort) : filtered;
}

/* --- Pengurutan (sorting) ----------------------------------------- */

/** Mode pengurutan yang didukung untuk daftar bahan & checklist. */
export const SORT_MODES = ['fifo', 'shortage', 'name-asc'];

/** Pembanding nama bahan A–Z (locale Indonesia). */
const byNameId = (a, b) => String(a?.nama ?? '').localeCompare(String(b?.nama ?? ''), 'id');

/** Bahan dianggap kurang stok bila stok saat ini di bawah pemakaian dasar harian. */
export function isShortage(ingredient) {
  const stok = Number(ingredient?.stokSaatIni) || 0;
  const dasar = Number(ingredient?.pemakaianDasar) || 0;
  return stok < dasar;
}

/** Besar kekurangan stok (stok < pemakaian dasar) sebagai angka >= 0. */
export function shortageAmount(ingredient) {
  const stok = Number(ingredient?.stokSaatIni) || 0;
  const dasar = Number(ingredient?.pemakaianDasar) || 0;
  return Math.max(0, dasar - stok);
}

/**
 * Urutkan daftar bahan mentah (fungsi murni, stabil).
 *  - 'fifo'     : paling mendekati kedaluwarsa lebih dulu (default).
 *  - 'shortage' : kekurangan stok terbanyak lebih dulu.
 *  - 'name-asc' : nama bahan A–Z.
 * Nilai yang tidak punya tanggal kedaluwarsa valid diletakkan di akhir (fifo).
 * @param {Array} items
 * @param {'fifo'|'shortage'|'name-asc'} [sort]
 */
export function sortIngredients(items, sort = 'fifo') {
  const list = Array.isArray(items) ? [...items] : [];
  switch (sort) {
    case 'shortage':
      return list.sort((a, b) => shortageAmount(b) - shortageAmount(a));
    case 'name-asc':
      return list.sort(byNameId);
    case 'fifo':
    default:
      return list.sort((a, b) => {
        const da = daysUntil(a?.tanggalKedaluwarsa);
        const db = daysUntil(b?.tanggalKedaluwarsa);
        const va = Number.isNaN(da) ? Infinity : da;
        const vb = Number.isNaN(db) ? Infinity : db;
        return va - vb;
      });
  }
}

/**
 * Urutkan baris checklist (hasil buildChecklist) sesuai mode.
 *  - 'fifo'     : prioritas kedaluwarsa + kekurangan (default, `sortChecklist`).
 *  - 'shortage' : kekurangan stok terbanyak lebih dulu.
 *  - 'name-asc' : nama bahan A–Z.
 * @param {Array} items
 * @param {'fifo'|'shortage'|'name-asc'} [sort]
 */
export function sortChecklistItems(items, sort = 'fifo') {
  const list = Array.isArray(items) ? [...items] : [];
  switch (sort) {
    case 'shortage':
      return list.sort((a, b) => (Number(b?.kekurangan) || 0) - (Number(a?.kekurangan) || 0));
    case 'name-asc':
      return list.sort((a, b) => byNameId(a?.ingredient, b?.ingredient));
    case 'fifo':
    default:
      return sortChecklist(list);
  }
}

/* --- Integrasi WhatsApp (restock supplier) ------------------------ */

/**
 * Validasi nomor WhatsApp format internasional.
 * Hanya digit, panjang wajar 8–15 digit, tidak diawali `0` lokal,
 * dan harus diawali kode negara (mis. `62`).
 * @param {unknown} nomor
 * @returns {boolean}
 */
export function isValidWhatsAppNumber(nomor) {
  if (typeof nomor !== 'string' && typeof nomor !== 'number') return false;
  const str = String(nomor).trim();
  if (!/^\d{8,15}$/.test(str)) return false;
  if (str.startsWith('0')) return false;
  return true;
}

/**
 * Susun URL WhatsApp (wa.me) untuk memesan restock sebuah bahan (fungsi murni).
 * @param {string|number} nomor nomor tujuan format internasional (mis. "6281234567890")
 * @param {object} item bahan (butuh `nama`, opsional `satuan`)
 * @param {number} kekurangan jumlah kekurangan stok
 * @returns {string} URL `https://wa.me/<nomor>?text=<pesan>` atau '' bila nomor tidak valid.
 */
export function buildWhatsAppUrl(nomor, item, kekurangan) {
  if (!isValidWhatsAppNumber(nomor)) return '';

  const digits = String(nomor).trim();
  const nama = String(item?.nama ?? 'bahan');
  const satuan = item?.satuan ? ` ${item.satuan}` : '';
  const jumlah = formatNumber(Math.max(0, Number(kekurangan) || 0));
  const pesan =
    `Halo, saya dari TakarKopi ingin restock bahan berikut:\n\n` +
    `• ${nama}: kurang ${jumlah}${satuan}\n\n` +
    `Mohon info ketersediaan & harga. Terima kasih.`;

  return `https://wa.me/${digits}?text=${encodeURIComponent(pesan)}`;
}

/**
 * Saring daftar bahan baku (fungsi murni).
 * @param {Array} items daftar bahan mentah
 * @param {{ query?:string, kategori?:string, onlyShortage?:boolean,
 *   sort?:'fifo'|'shortage'|'name-asc' }} [opts]
 *   - `query`   : cocokkan (case-insensitive) pada nama, kategori, atau ikon.
 *   - `kategori`: saring satu kategori; 'all'/'semua'/kosong = tanpa filter.
 *   - `onlyShortage`: true = hanya bahan yang stoknya kurang (stok < pemakaian dasar).
 *   - `sort`    : urutkan hasil — 'fifo' (default), 'shortage', atau 'name-asc'.
 * @returns {Array} daftar bahan yang lolos filter (sudah diurutkan)
 */
export function filterIngredients(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const query = String(opts.query ?? '').trim().toLowerCase();
  const kategori = String(opts.kategori ?? '').trim();
  const onlyShortage = Boolean(opts.onlyShortage);
  const sort = opts.sort ?? 'fifo';
  const kategoriAktif =
    kategori !== '' && !['all', 'semua'].includes(kategori.toLowerCase());

  const filtered = list.filter((ing) => {
    if (!ing) return false;
    if (kategoriAktif && ing.kategori !== kategori) return false;
    if (onlyShortage && !isShortage(ing)) return false;

    if (query) {
      const haystack = `${ing.nama ?? ''} ${ing.kategori ?? ''} ${ing.ikon ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return sortIngredients(filtered, sort);
}
