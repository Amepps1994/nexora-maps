import { describe, expect, it } from "vitest";
import { sessionReducer, playbackAt } from "../shared/nexora/session";
import { syntheticRoute, DEMO_PLACES } from "../shared/nexora/fixtures";
import { guidanceView, indexRoute } from "../shared/nexora/guidance";
import type { Route, Step } from "../shared/nexora/domain";
describe("session reducer integration", () => {
  it("plays a complete journey through policy transitions", () => {
    let s = sessionReducer("idle", "planning");
    s = sessionReducer(s, "preview");
    s = sessionReducer(s, "navigating");
    s = sessionReducer(s, "offline");
    s = sessionReducer(s, "navigating");
    s = sessionReducer(s, "arrived");
    expect(sessionReducer(s, "idle")).toBe("idle");
  });
  it("ends tracking before resetting an active journey", () =>
    expect(sessionReducer("navigating", "idle")).toBe("idle"));
  it("permits idempotent recover but refuses start from idle", () => {
    expect(sessionReducer("navigating", "navigating")).toBe("navigating");
    expect(() => sessionReducer("idle", "navigating")).toThrow();
  });
});
describe("distance playback", () => {
  const r = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "driving")[0];
  it("starts and ends at provider/fixture geometry endpoints", () => {
    expect(playbackAt(r, 0).position).toEqual(r.geometry[0]);
    expect(playbackAt(r, 1).position[0]).toBeCloseTo(r.geometry.at(-1)![0]);
  });
  it("interpolates instead of jumping over uneven vertices", () => {
    const p = playbackAt(r, 0.01);
    expect(p.position).not.toEqual(r.geometry[0]);
    // The step is the upcoming manoeuvre, so its distance shrinks as playback moves.
    expect(p.step.distanceM).toBeLessThan(playbackAt(r, 0).step.distanceM);
  });
  it("clamps out of range progress", () => {
    expect(playbackAt(r, -2).position).toEqual(r.geometry[0]);
    expect(playbackAt(r, 2).position).toEqual(playbackAt(r, 1).position);
  });
});

describe("playback step meaning (BUG-011)", () => {
  const step = (over: Partial<Step>): Step => ({
    instruction: "Continue",
    distanceM: 100,
    durationS: 10,
    coordinate: [-0.124, 51.53],
    type: "turn",
    ...over,
  });
  // depart 400 m south, left at 400 m (400 m east), right at 800 m (200 m south).
  const route: Route = {
    id: "osrm-driving-0",
    geometry: [
      [-0.124, 51.53],
      [-0.124, 51.526403],
      [-0.118218, 51.526403],
      [-0.118218, 51.524604],
    ],
    distanceM: 1000,
    durationS: 200,
    steps: [
      step({ instruction: "Head south on A Road", distanceM: 400, type: "depart" }),
      step({ instruction: "Turn left onto B Street", distanceM: 400, modifier: "left", coordinate: [-0.124, 51.526403] }),
      step({ instruction: "Turn right onto C Lane", distanceM: 200, modifier: "right", coordinate: [-0.118218, 51.526403] }),
      step({ instruction: "Arrive at your destination", distanceM: 0, type: "arrive", coordinate: [-0.118218, 51.524604] }),
    ],
    source: "OSRM",
    generatedAt: "2026-11-28T00:00:00Z",
    demo: false,
    reliability: null,
    costGBP: null,
    complexity: null,
    feasible: true,
  };

  it("returns the next manoeuvre and the distance to it", () => {
    const s = playbackAt(route, 0.1).step;
    expect(s.instruction).toBe("Turn left onto B Street");
    expect(s.distanceM).toBeCloseTo(300, 0);
  });

  it("matches live guidance at every point of the drive", () => {
    const index = indexRoute(route);
    for (let p = 0; p <= 1.0001; p += 0.025) {
      const sim = playbackAt(route, p).step;
      const live = guidanceView(index, p * index.totalM).step!;
      expect(sim.instruction, `at ${p}`).toBe(live.instruction);
      expect(Math.abs(sim.distanceM - live.distanceM), `at ${p}`).toBeLessThan(1);
    }
  });

  it("moves to the following turn once a turn is passed", () => {
    expect(playbackAt(route, 0.5).step.instruction).toBe("Turn right onto C Lane");
    expect(playbackAt(route, 0.9).step.instruction).toBe("Arrive at your destination");
  });

  it("ends on the arrival step at 0 m", () => {
    const s = playbackAt(route, 1).step;
    expect(s.type).toBe("arrive");
    expect(s.distanceM).toBe(0);
  });

  it("skips a zero-length step", () => {
    const withZero: Route = {
      ...route,
      steps: [
        route.steps[0],
        step({ instruction: "Continue onto B Street", distanceM: 0, type: "new name" }),
        ...route.steps.slice(1),
      ],
    };
    // Both zero-length and real step start at 400 m; the first one ahead is shown,
    // and once past 400 m the right turn is next.
    expect(playbackAt(withZero, 0.1).step.distanceM).toBeCloseTo(300, 0);
    expect(playbackAt(withZero, 0.5).step.instruction).toBe("Turn right onto C Lane");
  });

  it("handles a single-step route", () => {
    const single: Route = {
      ...route,
      steps: [step({ instruction: "Arrive at your destination", distanceM: 1000, type: "arrive" })],
    };
    expect(playbackAt(single, 0.5).step.instruction).toBe("Arrive at your destination");
    expect(playbackAt(single, 1).step.distanceM).toBe(0);
  });

  it("does not throw on degenerate geometry", () => {
    const flat: Route = { ...route, geometry: [[-0.124, 51.53]] };
    expect(() => playbackAt(flat, 0.5)).not.toThrow();
    expect(playbackAt(flat, 0.5).step.type).toBe("arrive");
  });
});
