import type { RequestHandler } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  /**
   * When true, requests from loopback interfaces are not rate-limited.
   * This is useful for local dev / health checks.
   */
  skipLoopback?: boolean;
};

function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  // Express may give ::ffff:127.0.0.1 (IPv4-mapped IPv6)
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("::ffff:127.")
  );
}

/**
 * Lightweight in-memory rate limiter (per-IP, fixed window).
 * Good enough for a single-node self-hosted bot controller.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const { windowMs, max, skipLoopback = true } = options;

  type Bucket = { resetAt: number; count: number };
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup so the map can't grow forever.
  const cleanupEveryMs = Math.max(10_000, windowMs);
  let lastCleanupAt = 0;

  return (req, res, next) => {
    if (skipLoopback && isLoopbackIp(req.ip)) {
      next();
      return;
    }

    const now = Date.now();
    if (now - lastCleanupAt > cleanupEveryMs) {
      lastCleanupAt = now;
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const key = req.ip || "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { resetAt: now + windowMs, count: 1 });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      res.status(429).json({
        error: "rate_limited",
        message: "Too many requests. Please retry later.",
      });
      return;
    }

    next();
  };
}
