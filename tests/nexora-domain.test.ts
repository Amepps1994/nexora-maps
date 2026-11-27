import { describe, expect, it } from "vitest";
import {
  createIncident,
  dedupeRoutes,
  distanceLabel,
  durationLabel,
  fuelCostGBP,
  haversineM,
  INCIDENT_POLICY,
  liveIncidents,
  miles,
  navigationTransition,
  rerouteDecision,
  ROUTE_SCORE_VERSION,
  ROUTE_SCORE_WEIGHTS,
  scoreRoutes,
  transitionNavigation,
  validateCoord,
  type Coord,
  type Incident,
  type NavigationState,
  type RerouteInput,
  type Route,
} from "../shared/nexora/domain";
import {
  DEMO_PLACES,
  SYNTHETIC_ROUTE_SOURCE,
  syntheticRoute,
} from "../shared/nexora/fixtures";

function route(overrides: Partial<Route> = {}): Route {
  return {
    id: "provider-a",
    geometry: [
      [-0.1238, 51.5308],
      [-0.1269, 51.5194],
    ],
    distanceM: 1500,
    durationS: 600,
    steps: [],
    source: "Unit-test provider fixture, not a live service",
    generatedAt: "2026-11-26T00:00:00.000Z",
    demo: false,
    reliability: null,
    costGBP: null,
    complexity: null,
    feasible: true,
    ...overrides,
  };
}

function alternative(overrides: Partial<Route> = {}): Route {
  return route({
    id: "provider-b",
    geometry: [
      [-0.1238, 51.5308],
      [-0.14, 51.525],
      [-0.1269, 51.5194],
    ],
    distanceM: 2100,
    durationS: 780,
    ...overrides,
  });
}

const NOW = 1_800_000_000_000;
const rerouteInput = (overrides: Partial<RerouteInput> = {}): RerouteInput => ({
  currentRemainingS: 1800,
  candidateRemainingS: 1500,
  mode: "automatic",
  stableUpdates: 3,
  lastRerouteAt: null,
  now: NOW,
  ...overrides,
});

const incident = (overrides: Partial<Incident> = {}): Incident => ({
  id: "demo-test",
  category: "debris",
  coordinate: [-0.1238, 51.5308],
  observedAt: NOW,
  expiresAt: NOW + 30 * 60_000,
  confirmations: 0,
  status: "pending",
  demo: true,
  ...overrides,
});

describe("coordinates and UK units", () => {
  it.each([
    [0, 0],
    [-180, -90],
    [180, 90],
    [-0.1238, 51.5308],
  ])("validates WGS84 coordinate %j", (...coordinate) => {
    expect(validateCoord(coordinate)).toBe(true);
  });

  it.each([
    null,
    undefined,
    {},
    [],
    [0],
    [0, 0, 0],
    [181, 0],
    [0, -91],
    [NaN, 0],
    [0, Infinity],
    ["0", 0],
  ])("rejects malformed coordinate %j", (coordinate) =>
    expect(validateCoord(coordinate)).toBe(false),
  );

  it("converts metres to miles and formats UK default and metric distances", () => {
    expect(miles(1609.344)).toBe(1);
    expect(miles(0)).toBe(0);
    expect(distanceLabel(1609.344)).toBe("1.0 mi");
    expect(distanceLabel(1500, true)).toBe("1.5 km");
    expect(distanceLabel(999, true)).toBe("999 m");
    expect(distanceLabel(0, true)).toBe("0 m");
  });

  it("formats time across minute and hour boundaries", () => {
    expect(durationLabel(0)).toBe("0 min");
    expect(durationLabel(1)).toBe("1 min");
    expect(durationLabel(179)).toBe("3 min");
    expect(durationLabel(3599)).toBe("1 hr");
    expect(durationLabel(3660)).toBe("1 hr 1 min");
    expect(durationLabel(7200)).toBe("2 hr");
  });

  it("uses 4.54609 litres per imperial gallon, not a US gallon", () => {
    expect(fuelCostGBP(1609.344 * 40, 40, 1)).toBeCloseTo(4.54609, 8);
    expect(fuelCostGBP(1609.344 * 80, 40, 1.5)).toBeCloseTo(13.63827, 8);
    expect(fuelCostGBP(0, 40, 1.5)).toBe(0);
    expect(fuelCostGBP(1000, 40, 0)).toBe(0);
  });

  it.each([-1, NaN, Infinity])(
    "rejects invalid distance/duration %s",
    (value) => {
      expect(() => miles(value)).toThrow(RangeError);
      expect(() => distanceLabel(value)).toThrow(RangeError);
      expect(() => durationLabel(value)).toThrow(RangeError);
      expect(() => fuelCostGBP(value, 40, 1.5)).toThrow(RangeError);
    },
  );

  it.each([0, -1, NaN, Infinity])("rejects invalid mpg %s", (mpg) => {
    expect(() => fuelCostGBP(1000, mpg, 1.5)).toThrow(RangeError);
  });

  it("rejects negative fuel price and invalid haversine inputs", () => {
    expect(() => fuelCostGBP(1000, 40, -1)).toThrow(RangeError);
    expect(() => haversineM([181, 0], [0, 0])).toThrow(RangeError);
  });

  it("computes symmetric distances, including the date line and antipodes", () => {
    const a: Coord = [-0.1238, 51.5308];
    const b: Coord = [-0.1269, 51.5194];
    expect(haversineM(a, a)).toBe(0);
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 8);
    expect(haversineM([0, 0], [0, 1])).toBeCloseTo(111195.08, 0);
    expect(haversineM([179.999, 0], [-179.999, 0])).toBeCloseTo(222.39, 0);
    expect(haversineM([0, 0], [180, 0])).toBeGreaterThan(20_000_000);
  });
});

describe("transparent, feasible route scoring", () => {
  it("renormalises over duration when all optional inputs are missing", () => {
    const input = [route(), alternative()];
    const snapshot = JSON.stringify(input);
    const result = scoreRoutes(input, "fastest");
    expect(result.map((item) => item.id)).toEqual(["provider-a", "provider-b"]);
    expect(result[0].score).toBe(100);
    expect(result[1].score).toBe(0);
    expect(result[0].label).toBe("Fastest");
    expect(result[0].explanation).toContain(
      "unknown: reliability, cost, complexity",
    );
    expect(result[0].explanation).toContain("renormalised");
    expect(result[1].explanation).toContain("3 min longer");
    expect(result[0].reliability).toBeNull();
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("filters illegal/infeasible routes even if they would be fastest", () => {
    const illegal = route({ id: "illegal", feasible: false, durationS: 1 });
    expect(
      scoreRoutes([illegal, alternative()], "fastest").map((item) => item.id),
    ).toEqual(["provider-b"]);
    expect(scoreRoutes([illegal], "relaxed")).toEqual([]);
  });

  it("does not let a duplicate illegal route suppress a feasible one", () => {
    expect(
      scoreRoutes([route({ feasible: false }), route()], "fastest"),
    ).toHaveLength(1);
  });

  it.each([
    { durationS: NaN },
    { durationS: -1 },
    { distanceM: Infinity },
    { geometry: [] },
  ])("rejects malformed required provider dimensions %j", (overrides) => {
    expect(scoreRoutes([route(overrides)], "fastest")).toEqual([]);
  });

  it("treats malformed optional inputs as unknown, not fabricated zeroes", () => {
    const result = scoreRoutes(
      [route({ reliability: 1.1, costGBP: -1, complexity: NaN })],
      "relaxed",
    );
    expect(result[0].score).toBe(100);
    expect(result[0].explanation).toContain(
      "unknown: reliability, cost, complexity",
    );
  });

  it("keeps genuine zero cost/complexity/reliability as known inputs", () => {
    const result = scoreRoutes(
      [route({ reliability: 0, costGBP: 0, complexity: 0 })],
      "fastest",
    );
    expect(result[0].explanation).not.toContain("unknown:");
    expect(Number.isFinite(result[0].score)).toBe(true);
  });

  it("changes the choice for conflicting duration and simplicity preferences", () => {
    const fast = route({ complexity: 10 });
    const simple = alternative({ complexity: 1 });
    expect(scoreRoutes([fast, simple], "fastest")[0].id).toBe(fast.id);
    const relaxed = scoreRoutes([fast, simple], "relaxed");
    // With reliability/cost unknown, duration still outweighs complexity. Adding
    // a third slower alternative makes the 3-minute trade-off proportionate.
    const slow = alternative({
      id: "slow",
      durationS: 1500,
      geometry: [
        [-0.1238, 51.5308],
        [-0.16, 51.52],
        [-0.1269, 51.5194],
      ],
      complexity: 10,
    });
    expect(scoreRoutes([fast, simple, slow], "relaxed")[0].id).toBe(simple.id);
    expect(relaxed.find((item) => item.id === simple.id)?.label).toBe(
      "Relaxed",
    );
    expect(
      relaxed.find((item) => item.id === simple.id)?.explanation,
    ).toContain("lower supplied road-complexity value");
    expect(
      relaxed.find((item) => item.id === simple.id)?.explanation,
    ).not.toContain("fewer turns");
  });

  it("uses higher reliability and lower cost when duration is equal", () => {
    const good = route({ reliability: 0.9, costGBP: 1 });
    const other = alternative({ durationS: 600, reliability: 0.2, costGBP: 5 });
    expect(scoreRoutes([good, other], "fastest")[0].id).toBe(good.id);
  });

  it("handles no alternatives, ties and bounded finite scores", () => {
    expect(scoreRoutes([], "fastest")).toEqual([]);
    const results = scoreRoutes(
      [route(), alternative({ durationS: 600 })],
      "relaxed",
    );
    expect(results).toHaveLength(2);
    expect(
      results.every(
        (item) =>
          Number.isFinite(item.score) && item.score >= 0 && item.score <= 100,
      ),
    ).toBe(true);
    expect(results.map((item) => item.score)).toEqual([100, 100]);
    expect(ROUTE_SCORE_VERSION).toBe("1.0.0");
    for (const weights of Object.values(ROUTE_SCORE_WEIGHTS))
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe("distinct alternative routes", () => {
  it("deduplicates route IDs and identical geometry without mutating input", () => {
    const first = route();
    const input = [
      first,
      route({ id: "other-id" }),
      alternative({ id: first.id }),
      alternative(),
    ];
    expect(dedupeRoutes(input)).toEqual([first, input[3]]);
    expect(input).toHaveLength(4);
  });

  it("deduplicates the same directed path with denser vertex sampling", () => {
    const first = route();
    const a = first.geometry[0];
    const b = first.geometry[1];
    const sampled = route({
      id: "sampled",
      geometry: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b],
    });
    expect(dedupeRoutes([first, sampled])).toHaveLength(1);
  });

  it("retains genuinely different paths and the reversed journey", () => {
    const reversed = route({
      id: "return",
      geometry: [...route().geometry].reverse(),
    });
    expect(dedupeRoutes([route(), alternative(), reversed])).toHaveLength(3);
  });

  it("handles empty routes and malformed shapes without guessing equality", () => {
    expect(dedupeRoutes([])).toEqual([]);
    expect(
      dedupeRoutes([route({ geometry: [] }), alternative({ geometry: [] })]),
    ).toHaveLength(2);
  });
});

describe("stable and safety-gated rerouting", () => {
  it.each([1, 30, 90, 179])("ignores %s seconds of ETA jitter", (saving) => {
    expect(
      rerouteDecision(rerouteInput({ candidateRemainingS: 1800 - saving }))
        .reroute,
    ).toBe(false);
  });

  it("accepts the exact 180-second boundary after three stable updates", () => {
    expect(
      rerouteDecision(rerouteInput({ candidateRemainingS: 1620 })),
    ).toMatchObject({ reroute: true, ask: false });
  });

  it("uses 10% when it exceeds three minutes", () => {
    expect(
      rerouteDecision(
        rerouteInput({ currentRemainingS: 3600, candidateRemainingS: 3241 }),
      ).reroute,
    ).toBe(false);
    expect(
      rerouteDecision(
        rerouteInput({ currentRemainingS: 3600, candidateRemainingS: 3240 }),
      ).reroute,
    ).toBe(true);
  });

  it.each([0, 1, 2, NaN, 2.5])(
    "requires three stable samples, not %s",
    (stableUpdates) => {
      expect(rerouteDecision(rerouteInput({ stableUpdates })).reroute).toBe(
        false,
      );
    },
  );

  it("suppresses oscillation until the 90-second cooldown boundary", () => {
    expect(
      rerouteDecision(rerouteInput({ lastRerouteAt: NOW - 89_999 })).reason,
    ).toContain("cooldown");
    expect(
      rerouteDecision(rerouteInput({ lastRerouteAt: NOW - 90_000 })).reroute,
    ).toBe(true);
    expect(
      rerouteDecision(rerouteInput({ lastRerouteAt: NOW + 1000 })).reroute,
    ).toBe(false);
  });

  it("keeps a locked route despite a large time saving", () => {
    expect(
      rerouteDecision(rerouteInput({ mode: "locked", candidateRemainingS: 1 })),
    ).toMatchObject({ reroute: false, ask: false });
  });

  it.each(["verifiedClosure", "illegal"] as const)(
    "allows %s to override lock, cooldown, GPS and stability",
    (essential) => {
      const result = rerouteDecision(
        rerouteInput({
          [essential]: true,
          mode: "locked",
          lastRerouteAt: NOW,
          stableUpdates: 0,
          candidateRemainingS: 2500,
          accuracyM: 100,
          stationary: true,
        }),
      );
      expect(result.reroute).toBe(true);
      expect(result.ask).toBe(false);
      expect(result.reason).toContain("essential reroute");
    },
  );

  it("does not treat an unverified closure as an essential change", () => {
    expect(
      rerouteDecision(rerouteInput({ verifiedClosure: false, mode: "locked" }))
        .reroute,
    ).toBe(false);
  });

  it("allows trustworthy off-route to override lock and cooldown even for a slower candidate", () => {
    const result = rerouteDecision(
      rerouteInput({
        mode: "locked",
        offRoute: true,
        accuracyM: 25,
        stationary: false,
        lastRerouteAt: NOW,
        candidateRemainingS: 2400,
      }),
    );
    expect(result.reroute).toBe(true);
    expect(result.reason).toContain("Trustworthy off-route");
  });

  it.each([undefined, 25.01, 100, NaN, -1])(
    "does not override lock using poor/missing accuracy %s",
    (accuracyM) => {
      const result = rerouteDecision(
        rerouteInput({
          mode: "locked",
          offRoute: true,
          accuracyM,
          stationary: false,
        }),
      );
      expect(result.reroute).toBe(false);
      expect(result.reason).toContain("accuracy");
    },
  );

  it("does not let stationary drift or a single accurate sample trigger off-route", () => {
    expect(
      rerouteDecision(
        rerouteInput({ offRoute: true, accuracyM: 3, stationary: true }),
      ).reroute,
    ).toBe(false);
    expect(
      rerouteDecision(rerouteInput({ offRoute: true, accuracyM: 3 })).reroute,
    ).toBe(false);
    expect(
      rerouteDecision(
        rerouteInput({
          offRoute: true,
          accuracyM: 3,
          stationary: false,
          stableUpdates: 1,
        }),
      ).reroute,
    ).toBe(false);
  });

  it("does not fall back to a soft reroute after an untrustworthy off-route event", () => {
    expect(
      rerouteDecision(
        rerouteInput({ offRoute: true, accuracyM: 100, stationary: false }),
      ).reroute,
    ).toBe(false);
  });

  it("offers ask-first only when safely stationary, never silently changes route", () => {
    expect(
      rerouteDecision(rerouteInput({ mode: "ask", stationary: true })),
    ).toMatchObject({ reroute: false, ask: true });
    expect(
      rerouteDecision(rerouteInput({ mode: "ask", stationary: false })),
    ).toMatchObject({ reroute: false, ask: false });
    expect(rerouteDecision(rerouteInput({ mode: "ask" })).ask).toBe(false);
  });

  it("does not require a moving-user prompt for an essential closure in ask mode", () => {
    expect(
      rerouteDecision(
        rerouteInput({ mode: "ask", verifiedClosure: true, stationary: false }),
      ),
    ).toMatchObject({ reroute: true, ask: false });
  });

  it.each([NaN, -1, Infinity])(
    "never essential-reroutes without a usable candidate duration %s",
    (candidateRemainingS) => {
      const result = rerouteDecision(
        rerouteInput({ candidateRemainingS, illegal: true }),
      );
      expect(result.reroute).toBe(false);
      expect(result.reason).toContain("stop safely");
    },
  );

  it("rejects unknown current duration for soft comparisons and does not mutate input", () => {
    const input = rerouteInput({ currentRemainingS: NaN });
    expect(rerouteDecision(input).reroute).toBe(false);
    expect(input).toEqual(rerouteInput({ currentRemainingS: NaN }));
  });
});

describe("explicit navigation transitions", () => {
  it("runs planning, preview, simulation, disruption/recovery, arrival and end", () => {
    let state: NavigationState = "idle";
    for (const next of [
      "planning",
      "preview",
      "navigating",
      "degraded",
      "offline",
      "rerouting",
      "navigating",
      "arrived",
      "ended",
      "idle",
    ] as const) {
      state = navigationTransition(state, next);
      expect(state).toBe(next);
    }
    expect(transitionNavigation).toBe(navigationTransition);
  });

  it("allows cancellation, a preview edit and a new journey after ending", () => {
    expect(navigationTransition("planning", "idle")).toBe("idle");
    expect(navigationTransition("preview", "planning")).toBe("planning");
    expect(navigationTransition("navigating", "ended")).toBe("ended");
    expect(navigationTransition("ended", "planning")).toBe("planning");
    expect(navigationTransition("offline", "navigating")).toBe("navigating");
  });

  it.each([
    ["idle", "navigating"],
    ["planning", "arrived"],
    ["arrived", "navigating"],
    ["ended", "preview"],
    ["idle", "idle"],
  ] as const)("rejects %s -> %s", (current, next) =>
    expect(() => navigationTransition(current, next)).toThrow(RangeError),
  );

  it("rejects malformed runtime states rather than permitting prototype keys", () => {
    expect(() =>
      navigationTransition("toString" as NavigationState, "idle"),
    ).toThrow(RangeError);
  });
});

describe("test-only incident lifecycle", () => {
  const coordinate: Coord = [-0.1238, 51.5308];

  it("creates a pending demo report with a category TTL and no invented confirmations", () => {
    const input: Incident[] = [];
    const reports = createIncident(input, " Closure ", coordinate, NOW);
    expect(input).toEqual([]);
    expect(reports[0]).toMatchObject({
      category: "closure",
      observedAt: NOW,
      expiresAt: NOW + 60 * 60_000,
      status: "pending",
      demo: true,
      confirmations: 0,
    });
    expect(reports[0].coordinate).toEqual(coordinate);
    expect(reports[0].coordinate).not.toBe(coordinate);
    expect(Object.keys(reports[0]).sort()).toEqual(
      [
        "id",
        "category",
        "coordinate",
        "observedAt",
        "expiresAt",
        "confirmations",
        "status",
        "demo",
      ].sort(),
    );
  });

  it("uses a bounded fallback TTL for unknown categories", () => {
    const reports = createIncident([], "poor visibility", coordinate, NOW);
    expect(reports[0].expiresAt - NOW).toBe(INCIDENT_POLICY.defaultTtlMs);
  });

  it("deduplicates same-category reports within 60 m and 15 minutes without refreshing TTL", () => {
    const reports = createIncident([], "debris", coordinate, NOW);
    const next = createIncident(
      reports,
      "DEBRIS",
      [-0.1238, 51.5311],
      NOW + 60_000,
    );
    expect(next).toHaveLength(1);
    expect(next).toEqual(reports);
    expect(next).not.toBe(reports);
    expect(next[0].confirmations).toBe(0);
    expect(next[0].expiresAt).toBe(reports[0].expiresAt);
  });

  it("does not merge different categories, distant reports, old reports or rejected reports", () => {
    const reports = createIncident([], "debris", coordinate, NOW);
    expect(createIncident(reports, "closure", coordinate, NOW)).toHaveLength(2);
    expect(
      createIncident(reports, "debris", [-0.1238, 51.5318], NOW),
    ).toHaveLength(2);
    expect(
      createIncident(reports, "debris", coordinate, NOW + 15 * 60_000 + 1),
    ).toHaveLength(2);
    expect(
      createIncident(
        [{ ...reports[0], status: "rejected" }],
        "debris",
        coordinate,
        NOW,
      ),
    ).toHaveLength(2);
  });

  it("does not revive an expired report or merge a future-dated report", () => {
    const reports = [incident({ expiresAt: NOW })];
    expect(createIncident(reports, "debris", coordinate, NOW)).toHaveLength(2);
    expect(
      createIncident(
        [incident({ observedAt: NOW + 1 })],
        "debris",
        coordinate,
        NOW,
      ),
    ).toHaveLength(2);
  });

  it("rate-limits new submissions after five, including expired/rejected ledger records", () => {
    let reports: Incident[] = [];
    for (let index = 0; index < 5; index++)
      reports = createIncident(
        reports,
        `category-${index}`,
        coordinate,
        NOW + index,
      );
    expect(reports).toHaveLength(5);
    expect(() =>
      createIncident(reports, "sixth", coordinate, NOW + 10),
    ).toThrow(/maximum 5/);
    expect(() =>
      createIncident(
        reports.map((report) => ({
          ...report,
          status: "rejected",
          expiresAt: NOW + 5,
        })),
        "sixth",
        coordinate,
        NOW + 10,
      ),
    ).toThrow(/maximum 5/);
    // Retried duplicate is idempotent, not a new accepted submission.
    expect(
      createIncident(reports, "category-0", coordinate, NOW + 10),
    ).toHaveLength(5);
  });

  it("frees a rate slot at exactly one hour, not before", () => {
    const reports = Array.from({ length: 5 }, (_, index) =>
      incident({
        id: `${index}`,
        category: `category-${index}`,
        observedAt: NOW + index,
      }),
    );
    expect(() =>
      createIncident(reports, "new", coordinate, NOW + 60 * 60_000 - 1),
    ).toThrow(/rate limit/);
    expect(
      createIncident(reports, "new", coordinate, NOW + 60 * 60_000),
    ).toHaveLength(6);
  });

  it("generates deterministic collision-free local IDs without reading the clock", () => {
    const a = createIncident([], "debris", coordinate, NOW);
    const b = createIncident(a, "debris", [-0.15, 51.53], NOW);
    expect(b[0].id).not.toBe(b[1].id);
    expect(createIncident([], "debris", coordinate, NOW)).toEqual(a);
  });

  it("expires reports at the exact TTL and excludes rejected/future/non-demo data", () => {
    const reports = [
      incident(),
      incident({ id: "approved", status: "approved" }),
      incident({ id: "expired", expiresAt: NOW }),
      incident({ id: "rejected", status: "rejected" }),
      incident({ id: "future", observedAt: NOW + 1 }),
      { ...incident({ id: "live" }), demo: false } as unknown as Incident,
    ];
    expect(liveIncidents(reports, NOW).map((report) => report.id)).toEqual([
      "demo-test",
      "approved",
    ]);
    expect(liveIncidents(reports, NOW + 30 * 60_000)).toEqual([]);
    expect(reports).toHaveLength(6);
  });

  it("filters malformed incident time/geometry without presenting current conditions", () => {
    expect(
      liveIncidents(
        [incident({ expiresAt: NaN }), incident({ coordinate: [181, 0] })],
        NOW,
      ),
    ).toEqual([]);
  });

  it("rejects invalid submission coordinates, categories and timestamps", () => {
    expect(() => createIncident([], "debris", [181, 0], NOW)).toThrow(
      RangeError,
    );
    expect(() => createIncident([], " ", coordinate, NOW)).toThrow(RangeError);
    expect(() => createIncident([], "a".repeat(81), coordinate, NOW)).toThrow(
      RangeError,
    );
    expect(() => createIncident([], "debris", coordinate, NaN)).toThrow(
      RangeError,
    );
    expect(() => liveIncidents([], -1)).toThrow(RangeError);
  });
});

describe("honest London catalogue and synthetic playback fixtures", () => {
  it("exports exactly twelve valid distinct landmarks with the required provenance", () => {
    expect(DEMO_PLACES).toHaveLength(12);
    expect(new Set(DEMO_PLACES.map((place) => place.id)).size).toBe(12);
    for (const place of DEMO_PLACES) {
      expect(validateCoord(place.coordinate)).toBe(true);
      expect(place.source).toBe("Demo catalogue · coordinates only");
      expect(Object.keys(place).sort()).toEqual(
        ["id", "name", "subtitle", "coordinate", "category", "source"].sort(),
      );
    }
    expect(
      DEMO_PLACES.find((place) => place.id === "kings-cross")?.coordinate,
    ).toEqual([-0.1238, 51.5308]);
    expect(
      DEMO_PLACES.find((place) => place.id === "tate-modern")?.coordinate,
    ).toEqual([-0.0994, 51.5076]);
    expect(
      DEMO_PLACES.find((place) => place.id === "victoria-park")?.coordinate,
    ).toEqual([-0.0391, 51.5366]);
    expect(
      DEMO_PLACES.find((place) => place.id === "british-museum")?.coordinate,
    ).toEqual([-0.1269, 51.5194]);
    expect(
      DEMO_PLACES.find((place) => place.id === "tower-bridge")?.coordinate,
    ).toEqual([-0.0754, 51.5055]);
  });

  it("produces two deterministic distinct fixtures, never road geometry or manoeuvres", () => {
    const inputSnapshot = JSON.stringify(DEMO_PLACES);
    const routes = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "driving");
    expect(routes).toEqual(
      syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "driving"),
    );
    expect(routes).toHaveLength(2);
    expect(dedupeRoutes(routes)).toHaveLength(2);
    for (const fixture of routes) {
      expect(Object.keys(fixture).sort()).toEqual(
        [
          "id",
          "geometry",
          "distanceM",
          "durationS",
          "steps",
          "source",
          "generatedAt",
          "demo",
          "reliability",
          "costGBP",
          "complexity",
          "feasible",
        ].sort(),
      );
      expect(fixture.source).toBe(SYNTHETIC_ROUTE_SOURCE);
      expect(fixture.source).toContain("not road-safe");
      expect(fixture.demo).toBe(true);
      expect(fixture.reliability).toBeNull();
      expect(fixture.costGBP).toBeNull();
      expect(fixture.geometry.every(validateCoord)).toBe(true);
      expect(fixture.geometry[0]).toEqual(DEMO_PLACES[0].coordinate);
      expect(fixture.geometry.at(-1)).toEqual(DEMO_PLACES[1].coordinate);
      expect(fixture.distanceM).toBeCloseTo(
        fixture.steps.reduce((total, step) => total + step.distanceM, 0),
      );
      expect(fixture.durationS).toBeCloseTo(
        fixture.steps.reduce((total, step) => total + step.durationS, 0),
      );
      for (const step of fixture.steps) {
        expect(Object.keys(step).sort()).toEqual(
          [
            "instruction",
            "distanceM",
            "durationS",
            "coordinate",
            "type",
          ].sort(),
        );
        expect(step.type).toMatch(/^synthetic-/);
        expect(step.instruction).toMatch(
          /not (a road manoeuvre|road guidance)/,
        );
      }
    }
    expect(JSON.stringify(DEMO_PLACES)).toBe(inputSnapshot);
    expect(
      scoreRoutes(routes, "relaxed").every((item) =>
        item.explanation.includes("synthetic simulation only"),
      ),
    ).toBe(true);
  });

  it("labels mode timings as simulation parameters and rejects unsupported profiles", () => {
    const drive = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "car");
    const walk = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "walking");
    const cycle = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "cycling");
    expect(walk[0].durationS).toBeGreaterThan(cycle[0].durationS);
    expect(cycle[0].durationS).toBeGreaterThan(drive[0].durationS);
    expect(() =>
      syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "truck"),
    ).toThrow(/Unsupported/);
    expect(() => syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[0], "car")).toThrow(
      /distinct/,
    );
  });

  it("copies coordinates so playback cannot alter catalogue points", () => {
    const routes = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "drive");
    routes[0].geometry[0][0] = 1;
    routes[0].steps[0].coordinate[0] = 1;
    expect(DEMO_PLACES[0].coordinate).toEqual([-0.1238, 51.5308]);
    expect(routes[1].geometry[0]).toEqual([-0.1238, 51.5308]);
    expect(routes[0].geometry[1][0]).not.toBe(1);
  });
});
