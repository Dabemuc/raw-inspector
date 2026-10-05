# RAW-Inspector

The easiest and quickest way to inspect the structure and contents of a RAW image file.

RAW-Inspector is a purely client-side web app: files are parsed in the browser and never leave your machine. There is no backend.

Built with [Vue 3](https://vuejs.org/), [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/), deployed as a static site on [Cloudflare Pages](https://pages.cloudflare.com/).

## Development

```bash
npm install
npm run dev
```

| Script                 | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `npm run typecheck`    | Type-check app, test and node code (vue-tsc) |
| `npm run test`         | Run the Vitest suite once                    |
| `npm run test:watch`   | Run Vitest in watch mode                     |
| `npm run lint`         | Lint with ESLint                             |
| `npm run lint:fix`     | Lint and auto-fix                            |
| `npm run format`       | Format with Prettier                         |
| `npm run format:check` | Check formatting                             |

## Build

```bash
npm run build     # type-check and build into ./dist
npm run preview   # serve the production build locally
```

## Deploy to Cloudflare Pages

Production is deployed from the `release` branch, not `main`. To release, run the **Release** workflow (Actions tab, or `gh workflow run release`). It checks that CI passed on the latest `main` commit and fast-forwards `release` to it.

### Option A: Git integration (recommended)

Connect the repository in the Cloudflare dashboard (Workers & Pages → Create → Pages → Connect to Git) with:

| Setting                | Value           |
| ---------------------- | --------------- |
| Framework preset       | Vue             |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Production branch      | `release`       |

### Option B: Direct upload via Wrangler

```bash
npx wrangler login
npm run pages:deploy
```

This deploys your local build to production (`--branch=release`).

`npm run pages:dev` runs the production build locally on the Cloudflare Pages runtime.

Pages configuration lives in `wrangler.toml`; static response headers in `public/_headers`.
