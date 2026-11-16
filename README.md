# ☕ TakarKopi

**Marketplace & Smart Prep Bahan Baku Kafe** — aplikasi dengan 3 jenis pengguna
(**admin**, **seller**, **pembeli**) yang menghubungkan supplier bahan baku dengan kafe,
lengkap dengan asisten prediksi persiapan pagi berbasis cuaca, kalender/event, dan
peringatan kedaluwarsa.

Data disimpan di **localStorage** (key `takarkopi:db:v2`) dengan data dummy siap pakai.
Skema **MySQL** yang setara tersedia di [`db/schema.sql`](db/schema.sql) untuk migrasi backend.

---

## Menjalankan

```bash
npm install
npm run dev      # server pengembangan (Vite, default http://localhost:5173)
npm run build    # bundel produksi ke dist/
npm run preview  # pratinjau hasil build
npm test         # uji logika domain (Vitest)
```

Tech stack: **Vite + Vanilla JavaScript + CSS**, tanpa framework UI.

---

## Akun demo

Klik langsung kartu akun di halaman masuk, atau gunakan kredensial berikut:

| Peran | Email | Kata sandi | Cakupan |
|---|---|---|---|
| 🛡️ Admin | `admin@takarkopi.id` | `Admin#2026` | Semua pengguna, produk, dan pesanan |
| 🏪 Seller | `toko@kopinusantara.id` | `Seller#2026` | Toko Kopi Nusantara (Banyuwangi) |
| 🏪 Seller | `hello@susumatcha.id` | `Seller#2026` | Toko Susu & Matcha Co (Banyuwangi) |
| 🛒 Pembeli | `kafe@senjakopi.id` | `Buyer#2026` | Senja Kopi (Banyuwangi) |
| 🛒 Pembeli | `barista@kopikita.id` | `Buyer#2026` | Kopi Kita (Banyuwangi) |

Kata sandi di-hash SHA-256 (`salt:password`) via Web Crypto; hash demo dibekukan di seed
agar akun contoh bisa dipakai tanpa server.

---

## Halaman profil (landing)

Sebelum masuk, pengunjung melihat **halaman profil publik** yang menjelaskan platform dan
produk yang dijual: hero animasi, lini produk (biji kopi, susu, matcha, sirup, pastry, es),
produk unggulan dari toko mitra, cerita TakarKopi, cara kerja 3 peran, daftar seller, dan CTA.

- **Animasi pembuka** singkat (sekali per sesi) dengan logo & uap kopi.
- **Hero bertahap** (staggered reveal) dan animasi mengambang untuk ilustrasi.
- **Reveal saat scroll** memakai `IntersectionObserver` + angka statistik yang berhitung.
- Tombol **Coba demo** langsung masuk sebagai pembeli/seller/admin.
- Aksen **batik Gajah Oling Banyuwangi** (aset `public/images/batik-gajah-oling.svg`)
  sebagai latar dekoratif hero, cerita, CTA, dan kartu motif.
- Menghormati `prefers-reduced-motion` (animasi dinonaktifkan otomatis).

Halaman masuk tetap di `#/login`, dan landing berada di `#/`.

---

## Fitur per peran

### 🛒 Pembeli
- **Dua cara beli**:
  - **Pesan via WA** — tombol di setiap produk membuka chat `wa.me` ke seller dengan
    detail produk, harga, dan data pembeli; stok/ongkir/pembayaran diurus lewat chat.
  - **Keranjang belanja** — kumpulkan produk dari beberapa toko, lalu checkout sekali.
- **Katalog** bahan baku dengan pencarian, filter kategori, harga per satuan, dan status stok.
- **Keranjang** dengan ubah jumlah, hapus item, dan batas otomatis sesuai stok.
- **Checkout transfer**: alamat + catatan; seluruh produk digabung menjadi **satu total**
  dan satu tagihan transfer, meski pesanan dipecah per seller untuk pengiriman
  (ongkir flat Rp15.000 per toko, gratis di atas Rp500.000).
- **Halaman pembayaran** (`#/pembayaran/<batchId>`): rekening tujuan (BCA/Mandiri),
  total gabungan, rincian pesanan, tombol “Saya Sudah Transfer”, lalu status
  `menunggu_pembayaran → menunggu_verifikasi → lunas` setelah diverifikasi admin.
- **Riwayat pesanan** + timeline status; pembeli bisa membatalkan pesanan yang masih
  menunggu dan mengonfirmasi penerimaan saat paket dikirim.

### 🏪 Seller
- **Ringkasan**: pendapatan pesanan selesai, pesanan perlu tindakan, produk aktif,
  nilai stok, dan daftar stok menipis.
- **Produk**: CRUD lengkap dengan validasi, pemilih gambar preset (`./images/...`),
  input URL gambar aman, status aktif/nonaktif, dan stok.
- **Pesanan masuk**: proses → kirim → selesai; pembatalan otomatis mengembalikan stok.
- **Smart Prep & Stok**: checklist prep berbasis cuaca/event/FIFO kedaluwarsa,
  CRUD bahan, penyesuaian stok, export/import JSON, dan reset data demo.
  Inventori disimpan terpisah per seller (`takarkopi:ingredients:<userId>:v1`).

### 🛡️ Admin
- **Ringkasan platform**: total pengguna (admin/seller/pembeli), produk tayang,
  GMV pesanan selesai, stok menipis, seller teratas, dan distribusi status pesanan.
- **Manajemen pengguna**: ubah peran (admin/seller/pembeli), aktifkan/nonaktifkan akun,
  dengan pengaman agar minimal satu admin aktif dan admin tidak menonaktifkan dirinya.
- **Moderasi produk** lintas toko: sembunyikan/tayangkan produk.
- **Semua pesanan**: filter status, proses, kirim, selesaikan, atau batalkan,
  serta **verifikasi transfer** untuk tagihan yang sudah dikonfirmasi pembeli.

---

## Model data

| Entitas | Field utama |
|---|---|
| `User` | `id`, `nama`, `email` (unik), `passwordHash`, `salt`, `role` (`admin`/`seller`/`buyer`), `status`, `toko` (seller) |
| `Product` | `id`, `sellerId`, `nama`, `kategori`, `satuan`, `harga`, `stok`, `deskripsi`, `imageUrl`, `status` |
| `Order` | `id`, `kode`, `buyerId`, `sellerId`, `items[]`, `subtotal`, `ongkir`, `total`, `status`, `alamat`, `metodeBayar`, `paymentBatchId`, `paymentStatus`, `timeline[]` |
| `PaymentBatch` | `id`, `buyerId`, `orderIds[]`, `subtotal`, `ongkir`, `total`, `metode` (`transfer`), `status`, `createdAt`, `confirmedAt`, `verifiedAt` |
| `Cart` | `carts[userId] = [{ productId, qty }]` |

Status pesanan: `menunggu → diproses → dikirim → selesai`, atau `dibatalkan`.
Transisi divalidasi per peran di `src/domain.js` (`allowedTransitions`).
Stok dipotong saat checkout dan dikembalikan otomatis saat pembatalan.

---

## Struktur proyek

```
index.html                # kerangka halaman (#app)
db/schema.sql             # skema MySQL 8 + data dummy (migrasi backend)
public/images/            # ilustrasi SVG lokal (bahan, hero kafe, batik Gajah Oling)
src/
  main.js                 # router hash, shell per peran, guard akses
  domain.js               # aturan bisnis murni: izin, transisi, validasi, ongkir, statistik
  store.js                # persistensi localStorage, seed, auth, cart, order, admin
  components.js           # komponen bersama: kartu pesanan, modal, produk, form
  ingredients.js          # domain inventori (dipakai Smart Prep seller)
  predictor.js            # mesin prediksi prep + util tanggal
  ui.js                   # helper DOM aman + komponen checklist/inventori
  app.css                 # gaya marketplace, auth, dashboard, responsif
  landing.css             # gaya halaman profil publik + animasi
  style.css               # tema dasar Hijau Matcha + Pink Stroberi
  views/
    landing.js            # profil publik: hero, lini produk, cerita, peran, mitra
    auth.js               # masuk & daftar (buyer/seller)
    buyer.js              # katalog, keranjang, checkout, riwayat pesanan
    seller.js             # ringkasan, produk, pesanan, smart prep
    admin.js              # ringkasan, pengguna, produk, pesanan
tests/
  predictor.test.js       # 60 uji mesin prediksi & validasi bahan
  logic.test.js           # 21 uji checklist, impor/ekspor, tanggal
  domain.test.js          # uji peran, transisi, keranjang/ongkir, validasi, statistik
```

---

## Keamanan & ketahanan

- **Anti-XSS**: seluruh data pengguna dirender lewat `textContent`/`createTextNode`
  (helper `el()` di `src/ui.js`), tanpa `innerHTML` untuk data dari pengguna.
- **Sanitasi URL gambar**: hanya `./images/...` atau `https://...`; `javascript:` dan
  `data:` ditolak (`sanitizeImageUrl`), plus fallback gambar default/emoji saat gagal muat.
- **Validasi berlapis**: produk, registrasi, dan checkout divalidasi di `src/domain.js`
  sebelum ditulis ke store; guard peran juga diterapkan di sisi operasi data (`store.js`),
  bukan hanya di UI.
- **Pengaman admin**: minimal satu admin aktif; admin tidak bisa menonaktifkan atau
  menurunkan peran akunnya sendiri; akun nonaktif tidak bisa masuk.
- **localStorage aman**: akses dibungkus `try/catch` (private mode / kuota penuh);
  data rusak otomatis jatuh ke seed demo.

> Catatan produksi: autentikasi localStorage bersifat demo di sisi klien. Untuk produksi
> multi-perangkat, pindahkan data & sesi ke backend (MySQL) memakai `db/schema.sql` —
> hash kata sandi sudah kompatibel dengan seed SQL.

---

## Migrasi ke MySQL

1. Jalankan `mysql -u root -p < db/schema.sql` untuk membuat database `takarkopi`,
   tabel, dan data dummy.
2. Buat lapisan API backend yang memakai tabel tersebut. Seluruh akses data aplikasi
   sudah dikumpulkan di `src/store.js`, sehingga tampilan tidak perlu diubah — cukup
   ganti implementasi fungsi store agar memanggil API (fetch) alih-alih localStorage.
3. Pindahkan `passwordHash`/`salt` ke proses server; jangan pernah mengirim hash ke browser.

---

## Uji

```bash
npm test
```

Mencakup prediksi cuaca/kalender, status kedaluwarsa, validasi bahan, sanitasi URL,
impor/ekspor JSON, izin per peran, transisi status pesanan, keranjang & ongkir,
validasi produk/registrasi/checkout, serta statistik dashboard.
