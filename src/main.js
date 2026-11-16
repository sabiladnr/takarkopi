/**
 * main.js — entry point TakarKopi Marketplace.
 * Router hash sederhana + shell per peran (admin / seller / pembeli).
 */

import './style.css';
import './app.css';
import './landing.css';

import { el, mount, toast } from './ui.js';
import { currentUser, logoutUser, cartCount, sellerName } from './store.js';
import { ROLE_HOME, ROLE_LABEL, ROLE_ICON, initials } from './domain.js';
import { renderAuth } from './views/auth.js';
import { renderLanding } from './views/landing.js';
import { renderCatalog, renderCart, renderBuyerOrders, renderPayment } from './views/buyer.js';
import {
  renderSellerDashboard,
  renderSellerProducts,
  renderSellerOrders,
  renderSellerPrep,
} from './views/seller.js';
import { renderAdminDashboard, renderAdminUsers, renderAdminProducts, renderAdminOrders } from './views/admin.js';

const root = document.querySelector('#app');

/** Peta hash route -> view + peran yang boleh mengakses. */
const VIEWS = {
  '#/katalog': { roles: ['buyer'], render: renderCatalog },
  '#/keranjang': { roles: ['buyer'], render: renderCart },
  '#/pesanan': { roles: ['buyer'], render: renderBuyerOrders },
  '#/seller': { roles: ['seller'], render: renderSellerDashboard },
  '#/seller/produk': { roles: ['seller'], render: renderSellerProducts },
  '#/seller/pesanan': { roles: ['seller'], render: renderSellerOrders },
  '#/seller/prep': { roles: ['seller'], render: renderSellerPrep },
  '#/admin': { roles: ['admin'], render: renderAdminDashboard },
  '#/admin/pengguna': { roles: ['admin'], render: renderAdminUsers },
  '#/admin/produk': { roles: ['admin'], render: renderAdminProducts },
  '#/admin/pesanan': { roles: ['admin'], render: renderAdminOrders },
};

const NAV = {
  buyer: [
    { href: '#/katalog', icon: '🛍️', label: 'Katalog' },
    { href: '#/keranjang', icon: '🛒', label: 'Keranjang', cart: true },
    { href: '#/pesanan', icon: '📦', label: 'Pesanan' },
  ],
  seller: [
    { href: '#/seller', icon: '📊', label: 'Ringkasan' },
    { href: '#/seller/produk', icon: '🏷️', label: 'Produk' },
    { href: '#/seller/pesanan', icon: '📥', label: 'Pesanan' },
    { href: '#/seller/prep', icon: '☕', label: 'Smart Prep' },
  ],
  admin: [
    { href: '#/admin', icon: '📊', label: 'Ringkasan' },
    { href: '#/admin/pengguna', icon: '👥', label: 'Pengguna' },
    { href: '#/admin/produk', icon: '📦', label: 'Produk' },
    { href: '#/admin/pesanan', icon: '🧾', label: 'Pesanan' },
  ],
};

/** Navigasi ke hash tertentu; render ulang bila hash tidak berubah. */
function navigate(target) {
  if (window.location.hash === target) {
    renderApp();
    return;
  }
  window.location.hash = target;
}

function homeFor(role) {
  return ROLE_HOME[role] ?? '#/katalog';
}

function renderApp() {
  const user = currentUser();
  const hash = window.location.hash;

  if (!user) {
    // Halaman publik: profil platform (landing) dan halaman masuk.
    if (hash === '#/login') {
      renderAuth(root, { navigate, homeFor });
      return;
    }
    if (hash && hash !== '#/' && hash !== '#/beranda') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    }
    renderLanding(root, { navigate });
    return;
  }

  if (!hash || hash === '#/' || hash === '#/beranda' || hash === '#/login') {
    navigate(homeFor(user.role));
    return;
  }

  let route = VIEWS[hash];
  if (!route && hash.startsWith('#/pembayaran/')) {
    const batchId = decodeURIComponent(hash.slice('#/pembayaran/'.length));
    route = { roles: ['buyer'], render: (host, ctx) => renderPayment(host, ctx, batchId) };
  }
  if (!route) {
    navigate(homeFor(user.role));
    return;
  }
  if (!route.roles.includes(user.role)) {
    toast('Halaman ini tidak tersedia untuk peran Anda.', { type: 'error' });
    navigate(homeFor(user.role));
    return;
  }

  renderShell(user, hash, route);
}

function renderShell(user, hash, route) {
  const cartTotal = cartCount(user.id);
  const navItems = NAV[user.role].map((item) =>
    el('a', {
      className: `nav-link ${hash === item.href ? 'is-active' : ''}`,
      attrs: { href: item.href, 'aria-current': hash === item.href ? 'page' : null },
    }, [
      el('span', { className: 'nav-link__icon', textContent: item.icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { textContent: item.label }),
      item.cart
        ? el('span', { className: 'nav-cart-count', textContent: String(cartTotal), attrs: { id: 'nav-cart-count' } })
        : null,
    ]),
  );

  const displayName = user.role === 'seller' ? sellerName(user) : user.nama;

  const shell = el('div', { className: 'shell' }, [
    el('header', { className: 'topbar' }, [
      el('a', { className: 'brand brand--sm', attrs: { href: homeFor(user.role) } }, [
        el('span', { className: 'brand__logo', textContent: '☕', attrs: { 'aria-hidden': 'true' } }),
        el('div', { className: 'brand__text' }, [
          el('span', { className: 'brand__name', textContent: 'TakarKopi' }),
          el('span', { className: 'brand__tagline', textContent: 'Marketplace Bahan Baku Kafe' }),
        ]),
      ]),
      el('nav', { className: 'topbar__nav', attrs: { 'aria-label': 'Navigasi utama' } }, navItems),
      el('div', { className: 'topbar__user' }, [
        el('div', { className: 'user-chip' }, [
          el('span', { className: 'avatar avatar--sm', textContent: initials(displayName), attrs: { 'aria-hidden': 'true' } }),
          el('div', { className: 'user-chip__text' }, [
            el('strong', { textContent: displayName }),
            el('span', { textContent: `${ROLE_ICON[user.role]} ${ROLE_LABEL[user.role]}` }),
          ]),
        ]),
        el('button', {
          className: 'btn btn--ghost btn--sm',
          textContent: 'Keluar',
          attrs: { type: 'button' },
          onClick: () => {
            logoutUser();
            toast('Anda telah keluar.', { type: 'info' });
            navigate('#/login');
          },
        }),
      ]),
    ]),
    el('main', { className: 'app app-main', attrs: { id: 'content' } }),
    el('footer', { className: 'app-footer shell__footer' }, [
      el('p', { textContent: 'TakarKopi · Demo produksi dengan 3 peran: admin, seller, dan pembeli.' }),
      el('p', {
        className: 'app-footer__note',
        textContent: 'Data dummy disimpan di localStorage. Skema MySQL tersedia di db/schema.sql untuk migrasi backend.',
      }),
    ]),
  ]);

  mount(root, [shell]);

  const content = shell.querySelector('#content');
  const ctx = {
    user,
    navigate,
    homeFor,
    refresh: renderApp,
    syncShell: () => {
      const badge = document.querySelector('#nav-cart-count');
      if (badge) badge.textContent = String(cartCount(user.id));
    },
  };

  route.render(content, ctx);
}

window.addEventListener('hashchange', renderApp);
renderApp();
