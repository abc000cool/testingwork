import type { RequestHandler } from "express";
import { tooManyRequests } from "../errors.ts";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter keyed by client IP, held in process memory.
 *
 * Enough to blunt credential stuffing against a single-process dev/staging
 * server. Behind more than one instance this needs a shared store (Redis).
 */
export function rateLimit(options: { max: number; windowMs: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";

    // Opportunistic sweep so the map cannot grow without bound.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      next(tooManyRequests("Too many attempts. Please wait and try again."));
      return;
    }
    next();
  };
}
