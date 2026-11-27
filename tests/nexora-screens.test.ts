import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  A11Y_COLORS,
  backAction,
  boundaryState,
  contrastRatio,
  currentStepIndex,
  isDemoOrigin,
  needsLiveAck,
  nextAnnouncement,
  originNotice,
  previousPanel,
  shouldAutoOpenOnboarding,
  stepAnnouncement,
  stepItems,
  type BackState,
} from "../components/nexora/screen-logic";
import { DEMO_PLACES } from "../shared/nexora/fixtures";
import type { Route, Step } from "../shared/nexora/domain";

const idle: BackState = {
  panel: null,
  active: false,
  confirmingEnd: false,
  liveAckOpen: false,
  arrived: false,
  hasDestination: false,
  tab: "Home",
};

describe("Android back button (BUG-008)", () => {
  it("closes the routes sheet back to the place sheet, then closes", () => {
    expect(
      backAction({ ...idle, panel: "routes", hasDestination: true }),
    ).toEqual({
      kind: "panel",
      to: "place",
    });
    expect(
      backAction({ ...idle, panel: "place", hasDestination: true }),
    ).toEqual({
      kind: "panel",
      to: null,
    });
    expect(backAction({ ...idle, panel: "search" })).toEqual({
      kind: "panel",
      to: null,
    });
  });

  it("returns from export to privacy and closes other sheets", () => {
    expect(previousPanel("export", false)).toBe("privacy");
    expect(previousPanel("layers", true)).toBeNull();
    expect(previousPanel("routes", false)).toBeNull();
  });

  it("asks before ending guidance and never exits during guidance", () => {
    expect(backAction({ ...idle, active: true })).toEqual({
      kind: "confirm-end",
    });
    expect(backAction({ ...idle, active: true, confirmingEnd: true })).toEqual({
      kind: "dismiss-confirm",
    });
    // A sheet open over guidance closes first.
    expect(backAction({ ...idle, active: true, panel: "report" }).kind).toBe(
      "panel",
    );
  });

  it("closes the live acknowledgement before the routes sheet", () => {
    expect(backAction({ ...idle, panel: "routes", liveAckOpen: true })).toEqual(
      {
        kind: "close-live-ack",
      },
    );
  });

  it("leaves the arrival card, returns to Home, then lets the OS exit", () => {
    expect(backAction({ ...idle, arrived: true })).toEqual({ kind: "reset" });
    expect(backAction({ ...idle, tab: "Settings" })).toEqual({
      kind: "home-tab",
    });
    expect(backAction(idle)).toEqual({ kind: "exit" });
  });
});

describe("first run and default origin (BUG-009)", () => {
  it("opens onboarding once, only after local data has loaded", () => {
    expect(shouldAutoOpenOnboarding(false, false, false)).toBe(false);
    expect(shouldAutoOpenOnboarding(true, false, false)).toBe(true);
    expect(shouldAutoOpenOnboarding(true, false, true)).toBe(false);
    expect(shouldAutoOpenOnboarding(true, true, false)).toBe(false);
  });

  it("names the demo origin plainly", () => {
    expect(isDemoOrigin(DEMO_PLACES[0])).toBe(true);
    expect(originNotice(DEMO_PLACES[0])).toBe(
      "Starting from King's Cross (demo)",
    );
    expect(
      originNotice({ id: "device-position", name: "Your position" }),
    ).toBeNull();
    expect(originNotice(DEMO_PLACES[1])).toBeNull();
  });
});

describe("live GPS acknowledgement (UX-003)", () => {
  it("is asked on first use and again after an app update", () => {
    expect(needsLiveAck(null, "1.0.0")).toBe(true);
    expect(needsLiveAck(undefined, "1.0.0")).toBe(true);
    expect(needsLiveAck("1.0.0", "1.0.0")).toBe(false);
    expect(needsLiveAck("1.0.0", "1.1.0")).toBe(true);
  });
});

const step = (
  instruction: string,
  distanceM: number,
  type = "turn",
  x = 0,
): Step => ({
  instruction,
  distanceM,
  durationS: 10,
  coordinate: [x, 51.5],
  type,
});
const route = {
  id: "r1",
  steps: [
    step("Head north on York Way", 120, "depart", 1),
    step("Turn left onto Euston Road", 800, "turn", 2),
    step("Turn right onto Gower Street", 300, "turn", 3),
    step("You have arrived", 0, "arrive", 4),
  ],
} as Pick<Route, "id" | "steps">;
const metres = (m: number) => `${m} m`;

describe("step list (FEAT-001)", () => {
  it("lists every step as text before a trip", () => {
    const items = stepItems(route, null, metres);
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.status === "next")).toBe(true);
    expect(items[1].label).toBe(
      "Step 2 of 4. Turn left onto Euston Road, then 800 m.",
    );
    expect(items[3]).toMatchObject({ arrive: true, distance: "" });
  });

  it("marks done, current and next steps during guidance", () => {
    // A copy, as the live hook may hand back an equal but different object.
    const current = { ...route.steps[2] };
    expect(currentStepIndex(route.steps, current)).toBe(2);
    const items = stepItems(route, current, metres);
    expect(items.map((i) => i.status)).toEqual([
      "done",
      "done",
      "current",
      "next",
    ]);
    expect(items[2].label.startsWith("Current step. Step 3 of 4.")).toBe(true);
  });

  it("handles no route and blank instructions", () => {
    expect(stepItems(null, null, metres)).toEqual([]);
    const blank = { id: "b", steps: [step("  ", 50)] } as Pick<
      Route,
      "id" | "steps"
    >;
    expect(stepItems(blank, null, metres)[0].instruction).toBe("Continue");
  });
});

describe("screen-reader announcements (A11Y-001)", () => {
  it("phrases the next turn with its distance", () => {
    expect(stepAnnouncement(route.steps[1], metres)).toBe(
      "In 800 m, turn left onto Euston Road",
    );
    expect(stepAnnouncement(route.steps[3], metres)).toBe("You have arrived");
    expect(stepAnnouncement(null, metres)).toBe("");
  });

  it("announces each new step once and stays quiet when voice is on", () => {
    expect(nextAnnouncement("", "In 800 m, turn left", false)).toBe(
      "In 800 m, turn left",
    );
    expect(
      nextAnnouncement("In 800 m, turn left", "In 800 m, turn left", false),
    ).toBeNull();
    expect(nextAnnouncement("a", "b", true)).toBeNull();
    expect(nextAnnouncement("a", "", false)).toBeNull();
  });
});

describe("colour contrast (A11Y-003)", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // The audit's failing pairs, reproduced.
    expect(contrastRatio("#9B6500", "#152235")).toBeCloseTo(3.24, 2);
    expect(contrastRatio("#AABBB2", "#FFFFFF")).toBeCloseTo(2.01, 2);
    expect(contrastRatio("#CBD5D1", "#FFFFFF")).toBeCloseTo(1.5, 2);
  });

  for (const theme of ["light", "dark"] as const) {
    const c = A11Y_COLORS[theme];
    it(`${theme}: safety label and muted text reach 4.5:1`, () => {
      expect(contrastRatio(c.safetyLabel, c.surface)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(c.muted, c.surface)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: radio ring and switch track reach 3:1`, () => {
      expect(contrastRatio(c.radioRing, c.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.switchTrackOff, c.surface)).toBeGreaterThanOrEqual(
        3,
      );
    });
  }

  it("light muted text also passes on the tinted note and card backgrounds", () => {
    for (const bg of [
      "#F2F6F4",
      "#F0F8F3",
      "#F3F6F3",
      "#F5F7F5",
      "#E9F0EC",
      "#F2F5F3",
    ])
      expect(contrastRatio(A11Y_COLORS.light.muted, bg)).toBeGreaterThanOrEqual(
        4.5,
      );
  });
});

describe("root error boundary (OPS-002)", () => {
  it("captures a short message and clears on retry", () => {
    expect(boundaryState(new Error("boom"))).toEqual({
      failed: true,
      message: "boom",
    });
    expect(boundaryState("bad")).toEqual({ failed: true, message: "bad" });
    expect(boundaryState({})).toEqual({
      failed: true,
      message: "Unknown error",
    });
    expect(boundaryState(new Error("x".repeat(400))).message).toHaveLength(160);
    expect(boundaryState(null)).toEqual({ failed: false, message: "" });
  });
});

describe("flagged colours are gone from the screens", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  it("ui palette uses the accessible muted colour", () => {
    expect(read("components/nexora/ui.tsx")).toContain(
      `muted: "${A11Y_COLORS.light.muted}"`,
    );
  });
  it("Panels and NexoraApp no longer use the failing ring, track or label colours", () => {
    const src =
      read("components/nexora/Panels.tsx") +
      read("components/nexora/NexoraApp.tsx");
    for (const bad of ["#AABBB2", "#CBD5D1", "#CAD7D0", 'color: "#9B6500"'])
      expect(src).not.toContain(bad);
  });
});
