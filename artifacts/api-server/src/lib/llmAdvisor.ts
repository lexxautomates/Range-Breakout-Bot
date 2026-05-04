import { logger } from "./logger.js";

export type LlmProvider = "none" | "claude" | "openrouter" | "ollama";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  // If set, advice must meet or exceed this confidence to approve.
  confidenceThreshold?: number;
}

export interface TradeContext {
  symbol: string;
  direction: "long" | "short";
  price: number;
  orbHigh: number;
  orbLow: number;
  orbWidthPct: number;
  volumeRatio: number | null;
  rewardRiskRatio: number;
  stopPrice: number;
  targetPrice: number;
  riskPerShare: number;
  riskDollars: number;
  generation: number;
  recentRMultiples: number[];
}

export interface LlmAdvice {
  approved: boolean;
  confidence: number;
  reasoning: string;
}

function buildPrompt(ctx: TradeContext): string {
  const recentR =
    ctx.recentRMultiples.length > 0
      ? ctx.recentRMultiples
          .slice(-5)
          .map((r) => r.toFixed(2))
          .join(", ")
      : "no recent trades";

  return `You are an expert quantitative trader advising on an Opening Range Breakout (ORB) trade.

SETUP:
- Symbol: ${ctx.symbol}
- Direction: ${ctx.direction.toUpperCase()}
- Current Price: $${ctx.price.toFixed(2)}
- ORB High: $${ctx.orbHigh.toFixed(2)}
- ORB Low: $${ctx.orbLow.toFixed(2)}
- ORB Width: ${ctx.orbWidthPct.toFixed(2)}%
- Volume Ratio: ${ctx.volumeRatio != null ? ctx.volumeRatio.toFixed(2) + "x" : "N/A"}
- Entry Price: $${ctx.price.toFixed(2)}
- Stop Price: $${ctx.stopPrice.toFixed(2)}
- Target Price: $${ctx.targetPrice.toFixed(2)}
- Reward:Risk Ratio: ${ctx.rewardRiskRatio.toFixed(1)}R
- Risk Per Share: $${ctx.riskPerShare.toFixed(2)}
- Dollar Risk: $${ctx.riskDollars.toFixed(2)}
- Bot Generation: ${ctx.generation}
- Recent R-Multiples: ${recentR}

TASK: Evaluate this trade setup. Consider:
1. Is the breakout clean (price clearly outside the range)?
2. Is volume confirming the move?
3. Is the risk/reward acceptable?
4. Are the recent R-multiples improving (evolution working)?

Respond in this exact JSON format with no other text:
{
  "approved": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "one concise sentence"
}`;
}

function normalizeAdvice(raw: unknown): LlmAdvice {
  const obj = raw as Partial<LlmAdvice>;
  const approved = Boolean(obj?.approved);
  const confidence = Math.max(0, Math.min(1, Number(obj?.confidence) || 0));
  const reasoning = String(obj?.reasoning || "").trim();
  return { approved, confidence, reasoning };
}

async function callClaude(prompt: string, cfg: LlmConfig): Promise<LlmAdvice> {
  const model = cfg.model || "claude-3-5-haiku-20241022";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      temperature: cfg.temperature ?? 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude API error ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { content: Array<{ text: string }> };
  const text = data.content[0]?.text ?? "{}";
  return normalizeAdvice(JSON.parse(text));
}

async function callOpenRouter(prompt: string, cfg: LlmConfig): Promise<LlmAdvice> {
  const model = cfg.model || "nousresearch/hermes-3-llama-3.1-70b";
  const baseUrl = cfg.baseUrl || "https://openrouter.ai/api/v1";
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: cfg.temperature ?? 0.2,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`OpenRouter error ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
  const text = data.choices[0]?.message.content ?? "{}";
  return normalizeAdvice(JSON.parse(text));
}

async function callOllama(prompt: string, cfg: LlmConfig): Promise<LlmAdvice> {
  const model = cfg.model || "hermes3";
  const baseUrl = cfg.baseUrl || "http://localhost:11434";
  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: cfg.temperature ?? 0.2 },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama error ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { response: string };
  const raw = data.response ?? "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in Ollama response: ${raw}`);
  return normalizeAdvice(JSON.parse(jsonMatch[0]));
}

export async function askLlmAdvisor(ctx: TradeContext, cfg: LlmConfig): Promise<LlmAdvice> {
  const threshold = cfg.confidenceThreshold ?? 0.6;

  if (cfg.provider === "none") {
    return { approved: true, confidence: 1.0, reasoning: "AI advisor disabled — auto-approve" };
  }

  const prompt = buildPrompt(ctx);

  try {
    let advice: LlmAdvice;
    if (cfg.provider === "claude") {
      advice = await callClaude(prompt, cfg);
    } else if (cfg.provider === "openrouter") {
      advice = await callOpenRouter(prompt, cfg);
    } else if (cfg.provider === "ollama") {
      advice = await callOllama(prompt, cfg);
    } else {
      return { approved: false, confidence: 0, reasoning: "Unknown provider — reject" };
    }

    // Enforce confidence threshold
    if (advice.confidence < threshold) {
      advice = {
        approved: false,
        confidence: advice.confidence,
        reasoning: advice.reasoning || `Confidence ${advice.confidence.toFixed(2)} < ${threshold.toFixed(2)}`,
      };
    }

    logger.info(
      { provider: cfg.provider, symbol: ctx.symbol, direction: ctx.direction, advice, threshold },
      "LLM advisor decision",
    );

    return advice;
  } catch (err) {
    logger.error({ err, provider: cfg.provider }, "LLM advisor error — rejecting trade");
    return { approved: false, confidence: 0, reasoning: `LLM error: ${String(err)}` };
  }
}
