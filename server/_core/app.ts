import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { clearLegacySessionCookie } from "./cookies";
import { registerNexoraRoutes } from "../nexora/routes";
import { registerTrafficRoutes } from "../nexora/traffic";
import { registerOfflineRoutes } from "../nexora/offline";

/**
 * Builds the API exactly as the server runs it, without listening. Kept separate from
 * index.ts so adversarial tests (tests/security-admin-account.test.ts) exercise the real
 * route wiring rather than a hand-assembled copy.
 */
export function createApp(): Express {
  const app = express();

  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/nexora/map-assets", express.static("server/nexora/map-assets"));
  registerNexoraRoutes(app);
  registerTrafficRoutes(app);
  registerOfflineRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}
