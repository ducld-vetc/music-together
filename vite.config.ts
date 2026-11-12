import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function spaFallback() {
  return {
    name: 'spa-fallback',
    apply: 'build' as const,
    closeBundle() {
      copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'));
      writeFileSync(resolve('dist/.nojekyll'), '');
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), spaFallback()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': 'http://127.0.0.1:8787',
      '/spotify': 'http://127.0.0.1:8787',
    },
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
