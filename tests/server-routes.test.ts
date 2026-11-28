/**
 * SEC-002 route inventory for the real API wiring (server/_core/app.ts).
 *
 * Pins what the public API serves after the Manus login, storage and tRPC stack was
 * removed: the NEXORA map, search, routing, traffic and offline routes still answer, and
 * every former account, session or storage route is a plain 404 that sets no cookie.
 * Upstream providers (OSRM, LocationIQ, TfL) are mocked; nothing leaves the test process.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/_core/app";
import type { NexoraRouteOptions } from "../server/nexora/routes";

// Both captured fixtures keep the real provider payload under `body`.
const fixtureBody = (name: string) =>
  JSON.stringify(JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8")).body);
const osrmFixture = fixtureBody("osrm-car-multistop.json");
const tflFixture = fixtureBody("tfl-road-disruption-2026-11-27.json");
const geocoderReply = JSON.stringify([
  {
    place_id: "331",
    lat: "51.5076",
    lon: "-0.0994",
    display_name: "Tate Modern, Bankside, London, SE1 9TG, United Kingdom",
    name: "Tate Modern",
    type: "museum",
  },
]);

let server: Server;
let base = "";
const realFetch = globalThis.fetch;
const upstream: string[] = [];
const servers: Server[] = [];

/**
 * QA-006: a strict provider mock. Only the three known provider hosts answer; anything else
 * fails the test instead of silently receiving the OSRM fixture. Tests swap `provider` to
 * script errors, delays and hangs.
 */
type ProviderHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;
const defaultProvider: ProviderHandler = (url) => {
  const host = new URL(url).hostname;
  if (host.endsWith("locationiq.com")) return new Response(geocoderReply, { status: 200 });
  if (host === "api.tfl.gov.uk") return new Response(tflFixture, { status: 200 });
  if (host === "routing.openstreetmap.de") return new Response(osrmFixture, { status: 200 });
  throw new Error(`Unexpected upstream host in test: ${host}`);
};
let provider: ProviderHandler = defaultProvider;

/** A fetch that never answers until its signal aborts, like a stalled provider. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );
  });

/** Fast defaults for tests: no provider spacing. */
const FAST: NexoraRouteOptions = { routerSpacingMs: 0, geocoderSpacingMs: 0 };

async function listen(routes: NexoraRouteOptions = FAST) {
  const s = createApp({ routes }).listen(0);
  await new Promise<void>((resolve) => s.once("listening", resolve));
  servers.push(s);
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  return {
    url,
    call: (path: string, init?: RequestInit) => realFetch(`${url}${path}`, init),
  };
}

beforeAll(async () => {
  vi.stubEnv("NEXORA_GEOCODER_PROVIDER", "locationiq");
  vi.stubEnv("NEXORA_GEOCODER_KEY", "test-only-key");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
    upstream.push(url);
    return provider(url, init);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  server = createApp({ routes: FAST }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const s of servers) {
    s.closeAllConnections?.();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
});

afterEach(() => {
  upstream.length = 0;
  provider = defaultProvider;
});

const call = (path: string, init?: RequestInit) => realFetch(`${base}${path}`, init);
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("SEC-002: Manus account, session and storage routes are gone", () => {
  const removed: Array<[string, string]> = [
    ["GET", "/api/oauth/callback?code=x&state=y"],
    ["GET", "/api/oauth/mobile?code=x&state=y"],
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/session"],
    ["POST", "/api/auth/logout"],
    ["GET", "/manus-storage/x"],
    ["GET", "/manus-storage/users/user-bob/export.json"],
    ["GET", "/api/trpc/system.health?input=%7B%7D"],
    ["POST", "/api/trpc/system.notifyOwner"],
    ["POST", "/api/trpc/auth.logout"],
    ["GET", "/api/trpc/auth.me"],
  ];
  for (const [method, path] of removed) {
    it(`${method} ${path} → 404 with no cookie and no upstream call`, async () => {
      const res = await call(path, {
        method,
        headers: { Authorization: "Bearer any", "Content-Type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
        redirect: "manual",
      });
      expect(res.status).toBe(404);
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(upstream).toEqual([]);
    });
  }

  it("no response sets a cookie, including the old legacy-cookie clearing", async () => {
    for (const path of ["/api/health", "/api/nexora/capabilities", "/api/nexora/map"]) {
      const res = await call(path, { headers: { "X-Forwarded-Proto": "https" } });
      expect(res.headers.getSetCookie(), path).toEqual([]);
    }
  });
});

describe("SEC-002: the NEXORA routes the app uses still answer", () => {
  it("GET /api/health → 200", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("GET /api/nexora/capabilities → 200 and reports search configured", async () => {
    const res = await call("/api/nexora/capabilities");
    expect(res.status).toBe(200);
    const caps = await res.json();
    expect(caps.search.configured).toBe(true);
    expect(caps.search.provider).toBe("LocationIQ");
    expect(caps.routing.modes).toEqual(["driving", "walking", "cycling"]);
  });

  it("GET /api/nexora/map → 200 HTML", async () => {
    const res = await call("/api/nexora/map");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("GET /api/nexora/map-assets serves every bundled map asset", async () => {
    const files = readdirSync(join(__dirname, "../server/nexora/map-assets"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect((await call(`/api/nexora/map-assets/${file}`)).status, file).toBe(200);
    }
  });

  it("GET /api/nexora/search → 200 with provider results", async () => {
    const res = await call("/api/nexora/search?q=tate%20modern");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].name).toBe("Tate Modern");
    expect(upstream.some((u) => u.includes("locationiq.com"))).toBe(true);
  });

  it("POST /api/nexora/routes → 200 with routes", async () => {
    const res = await call(
      "/api/nexora/routes",
      json({
        origin: [-0.124, 51.5308],
        destination: [-0.0994, 51.5076],
        stops: [[-0.0984, 51.5138]],
        mode: "driving",
      }),
    );
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(0);
  });

  it("GET /api/nexora/traffic/capabilities and /api/nexora/traffic → 200", async () => {
    expect((await call("/api/nexora/traffic/capabilities")).status).toBe(200);
    const res = await call("/api/nexora/traffic");
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await res.json()).attribution[0]).toBe("Powered by TfL Open Data");
  });

  it("GET /api/nexora/offline/regions lists the London pack", async () => {
    const res = await call("/api/nexora/offline/regions");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("london");
  });

  it("the admin surface stays denied for any method", async () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      expect((await call("/api/nexora/admin/reports", { method })).status, method).toBe(403);
      expect((await call("/api/nexora/admin", { method })).status, method).toBe(403);
    }
  });
});

describe("SEC-002: request body limits", () => {
  it("rejects a JSON body over 16 kB with 413 before routing", async () => {
    const res = await call(
      "/api/nexora/routes",
      json({ origin: [0, 0], destination: [0, 0], mode: "driving", pad: "x".repeat(20_000) }),
    );
    expect(res.status).toBe(413);
    expect(upstream).toEqual([]);
  });

  it("does not parse urlencoded bodies (the routes API takes JSON only)", async () => {
    const res = await call("/api/nexora/routes", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "mode=driving&origin=0&destination=0",
    });
    expect(res.status).toBe(400);
    expect(upstream).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// WS-B: quota, abuse and error handling (SEC-005, SEC-011, SEC-007, SEC-008, OPS-001, OPS-005,
// OPS-006, OPS-007, QA-003). Each block starts its own app so limiter, cache, budget and queue
// state never leaks between tests.
// ---------------------------------------------------------------------------------------------
const trip = {
  origin: [-0.124, 51.5308],
  destination: [-0.0994, 51.5076],
  mode: "driving",
};
const fromClient = (ip: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers as Record<string, string>), "X-Forwarded-For": ip },
});
const searchCalls = () => upstream.filter((u) => u.includes("locationiq.com"));
const routeCalls = () => upstream.filter((u) => u.includes("routing.openstreetmap.de"));

describe("SEC-005: per-client limits behind Render's proxy", () => {
  it("the 16th search from one client gets 429 while another client still gets 200", async () => {
    const { call } = await listen();
    for (let i = 0; i < 15; i++) {
      const r = await call(`/api/nexora/search?q=place%20${i}`, fromClient("203.0.113.1"));
      expect(r.status, `request ${i + 1}`).toBe(200);
    }
    const limited = await call("/api/nexora/search?q=place%2015", fromClient("203.0.113.1"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("content-type")).toMatch(/application\/json/);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    const other = await call("/api/nexora/search?q=place%2015", fromClient("198.51.100.7"));
    expect(other.status).toBe(200);
  });

  it("search and routing have separate buckets", async () => {
    const { call } = await listen({ ...FAST, searchesPerMinute: 1 });
    expect((await call("/api/nexora/search?q=tate", fromClient("203.0.113.2"))).status).toBe(200);
    expect((await call("/api/nexora/search?q=tower", fromClient("203.0.113.2"))).status).toBe(429);
    const route = await call("/api/nexora/routes", fromClient("203.0.113.2", json(trip)));
    expect(route.status).toBe(200);
  });

  it("keys on the address Render's proxy appended, not a spoofed left-hand entry", async () => {
    const { call } = await listen({ ...FAST, searchesPerMinute: 2 });
    const statuses: number[] = [];
    for (const spoof of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      const r = await call(`/api/nexora/search?q=spoof%20${spoof}`, fromClient(`${spoof}, 203.0.113.9`));
      statuses.push(r.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("the routes limit is 15 a minute per client", async () => {
    const { call } = await listen();
    for (let i = 0; i < 15; i++)
      expect((await call("/api/nexora/routes", fromClient("203.0.113.3", json(trip)))).status).toBe(200);
    const limited = await call("/api/nexora/routes", fromClient("203.0.113.3", json(trip)));
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/limit/i);
  });
});

describe("SEC-005: the limiter cannot grow without bound", () => {
  it("prunes expired windows and caps live keys", async () => {
    const { RateLimiter } = await import("../server/nexora/routes");
    let t = 0;
    const limiter = new RateLimiter(5, 1000, 3, () => t);
    for (const ip of ["a", "b", "c"]) limiter.check(ip);
    expect(limiter.size).toBe(3);
    t = 2000; // all windows expired
    limiter.check("d");
    expect(limiter.size).toBe(1);
    for (const ip of ["e", "f", "g", "h"]) limiter.check(ip);
    expect(limiter.size).toBeLessThanOrEqual(3);
  });
});

describe("SEC-011: geocoder cache and daily budget", () => {
  it("an identical search (case and spacing aside) makes one upstream call", async () => {
    const { call } = await listen();
    const a = await call("/api/nexora/search?q=Tate%20Modern");
    const b = await call("/api/nexora/search?q=%20%20tate%20%20%20MODERN%20");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect((await b.json()).results[0].name).toBe("Tate Modern");
    expect(searchCalls()).toHaveLength(1);
    const caps = await (await call("/api/nexora/capabilities")).json();
    expect(caps.search.cacheHits).toBe(1);
  });

  it("cached results expire after the TTL", async () => {
    let t = Date.parse("2026-11-28T08:00:00Z");
    const { call } = await listen({ ...FAST, now: () => t });
    await call("/api/nexora/search?q=tate%20modern");
    t += 24 * 3600_000 + 1;
    await call("/api/nexora/search?q=tate%20modern");
    expect(searchCalls()).toHaveLength(2);
  });

  it("empty results (LocationIQ 404) are cached too", async () => {
    provider = () => new Response(JSON.stringify({ error: "Unable to geocode" }), { status: 404 });
    const { call } = await listen();
    for (let i = 0; i < 2; i++) {
      const r = await call("/api/nexora/search?q=nowhere%20at%20all");
      expect(r.status).toBe(200);
      expect((await r.json()).results).toEqual([]);
    }
    expect(searchCalls()).toHaveLength(1);
  });

  it("after the daily budget the endpoint returns 503 with no upstream call, then resets at UTC midnight", async () => {
    vi.stubEnv("NEXORA_GEOCODER_DAILY_BUDGET", "2");
    let t = Date.parse("2026-11-28T22:00:00Z");
    try {
      const { call } = await listen({ ...FAST, now: () => t });
      expect((await call("/api/nexora/search?q=first")).status).toBe(200);
      expect((await call("/api/nexora/search?q=second")).status).toBe(200);
      upstream.length = 0;
      const spent = await call("/api/nexora/search?q=third");
      expect(spent.status).toBe(503);
      const body = await spent.json();
      expect(body.error).toBe("Search is busy today. Try again tomorrow.");
      expect(body.budgetExhausted).toBe(true);
      expect(upstream).toEqual([]);
      // A cached query still answers while the budget is spent.
      expect((await call("/api/nexora/search?q=first")).status).toBe(200);
      const caps = await (await call("/api/nexora/capabilities")).json();
      expect(caps.search.dailyBudget).toBe(2);
      expect(caps.search.budgetRemaining).toBe(0);
      expect(caps.search.budgetResetsAt).toBe("2026-11-29T00:00:00.000Z");
      t = Date.parse("2026-11-29T00:00:01Z");
      expect((await call("/api/nexora/search?q=third")).status).toBe(200);
    } finally {
      vi.stubEnv("NEXORA_GEOCODER_DAILY_BUDGET", "");
    }
  });

  it("LocationIQ's 'Rate Limited Day' stops further upstream calls for the day", async () => {
    provider = () =>
      new Response(JSON.stringify({ error: "Rate Limited Day" }), { status: 429 });
    const { call } = await listen();
    const first = await call("/api/nexora/search?q=first");
    expect(first.status).toBe(503);
    expect((await first.json()).error).toMatch(/rate limit/i);
    upstream.length = 0;
    const second = await call("/api/nexora/search?q=second");
    expect(second.status).toBe(503);
    expect((await second.json()).budgetExhausted).toBe(true);
    expect(upstream).toEqual([]);
  });

  it("defaults to a budget under the free 5,000/day tier and caps the cache at 48 h", async () => {
    const g = await import("../server/nexora/geocoder");
    expect(g.geocoderDailyBudget({})).toBe(4000);
    expect(g.geocoderDailyBudget({ NEXORA_GEOCODER_DAILY_BUDGET: "1200" })).toBe(1200);
    expect(g.geocoderDailyBudget({ NEXORA_GEOCODER_DAILY_BUDGET: "nonsense" })).toBe(4000);
    expect(g.geocoderDailyBudget({ NEXORA_GEOCODER_DAILY_BUDGET: "0" })).toBe(4000);
    expect(g.geocoderDailyBudget({ NEXORA_GEOCODER_DAILY_BUDGET: "off" })).toBeNull();
    expect(g.searchCacheTtlSeconds({})).toBe(86400);
    expect(g.searchCacheTtlSeconds({ NEXORA_SEARCH_CACHE_TTL_S: "999999" })).toBe(172800);
    expect(g.searchCacheTtlSeconds({ NEXORA_SEARCH_CACHE_TTL_S: "0" })).toBe(0);
  });
});

describe("SEC-007: bounded provider queues with deadlines", () => {
  it("a client that disconnects while queued causes no upstream call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    provider = async (url) => {
      await gate;
      return defaultProvider(url);
    };
    const { call } = await listen();
    const first = call("/api/nexora/routes", json(trip));
    await vi.waitUntil(() => routeCalls().length === 1);
    const controller = new AbortController();
    const second = call("/api/nexora/routes", { ...json(trip), signal: controller.signal });
    await new Promise((r) => setTimeout(r, 50));
    controller.abort();
    await expect(second).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    release();
    expect((await first).status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(routeCalls()).toHaveLength(1);
  });

  it("the 7th request while one is in flight and five wait gets 503 in under 100 ms", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    provider = async (url) => {
      await gate;
      return defaultProvider(url);
    };
    const { call } = await listen({ ...FAST, routesPerMinute: 100 });
    const pending = [call("/api/nexora/routes", json(trip))];
    await vi.waitUntil(() => routeCalls().length === 1);
    for (let i = 0; i < 5; i++) pending.push(call("/api/nexora/routes", json(trip)));
    await new Promise((r) => setTimeout(r, 50));
    const started = performance.now();
    const seventh = await call("/api/nexora/routes", json(trip));
    expect(performance.now() - started).toBeLessThan(100);
    expect(seventh.status).toBe(503);
    expect(seventh.headers.get("retry-after")).toBe("5");
    expect((await seventh.json()).error).toMatch(/busy/i);
    release();
    const statuses = await Promise.all(pending.map(async (p) => (await p).status));
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
  });

  it("a stalled provider cannot hold a request beyond its budget", async () => {
    provider = (_url, init) => hang(init);
    const lines: unknown[] = [];
    const { call } = await listen({ ...FAST, routeBudgetMs: 200, log: (l) => lines.push(l) });
    const started = performance.now();
    const r = await call("/api/nexora/routes", json(trip));
    expect(performance.now() - started).toBeLessThan(1500);
    expect(r.status).toBe(503);
    expect(lines).toEqual([
      expect.objectContaining({ provider: "routing", class: "timeout", mode: "driving" }),
    ]);
    const caps = await (await call("/api/nexora/capabilities")).json();
    expect(caps.routing.health.driving.status).toBe("unavailable");
  });

  it("search does not wait behind a stalled routing provider", async () => {
    provider = (url, init) =>
      url.includes("routing.openstreetmap.de") ? hang(init) : defaultProvider(url);
    const { call } = await listen({ ...FAST, routeBudgetMs: 2000 });
    const route = call("/api/nexora/routes", json(trip));
    await vi.waitUntil(() => routeCalls().length === 1);
    const started = performance.now();
    const search = await call("/api/nexora/search?q=tate%20modern");
    expect(search.status).toBe(200);
    expect(performance.now() - started).toBeLessThan(500);
    expect((await route).status).toBe(503);
  });

  it("the default route budget stays below the app's 18 s route timeout", async () => {
    const { resolveRouteOptions } = await import("../server/nexora/routes");
    const o = resolveRouteOptions({}, {});
    expect(o.routeBudgetMs).toBe(9000);
    expect(o.searchBudgetMs).toBe(8000);
    expect(o.maxQueued).toBe(5);
    expect(o.routerSpacingMs).toBeGreaterThanOrEqual(1000); // OSRM demo server: max 1 req/s
    expect(o.geocoderSpacingMs).toBeGreaterThanOrEqual(500); // LocationIQ free: 2 req/s
  });
});

describe("QA-003: search error handling and key non-echo", () => {
  const cases: Array<[string, ProviderHandler, number, RegExp]> = [
    ["upstream 429", () => new Response("{}", { status: 429 }), 503, /rate limit/i],
    ["upstream 500", () => new Response("oops", { status: 500 }), 503, /failed/i],
    ["upstream non-JSON 200", () => new Response("<html>", { status: 200 }), 502, /unexpected/i],
    ["upstream wrong shape", () => new Response(JSON.stringify({ hello: 1 }), { status: 200 }), 502, /unexpected/i],
    ["network error", () => Promise.reject(new TypeError("fetch failed")), 503, /failed/i],
  ];
  for (const [name, handler, status, message] of cases) {
    it(`${name} → ${status} JSON, logged without the query or key`, async () => {
      provider = handler;
      const lines: unknown[] = [];
      const { call } = await listen({ ...FAST, log: (l) => lines.push(l) });
      const r = await call("/api/nexora/search?q=secret%20street%2042");
      expect(r.status).toBe(status);
      expect(r.headers.get("content-type")).toMatch(/application\/json/);
      const text = await r.text();
      expect(JSON.parse(text).error).toMatch(message);
      expect(text).not.toContain("test-only-key");
      expect(lines).toHaveLength(1);
      const line = JSON.stringify(lines[0]);
      expect(line).toContain('"provider":"search"');
      expect(line).not.toMatch(/secret|street|test-only-key/);
    });
  }

  it("too short and too long queries → 400 with no upstream call", async () => {
    const { call } = await listen();
    expect((await call("/api/nexora/search?q=ab")).status).toBe(400);
    expect((await call(`/api/nexora/search?q=${"x".repeat(151)}`)).status).toBe(400);
    expect((await call("/api/nexora/search")).status).toBe(400);
    expect(upstream).toEqual([]);
  });

  it("the geocoder key never appears in any response", async () => {
    const { call } = await listen();
    const responses = [
      await call("/api/nexora/capabilities"),
      await call("/api/nexora/search?q=tate%20modern"),
      await call("/api/nexora/search?q=ab"),
    ];
    for (const r of responses) {
      expect(await r.text()).not.toContain("test-only-key");
      for (const [, v] of r.headers) expect(v).not.toContain("test-only-key");
    }
  });

  it("capabilities reports the current quota state and features", async () => {
    const { call } = await listen();
    const caps = await (await call("/api/nexora/capabilities")).json();
    expect(Object.keys(caps.search).sort()).toEqual(
      [
        "attribution",
        "attributionUrl",
        "autocomplete",
        "budgetRemaining",
        "budgetResetsAt",
        "cacheHits",
        "cacheTtlSeconds",
        "configured",
        "dailyBudget",
        "perMinutePerClient",
        "provider",
        "upstreamCallsToday",
      ].sort(),
    );
    expect(caps.search).toMatchObject({
      dailyBudget: 4000,
      budgetRemaining: 4000,
      cacheTtlSeconds: 86400,
      perMinutePerClient: 15,
    });
    expect(caps.routing.maxStops).toBe(3);
    // OPS-001: no longer claims the app is simulation-only or has no incidents.
    expect(caps.navigation).not.toBe("simulation only");
    expect(caps.navigation).toMatch(/live GPS/);
    expect(caps.liveIncidents).toMatch(/TfL/);
  });
});

describe("OPS-007: provider failures are logged and classified", () => {
  it("one line per routing failure with provider, status, class and duration only", async () => {
    provider = () => new Response(JSON.stringify({ code: "Busy" }), { status: 500 });
    const lines: any[] = [];
    const { call } = await listen({ ...FAST, log: (l) => lines.push(l) });
    expect((await call("/api/nexora/routes", json(trip))).status).toBe(503);
    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0]).sort()).toEqual(
      ["class", "durationMs", "event", "mode", "provider", "status"].sort(),
    );
    expect(lines[0]).toMatchObject({ event: "provider_failure", provider: "routing", class: "http", status: 500 });
    expect(JSON.stringify(lines[0])).not.toMatch(/51\.5|-0\.1/);
  });

  it("a reply NEXORA cannot map marks the mode degraded, not unavailable", async () => {
    provider = () =>
      new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 1 }] }), { status: 200 });
    const lines: any[] = [];
    const { call } = await listen({ ...FAST, log: (l) => lines.push(l) });
    const r = await call("/api/nexora/routes", json(trip));
    expect(r.status).toBe(502);
    expect(lines[0]).toMatchObject({ provider: "routing", class: "schema" });
    const caps = await (await call("/api/nexora/capabilities")).json();
    expect(caps.routing.health.driving).toMatchObject({ status: "degraded" });
  });

  it("an upstream 429 marks the mode rate-limited", async () => {
    provider = () => new Response("{}", { status: 429 });
    const { call } = await listen();
    expect((await call("/api/nexora/routes", json(trip))).status).toBe(503);
    const caps = await (await call("/api/nexora/capabilities")).json();
    expect(caps.routing.health.driving.status).toBe("limited");
  });
});

describe("OPS-006: JSON errors and 404s", () => {
  it("malformed JSON → 400 application/json with no stack, even in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const { call } = await listen();
      const r = await call("/api/nexora/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"origin": [0, ',
      });
      expect(r.status).toBe(400);
      expect(r.headers.get("content-type")).toMatch(/application\/json/);
      const text = await r.text();
      expect(JSON.parse(text).error).toBe("Request body is not valid JSON.");
      expect(text).not.toMatch(/at \w+ \(|node_modules|SyntaxError/);
    } finally {
      vi.stubEnv("NODE_ENV", "test");
    }
  });

  it("an oversized body → 413 JSON", async () => {
    const r = await call(
      "/api/nexora/routes",
      json({ ...trip, pad: "x".repeat(20_000) }),
    );
    expect(r.status).toBe(413);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("unknown paths → JSON 404", async () => {
    for (const path of ["/api/nexora/nope", "/api/unknown", "/anything", "/api/nexora/map-assets/missing.js"]) {
      const r = await call(path);
      expect(r.status, path).toBe(404);
      expect(r.headers.get("content-type"), path).toMatch(/application\/json/);
    }
  });
});

describe("SEC-008: security headers", () => {
  it("JSON routes send nosniff, no-referrer and a deny-all CSP; X-Powered-By is off", async () => {
    for (const path of ["/api/health", "/api/nexora/capabilities", "/api/nexora/search?q=ab", "/api/nope"]) {
      const r = await call(path);
      expect(r.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(r.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(r.headers.get("content-security-policy"), path).toContain("frame-ancestors 'none'");
      expect(r.headers.get("x-powered-by"), path).toBeNull();
    }
  });

  it("the map page sends a CSP that allows its own assets and OSM tiles and limits framing", async () => {
    const r = await call("/api/nexora/map");
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob: https://tile.openstreetmap.org");
    expect(csp).toMatch(/frame-ancestors 'self'[^;]*http:\/\/localhost:\*/);
    const ancestors = csp.split(";").find((d) => d.trim().startsWith("frame-ancestors")) ?? "";
    expect(ancestors.trim().split(/\s+/)).not.toContain("*"); // no bare wildcard
    expect(csp).toContain("object-src 'none'");
    // Every script and stylesheet the document references is same-origin.
    const html = await r.text();
    for (const m of html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g))
      expect(m[1].startsWith("/api/nexora/map-assets/"), m[1]).toBe(true);
  });
});

describe("OPS-001 / OPS-005: render.yaml blueprint", () => {
  const blueprint = readFileSync(join(__dirname, "../render.yaml"), "utf8");
  it("health-checks /api/health", () => {
    expect(blueprint).toMatch(/healthCheckPath:\s*\/api\/health\s*$/m);
  });
  it("installs devDependencies (esbuild) even with NODE_ENV=production", () => {
    expect(blueprint).toMatch(/buildCommand:.*pnpm install --frozen-lockfile --prod=false && pnpm build/);
  });
  it("declares the TfL key slot without a value", () => {
    expect(blueprint).toMatch(/- key: NEXORA_TFL_APP_KEY\s*\n\s*sync: false/);
    expect(blueprint).toMatch(/- key: NEXORA_GEOCODER_KEY\s*\n\s*sync: false/);
  });
});
