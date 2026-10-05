import { defineConfig } from 'vite'

// Throwaway spike config: serves ./samples + ../../fixtures, no COOP/COEP headers on purpose.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: 'samples',
  server: { port: 5198, strictPort: true },
  preview: { port: 5198, strictPort: true },
  worker: { format: 'es' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 30000 },
})
