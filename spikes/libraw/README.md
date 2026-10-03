# LibRaw WASM spike (issue #24)

Throwaway benchmark comparing `@colorhythm/libraw-wasm` and `libraw-wasm` (ybouane).
Excluded from the app's build, typecheck, test, lint and prettier. Results and conclusions
live in `docs/decisions/0001-libraw-wasm.md`.

```sh
cd spikes/libraw
npm install
# download samples into ./samples (see the decision record for the exact raw.pixls.us paths)
node bench.mjs all "" raw,full,half   # [lib] [file filter] [modes] [runs]
npx vite build                         # bundling check: module worker + wasm asset emission
```

- `child.mjs` – one decode per fresh process; reports phase timings and process peak RSS.
- `node-worker-shim.mjs` – runs the browser-style worker scripts inside a Node `worker_thread`.
- `src/colorhythm.worker.js` – the module worker that drives `@colorhythm/libraw-wasm`.
- `src/page.js` – bundling-only entry for `vite build`.
- `results/results.json` – raw measurements behind the decision record.

Modes: `raw` = open + unpack + copy out the CFA buffer; `full` = 8-bit sRGB, camera WB, full size;
`half` = same with half-size output.
