# Range Breakout Bot (ORB Trading Bot Swarm)

A full-stack algorithmic trading system built around the **Opening Range Breakout (ORB)** strategy. Runs a swarm of autonomous bots connected to Alpaca paper trading ($100K account), with a multi-LLM AI advisor layer gating every trade entry and exit, multi-broker support, a dedicated 24/7 Crypto.com Exchange integration, real-time market news via AutoCLI, and a live React dashboard.

---

## Features

### ORB Strategy Engine
- Captures the high/low of a configurable opening range window (default 30 min)
- Enters long on breakout above range high, short on breakdown below range low
- Configurable volume confirmation, max/min ORB width filters
- Trailing stop loss and re-entry support
- Per-bot risk % and reward:risk ratio targeting

### Multi-Bot Swarm
- Spawn independent bots per ticker (e.g. AAPL, TSLA, SPY simultaneously)
- Orchestrator manages bot lifecycle — auto-stops bots that finish their session
- Self-evolution: bots can mutate their own config parameters across generations
- Morning scanner runs at 9:25 AM ET daily, ranks top symbols by gap, volume, and momentum
- Bot configs persist in PostgreSQL; full trade history recorded

### AI Advisor Layer (Multi-LLM)
Every trade entry and exit passes through a configurable LLM advisor before execution. Supported providers:

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Anthropic | claude-3-5-sonnet, claude-3-haiku |
| Google | gemini-1.5-pro, gemini-1.5-flash |
| None | Auto-approve (bypass advisor) |

The advisor receives full market context (ORB levels, current price, volume, direction, recent candles) and returns approve/reject with reasoning logged to the dashboard.

### Multi-Broker Support
The `IBroker` interface is implemented for three brokers:

| Broker | Use Case |
|--------|----------|
| **Alpaca** | US equities paper + live trading |
| **IBKR** | Interactive Brokers (equities, options, futures) |
| **Crypto.com Exchange** | Crypto spot trading (24/7) |

Switch brokers per-bot via the dashboard config panel.

### Crypto.com Exchange v1 API (24/7 Bots)
Complete implementation of the [Crypto.com Exchange v1 REST API](https://exchange-docs.crypto.com/exchange/v1/rest-ws/index.html):

**Public endpoints**
- `GET /api/crypto/instruments` — All tradeable instruments (filter by type)
- `GET /api/crypto/tickers` — All live tickers (sorted by USD volume)
- `GET /api/crypto/ticker/:symbol` — Single ticker
- `GET /api/crypto/book/:symbol` — Order book (depth configurable)
- `GET /api/crypto/candles/:symbol` — Candlestick OHLCV data
- `GET /api/crypto/trades/:symbol` — Recent public trades

**Private endpoints** (requires `x-cryptocom-api-key` + `x-cryptocom-api-secret` headers or env vars)
- `GET /api/crypto/account` — Account balances
- `GET /api/crypto/positions` — Open positions
- `GET /api/crypto/orders/open` — Open orders
- `GET /api/crypto/orders/history` — Order history
- `POST /api/crypto/orders/market` — Market order
- `POST /api/crypto/orders/limit` — Limit order
- `POST /api/crypto/orders/stop-loss` — Stop-loss order
- `POST /api/crypto/orders/take-profit` — Take-profit order
- `DELETE /api/crypto/orders/:orderId` — Cancel single order
- `DELETE /api/crypto/orders` — Cancel all orders
- `POST /api/crypto/positions/:symbol/close` — Close position (market sell)
- `GET /api/crypto/fee-rate` — Account fee tier

**Crypto ORB Bots**
- `GET /api/crypto/bots` — List running bots
- `POST /api/crypto/bots/start` — Launch a new crypto ORB bot
- `POST /api/crypto/bots/:id/stop` — Stop a bot

Crypto bots support two session modes:
- **Hourly** — builds a new ORB range at the top of every hour, 24/7
- **Daily** — one range per day starting at midnight UTC

### AutoCLI Market News
Integrated with [AutoCLI](https://autocli.dev) (binary v0.3.7) for real-time market intelligence:
- HackerNews top stories feed
- Market discussion search (earnings, macro, sector keywords)
- Cached news endpoint with 5-minute TTL

### Dashboard (React + Vite)

| Page | Description |
|------|-------------|
| **Dashboard** | Live P&L, account equity, session summary, active bot count |
| **Bot Swarm** | Spawn/stop bots, view per-bot state (phase, ORB levels, entry/stop/target) |
| **Scanner** | Morning scan results — gap %, volume ratio, momentum score, top-N picks |
| **Crypto** | Live crypto tickers, crypto bot launcher + active bot state cards |
| **News** | HackerNews feed + market news search via AutoCLI |
| **Trades** | Full trade history with P&L, broker, duration |
| **Stats** | Win rate, average R, profit factor, equity curve |
| **Positions** | Live open positions across brokers |
| **Config** | Global bot config — LLM provider, broker, ORB params, risk settings |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React Dashboard (Vite)              │
│  Dashboard · Bot Swarm · Scanner · Crypto · News    │
└─────────────────────┬───────────────────────────────┘
                      │ REST (fetch)
┌─────────────────────▼───────────────────────────────┐
│               Express API Server (Node.js)           │
│                                                      │
│  /api/bots      → Orchestrator + Bot Engine         │
│  /api/crypto/*  → CryptoDotComClient + Bot Engine   │
│  /api/news/*    → AutoCLI wrapper                   │
│  /api/account   → Alpaca / IBKR                     │
│  /api/scanner   → Morning scanner                   │
└──────┬───────────┬──────────────┬───────────────────┘
       │           │              │
  ┌────▼────┐ ┌────▼────┐  ┌─────▼──────┐
  │ Alpaca  │ │  IBKR   │  │ Crypto.com │
  │ Paper   │ │ Broker  │  │ Exchange   │
  │ Trading │ │ (IBroker│  │ v1 API     │
  └─────────┘ │ iface)  │  └────────────┘
              └─────────┘
       │
  ┌────▼─────────────────────────────────┐
  │  LLM Advisor (askLlmAdvisor)         │
  │  OpenAI · Anthropic · Gemini · None  │
  └──────────────────────────────────────┘
       │
  ┌────▼───────────────────┐
  │  PostgreSQL (Drizzle)  │
  │  trades · bot_configs  │
  │  crypto_bot_configs    │
  └────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | Node.js, Express, TypeScript, ESBuild |
| Database | PostgreSQL, Drizzle ORM |
| Brokers | Alpaca SDK, IBKR REST, Crypto.com Exchange v1 |
| AI | OpenAI, Anthropic, Google Gemini |
| News | AutoCLI v0.3.7 |
| Monorepo | pnpm workspaces |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_TOKEN` | Yes (recommended) | Bearer token required for all `/api/*` routes (non-localhost access is blocked if missing) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session secret |
| `ALPACA_API_KEY` | Yes | Alpaca paper trading API key |
| `ALPACA_API_SECRET` | Yes | Alpaca paper trading API secret |
| `CRYPTOCOM_API_KEY` | For crypto trading | Crypto.com Exchange API key |
| `CRYPTOCOM_API_SECRET` | For crypto trading | Crypto.com Exchange API secret |
| `OPENAI_API_KEY` | If using OpenAI advisor | OpenAI API key |
| `ANTHROPIC_API_KEY` | If using Anthropic advisor | Anthropic API key |
| `GOOGLE_API_KEY` | If using Gemini advisor | Google AI API key |
| `AUTOCLI_API_TOKEN` | For news feed | AutoCLI auth token |
| `DASHBOARD_ORIGIN` | Recommended | If set, only this browser origin may call the API (CORS) |
| `HOST` | Optional | API bind address (default `127.0.0.1`; set `0.0.0.0` for LAN/Docker) |

Crypto.com credentials can also be passed per-request via `x-cryptocom-api-key` and `x-cryptocom-api-secret` HTTP headers.

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Push database schema
pnpm --filter @workspace/db run push

# Start API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start dashboard (port 8081)
pnpm --filter @workspace/orb-dashboard run dev
```

---

## Project Structure

```
.
├── artifacts/
│   ├── api-server/
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── botEngine.ts        # Core ORB bot engine (equities)
│   │       │   ├── cryptoBotEngine.ts  # 24/7 crypto ORB bot engine
│   │       │   ├── cryptocom.ts        # Crypto.com Exchange v1 client
│   │       │   ├── broker.ts           # IBroker + Alpaca/IBKR/Crypto adapters
│   │       │   ├── llmAdvisor.ts       # Multi-LLM trade advisor
│   │       │   ├── orchestrator.ts     # Bot swarm orchestrator
│   │       │   ├── scanner.ts          # Morning symbol scanner
│   │       │   └── autoCli.ts          # AutoCLI news wrapper
│   │       └── routes/
│   │           ├── bots.ts             # Swarm bot endpoints
│   │           ├── crypto.ts           # Crypto.com endpoints
│   │           ├── news.ts             # News endpoints
│   │           └── index.ts            # Route registration
│   └── orb-dashboard/
│       └── src/
│           └── pages/
│               ├── dashboard.tsx
│               ├── bots.tsx
│               ├── scanner.tsx
│               ├── crypto.tsx
│               ├── news.tsx
│               ├── trades.tsx
│               ├── stats.tsx
│               ├── positions.tsx
│               └── config.tsx
└── lib/
    └── db/
        └── src/schema/index.ts         # Drizzle schema (trades, bot_configs, crypto_bot_configs)
```

---

## License

MIT
