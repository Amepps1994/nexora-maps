import express, { type Express } from "express";
import { createCorsMiddleware } from "./cors";
import { registerNexoraRoutes } from "../nexora/routes";
import { registerTrafficRoutes } from "../nexora/traffic";
import { registerOfflineRoutes } from "../nexora/offline";

/** Largest JSON body the API accepts. A route request with five stops is well under 1 kB. */
export const JSON_BODY_LIMIT = "16kb";

/**
 * Builds the API exactly as the server runs it, without listening. Kept separate from
 * index.ts so tests (tests/server-routes.test.ts, tests/security-admin-account.test.ts)
 * exercise the real route wiring rather than a hand-assembled copy.
 *
 * The API is anonymous: there are no accounts, sessions, cookies or file storage. The old
 * Manus OAuth, storage proxy and tRPC routes were removed (SEC-002); requests to them 404.
 */
export function createApp(): Express {
  const app = express();

  app.use(createCorsMiddleware());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use("/api/nexora/map-assets", express.static("server/nexora/map-assets"));
  registerNexoraRoutes(app);
  registerTrafficRoutes(app);
  registerOfflineRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  return app;
}
