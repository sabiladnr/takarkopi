/**
 * domain.js — aturan bisnis murni TakarKopi Marketplace.
 *
 * Berisi:
 *  - Definisi peran (admin / seller / pembeli) + matriks izin.
 *  - Status pesanan dan transisi yang diizinkan per peran.
 *  - Validasi produk, registrasi, dan checkout.
 *  - Perhitungan keranjang/ongkir serta helper format & statistik.
 *
 * Modul ini tidak menyentuh DOM maupun localStorage sehingga mudah diuji.
 */

import { sanitizeImageUrl } from './ingredients.js';

/* ================================================================== */
/* 1. Peran & izin                                                    */
/* ================================================================== */

export const ROLES = { ADMIN: 'admin', SELLER: 'seller', BUYER: 'buyer' };

export const ROLE_LABEL = { admin: 'Admin', seller: 'Seller', buyer: 'Pembeli' };
export const ROLE_ICON = { admin: '🛡️', seller: '🏪', buyer: '🛒' };

/** Halaman awal tiap peran (hash route). */
export const ROLE_HOME = {
  admin: '#/admin',
  seller: '#/seller',
  buyer: '#/katalog',
};

/** Izin granular yang bisa dipakai untuk guard UI maupun domain. */
export const PERMISSIONS = {
  admin: [
    'dashboard:admin',
    'users:manage',
    'products:moderate',
    'orders:manage',
    'reports:view-all',
  ],
  seller: [
    'dashboard:seller',
    'products:manage-own',
    'orders:manage-own',
    'reports:view-own',
    'prep:use',
  ],
  buyer: [
    'catalog:view',
    'cart:manage-own',
    'orders:view-own',
    'orders:cancel-own',
  ],
};

/** Cek apakah sebuah peran memiliki izin tertentu. */
export function can(role, action) {
  return Boolean(PERMISSIONS[role]?.includes(action));
}

/* ================================================================== */
/* 2. Produk & status                                                 */
/* ================================================================== */

export const PRODUCT_CATEGORIES = ['Biji Kopi', 'Susu', 'Sirup & Gula', 'Matcha & Teh', 'Pastry', 'Lainnya'];
export const PRODUCT_STATUSES = ['aktif', 'nonaktif'];

/** Gambar cadangan produk ketika gambar utama gagal dimuat / kosong. */
export const PRODUCT_IMAGE_BY_KATEGORI = {
  'Biji Kopi': './images/coffee.svg',
  Susu: './images/milk.svg',
  'Sirup & Gula': './images/syrup.svg',
  'Matcha & Teh': './images/matcha.svg',
  Pastry: './images/croissant.svg',
  Lainnya: './images/ice.svg',
};

/** Emoji cadangan produk (dipakai bila semua gambar gagal). */
export const PRODUCT_EMOJI_BY_KATEGORI = {
  'Biji Kopi': '☕',
  Susu: '🥛',
  'Sirup & Gula': '🍯',
  'Matcha & Teh': '🍵',
  Pastry: '🥐',
  Lainnya: '📦',
};

/** Gambar dasar aman untuk sebuah produk/kategori. */
export function defaultProductImage(kategori) {
  return PRODUCT_IMAGE_BY_KATEGORI[kategori] ?? './images/milk.svg';
}

/** Ambang batas stok menipis untuk peringatan dashboard seller. */
export const LOW_STOCK_THRESHOLD = 10;

export function isLowStock(product, threshold = LOW_STOCK_THRESHOLD) {
  return Number(product?.stok ?? 0) <= threshold;
}

export function isProductVisible(product) {
  return Boolean(product) && product.status === 'aktif';
}

/* ================================================================== */
/* 3. Status pesanan                                                  */
/* ================================================================== */

export const ORDER_STATUSES = ['menunggu', 'diproses', 'dikirim', 'selesai', 'dibatalkan'];

export const ORDER_STATUS_LABEL = {
  menunggu: 'Menunggu Konfirmasi',
  diproses: 'Diproses Seller',
  dikirim: 'Dikirim',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

export const ORDER_STATUS_ICON = {
  menunggu: '⏳',
  diproses: '🧑‍🍳',
  dikirim: '🚚',
  selesai: '✅',
  dibatalkan: '⛔',
};

/** Transisi status yang diizinkan per peran. */
const ORDER_FLOW = {
  menunggu: { admin: ['diproses', 'dibatalkan'], seller: ['diproses', 'dibatalkan'], buyer: ['dibatalkan'] },
  diproses: { admin: ['dikirim', 'dibatalkan'], seller: ['dikirim', 'dibatalkan'], buyer: [] },
  dikirim: { admin: ['selesai'], seller: ['selesai'], buyer: ['selesai'] },
  selesai: { admin: [], seller: [], buyer: [] },
  dibatalkan: { admin: [], seller: [], buyer: [] },
};

/** Daftar status berikutnya yang boleh dilakukan sebuah peran. */
export function allowedTransitions(status, role) {
  return [...(ORDER_FLOW[status]?.[role] ?? [])];
}

export function canTransition(status, next, role) {
  return allowedTransitions(status, role).includes(next);
}

export function isClosedStatus(status) {
  return status === 'selesai' || status === 'dibatalkan';
}

/** Label tombol aksi untuk transisi status. */
export const TRANSITION_LABEL = {
  diproses: 'Proses Pesanan',
  dikirim: 'Kirim Pesanan',
  selesai: 'Tandai Selesai',
  dibatalkan: 'Batalkan',
};

/* ================================================================== */
/* 4. Keranjang & ongkir                                              */
/* ================================================================== */

export const SHIPPING_FLAT = 15000;
export const FREE_SHIPPING_MIN = 500000;

/** Rekening tujuan transfer untuk pembayaran pesanan keranjang. */
export const TRANSFER_ACCOUNTS = [
  { bank: 'BCA', nomor: '1234567890', atasNama: 'TakarKopi Banyuwangi' },
  { bank: 'Mandiri', nomor: '0987654321', atasNama: 'TakarKopi Banyuwangi' },
];

/** Status pembayaran transfer untuk pesanan dari keranjang. */
export const PAYMENT_STATUSES = ['menunggu_pembayaran', 'menunggu_verifikasi', 'lunas'];

export const PAYMENT_STATUS_LABEL = {
  menunggu_pembayaran: 'Menunggu Transfer',
  menunggu_verifikasi: 'Menunggu Verifikasi',
  lunas: 'Lunas',
};

export const PAYMENT_STATUS_ICON = {
  menunggu_pembayaran: '💳',
  menunggu_verifikasi: '🕓',
  lunas: '✅',
};

/** Ongkir toko: gratis di atas Rp500.000, selain itu flat Rp15.000. */
export function shippingFor(subtotal) {
  const value = Number(subtotal) || 0;
  if (value <= 0) return 0;
  return value >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FLAT;
}

/**
 * Hitung ringkasan baris keranjang.
 * @param {Array<{ harga:number, qty:number, sellerId:string }>} lines
 * @returns {{ subtotal:number, shipping:number, total:number, count:number, sellerCount:number }}
 */
export function cartTotals(lines) {
  const list = Array.isArray(lines) ? lines : [];
  let subtotal = 0;
  let count = 0;
  const sellers = new Map();
  for (const line of list) {
    const harga = Number(line?.harga) || 0;
    const qty = Number(line?.qty) || 0;
    if (qty <= 0) continue;
    subtotal += harga * qty;
    count += qty;
    const sellerId = line?.sellerId ?? '';
    sellers.set(sellerId, (sellers.get(sellerId) ?? 0) + harga * qty);
  }
  let shipping = 0;
  for (const value of sellers.values()) shipping += shippingFor(value);
  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
    count,
    sellerCount: sellers.size,
  };
}

/** Baris keranjang untuk satu toko (dipakai saat checkout dipecah per seller). */
export function groupBySeller(lines) {
  const groups = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!groups.has(line.sellerId)) groups.set(line.sellerId, []);
    groups.get(line.sellerId).push(line);
  }
  return groups;
}

/* ================================================================== */
/* 5. Validasi                                                        */
/* ================================================================== */

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Validasi & normalisasi input produk seller.
 * @returns {{ ok:true, value:object } | { ok:false, errors:Record<string,string> }}
 */
export function validateProductInput(raw) {
  const errors = {};
  if (!isPlainObject(raw)) {
    return { ok: false, errors: { _: 'Data produk tidak valid.' } };
  }

  const nama = String(raw.nama ?? '').trim();
  if (nama.length < 2) errors.nama = 'Nama produk minimal 2 karakter.';
  if (nama.length > 80) errors.nama = 'Nama produk maksimal 80 karakter.';

  const kategori = String(raw.kategori ?? '').trim();
  if (!PRODUCT_CATEGORIES.includes(kategori)) {
    errors.kategori = `Kategori harus salah satu dari: ${PRODUCT_CATEGORIES.join(', ')}.`;
  }

  const satuan = String(raw.satuan ?? '').trim();
  if (satuan.length < 1 || satuan.length > 16) errors.satuan = 'Satuan wajib diisi (maks. 16 karakter).';

  const harga = Number(raw.harga);
  if (!Number.isFinite(harga) || harga < 1) errors.harga = 'Harga harus angka lebih dari 0.';
  if (Number.isFinite(harga) && harga > 1000000000) errors.harga = 'Harga terlalu besar.';

  const stok = Number(raw.stok);
  if (!Number.isInteger(stok) || stok < 0) errors.stok = 'Stok harus bilangan bulat >= 0.';

  const deskripsi = String(raw.deskripsi ?? '').trim();
  if (deskripsi.length > 400) errors.deskripsi = 'Deskripsi maksimal 400 karakter.';

  const imageRaw = String(raw.imageUrl ?? '').trim();
  const imageUrl = sanitizeImageUrl(imageRaw);
  if (imageRaw !== '' && imageUrl === '') {
    errors.imageUrl = 'URL gambar harus diawali "./images/" atau "https://".';
  }

  const status = String(raw.status ?? 'aktif');
  if (!PRODUCT_STATUSES.includes(status)) errors.status = 'Status produk tidak dikenal.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      nama,
      kategori,
      satuan,
      harga: Math.round(harga),
      stok,
      deskripsi,
      imageUrl: imageUrl || defaultProductImage(kategori),
      status,
    },
  };
}

/**
 * Validasi registrasi akun baru.
 * @param {object} raw
 * @param {Array<{email:string}>} existingUsers
 */
export function validateRegistration(raw, existingUsers = []) {
  const errors = {};

  const nama = String(raw?.nama ?? '').trim();
  if (nama.length < 2) errors.nama = 'Nama minimal 2 karakter.';
  if (nama.length > 60) errors.nama = 'Nama maksimal 60 karakter.';

  const email = normalizeEmail(raw?.email);
  if (!EMAIL_RE.test(email)) errors.email = 'Format email tidak valid.';
  if (existingUsers.some((u) => normalizeEmail(u.email) === email)) {
    errors.email = 'Email sudah terdaftar. Silakan masuk.';
  }

  const password = String(raw?.password ?? '');
  if (password.length < 8) errors.password = 'Kata sandi minimal 8 karakter.';

  const role = String(raw?.role ?? ROLES.BUYER);
  if (![ROLES.BUYER, ROLES.SELLER].includes(role)) {
    errors.role = 'Pendaftaran hanya untuk akun pembeli atau seller.';
  }

  const tokoNama = String(raw?.tokoNama ?? '').trim();
  if (role === ROLES.SELLER && tokoNama.length < 2) {
    errors.tokoNama = 'Nama toko wajib diisi untuk akun seller.';
  }

  const telepon = String(raw?.telepon ?? '').trim();
  if (telepon !== '' && !/^[0-9+\-\s()]{7,20}$/.test(telepon)) {
    errors.telepon = 'Nomor telepon tidak valid.';
  }

  const kota = String(raw?.kota ?? '').trim();
  if (kota.length > 60) errors.kota = 'Kota maksimal 60 karakter.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      nama,
      email,
      password,
      role,
      telepon,
      kota,
      tokoNama: role === ROLES.SELLER ? tokoNama : '',
      alamat: String(raw?.alamat ?? '').trim(),
    },
  };
}

/** Validasi data pengiriman saat checkout. */
export function validateCheckout(raw) {
  const errors = {};
  const alamat = String(raw?.alamat ?? '').trim();
  if (alamat.length < 10) errors.alamat = 'Alamat pengiriman minimal 10 karakter.';
  if (alamat.length > 300) errors.alamat = 'Alamat maksimal 300 karakter.';

  const catatan = String(raw?.catatan ?? '').trim();
  if (catatan.length > 300) errors.catatan = 'Catatan maksimal 300 karakter.';

  const metode = String(raw?.metode ?? 'transfer');
  if (!['transfer', 'ewallet', 'cod'].includes(metode)) errors.metode = 'Metode pembayaran tidak dikenal.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { alamat, catatan, metode } };
}

/* ================================================================== */
/* 6. Format & statistik                                              */
/* ================================================================== */

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** Format angka menjadi Rupiah, mis. 185000 -> "Rp185.000". */
export function formatIDR(value) {
  return rupiah.format(Number(value) || 0);
}

/**
 * Susun URL WhatsApp (wa.me) untuk memesan satu produk langsung ke seller.
 * Mengembalikan string kosong bila nomor seller tidak valid.
 */
export function buildOrderWhatsAppUrl(product, seller, buyer) {
  const digits = String(seller?.telepon ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  const toko = seller?.toko?.nama ?? seller?.nama ?? 'seller';
  const pembeli = buyer?.nama ?? 'pembeli';
  const kota = buyer?.kota ? ` dari ${buyer.kota}` : '';
  const pesan = [
    `Halo ${toko}, saya ${pembeli}${kota}.`,
    'Saya ingin memesan:',
    `• ${product?.nama ?? 'produk'} (${product?.satuan ?? 'unit'}) — ${formatIDR(product?.harga)}`,
    '',
    'Apakah stok tersedia? Mohon info total, ongkir, dan pembayaran transfer. Terima kasih.',
  ].join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(pesan)}`;
}

/** Format ISO datetime menjadi tanggal & jam lokal Indonesia. */
export function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format ISO date menjadi tanggal lokal, mis. "16 Nov 2026". */
export function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Inisial nama untuk avatar teks. */
export function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'TK';
  return parts.map((p) => p[0].toUpperCase()).join('');
}

/** Ringkasan pesanan: total, pendapatan (selesai), dan jumlah per status. */
export function summarizeOrders(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  let revenue = 0;
  for (const order of list) {
    if (byStatus[order.status] != null) byStatus[order.status] += 1;
    if (order.status === 'selesai') revenue += Number(order.total) || 0;
  }
  return {
    total: list.length,
    revenue,
    byStatus,
    pending: byStatus.menunggu + byStatus.diproses + byStatus.dikirim,
  };
}

/** Hitung total nilai persediaan (harga × stok) untuk sebuah daftar produk. */
export function inventoryValue(products) {
  return (Array.isArray(products) ? products : []).reduce(
    (sum, p) => sum + (Number(p?.harga) || 0) * (Number(p?.stok) || 0),
    0,
  );
}

/** Jumlah produk yang stoknya menipis. */
export function countLowStock(products) {
  return (Array.isArray(products) ? products : []).filter((p) => isLowStock(p)).length;
}
