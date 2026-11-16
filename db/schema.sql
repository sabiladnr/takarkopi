-- ==========================================================================
-- TakarKopi Marketplace — skema MySQL 8 + data dummy
--
-- Aplikasi demo berjalan dengan localStorage (lihat src/store.js). File ini
-- adalah skema padanan untuk migrasi ke backend produksi (MySQL).
--
-- Pemakaian:
--   mysql -u root -p < db/schema.sql
-- ==========================================================================

CREATE DATABASE IF NOT EXISTS takarkopi
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE takarkopi;

-- --------------------------------------------------------------------------
-- Pengguna: admin platform, seller (supplier), buyer (kafe)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           VARCHAR(32)  NOT NULL PRIMARY KEY,
  nama         VARCHAR(60)  NOT NULL,
  email        VARCHAR(120) NOT NULL,
  password_hash CHAR(64)    NOT NULL,
  salt         VARCHAR(40)  NOT NULL,
  role         ENUM('admin', 'seller', 'buyer') NOT NULL DEFAULT 'buyer',
  status       ENUM('aktif', 'nonaktif') NOT NULL DEFAULT 'aktif',
  telepon      VARCHAR(20)  NOT NULL DEFAULT '',
  kota         VARCHAR(60)  NOT NULL DEFAULT '',
  alamat       VARCHAR(300) NOT NULL DEFAULT '',
  toko_nama    VARCHAR(60)  NULL,
  toko_kota    VARCHAR(60)  NULL,
  toko_deskripsi VARCHAR(300) NOT NULL DEFAULT '',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Produk milik seller
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  seller_id   VARCHAR(32)  NOT NULL,
  nama        VARCHAR(80)  NOT NULL,
  kategori    ENUM('Biji Kopi', 'Susu', 'Sirup & Gula', 'Matcha & Teh', 'Pastry', 'Lainnya') NOT NULL,
  satuan      VARCHAR(16)  NOT NULL,
  harga       INT UNSIGNED NOT NULL,
  stok        INT UNSIGNED NOT NULL DEFAULT 0,
  deskripsi   VARCHAR(400) NOT NULL DEFAULT '',
  image_url   VARCHAR(300) NOT NULL DEFAULT './images/milk.svg',
  status      ENUM('aktif', 'nonaktif') NOT NULL DEFAULT 'aktif',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_seller FOREIGN KEY (seller_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_products_seller_status (seller_id, status),
  KEY idx_products_kategori (kategori),
  CONSTRAINT chk_products_harga CHECK (harga > 0)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Pesanan (dipecah per seller saat checkout)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  kode         VARCHAR(32)  NOT NULL,
  buyer_id     VARCHAR(32)  NOT NULL,
  seller_id    VARCHAR(32)  NOT NULL,
  subtotal     INT UNSIGNED NOT NULL,
  ongkir       INT UNSIGNED NOT NULL DEFAULT 0,
  total        INT UNSIGNED NOT NULL,
  status       ENUM('menunggu', 'diproses', 'dikirim', 'selesai', 'dibatalkan') NOT NULL DEFAULT 'menunggu',
  alamat       VARCHAR(300) NOT NULL,
  catatan      VARCHAR(300) NOT NULL DEFAULT '',
  metode_bayar ENUM('transfer', 'ewallet', 'cod') NOT NULL DEFAULT 'transfer',
  payment_batch_id VARCHAR(40) NULL,
  payment_status ENUM('menunggu_pembayaran', 'menunggu_verifikasi', 'lunas') NOT NULL DEFAULT 'menunggu_pembayaran',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_kode (kode),
  CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_seller FOREIGN KEY (seller_id) REFERENCES users (id) ON DELETE RESTRICT,
  KEY idx_orders_status (status),
  KEY idx_orders_buyer (buyer_id),
  KEY idx_orders_seller (seller_id),
  KEY idx_orders_payment_batch (payment_batch_id)
) ENGINE=InnoDB;

-- Satu tagihan transfer yang menggabungkan pesanan lintas toko dari satu keranjang.
CREATE TABLE IF NOT EXISTS payment_batches (
  id           VARCHAR(40) NOT NULL PRIMARY KEY,
  buyer_id     VARCHAR(32) NOT NULL,
  subtotal     INT UNSIGNED NOT NULL,
  ongkir       INT UNSIGNED NOT NULL DEFAULT 0,
  total        INT UNSIGNED NOT NULL,
  metode       ENUM('transfer') NOT NULL DEFAULT 'transfer',
  status       ENUM('menunggu_pembayaran', 'menunggu_verifikasi', 'lunas') NOT NULL DEFAULT 'menunggu_pembayaran',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME NULL,
  verified_at  DATETIME NULL,
  CONSTRAINT fk_batches_buyer FOREIGN KEY (buyer_id) REFERENCES users (id) ON DELETE RESTRICT,
  KEY idx_batches_buyer_status (buyer_id, status)
) ENGINE=InnoDB;

-- Snapshot item pesanan (harga & nama dibekukan saat checkout).
CREATE TABLE IF NOT EXISTS order_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id     VARCHAR(40)  NOT NULL,
  product_id   VARCHAR(32)  NOT NULL,
  nama         VARCHAR(80)  NOT NULL,
  kategori     VARCHAR(32)  NOT NULL DEFAULT 'Lainnya',
  harga        INT UNSIGNED NOT NULL,
  qty          INT UNSIGNED NOT NULL,
  satuan       VARCHAR(16)  NOT NULL,
  image_url    VARCHAR(300) NOT NULL DEFAULT '',
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  KEY idx_items_product (product_id),
  CONSTRAINT chk_items_qty CHECK (qty > 0)
) ENGINE=InnoDB;

-- Riwayat perubahan status pesanan.
CREATE TABLE IF NOT EXISTS order_timeline (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id   VARCHAR(40) NOT NULL,
  status     ENUM('menunggu', 'diproses', 'dikirim', 'selesai', 'dibatalkan') NOT NULL,
  at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  by_user    VARCHAR(32) NULL,
  note       VARCHAR(300) NOT NULL DEFAULT '',
  CONSTRAINT fk_timeline_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  KEY idx_timeline_order (order_id, at)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Keranjang (satu baris per produk per pengguna)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
  user_id    VARCHAR(32) NOT NULL,
  product_id VARCHAR(32) NOT NULL,
  qty        INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT chk_cart_qty CHECK (qty > 0)
) ENGINE=InnoDB;

-- ==========================================================================
-- DATA DUMMY (kata sandi demo, SHA-256 dari "salt:password")
--   admin@takarkopi.id / Admin#2026
--   toko@kopinusantara.id / Seller#2026
--   hello@susumatcha.id / Seller#2026
--   kafe@senjakopi.id / Buyer#2026
--   barista@kopikita.id / Buyer#2026
-- ==========================================================================

INSERT INTO users (id, nama, email, password_hash, salt, role, status, telepon, kota, alamat, toko_nama, toko_kota, toko_deskripsi, created_at) VALUES
('u-admin', 'Rani Admin', 'admin@takarkopi.id',
 '880d3605fcce243516dafaec5a2fbd34f82bd1080341619f4b61be9283766686',
 'tk-admin-7f3a', 'admin', 'aktif', '6281100000001', 'Banyuwangi', '', NULL, NULL, '', DATE_SUB(NOW(), INTERVAL 180 DAY)),
('u-seller-1', 'Bagas Pratama', 'toko@kopinusantara.id',
 'aeefbf3715b18dd6f433a84a68ff7db1b75258e1855857f3df22b352a1070c07',
 'tk-seller1-9c1d', 'seller', 'aktif', '6281200000002', 'Banyuwangi', 'Jl. Ahmad Yani No. 12, Banyuwangi',
 'Kopi Nusantara', 'Banyuwangi', 'Supplier biji kopi & dairy untuk kafe.', DATE_SUB(NOW(), INTERVAL 150 DAY)),
('u-seller-2', 'Maya Sari', 'hello@susumatcha.id',
 '841da203c4f029d1bb713f8d1b6b172c8afeb19fd1c41023a968e66c4cbd17f8',
 'tk-seller2-4b8e', 'seller', 'aktif', '6281300000003', 'Banyuwangi', 'Jl. Basuki Rahmat No. 8, Banyuwangi',
 'Susu & Matcha Co', 'Banyuwangi', 'Susu artisan, matcha premium, dan pastry.', DATE_SUB(NOW(), INTERVAL 120 DAY)),
('u-buyer-1', 'Dimas Wirawan', 'kafe@senjakopi.id',
 '69f14a9f5b5f6317fe42bfe6ddd3632c2239b0936e631ea1a7eb7f5a202bc961',
 'tk-buyer1-2d6f', 'buyer', 'aktif', '6281400000004', 'Banyuwangi', 'Senja Kopi, Jl. Gajah Mada No. 45, Banyuwangi',
 NULL, NULL, '', DATE_SUB(NOW(), INTERVAL 90 DAY)),
('u-buyer-2', 'Nadia Kusuma', 'barista@kopikita.id',
 '6f6976c9f2cbe27eba6a6d64485971fea033a95d5d40bc4abf325157cabda25e',
 'tk-buyer2-8a0c', 'buyer', 'aktif', '6281500000005', 'Banyuwangi', 'Kopi Kita, Jl. Diponegoro No. 21, Banyuwangi',
 NULL, NULL, '', DATE_SUB(NOW(), INTERVAL 60 DAY));

INSERT INTO products (id, seller_id, nama, kategori, satuan, harga, stok, deskripsi, image_url, status, created_at) VALUES
('p-01', 'u-seller-1', 'Espresso Blend House', 'Biji Kopi', 'kg', 185000, 42, 'Arabika Gayo medium roast, cocok untuk espresso harian kafe.', './images/coffee.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 120 DAY)),
('p-02', 'u-seller-1', 'Susu Fresh Milk 1L', 'Susu', 'liter', 24000, 60, 'Susu segar pasteurisasi, tekstur creamy untuk latte.', './images/milk.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 118 DAY)),
('p-03', 'u-seller-1', 'Susu UHT Full Cream', 'Susu', 'liter', 21000, 8, 'Susu UHT tahan lama, stok penyangga saat akhir pekan.', './images/uht.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 110 DAY)),
('p-04', 'u-seller-1', 'Simple Syrup', 'Sirup & Gula', 'liter', 18000, 25, 'Gula cair 1:1, mudah larut untuk minuman dingin.', './images/syrup.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 100 DAY)),
('p-05', 'u-seller-1', 'Gula Aren Cair', 'Sirup & Gula', 'liter', 32000, 14, 'Gula aren asli tanpa pengawet, aroma karamel kuat.', './images/aren.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 95 DAY)),
('p-06', 'u-seller-1', 'Es Batu Kristal', 'Lainnya', 'pack', 12000, 30, 'Es batu kristal bening, 1 pack berisi 2 kg.', './images/ice.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 80 DAY)),
('p-07', 'u-seller-1', 'Croissant Butter', 'Pastry', 'pcs', 14000, 18, 'Croissant butter panggang harian, renyah di luar.', './images/croissant.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 70 DAY)),
('p-08', 'u-seller-2', 'Oat Milk Barista', 'Susu', 'liter', 38000, 36, 'Susu oat khusus barista, foam stabil untuk latte art.', './images/milk.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 100 DAY)),
('p-09', 'u-seller-2', 'Matcha Powder Premium', 'Matcha & Teh', 'pack', 125000, 22, 'Matcha Uji ceremonial grade, 100 gram per pack.', './images/matcha.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 98 DAY)),
('p-10', 'u-seller-2', 'Stroberi Puree', 'Sirup & Gula', 'botol', 45000, 12, 'Puree stroberi asli tanpa pewarna buatan, 1 liter.', './images/syrup.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 88 DAY)),
('p-11', 'u-seller-2', 'Butter Croissant', 'Pastry', 'pcs', 15000, 6, 'Croissant butter premium, dipanggang setiap pagi.', './images/croissant.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 60 DAY)),
('p-12', 'u-seller-2', 'Oat Cream UHT', 'Susu', 'liter', 41000, 20, 'Krim oat UHT untuk cold foam dan frappe.', './images/uht.svg', 'aktif', DATE_SUB(NOW(), INTERVAL 50 DAY));

INSERT INTO orders (id, kode, buyer_id, seller_id, subtotal, ongkir, total, status, alamat, catatan, metode_bayar, created_at, updated_at) VALUES
('o-1001', 'TK-1001', 'u-buyer-1', 'u-seller-1', 160000, 15000, 175000, 'selesai',
 'Senja Kopi, Jl. Gajah Mada No. 45, Banyuwangi', '', 'transfer', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),
('o-1002', 'TK-1002', 'u-buyer-2', 'u-seller-1', 269000, 15000, 284000, 'dikirim',
 'Kopi Kita, Jl. Diponegoro No. 21, Banyuwangi', '', 'transfer', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),
('o-1003', 'TK-1003', 'u-buyer-1', 'u-seller-2', 310000, 15000, 325000, 'menunggu',
 'Senja Kopi, Jl. Gajah Mada No. 45, Banyuwangi', 'Mohon dikirim sebelum jam 9 pagi.', 'ewallet', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('o-1004', 'TK-1004', 'u-buyer-2', 'u-seller-2', 217000, 15000, 232000, 'diproses',
 'Kopi Kita, Jl. Diponegoro No. 21, Banyuwangi', '', 'transfer', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 20 HOUR)),
('o-1005', 'TK-1005', 'u-buyer-1', 'u-seller-1', 60000, 15000, 75000, 'dibatalkan',
 'Senja Kopi, Jl. Gajah Mada No. 45, Banyuwangi', '', 'transfer', DATE_SUB(NOW(), INTERVAL 9 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY)),
('o-1006', 'TK-1006', 'u-buyer-2', 'u-seller-1', 406000, 15000, 421000, 'selesai',
 'Kopi Kita, Jl. Diponegoro No. 21, Banyuwangi', '', 'transfer', DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 11 DAY));

INSERT INTO order_items (order_id, product_id, nama, kategori, harga, qty, satuan, image_url) VALUES
('o-1001', 'p-02', 'Susu Fresh Milk 1L', 'Susu', 24000, 4, 'liter', './images/milk.svg'),
('o-1001', 'p-05', 'Gula Aren Cair', 'Sirup & Gula', 32000, 2, 'liter', './images/aren.svg'),
('o-1002', 'p-01', 'Espresso Blend House', 'Biji Kopi', 185000, 1, 'kg', './images/coffee.svg'),
('o-1002', 'p-07', 'Croissant Butter', 'Pastry', 14000, 6, 'pcs', './images/croissant.svg'),
('o-1003', 'p-09', 'Matcha Powder Premium', 'Matcha & Teh', 125000, 2, 'pack', './images/matcha.svg'),
('o-1003', 'p-11', 'Butter Croissant', 'Pastry', 15000, 4, 'pcs', './images/croissant.svg'),
('o-1004', 'p-10', 'Stroberi Puree', 'Sirup & Gula', 45000, 3, 'botol', './images/syrup.svg'),
('o-1004', 'p-12', 'Oat Cream UHT', 'Susu', 41000, 2, 'liter', './images/uht.svg'),
('o-1005', 'p-03', 'Susu UHT Full Cream', 'Susu', 21000, 2, 'liter', './images/uht.svg'),
('o-1005', 'p-04', 'Simple Syrup', 'Sirup & Gula', 18000, 1, 'liter', './images/syrup.svg'),
('o-1006', 'p-01', 'Espresso Blend House', 'Biji Kopi', 185000, 2, 'kg', './images/coffee.svg'),
('o-1006', 'p-06', 'Es Batu Kristal', 'Lainnya', 12000, 3, 'pack', './images/ice.svg');

INSERT INTO order_timeline (order_id, status, at, by_user, note) VALUES
('o-1001', 'menunggu', DATE_SUB(NOW(), INTERVAL 6 DAY), 'u-buyer-1', 'Pesanan dibuat pembeli.'),
('o-1001', 'diproses', DATE_SUB(NOW(), INTERVAL 5 DAY), 'u-seller-1', 'Pesanan diproses seller.'),
('o-1001', 'dikirim', DATE_SUB(NOW(), INTERVAL 5 DAY), 'u-seller-1', 'Pesanan dikirim.'),
('o-1001', 'selesai', DATE_SUB(NOW(), INTERVAL 5 DAY), 'u-buyer-1', 'Pesanan selesai.'),
('o-1002', 'menunggu', DATE_SUB(NOW(), INTERVAL 2 DAY), 'u-buyer-2', 'Pesanan dibuat pembeli.'),
('o-1002', 'diproses', DATE_SUB(NOW(), INTERVAL 1 DAY), 'u-seller-1', 'Pesanan diproses seller.'),
('o-1002', 'dikirim', DATE_SUB(NOW(), INTERVAL 1 DAY), 'u-seller-1', 'Pesanan dikirim.'),
('o-1003', 'menunggu', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'u-buyer-1', 'Pesanan dibuat pembeli.'),
('o-1004', 'menunggu', DATE_SUB(NOW(), INTERVAL 1 DAY), 'u-buyer-2', 'Pesanan dibuat pembeli.'),
('o-1004', 'diproses', DATE_SUB(NOW(), INTERVAL 20 HOUR), 'u-seller-2', 'Pesanan diproses seller.'),
('o-1005', 'menunggu', DATE_SUB(NOW(), INTERVAL 9 DAY), 'u-buyer-1', 'Pesanan dibuat pembeli.'),
('o-1005', 'dibatalkan', DATE_SUB(NOW(), INTERVAL 9 DAY), 'u-buyer-1', 'Dibatalkan pembeli.'),
('o-1006', 'menunggu', DATE_SUB(NOW(), INTERVAL 12 DAY), 'u-buyer-2', 'Pesanan dibuat pembeli.'),
('o-1006', 'selesai', DATE_SUB(NOW(), INTERVAL 11 DAY), 'u-seller-1', 'Pesanan selesai.');
