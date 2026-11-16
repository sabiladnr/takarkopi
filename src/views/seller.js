/**
 * seller.js — dashboard toko supplier:
 * ringkasan, katalog produk, pesanan masuk, dan smart prep inventori.
 */

import {
  el,
  mount,
  toast,
  confirmDialog,
  renderTriggers,
  renderStats,
  renderChecklist,
  renderIngredientTable,
  openIngredientForm,
  openImportDialog,
  downloadJSON,
} from '../ui.js';
import {
  pageHead,
  statGrid,
  emptyState,
  productImage,
  field,
  input,
  select,
  textarea,
  errorSlot,
  showErrors,
  openModal,
  orderCard,
  formatIDR,
  statusChip,
} from '../components.js';
import {
  sellerProducts,
  sellerOrders,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductStatus,
  updateOrderStatus,
  userById,
  loadSellerIngredients,
  saveSellerIngredients,
  clearSellerIngredients,
  sellerDemoIngredients,
} from '../store.js';
import {
  PRODUCT_CATEGORIES,
  isLowStock,
  countLowStock,
  inventoryValue,
  summarizeOrders,
  allowedTransitions,
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  formatDate,
} from '../domain.js';
import {
  addIngredient,
  updateIngredient,
  removeIngredient,
  stockStep,
  nextStockValue,
  serializeExport,
  IMAGE_BY_ID,
} from '../ingredients.js';
import {
  WEATHER,
  CALENDAR,
  DEFAULT_WEATHER,
  DEFAULT_CALENDAR,
  buildChecklist,
  filterChecklist,
  formatWeekday,
  formatHumanDate,
  toISODate,
} from '../predictor.js';

/* ------------------------------------------------------------------ */
/* Ringkasan seller                                                   */
/* ------------------------------------------------------------------ */

export function renderSellerDashboard(host, ctx) {
  const user = ctx.user;
  const products = sellerProducts(user.id);
  const orders = sellerOrders(user.id);
  const summary = summarizeOrders(orders);
  const activeProducts = products.filter((p) => p.status === 'aktif');
  const lowStock = products.filter((p) => isLowStock(p));
  const recent = orders.slice(0, 4);

  mount(host, [
    pageHead(
      `Halo, ${user.nama.split(' ')[0]}!`,
      `Ringkasan toko ${user.toko?.nama ?? 'Anda'} hari ini.`,
      [el('a', { className: 'btn btn--primary', textContent: '+ Tambah Produk', attrs: { href: '#/seller/produk' } })],
    ),
    statGrid([
      { icon: '💰', label: 'Pendapatan selesai', value: formatIDR(summary.revenue), hint: `${summary.byStatus.selesai} pesanan selesai`, tone: 'ok' },
      { icon: '⏳', label: 'Pesanan perlu tindakan', value: summary.byStatus.menunggu + summary.byStatus.diproses, hint: 'Menunggu / diproses', tone: summary.byStatus.menunggu ? 'warn' : 'ok' },
      { icon: '📦', label: 'Produk aktif', value: activeProducts.length, hint: `Nilai stok ${formatIDR(inventoryValue(activeProducts))}` },
      { icon: '⚠️', label: 'Stok menipis', value: lowStock.length, hint: 'Ambang stok ≤ 10 unit', tone: lowStock.length ? 'danger' : 'ok' },
    ]),
    el('div', { className: 'dashboard-grid' }, [
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head panel__head--wrap' }, [
          el('h2', { className: 'panel__title', textContent: 'Pesanan Terbaru' }),
          el('a', { className: 'btn btn--ghost btn--sm', textContent: 'Lihat semua', attrs: { href: '#/seller/pesanan' } }),
        ]),
        recent.length
          ? el(
              'ul',
              { className: 'list-rows' },
              recent.map((order) =>
                el('li', { className: 'list-row' }, [
                  el('div', { className: 'list-row__main' }, [
                    el('strong', { textContent: order.kode }),
                    el('span', { textContent: `${userById(order.buyerId)?.nama ?? 'Pembeli'} · ${formatDate(order.createdAt)}` }),
                  ]),
                  statusChip(order.status),
                  el('strong', { className: 'list-row__amount', textContent: formatIDR(order.total) }),
                ]),
              ),
            )
          : emptyState('📭', 'Belum ada pesanan', 'Pesanan baru dari pembeli akan muncul di sini.'),
      ]),
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head panel__head--wrap' }, [
          el('h2', { className: 'panel__title', textContent: 'Perlu Restock' }),
          el('a', { className: 'btn btn--ghost btn--sm', textContent: 'Kelola produk', attrs: { href: '#/seller/produk' } }),
        ]),
        lowStock.length
          ? el(
              'ul',
              { className: 'list-rows' },
              lowStock.slice(0, 6).map((product) =>
                el('li', { className: 'list-row list-row--product' }, [
                  productImage(product, 'list-thumb'),
                  el('div', { className: 'list-row__main' }, [
                    el('strong', { textContent: product.nama }),
                    el('span', { textContent: `Sisa ${product.stok} ${product.satuan}` }),
                  ]),
                  el('button', {
                    className: 'btn btn--ghost btn--sm',
                    textContent: 'Atur stok',
                    attrs: { type: 'button' },
                    onClick: () => openProductForm({
                      title: `Edit ${product.nama}`,
                      initial: product,
                      onSubmit: (values) => {
                        const result = updateProduct(ctx.user, product.id, values);
                        if (!result.ok) return result;
                        toast('Stok diperbarui.', { type: 'success' });
                        ctx.refresh();
                        return { ok: true };
                      },
                    }),
                  }),
                ]),
              ),
            )
          : emptyState('✅', 'Stok aman', 'Tidak ada produk di bawah ambang minimum.'),
      ]),
    ]),
    el('section', { className: 'panel cta-panel' }, [
      el('div', {}, [
        el('h2', { className: 'panel__title', textContent: 'Smart Prep hari ini' }),
        el('p', { className: 'panel__note', textContent: 'Hitung takaran prep berdasarkan cuaca, event, dan kedaluwarsa bahan.' }),
      ]),
      el('a', { className: 'btn btn--pink', textContent: 'Buka Smart Prep', attrs: { href: '#/seller/prep' } }),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Form produk                                                        */
/* ------------------------------------------------------------------ */

function openProductForm({ title, initial = null, onSubmit }) {
  const controls = {
    nama: input({ type: 'text', maxlength: '80', placeholder: 'mis. Espresso Blend House' }),
    kategori: select(PRODUCT_CATEGORIES, initial?.kategori ?? PRODUCT_CATEGORIES[0]),
    satuan: input({ type: 'text', maxlength: '16', placeholder: 'kg / liter / pcs' }),
    harga: input({ type: 'number', min: '1', step: '1', placeholder: '185000' }),
    stok: input({ type: 'number', min: '0', step: '1', placeholder: '42' }),
    status: select(
      [
        { value: 'aktif', label: 'Aktif — tampil di katalog' },
        { value: 'nonaktif', label: 'Nonaktif — disembunyikan' },
      ],
      initial?.status ?? 'aktif',
    ),
    deskripsi: textarea({ rows: '3', maxlength: '400', placeholder: 'Deskripsi singkat produk' }),
    imageUrl: input({ type: 'text', maxlength: '300', placeholder: './images/coffee.svg atau https://…' }),
  };

  controls.nama.value = initial?.nama ?? '';
  controls.satuan.value = initial?.satuan ?? '';
  controls.harga.value = initial ? String(initial.harga) : '';
  controls.stok.value = initial ? String(initial.stok) : '';
  controls.deskripsi.value = initial?.deskripsi ?? '';
  controls.imageUrl.value = initial?.imageUrl ?? '';

  const slots = {
    nama: errorSlot(),
    kategori: errorSlot(),
    satuan: errorSlot(),
    harga: errorSlot(),
    stok: errorSlot(),
    deskripsi: errorSlot(),
    imageUrl: errorSlot(),
  };

  const preview = el('img', { className: 'image-preview', attrs: { alt: 'Pratinjau gambar produk', src: controls.imageUrl.value || './images/coffee.svg' } });
  preview.addEventListener('error', () => {
    preview.setAttribute('src', './images/coffee.svg');
  });
  controls.imageUrl.addEventListener('input', () => {
    preview.setAttribute('src', controls.imageUrl.value || './images/coffee.svg');
  });

  const presets = [...new Set(Object.values(IMAGE_BY_ID))];
  const presetBar = el(
    'div',
    { className: 'image-bar' },
    presets.map((src) =>
      el('button', {
        className: 'image-bar__btn',
        attrs: { type: 'button', title: src, 'aria-label': `Gunakan gambar ${src}` },
        onClick: () => {
          controls.imageUrl.value = src;
          preview.setAttribute('src', src);
        },
      }, [el('img', { className: 'image-bar__img', attrs: { src, alt: '', loading: 'lazy' } })]),
    ),
  );

  return openModal({
    title,
    submitLabel: initial ? 'Simpan Perubahan' : 'Tambah Produk',
    controls,
    children: [
      el('div', { className: 'field-grid' }, [
        field('Nama produk', controls.nama, slots.nama),
        field('Kategori', controls.kategori, slots.kategori),
        field('Satuan', controls.satuan, slots.satuan),
        field('Harga (Rp)', controls.harga, slots.harga),
        field('Stok tersedia', controls.stok, slots.stok),
        field('Status', controls.status, null),
        field('Deskripsi', controls.deskripsi, slots.deskripsi),
        field('URL gambar (opsional)', controls.imageUrl, slots.imageUrl),
        el('div', { className: 'field field--full' }, [
          el('span', { className: 'field__label', textContent: 'Pilih gambar preset' }),
          presetBar,
          el('div', { className: 'image-preview-wrap' }, [preview]),
        ]),
      ]),
    ],
    onSubmit: ({ close, errorSlot: general }) => {
      showErrors(slots, {});
      const result = onSubmit({
        nama: controls.nama.value,
        kategori: controls.kategori.value,
        satuan: controls.satuan.value,
        harga: controls.harga.value,
        stok: controls.stok.value,
        status: controls.status.value,
        deskripsi: controls.deskripsi.value,
        imageUrl: controls.imageUrl.value,
      });
      if (result && result.ok === false) {
        showErrors(slots, result.errors);
        general.textContent = result.error ?? 'Periksa kembali data produk.';
        return;
      }
      close();
    },
  });
}

/* ------------------------------------------------------------------ */
/* Produk seller                                                      */
/* ------------------------------------------------------------------ */

export function renderSellerProducts(host, ctx) {
  const products = sellerProducts(ctx.user.id);

  const addButton = el('button', {
    className: 'btn btn--primary',
    textContent: '+ Tambah Produk',
    attrs: { type: 'button' },
    onClick: () =>
      openProductForm({
        title: 'Tambah Produk Baru',
        onSubmit: (values) => {
          const result = createProduct(ctx.user, values);
          if (!result.ok) return result;
          toast(`${result.product.nama} ditambahkan ke katalog.`, { type: 'success' });
          ctx.refresh();
          return { ok: true };
        },
      }),
  });

  if (products.length === 0) {
    mount(host, [
      pageHead('Produk Saya', 'Kelola katalog bahan baku yang Anda jual.'),
      emptyState('📦', 'Belum ada produk', 'Tambahkan produk pertama Anda agar muncul di katalog pembeli.', addButton),
    ]);
    return;
  }

  const table = el('div', { className: 'table-wrap' }, [
    el('table', { className: 'data-table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { textContent: 'Produk' }),
          el('th', { textContent: 'Kategori' }),
          el('th', { className: 'num', textContent: 'Harga' }),
          el('th', { className: 'num', textContent: 'Stok' }),
          el('th', { textContent: 'Status' }),
          el('th', { className: 'actions', textContent: 'Aksi' }),
        ]),
      ]),
      el(
        'tbody',
        {},
        products.map((product) => {
          const low = isLowStock(product);
          return el('tr', { dataset: { id: product.id } }, [
            el('td', { dataset: { label: 'Produk' } }, [
              el('div', { className: 'cell-ingredient' }, [
                productImage(product, 'ingredient-thumb'),
                el('div', { className: 'cell-product' }, [
                  el('span', { className: 'cell-ingredient__name', textContent: product.nama }),
                  el('span', { className: 'cell-product__desc', textContent: product.deskripsi }),
                ]),
              ]),
            ]),
            el('td', { dataset: { label: 'Kategori' } }, [
              el('span', { className: 'chip chip--kategori', textContent: product.kategori }),
            ]),
            el('td', { className: 'num', dataset: { label: 'Harga' } }, [
              el('span', { textContent: `${formatIDR(product.harga)} / ${product.satuan}` }),
            ]),
            el('td', { className: 'num', dataset: { label: 'Stok' } }, [
              el('span', { className: `stock-pill ${low ? 'stock-pill--low' : 'stock-pill--ok'}`, textContent: `${product.stok} ${product.satuan}` }),
            ]),
            el('td', { dataset: { label: 'Status' } }, [
              el('span', {
                className: `badge ${product.status === 'aktif' ? 'badge--ok' : 'badge--muted'}`,
                textContent: product.status === 'aktif' ? 'Aktif' : 'Nonaktif',
              }),
            ]),
            el('td', { className: 'actions', dataset: { label: 'Aksi' } }, [
              el('div', { className: 'row-actions' }, [
                el('button', {
                  className: 'btn btn--ghost btn--sm',
                  textContent: 'Edit',
                  attrs: { type: 'button' },
                  onClick: () =>
                    openProductForm({
                      title: `Edit ${product.nama}`,
                      initial: product,
                      onSubmit: (values) => {
                        const result = updateProduct(ctx.user, product.id, values);
                        if (!result.ok) return result;
                        toast('Produk diperbarui.', { type: 'success' });
                        ctx.refresh();
                        return { ok: true };
                      },
                    }),
                }),
                el('button', {
                  className: 'btn btn--ghost btn--sm',
                  textContent: product.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan',
                  attrs: { type: 'button' },
                  onClick: () => {
                    const result = setProductStatus(ctx.user, product.id, product.status === 'aktif' ? 'nonaktif' : 'aktif');
                    if (!result.ok) {
                      toast(result.error, { type: 'error' });
                      return;
                    }
                    toast('Status produk diperbarui.', { type: 'info' });
                    ctx.refresh();
                  },
                }),
                el('button', {
                  className: 'btn btn--danger-ghost btn--sm',
                  textContent: 'Hapus',
                  attrs: { type: 'button' },
                  onClick: async () => {
                    const ok = await confirmDialog({
                      title: 'Hapus Produk',
                      message: `Hapus "${product.nama}" dari katalog? Produk yang pernah dipesan hanya akan dinonaktifkan.`,
                      confirmLabel: 'Hapus',
                    });
                    if (!ok) return;
                    const result = deleteProduct(ctx.user, product.id);
                    if (!result.ok) {
                      toast(result.error, { type: 'error' });
                      return;
                    }
                    toast(result.deactivated ? 'Produk dinonaktifkan.' : 'Produk dihapus.', { type: 'success' });
                    ctx.refresh();
                  },
                }),
              ]),
            ]),
          ]);
        }),
      ),
    ]),
  ]);

  mount(host, [
    pageHead('Produk Saya', `${products.length} produk terdaftar di toko ${ctx.user.toko?.nama ?? ''}.`, [addButton]),
    table,
  ]);
}

/* ------------------------------------------------------------------ */
/* Pesanan seller                                                     */
/* ------------------------------------------------------------------ */

const sellerOrderFilter = { value: 'all' };

export function renderSellerOrders(host, ctx) {
  const orders = sellerOrders(ctx.user.id);
  const summary = summarizeOrders(orders);
  const filtered = sellerOrderFilter.value === 'all' ? orders : orders.filter((o) => o.status === sellerOrderFilter.value);

  const chips = el(
    'div',
    { className: 'filter-chips' },
    [{ value: 'all', label: `Semua (${orders.length})` }, ...ORDER_STATUSES.map((s) => ({ value: s, label: `${ORDER_STATUS_LABEL[s]} (${summary.byStatus[s]})` }))].map((chip) =>
      el('button', {
        className: `filter-chip ${sellerOrderFilter.value === chip.value ? 'is-active' : ''}`,
        textContent: chip.label,
        attrs: { type: 'button' },
        onClick: () => {
          sellerOrderFilter.value = chip.value;
          ctx.refresh();
        },
      }),
    ),
  );

  const cards = filtered.map((order) => {
    const buyer = userById(order.buyerId);
    const actions = allowedTransitions(order.status, 'seller').map((next) => ({
      status: next,
      variant: next === 'dibatalkan' ? 'danger-ghost' : 'primary',
      label: next === 'dibatalkan' ? 'Batalkan Pesanan' : undefined,
      onClick: () => {
        const result = updateOrderStatus(order.id, next, ctx.user);
        if (!result.ok) {
          toast(result.error, { type: 'error' });
          return;
        }
        toast(`Pesanan ${order.kode} → ${ORDER_STATUS_LABEL[next]}.`, { type: 'success' });
        ctx.refresh();
      },
    }));
    return orderCard(order, { showBuyer: true, buyerName: buyer?.nama ?? '-', actions });
  });

  mount(host, [
    pageHead('Pesanan Masuk', 'Proses, kirim, dan selesaikan pesanan pembeli.'),
    statGrid([
      { icon: '⏳', label: 'Menunggu konfirmasi', value: summary.byStatus.menunggu, tone: summary.byStatus.menunggu ? 'warn' : 'ok' },
      { icon: '🧑‍🍳', label: 'Diproses', value: summary.byStatus.diproses },
      { icon: '🚚', label: 'Dikirim', value: summary.byStatus.dikirim },
      { icon: '✅', label: 'Selesai', value: summary.byStatus.selesai, tone: 'ok' },
    ]),
    chips,
    filtered.length
      ? el('div', { className: 'order-list' }, cards)
      : emptyState('📭', 'Tidak ada pesanan', 'Belum ada pesanan dengan status ini.'),
  ]);
}

/* ------------------------------------------------------------------ */
/* Smart Prep (inventori per seller)                                  */
/* ------------------------------------------------------------------ */

const prep = {
  weatherId: DEFAULT_WEATHER,
  calendarId: DEFAULT_CALENDAR,
  checked: new Set(),
  query: '',
  filter: 'all',
  sort: 'fifo',
  userId: null,
  items: [],
};

export function renderSellerPrep(host, ctx) {
  const user = ctx.user;
  // Setiap seller punya inventori sendiri; muat ulang saat berganti akun.
  if (prep.userId !== user.id) {
    const loaded = loadSellerIngredients(user);
    prep.items = loaded.items;
    prep.checked.clear();
    prep.query = '';
    prep.userId = user.id;
    if (loaded.error) toast(`Data inventori bermasalah: ${loaded.error}`, { type: 'error' });
  }

  const triggersHost = el('div', { className: 'triggers' });
  const statsHost = el('div', { className: 'stats-grid' });
  const checklistHost = el('div', { className: 'checklist-host' });
  const tableHost = el('div', { className: 'ingredients-host' });
  const dataActionsHost = el('div', { className: 'data-actions' });
  const filterControl = select(
    [
      { value: 'all', label: 'Filter: Semua' },
      { value: 'kurang', label: '⚠️ Kurang Stok' },
      { value: 'kedaluwarsa', label: '⏳ Hampir Kedaluwarsa' },
      { value: 'kritis', label: '🚨 Kritis' },
    ],
    prep.filter,
  );
  const sortControl = select(
    [
      { value: 'fifo', label: 'Urutkan: FIFO' },
      { value: 'shortage', label: 'Urutkan: Kekurangan' },
      { value: 'name-asc', label: 'Urutkan: Nama A–Z' },
    ],
    prep.sort,
  );
  const searchControl = input({ type: 'search', placeholder: '🔍 Cari bahan…' });
  searchControl.value = prep.query;

  const today = new Date();
  let checklist = buildChecklist(prep.items, prep.weatherId, prep.calendarId, today);

  function paint() {
    checklist = buildChecklist(prep.items, prep.weatherId, prep.calendarId, today);
    renderTriggers(triggersHost, {
      weatherId: prep.weatherId,
      calendarId: prep.calendarId,
      WEATHER,
      CALENDAR,
      onWeather: (id) => {
        prep.weatherId = id;
        paint();
      },
      onCalendar: (id) => {
        prep.calendarId = id;
        paint();
      },
    });
    renderStats(statsHost, checklist.stats);
    renderChecklist(checklistHost, {
      items: filterChecklist(checklist.items, { query: prep.query, filter: prep.filter, sort: prep.sort }),
      allItems: checklist.items,
      checked: prep.checked,
      onToggle: (id, checked) => {
        if (checked) prep.checked.add(id);
        else prep.checked.delete(id);
      },
    });
    renderIngredientTable(tableHost, {
      items: prep.items,
      onAdd: () =>
        openIngredientForm({
          title: 'Tambah Bahan Baku',
          existingIds: prep.items.map((it) => it.id),
          onSubmit: (values) => {
            const { items, item } = addIngredient(prep.items, values);
            prep.items = items;
            persist();
            toast(`${item.nama} ditambahkan.`, { type: 'success' });
            paint();
          },
        }),
      onEdit: (id) => {
        const item = prep.items.find((it) => it.id === id);
        if (!item) return;
        openIngredientForm({
          title: `Edit: ${item.nama}`,
          initial: item,
          existingIds: prep.items.map((it) => it.id),
          onSubmit: (values) => {
            const { items, item: updated } = updateIngredient(prep.items, id, values);
            prep.items = items;
            persist();
            toast(`Perubahan ${updated.nama} disimpan.`, { type: 'success' });
            paint();
          },
        });
      },
      onDelete: async (id) => {
        const item = prep.items.find((it) => it.id === id);
        if (!item) return;
        const ok = await confirmDialog({
          title: 'Hapus Bahan',
          message: `Hapus "${item.nama}" dari daftar inventori toko?`,
          confirmLabel: 'Hapus',
        });
        if (!ok) return;
        const { items } = removeIngredient(prep.items, id);
        prep.items = items;
        prep.checked.delete(id);
        persist();
        toast(`${item.nama} dihapus.`, { type: 'info' });
        paint();
      },
      onAdjustStock: (id, direction) => {
        const item = prep.items.find((it) => it.id === id);
        if (!item) return;
        const next = nextStockValue(item.stokSaatIni, direction, stockStep(item));
        if (next === item.stokSaatIni) return;
        item.stokSaatIni = next;
        persist();
        paint();
      },
    });
  }

  function persist() {
    const result = saveSellerIngredients(user, prep.items);
    if (!result.ok) toast(result.error, { type: 'error' });
  }

  filterControl.addEventListener('change', () => {
    prep.filter = filterControl.value;
    paint();
  });
  sortControl.addEventListener('change', () => {
    prep.sort = sortControl.value;
    paint();
  });
  searchControl.addEventListener('input', () => {
    prep.query = searchControl.value;
    paint();
  });

  mount(dataActionsHost, [
    el('button', {
      className: 'btn btn--ghost',
      textContent: '⬇️ Export JSON',
      attrs: { type: 'button' },
      onClick: () => {
        const filename = `takarkopi-${user.id}-${toISODate(new Date())}.json`;
        downloadJSON(filename, serializeExport(prep.items));
        toast(`Backup ${prep.items.length} bahan diunduh.`, { type: 'success' });
      },
    }),
    el('button', {
      className: 'btn btn--ghost',
      textContent: '⬆️ Import JSON',
      attrs: { type: 'button' },
      onClick: () =>
        openImportDialog({
          onImport: (items) => {
            prep.items = items;
            prep.checked.clear();
            persist();
            toast(`Berhasil impor ${items.length} bahan.`, { type: 'success' });
            paint();
          },
        }),
    }),
    el('button', {
      className: 'btn btn--danger-ghost',
      textContent: '♻️ Reset Data Demo',
      attrs: { type: 'button' },
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Reset Inventori',
          message: 'Ganti seluruh inventori toko dengan 8 bahan demo?',
          confirmLabel: 'Reset',
          danger: false,
        });
        if (!ok) return;
        clearSellerIngredients(user);
        prep.items = sellerDemoIngredients();
        prep.checked.clear();
        persist();
        toast('Inventori demo dipulihkan.', { type: 'success' });
        paint();
      },
    }),
  ]);

  mount(host, [
    pageHead(
      'Smart Prep & Stok',
      `${formatWeekday(today)} · ${formatHumanDate(toISODate(today))} — prediksi prep memakai cuaca, kalender, dan kedaluwarsa bahan.`,
    ),
    el('section', { className: 'panel' }, [
      el('div', { className: 'panel__head' }, [el('h2', { className: 'panel__title', textContent: '1. Trigger Cuaca & Event' })]),
      el('p', { className: 'panel__note', textContent: 'Ubah kondisi hari ini — checklist dan ringkasan dihitung ulang langsung.' }),
      triggersHost,
    ]),
    el('section', { className: 'panel' }, [
      el('div', { className: 'panel__head' }, [el('h2', { className: 'panel__title', textContent: '2. Ringkasan Dapur' })]),
      statsHost,
    ]),
    el('section', { className: 'panel' }, [
      el('div', { className: 'panel__head panel__head--wrap' }, [
        el('h2', { className: 'panel__title', textContent: '3. Smart Prep Checklist' }),
        el('div', { className: 'prep-toolbar' }, [filterControl, sortControl, searchControl]),
      ]),
      checklistHost,
    ]),
    el('section', { className: 'panel' }, [
      el('div', { className: 'panel__head' }, [el('h2', { className: 'panel__title', textContent: '4. Manajemen Bahan Baku' })]),
      el('p', { className: 'panel__note', textContent: 'Tambah, edit, atau sesuaikan stok fisik inventori toko Anda.' }),
      tableHost,
      dataActionsHost,
    ]),
  ]);

  paint();
}
