# ☕ TakarKopi

**Predictive Prep & Weather-Aware Inventory** — asisten digital untuk kafe UMKM yang menghitung
takaran persiapan pagi (*morning prep*) bahan baku segar berdasarkan rata-rata pemakaian, pemicu
eksternal (cuaca & kalender/event), serta peringatan dini kedaluwarsa.

Tujuannya sederhana: menekan **food waste** bahan basi dan mencegah **kehabisan stok** saat jam ramai.

---

## Menjalankan

```bash
npm install
npm run dev      # server pengembangan (default http://localhost:5173)
npm run build    # bundel produksi ke dist/
npm run preview  # pratinjau hasil build
npm test         # uji logika inti (Vitest, tanpa browser)
```

Tech stack: **Vite + Vanilla JavaScript**. Tanpa backend, tanpa login.

---

## Fitur

### A. Weather & Calendar Trigger
- **Cuaca hari ini:** `Cerah / Panas`, `Berawan`, `Hujan`.
- **Kalender & event:** `Hari Biasa`, `Akhir Pekan (Weekend)`, `Tanggal Gajian (Payday)`, `Musim Ujian Kampus`.
- **Penjelasan transparan:** tiap rekomendasi menampilkan alasan kalkulasi, mis.
  `Dasar 5.000 ml × Cuaca Panas (+30%) × Weekend (+25%)`.

### B. Smart Prep Checklist
- Rekomendasi takaran siap pakai + perbandingan dengan stok → **Stok cukup** atau **Perlu belanja · kurang X unit**.
- Checklist interaktif dengan bilah progres.
- **Peringatan dini kedaluwarsa (FIFO):**
  | Label | Rentang |
  |---|---|
  | 🚨 Kritis | `<= 2 hari` (atau sudah lewat) |
  | ⚠️ Perhatian | `3–5 hari` |
  | ✅ Aman | `> 5 hari` |
- Item diurutkan: kedaluwarsa paling mendesak lebih dulu, lalu item yang kurang stok.
- **Filter & pencarian:** saring per status (Kurang Stok / Hampir Kedaluwarsa / Kritis) atau per
  kategori, plus kotak pencarian nama bahan.

### C. Manajemen Bahan Baku (CRUD & Persistensi)
- 8 bahan contoh: Susu Fresh Milk, Susu UHT Full Cream, Simple Syrup, Es Batu Kristal,
  Espresso Blend, Croissant Butter, Sirup Aren, Matcha Powder.
- Kartu statistik ringkas: **Total Bahan**, **Kurang Stok**, **Hampir Kedaluwarsa**.
- Tambah / edit / hapus dengan konfirmasi.
- Tombol `− / +` pada tabel untuk memperbarui stok fisik.
- Persistensi `localStorage` pada key **`takarkopi:ingredients:v1`**.
- **Export JSON**, **Import JSON tervalidasi**, dan **Reset Data Demo**.
- Tombol **Dashboard Bahan** di header menggulir cepat ke bagian ini.

---

## Model Prediksi

Aditif dan mudah diaudit:

```
prep = round( pemakaianDasar × (1 + adjustCuaca + adjustKalender) × faktorKarakteristik )
```

- `adjustCuaca` / `adjustKalender` bergantung pada **kategori** bahan (lihat `src/lib/model.js`).
  Contoh: cuaca **Hujan** → Minuman Dingin `-20%`, Minuman Panas `+30%`.
- `faktorKarakteristik` meredam bahan yang tidak elastis terhadap lonjakan
  (Pastry `×0.8`, Bahan Umum `×0.75`, Minuman Dingin `×1`, Minuman Panas `×0.9`).
- Hasil dibulatkan dan minimal `1` unit agar checklist tetap bermakna.

Contoh: Susu Fresh Milk (Minuman Dingin, dasar 5.000 ml) pada **Cerah + Weekend**
→ `5000 × (1 + 0.30 + 0.25) × 1 = 7.750 ml`.

---

## Data Model (`Ingredient`)

| Field | Tipe | Aturan |
|---|---|---|
| `id` | string | Unik, pola `ing-NN`. |
| `nama` | string | Wajib, minimal 1 karakter setelah `trim`. |
| `kategori` | string | `Minuman Dingin` \| `Minuman Panas` \| `Pastry` \| `Bahan Umum`. |
| `satuan` | string | `ml`, `gram`, `pcs`, `kg`, … |
| `stokSaatIni` | number | `>= 0`. |
| `pemakaianDasar` | number | `> 0`. |
| `tanggalKedaluwarsa` | string | ISO `YYYY-MM-DD` (validasi tanggal nyata). |
| `ikon` | string | Emoji, mis. `🥛`, `🧊`, `🥐`, `☕`. |

---

## Keamanan & Ketahanan

- **Anti-XSS:** seluruh nilai pengguna dirender lewat `textContent`/`createTextNode`
  (helper di `src/ui.js`) — tidak ada `innerHTML` untuk data pengguna. Nama bahan berisi
  `<img onerror=…>` tetap tampil sebagai teks biasa.
- **Validasi ketat:** `src/ingredients.js` menormalkan & memvalidasi sebelum menyimpan,
  mengimpor, atau memuat.
- **`JSON.parse` dibungkus `try/catch`:** data `localStorage` yang rusak / bukan JSON valid
  otomatis jatuh ke **Data Demo** disertai notifikasi.
- **Akses `localStorage` aman:** ditangani saat private mode / kuota penuh.

---

## Struktur Proyek

```
index.html            # kerangka halaman (header + banner hero)
public/
  images/             # aset ilustrasi SVG lokal (hijau-pink)
    cafe-hero.svg     # banner header
    milk.svg uht.svg syrup.svg ice.svg coffee.svg croissant.svg aren.svg matcha.svg
src/
  main.js             # entry point / orkestrator: state, event, render
  predictor.js        # mesin prediksi + skenario cuaca/kalender + util tanggal
  ingredients.js      # domain bahan: data demo, validasi (termasuk sanitasi URL gambar), persistensi, CRUD, stok
  ui.js               # seluruh tampilan: DOM helper, thumbnail aman, toast, trigger, stats, checklist, CRUD, export/import
  style.css           # tema terang Hijau Matcha + Pink Stroberi, responsif
tests/
  predictor.test.js   # 55 uji Vitest: calculateDailyPrep, getExpiryStatus, filterIngredients, validasi, impor JSON, keamanan URL gambar
  logic.test.js       # 21 uji Vitest: checklist, validasi, export/import, util tanggal
vite.config.js        # konfigurasi Vite (base: './')
```

Uji dijalankan dengan **Vitest** (`npm test` → `vitest run`); total 76 uji.

### Tema & aset
- Palet: latar `#F5F9F6`, permukaan `#FFFFFF`, border `#DCEBE3`, teks `#1B2E25` / `#4F685B`.
  Aksen **Hijau Matcha `#2D6A4F`** (tombol utama, progress prep, lencana "aman") dan
  **Pink Stroberi `#D64572` / Blush `#FDECEF`** (tombol Dashboard, trigger aktif, lencana peringatan).
- Setiap bahan memiliki `imageUrl` relatif (`./images/...`) dan dirender sebagai `<img class="ingredient-thumb">`
  dengan **fallback emoji** bila gambar gagal dimuat.
- `sanitizeImageUrl` hanya mengizinkan `./images/...` atau `https://`; `javascript:` dan `data:text/html` ditolak.

---

## API Logika (Fungsi Murni)

Tiga fungsi murni utama di `src/predictor.js` (tanpa DOM, mudah diuji):

| Fungsi | Deskripsi |
|---|---|
| `calculateDailyPrep(ingredient, { weather, eventDay })` | Rekomendasi takaran prep harian + teks `penjelasan` rumus. `weather`: `panas`\|`berawan`\|`hujan`; `eventDay`: `biasa`\|`weekend`\|`gajian`\|`ujian`. |
| `getExpiryStatus(tanggalKedaluwarsa, referenceDate)` | Status `aman` \| `peringatan` (≤ 2 hari) \| `kedaluwarsa`, plus `hari`, `label`, `keterangan`. |
| `filterIngredients(items, { query, kategori, onlyShortage })` | Saring bahan berdasarkan kata kunci, kategori, dan/atau hanya yang stoknya kurang. |

`computePrediction`, `expiryStatus`, dan `filterChecklist` (dipakai UI) tetap tersedia sebagai
pembungkus/pelengkap: `computePrediction` mendelegasikan ke `calculateDailyPrep`, sedangkan
`expiryStatus` menambahkan label 4 tingkat (Kritis/Perhatian/Aman/Lewat) di atas `getExpiryStatus`.

---

## Rencana Migrasi Produksi (Out-of-Scope MVP)

Fitur berikut sengaja ditunda dan menjadi langkah lanjutan:

1. **Cuaca real-time.** Ganti pemilih simulasi dengan integrasi API cuaca (mis. OpenWeather/BMKG)
   yang memetakan kode cuaca → `adjustCuaca`. Struktur `WEATHER` di `predictor.js` sudah kompatibel.
2. **Integrasi POS.** Sinkronkan `pemakaianDasar` dengan penjualan nyata (harian/mingguan) alih-alih
   angka manual; tambahkan job agregasi untuk memutakhirkan rata-rata bergerak.
3. **Multi-cabang & autentikasi.** Pindahkan persistensi `localStorage` ke backend
   (REST/Postgres) dengan autentikasi per-cabang dan sinkronisasi perangkat.
4. **Notifikasi & pelaporan.** Pengingat kedaluwarsa (push/WhatsApp), laporan food-waste
   mingguan, dan prediksi bahan berbasis pembelajaran mesin bila data historis sudah cukup.

Karena logika prediksi, validasi, dan persistensi sudah dipisah dari lapisan UI, penggantian
sumber data (cuaca, POS, backend) tidak memerlukan perubahan besar pada tampilan.
