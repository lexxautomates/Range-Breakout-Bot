import { Router } from "express";
import { runScan, getLastScanResult } from "../lib/scanner.js";
import { runMorningScanAndStart } from "../lib/orchestrator.js";

const router = Router();

// GET /scanner/results — latest cached scan results
router.get("/scanner/results", (_req, res) => {
  const result = getLastScanResult();
  if (!result) {
    res.json({ scannedAt: null, candidates: [], topN: [] });
    return;
  }
  res.json(result);
});

// POST /scanner/run — trigger a manual scan
router.post("/scanner/run", async (req, res) => {
  const { symbols, topN, minGapPercent, minRelativeVolume } = req.body ?? {};
  try {
    const result = await runScan(
      Array.isArray(symbols) ? symbols : undefined,
      typeof topN === "number" ? topN : 10,
      typeof minGapPercent === "number" ? minGapPercent : 0.5,
      typeof minRelativeVolume === "number" ? minRelativeVolume : 1.0,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /scanner/auto-start — run scan and auto-start top N bots
router.post("/scanner/auto-start", async (_req, res) => {
  try {
    await runMorningScanAndStart();
    const result = getLastScanResult();
    res.json({ ok: true, scannedAt: result?.scannedAt, topN: result?.topN ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
