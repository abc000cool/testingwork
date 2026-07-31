import { Router } from "express";
import { favoriteQuerySchema } from "../schemas.ts";
import type { Container } from "../container.ts";

/** Mounted at /api/users. Public, read-only; no token required. */
export function userRoutes({ profileService, favoriteService }: Container): Router {
  const router = Router();

  router.get("/:username/profile", (req, res) => {
    res.json(profileService.getPublicProfile(req.params.username));
  });

  router.get("/:username/favorites", (req, res) => {
    const query = favoriteQuerySchema.parse(req.query);
    res.json(favoriteService.listByUsername(req.params.username, query));
  });

  return router;
}
