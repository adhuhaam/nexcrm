# NEXCRM mobile

Standalone Expo client for any reachable NEXCRM office server.

On connect you enter **API URL**, **email**, and **password**. The app only opens after the server answers and login returns a Bearer token.

## Feature coverage (vs web)

| Module | Mobile |
| --- | --- |
| Connect / login (any API URL) | Yes |
| Dashboard | Yes (read) |
| Companies (employers) | List, detail, create, edit |
| Employees | List, detail, create, edit |
| Clients | List, create, edit |
| Allocations | List, detail, create, resign, rate change |
| Payroll | List, detail, create, lock |
| Work permits | List, create, edit |
| Projects | List, detail (sites/files read) |
| Expenses | List, create, edit, delete |
| LOAs | List, detail, **simple** create form |
| Admin / roles / settings | No (web only) |
| Accommodations | No |
| Employee onboard / OCR / documents | No |
| LOA rich preview + signed PDF | No |

## Run

```bash
cd mobile
npm install
npx expo start
```

Web preview: `npx expo start --web` → http://localhost:8081

If the browser blocks CORS to your Tailscale host, run `npm run proxy` and set API URL to `http://127.0.0.1:8787`.

## EAS APK preview

```bash
npx eas-cli@latest build --profile preview --platform android
```
