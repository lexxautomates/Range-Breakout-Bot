import { Router } from "express";
import { runScan, getLastScanResult } from "../lib/scanner.js";
import { runMorningScanAndStart, forceAutoStartFromScan } from "../lib/orchestrator.js";

const router = Router();

// GET /scanner/results — latest cached scan results (full object)
router.get("/scanner/results", (_req, res) => {
  const result = getLastScanResult();
  if (!result) {
    res.json({ scannedAt: null, candidates: [], topN: [] });
    return;
  }
  res.json(result);
});

// GET /scanner/candidates — flat candidates list with rank + isTopN markers
router.get("/scanner/candidates", (_req, res) => {
  const result = getLastScanResult();
  res.json(result?.candidates ?? []);
});

// POST /scanner/run — trigger a manual scan
router.post("/scanner/run", async (req, res) => {
  const { symbols, topN, minGapPercent, minRelativeVolume } = req.body ?? {};
  try {
    const result = await runScan(
      Array.isArray(symbols) ? symbols : undefined,
      typeof topN === "number" ? topN : 10,
      typeof minGapPercent === "number" ? minGapPercent : 0.5,
      typeof minRelativeVolume === "number" ? minRelativeVolume : 0.0,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /scanner/auto-start — run scan and auto-start top N bots
// Respects guard: only starts if no bots are currently running and autoStartTopN > 0
// Pass { force: true } to stop existing bots and force restart from scan
router.post("/scanner/auto-start", async (req, res) => {
  const force = req.body?.force === true;
  try {
    if (force) {
      await forceAutoStartFromScan();
    } else {
      await runMorningScanAndStart();
    }
    const result = getLastScanResult();
    res.json({ ok: true, scannedAt: result?.scannedAt, topN: result?.topN ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
