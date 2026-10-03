# 0001 – LibRaw WebAssembly package

Status: accepted (spike #24, input to #25) · Parent PRD: #1

## Decision

Use **`@colorhythm/libraw-wasm`** (1.1.1, MIT) behind our own module Web Worker.
Keep `libraw-wasm` (ybouane) as the fallback; compiling LibRaw ourselves is only needed if the
colorhythm fork is abandoned or we hit a decoder gap.

Why, in one line: it is the only candidate that needs no COOP/COEP headers, it exposes the data an
inspector needs (CFA buffer with margins, per-channel black, linear max, cam→XYZ), its WASM is ~30 %
smaller, and it peaks 45–320 MB lower on memory. The price is a ~10–15 % slower full demosaic and a
much slower unpack for Nikon lossless/compressed NEF and lossy/lossless-JPEG DNG (see below).

## Candidates

|                                        | `@colorhythm/libraw-wasm`                                                                                           | `libraw-wasm` (ybouane)                                                                                                            | `libraw.wasm` (ssssota)                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Version tested                         | 1.1.1 (2026-08-03)                                                                                                  | 1.6.0 (2026-07-02)                                                                                                                 | not on npm (404); must build from git                                             |
| Evaluated?                             | yes                                                                                                                 | yes                                                                                                                                | indirectly – colorhythm is a fork of it (same build scripts); no separate numbers |
| LibRaw                                 | 0.22.1 (`LibRaw.version()`: `0.22.1-Release`)                                                                       | 0.22.1 (pinned in `compileLibraw.sh`)                                                                                              | git submodule                                                                     |
| Package licence                        | MIT                                                                                                                 | ISC                                                                                                                                | MIT                                                                               |
| LibRaw licence                         | LGPL 2.1 / CDDL 1.0 (licence files shipped in package)                                                              | same (not shipped in package)                                                                                                      | same                                                                              |
| TypeScript types                       | yes, generated from LibRaw structs (`libraw-types.d.ts`)                                                            | yes, hand-written (`index.d.ts`)                                                                                                   | yes                                                                               |
| Last push / stars (GitHub, 2026-10-03) | 2026-10-01 / 0 (fork, 1 maintainer)                                                                                 | 2026-07-02 / 56                                                                                                                    | 2026-10-02 / 33                                                                   |
| API style                              | sync wrapper over the C API (`open`, `unpack`, getters, `dcrawProcess`, `dcrawMakeMemImage`); **we own the worker** | async, spawns its own module worker; `open(bytes, settings)` then `metadata()`, `imageData()`, `rawImageData()`, `thumbnailData()` | sync, typed-cstruct bindings                                                      |
| **Shared memory / pthreads**           | **no** – plain memory, no headers needed                                                                            | **yes** – wasm declares _shared_ memory (built with `USE_PTHREADS=1`, OpenMP); browsers need `crossOriginIsolated` (COOP+COEP)     | no (not measured)                                                                 |
| WASM size raw / gzip / brotli          | 853 KB / 327 KB / 264 KB                                                                                            | 1 418 KB / 487 KB / 385 KB                                                                                                         | –                                                                                 |
| JS size (min) raw / gzip               | `libraw.mjs` 76 KB + `index.js` 16 KB + types 36 KB / ~28 KB total                                                  | `worker.js` 70 KB + `index.js` 1.5 KB / ~25 KB                                                                                     | –                                                                                 |
| Max WASM memory                        | 2 GiB (growth on)                                                                                                   | 2 GiB (growth on, 256 MB initial)                                                                                                  | –                                                                                 |

Fallback (own Emscripten build): **not evaluated** – neither `emcc` nor Docker is available in the
spike environment. Treat as a known option, cost unmeasured.

## API surface

| Need                                                           | colorhythm                                                                                                                          | ybouane                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Processed RGB                                                  | `dcrawProcess()` + `dcrawMakeMemImage()` → `{width,height,colors,bits,data}`                                                        | `imageData()` → same shape                                                                                 |
| Unprocessed CFA                                                | `getRawImage()` (owned `Uint16Array`, no row padding), also `getColor3Image/getColor4Image`                                         | `rawImageData()` → `{data: Uint16Array, raw_width/height, width/height, top/left_margin}`                  |
| Geometry (raw/active size, margins, pitch, flip, pixel aspect) | full getters                                                                                                                        | `raw_*`, `width/height`, margins, `flip`, `raw_pitch` via `metadata(true)`                                 |
| CFA pattern                                                    | `getFilters()`, `getCdesc()`, `color(row,col)`                                                                                      | `filters`, `cdesc` in `metadata(true)` (no `color()`)                                                      |
| Black level                                                    | `getBlack()`, `getBlackLevel(0..3)` (adjusted per channel), `getCblack()`                                                           | `color_data.black` only – **0 for Canon CR2/CR3 and Olympus where colorhythm reports 255–510** (see below) |
| White level                                                    | `getColorMaximum()`, `getDataMaximum()`, `getLinearMax(i)`                                                                          | `color_data.maximum`, `data_maximum`                                                                       |
| Colour matrices                                                | `getCamXyz`, `getCmatrix`, `getRgbCam`                                                                                              | `color_data.cam_xyz/cmatrix/rgb_cam`, plus `dng_color` blocks                                              |
| Camera WB                                                      | `getCamMul`, `getPreMul`, `setUseCameraWb`                                                                                          | `color_data.cam_mul/pre_mul`, `useCameraWb`                                                                |
| Thumbnail                                                      | `unpackThumb` + `dcrawMakeMemThumb` (JPEG)                                                                                          | `thumbnailData()` (JPEG)                                                                                   |
| Decode options                                                 | setters: half size, output colour, output bps (8/16), camera WB, user mul, gamma, bright, highlight, no-auto-bright, demosaic, FBDD | settings object: all of the above plus crop box, user flip, black/sat overrides, dcb etc.                  |
| Metadata breadth                                               | iparams, imgother, lens, shooting info, makernotes (typed)                                                                          | large typed `Metadata` incl. maker-specific blocks, GPS, lens                                              |
| Errors                                                         | typed `LibRawError` with numeric code                                                                                               | rejected promise with message                                                                              |

Per-channel black levels matter for the inspector (it must subtract black from the CFA buffer to
show true signal): measured `black` vs `getBlackLevel` on the same files –

| file                | colorhythm `getBlackLevel(0..3)` | ybouane `color_data.black` |
| ------------------- | -------------------------------- | -------------------------- |
| Canon R5 CR3        | 510, 510, 510, 510               | 0                          |
| Canon 5D III DNG    | 2047, 2047, 2048, 2047           | 0                          |
| Olympus E-M1 II ORF | 255 ×4                           | 0                          |
| Sony A7 III ARW     | 512 ×4                           | 512                        |
| Panasonic GH5 RW2   | 144,143,144,143                  | 143                        |

## Format coverage

Both decoded **all 13 sample files** (LibRaw 0.22.1) in `raw`, `full` and `half` modes without
error, with identical dimensions, CFA data length, camera WB multipliers and embedded-JPEG
thumbnail sizes:

| Format | Sample (raw.pixls.us)                                                                             | MP         |
| ------ | ------------------------------------------------------------------------------------------------- | ---------- |
| ARW    | Sony/ILCE-7M3/_DSC0009.ARW, Sony/ILCE-7RM4/DSC00395.ARW                                           | 24.3, 61.2 |
| NEF    | Nikon/D850/Nikon-D850-14bit-lossless-compressed.NEF, Nikon/Z 6/DSC_0750.NEF                       | 45.7, 24.5 |
| CR2    | Canon/EOS 5D Mark IV/B13A0729.CR2                                                                 | 30.4       |
| CR3    | Canon/EOS R5/Canon_EOS_R5_RAW_ISO_100_nocrop_nodual.CR3, EOS R6 (…nocrop_nodual)                  | 45.7, 20.2 |
| RAF    | Fujifilm/X-T3/AFXT2720.RAF (X-Trans)                                                              | 26.7       |
| ORF    | Olympus/E-M1MarkII/Olympus_EM1mk2_Standard_20MP.ORF                                               | 20.5       |
| RW2    | Panasonic/DC-GH5/_T012010.RW2, DC-S1/P1033119.RW2                                                 | 20.5, 24.4 |
| DNG    | Adobe DNG Converter/Canon EOS 5D Mark III/5G4A9394-compressed-lossless.DNG, Leica/Q2/L1000750.DNG | 22.3, 47.4 |

Not tested: compressed CR3 (CRAW), Nikon HE/HE\*, Sony compressed ARW 4.0 variants, Foveon,
medium-format 100 MP files.

## Performance

Method: each (package, file, mode) is one decode in a **fresh process** (`spikes/libraw/child.mjs`),
running the package's worker code in a Node 22.23 `worker_thread` on aarch64 Linux, 6 cores, 7.7 GB
RAM. One run per cell – treat differences under ~10 % as noise. Times in ms exclude reading the file
from disk (20–120 ms) and thumbnail extraction (<12 ms); they include WASM instantiation. "RSS" is the
process peak (`maxRSS`), which includes ~50–60 MB of Node baseline and the WASM heap. Modes: `raw` = CFA
buffer copied out; `full` = camera WB, sRGB, 8-bit, full size; `half` = same, half size. Default
LibRaw demosaic in both packages (AHD for Bayer, 3-pass Markesteijn for X-Trans).

**Caveat – not browser numbers.** No usable browser was available (the Playwright Chromium build
needs system libraries that cannot be installed without root). Node and Chrome share V8's WASM
engine, so relative numbers should carry over, but absolute times and memory in a real tab will
differ, and **browser behaviour (module worker under Vite, COOP/COEP) was not exercised** – see
integration notes. ybouane's build uses OpenMP threads, which ran in Node's worker pool and may be
disabled or limited without cross-origin isolation in a browser, so its speed advantage below is not
guaranteed to survive there.

| File                      | MP   | Mode | colorhythm ms | RSS MB | ybouane ms | RSS MB |
| ------------------------- | ---- | ---- | ------------- | ------ | ---------- | ------ |
| A7 III ARW                | 24.3 | raw  | 174           | 218    | 205        | 289    |
| A7 III ARW                | 24.3 | full | 1927          | 496    | 1596       | 634    |
| A7 III ARW                | 24.3 | half | 484           | 250    | 416        | 378    |
| Z 6 NEF                   | 24.5 | full | 1753          | 538    | 1525       | 680    |
| 5D IV CR2                 | 30.4 | full | 2724          | 658    | 2364       | 850    |
| X-T3 RAF                  | 26.7 | full | 17014         | 584    | 14260      | 682    |
| X-T3 RAF                  | 26.7 | half | 391           | 319    | 369        | 513    |
| D850 NEF (lossless)       | 45.7 | raw  | 2274          | 365    | 978        | 470    |
| D850 NEF (lossless)       | 45.7 | full | 5257          | 881    | 3626       | 1035   |
| D850 NEF (lossless)       | 45.7 | half | 2752          | 422    | 1387       | 603    |
| R5 CR3                    | 45.7 | raw  | 591           | 373    | 726        | 453    |
| R5 CR3                    | 45.7 | full | 3553          | 877    | 3329       | 995    |
| R5 CR3                    | 45.7 | half | 1084          | 430    | 1073       | 556    |
| Leica Q2 DNG (lossy JPEG) | 47.4 | raw  | 2031          | 429    | 808        | 608    |
| Leica Q2 DNG (lossy JPEG) | 47.4 | full | 5150          | 964    | 3787       | 1175   |
| A7R IV ARW (uncompressed) | 61.2 | raw  | 200           | 540    | 260        | 796    |
| A7R IV ARW (uncompressed) | 61.2 | full | 4550          | 1239   | 3947       | 1505   |
| A7R IV ARW (uncompressed) | 61.2 | half | 866           | 627    | 817        | 948    |

All 39 combinations per package are in `spikes/libraw/results/results.json`.

Takeaways:

- Full-size demosaic of a 24 MP file is ~1.6–1.9 s, 45 MP ~3.3–5.2 s, 61 MP ~4–4.5 s; half-size is
  3–5× faster (0.4–1.1 s up to 61 MP) and uses ~half the memory. X-Trans full demosaic is the outlier
  at 14–17 s; half-size X-Trans takes 0.4 s, so use half-size for previews.
- Peak process memory for 61 MP full-size is 1.2–1.5 GB, within the 2 GiB WASM cap but tight on mobile.
  Raw/CFA-only extraction stays under ~550 MB (colorhythm) even at 61 MP.
- colorhythm's peak RSS is 45–320 MB lower than ybouane's in every one of the 39 rows. Cause not
  investigated (ybouane returns its results through `postMessage` and has a 256 MB initial heap).
- ybouane is ~10–15 % faster for full demosaic and >2× faster to unpack Nikon lossless NEF and
  lossy-JPEG DNG (D850, Q2). Other formats' unpack times are within noise. Cause not investigated
  (compiler flags, libjpeg build, or OpenMP). If those formats matter, re-measure in a browser before
  accepting the gap.

## Vite / Web Worker setup

Verified with `vite build` (Vite 8.3) of a bundling-only entry in `spikes/libraw/src/page.js`:

- colorhythm: `new Worker(new URL('./x.worker.js', import.meta.url), { type: 'module' })` with
  `import { LibRaw } from '@colorhythm/libraw-wasm'` inside works; Vite emits the worker chunk and
  `libraw-*.wasm` as a hashed asset (the glue resolves it via `new URL('libraw.wasm', import.meta.url)`).
  Build prints a harmless warning that Node's `module` is externalized (guarded by an environment
  check). No special Vite config. To control caching/URL, `LibRaw.initialize(wasmUrlOrResponse)` accepts
  an explicit WASM (e.g. `import wasmUrl from '@colorhythm/libraw-wasm/libraw.wasm?url'`).
- ybouane: its own `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })` is
  bundled by Vite the same way and the WASM is emitted as an asset. Because its WASM imports **shared**
  memory (confirmed by instantiating with non-shared memory: "mismatch in shared state of memory"),
  a browser will only run it when the page is cross-origin isolated.

COOP/COEP: **not needed for colorhythm.** For ybouane add to `public/_headers` (Cloudflare Pages):

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

This breaks embedding cross-origin resources that lack CORP/CORS headers (fonts, images, analytics),
which is why avoiding it is a real advantage.

Not verified in a browser: that the built bundle actually runs in Chrome/Firefox/Safari.

## Integration notes for #25

1. Add `@colorhythm/libraw-wasm` as a dependency; write `src/workers/libraw.worker.ts` (module worker)
   that owns one `LibRaw` instance and exposes `open → unpack → getters / process` via
   `postMessage`. Reference: `spikes/libraw/src/colorhythm.worker.js` (not shipped).
2. Call `LibRaw.initialize()` once per worker; create a **new `LibRaw` instance or call `recycle()`**
   between files and always `dispose()` – the input buffer is copied into WASM memory (`open()`
   mallocs the file size), so a 123 MB ARW costs 123 MB inside WASM _plus_ the JS `ArrayBuffer`.
   Transfer the `ArrayBuffer` into the worker instead of copying it.
3. Typical flows: (a) inspector: `open`, getters, `unpack`, `getRawImage()` + black/white level,
   `getFilters()/color()` for CFA, `getCamMul` / `getCamXyz`; (b) preview: `setHalfSize(1)`,
   `setUseCameraWb(1)`, `setOutputColor(1)`, `setOutputBps(8)`, `unpack`, `dcrawProcess`,
   `dcrawMakeMemImage` (returns packed RGB, 3 channels – convert to RGBA for canvas); (c) fast
   preview: `unpackThumb` + `dcrawMakeMemThumb` (embedded JPEG, <12 ms).
4. `getRawImage()` returns the _whole_ sensor frame (`raw_width × raw_height`); visible area is at
   `getLeftMargin()/getTopMargin()` with `getActiveWidth()/getActiveHeight()`. It returns `null` for
   layouts with 3/4 colour planes – fall back to `getColor3Image()/getColor4Image()` (the Leica Q2 and
   5D III DNGs went through the Bayer path).
5. Use half-size for anything interactive; full-size 45–61 MP needs ~0.9–1.3 GB. Guard against OOM
   (catch `LibRawError` / allocation failure and fall back to half-size). X-Trans full demosaic is
   ~15 s – run it only on explicit request, with progress UI around it.
6. No COOP/COEP needed; keep `public/_headers` unchanged for this dependency.
7. Re-measure Nikon lossless NEF and DNG unpack and full demosaic in a real browser during #25 and
   compare against ybouane before the dependency is baked in. If colorhythm turns out unmaintained,
   the fallback is ybouane (needs COOP/COEP; no per-channel black) or our own Emscripten build of
   LibRaw 0.22.1 using the colorhythm/ssssota build scripts as a starting point.
8. Licence: LibRaw is LGPL 2.1 / CDDL 1.0. We ship it as an unmodified separate WASM file loaded at
   runtime; include the LibRaw licence text (the colorhythm package ships `LibRaw/COPYRIGHT`,
   `LICENSE.LGPL`, `LICENSE.CDDL`) in our third-party notices.
