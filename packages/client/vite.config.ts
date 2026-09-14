import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { fileURLToPath, URL } from 'node:url';

// 🌟 Base path для GitHub Pages:
// В CI (GitHub Actions) используем имя репозитория из переменной
// Локально — обычный '/'
const base = process.env.GITHUB_ACTIONS
  ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/`
  : '/';

export default defineConfig({
  base,
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      // 🌟 Используем fileURLToPath вместо __dirname
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fiefdom/shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});