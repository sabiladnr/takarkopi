import { defineConfig } from 'vite';

// Host preview cloud diambil dari environment (tidak ditulis di repo).
const previewHost = process.env.VITE_PREVIEW_HOST;

export default defineConfig({
  base: './',
  root: '.',
  server: {
    port: 5173,
    open: false,
    ...(previewHost ? { allowedHosts: [previewHost] } : {}),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
