# NEXCRM docs

Ship these with the codebase so humans and agents share one orientation surface. Start here, then open the doc that matches the job.

## Reading order (agents)

1. [../AGENTS.md](../AGENTS.md) — short catch-up + locked rules  
2. [MASTER_PLAN.md](MASTER_PLAN.md) — living full-repo map  
3. [PRODUCT.md](PRODUCT.md) — agency modules + finance apps  
4. [ARCHITECTURE.md](ARCHITECTURE.md) — layout, auth, how to extend  
5. [API.md](API.md) — `/api/v1` contract for web + mobile  

Ops / remote work: [DEPLOY.md](DEPLOY.md), [REMOTE.md](REMOTE.md), [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).

## Index

| Document | Contents |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Agent entry: rules, paths, commands |
| [MASTER_PLAN.md](MASTER_PLAN.md) | Orientation, domain, migrations, next work |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Monorepo, auth, web/mobile, extend |
| [API.md](API.md) | Shared `/api/v1` for React + Expo |
| [PRODUCT.md](PRODUCT.md) | Agency tools + finance apps map |
| [DEPLOY.md](DEPLOY.md) | nginx, systemd, Postgres over LAN/Tailscale |
| [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) | Public HTTPS via Cloudflare Tunnel (no port-forward) |
| [REMOTE.md](REMOTE.md) | Tailscale SSH + Cursor from anywhere |
| [mobile/AGENTS.md](../mobile/AGENTS.md) | Expo-specific agent notes |

Repo overview: [../README.md](../README.md).

## Keeping docs useful

When you change a user-facing route, API path, migration, or locked product rule, update the matching doc in the same change. Prefer short accurate tables over long narrative.
