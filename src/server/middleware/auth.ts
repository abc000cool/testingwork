import type { Request, RequestHandler } from "express";
import { unauthorized } from "../errors.ts";
import type { AuthService } from "../services/authService.ts";
import type { AuthContext } from "../types.ts";

const BEARER = /^Bearer\s+(.+)$/i;

function extractToken(req: Request): string | null {
  const header = req.get("authorization");
  const match = header ? BEARER.exec(header.trim()) : null;
  return match?.[1]?.trim() || null;
}

/** Rejects the request with 401 unless it carries a valid bearer token. */
export function requireAuth(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = extractToken(req);
      if (!token) throw unauthorized("Missing bearer token.");
      req.auth = await auth.authenticate(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Narrowing helper for handlers mounted behind `requireAuth`. */
export function authOf(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
