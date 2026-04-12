import { useGetTradeStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatMoney(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">{label}</div>
        <div className={`text-2xl font-mono font-bold ${color ?? ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function Stats() {
  const { data: stats, isLoading } = useGetTradeStats({ query: { refetchInterval: 15000 } });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Performance Stats</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Performance Stats</h1>
        <div className="p-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">No trades recorded yet</p>
          <p className="text-sm mt-1">Stats will appear after your first completed trade</p>
        </div>
      </div>
    );
  }

  const winRatePct = (stats.winRate * 100).toFixed(1);
  const pnlColor = stats.totalPnl > 0 ? "text-green-400" : stats.totalPnl < 0 ? "text-red-400" : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Performance Stats</h1>
        <div className="text-sm text-muted-foreground">{stats.totalTrades} trades</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total P&L"
          value={formatMoney(stats.totalPnl)}
          color={pnlColor}
          sub={`Avg ${formatMoney(stats.avgPnlPerTrade)} / trade`}
        />
        <StatCard
          label="Win Rate"
          value={`${winRatePct}%`}
          sub={`${stats.wins} W / ${stats.losses} L`}
          color={stats.winRate >= 0.5 ? "text-green-400" : "text-red-400"}
        />
        <StatCard
          label="Avg R-Multiple"
          value={`${stats.avgRMultiple > 0 ? "+" : ""}${stats.avgRMultiple.toFixed(2)}R`}
          color={stats.avgRMultiple > 0 ? "text-green-400" : "text-red-400"}
          sub="Average risk-reward achieved"
        />
        <StatCard
          label="Profit Factor"
          value={stats.profitFactor.toFixed(2)}
          sub="Gross wins / Gross losses"
          color={stats.profitFactor >= 1 ? "text-green-400" : "text-red-400"}
        />
        <StatCard
          label="Best Trade"
          value={formatMoney(stats.bestTrade)}
          color="text-green-400"
        />
        <StatCard
          label="Worst Trade"
          value={formatMoney(stats.worstTrade)}
          color="text-red-400"
        />
        <StatCard
          label="Avg Win"
          value={formatMoney(stats.avgWin)}
          color="text-green-400"
        />
        <StatCard
          label="Avg Loss"
          value={formatMoney(stats.avgLoss)}
          color="text-red-400"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Win / Loss Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="text-xs text-muted-foreground w-10">Wins</div>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${stats.winRate * 100}%` }}
                  />
                </div>
                <div className="text-sm font-mono text-green-400 w-12 text-right">{stats.wins}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-muted-foreground w-10">Losses</div>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${(1 - stats.winRate) * 100}%` }}
                  />
                </div>
                <div className="text-sm font-mono text-red-400 w-12 text-right">{stats.losses}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Edge Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-sm text-muted-foreground">Expectancy</span>
              <span className={`font-mono font-bold ${stats.avgPnlPerTrade > 0 ? "text-green-400" : "text-red-400"}`}>
                {formatMoney(stats.avgPnlPerTrade)} / trade
              </span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-sm text-muted-foreground">Profit Factor</span>
              <span className={`font-mono font-bold ${stats.profitFactor >= 1.5 ? "text-green-400" : stats.profitFactor >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                {stats.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Win/Loss Ratio</span>
              <span className="font-mono font-bold">
                {stats.avgLoss !== 0 ? Math.abs(stats.avgWin / stats.avgLoss).toFixed(2) : "---"}:1
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
