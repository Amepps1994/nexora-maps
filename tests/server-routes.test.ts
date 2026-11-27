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

beforeAll(async () => {
  vi.stubEnv("NEXORA_GEOCODER_PROVIDER", "locationiq");
  vi.stubEnv("NEXORA_GEOCODER_KEY", "test-only-key");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(base)) return realFetch(input, init);
    upstream.push(url);
    if (url.includes("locationiq.com")) return new Response(geocoderReply, { status: 200 });
    if (url.includes("api.tfl.gov.uk")) return new Response(tflFixture, { status: 200 });
    return new Response(osrmFixture, { status: 200 });
  });
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  upstream.length = 0;
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
