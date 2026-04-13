import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink, Search, TrendingUp, RefreshCw } from "lucide-react";

interface NewsItem {
  title: string;
  url: string;
  author?: string;
  score?: number;
  comments?: number;
  rank?: number;
  source: string;
  fetchedAt: string;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
        <TrendingUp className="h-4 w-4 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-2 flex items-start gap-1"
        >
          {item.title}
          <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5 opacity-60" />
        </a>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {item.score !== undefined && (
            <span className="text-orange-400 font-mono font-medium">▲ {item.score}</span>
          )}
          {item.comments !== undefined && (
            <span>{item.comments} comments</span>
          )}
          {item.author && <span>by {item.author}</span>}
          <Badge variant="outline" className="text-[10px] py-0 h-4">
            {item.source}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default function News() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [symbolInput, setSymbolInput] = useState("");
  const [committedSymbols, setCommittedSymbols] = useState("");

  const topNewsQuery = useQuery({
    queryKey: ["news", "hackernews-top"],
    queryFn: () =>
      fetchJson<{ items: NewsItem[]; count: number }>("/news/hackernews/top?limit=20"),
    refetchInterval: 5 * 60 * 1000,
  });

  const marketNewsQuery = useQuery({
    queryKey: ["news", "market", committedSymbols],
    queryFn: () => {
      const params = committedSymbols
        ? `?symbols=${encodeURIComponent(committedSymbols)}`
        : "";
      return fetchJson<{ items: NewsItem[]; count: number }>(`/news/market${params}`);
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const searchResultQuery = useQuery({
    queryKey: ["news", "search", activeSearch],
    queryFn: () =>
      activeSearch
        ? fetchJson<{ items: NewsItem[]; count: number }>(
            `/news/search?q=${encodeURIComponent(activeSearch)}&limit=15`
          )
        : Promise.resolve({ items: [], count: 0 }),
    enabled: !!activeSearch,
  });

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q) setActiveSearch(q);
  };

  const handleSymbolRefresh = () => {
    setCommittedSymbols(symbolInput);
    marketNewsQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Market News</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Real-time news and discussions from financial communities, powered by AutoCLI
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search news (e.g. 'AAPL earnings', 'Fed rate hike')..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-md"
        />
        <Button onClick={handleSearch} disabled={!searchQuery.trim()}>
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
        {activeSearch && (
          <Button
            variant="outline"
            onClick={() => {
              setActiveSearch("");
              setSearchQuery("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {activeSearch && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Search: &ldquo;{activeSearch}&rdquo;
              {searchResultQuery.isFetching && (
                <RefreshCw className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {searchResultQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
                ))}
              </div>
            ) : searchResultQuery.data?.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">No results found.</p>
            ) : (
              <div>
                {searchResultQuery.data?.items.map((item, i) => (
                  <NewsCard key={`${item.url}-${i}`} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              HackerNews Top Stories
              {topNewsQuery.isFetching && (
                <RefreshCw className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 ml-auto"
                onClick={() => topNewsQuery.refetch()}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topNewsQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
                ))}
              </div>
            ) : topNewsQuery.isError ? (
              <p className="text-destructive text-sm">Failed to load news.</p>
            ) : (
              <div>
                {topNewsQuery.data?.items.map((item, i) => (
                  <NewsCard key={`${item.url}-${i}`} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-blue-500" />
              Market Discussion
              {marketNewsQuery.isFetching && (
                <RefreshCw className="h-3 w-3 animate-spin ml-1 text-muted-foreground" />
              )}
            </CardTitle>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Filter by symbols (e.g. AAPL,TSLA)..."
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleSymbolRefresh()}
                className="text-xs h-8"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleSymbolRefresh}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {marketNewsQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
                ))}
              </div>
            ) : marketNewsQuery.isError ? (
              <p className="text-destructive text-sm">Failed to load market news.</p>
            ) : marketNewsQuery.data?.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">No market news found.</p>
            ) : (
              <div>
                {marketNewsQuery.data?.items.map((item, i) => (
                  <NewsCard key={`${item.url}-${i}`} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
