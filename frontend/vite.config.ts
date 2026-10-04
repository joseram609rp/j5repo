import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    manifest: { name: 'Frenos La Bandera', short_name: 'La Bandera', lang: 'es', start_url: '/', display: 'standalone', background_color: '#f4f4f0', theme_color: '#b92d32', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'], navigateFallbackDenylist: [/^\/api\//], runtimeCaching: [], skipWaiting: false, clientsClaim: false }
  })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:7071' } }
});
