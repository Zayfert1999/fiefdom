import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Алиас на shared пакет (для будущих импортов)
      '@carcassonne/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    // 🆕 Проксирование запросов к серверу (чтобы не было CORS)
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