import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { operationalPreview } from '../backend/test/operational-preview';
export default defineConfig({
  build: { target: ['chrome107', 'edge107', 'firefox104', 'safari15'], cssTarget: 'safari15' },
  plugins: [react(), {
    name: 'j5-operational-preview',
    apply: 'serve',
    configureServer(server) {
      if (server.config.mode !== 'operational-preview') return;
      const preview = operationalPreview();
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        void preview(new Request('http://localhost:5173' + req.url, { method: req.method })).then(async response => {
          res.writeHead(response.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(await response.text());
        }).catch(() => { res.writeHead(500); res.end(); });
      });
    },
  }, VitePWA({
    registerType: 'prompt', injectRegister: false,
    manifest: { name: 'Frenos La Bandera', short_name: 'La Bandera', lang: 'es', start_url: '/', display: 'standalone', background_color: '#f4f7fc', theme_color: '#0847ad', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'], navigateFallbackDenylist: [/^\/api\//], runtimeCaching: [], skipWaiting: false, clientsClaim: false }
  })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:7071' } }
});
