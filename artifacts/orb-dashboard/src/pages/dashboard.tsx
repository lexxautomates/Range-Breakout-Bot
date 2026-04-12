import {
  useGetBotStatus,
  useStopBot,
  useGetCurrentSession,
  useGetSessionSummary,
  useGetAccount,
  useListBots,
  useStartBots,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Square,
  Activity,
  DollarSign,
  Wallet,
  Percent,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  X,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function formatMoney(val: number | undefined | null) {
  if (val == null) return "---";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function SymbolChip({ symbol, onRemove }: { symbol: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-xs font-mono text-primary">
      {symbol}
      <button onClick={onRemove} className="hover:text-danger transition-colors">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [symbolInput, setSymbolInput] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);

  const { data: botStatus, isLoading: loadingStatus } = useGetBotStatus({ query: { refetchInterval: 5000 } });
  const { data: sessionState, isLoading: loadingSession } = useGetCurrentSession({ query: { refetchInterval: 5000 } });
  const { data: summary, isLoading: loadingSummary } = useGetSessionSummary({ query: { refetchInterval: 5000 } });
  const { data: account, isLoading: loadingAccount } = useGetAccount({ query: { refetchInterval: 10000 } });
  const { data: swarmBots = [] } = useListBots({ query: { refetchInterval: 5000 } });

  const startBots = useStartBots({
    mutation: {
      onSuccess: (result) => {
        const count = result.started?.length ?? 0;
        toast({ title: `${count} bot${count !== 1 ? "s" : ""} started`, description: result.started?.map((b) => b.symbol).join(", ") });
        setWatchlist([]);
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      },
      onError: (err) => {
        toast({ title: "Failed to start bots", description: String(err), variant: "destructive" });
      },
    },
  });

  const stopBot = useStopBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot stopped successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      },
      onError: (err) => {
        toast({ title: "Failed to stop bot", description: String(err), variant: "destructive" });
      },
    },
  });

  const addSymbol = () => {
    const syms = symbolInput
      .toUpperCase()
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const toAdd = syms.filter((s) => !watchlist.includes(s));
    if (toAdd.length > 0) setWatchlist((prev) => [...prev, ...toAdd]);
    setSymbolInput("");
  };

  const removeSymbol = (sym: string) => setWatchlist((prev) => prev.filter((s) => s !== sym));

  const handleStart = () => {
    // Flush any pending input first
    const inputSyms = symbolInput
      .toUpperCase()
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const combined = [...new Set([...watchlist, ...inputSyms])];
    if (combined.length === 0) {
      toast({ title: "Symbol required", description: "Add at least one symbol to the watchlist", variant: "destructive" });
      return;
    }
    startBots.mutate({ data: { symbols: combined } });
    setWatchlist([]);
    setSymbolInput("");
  };

  const handleStop = () => stopBot.mutate();

  const isRunning = botStatus?.running;

  const activeBots = swarmBots.filter((b) => b.phase !== "closed");

  const swarmTotalPnl = activeBots.reduce((s, b) => s + b.stats.totalPnl, 0);
  const swarmTotalTrades = activeBots.reduce((s, b) => s + b.stats.totalTrades, 0);
  const swarmWins = activeBots.reduce((s, b) => s + b.stats.wins, 0);
  const swarmWinRate = swarmTotalTrades > 0 ? swarmWins / swarmTotalTrades : null;

  const hasSwarm = activeBots.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

        <div className="flex items-center gap-3 bg-card border border-border p-2 rounded-lg">
          <div
            className={`w-3 h-3 rounded-full ${
              isRunning || hasSwarm ? "bg-success animate-pulse" : "bg-muted-foreground"
            }`}
          />
          <span className="text-sm font-mono tracking-wider font-semibold">
            {isRunning
              ? `LEGACY: ${botStatus?.symbol} | ${botStatus?.phase?.toUpperCase()}`
              : hasSwarm
              ? `SWARM: ${activeBots.length} BOT${activeBots.length !== 1 ? "S" : ""} ACTIVE`
              : "INACTIVE"}
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              Account Equity <Wallet className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAccount ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-mono font-bold">{formatMoney(account?.equity)}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">Cash: {formatMoney(account?.cash)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              {hasSwarm ? "Swarm P&L" : "Today's P&L"} <DollarSign className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasSwarm ? (
              <>
                <div
                  className={`text-2xl font-mono font-bold ${
                    swarmTotalPnl > 0 ? "text-success" : swarmTotalPnl < 0 ? "text-danger" : ""
                  }`}
                >
                  {swarmTotalPnl > 0 ? "+" : ""}
                  {formatMoney(swarmTotalPnl)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {activeBots.length} bots · {swarmTotalTrades} trades
                </div>
              </>
            ) : loadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div
                  className={`text-2xl font-mono font-bold ${
                    summary?.totalPnl && summary.totalPnl > 0
                      ? "text-success"
                      : summary?.totalPnl && summary.totalPnl < 0
                      ? "text-danger"
                      : ""
                  }`}
                >
                  {summary?.totalPnl && summary.totalPnl > 0 ? "+" : ""}
                  {formatMoney(summary?.totalPnl)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Trades: {summary?.totalTrades || 0}</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              Win Rate <Percent className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasSwarm ? (
              <>
                <div className="text-2xl font-mono font-bold">
                  {swarmWinRate != null ? `${(swarmWinRate * 100).toFixed(1)}%` : "---"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="text-success">{swarmWins} W</span> /{" "}
                  <span className="text-danger">{swarmTotalTrades - swarmWins} L</span>
                </div>
              </>
            ) : loadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-mono font-bold">
                  {summary?.winRate ? (summary.winRate * 100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="text-success">{summary?.wins || 0} W</span> /{" "}
                  <span className="text-danger">{summary?.losses || 0} L</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              {hasSwarm ? "Active Bots" : "Current Session"} <Activity className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasSwarm ? (
              <>
                <div className="text-2xl font-mono font-bold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {activeBots.length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {activeBots.filter((b) => b.phase === "in_trade").length} in trade
                </div>
              </>
            ) : loadingSession ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-mono font-bold">
                  {sessionState?.currentPrice ? sessionState.currentPrice.toFixed(2) : "---"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Price</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Swarm start panel */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Bot Control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isRunning ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="symbols">Watchlist (comma-separated)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="symbols"
                        placeholder="SPY, QQQ, AAPL"
                        className="font-mono uppercase"
                        value={symbolInput}
                        onChange={(e) => setSymbolInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addSymbol();
                          }
                        }}
                      />
                      <Button variant="outline" size="sm" onClick={addSymbol} className="flex-shrink-0">
                        Add
                      </Button>
                    </div>
                    {watchlist.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {watchlist.map((sym) => (
                          <SymbolChip key={sym} symbol={sym} onRemove={() => removeSymbol(sym)} />
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full bg-success hover:bg-success/90 text-white font-bold"
                    onClick={handleStart}
                    disabled={startBots.isPending}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {watchlist.length + (symbolInput.trim() ? 1 : 0) > 1
                      ? `START ALL (${watchlist.length + (symbolInput.trim() ? 1 : 0)})`
                      : "START BOT"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-md border border-border">
                    <div className="text-sm text-muted-foreground mb-1">Actively Trading</div>
                    <div className="text-2xl font-bold font-mono tracking-widest">{botStatus?.symbol}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline" className="font-mono bg-background">
                        {botStatus?.phase}
                      </Badge>
                      {sessionState?.currentPnl != null && (
                        <Badge
                          variant="outline"
                          className={`font-mono ${
                            sessionState.currentPnl > 0
                              ? "text-success border-success/20"
                              : sessionState.currentPnl < 0
                              ? "text-danger border-danger/20"
                              : ""
                          }`}
                        >
                          Open P&L: {formatMoney(sessionState.currentPnl)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full font-bold"
                    onClick={handleStop}
                    disabled={stopBot.isPending}
                  >
                    <Square className="mr-2 h-4 w-4" /> STOP BOT
                  </Button>
                </div>
              )}
              {botStatus?.error && (
                <div className="mt-4 p-3 bg-danger/10 border border-danger/20 rounded-md text-sm text-danger">
                  Error: {botStatus.error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Swarm summary (when bots are active) */}
          {hasSwarm && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" /> Active Swarm
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {activeBots.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold w-12">{b.symbol}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs font-mono px-1.5 py-0 ${
                          b.phase === "in_trade"
                            ? "text-success border-success/20"
                            : b.phase === "watching"
                            ? "text-primary border-primary/20"
                            : "text-muted-foreground"
                        }`}
                      >
                        {b.phase}
                      </Badge>
                    </div>
                    <div
                      className={`font-mono text-xs ${
                        b.stats.totalPnl > 0 ? "text-success" : b.stats.totalPnl < 0 ? "text-danger" : "text-muted-foreground"
                      }`}
                    >
                      {formatMoney(b.stats.totalPnl)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
              <CardTitle className="text-lg">Opening Range (ORB)</CardTitle>
              {sessionState?.phase && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {sessionState.phase.replace("_", " ").toUpperCase()}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {loadingSession ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : !sessionState?.symbol ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                  <RefreshCw className="h-8 w-8 mb-2 opacity-20" />
                  <p>Waiting for active session...</p>
                  {hasSwarm && (
                    <p className="text-xs mt-2">
                      {activeBots.length} swarm bot{activeBots.length !== 1 ? "s" : ""} running — view details on the Bot Swarm page.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-0">
                  <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                    <div className="p-4 text-center">
                      <div className="text-xs text-muted-foreground font-medium mb-1">ORB High</div>
                      <div className="text-xl font-mono text-success">
                        {sessionState?.orbHigh ? sessionState.orbHigh.toFixed(2) : "---"}
                      </div>
                    </div>
                    <div className="p-4 text-center">
                      <div className="text-xs text-muted-foreground font-medium mb-1">Current Price</div>
                      <div className="text-xl font-mono font-bold">
                        {sessionState?.currentPrice ? sessionState.currentPrice.toFixed(2) : "---"}
                      </div>
                    </div>
                    <div className="p-4 text-center">
                      <div className="text-xs text-muted-foreground font-medium mb-1">ORB Low</div>
                      <div className="text-xl font-mono text-danger">
                        {sessionState?.orbLow ? sessionState.orbLow.toFixed(2) : "---"}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">ORB Width</div>
                      <div className="font-mono text-sm">
                        {sessionState?.orbWidth ? sessionState.orbWidth.toFixed(4) : "---"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Vol Ratio</div>
                      <div
                        className={`font-mono text-sm ${
                          sessionState?.volumeRatio && sessionState.volumeRatio > 1.5 ? "text-success font-bold" : ""
                        }`}
                      >
                        {sessionState?.volumeRatio ? `${sessionState.volumeRatio.toFixed(2)}x` : "---"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Breakout</div>
                      <div className="font-mono text-sm flex items-center">
                        {sessionState?.breakoutDirection === "long" ? (
                          <span className="text-success flex items-center">
                            <TrendingUp className="h-3 w-3 mr-1" /> LONG
                          </span>
                        ) : sessionState?.breakoutDirection === "short" ? (
                          <span className="text-danger flex items-center">
                            <TrendingDown className="h-3 w-3 mr-1" /> SHORT
                          </span>
                        ) : (
                          "NONE"
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Target / Stop</div>
                      <div className="font-mono text-sm text-success">
                        {sessionState?.targetPrice ? sessionState.targetPrice.toFixed(2) : "---"}
                      </div>
                      <div className="font-mono text-sm text-danger">
                        {sessionState?.stopPrice ? sessionState.stopPrice.toFixed(2) : "---"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
