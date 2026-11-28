/**
 * SEC-ADMIN / ACC-10 adversarial tests against the real API wiring (server/_core/app.ts).
 *
 * Since SEC-002 the API has no accounts, sessions, cookies, tRPC or file storage, so the
 * old token-forgery and session-cookie cases have nothing left to attack. What remains:
 * - the admin surface denies every method and path variant, with or without credentials;
 * - no export, delete, report, user or storage endpoint exists, anonymous or with a Bearer;
 * - a pinned inventory of every HTTP route, so a new route has to be classified here
 *   deliberately (this replaces the old pinned tRPC procedure inventory).
 *
 * Any future account-data endpoint needs ownership tests here before it ships.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../server/_core/app";

let app: Express;
let server: Server;
let base: string;

beforeAll(async () => {
  app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// A syntactically valid HS256 JWT signed with a throwaway key. The server must ignore it.
const SOME_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJvcGVuSWQiOiJ1c2VyLW93bmVyIiwicm9sZSI6ImFkbWluIiwiYXBwSWQiOiJ4IiwibmFtZSI6Ik8ifQ." +
  "c2lnbmF0dXJlLW5vdC12YWxpZA";
const credentialVariants: Array<Record<string, string>> = [
  {},
  { Authorization: `Bearer ${SOME_JWT}` },
  { Cookie: `app_session_id=${SOME_JWT}; __Host-manus_session_265420090014141=${SOME_JWT}` },
];

// ---- 1. admin denial ---------------------------------------------------------------------
describe("SEC-ADMIN: admin surfaces deny every caller", () => {
  const adminPaths = [
    "/api/nexora/admin",
    "/api/nexora/admin/",
    "/api/nexora/admin/reports",
    "/api/nexora/admin/users/1/delete",
    "/api/nexora/ADMIN/reports",
    "/api/nexora/admin/..%2fcapabilities",
  ];
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

  for (const path of adminPaths) {
    for (const method of methods) {
      it(`${method} ${path} anonymous → 403`, async () => {
        const res = await fetch(`${base}${path}`, { method });
        expect(res.status).toBe(403);
      });
    }
  }

  it("an admin-looking Bearer or cookie still cannot open the admin path", async () => {
    for (const headers of credentialVariants) {
      const res = await fetch(`${base}/api/nexora/admin/reports`, { headers });
      expect(res.status).toBe(403);
    }
  });
});

// ---- 2. no account, storage or data surface -----------------------------------------------
describe("SEC-ADMIN / ACC-10: no account, storage or cross-account data surface", () => {
  const probes: Array<[string, string]> = [
    ["GET", "/api/nexora/export"],
    ["GET", "/api/nexora/account/export"],
    ["DELETE", "/api/nexora/account"],
    ["POST", "/api/nexora/account/delete"],
    ["GET", "/api/nexora/reports"],
    ["POST", "/api/nexora/reports"],
    ["GET", "/api/nexora/users/2"],
    ["GET", "/api/nexora/saved"],
    ["GET", "/api/nexora/history"],
    ["GET", "/api/nexora/shares/abc"],
    ["GET", "/api/users"],
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/session"],
    ["POST", "/api/auth/logout"],
    ["GET", "/api/oauth/callback"],
    ["GET", "/manus-storage/users/user-bob/export.json"],
    ["POST", "/api/trpc/system.notifyOwner"],
  ];
  for (const [method, path] of probes) {
    it(`${method} ${path} does not exist for any caller`, async () => {
      for (const headers of credentialVariants) {
        const res = await fetch(`${base}${path}`, { method, headers, redirect: "manual" });
        expect(res.status, `${method} ${path}`).toBe(404);
        expect(res.headers.getSetCookie()).toEqual([]);
      }
    });
  }

  it("public endpoints answer the same with or without credentials and set no cookie", async () => {
    for (const path of ["/api/health", "/api/nexora/capabilities"]) {
      for (const headers of credentialVariants) {
        const res = await fetch(`${base}${path}`, { headers });
        expect(res.status, path).toBe(200);
        expect(res.headers.getSetCookie()).toEqual([]);
        const text = await res.text();
        expect(text).not.toContain("user-owner");
        expect(text).not.toContain(SOME_JWT);
      }
    }
  });
});

// ---- 3. pinned route inventory ------------------------------------------------------------
type Layer = {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  name?: string;
  regexp?: RegExp;
};

describe("SEC-ADMIN: deny-by-default route inventory", () => {
  it("serves exactly the classified routes; a new one must be added here deliberately", () => {
    const stack = (app as unknown as { _router: { stack: Layer[] } })._router.stack;
    const routes = stack
      .filter((l) => l.route)
      .flatMap((l) => {
        const paths = Array.isArray(l.route!.path) ? l.route!.path : [l.route!.path];
        const methods = Object.keys(l.route!.methods).map((m) => m.toUpperCase()).sort();
        // app.all() registers every HTTP verb (or "_all" on older Express): show it as ALL.
        const label = methods.includes("_ALL") || methods.length > 10 ? "ALL" : methods.join(",");
        return paths.map((p) => `${label} ${p}`);
      })
      .sort();
    // Public, anonymous, read-only or compute-only. "ALL" is the 403 admin catch-all.
    expect(routes).toEqual(
      [
        "GET /api/health",
        "GET /api/nexora/capabilities",
        "GET /api/nexora/map",
        "GET /api/nexora/offline/regions",
        "GET /api/nexora/offline/regions/:id/:file",
        "GET /api/nexora/places",
        "GET /api/nexora/search",
        "GET /api/nexora/traffic",
        "GET /api/nexora/traffic/capabilities",
        "POST /api/nexora/routes",
        "ALL /api/nexora/admin",
        "ALL /api/nexora/admin/*",
      ].sort(),
    );
    // The only middleware: security headers, CORS, the JSON parser, the static map assets and
    // the JSON 404 and error handlers (OPS-006). No session,
    // cookie, tRPC or storage middleware.
    const middleware = stack.filter((l) => !l.route).map((l) => l.name);
    expect(middleware).toEqual([
      "query",
      "expressInit",
      "securityHeaders",
      "<anonymous>",
      "jsonParser",
      "serveStatic",
      "jsonNotFound",
      "jsonErrors",
    ]);
  });
});
