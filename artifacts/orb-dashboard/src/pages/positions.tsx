import { useGetPositions, useGetAccount } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function formatMoney(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

export default function Positions() {
  const { data: positions, isLoading: loadingPositions } = useGetPositions({ query: { refetchInterval: 10000 } });
  const { data: account, isLoading: loadingAccount } = useGetAccount({ query: { refetchInterval: 10000 } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Open Positions</h1>
        <div className="text-xs text-muted-foreground">Live from Alpaca</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loadingAccount ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Equity</div>
                <div className="text-xl font-mono font-bold">{formatMoney(account?.equity ?? 0)}</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Cash</div>
                <div className="text-xl font-mono font-bold">{formatMoney(account?.cash ?? 0)}</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Buying Power</div>
                <div className="text-xl font-mono font-bold">{formatMoney(account?.buyingPower ?? 0)}</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Day Trades</div>
                <div className="text-xl font-mono font-bold">{account?.daytradeCount ?? 0}</div>
                {account?.patternDayTrader && (
                  <div className="text-xs text-yellow-400 mt-1">PDT Flag</div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
            Positions {positions && `(${positions.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingPositions ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !positions?.length ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="text-base font-medium">No open positions</p>
              <p className="text-sm mt-1 text-muted-foreground">All flat</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Symbol</th>
                    <th className="px-4 py-3 text-left">Side</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Entry</th>
                    <th className="px-4 py-3 text-right">Current</th>
                    <th className="px-4 py-3 text-right">Market Value</th>
                    <th className="px-4 py-3 text-right">Unr. P&L</th>
                    <th className="px-4 py-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {positions.map((pos) => (
                    <tr key={pos.symbol} className="hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold">{pos.symbol}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs ${pos.side === "long" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}`}
                        >
                          {pos.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{pos.qty}</td>
                      <td className="px-4 py-3 text-right font-mono">{pos.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono">{pos.currentPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(pos.marketValue)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${pos.unrealizedPnl > 0 ? "text-green-400" : pos.unrealizedPnl < 0 ? "text-red-400" : ""}`}>
                        {pos.unrealizedPnl > 0 ? "+" : ""}{formatMoney(pos.unrealizedPnl)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${pos.unrealizedPnlPercent > 0 ? "text-green-400" : pos.unrealizedPnlPercent < 0 ? "text-red-400" : ""}`}>
                        {pos.unrealizedPnlPercent > 0 ? "+" : ""}{pos.unrealizedPnlPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
