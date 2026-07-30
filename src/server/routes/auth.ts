import { Router } from "express";
import { authOf, requireAuth } from "../middleware/auth.ts";
import { rateLimit } from "../middleware/rateLimit.ts";
import { loginSchema, signupSchema } from "../schemas.ts";
import type { Container } from "../container.ts";

export function authRoutes({ authService, config }: Container): Router {
  const router = Router();
  const limiter = rateLimit(config.authRateLimit);

  router.post("/signup", limiter, async (req, res) => {
    const result = await authService.signup(signupSchema.parse(req.body));
    res.status(201).json(result);
  });

  router.post("/login", limiter, async (req, res) => {
    const result = await authService.login(loginSchema.parse(req.body));
    res.json(result);
  });

  router.post("/logout", requireAuth(authService), async (req, res) => {
    await authService.logout(authOf(req).token);
    res.status(204).end();
  });

  return router;
}
