/**
 * auth.js — halaman masuk & daftar akun.
 * Menampilkan akun demo (admin/seller/pembeli) untuk mencoba tiap peran.
 */

import { el, mount, toast } from '../ui.js';
import { DEMO_ACCOUNTS, login, register } from '../store.js';
import { ROLE_LABEL, ROLE_ICON } from '../domain.js';
import { field, input, select, errorSlot, showErrors } from '../components.js';

let mode = 'login';
let registerRole = 'buyer';

const DEMO_ROLE = { admin: 'admin', seller: 'seller', buyer: 'buyer' };

export function renderAuth(root, ctx) {
  const emailControl = input({ type: 'email', placeholder: 'nama@kafe.id', autocomplete: 'email' });
  const passwordControl = input({ type: 'password', placeholder: 'Minimal 8 karakter', autocomplete: 'current-password' });
  const errors = {
    email: errorSlot(),
    password: errorSlot(),
  };
  const general = el('p', { className: 'form-error', attrs: { role: 'alert' } });

  const loginFields = el('div', { className: 'auth__fields' }, [
    field('Email', emailControl, errors.email),
    field('Kata sandi', passwordControl, errors.password),
  ]);

  const namaControl = input({ type: 'text', placeholder: 'Nama lengkap', autocomplete: 'name', maxlength: '60' });
  const regEmailControl = input({ type: 'email', placeholder: 'nama@kafe.id', autocomplete: 'email' });
  const regPasswordControl = input({ type: 'password', placeholder: 'Minimal 8 karakter', autocomplete: 'new-password' });
  const roleControl = select(
    [
      { value: 'buyer', label: '🛒 Pembeli — belanja bahan baku' },
      { value: 'seller', label: '🏪 Seller — buka toko supplier' },
    ],
    registerRole,
  );
  const tokoControl = input({ type: 'text', placeholder: 'Nama toko supplier', maxlength: '60' });
  const kotaControl = input({ type: 'text', placeholder: 'Kota (opsional)', maxlength: '60' });
  const teleponControl = input({ type: 'tel', placeholder: '08xx / 628xx (opsional)', maxlength: '20' });

  const regErrors = {
    nama: errorSlot(),
    email: errorSlot(),
    password: errorSlot(),
    tokoNama: errorSlot(),
  };

  const tokoField = field('Nama toko', tokoControl, regErrors.tokoNama);
  tokoField.classList.add('field--toko');
  if (registerRole !== 'seller') tokoField.hidden = true;

  roleControl.addEventListener('change', () => {
    registerRole = roleControl.value;
    tokoField.hidden = registerRole !== 'seller';
  });

  const registerFields = el('div', { className: 'auth__fields' }, [
    field('Nama lengkap', namaControl, regErrors.nama),
    field('Email', regEmailControl, regErrors.email),
    field('Kata sandi', regPasswordControl, regErrors.password),
    field('Daftar sebagai', roleControl),
    tokoField,
    field('Kota', kotaControl),
    field('Nomor telepon', teleponControl),
  ]);

  const submit = el('button', { className: 'btn btn--primary btn--block', attrs: { type: 'submit' } });
  const form = el('form', { className: 'auth__form', attrs: { novalidate: 'novalidate' } });

  function paintForm() {
    const isLogin = mode === 'login';
    submit.textContent = isLogin ? 'Masuk ke TakarKopi' : 'Buat akun';
    passwordControl.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
    mount(form, [
      isLogin ? loginFields : registerFields,
      general,
      submit,
      el('p', { className: 'auth__switch' }, [
        isLogin ? 'Belum punya akun? ' : 'Sudah punya akun? ',
        el('button', {
          className: 'link-btn',
          textContent: isLogin ? 'Daftar sekarang' : 'Masuk di sini',
          attrs: { type: 'button' },
          onClick: () => {
            mode = isLogin ? 'register' : 'login';
            paintTabs();
            paintForm();
          },
        }),
      ]),
    ]);
  }

  const tabLogin = el('button', {
    className: 'auth-tab',
    textContent: 'Masuk',
    attrs: { type: 'button', role: 'tab' },
    onClick: () => {
      mode = 'login';
      paintTabs();
      paintForm();
    },
  });
  const tabRegister = el('button', {
    className: 'auth-tab',
    textContent: 'Daftar',
    attrs: { type: 'button', role: 'tab' },
    onClick: () => {
      mode = 'register';
      paintTabs();
      paintForm();
    },
  });
  const tabs = el('div', { className: 'auth-tabs', attrs: { role: 'tablist' } }, [tabLogin, tabRegister]);

  function paintTabs() {
    tabLogin.classList.toggle('is-active', mode === 'login');
    tabRegister.classList.toggle('is-active', mode === 'register');
    tabLogin.setAttribute('aria-selected', String(mode === 'login'));
    tabRegister.setAttribute('aria-selected', String(mode === 'register'));
  }

  async function submitLogin(email, password) {
    general.textContent = '';
    showErrors(errors, {});
    submit.disabled = true;
    const result = await login(email, password);
    submit.disabled = false;
    if (!result.ok) {
      general.textContent = result.error;
      return;
    }
    toast(`Selamat datang, ${result.user.nama}!`, { type: 'success' });
    ctx.navigate(ctx.homeFor(result.user.role));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (mode === 'login') {
      if (!emailControl.value.trim()) {
        showErrors(errors, { email: 'Email wajib diisi.' });
        return;
      }
      await submitLogin(emailControl.value, passwordControl.value);
      return;
    }

    general.textContent = '';
    showErrors(regErrors, {});
    submit.disabled = true;
    const result = await register({
      nama: namaControl.value,
      email: regEmailControl.value,
      password: regPasswordControl.value,
      role: roleControl.value,
      tokoNama: tokoControl.value,
      kota: kotaControl.value,
      telepon: teleponControl.value,
    });
    submit.disabled = false;
    if (!result.ok) {
      showErrors(regErrors, result.errors);
      general.textContent = result.error;
      return;
    }
    toast(`Akun ${ROLE_LABEL[result.user.role]} berhasil dibuat.`, { type: 'success' });
    ctx.navigate(ctx.homeFor(result.user.role));
  });

  const demoTiles = DEMO_ACCOUNTS.map((account) =>
    el('button', {
      className: `demo-account demo-account--${account.role}`,
      attrs: { type: 'button' },
      onClick: async () => {
        mode = 'login';
        paintTabs();
        paintForm();
        emailControl.value = account.email;
        passwordControl.value = account.password;
        await submitLogin(account.email, account.password);
      },
    }, [
      el('span', { className: 'demo-account__icon', textContent: ROLE_ICON[account.role], attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'demo-account__body' }, [
        el('strong', { textContent: account.label }),
        el('span', { textContent: account.detail }),
        el('code', { textContent: `${account.email} · ${account.password}` }),
      ]),
      el('span', { className: 'demo-account__go', textContent: '→', attrs: { 'aria-hidden': 'true' } }),
    ]),
  );

  paintTabs();
  paintForm();

  const page = el('div', { className: 'auth-page' }, [
    el('a', { className: 'auth-back', textContent: '← Kembali ke beranda', attrs: { href: '#/' } }),
    el('section', { className: 'auth-hero' }, [
      el('div', {
        className: 'landing-batik landing-batik--auth',
        attrs: { 'aria-hidden': 'true' },
        style: { backgroundImage: "url('./images/batik-gajah-oling.svg')" },
      }),
      el('div', { className: 'auth-hero__top' }, [
        el('span', { className: 'brand__logo', textContent: '☕', attrs: { 'aria-hidden': 'true' } }),
        el('div', {}, [
          el('h1', { className: 'auth-hero__title', textContent: 'TakarKopi' }),
          el('p', { className: 'auth-hero__tag', textContent: 'Marketplace & Smart Prep Bahan Baku Kafe' }),
        ]),
      ]),
      el('img', { className: 'auth-hero__img', attrs: { src: './images/cafe-hero.svg', alt: 'Ilustrasi kafe', decoding: 'async' } }),
      el('ul', { className: 'auth-hero__list' }, [
        el('li', { textContent: '🛒 Pembeli: belanja bahan baku dari supplier terpercaya.' }),
        el('li', { textContent: '🏪 Seller: kelola katalog, stok, pesanan, plus prediksi prep harian.' }),
        el('li', { textContent: '🛡️ Admin: kelola pengguna, produk, dan seluruh transaksi platform.' }),
      ]),
      el('div', { className: 'demo-accounts' }, [
        el('p', { className: 'demo-accounts__title', textContent: 'Coba akun demo (klik langsung masuk):' }),
        ...demoTiles,
      ]),
    ]),
    el('section', { className: 'auth-card' }, [
      el('div', { className: 'auth-card__head' }, [
        el('h2', { className: 'auth-card__title', textContent: mode === 'login' ? 'Masuk ke akun Anda' : 'Buat akun baru' }),
        el('p', { className: 'auth-card__sub', textContent: 'Data demo tersimpan di browser (localStorage).' }),
      ]),
      tabs,
      form,
      el('p', { className: 'auth-card__legal', textContent: 'Dengan masuk, Anda menyetujui penggunaan data demo lokal untuk pengujian.' }),
    ]),
  ]);

  mount(root, [page]);
}
