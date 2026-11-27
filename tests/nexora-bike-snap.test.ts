import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  betterNamedSnap,
  suspectBikeEnds,
} from "../server/nexora/bike-snap";
import { registerNexoraRoutes } from "../server/nexora/routes";

// Shapes taken from the 27 Nov 2026 probe of routed-bike, London Bridge -> Tate Modern.
const step = (mode: string, distance: number) => ({
  mode,
  distance,
  duration: distance / 4,
  name: "",
  maneuver: { type: "depart", location: [-0.0877, 51.5079] },
  geometry: { type: "LineString", coordinates: [[-0.0877, 51.5079], [-0.0789, 51.5073]] },
});
const arrive = { ...step("cycling", 0), maneuver: { type: "arrive", location: [-0.0993, 51.5076] } };
const route = (distance: number, first: ReturnType<typeof step>) => ({
  distance,
  duration: distance / 4,
  weight: distance,
  geometry: { type: "LineString", coordinates: [[-0.0877, 51.5079], [-0.0993, 51.5076]] },
  legs: [{ distance, duration: distance / 4, steps: [first, step("cycling", distance - first.distance), arrive] }],
});
const detour = { code: "Ok", routes: [route(2661, step("pushing bike", 616))], waypoints: [] };
const direct = { code: "Ok", routes: [route(1444, step("cycling", 198))], waypoints: [] };
const nearest = {
  code: "Ok",
  waypoints: [
    { name: "", distance: 2.9, location: [-0.087702, 51.507925] },
    { name: "London Bridge", distance: 4.2, location: [-0.087662, 51.507886] },
    { name: "", distance: 6.1, location: [-0.08771, 51.50796] },
  ],
};

describe("bike snap helpers", () => {
  it("flags a long pushing-bike step at the start or end only", () => {
    expect(suspectBikeEnds(detour.routes[0], 2)).toEqual([0]);
    expect(suspectBikeEnds(direct.routes[0], 2)).toEqual([]);
    const end = route(2000, step("cycling", 300));
    end.legs[0].steps.splice(2, 0, step("pushing bike", 400));
    expect(suspectBikeEnds(end, 3)).toEqual([2]);
    expect(suspectBikeEnds(route(900, step("pushing bike", 120)), 2)).toEqual([]);
    expect(suspectBikeEnds(undefined, 2)).toEqual([]);
  });
  it("prefers a named road only when it is nearly as close", () => {
    expect(betterNamedSnap(nearest.waypoints as never)).toEqual({
      name: "London Bridge",
      location: [-0.087662, 51.507886],
    });
    expect(betterNamedSnap([{ name: "Lower Thames St", distance: 2 }])).toBeNull();
    expect(
      betterNamedSnap([
        { name: "", distance: 2, location: [0, 0] },
        { name: "Far Road", distance: 40, location: [1, 1] },
      ]),
    ).toBeNull();
    expect(betterNamedSnap(undefined)).toBeNull();
  });
});

describe("POST /api/nexora/routes cycling re-snap", () => {
  let server: Server;
  let base = "";
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  let retryBody: unknown = direct;
  beforeAll(async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith(base)) return realFetch(input, init);
      calls.push(url);
      const body = url.includes("/nearest/")
        ? nearest
        : url.includes("-0.0877,51.5079;")
          ? detour
          : retryBody;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const app = express();
    app.use(express.json());
    registerNexoraRoutes(app);
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    vi.restoreAllMocks();
    server?.close();
  });
  afterEach(() => {
    calls.length = 0;
    retryBody = direct;
  });
  const post = (mode: string) =>
    realFetch(`${base}/api/nexora/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: [-0.0877, 51.5079],
        destination: [-0.0993, 51.5076],
        mode,
      }),
    });

  it("re-snaps a bridge start to the named road and returns the shorter route", async () => {
    const r = await post("cycling");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.routes[0].distanceM).toBe(1444);
    expect(d.notice).toContain("start snapped to London Bridge");
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("/nearest/v1/driving/-0.0877,51.5079?number=3");
    expect(calls[2]).toContain("-0.087662,51.507886;-0.0993,51.5076");
  }, 15000);
  it("keeps the original route if the retry is not shorter", async () => {
    retryBody = { code: "Ok", routes: [route(3000, step("cycling", 200))] };
    const d = await (await post("cycling")).json();
    expect(d.routes[0].distanceM).toBe(2661);
    expect(d.notice).not.toContain("snapped");
  }, 15000);
  it("does not re-snap walking or driving", async () => {
    await post("walking");
    expect(calls).toHaveLength(1);
  }, 15000);
});
