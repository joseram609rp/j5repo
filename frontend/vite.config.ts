import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt', injectRegister: false,
    manifest: { name: 'Frenos La Bandera', short_name: 'La Bandera', lang: 'es', start_url: '/', display: 'standalone', background_color: '#f4f7fc', theme_color: '#0847ad', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'], navigateFallbackDenylist: [/^\/api\//], runtimeCaching: [], skipWaiting: false, clientsClaim: false }
  })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:7071' } }
});
