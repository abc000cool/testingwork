import type { AuthContext } from "./types.ts";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`; absent on unauthenticated routes. */
      auth?: AuthContext;
    }
  }
}
