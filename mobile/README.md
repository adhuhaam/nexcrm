# NEXCRM mobile

Expo (React Native) client for NEXCRM. Same Tailscale API as the web app.

**API base URL (only):** `https://server-1.snowy-pride.ts.net`  
Configured in `src/lib/config.ts`. Your phone/PC must be on the same Tailscale network.

## On your other PC

```bash
git clone https://github.com/adhuhaam/nexcrm.git
cd nexcrm/mobile
npm install
npx expo start
```

Then scan the QR code with **Expo Go**, or press `a` / `i` for emulator.

From the monorepo root you can also run:

```bash
npm run mobile:install
npm run mobile
```

## Sign in

Use the same office email/password as the web app at the Tailscale URL.

## EAS (optional)

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile preview
```
