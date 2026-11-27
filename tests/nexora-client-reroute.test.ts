import { describe, expect, it } from "vitest";
import { initialTracker, type TrackerState } from "../shared/nexora/guidance";
import {
  judgeRerouteCandidate,
  remainingStops,
} from "../shared/nexora/reroute";

describe("remainingStops (BUG-002)", () => {
  const stops = ["A", "B"];

  it("drops stops passed on the original route", () => {
    expect(remainingStops(stops, 0, 0)).toEqual({
      remaining: ["A", "B"],
      nextOffset: 0,
    });
    expect(remainingStops(stops, 0, 1)).toEqual({
      remaining: ["B"],
      nextOffset: 1,
    });
  });

  it("a second reroute with nothing passed on the new route keeps only B", () => {
    // First reroute after passing A: request [B], commit offset 1.
    const first = remainingStops(stops, 0, 1);
    // The rerouted route only contains B, so stopsPassed() is 0 until B is reached.
    const second = remainingStops(stops, first.nextOffset, 0);
    expect(second.remaining).toEqual(["B"]);
    // The old code sliced the original list by 0 and re-added A.
    expect(stops.slice(0)).toEqual(["A", "B"]);
  });

  it("after passing B on the rerouted route, requests no stops", () => {
    expect(remainingStops(stops, 1, 1)).toEqual({
      remaining: [],
      nextOffset: 2,
    });
  });

  it("never runs past the end or backwards", () => {
    expect(remainingStops(stops, 2, 3)).toEqual({
      remaining: [],
      nextOffset: 2,
    });
    expect(remainingStops(stops, -1, Number.NaN)).toEqual({
      remaining: ["A", "B"],
      nextOffset: 0,
    });
  });
});

function tracker(over: Partial<TrackerState>): TrackerState {
  return { ...initialTracker(), ...over };
}

describe("judgeRerouteCandidate (BUG-007)", () => {
  const requested = tracker({
    status: "off-route",
    offRouteSamples: 3,
    offRouteConfirmed: true,
    speedMps: 8,
    accuracyM: 8,
    position: [-0.12, 51.5],
  });
  const base = {
    requested,
    currentRemainingS: 900,
    candidateRemainingS: 840,
    routeMode: "locked" as const,
    lastRerouteAt: null,
    now: 1_000_000,
  };

  it("applies the candidate even if the driver has stopped by the time it arrives", () => {
    const latest = tracker({ ...requested, speedMps: 0, offRouteSamples: 4 });
    const d = judgeRerouteCandidate({ ...base, latest });
    expect(d.reroute).toBe(true);
  });

  it("declines it if the driver has rejoined the route", () => {
    const latest = tracker({ status: "on-route", speedMps: 8, accuracyM: 8 });
    const d = judgeRerouteCandidate({ ...base, latest });
    expect(d.reroute).toBe(false);
    expect(d.reason).toMatch(/Back on the route/);
  });

  it("still applies the candidate in a short GPS dropout", () => {
    const latest = tracker({
      ...requested,
      status: "weak-signal",
      speedMps: null,
      accuracyM: null,
    });
    expect(judgeRerouteCandidate({ ...base, latest }).reroute).toBe(true);
  });

  it("still rejects a request that came from an untrustworthy fix", () => {
    const poor = tracker({ ...requested, accuracyM: 80 });
    const d = judgeRerouteCandidate({ ...base, requested: poor, latest: poor });
    expect(d.reroute).toBe(false);
  });

  it("rejects a missing candidate", () => {
    const d = judgeRerouteCandidate({
      ...base,
      latest: requested,
      candidateRemainingS: Number.NaN,
    });
    expect(d.reroute).toBe(false);
  });
});
