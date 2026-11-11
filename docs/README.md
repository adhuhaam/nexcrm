# JACMS docs

> ## ⚠️ MANDATORY RULE FOR CURSOR AND EVERY AI AGENT
>
> **YOU MUST MAINTAIN DOCUMENTATION AS PART OF EVERY CHANGE.** Before work: `git pull` and read [MASTER_PLAN.md](MASTER_PLAN.md), this index, and [guides/](guides/README.md). After work: update the master plan and guides in the **same commit**. Adhuhaam edits from many locations — pull/rebase first; **never overwrite** his doc edits.

Ship these with the codebase so humans and agents share one orientation surface. Start here, then open the doc that matches the job.

**Product:** JACMS (JA CRM) · **Domain:** https://server.bluraymaldives.site · Code may still say `nexcrm` until rename.

## Reading order (agents)

1. [../AGENTS.md](../AGENTS.md) — short catch-up + locked rules  
2. [MASTER_PLAN.md](MASTER_PLAN.md) — **main roadmap**, checkboxes, milestones M1–M8  
3. [PRODUCT.md](PRODUCT.md) — agency modules + finance apps  
4. [ARCHITECTURE.md](ARCHITECTURE.md) — layout, auth, how to extend  
5. [API.md](API.md) — `/api/v1` contract for web + mobile  

Ops / remote work: [DEPLOY.md](DEPLOY.md), [REMOTE.md](REMOTE.md), [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).

**Server setup (Debian desktop, JACMS naming, `server.bluraymaldives.site`):** [guides/README.md](guides/README.md).

## Index

| Document | Contents |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Agent entry: rules, paths, commands |
| [MASTER_PLAN.md](MASTER_PLAN.md) | Master roadmap: shipped ✅, planned 📝, milestones |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Monorepo, auth, web/mobile, extend |
| [API.md](API.md) | Shared `/api/v1` for React + Expo |
| [PRODUCT.md](PRODUCT.md) | Agency tools + finance apps map |
| [DEPLOY.md](DEPLOY.md) | nginx, systemd, Postgres over LAN/Tailscale |
| [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) | Public HTTPS via Cloudflare Tunnel (no port-forward) |
| [guides/README.md](guides/README.md) | Debian server, autostart, tunnel hostname, JACMS rename checklist, mobile roadmap |
| [REMOTE.md](REMOTE.md) | Tailscale SSH + Cursor from anywhere |
| [mobile/AGENTS.md](../mobile/AGENTS.md) | Expo-specific agent notes |

Repo overview: [../README.md](../README.md).

## Keeping docs useful

When you change a user-facing route, API path, migration, or locked product rule, update **MASTER_PLAN.md** checkboxes and the matching doc in the same change. See [.cursor/rules/docs-maintenance.mdc](../.cursor/rules/docs-maintenance.mdc).
