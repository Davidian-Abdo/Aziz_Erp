import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'Aziz ERP',
        short_name: 'Aziz',
        description: 'إدارة بقالة عزيز',
        theme_color: '#863bff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        lang: 'ar',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
    setupFiles: ['./src/test/setup.ts'],
    // The pgTAP suite lives in supabase/tests and is run by scripts/db.sh, not Vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Dummy credentials so the suite never depends on a real `.env` — which is
    // gitignored, so CI has none. Nothing here ever reaches the network: the
    // tests that touch data mock the api modules.
    env: {
      VITE_SUPABASE_URL: 'http://supabase.test',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
