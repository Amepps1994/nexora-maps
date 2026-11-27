import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addStop,
  removeStop,
  moveStop,
  checkItinerary,
  scheduleEstimate,
  ukClockLabel,
  ukOffsetMinutes,
  nextUkTime,
  checkAvoidances,
  parseAvoidanceConfig,
  MAX_INTERMEDIATE_STOPS,
  SCHEDULE_POLICY,
} from "../shared/nexora/itinerary";
import { DEMO_PLACES, syntheticItinerary } from "../shared/nexora/fixtures";
import { mapOsrmRoutes } from "../server/nexora/route-mapper";
import { scoreRoutes, type Place } from "../shared/nexora/domain";
import { registerNexoraRoutes } from "../server/nexora/routes";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures/osrm-car-multistop.json"), "utf8"),
).body;
const [kingsCross, stPauls, tate] = [
  DEMO_PLACES.find((p) => /King/.test(p.name))!,
  DEMO_PLACES.find((p) => /Paul/.test(p.name)) ?? DEMO_PLACES[2],
  DEMO_PLACES.find((p) => /Tate/.test(p.name))!,
];
const place = (id: string, lon: number, lat: number): Place => ({
  id,
  name: id,
  subtitle: "",
  coordinate: [lon, lat],
  category: "pin",
  source: "test",
});

describe("stop list editing", () => {
  it("adds, keeps order and never mutates input", () => {
    const a = place("a", -0.1, 51.5);
    const b = place("b", -0.11, 51.51);
    const one = addStop([], a);
    const two = addStop(one, b);
    expect(one).toHaveLength(1);
    expect(two.map((s) => s.name)).toEqual(["a", "b"]);
  });
  it("gives a repeated place a distinct id", () => {
    const a = place("a", -0.1, 51.5);
    const two = addStop(addStop([], a), a);
    expect(new Set(two.map((s) => s.id)).size).toBe(2);
  });
  it(`rejects more than ${MAX_INTERMEDIATE_STOPS} stops`, () => {
    let stops: Place[] = [];
    for (let i = 0; i < MAX_INTERMEDIATE_STOPS; i++)
      stops = addStop(stops, place(`s${i}`, -0.1 - i / 100, 51.5));
    expect(() => addStop(stops, place("x", 0, 51))).toThrow(RangeError);
  });
  it("rejects invalid coordinates", () =>
    expect(() => addStop([], place("bad", 200, 51))).toThrow(RangeError));
  it("removes by index and ignores bad indexes", () => {
    const stops = addStop(addStop([], place("a", 0, 51)), place("b", 0.1, 51));
    expect(removeStop(stops, 0).map((s) => s.name)).toEqual(["b"]);
    expect(removeStop(stops, 9)).toHaveLength(2);
    expect(removeStop(stops, -1)).toHaveLength(2);
  });
  it("moves up/down and treats edge moves as no-ops", () => {
    const stops = [place("a", 0, 51), place("b", 0.1, 51), place("c", 0.2, 51)];
    expect(moveStop(stops, 2, -1).map((s) => s.name)).toEqual(["a", "c", "b"]);
    expect(moveStop(stops, 0, 1).map((s) => s.name)).toEqual(["b", "a", "c"]);
    expect(moveStop(stops, 0, -1).map((s) => s.name)).toEqual(["a", "b", "c"]);
    expect(moveStop(stops, 2, 1).map((s) => s.name)).toEqual(["a", "b", "c"]);
    expect(stops.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });
});

describe("itinerary validation", () => {
  it("needs a destination", () =>
    expect(checkItinerary(kingsCross, [], null).ok).toBe(false));
  it("accepts distinct points", () =>
    expect(checkItinerary(kingsCross, [stPauls], tate).ok).toBe(true));
  it("rejects a stop at the origin", () => {
    const r = checkItinerary(kingsCross, [{ ...kingsCross, id: "dup" }], tate);
    expect(r.ok).toBe(false);
  });
  it("rejects consecutive identical stops but allows revisiting later", () => {
    const a = place("a", -0.1, 51.5);
    const b = place("b", -0.12, 51.51);
    expect(checkItinerary(kingsCross, [a, a], tate).ok).toBe(false);
    expect(checkItinerary(kingsCross, [a, b, a], tate).ok).toBe(true);
  });
});

describe("departure and arrival estimates", () => {
  const now = Date.UTC(2026, 10, 27, 12, 0); // 12:00 GMT, 27 Nov 2026
  it("leave now adds free-flow duration and states no traffic model", () => {
    const r = scheduleEstimate({ durationS: 900, kind: "now", now });
    expect(r.ok && r.arriveAt - r.departAt).toBe(900_000);
    expect(r.ok && r.basis).toMatch(/No traffic prediction/);
  });
  it("leave later keeps the same duration", () => {
    const at = now + 3 * 3600_000;
    const r = scheduleEstimate({ durationS: 900, kind: "depart", at, now });
    expect(r.ok && [r.departAt, r.arriveAt]).toEqual([at, at + 900_000]);
  });
  it("rejects a departure that has passed", () =>
    expect(
      scheduleEstimate({
        durationS: 900,
        kind: "depart",
        at: now - 3600_000,
        now,
      }).ok,
    ).toBe(false));
  it("arrive by subtracts duration", () => {
    const at = now + 3600_000;
    const r = scheduleEstimate({ durationS: 1200, kind: "arrive", at, now });
    expect(r.ok && r.departAt).toBe(at - 1_200_000);
    expect(r.ok && r.late).toBe(false);
  });
  it("arrive by flags a target that cannot be met", () => {
    const r = scheduleEstimate({
      durationS: 3600,
      kind: "arrive",
      at: now + 600_000,
      now,
    });
    expect(r.ok && r.late).toBe(true);
    expect(r.ok && r.departAt).toBe(now);
  });
  it("refuses estimates beyond the horizon", () =>
    expect(
      scheduleEstimate({
        durationS: 60,
        kind: "depart",
        at: now + SCHEDULE_POLICY.maxHorizonMs + 1,
        now,
      }).ok,
    ).toBe(false));
  it("rejects unknown duration", () =>
    expect(scheduleEstimate({ durationS: NaN, kind: "now", now }).ok).toBe(
      false,
    ));
});

describe("UK time", () => {
  it("applies BST between the last Sundays of March and October", () => {
    expect(ukOffsetMinutes(Date.UTC(2026, 0, 15))).toBe(0);
    expect(ukOffsetMinutes(Date.UTC(2026, 6, 15))).toBe(60);
    // 2026: BST starts 29 Mar 01:00 UTC, ends 25 Oct 01:00 UTC
    expect(ukOffsetMinutes(Date.UTC(2026, 2, 29, 0, 59))).toBe(0);
    expect(ukOffsetMinutes(Date.UTC(2026, 2, 29, 1, 0))).toBe(60);
    expect(ukOffsetMinutes(Date.UTC(2026, 9, 25, 0, 59))).toBe(60);
    expect(ukOffsetMinutes(Date.UTC(2026, 9, 25, 1, 0))).toBe(0);
  });
  it("labels GMT and BST clock times", () => {
    expect(ukClockLabel(Date.UTC(2026, 10, 27, 14, 5))).toBe("14:05 GMT");
    expect(ukClockLabel(Date.UTC(2026, 6, 1, 14, 5))).toBe("15:05 BST");
  });
  it("adds the day when it differs from today", () => {
    const now = Date.UTC(2026, 10, 27, 23, 0);
    expect(ukClockLabel(Date.UTC(2026, 10, 28, 0, 30), now)).toBe(
      "Sat 28 Nov 00:30 GMT",
    );
    expect(ukClockLabel(Date.UTC(2026, 10, 27, 23, 30), now)).toBe("23:30 GMT");
  });
  it("parses HH:MM as the next UK occurrence", () => {
    const now = Date.UTC(2026, 6, 1, 10, 0); // 11:00 BST
    expect(nextUkTime("12:30", now)).toBe(Date.UTC(2026, 6, 1, 11, 30));
    expect(nextUkTime("09:00", now)).toBe(Date.UTC(2026, 6, 2, 8, 0));
    expect(nextUkTime("25:00", now)).toBeNull();
    expect(nextUkTime("noon", now)).toBeNull();
  });
});

describe("avoidance capability", () => {
  it("parses operator config and drops unknown classes", () =>
    expect(parseAvoidanceConfig(" toll, unpaved ,MOTORWAY")).toEqual([
      "motorway",
      "toll",
    ]));
  it("defaults to nothing supported", () =>
    expect(parseAvoidanceConfig(undefined)).toEqual([]));
  it("refuses avoidances the graph cannot honour", () => {
    const r = checkAvoidances(["toll"], "driving", []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/cannot avoid: toll/);
  });
  it("refuses avoidances for walking", () =>
    expect(checkAvoidances(["ferry"], "walking", ["ferry"]).ok).toBe(false));
  it("passes supported avoidances in canonical order", () => {
    const r = checkAvoidances(["ferry", "motorway", "ferry"], "driving", [
      "motorway",
      "ferry",
    ]);
    expect(r.ok && r.exclude).toEqual(["motorway", "ferry"]);
  });
});

describe("multi-stop provider mapping (real 27 Nov 2026 test-provider response)", () => {
  const routes = mapOsrmRoutes(fixture, "driving", {
    generatedAt: "2026-11-27T00:36:27Z",
  });
  it("returns one route with two legs", () => {
    expect(routes).toHaveLength(1);
    expect(routes[0].legs).toEqual([
      { distanceM: 3135.4, durationS: 499.3 },
      { distanceM: 2240.7, durationS: 387.4 },
    ]);
  });
  it("leg totals add up to the route totals", () => {
    const legs = routes[0].legs!;
    expect(legs.reduce((a, l) => a + l.distanceM, 0)).toBeCloseTo(
      routes[0].distanceM,
      1,
    );
    expect(legs.reduce((a, l) => a + l.durationS, 0)).toBeCloseTo(
      routes[0].durationS,
      1,
    );
  });
  it("labels the intermediate arrival as a stop and the last as destination", () => {
    const arrivals = routes[0].steps.filter((s) =>
      /Arrive/.test(s.instruction),
    );
    expect(arrivals.map((s) => s.instruction)).toEqual([
      "Arrive at stop 1",
      "Arrive at your destination",
    ]);
    expect(arrivals[0].type).toBe("waypoint");
  });
  it("keeps the non-zero depart step of the second leg", () => {
    // OSRM's second-leg depart here is 200 m long, so it must not be dropped.
    expect(
      routes[0].steps.filter((s) => s.instruction.startsWith("Head")),
    ).toHaveLength(2);
    expect(routes[0].steps.reduce((a, s) => a + s.distanceM, 0)).toBeCloseTo(
      routes[0].distanceM,
      0,
    );
  });
  it("drops a zero-length repeated depart at a stop", () => {
    const copy = JSON.parse(JSON.stringify(fixture));
    copy.routes[0].legs[1].steps[0].distance = 0;
    const steps = mapOsrmRoutes(copy, "driving")[0].steps;
    expect(steps.filter((s) => s.instruction.startsWith("Head"))).toHaveLength(
      1,
    );
  });
  it("scores without inventing alternatives", () => {
    const ranked = scoreRoutes(routes, "fastest");
    expect(ranked).toHaveLength(1);
    expect(ranked[0].explanation).toMatch(/unknown: reliability, cost/);
  });
  it("single-leg responses carry no legs field", () => {
    const single = JSON.parse(JSON.stringify(fixture));
    single.routes[0].legs = [single.routes[0].legs[0]];
    expect(mapOsrmRoutes(single, "driving")[0].legs).toBeUndefined();
  });
});

describe("synthetic multi-stop demo", () => {
  it("joins legs into one labelled simulated route", () => {
    const [r] = syntheticItinerary(kingsCross, [stPauls], tate, "walking");
    expect(r.demo).toBe(true);
    expect(r.legs).toHaveLength(2);
    expect(r.steps.some((s) => s.type === "synthetic-stop")).toBe(true);
    expect(r.steps.at(-1)!.type).toBe("synthetic-arrive");
    expect(r.distanceM).toBeCloseTo(
      r.legs!.reduce((a, l) => a + l.distanceM, 0),
      6,
    );
    for (const s of r.steps) expect(s.instruction).toMatch(/not (a )?road/);
  });
  it("is the plain synthetic route without stops", () =>
    expect(syntheticItinerary(kingsCross, [], tate, "walking")).toHaveLength(
      2,
    ));
});

describe("POST /api/nexora/routes with stops and avoidances", () => {
  let server: Server;
  let base = "";
  const realFetch = globalThis.fetch;
  const providerCalls: string[] = [];
  let providerResponse: () => Response = () =>
    new Response(JSON.stringify(fixture), { status: 200 });
  beforeAll(async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith(base)) return realFetch(input, init);
        providerCalls.push(url);
        return providerResponse();
      },
    );
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
    delete process.env.NEXORA_CAR_EXCLUDE;
  });
  afterEach(() => {
    providerCalls.length = 0;
    delete process.env.NEXORA_CAR_EXCLUDE;
    providerResponse = () =>
      new Response(JSON.stringify(fixture), { status: 200 });
  });
  const post = (body: unknown) =>
    realFetch(`${base}/api/nexora/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const trip = {
    origin: [-0.124, 51.5308],
    destination: [-0.0994, 51.5076],
    mode: "driving",
  };

  it("advertises no avoidances by default", async () => {
    const caps = await (
      await realFetch(`${base}/api/nexora/capabilities`)
    ).json();
    expect(caps.routing.avoid.driving).toEqual([]);
    expect(caps.routing.alternativesWithStops).toBe(false);
  });
  it("refuses unsupported avoidances without calling the provider", async () => {
    const r = await post({ ...trip, avoid: ["toll"] });
    expect(r.status).toBe(422);
    expect((await r.json()).unsupported).toBe(true);
    expect(providerCalls).toHaveLength(0);
  });
  it("rejects unknown avoidance names", async () =>
    expect((await post({ ...trip, avoid: ["unpaved"] })).status).toBe(400));
  it("forwards stops in order and returns legs", async () => {
    const r = await post({ ...trip, stops: [[-0.0984, 51.5138]] });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(providerCalls[0]).toContain(
      "/route/v1/driving/-0.124,51.5308;-0.0984,51.5138;-0.0994,51.5076?",
    );
    expect(providerCalls[0]).not.toContain("exclude=");
    expect(body.routes[0].legs).toHaveLength(2);
    expect(body.notice).toMatch(/no alternatives with stops/);
  });
  it("forwards operator-declared exclude classes", async () => {
    process.env.NEXORA_CAR_EXCLUDE = "motorway,toll";
    const r = await post({ ...trip, avoid: ["toll", "motorway"] });
    expect(r.status).toBe(200);
    expect(providerCalls[0]).toContain("&exclude=motorway,toll");
    expect((await r.json()).routes[0].excluded).toEqual(["motorway", "toll"]);
  });
  it("maps a provider InvalidValue rejection to an honest 422", async () => {
    process.env.NEXORA_CAR_EXCLUDE = "ferry";
    providerResponse = () =>
      new Response(
        JSON.stringify({
          code: "InvalidValue",
          message: "Exclude flag combination is not supported.",
        }),
        { status: 400 },
      );
    const r = await post({ ...trip, avoid: ["ferry"] });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/No route was substituted/);
  });
  it("maps NoRoute with avoidances to a 404 that names the cause", async () => {
    process.env.NEXORA_CAR_EXCLUDE = "ferry";
    providerResponse = () =>
      new Response(JSON.stringify({ code: "NoRoute" }), { status: 400 });
    const r = await post({ ...trip, avoid: ["ferry"] });
    expect(r.status).toBe(404);
    expect((await r.json()).error).toMatch(/No route avoids/);
  });
}, 20000);
