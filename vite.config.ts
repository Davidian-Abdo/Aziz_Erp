import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
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
