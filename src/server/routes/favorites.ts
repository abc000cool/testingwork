import { Router } from "express";
import { authOf } from "../middleware/auth.ts";
import {
  favoriteCreateSchema,
  favoritePatchSchema,
  favoriteQuerySchema,
} from "../schemas.ts";
import type { Container } from "../container.ts";

/** Mounted at /api/me/favorites, behind `requireAuth`. */
export function favoriteRoutes({ favoriteService }: Container): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const { user } = authOf(req);
    res.json(favoriteService.list(user.id, favoriteQuerySchema.parse(req.query)));
  });

  /** Facet counts by itemType. Declared before /:id so it is not read as an id. */
  router.get("/types", (req, res) => {
    const { user } = authOf(req);
    res.json({ data: favoriteService.typeCounts(user.id) });
  });

  router.post("/", async (req, res) => {
    const { user } = authOf(req);
    const favorite = await favoriteService.add(user.id, favoriteCreateSchema.parse(req.body));
    res.status(201).json(favorite);
  });

  router.get("/:id", (req, res) => {
    const { user } = authOf(req);
    res.json(favoriteService.get(user.id, req.params.id));
  });

  router.patch("/:id", async (req, res) => {
    const { user } = authOf(req);
    const favorite = await favoriteService.update(
      user.id,
      req.params.id,
      favoritePatchSchema.parse(req.body),
    );
    res.json(favorite);
  });

  router.delete("/:id", async (req, res) => {
    const { user } = authOf(req);
    await favoriteService.remove(user.id, req.params.id);
    res.status(204).end();
  });

  return router;
}
