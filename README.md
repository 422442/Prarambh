## Build with Lovable



- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Admin Portal

Access the admin portal at `/admin/login` with your administrator credentials.

## Deployment notes (Vercel + Turso)

The backend is a set of Vercel Serverless Functions in `api/`, and the SPA is built
to `dist/client`. Three invariants keep the deployment healthy:

1. **`api/**` only contains generated bundles — never edit them.** The real sources
   live in `server/entrypoints/**` (thin adapters: path parsing + `server/routes/**`
   handlers). `npm run build:api` bundles each entry into a single self-contained ESM
   file in `api/`, and `npm run build` runs that, then `npm run check:functions`, then
   `vite build`. This matters because the project sets `"type": "module"`, so Vercel
   runs those files as **native Node ESM**: relative imports would need explicit
   `.js` extensions, and Vercel's dependency tracer parses files with acorn (it cannot
   read TypeScript types), so a shared multi-file TypeScript graph inside the function
   path is fragile. Bundling removes relative imports and shared-file tracing
   entirely; only npm packages are resolved, which the tracer handles. Committing the
   bundles keeps every deploy deterministic even if a build step is skipped.
2. **The database driver must stay native-free.** `server/db.ts` uses the fetch
   entrypoint `@libsql/client/web` (no `libsql` binary, no WebSocket; `libsql://…` is
   rewritten to `https://…`). Importing `@libsql/client` (the Node entrypoint) loads
   `@libsql/<platform>` through a dynamic ``require(`@libsql/${target}`)``, which
   serverless bundlers cannot trace — the binary is missing inside the function and
   **all** routes fail with `FUNCTION_INVOCATION_FAILED` before any handler (or its
   error handling) can run.
3. **Route errors are mapped in one funnel** (`server/vercel.ts` → `errorResponse`),
   which keeps the documented `{ "error": { "code", "message" } }` contract with
   statuses such as 400 / 401 / 409 / 429. Handlers therefore just throw `ApiError`.

### Verifying a deployment

```sh
curl -s https://<deployment>/api/time     # {"serverTime":…}   → runtime, bundling and routing OK
curl -s https://<deployment>/api/health   # {"ok":true,…}      → additionally checks env vars + Turso
```

`/api/health` answers `200` when every check passes and `503` with a per-check
`detail` (missing env var, driver error, …) otherwise. It deliberately has no
third-party imports, so it still responds when another dependency breaks — make it
the first stop when something returns 5xx.

Locally:

```sh
npm run build:api        # regenerate api/ bundles from server/entrypoints/
npm run check:functions  # load every bundle as native ESM (guards the failure above)
npm test                 # real adapter + real Turso round trip (tests/api-smoke.test.ts)
```
