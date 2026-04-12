import { useGetBotStatus, useStartBot, useStopBot, useGetCurrentSession, useGetSessionSummary, useGetAccount } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, Activity, DollarSign, Wallet, Percent, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [symbolInput, setSymbolInput] = useState("");

  const { data: botStatus, isLoading: loadingStatus } = useGetBotStatus({ query: { refetchInterval: 5000 } });
  const { data: sessionState, isLoading: loadingSession } = useGetCurrentSession({ query: { refetchInterval: 5000 } });
  const { data: summary, isLoading: loadingSummary } = useGetSessionSummary({ query: { refetchInterval: 5000 } });
  const { data: account, isLoading: loadingAccount } = useGetAccount({ query: { refetchInterval: 10000 } });

  const startBot = useStartBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot started successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/session/current"] });
      },
      onError: (err) => {
        toast({ title: "Failed to start bot", description: String(err), variant: "destructive" });
      }
    }
  });

  const stopBot = useStopBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot stopped successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/session/current"] });
      },
      onError: (err) => {
        toast({ title: "Failed to stop bot", description: String(err), variant: "destructive" });
      }
    }
  });

  const handleStart = () => {
    if (!symbolInput) {
      toast({ title: "Symbol required", description: "Please enter a symbol to trade", variant: "destructive" });
      return;
    }
    startBot.mutate({ data: { symbol: symbolInput.toUpperCase() } });
  };

  const handleStop = () => {
    stopBot.mutate();
  };

  const formatMoney = (val: number | undefined | null) => {
    if (val == null) return "---";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  const isRunning = botStatus?.running;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        
        <div className="flex items-center gap-3 bg-card border border-border p-2 rounded-lg">
          <div className={`w-3 h-3 rounded-full ${isRunning ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
          <span className="text-sm font-mono tracking-wider font-semibold">
            {isRunning ? `ACTIVE: ${botStatus?.symbol} | ${botStatus?.phase.toUpperCase()}` : "INACTIVE"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              Account Equity <Wallet className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAccount ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-mono font-bold">{formatMoney(account?.equity)}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">Cash: {formatMoney(account?.cash)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              Today's P&L <DollarSign className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className={`text-2xl font-mono font-bold ${summary?.totalPnl && summary.totalPnl > 0 ? 'text-success' : summary?.totalPnl && summary.totalPnl < 0 ? 'text-danger' : ''}`}>
                {summary?.totalPnl && summary.totalPnl > 0 ? "+" : ""}{formatMoney(summary?.totalPnl)}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">Trades: {summary?.totalTrades || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              Win Rate <Percent className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-mono font-bold">
                {summary?.winRate ? (summary.winRate * 100).toFixed(1) : 0}%
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1 text-success">{summary?.wins || 0} W / <span className="text-danger">{summary?.losses || 0} L</span></div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center justify-between">
              Current Session <Activity className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSession ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-mono font-bold">
                {sessionState?.currentPrice ? sessionState.currentPrice.toFixed(2) : "---"}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">Price</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Bot Control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isRunning ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="symbol">Symbol to Trade</Label>
                    <Input 
                      id="symbol" 
                      placeholder="e.g. SPY, QQQ, AAPL" 
                      className="font-mono uppercase"
                      value={symbolInput}
                      onChange={(e) => setSymbolInput(e.target.value)}
                    />
                  </div>
                  <Button 
                    className="w-full bg-success hover:bg-success/90 text-white font-bold" 
                    onClick={handleStart}
                    disabled={startBot.isPending}
                  >
                    <Play className="mr-2 h-4 w-4" /> START BOT
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-md border border-border">
                    <div className="text-sm text-muted-foreground mb-1">Actively Trading</div>
                    <div className="text-2xl font-bold font-mono tracking-widest">{botStatus?.symbol}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline" className="font-mono bg-background">{botStatus?.phase}</Badge>
                      {sessionState?.currentPnl !== null && sessionState?.currentPnl !== undefined && (
                        <Badge variant="outline" className={`font-mono ${sessionState.currentPnl > 0 ? 'text-success border-success/20' : sessionState.currentPnl < 0 ? 'text-danger border-danger/20' : ''}`}>
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
        </div>

        <div className="lg:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
              <CardTitle className="text-lg">Opening Range (ORB)</CardTitle>
              {sessionState?.phase && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {sessionState.phase.replace('_', ' ').toUpperCase()}
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
                </div>
              ) : (
                <div className="p-0">
                  <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                    <div className="p-4 text-center">
                      <div className="text-xs text-muted-foreground font-medium mb-1">ORB High</div>
                      <div className="text-xl font-mono text-success">{sessionState?.orbHigh ? sessionState.orbHigh.toFixed(2) : "---"}</div>
                    </div>
                    <div className="p-4 text-center">
                      <div className="text-xs text-muted-foreground font-medium mb-1">Current Price</div>
                      <div className="text-xl font-mono font-bold">{sessionState?.currentPrice ? sessionState.currentPrice.toFixed(2) : "---"}</div>
                    </div>
                    <div className="p-4 text-center">
                      <div className="text-xs text-muted-foreground font-medium mb-1">ORB Low</div>
                      <div className="text-xl font-mono text-danger">{sessionState?.orbLow ? sessionState.orbLow.toFixed(2) : "---"}</div>
                    </div>
                  </div>
                  
                  <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">ORB Width</div>
                      <div className="font-mono text-sm">{sessionState?.orbWidth ? sessionState.orbWidth.toFixed(4) : "---"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Vol Ratio</div>
                      <div className={`font-mono text-sm ${sessionState?.volumeRatio && sessionState.volumeRatio > 1.5 ? 'text-success font-bold' : ''}`}>
                        {sessionState?.volumeRatio ? `${sessionState.volumeRatio.toFixed(2)}x` : "---"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Breakout</div>
                      <div className="font-mono text-sm flex items-center">
                        {sessionState?.breakoutDirection === 'long' ? <span className="text-success flex items-center"><TrendingUp className="h-3 w-3 mr-1"/> LONG</span> : 
                         sessionState?.breakoutDirection === 'short' ? <span className="text-danger flex items-center"><TrendingDown className="h-3 w-3 mr-1"/> SHORT</span> : 
                         "NONE"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Target / Stop</div>
                      <div className="font-mono text-sm text-success">{sessionState?.targetPrice ? sessionState.targetPrice.toFixed(2) : "---"}</div>
                      <div className="font-mono text-sm text-danger">{sessionState?.stopPrice ? sessionState.stopPrice.toFixed(2) : "---"}</div>
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
