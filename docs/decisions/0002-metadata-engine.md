# 0002 – Metadata engine for Overview mode

Status: proposed (spike #28, input to #30) · Parent PRD: #26

## Decision

Use **`@uswriting/exiftool`** (ExifTool 13.42 on zeroperl WASM) as the Overview-mode engine, **lazy-loaded
in its own module Web Worker**, in a **tiered** flow: show our parser's tags immediately, replace/augment
with ExifTool output when it is ready. Keep the engine optional so the app works if the 24 MiB WASM
fails to load.

Why: it is the only candidate that decodes MakerNotes and Composite tags and handles every RAW format
we have (incl. CR3 and RAF), i.e. the "on par with exif.tools" goal. The lighter libraries are not close.
The price is a 24.2 MiB WASM (≈5.3 MB brotli) which fits Cloudflare's 25 MiB per-file limit with only
**0.8 MiB headroom**, and two integration wrinkles in a Web Worker (below).

## Candidates (measured 2026-10-05, Node 22, linux/arm64, 6 cores)

|                                                 | `@uswriting/exiftool` 1.0.9                                                                   | `exifreader` 4.46.0                                      | `exifr` 7.1.3                                                                                         | our parser + LibRaw                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Licence                                         | Apache-2.0 (+ zeroperl-ts Apache-2.0)                                                         | MPL-2.0                                                  | MIT                                                                                                   | ours; LibRaw LGPL/CDDL (ADR 0001)       |
| ExifTool licence                                | Perl "Artistic or GPL" (dual; ExifTool itself is not in the npm licence field)                | –                                                        | –                                                                                                     | –                                       |
| JS size min/gz/br                               | 138.7 KB / 41.6 KB / 37.1 KB (worker chunk, includes the embedded ExifTool script)            | 133 KB / 39 KB / 34 KB                                   | 75.5 KB / 26 KB / 23 KB (`full`); 45 KB / 15 KB (`lite`)                                              | 0 (already shipped)                     |
| WASM raw/gz/br                                  | **25,358,252 B (24.18 MiB) / 7.59 MB / 5.33 MB**                                              | none                                                     | none                                                                                                  | LibRaw 853 KB (already shipped)         |
| Formats (fixtures + pixls samples)              | all 9 files: DNG ARW NEF CR2 ORF RW2 CR3 RAF                                                  | fails on **ORF, RW2, CR3, RAF** ("Invalid image format") | fails on **CR3, RAF** ("Unknown file format"); RW2 gives only IFD0/Exif                               | TIFF-based formats; CR3/RAF header only |
| MakerNotes                                      | decoded (Canon 129, Nikon 66, Olympus 139, Panasonic 54, Sony 129, Leica 15, Fuji 58, … tags) | 2 Canon entries, none elsewhere                          | "makerNote" key holds thousands of numeric keys (an undecoded byte array, 8k–34k "tags") – not usable | opaque block                            |
| Composite                                       | 9–29 tags/file                                                                                | 3 (ImageSize etc.)                                       | none                                                                                                  | none                                    |
| XMP / IPTC / ICC                                | yes (XMP seen on ARW/CR3)                                                                     | XMP yes                                                  | XMP yes                                                                                               | none                                    |
| QuickTime/CR3 tracks, SR2, PrintIM, CanonCustom | yes                                                                                           | no                                                       | no                                                                                                    | no                                      |

### Completeness: tags per group (ExifTool CLI was not available; ExifTool WASM `-a -G1 -s` is the reference)

| file                    | ExifTool total | ExifTool groups (tags)                                                                | ExifReader (expanded)              | exifr                               |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- |
| Canon 350D CR2          | 230            | IFD0 14, ExifIFD 26, **Canon 129**, CanonCustom 9, IFD1–3 18, Interop 2, Composite 19 | exif 44, thumbnail 5, makerNotes 2 | ifd0 13, exif 25, ifd1 2, interop 2 |
| Leica M8 DNG            | 116            | IFD0 38, SubIFD 22, ExifIFD 19, Leica 15, Composite 9                                 | exif 55, composite 3               | ifd0 39, exif 19                    |
| Nikon D70 NEF           | 187            | IFD0 23, SubIFD 9+18, ExifIFD 30, **Nikon 66**, PreviewIFD 8, Composite 20            | exif 53, composite 3               | ifd0 23, exif 29                    |
| Olympus E-1 ORF         | 221            | IFD0 19, ExifIFD 27, **Olympus 139**, IFD1 7, Composite 15                            | error                              | ifd0 20, exif 26, ifd1 6            |
| Panasonic LX3 RW2       | 194            | IFD0 40, PanasonicRaw 22, ExifIFD 32, **Panasonic 54**, Composite 15                  | error                              | ifd0 38, exif 12                    |
| Sony A100 ARW           | 292            | IFD0 19, ExifIFD 35, Sony 11, **Minolta 151**, MinoltaRaw 34, Composite 14            | exif 60, thumbnail 14, composite 3 | ifd0 21, exif 34, ifd1 11           |
| Sony A7R IV ARW (61 MP) | see runs.jsonl | IFD0 15, SubIFD 31, ExifIFD 39, **Sony 129**, SR2* ~40, XMP-xmp, Composite 18         | xmp 3, exif 61, thumbnail 17       | xmp, ifd0 17, exif 38               |
| Canon R5 CR3            | see runs.jsonl | QuickTime 21, **Canon 182**, ExifIFD 39, CanonCustom 20, Track1–5 ~257, Composite 29  | error                              | error                               |
| Fuji X-T3 RAF (26 MP)   | see runs.jsonl | RAF 11, IFD0 11, ExifIFD 42, **FujiFilm 58**, FujiIFD 12, Composite 13                | error                              | error                               |

Reading: the tag counts our parser already produces for TIFF/EXIF/GPS/DNG roughly match ExifTool's
IFD0/ExifIFD/SubIFD rows; what is missing is exactly the bold MakerNote rows, Composite, XMP/IPTC/ICC and
the container-specific groups. ExifReader/exifr cover only the EXIF-level rows, i.e. what we already have,
and fail on several RAW formats. A "our parser + LibRaw" baseline was not numerically scored for
this reason; it equals the EXIF-level rows plus LibRaw's lens/shooting fields.

Raw data: `spikes/metadata/results/{warm-all.json,runs.jsonl}`.

## Performance (ExifTool WASM, fresh Node process per file, 6-core arm64)

| file            | size     | cold (import + WASM compile + first parse) | warm (second parse, same instance) | peak RSS (baseline after reading file) |
| --------------- | -------- | ------------------------------------------ | ---------------------------------- | -------------------------------------- |
| Sony A100 ARW   | 9.7 MB   | 479 ms                                     | 304 ms                             | 380 MB (53 MB)                         |
| Canon R5 CR3    | 26.2 MB  | 908 ms                                     | 564 ms                             | 441 MB (70 MB)                         |
| Fuji X-T3 RAF   | 53.5 MB  | 390 ms                                     | 242 ms                             | 457 MB (97 MB)                         |
| Sony A7R IV ARW | 117.4 MB | 539 ms                                     | 341 ms                             | 591 MB (161 MB)                        |

- Parse cost is dominated by ExifTool start-up per call (~150–350 ms even for small files, as each call
  re-runs the Perl script), not by file size: the 61 MP/117 MB file is only ~40 % slower than a 10 MB one.
- Memory: ~300 MB for the WASM instance plus roughly 3–4× the file size on top. A 117 MB file peaked at
  591 MB RSS (430 MB above its own buffer). Acceptable on desktop; a risk on phones for very large files.
- ExifReader: 4–38 ms, +20–140 MB. exifr: 1–5 ms, +6–16 MB.
- Not measured: the browser-side network part of "time to first result" (WASM fetch). Download is
  5.3 MB brotli / 7.6 MB gzip; at 50 Mbit/s ≈ 1 s (brotli) before the ~0.2–0.4 s compile+parse.
  Warm HTTP-cache runs therefore ≈ compile + parse only, as in the cold column above (Node reads from disk).
- Timings are from Node, not a browser; V8 is the same engine as Chromium but Chrome streams and
  tiers WASM compilation differently. Treat as indicative.

## Web Worker + Vite integration (what was and was not verified)

Verified with a real `vite build` (Vite 8, `worker.format: 'es'`, no COOP/COEP) in `spikes/metadata`:

- **No COOP/COEP needed**: `zeroperl.wasm` defines and exports its own non-shared memory (no imported memory,
  no `SharedArrayBuffer`/`Worker` use in `zeroperl-ts`). Plain static hosting works.
- **WASM is not emitted by default.** `zeroperl-ts` loads `fetch('./zeroperl.wasm')` (relative to the
  _page_, not the module); the bundler never sees it, so the build contains no `.wasm`.
  Fix: `import wasmUrl from '../node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm?url'` (deep path,
  because the package `exports` map does not expose it; use a Vite alias for a tidier import) and pass
  `parseMetadata(file, { fetch: () => fetch(wasmUrl), … })`. Result: `assets/zeroperl-<hash>.wasm`, 25,358,252 B.
- **Browser detection fails inside a Web Worker.** The loader chooses `fetch` vs `node:fs` by
  `typeof window !== 'undefined' && typeof document !== 'undefined'`; both are undefined in a worker so it
  takes the Node branch (and Vite externalises `node:fs/promises`). Workaround: `globalThis.window ??= self;
globalThis.document ??= {}` before the first call. This is derived from the source; the shimmed path was run
  in Node (`shim-check.mjs`: browser branch + custom fetch → 292 tags, one WASM fetch).
- **Not verified in a real browser.** Headless Chromium could not start in the spike sandbox (missing
  `libnspr4`). #30 must run an end-to-end check in Chrome/Firefox/Safari before relying on this.
- The WASM is loaded once per worker (`WeakRef` cache) and reused; each `parseMetadata` call builds a fresh
  Perl interpreter and copies the whole `File` into WASM memory, so pass the `File` straight in and don't
  also hold a second `ArrayBuffer` copy.

## Cloudflare 25 MiB per-file limit

The emitted WASM is **25,358,252 B = 24.18 MiB**, below 26,214,400 B (25 MiB) by **856,148 B (3.3 %)**.
It fits today, but a `@6over3/zeroperl-ts` bump that grows the binary by >3 % would break deploys.
Mitigations, cheapest first:

1. Pin the `@uswriting/exiftool` / `@6over3/zeroperl-ts` versions and add a build-time check that fails
   (with a clear message) when any `dist` file exceeds 25 MiB.
2. Host the WASM outside Pages (R2 / a CDN) and point `wasmUrl` there (needs CORS).
3. Split: the WASM could be served as two ranges and concatenated in the `fetch` shim before instantiation
   (the shim already controls the Response).
4. Build a smaller zeroperl (strip unused ExifTool modules); only worth it if 1–3 don't suffice.

Cloudflare serves static assets with brotli/gzip; the limit applies to the uncompressed file size.

## Integration notes for #30

- Dedicated worker `metadata.worker.ts`; lazy `import()` after the first structure parse so the 5 MB download
  never blocks the hex viewer/byte map. Show our tags first, then merge ExifTool output.
- Args: `['-json', '-G1', '-a', '-s']` give group-prefixed keys (`Canon:ISO`) used for the tables above;
  add `-struct`/`-n` only if raw values are wanted. `-G1` family-1 groups map well to UI sections
  (IFD0, ExifIFD, Canon, Composite, XMP-_, Track_…).
- Binary tags come back as `(Binary data N bytes…)` strings; thumbnails/previews are already handled by our parser.
- Send the `File`/`Blob` to the worker (structured clone is cheap for `File`) – do not read into an
  `ArrayBuffer` on the main thread.
- ExifTool exposes ExifTool/System/SourceFile groups (`System:FileSize` etc. refer to the in-WASM virtual file);
  hide them or label them.
- Surface a `loading | ready | failed` state; on failure fall back to our parser's tags silently with a note.
- Licence: ExifTool is distributed under the Perl Artistic/GPL dual licence; the wrapper packages are Apache-2.0.
  Credit ExifTool (Phil Harvey) in the About/third-party notices.
- If the 24 MiB asset is judged too heavy, the fallback is `exifr` (MIT, 26 KB gz) for EXIF/XMP plus our
  own parser: weaker (no MakerNotes, no CR3/RAF) but near-zero cost.

## Not measured / open

- Real-browser time to first result (WASM fetch + compile, cold and warm HTTP cache) and peak memory.
- ExifTool CLI as reference (not installed); comparisons use ExifTool WASM itself, as the issue allows.
- 24 MP file: a 26 MP RAF and a 61 MP ARW stand in; no other sizes tested.
