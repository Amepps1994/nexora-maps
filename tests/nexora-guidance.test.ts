import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkStale,
  GUIDANCE_POLICY,
  guidanceView,
  indexRoute,
  initialTracker,
  nextPrompt,
  projectOnRoute,
  spokenDistance,
  stopsPassed,
  trackFix,
  type GuidanceFix,
  type GuidanceMode,
  type RouteIndex,
  type TrackerState,
} from "../shared/nexora/guidance";
import { rerouteDecision, type Coord, type Route } from "../shared/nexora/domain";
import { mapOsrmRoutes } from "../server/nexora/route-mapper";

// Real OSRM car route, King's Cross -> Tate Modern (captured 2026-11-27, docs/).
const liveRoute: Route = JSON.parse(
  readFileSync(join(__dirname, "../docs/live-route-sample.json"), "utf8"),
).routes[0];
const multistop: Route = mapOsrmRoutes(
  JSON.parse(
    readFileSync(join(__dirname, "fixtures/osrm-car-multistop.json"), "utf8"),
  ).body,
  "driving",
)[0];

/** Deterministic pseudo-random noise so mock traces are repeatable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Point `along` metres down the route, optionally pushed sideways `lateral` metres. */
function pointAt(index: RouteIndex, along: number, lateral = 0): Coord {
  const g = index.route.geometry;
  let i = 0;
  while (i < g.length - 2 && index.cumulativeM[i + 1] < along) i++;
  const seg = index.cumulativeM[i + 1] - index.cumulativeM[i];
  const t = seg ? Math.min(1, Math.max(0, (along - index.cumulativeM[i]) / seg)) : 0;
  const a = g[i],
    b = g[i + 1];
  const p: Coord = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (!lateral) return p;
  const k = Math.cos((p[1] * Math.PI) / 180);
  const dx = (b[0] - a[0]) * k,
    dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const metresPerDeg = 111_195;
  return [
    p[0] + ((-dy / len) * lateral) / metresPerDeg / k,
    p[1] + ((dx / len) * lateral) / metresPerDeg,
  ];
}

/** Mock GPS trace: 1 Hz fixes at `speed` m/s with up to `noiseM` metres of jitter. */
function mockTrace(
  index: RouteIndex,
  opts: { speed: number; noiseM: number; accuracyM: number; seed?: number; from?: number; to?: number; t0?: number },
): GuidanceFix[] {
  const rand = rng(opts.seed ?? 7);
  const fixes: GuidanceFix[] = [];
  const end = opts.to ?? index.totalM;
  let t = opts.t0 ?? 1_800_000_000_000;
  for (let d = opts.from ?? 0; d <= end + opts.speed; d += opts.speed) {
    const along = Math.min(d, end);
    fixes.push({
      coord: pointAt(index, along, (rand() * 2 - 1) * opts.noiseM),
      accuracyM: opts.accuracyM,
      speedMps: opts.speed,
      timestamp: (t += 1000),
    });
    if (along === end) break;
  }
  return fixes;
}

function drive(
  index: RouteIndex,
  fixes: GuidanceFix[],
  mode: GuidanceMode = "driving",
  metric = false,
  state: TrackerState = initialTracker(),
) {
  const spoken = new Set<string>();
  const prompts: string[] = [];
  const states: TrackerState[] = [];
  for (const fix of fixes) {
    state = trackFix(index, state, fix, mode);
    states.push(state);
    if (state.status === "on-route" || state.status === "arrived") {
      const { prompt, skip } = nextPrompt(index, state.alongM, mode, metric, spoken);
      skip.forEach((k) => spoken.add(k));
      if (prompt) {
        spoken.add(prompt.key);
        prompts.push(prompt.text);
      }
    }
  }
  return { state, states, prompts };
}

describe("route index", () => {
  const index = indexRoute(liveRoute);
  it("measures the real OSRM polyline close to the provider distance", () => {
    expect(Math.abs(index.totalM - liveRoute.distanceM) / liveRoute.distanceM).toBeLessThan(0.02);
  });
  it("places step manoeuvres monotonically, ending on the last vertex", () => {
    for (let i = 1; i < index.stepStartM.length; i++)
      expect(index.stepStartM[i]).toBeGreaterThanOrEqual(index.stepStartM[i - 1]);
    expect(index.stepStartM.at(-1)).toBeCloseTo(index.totalM, 0);
  });
  it("rejects degenerate geometry", () => {
    expect(() => indexRoute({ ...liveRoute, geometry: [liveRoute.geometry[0]] })).toThrow();
  });
  it("projects a point beside the road back onto it with the right offset", () => {
    const p = pointAt(index, 1500, 20);
    const proj = projectOnRoute(index, p);
    expect(proj.offsetM).toBeGreaterThan(15);
    expect(proj.offsetM).toBeLessThan(25);
    expect(Math.abs(proj.alongM - 1500)).toBeLessThan(30);
  });
});

describe("mock GPS drive on a real OSRM route", () => {
  const index = indexRoute(liveRoute);
  const fixes = mockTrace(index, { speed: 9, noiseM: 8, accuracyM: 8 });
  const { state, states, prompts } = drive(index, fixes);

  it("stays on route under 8 m noise and arrives", () => {
    expect(states.filter((s) => s.status === "off-route")).toHaveLength(0);
    expect(state.status).toBe("arrived");
    expect(guidanceView(index, state.alongM).progress).toBe(1);
  });
  it("never moves progress backwards", () => {
    for (let i = 1; i < states.length; i++)
      expect(states[i].alongM).toBeGreaterThanOrEqual(states[i - 1].alongM);
  });
  it("speaks departure, staged turn warnings and arrival in order", () => {
    // docs/live-route-sample.json was saved before BUG-012, so its depart text is
    // the old wording; the first prompt is always the route's own depart text.
    expect(prompts[0]).toBe(liveRoute.steps[0].instruction);
    const southwark = prompts.filter((p) => p.includes("Southwark Street"));
    expect(southwark[0]).toMatch(/^In (a quarter of a mile|half a mile|\d+ yards), turn left onto Southwark Street$/);
    expect(southwark.at(-1)).toBe("Turn left onto Southwark Street");
    expect(prompts.at(-1)).toBe("Arrive at your destination");
  });
  it("does not voice plain road-name changes", () => {
    expect(prompts.some((p) => p.includes("Farringdon Road"))).toBe(false);
  });
  it("logs the full prompt script for review", () => {
    console.log(prompts.join("\n"));
  });
  it("never repeats a prompt", () => {
    expect(new Set(prompts).size).toBe(prompts.length);
  });
  it("never warns about a manoeuvre before the one in front of it", () => {
    // Park Street comes 186 m after Great Guildford Street.
    const guildford = prompts.indexOf("Turn left onto Great Guildford Street");
    const firstPark = prompts.findIndex((p) => p.includes("Park Street"));
    expect(guildford).toBeGreaterThan(-1);
    expect(firstPark).toBeGreaterThan(guildford);
  });
  it("chains a manoeuvre that follows within 80 m", () => {
    expect(prompts).toContain("Turn right onto Park Street, then turn left");
    expect(prompts).not.toContain("Turn left");
  });
  it("uses metric distances when asked", () => {
    const metric = drive(index, fixes, "driving", true).prompts;
    expect(metric.some((p) => /^In \d+ metres, /.test(p))).toBe(true);
  });
  it("reports remaining distance and time proportionally", () => {
    const v = guidanceView(index, index.totalM / 2);
    expect(v.remainingM).toBeCloseTo(index.totalM / 2, 0);
    expect(v.remainingS).toBeCloseTo(liveRoute.durationS / 2, 0);
  });
});

describe("off-route detection uses the shared reroute thresholds", () => {
  const index = indexRoute(liveRoute);
  const onRoute = mockTrace(index, { speed: 9, noiseM: 3, accuracyM: 6, to: 1200 });
  const t = onRoute.at(-1)!.timestamp;
  const deviate = (n: number, extra: Partial<GuidanceFix> = {}) =>
    Array.from({ length: n }, (_, i) => ({
      coord: pointAt(index, 1200 + (i + 1) * 9, 80 + i * 10),
      accuracyM: 8,
      speedMps: 9,
      timestamp: t + (i + 1) * 1000,
      ...extra,
    }));

  it("confirms only after three stable moving samples", () => {
    const { states } = drive(index, [...onRoute, ...deviate(4)]);
    const tail = states.slice(-4);
    expect(tail.map((s) => s.status)).toEqual(["off-route", "off-route", "off-route", "off-route"]);
    expect(tail.map((s) => s.offRouteConfirmed)).toEqual([false, false, true, true]);
    const confirmed = tail[2];
    expect(
      rerouteDecision({
        currentRemainingS: 400,
        candidateRemainingS: 420,
        mode: "locked",
        stableUpdates: confirmed.offRouteSamples,
        lastRerouteAt: Date.now(),
        now: Date.now(),
        offRoute: true,
        accuracyM: confirmed.accuracyM!,
        stationary: false,
      }).reroute,
    ).toBe(true);
  });
  it("does not declare off-route on poor accuracy (urban canyon / tunnel)", () => {
    const { states } = drive(index, [...onRoute, ...deviate(5, { accuracyM: 60 })]);
    expect(states.slice(-5).every((s) => s.status === "weak-signal" && !s.offRouteConfirmed)).toBe(true);
  });
  it("does not confirm while stationary", () => {
    const { states } = drive(index, [...onRoute, ...deviate(5, { speedMps: 0 })]);
    expect(states.at(-1)!.offRouteConfirmed).toBe(false);
  });
  it("treats a missing accuracy value as untrustworthy", () => {
    const { state } = drive(index, deviate(4, { accuracyM: null }));
    expect(state.status).toBe("weak-signal");
  });
  it("resets the count when the driver rejoins the route", () => {
    const back = mockTrace(index, { speed: 9, noiseM: 2, accuracyM: 6, from: 1240, to: 1300, t0: t + 2000 });
    const { state } = drive(index, [...onRoute, ...deviate(2), ...back]);
    expect(state.status).toBe("on-route");
    expect(state.offRouteSamples).toBe(0);
  });
});

describe("degraded signal and bad input", () => {
  const index = indexRoute(liveRoute);
  it("marks guidance weak when fixes stop arriving", () => {
    const { state } = drive(index, mockTrace(index, { speed: 9, noiseM: 0, accuracyM: 5, to: 300 }));
    const last = state.lastFix!.timestamp;
    expect(checkStale(state, last + 5_000).status).toBe("on-route");
    expect(checkStale(state, last + GUIDANCE_POLICY.staleFixMs + 1).status).toBe("weak-signal");
  });
  it("ignores out-of-order and invalid fixes", () => {
    const fixes = mockTrace(index, { speed: 9, noiseM: 0, accuracyM: 5, to: 300 });
    const { state } = drive(index, fixes);
    expect(trackFix(index, state, { ...fixes[0] }, "driving")).toBe(state);
    expect(
      trackFix(index, state, { coord: [999, 0], accuracyM: 5, speedMps: 1, timestamp: Infinity }, "driving"),
    ).toBe(state);
  });
  it("derives speed from consecutive fixes when the platform omits it", () => {
    const fixes = mockTrace(index, { speed: 10, noiseM: 0, accuracyM: 5, to: 100 }).map((f) => ({ ...f, speedMps: null }));
    const { state } = drive(index, fixes);
    expect(state.speedMps).toBeGreaterThan(9);
    expect(state.speedMps).toBeLessThan(11);
  });
});

describe("multi-stop route", () => {
  const index = indexRoute(multistop);
  it("counts intermediate stops passed for rerouting", () => {
    const waypoints = multistop.steps
      .map((s, i) => (s.type === "waypoint" ? index.stepStartM[i] : null))
      .filter((x): x is number => x !== null);
    expect(waypoints.length).toBeGreaterThan(0);
    expect(stopsPassed(index, 0)).toBe(0);
    expect(stopsPassed(index, waypoints[0] + 50)).toBe(1);
    expect(stopsPassed(index, index.totalM)).toBe(waypoints.length);
  });
  it("arrives at the end of a mock drive through every stop", () => {
    const { state, prompts } = drive(index, mockTrace(index, { speed: 8, noiseM: 5, accuracyM: 8 }));
    expect(state.status).toBe("arrived");
    expect(prompts.some((p) => /Arrive at stop 1/.test(p))).toBe(true);
  });
  it("never says Head left/right when departing (BUG-012)", () => {
    const { prompts } = drive(index, mockTrace(index, { speed: 8, noiseM: 5, accuracyM: 8 }));
    expect(prompts[0]).toMatch(/^Head (north|north-east|east|south-east|south|south-west|west|north-west)\b/);
    expect(prompts.some((p) => /^Head (left|right|slight|sharp)/.test(p))).toBe(false);
  });
});

describe("walking guidance", () => {
  const index = indexRoute(liveRoute);
  it("uses short walking bands and a tighter off-route threshold", () => {
    const { prompts, states } = drive(index, mockTrace(index, { speed: 1.4, noiseM: 4, accuracyM: 6 }), "walking");
    expect(states.at(-1)!.status).toBe("arrived");
    expect(prompts.some((p) => /^In \d+ yards, turn left onto Southwark Street$/.test(p))).toBe(true);
    expect(GUIDANCE_POLICY.offRouteDistanceM.walking).toBeLessThan(GUIDANCE_POLICY.offRouteDistanceM.driving);
  });
});

describe("spoken distances", () => {
  it.each([
    [50, false, "50 yards"],
    [280, false, "300 yards"],
    [400, false, "a quarter of a mile"],
    [800, false, "half a mile"],
    [1609, false, "1 mile"],
    [3300, false, "2.1 miles"],
    [55, true, "60 metres"],
    [280, true, "300 metres"],
    [1000, true, "1 kilometre"],
    [2450, true, "2.5 kilometres"],
  ])("%d m (metric=%s) -> %s", (m, metric, text) =>
    expect(spokenDistance(m, metric)).toBe(text));
});

/** Route through `points` given as [eastM, northM] offsets from a London origin. */
function offsetRoute(points: [number, number][], steps: Route["steps"] = []): Route {
  const lat0 = 51.53,
    lon0 = -0.12;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const geometry: Coord[] = points.map(([e, n]) => [
    lon0 + e / 111_195 / k,
    lat0 + n / 111_195,
  ]);
  return {
    id: "test-loop",
    geometry,
    distanceM: 0,
    durationS: 600,
    steps: steps.length
      ? steps
      : [
          { instruction: "Head east", distanceM: 0, durationS: 0, coordinate: geometry[0], type: "depart" },
          { instruction: "Arrive at your destination", distanceM: 0, durationS: 0, coordinate: geometry.at(-1)!, type: "arrive" },
        ],
    source: "test",
    generatedAt: "2026-11-27T00:00:00Z",
    demo: false,
    reliability: null,
    costGBP: null,
    complexity: null,
    feasible: true,
  };
}

describe("round trips and routes that pass their end (BUG-003)", () => {
  // home → 600 m east → 400 m north → back west → back south to home.
  const loop = indexRoute(
    offsetRoute([
      [0, 0],
      [600, 0],
      [600, 400],
      [0, 400],
      [0, 0],
    ]),
  );
  it("does not arrive on the first fix at home", () => {
    for (const [e, n] of [
      [0, 0],
      [-4, 3],
      [3, 6],
      [0, 8],
    ] as [number, number][]) {
      const coord = offsetRoute([[e, n], [e + 1, n]]).geometry[0];
      const s = trackFix(loop, initialTracker(), { coord, accuracyM: 12, speedMps: 0, timestamp: 1 }, "driving");
      expect(s.status).toBe("on-route");
      expect(s.alongM).toBeLessThan(50);
    }
  });
  it("stays on route through the loop and arrives back at home", () => {
    const { state, states } = drive(loop, mockTrace(loop, { speed: 10, noiseM: 6, accuracyM: 10 }));
    expect(states.slice(0, -3).every((s) => s.status === "on-route")).toBe(true);
    expect(state.status).toBe("arrived");
  });
  it("does not arrive mid-route where a U-shaped route passes within 20 m of its end", () => {
    // East 1000 m, north 300 m, back west 500 m, then south to 15 m north of the
    // first leg's midpoint. At along = 500 m the user is 15 m from the end.
    const u = indexRoute(
      offsetRoute([
        [0, 0],
        [1000, 0],
        [1000, 300],
        [500, 300],
        [500, 15],
      ]),
    );
    const firstLeg = drive(
      u,
      mockTrace(u, { speed: 10, noiseM: 0, accuracyM: 20, to: 800 }),
    );
    expect(firstLeg.states.some((s) => s.status === "arrived")).toBe(false);
    const full = drive(u, mockTrace(u, { speed: 10, noiseM: 3, accuracyM: 20 }));
    expect(full.state.status).toBe("arrived");
  });
});

describe("U-turns and bends on 'continue' are spoken (BUG-004)", () => {
  const raw = (steps: { e: number; n: number; type: string; modifier?: string; name?: string }[]) => {
    const lat0 = 51.53,
      lon0 = -0.12;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const c = (e: number, n: number): Coord => [lon0 + e / 111_195 / k, lat0 + n / 111_195];
    return {
      code: "Ok",
      routes: [
        {
          distance: 1500,
          duration: 200,
          geometry: { coordinates: steps.map((s) => c(s.e, s.n)) },
          legs: [
            {
              steps: steps.map((s, i) => ({
                distance: i < steps.length - 1 ? Math.hypot(steps[i + 1].e - s.e, steps[i + 1].n - s.n) : 0,
                duration: 10,
                name: s.name ?? "",
                maneuver: {
                  location: c(s.e, s.n),
                  type: s.type,
                  ...(s.modifier ? { modifier: s.modifier } : {}),
                },
              })),
            },
          ],
        },
      ],
    };
  };
  const route = mapOsrmRoutes(
    raw([
      { e: 0, n: 0, type: "depart", modifier: "right", name: "Pancras Road" },
      { e: 400, n: 0, type: "new name", modifier: "straight", name: "Goods Way" },
      { e: 800, n: 0, type: "continue", modifier: "left", name: "Goods Way" },
      { e: 800, n: 500, type: "continue", modifier: "uturn", name: "Goods Way" },
      { e: 800, n: 100, type: "arrive" },
    ]),
    "driving",
  )[0];
  const index = indexRoute(route);
  const { prompts, state } = drive(index, mockTrace(index, { speed: 10, noiseM: 0, accuracyM: 8 }));
  it("announces the U-turn", () =>
    expect(prompts.some((p) => /make a U-turn/i.test(p))).toBe(true));
  it("announces a continue that turns", () =>
    expect(prompts.some((p) => /turn left to stay on Goods Way/i.test(p))).toBe(true));
  it("keeps a straight road-name change silent", () =>
    expect(prompts.some((p) => /Continue onto Goods Way/i.test(p))).toBe(false));
  it("still arrives", () => expect(state.status).toBe("arrived"));
  it("speaks the departure as a compass direction, not the depart modifier (BUG-012)", () =>
    expect(prompts[0]).toBe("Head east on Pancras Road"));
});
