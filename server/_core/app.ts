import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createCorsMiddleware } from "./cors";
import { registerNexoraRoutes, type NexoraRouteOptions } from "../nexora/routes";
import { registerTrafficRoutes } from "../nexora/traffic";
import { registerOfflineRoutes } from "../nexora/offline";

/** Largest JSON body the API accepts. A route request with three stops is well under 1 kB. */
export const JSON_BODY_LIMIT = "16kb";

/**
 * SEC-005: how many proxy hops to trust for X-Forwarded-For. Render puts exactly one proxy in
 * front of the service, so req.ip is the address that proxy saw (the client cannot spoof it).
 * NEXORA_TRUST_PROXY overrides the hop count; 0 trusts none (local runs without a proxy).
 */
export function trustProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.NEXORA_TRUST_PROXY ?? "").trim();
  if (raw === "") return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

/** SEC-008: baseline headers on every response. The map page overrides the CSP with its own. */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  next();
}

/** OPS-006: unknown paths get JSON, never Express's HTML page. */
function jsonNotFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found." });
}

/**
 * OPS-006: every error becomes a short JSON reply with no stack trace, whatever NODE_ENV is.
 * Body-parser errors carry their own 4xx status (400 malformed JSON, 413 too large).
 */
// Four parameters: Express recognises error handlers by arity.
function jsonErrors(err: any, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  const status = Number(err?.status ?? err?.statusCode);
  const code = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
  const error =
    err?.type === "entity.parse.failed"
      ? "Request body is not valid JSON."
      : code === 413
        ? "Request body is too large."
        : code < 500
          ? "Bad request."
          : "Internal server error.";
  if (code >= 500) console.error(JSON.stringify({ event: "server_error", status: code }));
  res.status(code).json({ error });
}

/**
 * Builds the API exactly as the server runs it, without listening. Kept separate from
 * index.ts so tests (tests/server-routes.test.ts, tests/security-admin-account.test.ts)
 * exercise the real route wiring rather than a hand-assembled copy. `options` lets tests
 * shorten provider spacing and budgets; production passes none and reads the environment.
 *
 * The API is anonymous: there are no accounts, sessions, cookies or file storage. The old
 * Manus OAuth, storage proxy and tRPC routes were removed (SEC-002); requests to them 404.
 */
export function createApp(options: { routes?: NexoraRouteOptions } = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxyHops());

  app.use(securityHeaders);
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use("/api/nexora/map-assets", express.static("server/nexora/map-assets"));
  registerNexoraRoutes(app, options.routes);
  registerTrafficRoutes(app);
  registerOfflineRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(jsonNotFound);
  app.use(jsonErrors);
  return app;
}
