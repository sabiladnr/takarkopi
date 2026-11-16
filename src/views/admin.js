/**
 * admin.js — panel admin platform:
 * ringkasan, manajemen pengguna, moderasi produk, dan seluruh pesanan.
 */

import { el, mount, toast } from '../ui.js';
import {
  pageHead,
  statGrid,
  emptyState,
  productImage,
  orderCard,
  formatIDR,
  statusChip,
  roleBadge,
  input,
} from '../components.js';
import {
  allUsers,
  allProducts,
  allOrders,
  sellerName,
  setUserStatus,
  setUserRole,
  setProductStatus,
  updateOrderStatus,
  verifyTransfer,
} from '../store.js';
import {
  ROLES,
  ROLE_LABEL,
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  allowedTransitions,
  summarizeOrders,
  inventoryValue,
  countLowStock,
  formatDate,
  initials,
} from '../domain.js';

/* ------------------------------------------------------------------ */
/* Ringkasan admin                                                    */
/* ------------------------------------------------------------------ */

export function renderAdminDashboard(host, ctx) {
  const users = allUsers();
  const products = allProducts();
  const orders = allOrders();
  const summary = summarizeOrders(orders);
  const sellers = users.filter((u) => u.role === ROLES.SELLER);
  const buyers = users.filter((u) => u.role === ROLES.BUYER);
  const lowStockCount = countLowStock(products);

  const revenueBySeller = new Map();
  for (const order of orders) {
    if (order.status !== 'selesai') continue;
    revenueBySeller.set(order.sellerId, (revenueBySeller.get(order.sellerId) ?? 0) + order.total);
  }
  const topSellers = [...revenueBySeller.entries()]
    .map(([sellerId, revenue]) => ({ seller: users.find((u) => u.id === sellerId), revenue }))
    .filter((row) => row.seller)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4);

  mount(host, [
    pageHead(
      'Ringkasan Platform',
      'Pantau pertumbuhan pengguna, produk, dan transaksi TakarKopi.',
      [el('a', { className: 'btn btn--primary', textContent: 'Kelola Pengguna', attrs: { href: '#/admin/pengguna' } })],
    ),
    statGrid([
      { icon: '👥', label: 'Total pengguna', value: users.length, hint: `${sellers.length} seller · ${buyers.length} pembeli` },
      {
        icon: '🏪',
        label: 'Seller aktif',
        value: sellers.filter((s) => s.status === 'aktif').length,
        hint: `${products.filter((p) => p.status === 'aktif').length} produk tayang`,
      },
      { icon: '📦', label: 'Total pesanan', value: summary.total, hint: `${summary.pending} sedang berjalan` },
      { icon: '💰', label: 'GMV selesai', value: formatIDR(summary.revenue), hint: `${summary.byStatus.selesai} pesanan selesai`, tone: 'ok' },
      { icon: '⚠️', label: 'Stok menipis', value: lowStockCount, hint: 'Produk dengan stok ≤ 10', tone: lowStockCount ? 'danger' : 'ok' },
    ]),
    el('div', { className: 'dashboard-grid' }, [
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head panel__head--wrap' }, [
          el('h2', { className: 'panel__title', textContent: 'Pesanan Terbaru' }),
          el('a', { className: 'btn btn--ghost btn--sm', textContent: 'Lihat semua', attrs: { href: '#/admin/pesanan' } }),
        ]),
        el(
          'ul',
          { className: 'list-rows' },
          orders.slice(0, 5).map((order) =>
            el('li', { className: 'list-row' }, [
              el('div', { className: 'list-row__main' }, [
                el('strong', { textContent: `${order.kode} · ${formatIDR(order.total)}` }),
                el('span', {
                  textContent: `${users.find((u) => u.id === order.buyerId)?.nama ?? '-'} → ${sellerName(users.find((u) => u.id === order.sellerId))}`,
                }),
              ]),
              statusChip(order.status),
            ]),
          ),
        ),
      ]),
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [el('h2', { className: 'panel__title', textContent: 'Seller Teratas' })]),
        topSellers.length
          ? el(
              'ul',
              { className: 'list-rows' },
              topSellers.map((row, index) =>
                el('li', { className: 'list-row' }, [
                  el('span', { className: 'rank', textContent: `#${index + 1}` }),
                  el('div', { className: 'list-row__main' }, [
                    el('strong', { textContent: sellerName(row.seller) }),
                    el('span', { textContent: `${row.seller.kota || '-'} · ${row.seller.status}` }),
                  ]),
                  el('strong', { className: 'list-row__amount', textContent: formatIDR(row.revenue) }),
                ]),
              ),
            )
          : emptyState('📊', 'Belum ada penjualan', 'Data seller akan muncul setelah pesanan selesai.'),
        el('div', { className: 'status-breakdown' }, [
          el('p', { className: 'field__label', textContent: 'Distribusi status pesanan' }),
          ...ORDER_STATUSES.map((status) =>
            el('div', { className: 'status-breakdown__row' }, [
              el('span', { textContent: ORDER_STATUS_LABEL[status] }),
              el('div', { className: 'status-breakdown__bar' }, [
                el('span', {
                  className: `status-breakdown__fill is-${status}`,
                  style: { width: `${summary.total ? Math.round((summary.byStatus[status] / summary.total) * 100) : 0}%` },
                }),
              ]),
              el('strong', { textContent: String(summary.byStatus[status]) }),
            ]),
          ),
        ]),
        el('p', { className: 'panel__note', textContent: `Nilai persediaan platform: ${formatIDR(inventoryValue(products))}` }),
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Manajemen pengguna                                                 */
/* ------------------------------------------------------------------ */

const usersState = { query: '' };

export function renderAdminUsers(host, ctx) {
  const users = allUsers();
  const tbody = el('tbody');

  const search = input({ type: 'search', placeholder: '🔍 Cari nama, email, atau toko…' });
  search.value = usersState.query;

  function rowsForQuery() {
    const query = usersState.query.trim().toLowerCase();
    return users.filter((u) => {
      if (!query) return true;
      return `${u.nama} ${u.email} ${u.role} ${u.kota ?? ''} ${u.toko?.nama ?? ''}`.toLowerCase().includes(query);
    });
  }

  function paintRows() {
    const rows = rowsForQuery().map((user) => {
      const isSelf = user.id === ctx.user.id;
      const roleSelect = el(
        'select',
        {
          className: 'field__control field__control--sm',
          attrs: { 'aria-label': `Peran ${user.nama}`, disabled: isSelf ? 'disabled' : false },
        },
        [
          { value: ROLES.ADMIN, label: ROLE_LABEL.admin },
          { value: ROLES.SELLER, label: ROLE_LABEL.seller },
          { value: ROLES.BUYER, label: ROLE_LABEL.buyer },
        ].map((opt) => {
          const item = el('option', { textContent: opt.label, attrs: { value: opt.value } });
          if (opt.value === user.role) item.selected = true;
          return item;
        }),
      );
      roleSelect.addEventListener('change', () => {
        const result = setUserRole(ctx.user, user.id, roleSelect.value);
        if (!result.ok) {
          toast(result.error, { type: 'error' });
          ctx.refresh();
          return;
        }
        toast(`Peran ${user.nama} diubah menjadi ${ROLE_LABEL[roleSelect.value]}.`, { type: 'success' });
        ctx.refresh();
      });

      return el('tr', { dataset: { id: user.id } }, [
        el('td', { dataset: { label: 'Pengguna' } }, [
          el('div', { className: 'user-cell' }, [
            el('span', { className: 'avatar', textContent: initials(user.nama), attrs: { 'aria-hidden': 'true' } }),
            el('div', { className: 'user-cell__info' }, [
              el('strong', { textContent: user.nama }),
              el('span', { textContent: user.email }),
            ]),
          ]),
        ]),
        el('td', { dataset: { label: 'Peran' } }, [el('div', { className: 'user-cell__role' }, [roleBadge(user.role), roleSelect])]),
        el('td', { dataset: { label: 'Toko / Kota' } }, [el('span', { textContent: user.toko?.nama || user.kota || '-' })]),
        el('td', { dataset: { label: 'Bergabung' } }, [el('span', { textContent: formatDate(user.createdAt) })]),
        el('td', { dataset: { label: 'Status' } }, [
          el('span', {
            className: `badge ${user.status === 'aktif' ? 'badge--ok' : 'badge--muted'}`,
            textContent: user.status === 'aktif' ? 'Aktif' : 'Nonaktif',
          }),
        ]),
        el('td', { className: 'actions', dataset: { label: 'Aksi' } }, [
          el('button', {
            className: `btn btn--sm ${user.status === 'aktif' ? 'btn--danger-ghost' : 'btn--primary'}`,
            textContent: isSelf ? 'Akun Anda' : user.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan',
            attrs: { type: 'button', disabled: isSelf ? 'disabled' : false },
            onClick: () => {
              const result = setUserStatus(ctx.user, user.id, user.status === 'aktif' ? 'nonaktif' : 'aktif');
              if (!result.ok) {
                toast(result.error, { type: 'error' });
                return;
              }
              toast(`Akun ${user.nama} ${result.user.status === 'aktif' ? 'diaktifkan' : 'dinonaktifkan'}.`, { type: 'success' });
              ctx.refresh();
            },
          }),
        ]),
      ]);
    });

    if (rows.length === 0) {
      mount(tbody, [
        el('tr', {}, [el('td', { attrs: { colspan: '6' } }, [emptyState('🔍', 'Pengguna tidak ditemukan', 'Coba kata kunci lain.')])]),
      ]);
      return;
    }
    mount(tbody, rows);
  }

  search.addEventListener('input', () => {
    usersState.query = search.value;
    paintRows();
  });

  paintRows();

  mount(host, [
    pageHead('Manajemen Pengguna', `${users.length} akun terdaftar — ubah peran atau nonaktifkan akun bermasalah.`),
    el('div', { className: 'toolbar filter-bar' }, [el('div', { className: 'filter-bar__search' }, [search])]),
    el('div', { className: 'table-wrap' }, [
      el('table', { className: 'data-table data-table--users' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { textContent: 'Pengguna' }),
            el('th', { textContent: 'Peran' }),
            el('th', { textContent: 'Toko / Kota' }),
            el('th', { textContent: 'Bergabung' }),
            el('th', { textContent: 'Status' }),
            el('th', { className: 'actions', textContent: 'Aksi' }),
          ]),
        ]),
        tbody,
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Moderasi produk                                                    */
/* ------------------------------------------------------------------ */

const productsState = { query: '', seller: 'all' };

export function renderAdminProducts(host, ctx) {
  const products = allProducts();
  const users = allUsers();
  const sellers = users.filter((u) => u.role === ROLES.SELLER);
  const tbody = el('tbody');

  const search = input({ type: 'search', placeholder: '🔍 Cari produk atau toko…' });
  search.value = productsState.query;

  const sellerFilter = el(
    'select',
    { className: 'field__control field__control--sm', attrs: { 'aria-label': 'Filter seller' } },
    [{ value: 'all', label: 'Semua seller' }, ...sellers.map((s) => ({ value: s.id, label: sellerName(s) }))].map((opt) => {
      const item = el('option', { textContent: opt.label, attrs: { value: opt.value } });
      if (opt.value === productsState.seller) item.selected = true;
      return item;
    }),
  );

  function paintRows() {
    const query = productsState.query.trim().toLowerCase();
    const filtered = products.filter((product) => {
      if (productsState.seller !== 'all' && product.sellerId !== productsState.seller) return false;
      if (!query) return true;
      const seller = users.find((u) => u.id === product.sellerId);
      return `${product.nama} ${product.kategori} ${seller?.nama ?? ''} ${seller?.toko?.nama ?? ''}`.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      mount(tbody, [
        el('tr', {}, [el('td', { attrs: { colspan: '5' } }, [emptyState('🔍', 'Produk tidak ditemukan', 'Ubah filter atau kata kunci.')])]),
      ]);
      return;
    }

    mount(
      tbody,
      filtered.map((product) => {
        const seller = users.find((u) => u.id === product.sellerId);
        return el('tr', { dataset: { id: product.id } }, [
          el('td', { dataset: { label: 'Produk' } }, [
            el('div', { className: 'cell-ingredient' }, [
              productImage(product, 'ingredient-thumb'),
              el('div', { className: 'cell-product' }, [
                el('span', { className: 'cell-ingredient__name', textContent: product.nama }),
                el('span', { className: 'cell-product__desc', textContent: `${product.kategori} · ${formatIDR(product.harga)} / ${product.satuan}` }),
              ]),
            ]),
          ]),
          el('td', { dataset: { label: 'Seller' } }, [el('span', { textContent: sellerName(seller) })]),
          el('td', { className: 'num', dataset: { label: 'Stok' } }, [
            el('span', {
              className: `stock-pill ${product.stok <= 10 ? 'stock-pill--low' : 'stock-pill--ok'}`,
              textContent: String(product.stok),
            }),
          ]),
          el('td', { dataset: { label: 'Status' } }, [
            el('span', {
              className: `badge ${product.status === 'aktif' ? 'badge--ok' : 'badge--muted'}`,
              textContent: product.status === 'aktif' ? 'Tayang' : 'Disembunyikan',
            }),
          ]),
          el('td', { className: 'actions', dataset: { label: 'Aksi' } }, [
            el('button', {
              className: `btn btn--sm ${product.status === 'aktif' ? 'btn--danger-ghost' : 'btn--primary'}`,
              textContent: product.status === 'aktif' ? 'Sembunyikan' : 'Tayangkan',
              attrs: { type: 'button' },
              onClick: () => {
                const result = setProductStatus(ctx.user, product.id, product.status === 'aktif' ? 'nonaktif' : 'aktif');
                if (!result.ok) {
                  toast(result.error, { type: 'error' });
                  return;
                }
                toast(`Produk ${product.nama} ${product.status === 'aktif' ? 'disembunyikan' : 'ditayangkan'}.`, { type: 'success' });
                ctx.refresh();
              },
            }),
          ]),
        ]);
      }),
    );
  }

  search.addEventListener('input', () => {
    productsState.query = search.value;
    paintRows();
  });
  sellerFilter.addEventListener('change', () => {
    productsState.seller = sellerFilter.value;
    paintRows();
  });

  paintRows();

  mount(host, [
    pageHead('Moderasi Produk', `${products.length} produk dari ${sellers.length} seller.`),
    el('div', { className: 'toolbar filter-bar' }, [
      el('div', { className: 'filter-bar__search' }, [search]),
      el('div', { className: 'filter-bar__select' }, [sellerFilter]),
    ]),
    el('div', { className: 'table-wrap' }, [
      el('table', { className: 'data-table data-table--products' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { textContent: 'Produk' }),
            el('th', { textContent: 'Seller' }),
            el('th', { className: 'num', textContent: 'Stok' }),
            el('th', { textContent: 'Status' }),
            el('th', { className: 'actions', textContent: 'Aksi' }),
          ]),
        ]),
        tbody,
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Semua pesanan                                                      */
/* ------------------------------------------------------------------ */

const adminOrderFilter = { value: 'all' };

export function renderAdminOrders(host, ctx) {
  const orders = allOrders();
  const users = allUsers();
  const summary = summarizeOrders(orders);
  const filtered = adminOrderFilter.value === 'all' ? orders : orders.filter((o) => o.status === adminOrderFilter.value);

  const chips = el(
    'div',
    { className: 'filter-chips' },
    [
      { value: 'all', label: `Semua (${orders.length})` },
      ...ORDER_STATUSES.map((s) => ({ value: s, label: `${ORDER_STATUS_LABEL[s]} (${summary.byStatus[s]})` })),
    ].map((chipDef) =>
      el('button', {
        className: `filter-chip ${adminOrderFilter.value === chipDef.value ? 'is-active' : ''}`,
        textContent: chipDef.label,
        attrs: { type: 'button' },
        onClick: () => {
          adminOrderFilter.value = chipDef.value;
          ctx.refresh();
        },
      }),
    ),
  );

  const cards = filtered.map((order) => {
    const buyer = users.find((u) => u.id === order.buyerId);
    const seller = users.find((u) => u.id === order.sellerId);
    const actions = allowedTransitions(order.status, 'admin').map((next) => ({
      status: next,
      variant: next === 'dibatalkan' ? 'danger-ghost' : 'primary',
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
    if (order.paymentBatchId && order.paymentStatus === 'menunggu_verifikasi') {
      actions.push({
        status: 'lunas',
        label: 'Verifikasi Transfer',
        variant: 'primary',
        onClick: () => {
          const result = verifyTransfer(order.paymentBatchId, ctx.user);
          if (!result.ok) {
            toast(result.error, { type: 'error' });
            return;
          }
          toast(`Transfer untuk ${order.kode} diverifikasi lunas.`, { type: 'success' });
          ctx.refresh();
        },
      });
    }
    return orderCard(order, {
      showBuyer: true,
      showSeller: true,
      buyerName: buyer?.nama ?? '-',
      sellerName: sellerName(seller),
      actions,
    });
  });

  mount(host, [
    pageHead('Semua Pesanan', 'Awasi transaksi lintas toko dan selesaikan sengketa.'),
    statGrid([
      { icon: '🧾', label: 'Total pesanan', value: summary.total },
      { icon: '🚚', label: 'Berjalan', value: summary.pending, tone: summary.pending ? 'warn' : 'ok' },
      { icon: '✅', label: 'Selesai', value: summary.byStatus.selesai, tone: 'ok' },
      { icon: '⛔', label: 'Dibatalkan', value: summary.byStatus.dibatalkan },
    ]),
    chips,
    filtered.length
      ? el('div', { className: 'order-list' }, cards)
      : emptyState('📭', 'Tidak ada pesanan', 'Belum ada transaksi dengan status ini.'),
  ]);
}
