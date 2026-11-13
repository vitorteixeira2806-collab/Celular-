import { defineConfig } from 'vite';
import { pwaPlugin } from './pwa-plugin.js';

export default defineConfig({
  base: './',
  build: { target: 'es2019', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  plugins: [pwaPlugin()],
});
