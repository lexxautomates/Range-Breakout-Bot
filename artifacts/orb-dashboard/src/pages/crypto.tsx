import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Square, RefreshCw, TrendingUp, TrendingDown,
  Wallet, Activity, BookOpen, Layers, Settings2, ChevronDown, ChevronUp,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface CryptoTicker {
  i: string;
  a: string;
  b: string;
  c: string;
  h: string;
  l: string;
  v: string;
  vv: string;
  t: number;
}

interface CryptoBotState {
  id: string;
  config: {
    symbol: string;
    sessionWindowMinutes: number;
    sessionType: string;
    riskPercent: number;
    rewardRiskRatio: number;
    enableShorts: boolean;
  };
  session: {
    phase: string;
    orbHigh: number | null;
    orbLow: number | null;
    entryPrice: number | null;
    stopPrice: number | null;
    targetPrice: number | null;
    direction: string | null;
    qty: number | null;
    tradeCount: number;
    sessionLabel: string;
  };
  createdAt: string;
  stoppedAt: string | null;
}

interface BotFormState {
  symbol: string;
  sessionWindowMinutes: number;
  sessionType: "hourly" | "daily";
  riskPercent: number;
  rewardRiskRatio: number;
  enableShorts: boolean;
  breakoutWindowMinutes: number;
  maxOrbWidthPercent: number;
  minOrbWidthPercent: number;
  trailingStopEnabled: boolean;
  reEntryEnabled: boolean;
}

const defaultForm: BotFormState = {
  symbol: "BTC_USD",
  sessionWindowMinutes: 30,
  sessionType: "hourly",
  riskPercent: 1,
  rewardRiskRatio: 2,
  enableShorts: false,
  breakoutWindowMinutes: 360,
  maxOrbWidthPercent: 5,
  minOrbWidthPercent: 0.1,
  trailingStopEnabled: false,
  reEntryEnabled: false,
};

const POPULAR_PAIRS = [
  "BTC_USD", "ETH_USD", "SOL_USD", "BNB_USD", "XRP_USD",
  "ADA_USD", "AVAX_USD", "DOT_USD", "DOGE_USD", "MATIC_USD",
];

function phaseBadge(phase: string) {
  const variants: Record<string, string> = {
    in_trade: "bg-green-500/10 text-green-400 border-green-500/20",
    watching: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    building_range: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    waiting: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    closed: "bg-muted text-muted-foreground",
  };
  return variants[phase] ?? "bg-muted text-muted-foreground";
}

function fmtPrice(val: string | number | null | undefined): string {
  if (val == null) return "---";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "---";
  return n >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : n.toPrecision(6);
}

function fmtPct(val: string | null | undefined): string {
  if (!val) return "";
  const n = parseFloat(val);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function TickerGrid() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["crypto", "tickers"],
    queryFn: () =>
      apiFetch<{ tickers: CryptoTicker[] }>("/crypto/tickers").catch(() => ({ tickers: [] })),
    refetchInterval: 15_000,
  });

  const tickers = (data?.tickers ?? [])
    .filter((t) => t.i?.endsWith("_USD") && !t.i?.includes("PERP"))
    .sort((a, b) => parseFloat(b.vv ?? "0") - parseFloat(a.vv ?? "0"))
    .slice(0, 12);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          Live Tickers (USD pairs)
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 ml-auto"
            onClick={() => refetch()}
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />
            ))}
          </div>
        ) : tickers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No ticker data — Crypto.com API credentials required for live prices.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {tickers.map((t) => {
              const change = parseFloat(t.c ?? "0");
              const isUp = change >= 0;
              return (
                <div
                  key={t.i}
                  className="bg-card border border-border rounded p-2 flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{t.i.replace("_USD", "")}</span>
                    <span
                      className={`text-[10px] font-mono ${isUp ? "text-green-400" : "text-red-400"}`}
                    >
                      {fmtPct(t.c)}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-bold">${fmtPrice(t.a)}</span>
                  <span className="text-[10px] text-muted-foreground">
                    Vol: {parseFloat(t.v).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BotCard({ bot, onStop }: { bot: CryptoBotState; onStop: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { session } = bot;

  return (
    <div className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-semibold text-sm">{bot.config.symbol}</span>
          <Badge className={`text-[10px] py-0 h-4 border ${phaseBadge(session.phase)}`}>
            {session.phase.replace("_", " ")}
          </Badge>
          {session.direction && (
            <Badge variant="outline" className="text-[10px] py-0 h-4">
              {session.direction === "long" ? (
                <TrendingUp className="h-3 w-3 mr-1 text-green-400" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1 text-red-400" />
              )}
              {session.direction}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            onClick={() => onStop(bot.id)}
          >
            <Square className="h-3 w-3 mr-1" />
            Stop
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Session</span>
          <p className="font-mono">{bot.config.sessionType}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Window</span>
          <p className="font-mono">{bot.config.sessionWindowMinutes}m</p>
        </div>
        <div>
          <span className="text-muted-foreground">Trades</span>
          <p className="font-mono">{session.tradeCount}</p>
        </div>
      </div>

      {expanded && session.phase === "in_trade" && (
        <div className="border-t border-border pt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Entry</span>
            <p className="font-mono">${fmtPrice(session.entryPrice)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Stop</span>
            <p className="font-mono text-red-400">${fmtPrice(session.stopPrice)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Target</span>
            <p className="font-mono text-green-400">${fmtPrice(session.targetPrice)}</p>
          </div>
        </div>
      )}

      {expanded && session.orbHigh && session.orbLow && (
        <div className="border-t border-border pt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">ORB High</span>
            <p className="font-mono">${fmtPrice(session.orbHigh)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">ORB Low</span>
            <p className="font-mono">${fmtPrice(session.orbLow)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BotLauncher({ onStarted }: { onStarted: () => void }) {
  const [form, setForm] = useState<BotFormState>(defaultForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  const startMutation = useMutation({
    mutationFn: (config: BotFormState) =>
      apiFetch<CryptoBotState>("/crypto/bots/start", {
        method: "POST",
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      toast({ title: "Crypto bot started" });
      onStarted();
    },
    onError: (err) => toast({ title: "Failed to start bot", description: String(err), variant: "destructive" }),
  });

  function set<K extends keyof BotFormState>(key: K, value: BotFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          Launch Crypto Bot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1 mb-1">
          {POPULAR_PAIRS.map((p) => (
            <button
              key={p}
              onClick={() => set("symbol", p)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                form.symbol === p
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {p.replace("_USD", "")}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Symbol</label>
            <Input
              value={form.symbol}
              onChange={(e) => set("symbol", e.target.value.toUpperCase())}
              placeholder="BTC_USD"
              className="h-8 text-xs font-mono mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Session Type</label>
            <select
              value={form.sessionType}
              onChange={(e) => set("sessionType", e.target.value as "hourly" | "daily")}
              className="h-8 w-full rounded border border-input bg-background px-2 text-xs mt-0.5"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily (midnight UTC)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Range Window (min)</label>
            <Input
              type="number"
              value={form.sessionWindowMinutes}
              onChange={(e) => set("sessionWindowMinutes", Number(e.target.value))}
              className="h-8 text-xs mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Risk %</label>
            <Input
              type="number"
              value={form.riskPercent}
              step={0.1}
              onChange={(e) => set("riskPercent", Number(e.target.value))}
              className="h-8 text-xs mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">R:R Ratio</label>
            <Input
              type="number"
              value={form.rewardRiskRatio}
              step={0.1}
              onChange={(e) => set("rewardRiskRatio", Number(e.target.value))}
              className="h-8 text-xs mt-0.5"
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enableShorts}
                onChange={(e) => set("enableShorts", e.target.checked)}
                className="rounded"
              />
              Enable Shorts
            </label>
          </div>
        </div>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
        >
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Advanced settings
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
            <div>
              <label className="text-xs text-muted-foreground">Max ORB Width %</label>
              <Input
                type="number"
                value={form.maxOrbWidthPercent}
                step={0.1}
                onChange={(e) => set("maxOrbWidthPercent", Number(e.target.value))}
                className="h-8 text-xs mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Min ORB Width %</label>
              <Input
                type="number"
                value={form.minOrbWidthPercent}
                step={0.01}
                onChange={(e) => set("minOrbWidthPercent", Number(e.target.value))}
                className="h-8 text-xs mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Breakout Window (min)</label>
              <Input
                type="number"
                value={form.breakoutWindowMinutes}
                onChange={(e) => set("breakoutWindowMinutes", Number(e.target.value))}
                className="h-8 text-xs mt-0.5"
              />
            </div>
            <div className="flex flex-col gap-1.5 justify-end pb-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.trailingStopEnabled}
                  onChange={(e) => set("trailingStopEnabled", e.target.checked)}
                />
                Trailing Stop
              </label>
              <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.reEntryEnabled}
                  onChange={(e) => set("reEntryEnabled", e.target.checked)}
                />
                Re-Entry
              </label>
            </div>
          </div>
        )}

        <Button
          className="w-full h-8 text-sm"
          onClick={() => startMutation.mutate(form)}
          disabled={startMutation.isPending}
        >
          {startMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Start Bot
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Crypto() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const botsQuery = useQuery({
    queryKey: ["crypto", "bots"],
    queryFn: () => apiFetch<CryptoBotState[]>("/crypto/bots"),
    refetchInterval: 5_000,
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/crypto/bots/${id}/stop`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Bot stopped" });
      void queryClient.invalidateQueries({ queryKey: ["crypto", "bots"] });
    },
    onError: (err) => toast({ title: "Failed to stop bot", description: String(err), variant: "destructive" }),
  });

  const bots = botsQuery.data ?? [];
  const activeBots = bots.filter((b) => b.session.phase !== "closed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Crypto.com Exchange</h1>
          <p className="text-muted-foreground text-sm mt-1">
            24/7 ORB trading bots powered by the Crypto.com Exchange v1 API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Layers className="h-3 w-3 mr-1" />
            {activeBots.length} active
          </Badge>
        </div>
      </div>

      <TickerGrid />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Active Bots ({activeBots.length})
                {botsQuery.isFetching && (
                  <RefreshCw className="h-3 w-3 animate-spin ml-1 text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeBots.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active crypto bots</p>
                  <p className="text-xs mt-1">Launch one using the form →</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeBots.map((bot) => (
                    <BotCard
                      key={bot.id}
                      bot={bot}
                      onStop={(id) => stopMutation.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                API Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-xs font-mono text-muted-foreground">
                {[
                  "GET  /api/crypto/instruments",
                  "GET  /api/crypto/tickers",
                  "GET  /api/crypto/ticker/:symbol",
                  "GET  /api/crypto/book/:symbol",
                  "GET  /api/crypto/candles/:symbol",
                  "GET  /api/crypto/trades/:symbol",
                  "GET  /api/crypto/account",
                  "GET  /api/crypto/positions",
                  "GET  /api/crypto/orders/open",
                  "GET  /api/crypto/orders/history",
                  "POST /api/crypto/orders/market",
                  "POST /api/crypto/orders/limit",
                  "POST /api/crypto/orders/stop-loss",
                  "POST /api/crypto/orders/take-profit",
                  "DEL  /api/crypto/orders/:orderId",
                  "DEL  /api/crypto/orders (cancel all)",
                  "POST /api/crypto/positions/:sym/close",
                  "GET  /api/crypto/fee-rate",
                  "GET  /api/crypto/bots",
                  "POST /api/crypto/bots/start",
                  "POST /api/crypto/bots/:id/stop",
                ].map((ep) => (
                  <div key={ep} className="flex gap-2">
                    <span
                      className={`w-8 ${
                        ep.startsWith("GET")
                          ? "text-blue-400"
                          : ep.startsWith("POST")
                            ? "text-green-400"
                            : "text-red-400"
                      }`}
                    >
                      {ep.slice(0, 3).trim()}
                    </span>
                    <span>{ep.slice(5)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <BotLauncher
          onStarted={() => void queryClient.invalidateQueries({ queryKey: ["crypto", "bots"] })}
        />
      </div>
    </div>
  );
}
