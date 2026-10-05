# Metadata engine spike (#28)

Throwaway benchmarks behind `docs/decisions/0002-metadata-engine.md`. Excluded from build, lint, typecheck and format.

- `bench.mjs` – all fixtures through ExifTool WASM, ExifReader and exifr in one process (per-group tag counts, timings) → `results/warm-all.json`.
- `child.mjs <engine> <file>` – one cold run in a fresh process (cold/warm ms, group counts, peak RSS) → `results/runs.jsonl`.
- `src/`, `index.html`, `vite.config.ts` – module Web Worker + Vite build used to check WASM asset emission.
- `shim-check.mjs` – Node stand-in for the browser worker code path (window/document shimmed, custom fetch).
- `browser.mjs` – Playwright driver; **could not run** (headless Chromium lacks system libs in the spike sandbox).

Setup: `npm i`, `npm run fixtures` in the repo root, and put extra samples in `samples/` (see the decision record
for the pixls.us files used).
