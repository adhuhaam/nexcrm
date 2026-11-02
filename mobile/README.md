# NEXCRM mobile

Expo (React Native) client for the NEXCRM office app. Lives in this monorepo next to `web/`.

**API base URL (only):** `https://server-1.snowy-pride.ts.net`

The device must be on the same Tailscale tailnet. There is no LAN or localhost API fallback.

## Run

From the repo root:

```bash
npm run mobile:install
npm run mobile
```

Or from this folder:

```bash
npm install
npx expo start
```

Sign in with the same office credentials as the web app.

## EAS builds

From another machine (or CI), clone this repo and build the `mobile/` app:

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile preview
```

After `eas init`, it will write `extra.eas.projectId` into `app.json`.
