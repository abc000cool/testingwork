import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors.ts";

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Terminal 404 for anything that matched no route. */
export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}.` },
  };
  res.status(404).json(body);
};

/**
 * Single exit point for failures. Every error response has the same shape:
 * `{ error: { code, message, details? } }`.
 */
export function errorHandler(options: { log?: boolean } = {}): ErrorRequestHandler {
  const log = options.log ?? true;

  return (err, _req, res, _next) => {
    if (res.headersSent) return;

    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request body or query is invalid.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      } satisfies ErrorBody);
      return;
    }

    if (err instanceof AppError) {
      const body: ErrorBody = { error: { code: err.code, message: err.message } };
      if (err.details !== undefined) body.error.details = err.details;
      res.status(err.status).json(body);
      return;
    }

    // Malformed JSON surfaces here from express.json().
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
      } satisfies ErrorBody);
      return;
    }

    if (log) console.error("[unhandled]", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    } satisfies ErrorBody);
  };
}
