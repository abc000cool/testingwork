/** Runtime configuration, resolved once from the environment. */
export interface Config {
  port: number;
  host: string;
  /** Path to the JSON data file, or `null` for a purely in-memory store (tests). */
  dataFile: string | null;
  sessionTtlMs: number;
  /** Allowed CORS origins, or `"*"` to reflect any origin. */
  corsOrigins: string[] | "*";
  /** Max auth attempts per IP inside the rate-limit window. */
  authRateLimit: { max: number; windowMs: number };
  /** Honour X-Forwarded-For, so rate limiting keys on the real client IP. */
  trustProxy: boolean;
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, got ${JSON.stringify(value)}`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const origins = env.CORS_ORIGINS?.trim();
  return {
    port: num(env.PORT, 4000),
    host: env.HOST ?? "127.0.0.1",
    dataFile: env.DATA_FILE === "" ? null : (env.DATA_FILE ?? "data/db.json"),
    sessionTtlMs: num(env.SESSION_TTL_HOURS, 24 * 7) * 60 * 60 * 1000,
    corsOrigins: !origins || origins === "*" ? "*" : origins.split(",").map((o) => o.trim()),
    authRateLimit: {
      max: num(env.AUTH_RATE_LIMIT_MAX, 20),
      windowMs: num(env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    },
    trustProxy: env.TRUST_PROXY === "true",
  };
}
