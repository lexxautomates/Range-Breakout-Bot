import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

const AUTOCLI_BIN = "/home/runner/bin/autocli";

export interface NewsItem {
  title: string;
  url: string;
  author?: string;
  score?: number;
  comments?: number;
  rank?: number;
  source: string;
  fetchedAt: string;
}

async function runAutoCli(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync(AUTOCLI_BIN, [...args, "--format", "json"], {
    timeout: 20000,
    env: {
      ...process.env,
      PATH: `/home/runner/bin:${process.env.PATH ?? ""}`,
    },
  });
  return JSON.parse(stdout);
}

export async function fetchHackerNewsTop(limit = 10): Promise<NewsItem[]> {
  const raw = (await runAutoCli(["hackernews", "top", "--limit", String(limit)])) as Array<{
    title?: string;
    url?: string;
    author?: string;
    score?: number;
    comments?: number;
    rank?: number;
  }>;
  return raw.map((item) => ({
    title: item.title ?? "",
    url: item.url ?? "",
    author: item.author,
    score: item.score,
    comments: item.comments,
    rank: item.rank,
    source: "hackernews",
    fetchedAt: new Date().toISOString(),
  }));
}

export async function searchHackerNews(query: string, limit = 10): Promise<NewsItem[]> {
  const raw = (await runAutoCli(["hackernews", "search", query, "--limit", String(limit)])) as Array<{
    title?: string;
    url?: string;
    author?: string;
    score?: number;
    comments?: number;
    rank?: number;
  }>;
  return raw.map((item) => ({
    title: item.title ?? "",
    url: item.url ?? "",
    author: item.author,
    score: item.score,
    comments: item.comments,
    rank: item.rank,
    source: "hackernews",
    fetchedAt: new Date().toISOString(),
  }));
}

export async function fetchMarketNews(symbols: string[] = []): Promise<NewsItem[]> {
  const results: NewsItem[] = [];

  const queries = symbols.length > 0
    ? symbols.map((s) => `${s} stock`)
    : ["stock market trading", "S&P 500", "nasdaq"];

  const searches = await Promise.allSettled(
    queries.map((q) => searchHackerNews(q, 5))
  );

  for (const result of searches) {
    if (result.status === "fulfilled") {
      results.push(...result.value);
    }
  }

  const seen = new Set<string>();
  return results.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 20);
}

let newsCache: { items: NewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCachedMarketNews(symbols: string[] = []): Promise<NewsItem[]> {
  if (newsCache && Date.now() - newsCache.fetchedAt < CACHE_TTL_MS) {
    return newsCache.items;
  }
  try {
    const items = await fetchMarketNews(symbols);
    newsCache = { items, fetchedAt: Date.now() };
    return items;
  } catch (err) {
    console.error("[AutoCLI] Failed to fetch market news:", err);
    return newsCache?.items ?? [];
  }
}
