import { describe, expect, it } from "vitest";
import { sessionReducer, playbackAt } from "../shared/nexora/session";
import { syntheticRoute, DEMO_PLACES } from "../shared/nexora/fixtures";
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
    expect(p.step.distanceM).toBeLessThan(r.steps[0].distanceM);
  });
  it("clamps out of range progress", () => {
    expect(playbackAt(r, -2).position).toEqual(r.geometry[0]);
    expect(playbackAt(r, 2).position).toEqual(playbackAt(r, 1).position);
  });
});
