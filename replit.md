# ORB Trading Bot Dashboard

## Overview

Full-stack Opening Range Breakout (ORB) trading bot connected to Alpaca paper trading API.
pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (Fastify-style logging via pino)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- **Build**: esbuild (CJS bundle for API server)
- **Frontend**: React + Vite + Tailwind v4 + shadcn/ui + Wouter routing

## Artifacts

| Artifact | Kind | Port | Path | Purpose |
|---|---|---|---|---|
| `artifacts/api-server` | api | 8080 | `/api` | Express REST API + ORB bot engine |
| `artifacts/orb-dashboard` | web | 8081 | `/` | React dashboard UI |

## Port Mapping (Critical)

The `.replit` file maps only these ports externally:
- `localPort: 8080` → `externalPort: 8080` (API server)
- `localPort: 8081` → `externalPort: 80` (Dashboard/main web)

**Important**: Vite must bind to `::` (IPv6 dual-stack), not `0.0.0.0`. The Replit health check uses `localhost` which resolves to `::1` first.

## Key Files

- `artifacts/api-server/src/lib/botEngine.ts` — ChildBot registry, ORB strategy loop, self-evolution, offspring spawning
- `artifacts/api-server/src/lib/botState.ts` — shared in-memory bot state (legacy single-bot + registry)
- `artifacts/api-server/src/lib/scanner.ts` — morning gap scanner (Alpaca snapshots, score ranking)
- `artifacts/api-server/src/lib/orchestrator.ts` — 9:25 AM scheduler, auto-start guard, top-performer spawn
- `artifacts/api-server/src/lib/alpaca.ts` — Alpaca client setup
- `artifacts/api-server/src/lib/broker.ts` — Unified broker interface (IBroker); implementations: AlpacaBroker, IbkrBroker, CryptoDotComBroker
- `artifacts/api-server/src/lib/llmAdvisor.ts` — Pluggable LLM AI advisor; providers: claude, openrouter, ollama (Hermes etc); called before every trade entry
- `artifacts/api-server/src/routes/index.ts` — all routes wired
- `lib/db/src/schema/index.ts` — trades + bot_config + bot_instances DB schema
- `lib/api-spec/openapi.yaml` — full API spec
- `artifacts/orb-dashboard/src/App.tsx` — routing + layout
- `artifacts/orb-dashboard/src/pages/bots.tsx` — Bot Swarm page (live child bot cards)
- `artifacts/orb-dashboard/src/pages/scanner.tsx` — Gap Scanner page
- `artifacts/orb-dashboard/src/pages/dashboard.tsx` — main dashboard
- `artifacts/orb-dashboard/src/pages/trades.tsx` — trade history
- `artifacts/orb-dashboard/src/pages/stats.tsx` — performance stats
- `artifacts/orb-dashboard/src/pages/positions.tsx` — open positions (live Alpaca data)
- `artifacts/orb-dashboard/src/pages/config.tsx` — bot config form (includes swarm + evolution settings)

## Multi-Bot Swarm Architecture

- **`GET /api/bots`** — active runtime bots only (self-remove from registry on market close)
- **Historical instances** — in DB `bot_instances` table (query directly via `/api/trades` filtered by `botInstanceId`)
- **Scanner universe** — static curated list (~60 liquid symbols); can be overridden by passing `symbols[]` to `POST /api/scanner/run`
- **Evolution** — triggers every `evolutionThreshold` trades; selects parameter by R-multiple variance × param deviation from midpoint; applies ±10% bounded mutation; tracks `baselineAvgR` for before/after comparison
- **Self-evolution direction** — if `currentAvgR > baselineAvgR`: exploit (75% keep direction); else: correct (75% reverse direction)
- **Orchestrator spawn** — `POST /api/bots/evolve` selects top N bots by `avgRMultiple` (min trades filter) and spawns offspring

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Environment Variables

Set in `.replit` under `[userenv.shared]`:
- `ALPACA_API_KEY` — Alpaca paper trading API key
- `ALPACA_API_SECRET` — Alpaca paper trading secret
- `ALPACA_BASE_URL` — `https://paper-api.alpaca.markets`
- `ALPACA_DATA_URL` — `https://data.alpaca.markets`

Secrets (managed via Replit secrets):
- `SESSION_SECRET` — express-session secret

## Bot Strategy (ORB)

1. Builds opening range during first N minutes after 9:30 AM ET (default: 15 min)
2. Detects breakout above high or below low with volume confirmation
3. Enters long/short position with configurable risk % per trade
4. Sets stop loss at opposite side of range (or midpoint for moderate risk mode)
5. Sets take profit at 2R (configurable reward:risk ratio)
6. Applies trailing stop after partial profit target hit
7. Re-entry allowed once per session after a stopped-out trade
8. Bot loop runs every 30 seconds via setInterval
9. All trades recorded to PostgreSQL via Drizzle ORM
