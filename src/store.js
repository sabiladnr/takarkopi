/**
 * store.js — lapisan data & autentikasi TakarKopi Marketplace.
 *
 * Persistensi default: localStorage (key `takarkopi:db:v2`), sehingga aplikasi
 * bisa berjalan tanpa server. Skema MySQL yang setara tersedia di `db/schema.sql`
 * untuk migrasi ke backend produksi; seluruh akses data dikumpulkan di modul ini
 * agar penggantian adapter tidak menyentuh lapisan tampilan.
 *
 * Peran: admin (platform), seller (toko supplier), buyer/pembeli (kafe).
 */

import {
  ROLES,
  normalizeEmail,
  validateProductInput,
  validateRegistration,
  validateCheckout,
  allowedTransitions,
  shippingFor,
  groupBySeller,
  ORDER_STATUS_LABEL,
} from './domain.js';
import { demoIngredients, loadIngredients, saveIngredients, clearIngredients } from './ingredients.js';

export const DB_KEY = 'takarkopi:db:v2';
export const SESSION_KEY = 'takarkopi:session:v2';
export const DB_VERSION = 2;

/** Salt + hash demo (SHA-256 dari `${salt}:${password}`). */
const DEMO_PASSWORDS = {
  'admin@takarkopi.id': 'Admin#2026',
  'toko@kopinusantara.id': 'Seller#2026',
  'hello@susumatcha.id': 'Seller#2026',
  'kafe@senjakopi.id': 'Buyer#2026',
  'barista@kopikita.id': 'Buyer#2026',
};

export const DEMO_ACCOUNTS = [
  {
    role: 'admin',
    email: 'admin@takarkopi.id',
    password: DEMO_PASSWORDS['admin@takarkopi.id'],
    label: 'Admin Platform',
    detail: 'Kelola pengguna, produk, dan seluruh pesanan',
  },
  {
    role: 'seller',
    email: 'toko@kopinusantara.id',
    password: DEMO_PASSWORDS['toko@kopinusantara.id'],
    label: 'Seller — Kopi Nusantara',
    detail: 'Kelola katalog, stok, pesanan & smart prep',
  },
  {
    role: 'buyer',
    email: 'kafe@senjakopi.id',
    password: DEMO_PASSWORDS['kafe@senjakopi.id'],
    label: 'Pembeli — Senja Kopi',
    detail: 'Belanja bahan baku & lacak pesanan',
  },
];

/* ================================================================== */
/* 1. Seed data dummy                                                 */
/* ================================================================== */

function daysAgo(days, hours = 0) {
  return new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
}

function seedUsers() {
  return [
    {
      id: 'u-admin',
      nama: 'Rani Admin',
      email: 'admin@takarkopi.id',
      passwordHash: '880d3605fcce243516dafaec5a2fbd34f82bd1080341619f4b61be9283766686',
      salt: 'tk-admin-7f3a',
      role: ROLES.ADMIN,
      status: 'aktif',
      telepon: '6281100000001',
      kota: 'Banyuwangi',
      alamat: '',
      toko: null,
      createdAt: daysAgo(180),
    },
    {
      id: 'u-seller-1',
      nama: 'Bagas Pratama',
      email: 'toko@kopinusantara.id',
      passwordHash: 'aeefbf3715b18dd6f433a84a68ff7db1b75258e1855857f3df22b352a1070c07',
      salt: 'tk-seller1-9c1d',
      role: ROLES.SELLER,
      status: 'aktif',
      telepon: '6281200000002',
      kota: 'Banyuwangi',
      alamat: 'Jl. Ahmad Yani No. 12, Banyuwangi',
      toko: { nama: 'Kopi Nusantara', kota: 'Banyuwangi', deskripsi: 'Supplier biji kopi & dairy untuk kafe.' },
      createdAt: daysAgo(150),
    },
    {
      id: 'u-seller-2',
      nama: 'Maya Sari',
      email: 'hello@susumatcha.id',
      passwordHash: '841da203c4f029d1bb713f8d1b6b172c8afeb19fd1c41023a968e66c4cbd17f8',
      salt: 'tk-seller2-4b8e',
      role: ROLES.SELLER,
      status: 'aktif',
      telepon: '6281300000003',
      kota: 'Banyuwangi',
      alamat: 'Jl. Basuki Rahmat No. 8, Banyuwangi',
      toko: { nama: 'Susu & Matcha Co', kota: 'Banyuwangi', deskripsi: 'Susu artisan, matcha premium, dan pastry.' },
      createdAt: daysAgo(120),
    },
    {
      id: 'u-buyer-1',
      nama: 'Dimas Wirawan',
      email: 'kafe@senjakopi.id',
      passwordHash: '69f14a9f5b5f6317fe42bfe6ddd3632c2239b0936e631ea1a7eb7f5a202bc961',
      salt: 'tk-buyer1-2d6f',
      role: ROLES.BUYER,
      status: 'aktif',
      telepon: '6281400000004',
      kota: 'Banyuwangi',
      alamat: 'Senja Kopi, Jl. Gajah Mada No. 45, Banyuwangi',
      toko: null,
      createdAt: daysAgo(90),
    },
    {
      id: 'u-buyer-2',
      nama: 'Nadia Kusuma',
      email: 'barista@kopikita.id',
      passwordHash: '6f6976c9f2cbe27eba6a6d64485971fea033a95d5d40bc4abf325157cabda25e',
      salt: 'tk-buyer2-8a0c',
      role: ROLES.BUYER,
      status: 'aktif',
      telepon: '6281500000005',
      kota: 'Banyuwangi',
      alamat: 'Kopi Kita, Jl. Diponegoro No. 21, Banyuwangi',
      toko: null,
      createdAt: daysAgo(60),
    },
  ];
}

function seedProducts() {
  return [
    {
      id: 'p-01',
      sellerId: 'u-seller-1',
      nama: 'Espresso Blend House',
      kategori: 'Biji Kopi',
      satuan: 'kg',
      harga: 185000,
      stok: 42,
      deskripsi: 'Arabika Gayo medium roast, cocok untuk espresso harian kafe.',
      imageUrl: './images/coffee.svg',
      status: 'aktif',
      createdAt: daysAgo(120),
    },
    {
      id: 'p-02',
      sellerId: 'u-seller-1',
      nama: 'Susu Fresh Milk 1L',
      kategori: 'Susu',
      satuan: 'liter',
      harga: 24000,
      stok: 60,
      deskripsi: 'Susu segar pasteurisasi, tekstur creamy untuk latte.',
      imageUrl: './images/milk.svg',
      status: 'aktif',
      createdAt: daysAgo(118),
    },
    {
      id: 'p-03',
      sellerId: 'u-seller-1',
      nama: 'Susu UHT Full Cream',
      kategori: 'Susu',
      satuan: 'liter',
      harga: 21000,
      stok: 8,
      deskripsi: 'Susu UHT tahan lama, stok penyangga saat akhir pekan.',
      imageUrl: './images/uht.svg',
      status: 'aktif',
      createdAt: daysAgo(110),
    },
    {
      id: 'p-04',
      sellerId: 'u-seller-1',
      nama: 'Simple Syrup',
      kategori: 'Sirup & Gula',
      satuan: 'liter',
      harga: 18000,
      stok: 25,
      deskripsi: 'Gula cair 1:1, mudah larut untuk minuman dingin.',
      imageUrl: './images/syrup.svg',
      status: 'aktif',
      createdAt: daysAgo(100),
    },
    {
      id: 'p-05',
      sellerId: 'u-seller-1',
      nama: 'Gula Aren Cair',
      kategori: 'Sirup & Gula',
      satuan: 'liter',
      harga: 32000,
      stok: 14,
      deskripsi: 'Gula aren asli tanpa pengawet, aroma karamel kuat.',
      imageUrl: './images/aren.svg',
      status: 'aktif',
      createdAt: daysAgo(95),
    },
    {
      id: 'p-06',
      sellerId: 'u-seller-1',
      nama: 'Es Batu Kristal',
      kategori: 'Lainnya',
      satuan: 'pack',
      harga: 12000,
      stok: 30,
      deskripsi: 'Es batu kristal bening, 1 pack berisi 2 kg.',
      imageUrl: './images/ice.svg',
      status: 'aktif',
      createdAt: daysAgo(80),
    },
    {
      id: 'p-07',
      sellerId: 'u-seller-1',
      nama: 'Croissant Butter',
      kategori: 'Pastry',
      satuan: 'pcs',
      harga: 14000,
      stok: 18,
      deskripsi: 'Croissant butter panggang harian, renyah di luar.',
      imageUrl: './images/croissant.svg',
      status: 'aktif',
      createdAt: daysAgo(70),
    },
    {
      id: 'p-08',
      sellerId: 'u-seller-2',
      nama: 'Oat Milk Barista',
      kategori: 'Susu',
      satuan: 'liter',
      harga: 38000,
      stok: 36,
      deskripsi: 'Susu oat khusus barista, foam stabil untuk latte art.',
      imageUrl: './images/milk.svg',
      status: 'aktif',
      createdAt: daysAgo(100),
    },
    {
      id: 'p-09',
      sellerId: 'u-seller-2',
      nama: 'Matcha Powder Premium',
      kategori: 'Matcha & Teh',
      satuan: 'pack',
      harga: 125000,
      stok: 22,
      deskripsi: 'Matcha Uji ceremonial grade, 100 gram per pack.',
      imageUrl: './images/matcha.svg',
      status: 'aktif',
      createdAt: daysAgo(98),
    },
    {
      id: 'p-10',
      sellerId: 'u-seller-2',
      nama: 'Stroberi Puree',
      kategori: 'Sirup & Gula',
      satuan: 'botol',
      harga: 45000,
      stok: 12,
      deskripsi: 'Puree stroberi asli tanpa pewarna buatan, 1 liter.',
      imageUrl: './images/syrup.svg',
      status: 'aktif',
      createdAt: daysAgo(88),
    },
    {
      id: 'p-11',
      sellerId: 'u-seller-2',
      nama: 'Butter Croissant',
      kategori: 'Pastry',
      satuan: 'pcs',
      harga: 15000,
      stok: 6,
      deskripsi: 'Croissant butter premium, dipanggang setiap pagi.',
      imageUrl: './images/croissant.svg',
      status: 'aktif',
      createdAt: daysAgo(60),
    },
    {
      id: 'p-12',
      sellerId: 'u-seller-2',
      nama: 'Oat Cream UHT',
      kategori: 'Susu',
      satuan: 'liter',
      harga: 41000,
      stok: 20,
      deskripsi: 'Krim oat UHT untuk cold foam dan frappe.',
      imageUrl: './images/uht.svg',
      status: 'aktif',
      createdAt: daysAgo(50),
    },
  ];
}

function seedOrders() {
  const products = seedProducts();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const build = ({ id, buyerId, sellerId, lines, status, days, hours = 0, metode = 'transfer' }) => {
    const items = lines.map(([productId, qty]) => {
      const p = byId[productId];
      return {
        productId,
        nama: p.nama,
        harga: p.harga,
        qty,
        satuan: p.satuan,
        imageUrl: p.imageUrl,
        kategori: p.kategori,
      };
    });
    const subtotal = items.reduce((sum, it) => sum + it.harga * it.qty, 0);
    const ongkir = shippingFor(subtotal);
    const createdAt = daysAgo(days, hours);
    const timeline = [{ status: 'menunggu', at: createdAt, by: buyerId, note: 'Pesanan dibuat pembeli.' }];
    const urutan = ['diproses', 'dikirim', 'selesai'];
    if (status === 'dibatalkan') {
      timeline.push({ status: 'dibatalkan', at: daysAgo(Math.max(0, days - 0.2)), by: sellerId, note: 'Dibatalkan.' });
    } else {
      const idx = urutan.indexOf(status);
      for (let i = 0; i <= idx; i += 1) {
        timeline.push({
          status: urutan[i],
          at: daysAgo(Math.max(0, days - (i + 1) * 0.25)),
          by: sellerId,
          note: `Status diperbarui ke ${ORDER_STATUS_LABEL[urutan[i]]}.`,
        });
      }
    }

    return {
      id,
      kode: `TK-${id.slice(-4)}`,
      buyerId,
      sellerId,
      items,
      subtotal,
      ongkir,
      total: subtotal + ongkir,
      status,
      alamat:
        buyerId === 'u-buyer-1'
          ? 'Senja Kopi, Jl. Gajah Mada No. 45, Banyuwangi'
          : 'Kopi Kita, Jl. Diponegoro No. 21, Banyuwangi',
      catatan: id === 'o-1003' ? 'Mohon dikirim sebelum jam 9 pagi.' : '',
      metodeBayar: metode,
      createdAt,
      updatedAt: daysAgo(days, hours),
      timeline,
    };
  };

  return [
    build({ id: 'o-1001', buyerId: 'u-buyer-1', sellerId: 'u-seller-1', lines: [['p-02', 4], ['p-05', 2]], status: 'selesai', days: 6 }),
    build({ id: 'o-1002', buyerId: 'u-buyer-2', sellerId: 'u-seller-1', lines: [['p-01', 1], ['p-07', 6]], status: 'dikirim', days: 2 }),
    build({ id: 'o-1003', buyerId: 'u-buyer-1', sellerId: 'u-seller-2', lines: [['p-09', 2], ['p-11', 4]], status: 'menunggu', days: 0, hours: 4, metode: 'ewallet' }),
    build({ id: 'o-1004', buyerId: 'u-buyer-2', sellerId: 'u-seller-2', lines: [['p-10', 3], ['p-12', 2]], status: 'diproses', days: 1, metode: 'transfer' }),
    build({ id: 'o-1005', buyerId: 'u-buyer-1', sellerId: 'u-seller-1', lines: [['p-03', 2], ['p-04', 1]], status: 'dibatalkan', days: 9 }),
    build({ id: 'o-1006', buyerId: 'u-buyer-2', sellerId: 'u-seller-1', lines: [['p-01', 2], ['p-06', 3]], status: 'selesai', days: 12 }),
  ];
}

/** Database awal lengkap dengan data dummy. */
export function seedDatabase() {
  return {
    version: DB_VERSION,
    seededAt: new Date().toISOString(),
    users: seedUsers(),
    products: seedProducts(),
    orders: seedOrders(),
    carts: {
      'u-buyer-1': [
        { productId: 'p-02', qty: 2 },
        { productId: 'p-10', qty: 1 },
      ],
    },
    paymentBatches: {},
    meta: { orderSeq: 1006, cityRevision: 'banyuwangi-v2' },
  };
}

/* ================================================================== */
/* 2. Persistensi                                                     */
/* ================================================================== */

let cache = null;

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isValidDb(db) {
  return (
    db &&
    typeof db === 'object' &&
    db.version === DB_VERSION &&
    Array.isArray(db.users) &&
    Array.isArray(db.products) &&
    Array.isArray(db.orders) &&
    db.carts &&
    typeof db.carts === 'object'
  );
}

/** Ganti nama kota & jalan lama (Bandung/Jakarta) menjadi nuansa Banyuwangi. */
function replaceCityName(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\b(Bandung|Jakarta)\b/g, 'Banyuwangi')
    .replace(/Jl\. Braga/g, 'Jl. Ahmad Yani')
    .replace(/Jl\. Dago/g, 'Jl. Gajah Mada')
    .replace(/Jl\. Kemang Raya/g, 'Jl. Basuki Rahmat')
    .replace(/Jl\. Senopati/g, 'Jl. Diponegoro');
}

/**
 * Migrasi data lama di localStorage agar seluruh kota & alamat memakai Banyuwangi.
 * Dijalankan sekali per database (meta.cityRevision).
 */
function migrateCityNames(db) {
  for (const user of db.users ?? []) {
    user.kota = replaceCityName(user.kota);
    user.alamat = replaceCityName(user.alamat);
    if (user.toko) user.toko.kota = replaceCityName(user.toko.kota);
  }
  for (const order of db.orders ?? []) {
    order.alamat = replaceCityName(order.alamat);
  }
  db.meta = db.meta ?? {};
  db.meta.cityRevision = 'banyuwangi-v2';
}

/** Baca database (cache di memori + localStorage). */
export function getDb() {
  if (cache && isValidDb(cache)) return cache;

  const storage = safeStorage();
  if (storage) {
    try {
      const raw = storage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidDb(parsed)) {
          cache = parsed;
          if (cache.meta?.cityRevision !== 'banyuwangi-v2') {
            migrateCityNames(cache);
            persist();
          }
          // Database lama belum punya wadah tagihan transfer.
          if (!cache.paymentBatches || typeof cache.paymentBatches !== 'object') {
            cache.paymentBatches = {};
            persist();
          }
          return cache;
        }
      }
    } catch {
      // data rusak -> fallback seed
    }
  }

  cache = seedDatabase();
  persist();
  return cache;
}

function persist() {
  const storage = safeStorage();
  if (!storage || !cache) return;
  try {
    storage.setItem(DB_KEY, JSON.stringify(cache));
  } catch {
    // kuota penuh / private mode: data tetap hidup di memori
  }
}

/** Reset seluruh database ke data dummy. */
export function resetDatabase() {
  cache = seedDatabase();
  persist();
  return cache;
}

/* ================================================================== */
/* 3. Sesi & autentikasi                                              */
/* ================================================================== */

async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Browser tidak mendukung Web Crypto. Jalankan aplikasi lewat HTTPS atau localhost.');
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

function randomId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function setSession(userId) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    if (userId) storage.setItem(SESSION_KEY, userId);
    else storage.removeItem(SESSION_KEY);
  } catch {
    // abaikan
  }
}

export function getSessionUserId() {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    return storage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Pengguna yang sedang masuk (objek user dari database) atau null. */
export function currentUser() {
  const id = getSessionUserId();
  if (!id) return null;
  const user = getDb().users.find((u) => u.id === id);
  if (!user || user.status !== 'aktif') return null;
  return user;
}

export function logoutUser() {
  setSession(null);
}

/** Masuk dengan email & kata sandi. */
export async function login(email, password) {
  const normalized = normalizeEmail(email);
  const db = getDb();
  const user = db.users.find((u) => normalizeEmail(u.email) === normalized);
  if (!user) return { ok: false, error: 'Email atau kata sandi salah.' };
  if (user.status !== 'aktif') return { ok: false, error: 'Akun dinonaktifkan. Hubungi admin platform.' };

  try {
    const hash = await hashPassword(String(password ?? ''), user.salt);
    if (hash !== user.passwordHash) return { ok: false, error: 'Email atau kata sandi salah.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }

  setSession(user.id);
  return { ok: true, user };
}

/** Daftar akun baru (buyer/seller) dan langsung masuk. */
export async function register(payload) {
  const db = getDb();
  const result = validateRegistration(payload, db.users);
  if (!result.ok) return { ok: false, errors: result.errors, error: 'Periksa kembali data pendaftaran.' };

  const value = result.value;
  const salt = randomId('salt');
  let passwordHash;
  try {
    passwordHash = await hashPassword(value.password, salt);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const created = {
    id: randomId('u'),
    nama: value.nama,
    email: value.email,
    passwordHash,
    salt,
    role: value.role,
    status: 'aktif',
    telepon: value.telepon,
    kota: value.kota,
    alamat: value.alamat,
    toko: value.role === ROLES.SELLER ? { nama: value.tokoNama, kota: value.kota, deskripsi: '' } : null,
    createdAt: new Date().toISOString(),
  };

  db.users.push(created);
  persist();
  setSession(created.id);
  return { ok: true, user: created };
}

/* ================================================================== */
/* 4. Selector                                                        */
/* ================================================================== */

export function userById(id) {
  return getDb().users.find((u) => u.id === id) ?? null;
}

export function sellerName(user) {
  return user?.toko?.nama || user?.nama || 'Toko';
}

export function allUsers() {
  return [...getDb().users];
}

export function publicSellers() {
  return getDb().users.filter((u) => u.role === ROLES.SELLER && u.status === 'aktif');
}

export function allProducts() {
  return [...getDb().products];
}

export function sellerProducts(sellerId) {
  return getDb().products.filter((p) => p.sellerId === sellerId);
}

export function productById(id) {
  return getDb().products.find((p) => p.id === id) ?? null;
}

export function allOrders() {
  return [...getDb().orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function sellerOrders(sellerId) {
  return allOrders().filter((o) => o.sellerId === sellerId);
}

export function buyerOrders(buyerId) {
  return allOrders().filter((o) => o.buyerId === buyerId);
}

export function orderById(id) {
  return getDb().orders.find((o) => o.id === id) ?? null;
}

/* ================================================================== */
/* 5. Keranjang                                                       */
/* ================================================================== */

export function getCartRaw(userId) {
  const db = getDb();
  if (!db.carts[userId]) db.carts[userId] = [];
  return db.carts[userId];
}

/**
 * Baris keranjang yang sudah diperkaya data produk & toko.
 * Produk yang sudah tidak ada / nonaktif tetap ditampilkan agar bisa dihapus.
 */
export function cartLines(userId) {
  const db = getDb();
  return getCartRaw(userId)
    .map((entry) => {
      const product = db.products.find((p) => p.id === entry.productId);
      if (!product) return null;
      const seller = db.users.find((u) => u.id === product.sellerId);
      return {
        productId: product.id,
        nama: product.nama,
        harga: product.harga,
        qty: entry.qty,
        stok: product.stok,
        satuan: product.satuan,
        imageUrl: product.imageUrl,
        kategori: product.kategori,
        status: product.status,
        sellerId: product.sellerId,
        sellerName: sellerName(seller),
      };
    })
    .filter(Boolean);
}

export function cartCount(userId) {
  return getCartRaw(userId).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
}

/** Tambah produk ke keranjang (qty dibatasi stok). */
export function addToCart(userId, productId, qty = 1) {
  const db = getDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) return { ok: false, error: 'Produk tidak ditemukan.' };
  if (product.status !== 'aktif') return { ok: false, error: 'Produk sedang tidak dijual.' };
  if (product.stok <= 0) return { ok: false, error: 'Stok produk habis.' };

  const cart = getCartRaw(userId);
  const existing = cart.find((it) => it.productId === productId);
  const current = existing ? existing.qty : 0;
  const next = Math.min(product.stok, current + Math.max(1, Number(qty) || 1));
  if (next === current) return { ok: false, error: `Stok ${product.nama} hanya ${product.stok} ${product.satuan}.` };

  if (existing) existing.qty = next;
  else cart.push({ productId, qty: next });
  persist();
  return { ok: true, qty: next };
}

export function setCartQty(userId, productId, qty) {
  const db = getDb();
  const cart = getCartRaw(userId);
  const index = cart.findIndex((it) => it.productId === productId);
  if (index < 0) return { ok: false, error: 'Produk tidak ada di keranjang.' };

  const value = Math.floor(Number(qty) || 0);
  if (value <= 0) {
    cart.splice(index, 1);
    persist();
    return { ok: true, removed: true };
  }
  const product = db.products.find((p) => p.id === productId);
  const max = product ? product.stok : value;
  if (value > max) return { ok: false, error: `Stok tersedia hanya ${max} ${product?.satuan ?? ''}.` };

  cart[index].qty = value;
  persist();
  return { ok: true, qty: value };
}

export function removeFromCart(userId, productId) {
  const cart = getCartRaw(userId);
  const index = cart.findIndex((it) => it.productId === productId);
  if (index >= 0) {
    cart.splice(index, 1);
    persist();
  }
  return { ok: true };
}

export function clearCart(userId) {
  const db = getDb();
  db.carts[userId] = [];
  persist();
  return { ok: true };
}

/* ================================================================== */
/* 6. Checkout & pesanan                                              */
/* ================================================================== */

function nextOrderSeq(db) {
  db.meta.orderSeq = (Number(db.meta.orderSeq) || 1000) + 1;
  return db.meta.orderSeq;
}

/**
 * Buat pesanan dari keranjang. Pesanan dipecah otomatis per seller.
 * Stok produk dikurangi setelah seluruh validasi lolos.
 */
export function checkout(userId, payload) {
  const db = getDb();
  const validation = validateCheckout(payload);
  if (!validation.ok) return { ok: false, errors: validation.errors, error: 'Periksa data pengiriman.' };

  const entries = db.carts[userId] ?? [];
  if (entries.length === 0) return { ok: false, error: 'Keranjang masih kosong.' };

  const enriched = [];
  const problems = [];
  for (const entry of entries) {
    const product = db.products.find((p) => p.id === entry.productId);
    if (!product) {
      problems.push('Ada produk yang sudah tidak tersedia.');
      continue;
    }
    if (product.status !== 'aktif') {
      problems.push(`${product.nama} sedang tidak dijual.`);
      continue;
    }
    if (entry.qty > product.stok) {
      problems.push(`${product.nama}: stok tersisa ${product.stok} ${product.satuan}.`);
      continue;
    }
    enriched.push({
      ...entry,
      product,
      harga: product.harga,
      sellerId: product.sellerId,
    });
  }
  if (problems.length > 0) return { ok: false, error: problems.join(' ') };
  if (enriched.length === 0) return { ok: false, error: 'Keranjang tidak valid.' };

  const groups = groupBySeller(enriched);
  const now = new Date().toISOString();
  const orders = [];

  for (const [sellerId, lines] of groups) {
    const items = lines.map((line) => ({
      productId: line.product.id,
      nama: line.product.nama,
      harga: line.product.harga,
      qty: line.qty,
      satuan: line.product.satuan,
      imageUrl: line.product.imageUrl,
      kategori: line.product.kategori,
    }));
    const subtotal = items.reduce((sum, it) => sum + it.harga * it.qty, 0);
    const ongkir = shippingFor(subtotal);
    const seq = nextOrderSeq(db);
    const date = new Date();
    const stamp = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const order = {
      id: randomId('o'),
      kode: `TK-${stamp}-${String(seq).padStart(4, '0')}`,
      buyerId: userId,
      sellerId,
      items,
      subtotal,
      ongkir,
      total: subtotal + ongkir,
      status: 'menunggu',
      alamat: validation.value.alamat,
      catatan: validation.value.catatan,
      // Pembelian lewat keranjang selalu dibayar dengan transfer bank.
      metodeBayar: 'transfer',
      paymentBatchId: null,
      paymentStatus: 'menunggu_pembayaran',
      createdAt: now,
      updatedAt: now,
      timeline: [{ status: 'menunggu', at: now, by: userId, note: 'Pesanan dibuat pembeli.' }],
    };
    orders.push(order);
    db.orders.push(order);

    for (const line of lines) {
      line.product.stok = Math.max(0, line.product.stok - line.qty);
    }
  }

  // Satu tagihan transfer menggabungkan seluruh produk dari semua toko.
  const batch = {
    id: randomId('pay'),
    buyerId: userId,
    orderIds: orders.map((order) => order.id),
    subtotal: orders.reduce((sum, order) => sum + order.subtotal, 0),
    ongkir: orders.reduce((sum, order) => sum + order.ongkir, 0),
    total: orders.reduce((sum, order) => sum + order.total, 0),
    metode: 'transfer',
    status: 'menunggu_pembayaran',
    createdAt: now,
    confirmedAt: null,
    verifiedAt: null,
  };
  db.paymentBatches[batch.id] = batch;
  for (const order of orders) {
    order.paymentBatchId = batch.id;
    order.paymentStatus = 'menunggu_pembayaran';
  }

  db.carts[userId] = [];
  persist();
  return { ok: true, orders, batch };
}

/** Ambil tagihan transfer beserta seluruh pesanan di dalamnya. */
export function getPaymentBatch(batchId, userId = null) {
  const db = getDb();
  const batch = db.paymentBatches?.[batchId];
  if (!batch) return { ok: false, error: 'Tagihan pembayaran tidak ditemukan.' };
  if (userId && batch.buyerId !== userId) {
    return { ok: false, error: 'Tagihan ini bukan milik Anda.' };
  }
  const orders = batch.orderIds.map((id) => db.orders.find((order) => order.id === id)).filter(Boolean);
  return { ok: true, batch, orders };
}

/** Pembeli mengonfirmasi sudah melakukan transfer. */
export function confirmTransfer(batchId, userId) {
  const found = getPaymentBatch(batchId, userId);
  if (!found.ok) return found;
  const { batch, orders } = found;
  if (batch.status === 'lunas') return { ok: false, error: 'Pembayaran tagihan ini sudah lunas.' };
  if (batch.status === 'menunggu_verifikasi') return { ok: true, batch, orders };

  const now = new Date().toISOString();
  batch.status = 'menunggu_verifikasi';
  batch.confirmedAt = now;
  for (const order of orders) {
    order.paymentStatus = 'menunggu_verifikasi';
    order.updatedAt = now;
  }
  persist();
  return { ok: true, batch, orders };
}

/** Admin memverifikasi transfer dan menandai seluruh pesanan lunas. */
export function verifyTransfer(batchId, admin) {
  if (!admin || admin.role !== ROLES.ADMIN) {
    return { ok: false, error: 'Hanya admin yang dapat memverifikasi transfer.' };
  }
  const found = getPaymentBatch(batchId);
  if (!found.ok) return found;
  const { batch, orders } = found;
  if (batch.status === 'lunas') return { ok: false, error: 'Pembayaran tagihan ini sudah lunas.' };

  const now = new Date().toISOString();
  batch.status = 'lunas';
  batch.verifiedAt = now;
  for (const order of orders) {
    order.paymentStatus = 'lunas';
    order.updatedAt = now;
  }
  persist();
  return { ok: true, batch, orders };
}

/**
 * Ubah status pesanan dengan validasi peran, kepemilikan, dan transisi.
 * Pembatalan mengembalikan stok produk.
 */
export function updateOrderStatus(orderId, nextStatus, user, note = '') {
  if (!user) return { ok: false, error: 'Anda harus masuk terlebih dahulu.' };
  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Pesanan tidak ditemukan.' };

  if (user.role === ROLES.SELLER && order.sellerId !== user.id) {
    return { ok: false, error: 'Pesanan ini bukan milik toko Anda.' };
  }
  if (user.role === ROLES.BUYER && order.buyerId !== user.id) {
    return { ok: false, error: 'Pesanan ini bukan milik Anda.' };
  }
  if (!allowedTransitions(order.status, user.role).includes(nextStatus)) {
    return { ok: false, error: `Status tidak dapat diubah dari ${ORDER_STATUS_LABEL[order.status]} ke ${ORDER_STATUS_LABEL[nextStatus] ?? nextStatus}.` };
  }

  if (nextStatus === 'dibatalkan') {
    for (const item of order.items) {
      const product = db.products.find((p) => p.id === item.productId);
      if (product) product.stok += item.qty;
    }
  }

  const now = new Date().toISOString();
  order.status = nextStatus;
  order.updatedAt = now;
  order.timeline.push({
    status: nextStatus,
    at: now,
    by: user.id,
    note: note || `Status diperbarui ke ${ORDER_STATUS_LABEL[nextStatus]}.`,
  });
  persist();
  return { ok: true, order };
}

/* ================================================================== */
/* 7. Produk seller                                                   */
/* ================================================================== */

export function createProduct(user, values) {
  if (!user || user.role !== ROLES.SELLER) return { ok: false, error: 'Hanya seller yang dapat menambah produk.' };
  const db = getDb();
  const result = validateProductInput(values);
  if (!result.ok) return { ok: false, errors: result.errors, error: 'Periksa kembali data produk.' };

  const nums = db.products.map((p) => Number(String(p.id).match(/\d+/)?.[0] ?? 0));
  const next = Math.max(0, ...nums) + 1;
  const product = {
    id: `p-${String(next).padStart(2, '0')}`,
    sellerId: user.id,
    ...result.value,
    createdAt: new Date().toISOString(),
  };
  db.products.push(product);
  persist();
  return { ok: true, product };
}

export function updateProduct(user, id, values) {
  const db = getDb();
  const product = db.products.find((p) => p.id === id);
  if (!product) return { ok: false, error: 'Produk tidak ditemukan.' };
  if (user.role === ROLES.SELLER && product.sellerId !== user.id) {
    return { ok: false, error: 'Produk ini bukan milik toko Anda.' };
  }
  if (![ROLES.SELLER, ROLES.ADMIN].includes(user.role)) {
    return { ok: false, error: 'Anda tidak berhak mengubah produk.' };
  }

  const result = validateProductInput(values);
  if (!result.ok) return { ok: false, errors: result.errors, error: 'Periksa kembali data produk.' };

  Object.assign(product, result.value);
  persist();
  return { ok: true, product };
}

/** Hapus produk; produk yang sudah pernah dipesan hanya dinonaktifkan. */
export function deleteProduct(user, id) {
  const db = getDb();
  const product = db.products.find((p) => p.id === id);
  if (!product) return { ok: false, error: 'Produk tidak ditemukan.' };
  if (user.role === ROLES.SELLER && product.sellerId !== user.id) {
    return { ok: false, error: 'Produk ini bukan milik toko Anda.' };
  }
  const used = db.orders.some((o) => o.items.some((it) => it.productId === id));
  if (used) {
    product.status = 'nonaktif';
    persist();
    return { ok: true, deactivated: true };
  }
  db.products = db.products.filter((p) => p.id !== id);
  for (const userId of Object.keys(db.carts)) {
    db.carts[userId] = db.carts[userId].filter((it) => it.productId !== id);
  }
  persist();
  return { ok: true, deleted: true };
}

export function setProductStatus(user, id, status) {
  const db = getDb();
  const product = db.products.find((p) => p.id === id);
  if (!product) return { ok: false, error: 'Produk tidak ditemukan.' };
  if (![ROLES.SELLER, ROLES.ADMIN].includes(user?.role)) {
    return { ok: false, error: 'Anda tidak berhak mengubah produk.' };
  }
  if (user.role === ROLES.SELLER && product.sellerId !== user.id) {
    return { ok: false, error: 'Produk ini bukan milik toko Anda.' };
  }
  if (!['aktif', 'nonaktif'].includes(status)) return { ok: false, error: 'Status tidak valid.' };
  product.status = status;
  persist();
  return { ok: true, product };
}

/* ================================================================== */
/* 8. Administrasi pengguna                                           */
/* ================================================================== */

function activeAdmins(db) {
  return db.users.filter((u) => u.role === ROLES.ADMIN && u.status === 'aktif');
}

export function setUserStatus(admin, userId, status) {
  const db = getDb();
  if (!admin || admin.role !== ROLES.ADMIN) return { ok: false, error: 'Hanya admin yang dapat mengubah pengguna.' };
  if (!['aktif', 'nonaktif'].includes(status)) return { ok: false, error: 'Status tidak valid.' };
  const target = db.users.find((u) => u.id === userId);
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };
  if (target.id === admin.id) return { ok: false, error: 'Anda tidak dapat menonaktifkan akun sendiri.' };
  if (status === 'nonaktif' && target.role === ROLES.ADMIN && activeAdmins(db).length <= 1) {
    return { ok: false, error: 'Minimal harus ada satu admin aktif.' };
  }
  target.status = status;
  if (status === 'nonaktif') setSessionForUser(target.id, false);
  persist();
  return { ok: true, user: target };
}

export function setUserRole(admin, userId, role) {
  const db = getDb();
  if (!admin || admin.role !== ROLES.ADMIN) return { ok: false, error: 'Hanya admin yang dapat mengubah peran.' };
  if (![ROLES.ADMIN, ROLES.SELLER, ROLES.BUYER].includes(role)) return { ok: false, error: 'Peran tidak valid.' };
  const target = db.users.find((u) => u.id === userId);
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };
  if (target.id === admin.id) return { ok: false, error: 'Anda tidak dapat mengubah peran akun sendiri.' };
  if (target.role === ROLES.ADMIN && role !== ROLES.ADMIN && activeAdmins(db).length <= 1) {
    return { ok: false, error: 'Minimal harus ada satu admin aktif.' };
  }
  const wasSeller = target.role === ROLES.SELLER;
  target.role = role;
  if (role === ROLES.SELLER && !target.toko) {
    target.toko = { nama: `${target.nama} Store`, kota: target.kota || '-', deskripsi: '' };
  }
  if (role !== ROLES.SELLER && wasSeller) {
    // Toko yang tidak lagi berperan seller tidak boleh tampil di katalog.
    target.toko = null;
    for (const product of db.products) {
      if (product.sellerId === target.id) product.status = 'nonaktif';
    }
  }
  persist();
  return { ok: true, user: target };
}

function setSessionForUser(userId, on) {
  if (getSessionUserId() === userId) setSession(on ? userId : null);
}

/* ================================================================== */
/* 9. Inventori per seller (modul smart prep)                         */
/* ================================================================== */

/** Key localStorage terpisah untuk setiap seller. */
export function ingredientsKey(userId) {
  return `takarkopi:ingredients:${userId}:v1`;
}

export function loadSellerIngredients(user, today = new Date()) {
  const key = ingredientsKey(user.id);
  const result = loadIngredients(today, key);
  if (result.source === 'demo') saveIngredients(result.items, key);
  return result;
}

export function saveSellerIngredients(user, items) {
  return saveIngredients(items, ingredientsKey(user.id));
}

export function clearSellerIngredients(user) {
  clearIngredients(ingredientsKey(user.id));
}

export function sellerDemoIngredients(today = new Date()) {
  return demoIngredients(today);
}
