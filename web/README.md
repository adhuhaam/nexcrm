# NEXCRM web

React + Vite + TypeScript office UI for NEXCRM (PWA-capable). Part of the monorepo super app — see [../README.md](../README.md) and [../docs/](../docs/).

## Develop

```bash
npm install
npm run dev
```

Point the API at the Node server (`npm start` from repo root) or configure the Vite proxy if used.

## Production

```bash
npm run build
```

Output lands in `dist/`. The API process serves these files (SPA fallback) from `app/static.ts`.

## Notes

- Shell, apps launcher, and routes live under `src/`.
- Finance apps register in `src/lib/apps.ts` and mount under `/apps/*`.
- Shared API contract: [../docs/API.md](../docs/API.md).
