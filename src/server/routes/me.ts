import { Router } from "express";
import { authOf, requireAuth } from "../middleware/auth.ts";
import { profilePatchSchema } from "../schemas.ts";
import { favoriteRoutes } from "./favorites.ts";
import type { Container } from "../container.ts";

/** Mounted at /api/me. Everything under it requires authentication. */
export function meRoutes(container: Container): Router {
  const router = Router();
  const { authService, profileService } = container;

  router.use(requireAuth(authService));

  router.get("/", (req, res) => {
    res.json(profileService.getMe(authOf(req).user));
  });

  router.patch("/profile", async (req, res) => {
    const { user } = authOf(req);
    res.json(await profileService.updateProfile(user.id, profilePatchSchema.parse(req.body)));
  });

  router.use("/favorites", favoriteRoutes(container));

  return router;
}
