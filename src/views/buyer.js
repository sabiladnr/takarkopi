/**
 * buyer.js — pengalaman pembeli: katalog, keranjang, checkout, riwayat pesanan.
 */

import { el, mount, toast } from '../ui.js';
import {
  pageHead,
  statGrid,
  emptyState,
  productImage,
  field,
  input,
  textarea,
  select,
  errorSlot,
  showErrors,
  orderCard,
  formatIDR,
} from '../components.js';
import {
  allProducts,
  userById,
  sellerName,
  cartLines,
  cartCount,
  addToCart,
  setCartQty,
  removeFromCart,
  checkout,
  buyerOrders,
  updateOrderStatus,
  getPaymentBatch,
  confirmTransfer,
} from '../store.js';
import {
  PRODUCT_CATEGORIES,
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  cartTotals,
  groupBySeller,
  shippingFor,
  allowedTransitions,
  summarizeOrders,
  formatDate,
  buildOrderWhatsAppUrl,
  TRANSFER_ACCOUNTS,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_ICON,
} from '../domain.js';

/* ------------------------------------------------------------------ */
/* Katalog                                                            */
/* ------------------------------------------------------------------ */

const catalogState = { query: '', kategori: 'all' };

export function renderCatalog(host, ctx) {
  const products = allProducts().filter((p) => {
    const seller = userById(p.sellerId);
    return p.status === 'aktif' && seller && seller.status === 'aktif' && seller.role === 'seller';
  });

  const grid = el('div', { className: 'product-grid' });
  const countLabel = el('p', { className: 'toolbar__info' });
  const search = input({ type: 'search', placeholder: '🔍 Cari bahan (matcha, susu, kopi…)' });
  search.value = catalogState.query;
  const kategori = select(
    [{ value: 'all', label: 'Semua kategori' }, ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))],
    catalogState.kategori,
  );

  function paint() {
    const query = catalogState.query.trim().toLowerCase();
    const list = products.filter((p) => {
      if (catalogState.kategori !== 'all' && p.kategori !== catalogState.kategori) return false;
      if (!query) return true;
      return `${p.nama} ${p.kategori} ${p.deskripsi}`.toLowerCase().includes(query);
    });
    countLabel.textContent = `${list.length} produk tersedia dari ${new Set(list.map((p) => p.sellerId)).size} toko`;
    if (list.length === 0) {
      mount(grid, [
        emptyState('🔍', 'Produk tidak ditemukan', 'Coba kata kunci atau kategori lain.'),
      ]);
      return;
    }
    mount(
      grid,
      list.map((product) => productCard(product, ctx)),
    );
  }

  search.addEventListener('input', () => {
    catalogState.query = search.value;
    paint();
  });
  kategori.addEventListener('change', () => {
    catalogState.kategori = kategori.value;
    paint();
  });

  paint();

  mount(host, [
    pageHead(
      'Katalog Bahan Baku',
      'Pesan langsung via WhatsApp, atau kumpulkan semua bahan di keranjang lalu bayar dengan transfer bank. Ongkir Rp15.000 per toko, gratis di atas Rp500.000.',
      [
        el('a', {
          className: 'btn btn--primary',
          textContent: `🛒 Keranjang (${cartCount(ctx.user.id)})`,
          attrs: { href: '#/keranjang' },
        }),
      ],
    ),
    el('div', { className: 'toolbar filter-bar' }, [
      el('div', { className: 'filter-bar__search' }, [search]),
      el('div', { className: 'filter-bar__select' }, [kategori]),
      countLabel,
    ]),
    grid,
  ]);
}

function productCard(product, ctx) {
  const seller = userById(product.sellerId);
  const habis = product.stok <= 0;

  const addBtn = el(
    'button',
    {
      className: 'btn btn--primary btn--block',
      attrs: { type: 'button', disabled: habis ? 'disabled' : false },
      onClick: () => {
        const result = addToCart(ctx.user.id, product.id, 1);
        if (!result.ok) {
          toast(result.error, { type: 'error' });
          return;
        }
        toast(`${product.nama} masuk keranjang.`, { type: 'success' });
        ctx.syncShell();
      },
    },
    [el('span', { textContent: habis ? 'Stok Habis' : '+ Tambah ke Keranjang' })],
  );

  const waUrl = buildOrderWhatsAppUrl(product, seller, ctx.user);
  const waBtn = waUrl
    ? el('a', {
        className: 'btn btn--wa btn--block',
        textContent: '💬 Pesan via WA',
        attrs: { href: waUrl, target: '_blank', rel: 'noopener noreferrer' },
      })
    : null;

  return el('article', { className: 'product-card' }, [
    el('div', { className: 'product-card__media' }, [
      productImage(product, 'product-card__img'),
      el('span', {
        className: `stock-pill ${habis ? 'stock-pill--out' : product.stok <= 10 ? 'stock-pill--low' : 'stock-pill--ok'}`,
        textContent: habis ? 'Habis' : `Stok ${product.stok} ${product.satuan}`,
      }),
    ]),
    el('div', { className: 'product-card__body' }, [
      el('span', { className: 'product-card__seller', textContent: sellerName(seller) }),
      el('h3', { className: 'product-card__name', textContent: product.nama }),
      el('p', { className: 'product-card__desc', textContent: product.deskripsi }),
      el('div', { className: 'product-card__meta' }, [
        el('span', { className: 'chip chip--kategori', textContent: product.kategori }),
        el('span', { className: 'product-card__price' }, [
          el('strong', { textContent: formatIDR(product.harga) }),
          el('span', { className: 'product-card__unit', textContent: ` / ${product.satuan}` }),
        ]),
      ]),
      el('div', { className: 'product-card__actions' }, [addBtn, waBtn]),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Keranjang & checkout                                               */
/* ------------------------------------------------------------------ */

const draft = { alamat: null, catatan: '' };

export function renderCart(host, ctx) {
  const lines = cartLines(ctx.user.id);
  const totals = cartTotals(lines);

  if (lines.length === 0) {
    mount(host, [
      pageHead('Keranjang', 'Belum ada bahan di keranjang.'),
      emptyState(
        '🛒',
        'Keranjang masih kosong',
        'Jelajahi katalog dan tambahkan bahan baku yang dibutuhkan kafe Anda.',
        el('a', { className: 'btn btn--primary', textContent: 'Buka Katalog', attrs: { href: '#/katalog' } }),
      ),
    ]);
    return;
  }

  if (draft.alamat == null) draft.alamat = ctx.user.alamat || '';

  const groups = groupBySeller(lines);
  const groupNodes = [...groups.entries()].map(([sellerId, sellerLines]) => {
    const seller = userById(sellerId);
    const sellerSubtotal = sellerLines.reduce((sum, l) => sum + l.harga * l.qty, 0);
    return el('section', { className: 'cart-group' }, [
      el('header', { className: 'cart-group__head' }, [
        el('strong', { textContent: `🏪 ${sellerName(seller)}` }),
        el('span', {
          className: 'cart-group__ship',
          textContent: `Ongkir ${shippingFor(sellerSubtotal) === 0 ? 'GRATIS' : formatIDR(shippingFor(sellerSubtotal))}`,
        }),
      ]),
      el('ul', { className: 'cart-list' }, sellerLines.map((line) => cartLineNode(line, ctx))),
    ]);
  });

  const alamatSlot = errorSlot();
  const catatanSlot = errorSlot();
  const general = el('p', { className: 'form-error', attrs: { role: 'alert' } });

  const alamatControl = textarea({ rows: '3', maxlength: '300', placeholder: 'Alamat lengkap pengiriman bahan baku' });
  alamatControl.value = draft.alamat;
  alamatControl.addEventListener('input', () => {
    draft.alamat = alamatControl.value;
  });

  const catatanControl = textarea({ rows: '2', maxlength: '300', placeholder: 'Catatan untuk seller (opsional)' });
  catatanControl.value = draft.catatan;
  catatanControl.addEventListener('input', () => {
    draft.catatan = catatanControl.value;
  });

  const submit = el('button', {
    className: 'btn btn--primary btn--block btn--lg',
    textContent: 'Buat Pesanan & Transfer',
    attrs: { type: 'submit' },
  });

  const form = el('form', { className: 'checkout-form', attrs: { novalidate: 'novalidate' } }, [
    field('Alamat pengiriman', alamatControl, alamatSlot),
    field('Catatan pesanan', catatanControl, catatanSlot),
    el('div', { className: 'transfer-brief' }, [
      el('strong', { textContent: '💳 Pembayaran: transfer bank' }),
      el('p', {
        textContent: 'Seluruh produk digabung dalam satu total. Instruksi rekening muncul setelah pesanan dibuat.',
      }),
    ]),
    general,
    submit,
    el('p', {
      className: 'form-hint',
      textContent: 'Pesanan dipecah per toko untuk pengiriman, tetapi cukup satu transfer untuk semua produk. Stok dipotong setelah pesanan dibuat.',
    }),
  ]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    general.textContent = '';
    showErrors({ alamat: alamatSlot, catatan: catatanSlot }, {});
    submit.disabled = true;
    const result = checkout(ctx.user.id, { ...draft, metode: 'transfer' });
    submit.disabled = false;
    if (!result.ok) {
      showErrors({ alamat: alamatSlot, catatan: catatanSlot }, result.errors);
      general.textContent = result.error;
      return;
    }
    toast(`${result.orders.length} pesanan dibuat. Lanjutkan transfer.`, { type: 'success' });
    draft.catatan = '';
    ctx.navigate(`#/pembayaran/${result.batch.id}`);
  });

  mount(host, [
    pageHead('Keranjang', `${totals.count} item dari ${totals.sellerCount} toko.`),
    el('div', { className: 'cart-layout' }, [
      el('div', { className: 'cart-main' }, groupNodes),
      el('aside', { className: 'cart-summary panel' }, [
        el('h2', { className: 'panel__title', textContent: 'Ringkasan Pesanan' }),
        el('dl', { className: 'summary-list' }, [
          summaryRow('Subtotal', formatIDR(totals.subtotal)),
          summaryRow('Ongkir', totals.shipping === 0 ? 'GRATIS' : formatIDR(totals.shipping)),
          summaryRow('Total', formatIDR(totals.total), true),
        ]),
        form,
      ]),
    ]),
  ]);
}

function cartLineNode(line, ctx) {
  const qtyValue = el('span', { className: 'qty-control__value', textContent: String(line.qty) });

  const change = (next) => {
    const result = setCartQty(ctx.user.id, line.productId, next);
    if (!result.ok) {
      toast(result.error, { type: 'error' });
      return;
    }
    ctx.syncShell();
    ctx.refresh();
  };

  return el('li', { className: 'cart-line' }, [
    productImage(line, 'cart-thumb'),
    el('div', { className: 'cart-line__info' }, [
      el('span', { className: 'cart-line__name', textContent: line.nama }),
      el('span', { className: 'cart-line__meta', textContent: `${formatIDR(line.harga)} / ${line.satuan} · stok ${line.stok}` }),
    ]),
    el('div', { className: 'qty-control' }, [
      el('button', {
        className: 'qty-control__btn',
        textContent: '−',
        attrs: { type: 'button', 'aria-label': `Kurangi jumlah ${line.nama}` },
        onClick: () => change(line.qty - 1),
      }),
      qtyValue,
      el('button', {
        className: 'qty-control__btn',
        textContent: '+',
        attrs: { type: 'button', 'aria-label': `Tambah jumlah ${line.nama}`, disabled: line.qty >= line.stok ? 'disabled' : false },
        onClick: () => change(line.qty + 1),
      }),
    ]),
    el('strong', { className: 'cart-line__total', textContent: formatIDR(line.harga * line.qty) }),
    el('button', {
      className: 'cart-line__remove',
      textContent: '✕',
      attrs: { type: 'button', 'aria-label': `Hapus ${line.nama} dari keranjang` },
      onClick: () => {
        removeFromCart(ctx.user.id, line.productId);
        toast(`${line.nama} dihapus dari keranjang.`, { type: 'info' });
        ctx.syncShell();
        ctx.refresh();
      },
    }),
  ]);
}

function summaryRow(label, value, strong = false) {
  return el('div', { className: `summary-list__row ${strong ? 'summary-list__row--strong' : ''}` }, [
    el('dt', { textContent: label }),
    el('dd', { textContent: value }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Pembayaran transfer                                                */
/* ------------------------------------------------------------------ */

export function renderPayment(host, ctx, batchId) {
  const result = getPaymentBatch(batchId, ctx.user.id);
  if (!result.ok) {
    mount(host, [
      pageHead('Pembayaran Transfer', 'Tagihan pembayaran tidak ditemukan.'),
      emptyState(
        '💳',
        'Tagihan tidak ditemukan',
        result.error,
        el('a', { className: 'btn btn--primary', textContent: 'Lihat Pesanan', attrs: { href: '#/pesanan' } }),
      ),
    ]);
    return;
  }

  const { batch, orders } = result;
  const status = batch.status;
  const statusClass = String(status).replace(/_/g, '-');
  const items = orders.flatMap((order) =>
    order.items.map((item) => ({
      ...item,
      kode: order.kode,
      seller: sellerName(userById(order.sellerId)),
    })),
  );

  const accountNodes = TRANSFER_ACCOUNTS.map((account) =>
    el('div', { className: 'transfer-account' }, [
      el('div', { className: 'transfer-account__main' }, [
        el('span', { className: 'transfer-account__bank', textContent: `Bank ${account.bank}` }),
        el('strong', { className: 'transfer-account__number', textContent: account.nomor }),
        el('span', { className: 'transfer-account__name', textContent: `a.n. ${account.atasNama}` }),
      ]),
      el('button', {
        className: 'btn btn--ghost btn--sm',
        textContent: 'Salin',
        attrs: { type: 'button' },
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(account.nomor);
            toast(`Nomor ${account.bank} disalin.`, { type: 'success' });
          } catch {
            toast(`Nomor ${account.bank}: ${account.nomor}`, { type: 'info' });
          }
        },
      }),
    ]),
  );

  const confirmBtn =
    status === 'menunggu_pembayaran'
      ? el('button', {
          className: 'btn btn--primary btn--block btn--lg',
          textContent: 'Saya Sudah Transfer',
          attrs: { type: 'button' },
          onClick: () => {
            const confirmed = confirmTransfer(batch.id, ctx.user.id);
            if (!confirmed.ok) {
              toast(confirmed.error, { type: 'error' });
              return;
            }
            toast('Konfirmasi transfer terkirim. Menunggu verifikasi admin.', { type: 'success' });
            ctx.refresh();
          },
        })
      : el('button', {
          className: 'btn btn--ghost btn--block btn--lg',
          textContent: status === 'lunas' ? '✅ Pembayaran Lunas' : '🕓 Menunggu Verifikasi Admin',
          attrs: { type: 'button', disabled: 'disabled' },
        });

  mount(host, [
    pageHead('Pembayaran Transfer', `Tagihan ${batch.id} · ${orders.length} pesanan`, [
      el('a', { className: 'btn btn--ghost', textContent: 'Lihat Pesanan', attrs: { href: '#/pesanan' } }),
    ]),
    el('div', { className: `payment-banner payment-banner--${statusClass}` }, [
      el('div', {}, [
        el('span', { className: 'payment-banner__label', textContent: 'Total yang harus ditransfer' }),
        el('strong', { className: 'payment-banner__total', textContent: formatIDR(batch.total) }),
        el('span', {
          className: 'payment-banner__meta',
          textContent: `Subtotal ${formatIDR(batch.subtotal)} · Ongkir ${formatIDR(batch.ongkir)}`,
        }),
      ]),
      el('span', {
        className: `pay-status pay-status--${statusClass}`,
        textContent: `${PAYMENT_STATUS_ICON[status] ?? '💳'} ${PAYMENT_STATUS_LABEL[status] ?? status}`,
      }),
    ]),
    el('div', { className: 'payment-layout' }, [
      el('section', { className: 'panel' }, [
        el('h2', { className: 'panel__title', textContent: 'Rekening Tujuan' }),
        el('p', { className: 'panel__note', textContent: 'Transfer tepat sebesar total ke salah satu rekening berikut.' }),
        ...accountNodes,
        el('ol', { className: 'payment-steps' }, [
          el('li', { textContent: `Cantumkan kode tagihan ${batch.id} pada berita transfer.` }),
          el('li', { textContent: 'Simpan bukti transfer sampai pesanan selesai.' }),
          el('li', { textContent: 'Tekan “Saya Sudah Transfer” agar admin memverifikasi pembayaran.' }),
        ]),
        confirmBtn,
      ]),
      el('section', { className: 'panel' }, [
        el('h2', { className: 'panel__title', textContent: 'Rincian Tagihan' }),
        el('dl', { className: 'summary-list' }, [
          summaryRow('Subtotal produk', formatIDR(batch.subtotal)),
          summaryRow('Ongkir', batch.ongkir === 0 ? 'GRATIS' : formatIDR(batch.ongkir)),
          summaryRow('Total transfer', formatIDR(batch.total), true),
        ]),
        el('p', { className: 'payment-orders-label', textContent: 'Pesanan dalam tagihan ini' }),
        el(
          'ul',
          { className: 'payment-orders' },
          orders.map((order) =>
            el('li', {}, [
              el('span', { textContent: `${order.kode} · ${sellerName(userById(order.sellerId))}` }),
              el('strong', { textContent: formatIDR(order.total) }),
            ]),
          ),
        ),
        el('p', {
          className: 'form-hint',
          textContent:
            status === 'menunggu_pembayaran'
              ? 'Pembayaran diverifikasi admin maksimal 1×24 jam pada hari kerja.'
              : status === 'menunggu_verifikasi'
                ? 'Konfirmasi transfer sudah diterima. Menunggu verifikasi admin.'
                : 'Pembayaran sudah diverifikasi. Pesanan diteruskan ke seller.',
        }),
      ]),
    ]),
    el('section', { className: 'panel payment-items-panel' }, [
      el('h2', { className: 'panel__title', textContent: 'Produk yang Dibeli' }),
      el(
        'ul',
        { className: 'payment-items' },
        items.map((item) =>
          el('li', { className: 'payment-item' }, [
            productImage(item, 'payment-item__img'),
            el('div', { className: 'payment-item__info' }, [
              el('span', { className: 'payment-item__name', textContent: item.nama }),
              el('span', {
                className: 'payment-item__meta',
                textContent: `${item.qty} ${item.satuan} × ${formatIDR(item.harga)} · ${item.seller}`,
              }),
            ]),
            el('strong', { textContent: formatIDR(item.qty * item.harga) }),
          ]),
        ),
      ),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Riwayat pesanan pembeli                                            */
/* ------------------------------------------------------------------ */

const orderFilter = { value: 'all' };

export function renderBuyerOrders(host, ctx) {
  const orders = buyerOrders(ctx.user.id);
  const summary = summarizeOrders(orders);

  const filtered = orderFilter.value === 'all' ? orders : orders.filter((o) => o.status === orderFilter.value);

  const chips = el(
    'div',
    { className: 'filter-chips' },
    [{ value: 'all', label: `Semua (${orders.length})` }, ...ORDER_STATUSES.map((s) => ({ value: s, label: `${ORDER_STATUS_LABEL[s]} (${summary.byStatus[s]})` }))].map((chip) =>
      el('button', {
        className: `filter-chip ${orderFilter.value === chip.value ? 'is-active' : ''}`,
        textContent: chip.label,
        attrs: { type: 'button' },
        onClick: () => {
          orderFilter.value = chip.value;
          ctx.refresh();
        },
      }),
    ),
  );

  const cards = filtered.map((order) => {
    const seller = userById(order.sellerId);
    const actions = allowedTransitions(order.status, 'buyer').map((next) => ({
      status: next,
      variant: next === 'dibatalkan' ? 'danger-ghost' : 'primary',
      label: next === 'dibatalkan' ? 'Batalkan Pesanan' : next === 'selesai' ? 'Pesanan Diterima' : undefined,
      onClick: () => {
        const result = updateOrderStatus(order.id, next, ctx.user);
        if (!result.ok) {
          toast(result.error, { type: 'error' });
          return;
        }
        toast(next === 'dibatalkan' ? 'Pesanan dibatalkan & stok dikembalikan.' : 'Pesanan ditandai selesai.', { type: 'success' });
        ctx.refresh();
      },
    }));
    return orderCard(order, { showSeller: true, sellerName: sellerName(seller), actions });
  });

  mount(host, [
    pageHead('Pesanan Saya', 'Pantau status pengiriman dan konfirmasi penerimaan bahan.'),
    statGrid([
      { icon: '📦', label: 'Total pesanan', value: summary.total, hint: `Bergabung ${formatDate(ctx.user.createdAt)}` },
      { icon: '🚚', label: 'Sedang berjalan', value: summary.pending, hint: 'Menunggu, diproses, dikirim', tone: summary.pending ? 'warn' : 'ok' },
      { icon: '✅', label: 'Pesanan selesai', value: summary.byStatus.selesai, hint: 'Sudah diterima', tone: 'ok' },
    ]),
    chips,
    filtered.length
      ? el('div', { className: 'order-list' }, cards)
      : emptyState('📭', 'Belum ada pesanan', 'Pesanan dengan status ini belum tersedia.', el('a', { className: 'btn btn--primary', textContent: 'Belanja Sekarang', attrs: { href: '#/katalog' } })),
  ]);
}
