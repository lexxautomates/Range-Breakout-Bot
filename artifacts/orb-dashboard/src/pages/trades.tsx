import { useListTrades } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

function formatMoney(val: number | null | undefined) {
  if (val == null) return "---";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Trades() {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useListTrades(
    { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { query: { refetchInterval: 10000 } }
  );

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Trade History</h1>
        <div className="text-sm text-muted-foreground">{total} total trades</div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data?.trades.length ? (
            <div className="p-16 text-center text-muted-foreground">
              <p className="text-lg font-medium">No trades yet</p>
              <p className="text-sm mt-1">Start the bot and execute your first trade</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Symbol</th>
                    <th className="px-4 py-3 text-left">Direction</th>
                    <th className="px-4 py-3 text-right">Entry</th>
                    <th className="px-4 py-3 text-right">Exit</th>
                    <th className="px-4 py-3 text-right">Stop</th>
                    <th className="px-4 py-3 text-right">Target</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">P&L</th>
                    <th className="px-4 py-3 text-right">R</th>
                    <th className="px-4 py-3 text-left">Outcome</th>
                    <th className="px-4 py-3 text-left">Exit Reason</th>
                    <th className="px-4 py-3 text-left">Entry Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.trades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold">{trade.symbol}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs ${trade.direction === "long" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}`}
                        >
                          {trade.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{trade.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono">{trade.exitPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-400">{trade.stopPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-400">{trade.targetPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono">{trade.qty}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${trade.pnl > 0 ? "text-green-400" : trade.pnl < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {trade.pnl > 0 ? "+" : ""}{formatMoney(trade.pnl)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${trade.rMultiple > 0 ? "text-green-400" : "text-red-400"}`}>
                        {trade.rMultiple > 0 ? "+" : ""}{trade.rMultiple.toFixed(2)}R
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs ${trade.outcome === "win" ? "text-green-400 border-green-400/30 bg-green-400/10" : trade.outcome === "loss" ? "text-red-400 border-red-400/30 bg-red-400/10" : "text-muted-foreground"}`}
                        >
                          {trade.outcome.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {(trade.exitReason ?? "---").replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(trade.entryTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
