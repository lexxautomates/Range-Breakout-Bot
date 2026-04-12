import {
  useGetScanResults,
  useRunScan,
  useStartBots,
  useGetConfig,
} from "@workspace/api-client-react";
import type { ScanCandidate } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ScanLine,
  TrendingUp,
  TrendingDown,
  Zap,
  Play,
  RefreshCw,
  Star,
} from "lucide-react";

function GapBadge({ pct }: { pct: number }) {
  const abs = Math.abs(pct).toFixed(2);
  if (pct >= 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-success text-xs font-mono font-semibold">
        <TrendingUp className="h-3 w-3" />+{abs}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-danger text-xs font-mono font-semibold">
      <TrendingDown className="h-3 w-3" />{pct.toFixed(2)}%
    </span>
  );
}

function RankBadge({ rank }: { rank?: number }) {
  if (!rank) return null;
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-mono font-bold">
      {rank}
    </span>
  );
}

function CandidateRow({
  c,
  onLaunch,
  launching,
}: {
  c: ScanCandidate;
  onLaunch: (sym: string) => void;
  launching: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border ${
        c.recommended ? "border-success/20 bg-success/5" : "border-border bg-muted/20"
      }`}
    >
      <div className="w-20 flex-shrink-0 flex items-center gap-1.5">
        <RankBadge rank={c.rank} />
        <div>
          <div className="font-mono font-bold text-sm">{c.symbol}</div>
          {c.recommended && (
            <div className="flex items-center gap-0.5 text-xs text-yellow-400">
              <Star className="h-2.5 w-2.5" /> top pick
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Gap</div>
          <GapBadge pct={c.gapPercent} />
        </div>
        <div>
          <div className="text-muted-foreground">Price</div>
          <div className="font-mono">${c.currentPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Rel Vol</div>
          <div className={`font-mono ${c.relativeVolume >= 2 ? "text-success font-semibold" : ""}`}>
            {c.relativeVolume.toFixed(2)}x
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Prev Close</div>
          <div className="font-mono">${c.prevClose.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Score</div>
          <div className="font-mono text-primary">{c.score?.toFixed(2) ?? "---"}</div>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="flex-shrink-0 h-7 px-2 text-xs text-success border-success/30 hover:bg-success/10"
        onClick={() => onLaunch(c.symbol)}
        disabled={launching}
      >
        <Play className="h-3 w-3 mr-1" /> Launch
      </Button>
    </div>
  );
}

export default function Scanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scanData, isLoading: loadingScan } = useGetScanResults({
    query: { refetchInterval: 30000 },
  });

  const { data: config } = useGetConfig({ query: { refetchInterval: false } });
  const autoStartTopN = config?.autoStartTopN ?? 3;

  const runScan = useRunScan({
    mutation: {
      onSuccess: () => {
        toast({ title: "Scan complete" });
        queryClient.invalidateQueries({ queryKey: ["/api/scanner/results"] });
      },
      onError: (err) => toast({ title: "Scan failed", description: String(err), variant: "destructive" }),
    },
  });

  const startBots = useStartBots({
    mutation: {
      onSuccess: (result) => {
        const count = result.started?.length ?? 0;
        const syms = result.started?.map((b) => b.symbol).join(", ");
        toast({ title: `${count} bot${count !== 1 ? "s" : ""} started`, description: syms });
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
        queryClient.invalidateQueries({ queryKey: ["/api/scanner/results"] });
      },
      onError: (err) => toast({ title: "Failed to start bots", description: String(err), variant: "destructive" }),
    },
  });

  const handleLaunch = (symbol: string) => {
    startBots.mutate({ data: { symbols: [symbol] } });
  };

  const candidates = scanData?.candidates ?? [];
  const topN = scanData?.topN ?? [];
  const scannedAt = scanData?.scannedAt;

  const topNSymbols = topN.map((c) => c.symbol);
  const startTopN = () => {
    if (topNSymbols.length === 0) {
      toast({ title: "No top picks", description: "Run a scan first", variant: "destructive" });
      return;
    }
    startBots.mutate({ data: { symbols: topNSymbols } });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Gap Scanner</h1>
        <div className="flex items-center gap-2">
          {scannedAt && (
            <span className="text-xs text-muted-foreground font-mono">
              Last scan: {new Date(scannedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => runScan.mutate({ data: {} })}
            disabled={runScan.isPending}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${runScan.isPending ? "animate-spin" : ""}`} />
            Scan Now
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={startTopN}
            disabled={startBots.isPending || topN.length === 0}
            title={`Launch bots for the top ${autoStartTopN} ranked candidates from the current scan`}
          >
            <Zap className="h-3 w-3 mr-1" />
            Start Top {topN.length > 0 ? topN.length : autoStartTopN}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Symbols Scanned</div>
            <div className="text-2xl font-mono font-bold">{candidates.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Top Picks</div>
            <div className="text-2xl font-mono font-bold text-yellow-400">{topN.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Gap Up</div>
            <div className="text-2xl font-mono font-bold text-success">
              {candidates.filter((c) => c.gapDirection === "up").length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Gap Down</div>
            <div className="text-2xl font-mono font-bold text-danger">
              {candidates.filter((c) => c.gapDirection === "down").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {topN.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" /> Top Candidates
              <Badge variant="outline" className="ml-1 text-xs">{topN.length}</Badge>
            </CardTitle>
            <Button
              size="sm"
              className="bg-success hover:bg-success/90 text-white text-xs font-bold h-7 px-3"
              onClick={startTopN}
              disabled={startBots.isPending}
            >
              <Zap className="h-3 w-3 mr-1" /> Start All Top {topN.length}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {topN.map((c) => (
              <CandidateRow
                key={c.symbol}
                c={c}
                onLaunch={handleLaunch}
                launching={startBots.isPending}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {loadingScan ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : candidates.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
          <ScanLine className="h-10 w-10 opacity-20" />
          <p className="text-sm">No scan results yet. Click "Scan Now" to search for gap candidates.</p>
          <p className="text-xs text-muted-foreground">
            The scanner automatically runs at 9:25 AM ET each trading day.
          </p>
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All Candidates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {candidates.map((c) => (
              <CandidateRow
                key={c.symbol}
                c={c}
                onLaunch={handleLaunch}
                launching={startBots.isPending}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
