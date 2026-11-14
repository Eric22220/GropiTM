/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// GitHub Pages servește aplicația sub /<nume-repo>/
const BASE = '/ShockGrid/';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16)),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // înregistrare proprie (src/services/update.ts): reîncărcarea se amână în timpul unei ture
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ShockGrid — confortul velo în Timișoara',
        short_name: 'ShockGrid',
        description: 'Harta confortului pe bicicletă din vibrații măsurate, comparare de trasee și ruta cea mai netedă.',
        lang: 'ro',
        theme_color: '#1857f5',
        background_color: '#f4f6fa',
        display: 'standalone',
        scope: BASE,
        start_url: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // versiunea nouă se activează singură, și pentru instalările existente (reîncărcarea paginii e amânată în aplicație)
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/data/**'],
        navigateFallbackDenylist: [/\/data\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/') && url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'sg-data', networkTimeoutSeconds: 4, expiration: { maxEntries: 20 } },
          },
          {
            // tile-urile văzute deja rămân în cache (fără descărcare în masă)
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
  },
}));
