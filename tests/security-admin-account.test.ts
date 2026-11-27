/**
 * SEC-ADMIN / ACC-10 adversarial tests.
 *
 * Exercises the real API wiring (server/_core/app.ts) and the real tRPC router with an
 * in-memory user table standing in for MySQL. Covers: anonymous and non-admin admin denial,
 * role escalation through token claims, cross-account isolation of session identity, token
 * forgery/tampering/expiry/algorithm confusion, weak-secret fail-closed, cookie flags, token
 * absence from logs, and the absence of any server export/delete/report surface.
 *
 * Not covered because the feature does not exist on the server yet: owned server records,
 * export/delete of account data, share links and report moderation. Those tests are blocked
 * until the endpoints are built (see docs/security-admin-validation-2026-11-27.md).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { SignJWT, base64url } from "jose";
import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";

// ---- in-memory users table ---------------------------------------------------------------
const usersTable = new Map<string, User>();
let nextId = 1;
function seedUser(openId: string, role: User["role"], name = openId): User {
  const now = new Date();
  const user: User = {
    id: nextId++,
    openId,
    name,
    email: `${openId}@example.test`,
    loginMethod: "email",
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  usersTable.set(openId, user);
  return user;
}

vi.mock("../server/db", () => ({
  getDb: async () => null,
  getUserByOpenId: async (openId: string) => usersTable.get(openId),
  upsertUser: async (u: Partial<User> & { openId: string }) => {
    const existing = usersTable.get(u.openId);
    if (existing) {
      // Mirror server/db.ts: only fields explicitly passed are updated. Role is never taken
      // from a session token, so an upsert from authenticateRequest cannot change it.
      usersTable.set(u.openId, { ...existing, ...u, role: u.role ?? existing.role });
    }
  },
}));

const SECRET = "test-only-secret-0123456789abcdef-0123456789";
const APP_ID = "nexora-test-app";

const { ENV } = await import("../server/_core/env");
const { sdk, MIN_SESSION_SECRET_BYTES } = await import("../server/_core/sdk");
const { createApp } = await import("../server/_core/app");
const { appRouter } = await import("../server/routers");
const { getSessionCookieName } = await import("../server/_core/cookies");

const originalEnv = { ...ENV };

function key(secret = SECRET) {
  return new TextEncoder().encode(secret);
}

async function token(
  claims: Record<string, unknown>,
  opts: { secret?: string; exp?: number | string; alg?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: opts.alg ?? "HS256", typ: "JWT" })
    .setExpirationTime(opts.exp ?? "1h")
    .sign(key(opts.secret));
}

function unsignedToken(claims: Record<string, unknown>) {
  const enc = (o: unknown) => base64url.encode(JSON.stringify(o));
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
}

let server: Server;
let base: string;
let alice: User;
let bob: User;
let owner: User;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  ENV.cookieSecret = SECRET;
  ENV.appId = APP_ID;
  ENV.oAuthServerUrl = "";
  ENV.forgeApiUrl = "";
  ENV.forgeApiKey = "";
  usersTable.clear();
  nextId = 1;
  alice = seedUser("user-alice", "user", "Alice");
  bob = seedUser("user-bob", "user", "Bob");
  owner = seedUser("user-owner", "admin", "Owner");
  // No OAuth server is reachable in tests. Any fallback to it must fail, never succeed.
  vi.spyOn(sdk, "getUserInfoWithJwt").mockRejectedValue(new Error("oauth offline"));
});

afterEach(() => {
  Object.assign(ENV, originalEnv);
  vi.restoreAllMocks();
});

const sessionFor = (u: User, extra: Record<string, unknown> = {}) =>
  token({ openId: u.openId, appId: APP_ID, name: u.name ?? "x", ...extra });

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function me(headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/auth/me`, { headers });
  return { status: res.status, body: (await res.json()) as { user: { openId: string } | null } };
}

function trpcCtx(user: User | null) {
  return {
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined, cookie: () => undefined },
  } as never;
}

// ---- 1. admin denial ---------------------------------------------------------------------
describe("SEC-ADMIN: admin surfaces deny anonymous and non-admin callers", () => {
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

  it("a valid admin-role session still cannot open the HTTP admin path (no admin service exists)", async () => {
    const res = await fetch(`${base}/api/nexora/admin/reports`, {
      headers: bearer(await sessionFor(owner)),
    });
    expect(res.status).toBe(403);
  });

  it("tRPC system.notifyOwner rejects anonymous callers with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(trpcCtx(null));
    await expect(caller.system.notifyOwner({ title: "t", content: "c" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("tRPC system.notifyOwner rejects a signed-in non-admin with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(trpcCtx(alice));
    await expect(caller.system.notifyOwner({ title: "t", content: "c" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("over HTTP, anonymous tRPC admin mutation is 403 and never reaches the notifier", async () => {
    const res = await fetch(`${base}/api/trpc/system.notifyOwner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { title: "t", content: "c" } }),
    });
    expect(res.status).toBe(403);
  });

  it("a role claim smuggled into the token does not grant admin", async () => {
    const forged = await sessionFor(alice, { role: "admin" });
    const res = await fetch(`${base}/api/trpc/system.notifyOwner`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bearer(forged) },
      body: JSON.stringify({ json: { title: "t", content: "c" } }),
    });
    expect(res.status).toBe(403);
    expect(usersTable.get(alice.openId)?.role).toBe("user");
  });

  it("deny-by-default inventory: every tRPC procedure outside the public allowlist rejects anonymous callers", async () => {
    const PUBLIC = new Set(["system.health", "auth.me", "auth.logout"]);
    const procedures = Object.keys(
      (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures,
    ).sort();
    // A new procedure must be classified here deliberately; this fails if one is added silently.
    expect(procedures).toEqual(["auth.logout", "auth.me", "system.health", "system.notifyOwner"]);
    const caller = appRouter.createCaller(trpcCtx(null)) as unknown as Record<
      string,
      Record<string, (input?: unknown) => Promise<unknown>>
    >;
    for (const path of procedures.filter((p) => !PUBLIC.has(p))) {
      const [ns, name] = path.split(".");
      const err = await caller[ns][name]({ title: "t", content: "c" }).catch((e) => e);
      expect(err, path).toBeInstanceOf(TRPCError);
      expect(["UNAUTHORIZED", "FORBIDDEN"], path).toContain((err as TRPCError).code);
    }
  });
});

// ---- 2. cross-account isolation ----------------------------------------------------------
describe("ACC-10: sessions resolve only to their own account", () => {
  it("Alice's token returns Alice and Bob's returns Bob", async () => {
    const a = await me(bearer(await sessionFor(alice)));
    const b = await me(bearer(await sessionFor(bob)));
    expect(a.status).toBe(200);
    expect(a.body.user?.openId).toBe(alice.openId);
    expect(b.body.user?.openId).toBe(bob.openId);
  });

  it("editing openId in Alice's token payload to Bob's (without re-signing) is rejected", async () => {
    const [h, , sig] = (await sessionFor(alice)).split(".");
    const tampered = `${h}.${base64url.encode(
      JSON.stringify({ openId: bob.openId, appId: APP_ID, name: "Alice", exp: 9999999999 }),
    )}.${sig}`;
    const r = await me(bearer(tampered));
    expect(r.status).toBe(401);
    expect(r.body.user).toBeNull();
  });

  it("a cookie for one account plus a Bearer for another resolves to the Bearer only", async () => {
    const cookieName = getSessionCookieName({ protocol: "http", headers: {} } as never);
    const r = await me({
      ...bearer(await sessionFor(bob)),
      Cookie: `${cookieName}=${await sessionFor(alice)}`,
    });
    expect(r.body.user?.openId).toBe(bob.openId);
  });

  it("an invalid Bearer does not fall back to a valid cookie for another account", async () => {
    const cookieName = getSessionCookieName({ protocol: "http", headers: {} } as never);
    const r = await me({
      Authorization: "Bearer not-a-jwt",
      Cookie: `${cookieName}=${await sessionFor(alice)}`,
    });
    expect(r.status).toBe(401);
  });

  it("tRPC auth.me returns only the context user and null for anonymous", async () => {
    expect(await appRouter.createCaller(trpcCtx(null)).auth.me()).toBeNull();
    const result = await appRouter.createCaller(trpcCtx(alice)).auth.me();
    expect(result?.openId).toBe(alice.openId);
  });

  it("a validly signed token for an unknown account is rejected, not auto-provisioned, when OAuth is unreachable", async () => {
    const ghost = await token({ openId: "user-ghost", appId: APP_ID, name: "Ghost" });
    const r = await me(bearer(ghost));
    expect(r.status).toBe(401);
    expect(usersTable.has("user-ghost")).toBe(false);
  });

  it("a cron_ openId cannot impersonate a scheduled task without upstream confirmation", async () => {
    const cron = await token({ openId: "cron_fake", appId: APP_ID, name: "Cron" });
    expect((await me(bearer(cron))).status).toBe(401);
  });

  it("POST /api/auth/session will not mint a cookie from an invalid Bearer", async () => {
    const res = await fetch(`${base}/api/auth/session`, {
      method: "POST",
      headers: bearer(await token({ openId: alice.openId, appId: APP_ID, name: "A" }, { secret: "x".repeat(40) })),
    });
    expect(res.status).toBe(401);
    // The legacy-cookie middleware clears app_session_id on every response; no session
    // cookie may be set with a value.
    const minted = res.headers
      .getSetCookie()
      .filter((c) => /^(__Host-manus_session_|manus_local_session_)[^=]*=[^;]+/.test(c));
    expect(minted).toEqual([]);
  });
});

// ---- 3. token handling -------------------------------------------------------------------
describe("ACC-10: token forgery, expiry and algorithm handling", () => {
  it("rejects a token signed with a different secret", async () => {
    const t = await token(
      { openId: alice.openId, appId: APP_ID, name: "Alice" },
      { secret: "another-secret-another-secret-another-secret" },
    );
    expect((await me(bearer(t))).status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const t = await token(
      { openId: alice.openId, appId: APP_ID, name: "Alice" },
      { exp: Math.floor(Date.now() / 1000) - 60 },
    );
    expect((await me(bearer(t))).status).toBe(401);
  });

  it("rejects alg:none (unsigned) tokens", async () => {
    const t = unsignedToken({ openId: alice.openId, appId: APP_ID, name: "Alice" });
    expect((await me(bearer(t))).status).toBe(401);
  });

  it("rejects a token signed with HS512 using the right secret (algorithm pinned to HS256)", async () => {
    const t = await token({ openId: alice.openId, appId: APP_ID, name: "Alice" }, { alg: "HS512" });
    expect((await me(bearer(t))).status).toBe(401);
  });

  it("rejects a token missing required claims", async () => {
    const t = await token({ openId: alice.openId, appId: APP_ID });
    expect((await me(bearer(t))).status).toBe(401);
  });

  it("rejects a token issued for another app id sharing the secret", async () => {
    const t = await token({ openId: alice.openId, appId: "some-other-app", name: "Alice" });
    expect((await me(bearer(t))).status).toBe(401);
  });

  it("rejects non-JWT junk and empty Bearer values", async () => {
    for (const v of ["", "null", "undefined", "a.b.c", "Bearer", "%00"]) {
      expect((await me({ Authorization: `Bearer ${v}` })).status, v).toBe(401);
    }
    expect((await me()).status).toBe(401);
  });

  it("fails closed when JWT_SECRET is empty: cannot mint or accept sessions", async () => {
    const good = await sessionFor(alice);
    ENV.cookieSecret = "";
    await expect(sdk.createSessionToken(alice.openId, { name: "Alice" })).rejects.toThrow();
    expect((await me(bearer(good))).status).toBe(401);
  });

  it(`fails closed when JWT_SECRET is shorter than ${MIN_SESSION_SECRET_BYTES} bytes`, async () => {
    ENV.cookieSecret = "short";
    const weak = await token({ openId: alice.openId, appId: APP_ID, name: "Alice" }, { secret: "short" });
    await expect(sdk.createSessionToken(alice.openId, { name: "Alice" })).rejects.toThrow();
    expect((await me(bearer(weak))).status).toBe(401);
  });

  it("server-minted tokens round-trip and carry an expiry", async () => {
    const t = await sdk.createSessionToken(alice.openId, { name: "Alice" });
    const payload = JSON.parse(new TextDecoder().decode(base64url.decode(t.split(".")[1])));
    expect(typeof payload.exp).toBe("number");
    expect(payload.role).toBeUndefined();
    expect((await me(bearer(t))).body.user?.openId).toBe(alice.openId);
  });

  it("never writes the presented token to server logs", async () => {
    const lines: string[] = [];
    for (const level of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    const good = await sessionFor(alice);
    const bad = await token({ openId: bob.openId, appId: APP_ID, name: "Bob" }, { secret: "y".repeat(40) });
    await me(bearer(good));
    await me(bearer(bad));
    await me(bearer(await token({ openId: "user-ghost", appId: APP_ID, name: "G" })));
    const all = lines.join("\n");
    for (const t of [good, bad]) {
      expect(all).not.toContain(t);
      expect(all).not.toContain(t.split(".")[2]);
    }
  });

  // Known gap, not a pass: logout only clears the cookie. Sessions are stateless one-year
  // JWTs with no revocation list, so a copied token stays valid after logout until expiry.
  it.todo("a token presented after logout is rejected (needs server-side revocation)");
});

// ---- 4. cookie flags ---------------------------------------------------------------------
describe("ACC-10: session cookie handling", () => {
  it("logout over HTTPS clears an httpOnly, Secure, __Host- cookie", async () => {
    const res = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { "X-Forwarded-Proto": "https" },
    });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("__Host-manus_session_")) ?? "";
    expect(cookie).toMatch(/^__Host-manus_session_[^=]*=;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("/api/auth/session sets an httpOnly cookie only after verifying the Bearer", async () => {
    const res = await fetch(`${base}/api/auth/session`, {
      method: "POST",
      headers: bearer(await sessionFor(alice)),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("manus_local_session_")) ?? "";
    expect(cookie).toMatch(/^manus_local_session_[^=]*=[^;]+;/);
    expect(cookie).toMatch(/HttpOnly/i);
  });
});

// ---- 5. anonymous data surfaces ----------------------------------------------------------
describe("SEC-ADMIN / ACC-10: no anonymous or cross-account data surface", () => {
  it("the storage proxy refuses anonymous callers before contacting the backend", async () => {
    ENV.forgeApiUrl = "https://forge.invalid";
    ENV.forgeApiKey = "forge-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await fetch(`${base}/manus-storage/users/user-bob/export.json`, { redirect: "manual" });
    expect(res.status).toBe(401);
    // Only the test's own request went through fetch; the proxy made no backend call.
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("forge.invalid"))).toHaveLength(0);
  });

  it("the storage proxy refuses a forged token too", async () => {
    const t = await token({ openId: alice.openId, appId: APP_ID, name: "A" }, { secret: "z".repeat(40) });
    const res = await fetch(`${base}/manus-storage/any`, { headers: bearer(t), redirect: "manual" });
    expect(res.status).toBe(401);
  });

  const exportDeleteReportProbes: Array<[string, string]> = [
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
  ];
  for (const [method, path] of exportDeleteReportProbes) {
    it(`${method} ${path} exposes no data, anonymous or as another account`, async () => {
      for (const headers of [{}, bearer(await sessionFor(alice))]) {
        const res = await fetch(`${base}${path}`, { method, headers });
        expect(res.status, `${method} ${path}`).toBeGreaterThanOrEqual(400);
        const text = await res.text();
        expect(text).not.toContain(bob.openId);
        expect(text).not.toContain(bob.email ?? "");
      }
    });
  }

  it("public endpoints carry no account data", async () => {
    const t = await sessionFor(bob);
    for (const path of ["/api/health", "/api/nexora/capabilities"]) {
      const text = await (await fetch(`${base}${path}`, { headers: bearer(t) })).text();
      for (const u of [alice, bob, owner]) {
        expect(text).not.toContain(u.openId);
        expect(text).not.toContain(u.email ?? "");
      }
    }
  });
});
