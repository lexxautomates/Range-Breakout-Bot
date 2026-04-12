import { Router } from "express";
import { z } from "zod/v4";
import { botState } from "../lib/botState.js";
import { startBot, stopBot } from "../lib/botEngine.js";
import {
  StartBotBody,
  GetBotStatusResponse,
  StartBotResponse,
  StopBotResponse,
} from "@workspace/api-zod";

const router = Router();

router.get("/bot/status", (req, res) => {
  const resp: z.infer<typeof GetBotStatusResponse> = {
    running: botState.running,
    symbol: botState.symbol,
    phase: botState.phase as any,
    startedAt: botState.startedAt,
    stoppedAt: botState.stoppedAt,
    lastUpdated: botState.lastUpdated,
    error: botState.error,
  };
  res.json(resp);
});

router.post("/bot/start", async (req, res) => {
  const parsed = StartBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  if (botState.running) {
    res.status(409).json({ error: "Bot is already running" });
    return;
  }
  await startBot(parsed.data.symbol);
  const resp: z.infer<typeof StartBotResponse> = {
    running: botState.running,
    symbol: botState.symbol,
    phase: botState.phase as any,
    startedAt: botState.startedAt,
    stoppedAt: botState.stoppedAt,
    lastUpdated: botState.lastUpdated,
    error: botState.error,
  };
  res.json(resp);
});

router.post("/bot/stop", async (_req, res) => {
  await stopBot();
  const resp: z.infer<typeof StopBotResponse> = {
    running: botState.running,
    symbol: botState.symbol,
    phase: botState.phase as any,
    startedAt: botState.startedAt,
    stoppedAt: botState.stoppedAt,
    lastUpdated: botState.lastUpdated,
    error: botState.error,
  };
  res.json(resp);
});

export default router;
