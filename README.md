# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

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

The backend lives in `api/**` as Vercel Serverless Functions; the SPA is built to
`dist/client`. Two invariants keep the deployment healthy:

1. **Every `/api/*` route imports `server/db.ts`**, so whatever that file imports is
   loaded on *every* cold start. It must therefore never pull in a native addon: it
   uses the fetch entrypoint `@libsql/client/web` (no `libsql` binary, no WebSocket;
   `libsql://…` is rewritten to `https://…`). Importing `@libsql/client` (the Node
   entrypoint) instead loads `@libsql/<platform>` through a dynamic
   ``require(`@libsql/${target}`)``, which serverless bundlers cannot trace — the
   binary is then missing inside the function and **all** routes fail with
   `FUNCTION_INVOCATION_FAILED` before any handler (or its error handling) can run.
2. **Route errors are mapped in one funnel** (`server/vercel.ts` → `errorResponse`),
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

`npm test` runs `tests/api-smoke.test.ts`, which drives the real adapter and, when
`TURSO_DATABASE_URL` is configured, a real Turso connection — so a regression like
the one above fails locally instead of in production.
