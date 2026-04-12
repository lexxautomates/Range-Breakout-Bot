import {
  useListBots,
  useStartBots,
  useStopAllBots,
  useStopBot2,
  useSpawnOffspring,
  useGetConfig,
} from "@workspace/api-client-react";
import type { ChildBot, ChildBotConfig } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Square,
  Trash2,
  Dna,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CircleDot,
  Users,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

function phaseColor(phase: string) {
  switch (phase) {
    case "in_trade": return "bg-success/10 text-success border-success/20";
    case "watching": return "bg-primary/10 text-primary border-primary/20";
    case "building_range": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    case "closed": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatMoney(val: number | undefined | null) {
  if (val == null) return "---";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

const CONFIG_LABELS: Partial<Record<keyof ChildBotConfig, string>> = {
  openingRangeMinutes: "ORB min",
  riskPercent: "Risk %",
  rewardRiskRatio: "RR ratio",
  volumeMultiplier: "Vol mult",
  trailingStopActivationR: "Trail R",
  maxOrbWidthPercent: "Max ORB%",
  minOrbWidthPercent: "Min ORB%",
  breakoutWindowMinutes: "Bkout win",
};

function ConfigDiff({ botConfig, baseConfig }: { botConfig: ChildBotConfig; baseConfig: Partial<ChildBotConfig> }) {
  const diffs: { key: string; label: string; bot: string | number | boolean; base: string | number | boolean }[] = [];

  for (const [k, label] of Object.entries(CONFIG_LABELS)) {
    const key = k as keyof ChildBotConfig;
    const botVal = botConfig[key];
    const baseVal = baseConfig[key];
    if (botVal != null && baseVal != null && botVal !== baseVal) {
      diffs.push({ key, label, bot: botVal as string | number | boolean, base: baseVal as string | number | boolean });
    }
  }

  if (diffs.length === 0) return <div className="text-xs text-muted-foreground italic">No evolved parameters yet</div>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {diffs.map((d) => (
        <div key={d.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-xs font-mono">
          <span className="text-muted-foreground">{d.label}:</span>
          <span className="text-purple-400 line-through opacity-60">{String(d.base)}</span>
          <span className="text-purple-300 font-semibold">{String(d.bot)}</span>
        </div>
      ))}
    </div>
  );
}

function BotCard({ bot, baseConfig }: { bot: ChildBot; baseConfig: Partial<ChildBotConfig> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);

  const stopBot = useStopBot2({
    mutation: {
      onSuccess: () => {
        toast({ title: `Bot ${bot.id} stopped` });
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      },
      onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
    },
  });

  const spawnOffspring = useSpawnOffspring({
    mutation: {
      onSuccess: (child) => {
        toast({ title: `Offspring spawned: ${child.id}` });
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      },
      onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
    },
  });

  const pnl = bot.session.currentPnl;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">{bot.symbol}</span>
            <Badge className={`font-mono text-xs ${phaseColor(bot.phase)}`}>{bot.phase}</Badge>
            {bot.generation > 0 && (
              <Badge variant="outline" className="font-mono text-xs text-purple-400 border-purple-500/20">
                <Dna className="h-3 w-3 mr-1" /> Gen {bot.generation}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono">{bot.id}</div>
          {bot.parentId && (
            <div className="text-xs text-muted-foreground">↳ offspring of {bot.parentId}</div>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
            onClick={() => spawnOffspring.mutate({ id: bot.id })}
            disabled={spawnOffspring.isPending}
            title="Spawn evolved offspring"
          >
            <Dna className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-danger border-danger/30 hover:bg-danger/10"
            onClick={() => stopBot.mutate({ id: bot.id })}
            disabled={stopBot.isPending}
            title="Stop bot"
          >
            <Square className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Current Price</div>
            <div className="font-mono text-sm font-semibold">
              {bot.session.currentPrice != null ? `$${bot.session.currentPrice.toFixed(2)}` : "---"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Open P&L</div>
            <div
              className={`font-mono text-sm font-semibold ${
                pnl != null && pnl > 0 ? "text-success" : pnl != null && pnl < 0 ? "text-danger" : ""
              }`}
            >
              {pnl != null ? formatMoney(pnl) : "---"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Win Rate</div>
            <div className="font-mono text-sm">
              {bot.stats.totalTrades > 0
                ? `${(bot.stats.winRate * 100).toFixed(0)}%`
                : "---"}
              <span className="text-muted-foreground text-xs ml-1">({bot.stats.totalTrades}t)</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Avg R</div>
            <div
              className={`font-mono text-sm ${
                bot.stats.avgRMultiple > 0 ? "text-success" : bot.stats.avgRMultiple < 0 ? "text-danger" : ""
              }`}
            >
              {bot.stats.totalTrades > 0 ? `${bot.stats.avgRMultiple.toFixed(2)}R` : "---"}
            </div>
          </div>
        </div>

        {bot.session.phase === "in_trade" && (
          <div className="mt-3 p-2 bg-muted/50 rounded-md border border-border grid grid-cols-3 gap-2 text-xs font-mono">
            <div>
              <div className="text-muted-foreground">Entry</div>
              <div>{bot.session.entryPrice?.toFixed(2) ?? "---"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Target</div>
              <div className="text-success">{bot.session.targetPrice?.toFixed(2) ?? "---"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Stop</div>
              <div className="text-danger">{bot.session.stopPrice?.toFixed(2) ?? "---"}</div>
            </div>
          </div>
        )}

        {bot.session.phase === "watching" && bot.session.orbHigh && bot.session.orbLow && (
          <div className="mt-3 flex gap-3 text-xs font-mono text-muted-foreground">
            <span>ORB: <span className="text-success">{bot.session.orbHigh.toFixed(2)}</span> / <span className="text-danger">{bot.session.orbLow.toFixed(2)}</span></span>
            {bot.session.volumeRatio && (
              <span>Vol: {bot.session.volumeRatio.toFixed(1)}x</span>
            )}
          </div>
        )}

        {bot.session.breakoutDirection && bot.session.breakoutDirection !== "none" && (
          <div className="mt-1 text-xs flex items-center gap-1">
            {bot.session.breakoutDirection === "long" ? (
              <span className="text-success flex items-center gap-0.5"><TrendingUp className="h-3 w-3" /> LONG</span>
            ) : (
              <span className="text-danger flex items-center gap-0.5"><TrendingDown className="h-3 w-3" /> SHORT</span>
            )}
          </div>
        )}

        {bot.error && (
          <div className="mt-2 p-2 bg-danger/10 border border-danger/20 rounded text-xs text-danger">
            {bot.error}
          </div>
        )}

        {/* Evolved config diff */}
        <div className="mt-3 border-t border-border pt-2">
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowConfig((v) => !v)}
          >
            {showConfig ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Evolved params
            {bot.generation > 0 && <span className="text-purple-400 ml-1">(Gen {bot.generation})</span>}
          </button>
          {showConfig && (
            <div className="mt-2">
              <ConfigDiff botConfig={bot.config} baseConfig={baseConfig} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Bots() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [symbolInput, setSymbolInput] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  const { data: bots = [], isLoading } = useListBots({
    query: { refetchInterval: 5000 },
  });

  const { data: globalConfig } = useGetConfig({ query: { refetchInterval: false } });

  const startBots = useStartBots({
    mutation: {
      onSuccess: (result) => {
        const count = result.started?.length ?? 0;
        toast({ title: `${count} bot${count !== 1 ? "s" : ""} started`, description: result.started?.map((b) => b.symbol).join(", ") });
        setWatchlist([]);
        setSymbolInput("");
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      },
      onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
    },
  });

  const stopAll = useStopAllBots({
    mutation: {
      onSuccess: () => {
        toast({ title: "All bots stopped" });
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      },
      onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
    },
  });

  const addSymbol = () => {
    const syms = symbolInput.toUpperCase().split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const toAdd = syms.filter((s) => !watchlist.includes(s));
    if (toAdd.length > 0) setWatchlist((prev) => [...prev, ...toAdd]);
    setSymbolInput("");
  };

  const removeSymbol = (sym: string) => setWatchlist((prev) => prev.filter((s) => s !== sym));

  const handleStart = () => {
    const inputSyms = symbolInput.toUpperCase().split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const combined = [...new Set([...watchlist, ...inputSyms])];
    if (combined.length === 0) {
      toast({ title: "Symbol required", description: "Enter at least one ticker symbol", variant: "destructive" });
      return;
    }
    startBots.mutate({ data: { symbols: combined } });
  };

  const activeBots = bots.filter((b) => b.phase !== "closed");
  const inTrade = activeBots.filter((b) => b.phase === "in_trade");
  const displayBots = showAll ? bots : activeBots;
  const totalCount = watchlist.length + (symbolInput.trim() ? 1 : 0);

  const baseConfig: Partial<ChildBotConfig> = globalConfig ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Bot Swarm</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleDot className={`h-3 w-3 ${activeBots.length > 0 ? "text-success animate-pulse" : "text-muted-foreground"}`} />
            <span>{activeBots.length} active</span>
            {inTrade.length > 0 && (
              <span className="text-success font-semibold ml-1">{inTrade.length} in trade</span>
            )}
          </div>
          {bots.length > activeBots.length && (
            <button
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show active only" : `Show all (${bots.length})`}
            </button>
          )}
          {activeBots.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stopAll.mutate()}
              disabled={stopAll.isPending}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Stop All
            </Button>
          )}
        </div>
      </div>

      {activeBots.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Active Bots</div>
              <div className="text-2xl font-mono font-bold">{activeBots.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">In Trade</div>
              <div className={`text-2xl font-mono font-bold ${inTrade.length > 0 ? "text-success" : ""}`}>{inTrade.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Total P&L</div>
              <div className={`text-2xl font-mono font-bold ${
                activeBots.reduce((s, b) => s + b.stats.totalPnl, 0) > 0 ? "text-success" : "text-danger"
              }`}>
                {formatMoney(activeBots.reduce((s, b) => s + b.stats.totalPnl, 0))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Max Generation</div>
              <div className="text-2xl font-mono font-bold flex items-center gap-1">
                <Dna className="h-5 w-5 text-purple-400" />
                {Math.max(...activeBots.map((b) => b.generation), 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Launch Bot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="SPY, QQQ, AAPL ..."
              className="font-mono uppercase max-w-xs"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addSymbol();
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={addSymbol} disabled={!symbolInput.trim()}>
              Add
            </Button>
            <Button
              className="bg-success hover:bg-success/90 text-white font-bold"
              onClick={handleStart}
              disabled={startBots.isPending}
            >
              <Play className="h-4 w-4 mr-1" />
              {totalCount > 1 ? `Launch All (${totalCount})` : "Launch"}
            </Button>
          </div>
          {watchlist.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {watchlist.map((sym) => (
                <span key={sym} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs font-mono font-semibold">
                  {sym}
                  <button onClick={() => removeSymbol(sym)} className="hover:text-danger transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Each bot independently tracks its own ORB breakout and evolves its parameters after{" "}
            <span className="text-foreground font-medium">N trades</span>.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : displayBots.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
          <RefreshCw className="h-10 w-10 opacity-20" />
          <p className="text-sm">No bots running. Launch one above or use the Scanner to auto-start top candidates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayBots.map((bot) => (
            <BotCard key={bot.id} bot={bot} baseConfig={baseConfig} />
          ))}
        </div>
      )}
    </div>
  );
}
