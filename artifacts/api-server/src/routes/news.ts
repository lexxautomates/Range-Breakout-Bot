import { Router } from "express";
import { getCachedMarketNews, searchHackerNews, fetchHackerNewsTop } from "../lib/autoCli.js";

const router = Router();

router.get("/news/market", async (req, res) => {
  const symbols = req.query.symbols
    ? String(req.query.symbols).split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  try {
    const items = await getCachedMarketNews(symbols);
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/news/hackernews/top", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 30);
  try {
    const items = await fetchHackerNewsTop(limit);
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/news/search", async (req, res) => {
  const query = String(req.query.q ?? "");
  if (!query) {
    res.status(400).json({ error: "Missing query parameter 'q'" });
    return;
  }
  const limit = Math.min(Number(req.query.limit ?? 10), 30);
  try {
    const items = await searchHackerNews(query, limit);
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
