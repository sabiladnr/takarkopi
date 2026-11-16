/**
 * Uji aturan bisnis marketplace TakarKopi (tanpa DOM / localStorage).
 * Jalankan: npm test
 */

import { describe, it, expect } from 'vitest';

import {
  ROLES,
  ROLE_HOME,
  can,
  cartTotals,
  groupBySeller,
  shippingFor,
  allowedTransitions,
  canTransition,
  summarizeOrders,
  validateProductInput,
  validateRegistration,
  validateCheckout,
  isLowStock,
  inventoryValue,
  countLowStock,
  defaultProductImage,
  formatIDR,
  initials,
  buildOrderWhatsAppUrl,
  PAYMENT_STATUS_LABEL,
  TRANSFER_ACCOUNTS,
  SHIPPING_FLAT,
  FREE_SHIPPING_MIN,
} from '../src/domain.js';

describe('peran & izin', () => {
  it('setiap peran memiliki halaman awal dan izin yang sesuai', () => {
    expect(ROLE_HOME.admin).toBe('#/admin');
    expect(ROLE_HOME.seller).toBe('#/seller');
    expect(ROLE_HOME.buyer).toBe('#/katalog');

    expect(can(ROLES.BUYER, 'catalog:view')).toBe(true);
    expect(can(ROLES.BUYER, 'users:manage')).toBe(false);
    expect(can(ROLES.SELLER, 'products:manage-own')).toBe(true);
    expect(can(ROLES.ADMIN, 'users:manage')).toBe(true);
    expect(can('unknown', 'catalog:view')).toBe(false);
  });
});

describe('keranjang & ongkir', () => {
  it('menghitung subtotal, jumlah item, dan ongkir per toko', () => {
    const totals = cartTotals([
      { sellerId: 's1', harga: 24000, qty: 2 },
      { sellerId: 's1', harga: 18000, qty: 1 },
      { sellerId: 's2', harga: 45000, qty: 1 },
    ]);
    expect(totals.subtotal).toBe(111000);
    expect(totals.count).toBe(4);
    expect(totals.sellerCount).toBe(2);
    expect(totals.shipping).toBe(SHIPPING_FLAT * 2);
    expect(totals.total).toBe(111000 + SHIPPING_FLAT * 2);
  });

  it('ongkir gratis per toko di atas ambang free shipping', () => {
    expect(shippingFor(0)).toBe(0);
    expect(shippingFor(FREE_SHIPPING_MIN - 1)).toBe(SHIPPING_FLAT);
    expect(shippingFor(FREE_SHIPPING_MIN)).toBe(0);

    const totals = cartTotals([{ sellerId: 's1', harga: 600000, qty: 1 }]);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(600000);
  });

  it('mengabaikan baris qty 0 dan mengelompokkan per seller', () => {
    const totals = cartTotals([{ sellerId: 's1', harga: 1000, qty: 0 }]);
    expect(totals.count).toBe(0);
    expect(totals.total).toBe(0);

    const groups = groupBySeller([
      { sellerId: 's1', nama: 'A' },
      { sellerId: 's2', nama: 'B' },
      { sellerId: 's1', nama: 'C' },
    ]);
    expect(groups.get('s1')).toHaveLength(2);
    expect(groups.get('s2')).toHaveLength(1);
  });
});

describe('transisi status pesanan', () => {
  it('mengikuti alur menunggu → diproses → dikirim → selesai', () => {
    expect(allowedTransitions('menunggu', 'seller')).toContain('diproses');
    expect(allowedTransitions('diproses', 'seller')).toContain('dikirim');
    expect(allowedTransitions('dikirim', 'seller')).toEqual(['selesai']);
    expect(canTransition('dikirim', 'diproses', 'seller')).toBe(false);
    expect(allowedTransitions('selesai', 'admin')).toEqual([]);
  });

  it('pembeli hanya boleh membatalkan (menunggu) atau konfirmasi terima (dikirim)', () => {
    expect(allowedTransitions('menunggu', 'buyer')).toEqual(['dibatalkan']);
    expect(allowedTransitions('diproses', 'buyer')).toEqual([]);
    expect(allowedTransitions('dikirim', 'buyer')).toEqual(['selesai']);
  });

  it('admin boleh mengelola semua transisi valid', () => {
    expect(allowedTransitions('menunggu', 'admin')).toEqual(['diproses', 'dibatalkan']);
    expect(allowedTransitions('dikirim', 'admin')).toEqual(['selesai']);
  });
});

describe('validasi produk', () => {
  const valid = {
    nama: 'Espresso Blend',
    kategori: 'Biji Kopi',
    satuan: 'kg',
    harga: '185000',
    stok: '12',
    deskripsi: 'Arabika medium roast',
    imageUrl: './images/coffee.svg',
    status: 'aktif',
  };

  it('menerima produk valid dan menormalkan angka', () => {
    const result = validateProductInput(valid);
    expect(result.ok).toBe(true);
    expect(result.value.harga).toBe(185000);
    expect(result.value.stok).toBe(12);
    expect(result.value.imageUrl).toBe('./images/coffee.svg');
  });

  it('mengisi gambar default bila URL kosong', () => {
    const result = validateProductInput({ ...valid, imageUrl: '' });
    expect(result.ok).toBe(true);
    expect(result.value.imageUrl).toBe('./images/coffee.svg');
  });

  it('menolak URL gambar berbahaya (anti-XSS)', () => {
    const result = validateProductInput({ ...valid, imageUrl: 'javascript:alert(1)' });
    expect(result.ok).toBe(false);
    expect(result.errors.imageUrl).toMatch(/images/);
  });

  it('menolak field tidak valid', () => {
    const result = validateProductInput({ ...valid, nama: '', kategori: 'Entah', harga: 0, stok: -1 });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['harga', 'kategori', 'nama', 'stok']);
  });

  it('mendukung gambar produk default per kategori', () => {
    expect(defaultProductImage('Susu')).toBe('./images/milk.svg');
    expect(defaultProductImage('Matcha & Teh')).toBe('./images/matcha.svg');
    expect(defaultProductImage('Tidak Ada')).toBe('./images/milk.svg');
  });
});

describe('validasi registrasi', () => {
  const existing = [{ email: 'kafe@senjakopi.id' }];

  it('menerima pembeli baru dengan data lengkap', () => {
    const result = validateRegistration(
      { nama: 'Kafe Baru', email: 'baru@kafe.id', password: 'rahasia123', role: 'buyer' },
      existing,
    );
    expect(result.ok).toBe(true);
    expect(result.value.email).toBe('baru@kafe.id');
    expect(result.value.tokoNama).toBe('');
  });

  it('mewajibkan nama toko untuk seller', () => {
    const result = validateRegistration(
      { nama: 'Toko Baru', email: 'toko@baru.id', password: 'rahasia123', role: 'seller' },
      existing,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.tokoNama).toBeTruthy();
  });

  it('menolak email duplikat, format salah, dan peran admin', () => {
    expect(
      validateRegistration(
        { nama: 'Duplikat', email: 'KAFE@senjakopi.id', password: 'rahasia123', role: 'buyer' },
        existing,
      ).errors.email,
    ).toBeTruthy();

    expect(
      validateRegistration({ nama: 'X', email: 'bukan-email', password: 'pendek', role: 'buyer' }, existing).ok,
    ).toBe(false);

    expect(
      validateRegistration(
        { nama: 'Admin Palsu', email: 'palsu@x.id', password: 'rahasia123', role: 'admin' },
        existing,
      ).errors.role,
    ).toBeTruthy();
  });
});

describe('checkout, statistik, & util', () => {
  it('memvalidasi alamat dan metode pembayaran', () => {
    expect(validateCheckout({ alamat: 'pendek', metode: 'bitcoin' }).ok).toBe(false);
    const ok = validateCheckout({ alamat: 'Jl. Gajah Mada No. 45, Banyuwangi', catatan: '', metode: 'cod' });
    expect(ok.ok).toBe(true);
    expect(ok.value.metode).toBe('cod');
  });

  it('meringkas pesanan: total, GMV selesai, dan jumlah per status', () => {
    const summary = summarizeOrders([
      { status: 'selesai', total: 100000 },
      { status: 'selesai', total: 50000 },
      { status: 'menunggu', total: 20000 },
      { status: 'dibatalkan', total: 90000 },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.revenue).toBe(150000);
    expect(summary.byStatus.menunggu).toBe(1);
    expect(summary.byStatus.dibatalkan).toBe(1);
    expect(summary.pending).toBe(1);
  });

  it('menghitung stok menipis dan nilai persediaan', () => {
    const products = [
      { harga: 1000, stok: 5 },
      { harga: 2000, stok: 50 },
    ];
    expect(isLowStock(products[0])).toBe(true);
    expect(isLowStock(products[1])).toBe(false);
    expect(countLowStock(products)).toBe(1);
    expect(inventoryValue(products)).toBe(1000 * 5 + 2000 * 50);
  });

  it('memformat rupiah dan inisial nama', () => {
    expect(formatIDR(185000)).toMatch(/185\.000/);
    expect(initials('Dimas Wirawan')).toBe('DW');
    expect(initials('')).toBe('TK');
  });
});

describe('pemesanan via WhatsApp & pembayaran transfer', () => {
  it('menyusun URL wa.me berisi detail produk dan pembeli', () => {
    const url = buildOrderWhatsAppUrl(
      { nama: 'Susu Fresh Milk 1L', satuan: 'liter', harga: 24000 },
      { telepon: '62812-0000-0002', toko: { nama: 'Kopi Nusantara' } },
      { nama: 'Dimas Wirawan', kota: 'Banyuwangi' },
    );
    expect(url.startsWith('https://wa.me/6281200000002?text=')).toBe(true);
    const pesan = decodeURIComponent(url.split('?text=')[1]);
    expect(pesan).toContain('Kopi Nusantara');
    expect(pesan).toContain('Susu Fresh Milk 1L');
    expect(pesan).toContain('Dimas Wirawan');
    expect(pesan).toContain('Banyuwangi');
  });

  it('tidak membuat tautan WA untuk nomor yang tidak valid', () => {
    expect(buildOrderWhatsAppUrl({ nama: 'Kopi' }, { telepon: '123' }, { nama: 'A' })).toBe('');
    expect(buildOrderWhatsAppUrl({ nama: 'Kopi' }, {}, {})).toBe('');
  });

  it('menyediakan rekening transfer dan label status pembayaran', () => {
    expect(TRANSFER_ACCOUNTS.length).toBeGreaterThan(0);
    expect(TRANSFER_ACCOUNTS[0].nomor).toMatch(/^\d+$/);
    expect(PAYMENT_STATUS_LABEL.menunggu_pembayaran).toBeTruthy();
    expect(PAYMENT_STATUS_LABEL.menunggu_verifikasi).toBeTruthy();
    expect(PAYMENT_STATUS_LABEL.lunas).toBeTruthy();
  });
});
