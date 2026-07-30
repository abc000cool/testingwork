import type { RequestHandler } from "express";
import type { Config } from "../config.ts";

/**
 * Minimal CORS. The frontend runs on a different dev port, so preflight has to
 * work; we avoid pulling in the `cors` package for ~15 lines of headers.
 */
export function cors(config: Config): RequestHandler {
  return (req, res, next) => {
    const origin = req.get("origin");
    const allowed =
      config.corsOrigins === "*" ? origin : config.corsOrigins.includes(origin ?? "") ? origin : null;

    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", allowed);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(allowed ? 204 : 403);
      return;
    }
    next();
  };
}
