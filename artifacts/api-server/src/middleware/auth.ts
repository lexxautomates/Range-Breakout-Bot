import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  return normalized === "127.0.0.1" || normalized === "::1";
}

function extractBearerToken(authHeader: unknown): string | null {
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function requireApiAuth(req: Request, res: Response, next: NextFunction) {
  const configuredToken = process.env.API_TOKEN;

  if (!configuredToken) {
    // Safe-by-default for someone running this locally without config.
    // If you want network access, set API_TOKEN.
    if (!isLoopbackIp(req.ip)) {
      res.status(403).json({
        error: "API_TOKEN not set. For safety, the API only accepts localhost requests.",
      });
      return;
    }
    logger.warn("API_TOKEN not set; allowing localhost-only access");
    next();
    return;
  }

  const provided = extractBearerToken(req.headers.authorization);
  if (!provided || provided !== configuredToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
