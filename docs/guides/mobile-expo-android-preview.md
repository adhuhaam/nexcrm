# Mobile — Expo Android preview (roadmap)

**Story for another day:** the Debian server guide set focuses on web + API at `https://server.bluraymaldives.site`. Mobile work will likely happen in a **separate Cursor workspace/session** (same monorepo `mobile/` or a dedicated repo — recommendation below). This document is **forward-looking**; it does not require changes on the server today.

## What exists today

| Item | Location |
| --- | --- |
| Expo app | `mobile/` |
| API contract | Same `/api/v1` as web — [API.md](../API.md) |
| Agent notes | [mobile/AGENTS.md](../../mobile/AGENTS.md) |
| Preview APK (EAS) | `npx eas-cli@latest build --profile preview --platform android` — [mobile/README.md](../../mobile/README.md) |

Production API base URL for field devices: **`https://server.bluraymaldives.site`** (after tunnel setup).

## Recommendation: monorepo vs separate mobile repo

| Approach | Pros | Cons |
| --- | --- | --- |
| **Keep `mobile/` in this monorepo** | One API version, shared docs, single clone on server | Larger repo; mobile CI/EAS secrets live beside backend |
| **Dedicated JA CRM mobile monorepo** | Cleaner Expo/EAS lifecycle; app-store identity separate | API version drift; two clones/PRs; duplicate agent docs |

**Recommendation:** keep **`mobile/` in this monorepo** until the team needs distinct release cadence or external contractors only touch mobile. Use **EAS** for APK builds; use the Debian box optionally for **Metro** during office dev. Split to a dedicated repo only when mobile releases decouple from API deploys.

## Phase 1 — Develop against production API

On a dev machine (or the Debian server):

```bash
cd /home/server/dev/nexcrm/mobile
npm install
npx expo start
```

In the app, set **API URL** to:

```text
https://server.bluraymaldives.site
```

Expo Go or a **development build** is required when using native modules not in Expo Go — see [mobile/AGENTS.md](../../mobile/AGENTS.md).

CORS: if the API must allow Expo web or tunnel origins, that is a **future API change** (not covered here).

## Phase 2 — Expo Metro on the Debian server

Use case: Android phone on the **office LAN** loads JS from Metro on the server while developing.

| Piece | Typical bind | Reachability |
| --- | --- | --- |
| Metro | `0.0.0.0:8081` (Expo default) | LAN `http://<LAN_IP>:8081` |
| API | `127.0.0.1:3000` / public tunnel URL | Phone uses **tunnel HTTPS**, not Metro for API |

Start on server (manual or separate systemd **user** unit — **do not** conflate with `nexcrm.service`):

```bash
cd /home/server/dev/nexcrm/mobile
npx expo start --host lan
```

Phone: same Wi‑Fi → Expo Dev Client / QR → packager on server LAN IP.

**Firewall:** if UFW is strict, allow LAN to `8081/tcp` only from office subnet — not from the public internet.

### Metro via Cloudflare (optional, advanced)

Expo over the public internet is awkward (WebSocket, HMR). Options:

1. **Prefer LAN or Tailscale** for Metro ([REMOTE.md](../REMOTE.md)) — phone on tailnet or office Wi‑Fi.
2. **Separate tunnel hostname** (e.g. `expo-dev.bluraymaldives.site`) with TCP or HTTP2 — higher complexity; not needed for manager APK previews.
3. **USB** `adb reverse` when debugging at the desk.

For **preview APK** distribution, use EAS build artifacts — not Metro through the tunnel.

## Phase 3 — Preview APK (EAS)

From `mobile/` with Expo Application Services configured (`eas.json`, Expo account):

```bash
npx eas-cli@latest build --profile preview --platform android
```

- **Preview profile**: internal APK/AAB, installable without Play Store.
- Store **credentials** in EAS (keystore), not in git.

**Local build** (alternative, no EAS queue):

```bash
npx expo run:android --variant release
# or eas build --local
```

Requires Android SDK/NDK on the build machine (heavy on Debian desktop — CI or EAS cloud is often easier).

## Phase 4 — Ship to field staff

1. Build preview/production APK with API URL baked or entered at first launch (today: user-entered URL in app).
2. Distribute APK via link, MDM, or Play internal testing.
3. Document that API is always `https://server.bluraymaldives.site`; rotates only if DNS changes.

## Debian server: what not to autostart

| Service | Boot autostart? |
| --- | --- |
| `nexcrm` / `jacms` | Yes |
| `cloudflared` | Yes |
| Expo Metro | **No** (dev-only; start manually) |
| EAS build | **No** (cloud or ad-hoc CI) |

## Checklist before first field pilot

- [ ] Tunnel health: `https://server.bluraymaldives.site/health`
- [ ] Mobile login tested on Android with real account
- [ ] Preview APK installed; API URL set
- [ ] Module gaps acceptable vs web — table in [mobile/README.md](../../mobile/README.md)
- [ ] Support plan for app updates (new EAS build)

## Related

- [README.md](README.md) — server guides index
- [cloudflare-tunnel-server-bluraymaldives.md](cloudflare-tunnel-server-bluraymaldives.md) — public API URL
- [jacms-rename-plan.md](jacms-rename-plan.md) — mobile display name JACMS
