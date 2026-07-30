import express, { type Express } from "express";
import type { Container } from "./container.ts";
import { cors } from "./middleware/cors.ts";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.ts";
import { authRoutes } from "./routes/auth.ts";
import { meRoutes } from "./routes/me.ts";
import { userRoutes } from "./routes/users.ts";

export interface AppOptions {
  /** Set false in tests to keep expected 500s out of the test output. */
  logErrors?: boolean;
}

/**
 * Builds the HTTP app from an already-constructed container. Kept separate from
 * `index.ts` so tests can drive the app without binding a well-known port.
 */
export function createApp(container: Container, options: AppOptions = {}): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", container.config.trustProxy);

  app.use(cors(container.config));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
  });

  app.use("/api/auth", authRoutes(container));
  app.use("/api/me", meRoutes(container));
  app.use("/api/users", userRoutes(container));

  app.use(notFoundHandler);
  app.use(errorHandler({ log: options.logErrors ?? true }));

  return app;
}
