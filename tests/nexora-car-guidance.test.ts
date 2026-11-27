import { beforeEach, describe, expect, it } from "vitest";
import type { Route, Step } from "../shared/nexora/domain";
import { playbackAt } from "../shared/nexora/session";
import { syntheticRoute, DEMO_PLACES } from "../shared/nexora/fixtures";
import {
  ROAD_USE_LABEL,
  buildCarGuidance,
  carHostDistance,
  formatCarDistance,
  formatCarDuration,
  lockScreenContent,
  toCarManeuver,
} from "../shared/nexora/car-guidance";
import {
  getCarGuidance,
  onCarCommand,
  publishCarGuidance,
  resetCarGuidanceBus,
  sendCarCommand,
  subscribeCarGuidance,
} from "../lib/car/guidance-bus";
import { carIntegrationStatus, readCarFlags } from "../lib/car/car-status";

const step = (over: Partial<Step>): Step => ({
  instruction: "Continue",
  distanceM: 100,
  durationS: 10,
  coordinate: [-0.12, 51.5],
  type: "continue",
  ...over,
});

// Shaped like server/nexora/route-mapper.ts output for a 3-step OSRM car route.
const route: Route = {
  id: "osrm-driving-0",
  geometry: [
    [-0.124, 51.53],
    [-0.124, 51.525],
    [-0.12, 51.525],
    [-0.12, 51.52],
  ],
  distanceM: 1000,
  durationS: 200,
  steps: [
    step({
      instruction: "Head south onto York Way",
      distanceM: 400,
      type: "depart",
      coordinate: [-0.124, 51.53],
    }),
    step({
      instruction: "Turn left onto Euston Road",
      distanceM: 600,
      type: "turn",
      coordinate: [-0.124, 51.525],
    }),
    step({
      instruction: "Arrive at your destination",
      distanceM: 0,
      type: "arrive",
      coordinate: [-0.12, 51.52],
    }),
  ],
  source: "OSRM",
  generatedAt: "2026-11-27T00:00:00Z",
  demo: false,
  reliability: null,
  costGBP: null,
  complexity: null,
  feasible: true,
};

describe("toCarManeuver", () => {
  it.each([
    ["Turn left onto Euston Road", "turn", "turn", "left", "Euston Road"],
    ["Turn slight right", "turn", "turn", "slight-right", undefined],
    ["Turn sharp left onto A1", "turn", "turn", "sharp-left", "A1"],
    ["Turn uturn", "turn", "turn", "uturn", undefined],
    ["Keep right onto M1", "fork", "fork", "right", "M1"],
    [
      "Continue onto Left Bank Road",
      "new name",
      "straight",
      "straight",
      "Left Bank Road",
    ],
    ["Turn straight", "end of road", "straight", "straight", undefined],
    ["Arrive at stop 1", "waypoint", "waypoint", "straight", undefined],
    ["Arrive at your destination", "arrive", "arrive", "straight", undefined],
    ["Turn right", "on ramp", "on-ramp", "right", undefined],
  ])("%s (%s)", (instruction, type, kind, direction, road) => {
    const m = toCarManeuver(step({ instruction, type }));
    expect(m.kind).toBe(kind);
    expect(m.direction).toBe(direction);
    expect(m.roadName).toBe(road);
  });
  it("reads the roundabout exit", () => {
    const m = toCarManeuver(
      step({
        instruction: "At the roundabout, take exit 2 onto Pentonville Road",
        type: "roundabout",
      }),
    );
    expect(m).toMatchObject({
      kind: "roundabout",
      exit: 2,
      roadName: "Pentonville Road",
    });
  });
  it("keeps road names from changing the arrow", () =>
    expect(
      toCarManeuver(
        step({ instruction: "Turn right onto Left Street", type: "turn" }),
      ).direction,
    ).toBe("right"));
});

describe("buildCarGuidance", () => {
  const base = {
    paused: false,
    muted: true,
    metric: true,
    now: 1_000_000,
    destinationName: "British Museum",
  };

  it("is idle with no route", () => {
    const s = buildCarGuidance({ ...base, state: "idle", progress: 0 });
    expect(s).toMatchObject({
      active: false,
      phase: "idle",
      next: null,
      tripId: null,
    });
  });

  it("shows the next manoeuvre, not the segment being driven", () => {
    const { step: current } = playbackAt(route, 0.1); // 100 m into the 400 m depart segment
    const s = buildCarGuidance({
      ...base,
      state: "navigating",
      route,
      step: current,
      progress: 0.1,
      source: "live",
    });
    expect(s.active).toBe(true);
    expect(s.phase).toBe("guiding");
    expect(s.next?.instruction).toBe("Turn left onto Euston Road");
    expect(s.distanceToNextM).toBe(300);
    expect(s.remainingDistanceM).toBe(900);
    expect(s.remainingDurationS).toBe(180);
    expect(s.etaMs).toBe(1_000_000 + 180_000);
    expect(s.simulated).toBe(false);
    expect(s.statusLine).toBe(ROAD_USE_LABEL);
    expect(s.destinationCoordinate).toEqual([-0.12, 51.52]);
  });

  it("labels simulation and demo routes as simulated", () => {
    const sim = buildCarGuidance({
      ...base,
      state: "navigating",
      route,
      progress: 0,
    });
    expect(sim.simulated).toBe(true);
    expect(sim.statusLine).toContain("Simulation");
    expect(sim.statusLine).toContain(ROAD_USE_LABEL);
    const demo = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "driving")[0];
    const d = buildCarGuidance({
      ...base,
      state: "navigating",
      route: demo,
      progress: 0,
      source: "live",
    });
    expect(demo.demo).toBe(true);
    expect(d.simulated).toBe(true);
  });

  it.each([
    ["degraded", "degraded", "GPS signal weak"],
    ["offline", "offline", "Offline"],
    ["rerouting", "rerouting", "Rerouting"],
  ] as const)(
    "%s keeps guidance active with a warning",
    (state, phase, text) => {
      const s = buildCarGuidance({ ...base, state, route, progress: 0.5 });
      expect(s.active).toBe(true);
      expect(s.phase).toBe(phase);
      expect(s.statusLine).toContain(text);
    },
  );

  it("preview and arrival are not active guidance", () => {
    expect(
      buildCarGuidance({ ...base, state: "preview", route, progress: 0 }),
    ).toMatchObject({ active: false, phase: "preview" });
    const a = buildCarGuidance({
      ...base,
      state: "arrived",
      route,
      progress: 1,
    });
    expect(a).toMatchObject({
      active: false,
      phase: "arrived",
      distanceToNextM: 0,
      etaMs: null,
    });
    expect(a.next?.kind).toBe("arrive");
  });

  it("reports paused", () =>
    expect(
      buildCarGuidance({
        ...base,
        paused: true,
        state: "navigating",
        route,
        progress: 0.2,
      }).phase,
    ).toBe("paused"));
});

describe("formatting", () => {
  it("formats metric and UK imperial distances", () => {
    expect(formatCarDistance(240, true)).toBe("240 m");
    expect(formatCarDistance(1530, true)).toBe("1.5 km");
    expect(formatCarDistance(150, false)).toBe("160 yd");
    expect(formatCarDistance(3218.7, false)).toBe("2.0 mi");
  });
  it("formats durations", () => {
    expect(formatCarDuration(59)).toBe("1 min");
    expect(formatCarDuration(3600)).toBe("1 h");
    expect(formatCarDuration(5400)).toBe("1 h 30 min");
  });
  it("gives car hosts a value and unit", () => {
    expect(carHostDistance(800, true)).toEqual({ value: 800, unit: "meters" });
    expect(carHostDistance(2500, true)).toEqual({
      value: 2.5,
      unit: "kilometers",
    });
    expect(carHostDistance(100, false)).toEqual({ value: 109, unit: "yards" });
    expect(carHostDistance(16093.44, false)).toEqual({
      value: 10,
      unit: "miles",
    });
  });
  it("builds the lock-screen card", () => {
    const { step: current } = playbackAt(route, 0.1);
    const s = buildCarGuidance({
      paused: false,
      muted: true,
      metric: true,
      now: 0,
      destinationName: "British Museum",
      state: "navigating",
      route,
      step: current,
      progress: 0.1,
    });
    const c = lockScreenContent(s);
    expect(c.title).toBe("300 m · Turn left onto Euston Road");
    expect(c.body).toContain("900 m");
    expect(c.body).toContain("to British Museum");
    expect(c.body).toContain(ROAD_USE_LABEL);
  });
});

describe("guidance bus", () => {
  beforeEach(() => resetCarGuidanceBus());
  const snap = (progress: number, now = 0) =>
    buildCarGuidance({
      paused: false,
      muted: true,
      metric: true,
      now,
      state: "navigating",
      route,
      progress,
    });

  it("replays the latest snapshot to late subscribers and skips duplicates", () => {
    const seen: number[] = [];
    publishCarGuidance(snap(0.1));
    const off = subscribeCarGuidance((s) =>
      seen.push(s.remainingDistanceM ?? -1),
    );
    publishCarGuidance(snap(0.1, 10_000)); // only the clock moved < 30 s: skipped
    publishCarGuidance(snap(0.2));
    off();
    publishCarGuidance(snap(0.3));
    expect(seen).toEqual([900, 800]);
    expect(getCarGuidance()?.remainingDistanceM).toBe(700);
  });

  it("isolates a throwing car surface", () => {
    const seen: string[] = [];
    subscribeCarGuidance(() => {
      throw new Error("car screen crashed");
    });
    subscribeCarGuidance((s) => seen.push(s.phase));
    publishCarGuidance(snap(0.1));
    expect(seen).toEqual(["guiding"]);
  });

  it("delivers car button commands", () => {
    const got: string[] = [];
    const off = onCarCommand((c) => got.push(c));
    sendCarCommand("toggleMute");
    sendCarCommand("stop");
    off();
    sendCarCommand("stop");
    expect(got).toEqual(["toggleMute", "stop"]);
  });
});

describe("car integration status", () => {
  it("defaults to Android Auto on, CarPlay gated", () => {
    expect(readCarFlags(undefined)).toEqual({
      androidAuto: true,
      carPlay: false,
    });
    expect(readCarFlags({ carDisplays: { carPlay: true } })).toEqual({
      androidAuto: true,
      carPlay: true,
    });
  });
  it("never claims road readiness", () => {
    const flags = readCarFlags(undefined);
    const android = carIntegrationStatus("android", flags, "disconnected");
    expect(android).toContain("Desktop Head Unit");
    expect(android).toContain("unverified for road use");
    expect(carIntegrationStatus("ios", flags, "unsupported")).toContain(
      "entitlement",
    );
    expect(carIntegrationStatus("web", flags, "unsupported")).toContain(
      "need the iOS or Android app",
    );
  });
});
