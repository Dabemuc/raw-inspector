import { defineConfig } from 'vite'

// Throwaway spike config: serves ./samples as static files, no COOP/COEP headers on purpose.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: 'samples',
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
  worker: { format: 'es' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 5000 },
})
