/**
 * landing.js — halaman profil publik TakarKopi.
 * Menjelaskan platform & produk yang dijual, dengan animasi pembuka,
 * hero bertahap, reveal saat scroll, dan angka yang berhitung.
 */

import { el, mount, toast } from '../ui.js';
import { allProducts, userById, login, DEMO_ACCOUNTS, sellerName } from '../store.js';
import { productImage } from '../components.js';
import { formatIDR, ROLE_HOME, ROLE_LABEL } from '../domain.js';

const INTRO_KEY = 'takarkopi:intro-seen:v1';

const LINI_PRODUK = [
  {
    img: './images/coffee.svg',
    title: 'Biji Kopi',
    tag: 'Single origin',
    desc: 'Arabika Gayo & robusta pilihan, roast segar untuk espresso dan manual brew.',
  },
  {
    img: './images/milk.svg',
    title: 'Susu & Dairy',
    tag: 'Fresh & oat',
    desc: 'Susu segar pasteurisasi, UHT, dan oat milk barista dengan foam stabil.',
  },
  {
    img: './images/matcha.svg',
    title: 'Matcha & Teh',
    tag: 'Ceremonial grade',
    desc: 'Matcha Uji premium dan teh pilihan untuk menu signature kafe Anda.',
  },
  {
    img: './images/syrup.svg',
    title: 'Sirup & Gula',
    tag: 'Rasa konsisten',
    desc: 'Simple syrup, gula aren cair, dan puree stroberi tanpa pewarna buatan.',
  },
  {
    img: './images/croissant.svg',
    title: 'Pastry',
    tag: 'Panggang harian',
    desc: 'Croissant butter renyah, dipanggang pagi untuk teman kopi.',
  },
  {
    img: './images/ice.svg',
    title: 'Es & Pendukung',
    tag: 'Operasional',
    desc: 'Es batu kristal bening dan kebutuhan harian bar lainnya.',
  },
];

const PERAN = [
  {
    icon: '🛒',
    role: 'buyer',
    title: 'Pembeli / Kafe',
    desc: 'Belanja bahan baku dari beberapa supplier sekaligus, pantau stok, dan lacak pengiriman.',
    poin: ['Katalog & pencarian', 'Pesan via WA atau keranjang', 'Transfer & riwayat pesanan'],
  },
  {
    icon: '🏪',
    role: 'seller',
    title: 'Seller / Supplier',
    desc: 'Kelola katalog, harga, stok, pesanan masuk, plus prediksi prep harian berbasis cuaca.',
    poin: ['CRUD produk & stok', 'Proses pesanan', 'Smart Prep & kedaluwarsa'],
  },
  {
    icon: '🛡️',
    role: 'admin',
    title: 'Admin Platform',
    desc: 'Awasi pengguna, moderasi produk lintas toko, dan pantau seluruh transaksi.',
    poin: ['Manajemen peran', 'Moderasi produk', 'Statistik & GMV'],
  },
];

function reduceMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------------------------------------------ */
/* Animasi                                                            */
/* ------------------------------------------------------------------ */

/** Animasi pembuka singkat (sekali per sesi). */
function playIntro() {
  try {
    if (sessionStorage.getItem(INTRO_KEY) || reduceMotion()) return;
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    return;
  }
  if (document.querySelector('.tk-intro')) return;

  const overlay = el('div', { className: 'tk-intro', attrs: { 'aria-hidden': 'true' } }, [
    el('div', { className: 'tk-intro__steam' }, [
      el('span', { className: 'tk-intro__steam-line' }),
      el('span', { className: 'tk-intro__steam-line tk-intro__steam-line--2' }),
      el('span', { className: 'tk-intro__steam-line tk-intro__steam-line--3' }),
    ]),
    el('div', { className: 'tk-intro__cup', textContent: '☕' }),
    el('div', { className: 'tk-intro__brand', textContent: 'TakarKopi' }),
    el('div', { className: 'tk-intro__line' }),
  ]);

  document.body.append(overlay);
  setTimeout(() => overlay.classList.add('is-leaving'), 1050);
  setTimeout(() => overlay.remove(), 1750);
}

/** Tampilkan elemen `.reveal` saat masuk viewport. */
function setupReveal(host) {
  const nodes = [...host.querySelectorAll('.reveal')];
  if (nodes.length === 0) return;

  if (reduceMotion() || typeof IntersectionObserver !== 'function') {
    nodes.forEach((node) => node.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );
  nodes.forEach((node) => observer.observe(node));
}

/** Animasi angka statistik dari 0 ke nilai data-count. */
function setupCounters(host) {
  const counters = [...host.querySelectorAll('[data-count]')];
  if (counters.length === 0) return;

  const render = (node) => {
    const target = Number(node.dataset.count) || 0;
    node.textContent = `${target.toLocaleString('id-ID')}${node.dataset.suffix ?? ''}`;
  };

  if (reduceMotion() || typeof IntersectionObserver !== 'function') {
    counters.forEach(render);
    return;
  }

  const animate = (node) => {
    const target = Number(node.dataset.count) || 0;
    const suffix = node.dataset.suffix ?? '';
    const duration = 1200;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = `${Math.round(target * eased).toLocaleString('id-ID')}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        animate(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.4 },
  );
  counters.forEach((node) => observer.observe(node));
}

/* ------------------------------------------------------------------ */
/* Data untuk halaman                                                 */
/* ------------------------------------------------------------------ */

function landingData() {
  const products = allProducts().filter((p) => {
    const seller = userById(p.sellerId);
    return p.status === 'aktif' && seller && seller.status === 'aktif' && seller.role === 'seller';
  });
  const sellers = [...new Set(products.map((p) => p.sellerId))]
    .map((id) => userById(id))
    .filter(Boolean);

  const favorit = ['p-01', 'p-09', 'p-02', 'p-10'];
  const featured = [];
  for (const id of favorit) {
    const product = products.find((p) => p.id === id);
    if (product) featured.push(product);
  }
  for (const product of products) {
    if (featured.length >= 4) break;
    if (!featured.includes(product)) featured.push(product);
  }

  return { products, sellers, featured: featured.slice(0, 4) };
}

/* ------------------------------------------------------------------ */
/* Halaman                                                            */
/* ------------------------------------------------------------------ */

export function renderLanding(root, ctx) {
  playIntro();
  const { products, sellers, featured } = landingData();

  const scrollTo = (id) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  const demoLogin = async (role, button) => {
    const account = DEMO_ACCOUNTS.find((item) => item.role === role) ?? DEMO_ACCOUNTS[0];
    button.disabled = true;
    const result = await login(account.email, account.password);
    if (!result.ok) {
      button.disabled = false;
      toast(result.error, { type: 'error' });
      return;
    }
    toast(`Masuk sebagai ${ROLE_LABEL[result.user.role]} — selamat mencoba!`, { type: 'success' });
    ctx.navigate(ROLE_HOME[result.user.role]);
  };

  const navLink = (label, id) =>
    el('button', {
      className: 'landing-nav__link',
      textContent: label,
      attrs: { type: 'button' },
      onClick: () => scrollTo(id),
    });

  const header = el('header', { className: 'landing-nav' }, [
    el('a', { className: 'landing-brand', attrs: { href: '#/' } }, [
      el('span', { className: 'landing-brand__mark', textContent: '☕', attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'landing-brand__text' }, [
        el('strong', { textContent: 'TakarKopi' }),
        el('span', { textContent: 'Bahan baku kafe, ditakar lebih cerdas' }),
      ]),
    ]),
    el('nav', { className: 'landing-nav__links', attrs: { 'aria-label': 'Navigasi profil' } }, [
      navLink('Produk', 'produk'),
      navLink('Cerita', 'cerita'),
      navLink('Cara Kerja', 'cara-kerja'),
      navLink('Mitra', 'mitra'),
    ]),
    el('div', { className: 'landing-nav__actions' }, [
      el('a', { className: 'btn btn--ghost btn--sm', textContent: 'Masuk', attrs: { href: '#/login' } }),
      el('button', {
        className: 'btn btn--pink btn--sm',
        textContent: 'Coba demo',
        attrs: { type: 'button' },
        onClick: (event) => demoLogin('buyer', event.currentTarget),
      }),
    ]),
  ]);

  /* -------------------------------- Hero -------------------------------- */

  const hero = el('section', { className: 'landing-hero', attrs: { id: 'beranda' } }, [
    batikLayer('landing-batik--hero'),
    el('div', { className: 'landing-hero__glow landing-hero__glow--pink', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'landing-hero__glow landing-hero__glow--green', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'landing-hero__inner' }, [
      el('div', { className: 'landing-hero__copy' }, [
        el('span', { className: 'landing-eyebrow' }, [
          el('span', { className: 'landing-eyebrow__dot', attrs: { 'aria-hidden': 'true' } }),
          'Marketplace bahan baku kafe · Banyuwangi',
        ]),
        el('h1', { className: 'landing-hero__title' }, [
          el('span', { className: 'landing-hero__line', textContent: 'Bahan baku terbaik,' }),
          el('span', { className: 'landing-hero__line landing-hero__line--accent', textContent: 'kopi yang konsisten.' }),
        ]),
        el('p', { className: 'landing-hero__lead' }, [
          'TakarKopi mempertemukan kafe dengan supplier lokal: ',
          el('strong', { textContent: 'susu segar, biji kopi, matcha, sirup, dan pastry' }),
          ' dalam satu tempat — lengkap dengan prediksi persiapan harian agar stok tidak mubazir.',
        ]),
        el('div', { className: 'landing-hero__actions' }, [
          el('a', { className: 'btn btn--primary btn--lg', textContent: 'Masuk & mulai belanja', attrs: { href: '#/login' } }),
          el('button', {
            className: 'btn btn--ghost btn--lg',
            textContent: 'Lihat lini produk ↓',
            attrs: { type: 'button' },
            onClick: () => scrollTo('produk'),
          }),
        ]),
        el('ul', { className: 'landing-hero__stats' }, [
          heroStat(products.length, '+', 'Produk aktif'),
          heroStat(sellers.length, '', 'Toko mitra'),
          heroStat(3, '', 'Peran pengguna'),
          heroStat(100, '%', 'Data lokal'),
        ]),
      ]),
      el('div', { className: 'landing-hero__art' }, [
        el('div', { className: 'landing-hero__frame' }, [
          el('img', {
            className: 'landing-hero__img',
            attrs: { src: './images/cafe-hero.svg', alt: 'Ilustrasi bar dan area kafe TakarKopi', decoding: 'async' },
          }),
          el('div', { className: 'landing-steam', attrs: { 'aria-hidden': 'true' } }, [
            el('span', { className: 'landing-steam__line' }),
            el('span', { className: 'landing-steam__line landing-steam__line--2' }),
            el('span', { className: 'landing-steam__line landing-steam__line--3' }),
          ]),
          el('span', { className: 'landing-float landing-float--matcha', textContent: '🍵 Matcha premium' }),
          el('span', { className: 'landing-float landing-float--milk', textContent: '🥛 Susu segar' }),
          el('div', { className: 'landing-hero__badge' }, [
            el('span', { textContent: '🧾' }),
            el('div', {}, [
              el('strong', { textContent: 'Smart Prep' }),
              el('span', { textContent: 'Hitung takaran dari cuaca & event' }),
            ]),
          ]),
        ]),
      ]),
    ]),
    el('div', { className: 'landing-scroll-cue', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { textContent: 'Scroll untuk kenalan' }),
      el('span', { className: 'landing-scroll-cue__mouse' }),
    ]),
  ]);

  /* ------------------------------- Ticker ------------------------------- */

  const tickerItems = ['Biji Kopi', 'Susu Segar', 'Matcha Premium', 'Sirup & Gula', 'Pastry Harian', 'Es Kristal', 'Smart Prep'];
  const tickerRun = tickerItems.map((item) => el('span', { className: 'landing-ticker__item', textContent: item }));
  const ticker = el('div', { className: 'landing-ticker', attrs: { 'aria-hidden': 'true' } }, [
    el('div', { className: 'landing-ticker__track' }, [...tickerRun, ...tickerRun.map((node) => node.cloneNode(true))]),
  ]);

  /* ---------------------------- Lini produk ----------------------------- */

  const produk = el('section', { className: 'landing-section', attrs: { id: 'produk' } }, [
    el('div', { className: 'landing-section__head reveal' }, [
      el('div', {}, [
        el('span', { className: 'landing-kicker', textContent: 'Lini Produk' }),
        el('h2', { className: 'landing-section__title', textContent: 'Apa saja yang bisa Anda belanja?' }),
      ]),
      el('p', { className: 'landing-section__note', textContent: 'Semua kebutuhan harian bar dalam satu etalase — dari biji kopi sampai pastry.' }),
    ]),
    el(
      'div',
      { className: 'landing-lines' },
      LINI_PRODUK.map((line, index) =>
        el('article', { className: 'landing-line reveal', style: { transitionDelay: `${index * 70}ms` } }, [
          el('div', { className: 'landing-line__media' }, [
            el('img', { className: 'landing-line__img', attrs: { src: line.img, alt: `Ilustrasi ${line.title}`, loading: 'lazy' } }),
            el('span', { className: 'landing-line__tag', textContent: line.tag }),
          ]),
          el('div', { className: 'landing-line__body' }, [
            el('h3', { textContent: line.title }),
            el('p', { textContent: line.desc }),
          ]),
        ]),
      ),
    ),
  ]);

  /* ---------------------------- Produk unggulan -------------------------- */

  const unggulan = el('section', { className: 'landing-section landing-section--soft', attrs: { id: 'unggulan' } }, [
    el('div', { className: 'landing-section__head reveal' }, [
      el('div', {}, [
        el('span', { className: 'landing-kicker', textContent: 'Dari Toko Mitra' }),
        el('h2', { className: 'landing-section__title', textContent: 'Produk yang paling dicari kafe' }),
      ]),
      el('button', {
        className: 'btn btn--ghost',
        textContent: 'Lihat semua di aplikasi →',
        attrs: { type: 'button' },
        onClick: () => ctx.navigate('#/login'),
      }),
    ]),
    el(
      'div',
      { className: 'landing-products' },
      featured.map((product, index) => {
        const seller = userById(product.sellerId);
        return el('article', { className: 'landing-product reveal', style: { transitionDelay: `${index * 80}ms` } }, [
          el('div', { className: 'landing-product__media' }, [productImage(product, 'landing-product__img')]),
          el('div', { className: 'landing-product__body' }, [
            el('span', { className: 'landing-product__seller', textContent: sellerName(seller) }),
            el('h3', { className: 'landing-product__name', textContent: product.nama }),
            el('div', { className: 'landing-product__foot' }, [
              el('span', { className: 'landing-product__price' }, [
                el('strong', { textContent: formatIDR(product.harga) }),
                el('span', { textContent: ` / ${product.satuan}` }),
              ]),
              el('span', { className: 'landing-product__stock', textContent: `Stok ${product.stok}` }),
            ]),
          ]),
        ]);
      }),
    ),
  ]);

  /* ------------------------------- Cerita -------------------------------- */

  const cerita = el('section', { className: 'landing-story', attrs: { id: 'cerita' } }, [
    batikLayer('landing-batik--story'),
    el('div', { className: 'landing-story__headline reveal' }, [
      el('span', { className: 'landing-kicker', textContent: 'Cerita Kami' }),
      el('h2', { className: 'landing-story__title' }, [
        el('span', { textContent: 'Berawal dari ' }),
        el('em', { textContent: 'satu takaran' }),
        el('span', { textContent: ', kini jadi standar baru kafe lokal.' }),
      ]),
      el('span', { className: 'landing-story__badge', textContent: 'Est. 2026 · Banyuwangi' }),
      el('div', { className: 'landing-batik-card' }, [
        el('img', {
          className: 'landing-batik-card__img',
          attrs: { src: './images/batik-gajah-oling.svg', alt: 'Motif batik Gajah Oling khas Banyuwangi', loading: 'lazy' },
        }),
        el('div', { className: 'landing-batik-card__text' }, [
          el('strong', { textContent: 'Batik Gajah Oling' }),
          el('span', { textContent: 'Motif khas Banyuwangi — belalai gajah melingkar, simbol ketekunan meracik.' }),
        ]),
      ]),
    ]),
    el('div', { className: 'landing-story__body reveal' }, [
      el('p', {
        textContent:
          'TakarKopi lahir di Banyuwangi dari kebiasaan sederhana: menakar bahan baku pagi hari. Terlalu banyak susu berarti mubazir; terlalu sedikit berarti pelanggan kecewa. Kami mengubah kebiasaan itu menjadi sistem yang bisa dipakai kafe mana pun.',
      }),
      el('p', {
        textContent:
          'Kini TakarKopi menghubungkan supplier lokal dengan kafe yang butuh pasokan konsisten. Setiap seller mengelola katalognya sendiri, setiap pembeli bisa membandingkan dan memesan lintas toko, dan setiap pesanan tercatat rapi.',
      }),
      el('ul', { className: 'landing-values' }, [
        nilai('🌿', 'Bahan lokal', 'Prioritas supplier lokal dengan produk segar.'),
        nilai('⚖️', 'Takaran presisi', 'Prediksi prep dari cuaca, event, dan kedaluwarsa.'),
        nilai('🤝', 'Transparan', 'Harga, stok, dan status pesanan terlihat jelas.'),
      ]),
    ]),
  ]);

  /* ------------------------------ Cara kerja ---------------------------- */

  const caraKerja = el('section', { className: 'landing-section', attrs: { id: 'cara-kerja' } }, [
    el('div', { className: 'landing-section__head reveal' }, [
      el('div', {}, [
        el('span', { className: 'landing-kicker', textContent: 'Satu Platform, Tiga Peran' }),
        el('h2', { className: 'landing-section__title', textContent: 'Cara kerja TakarKopi' }),
      ]),
      el('p', { className: 'landing-section__note', textContent: 'Coba langsung dengan akun demo — tanpa perlu mendaftar.' }),
    ]),
    el(
      'div',
      { className: 'landing-roles' },
      PERAN.map((peran, index) =>
        el('article', { className: `landing-role landing-role--${peran.role} reveal`, style: { transitionDelay: `${index * 90}ms` } }, [
          el('span', { className: 'landing-role__icon', textContent: peran.icon, attrs: { 'aria-hidden': 'true' } }),
          el('h3', { textContent: peran.title }),
          el('p', { textContent: peran.desc }),
          el('ul', {}, peran.poin.map((item) => el('li', { textContent: item }))),
          el('button', {
            className: 'btn btn--ghost btn--block',
            textContent: `Coba sebagai ${peran.title.split(' /')[0]}`,
            attrs: { type: 'button' },
            onClick: (event) => demoLogin(peran.role, event.currentTarget),
          }),
        ]),
      ),
    ),
  ]);

  /* -------------------------------- Mitra ------------------------------- */

  const mitra = el('section', { className: 'landing-section landing-section--soft', attrs: { id: 'mitra' } }, [
    el('div', { className: 'landing-section__head reveal' }, [
      el('div', {}, [
        el('span', { className: 'landing-kicker', textContent: 'Toko Mitra' }),
        el('h2', { className: 'landing-section__title', textContent: 'Supplier yang sudah bergabung' }),
      ]),
    ]),
    el(
      'div',
      { className: 'landing-partners' },
      sellers.map((seller, index) => {
        const tokoProducts = products.filter((p) => p.sellerId === seller.id).slice(0, 3);
        return el('article', { className: 'landing-partner reveal', style: { transitionDelay: `${index * 90}ms` } }, [
          el('div', { className: 'landing-partner__photos' }, tokoProducts.map((p) => productImage(p, 'landing-partner__img'))),
          el('div', { className: 'landing-partner__body' }, [
            el('span', { className: 'landing-partner__city', textContent: seller.toko?.kota ?? seller.kota ?? '-' }),
            el('h3', { textContent: sellerName(seller) }),
            el('p', { textContent: seller.toko?.deskripsi ?? 'Supplier bahan baku kafe.' }),
            el('span', { className: 'landing-partner__meta', textContent: `${products.filter((p) => p.sellerId === seller.id).length} produk aktif` }),
          ]),
        ]);
      }),
    ),
  ]);

  /* ------------------------------- CTA akhir ---------------------------- */

  const cta = el('section', { className: 'landing-cta reveal' }, [
    batikLayer('landing-batik--dark'),
    el('div', { className: 'landing-cta__glow', attrs: { 'aria-hidden': 'true' } }),
    el('span', { className: 'landing-kicker landing-kicker--light', textContent: 'Siap mulai?' }),
    el('h2', { className: 'landing-cta__title', textContent: 'Takarkan lebih sedikit, hasilkan lebih banyak.' }),
    el('p', { className: 'landing-cta__text', textContent: 'Masuk sebagai pembeli, seller, atau admin — semua data demo sudah disiapkan.' }),
    el('div', { className: 'landing-cta__actions' }, [
      el('a', { className: 'btn btn--primary btn--lg', textContent: 'Masuk ke TakarKopi', attrs: { href: '#/login' } }),
      el('button', {
        className: 'btn btn--ghost btn--lg landing-cta__ghost',
        textContent: 'Coba sebagai pembeli',
        attrs: { type: 'button' },
        onClick: (event) => demoLogin('buyer', event.currentTarget),
      }),
    ]),
  ]);

  const footer = el('footer', { className: 'landing-footer' }, [
    el('div', { className: 'landing-footer__brand' }, [
      el('span', { className: 'landing-brand__mark', textContent: '☕', attrs: { 'aria-hidden': 'true' } }),
      el('div', {}, [
        el('strong', { textContent: 'TakarKopi' }),
        el('p', { textContent: 'Marketplace & Smart Prep bahan baku kafe.' }),
      ]),
    ]),
    el('div', { className: 'landing-footer__links' }, [
      navLink('Produk', 'produk'),
      navLink('Cerita', 'cerita'),
      navLink('Cara Kerja', 'cara-kerja'),
      navLink('Mitra', 'mitra'),
    ]),
    el('p', { className: 'landing-footer__note', textContent: '© 2026 TakarKopi · Demo data lokal (localStorage) · Skema MySQL di db/schema.sql' }),
  ]);

  const page = el('div', { className: 'landing' }, [header, hero, ticker, produk, unggulan, cerita, caraKerja, mitra, cta, footer]);
  mount(root, [page]);

  setupReveal(page);
  setupCounters(page);
}

function batikLayer(extra = '') {
  return el('div', {
    className: `landing-batik ${extra}`.trim(),
    attrs: { 'aria-hidden': 'true' },
    style: { backgroundImage: "url('./images/batik-gajah-oling.svg')" },
  });
}

function heroStat(value, suffix, label) {
  return el('li', {}, [
    el('strong', { attrs: { 'data-count': String(value), 'data-suffix': suffix }, textContent: `${value}${suffix}` }),
    el('span', { textContent: label }),
  ]);
}

function nilai(icon, title, desc) {
  return el('li', { className: 'landing-value' }, [
    el('span', { className: 'landing-value__icon', textContent: icon, attrs: { 'aria-hidden': 'true' } }),
    el('div', {}, [el('strong', { textContent: title }), el('span', { textContent: desc })]),
  ]);
}
