import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  A11Y_COLORS,
  backAction,
  backgroundCardContent,
  boundaryState,
  contrastRatio,
  currentStepIndex,
  endButtonAction,
  isDemoOrigin,
  mayAskNotifications,
  needsLiveAck,
  nextAnnouncement,
  nextStepAnnouncement,
  originNotice,
  panelServerNotice,
  previousPanel,
  releaseId,
  serverBanner,
  shouldAutoOpenOnboarding,
  stepAnnouncement,
  stepIdentity,
  stepItems,
  type BackState,
} from "../components/nexora/screen-logic";

// ui.tsx and the lock-screen card are React Native modules; stub the native
// pieces so their behaviour can be checked in Node.
const rn = vi.hoisted(() => {
  let appListener: ((s: string) => void) | null = null;
  let guidanceListener: ((s: unknown) => void) | null = null;
  let granted = false;
  const state = { current: "active" };
  return {
    state,
    notifications: {
      getPermissionsAsync: vi.fn(async () => ({ granted, canAskAgain: true })),
      requestPermissionsAsync: vi.fn(async () => {
        granted = true;
        return { granted: true };
      }),
      setNotificationChannelAsync: vi.fn(async () => undefined),
      scheduleNotificationAsync: vi.fn(
        async (_req: { content: { title: string } }) => "id",
      ),
      dismissNotificationAsync: vi.fn(async () => undefined),
      AndroidImportance: { LOW: 2 },
      AndroidNotificationVisibility: { PUBLIC: 1 },
      AndroidNotificationPriority: { LOW: "low" },
    },
    onAppState: (fn: (s: string) => void) => {
      appListener = fn;
    },
    onGuidance: (fn: (s: unknown) => void) => {
      guidanceListener = fn;
      return () => undefined;
    },
    setAppState: (s: string) => {
      state.current = s;
      appListener?.(s);
    },
    publish: (s: unknown) => guidanceListener?.(s),
  };
});
vi.mock("react-native", () => ({
  Pressable: () => null,
  Text: () => null,
  View: () => null,
  StyleSheet: { create: <T>(x: T) => x },
  Platform: { OS: "android" },
  AppState: {
    get currentState() {
      return rn.state.current;
    },
    addEventListener: (_: string, fn: (s: string) => void) => {
      rn.onAppState(fn);
      return { remove: () => undefined };
    },
  },
}));
vi.mock("expo-notifications", () => rn.notifications);
vi.mock("../lib/car/guidance-bus", () => ({
  subscribeCarGuidance: (fn: (s: unknown) => void) => rn.onGuidance(fn),
}));
// The test runner does not resolve the "@/" alias inside app modules.
vi.mock(
  "@/shared/nexora/car-guidance",
  () => import("../shared/nexora/car-guidance"),
);
vi.mock(
  "@/components/nexora/screen-logic",
  () => import("../components/nexora/screen-logic"),
);
vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("react-native-svg", () => ({ default: () => null, Path: () => null }));
import { palette } from "../components/nexora/ui";
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
    expect(needsLiveAck("", "1.0.0")).toBe(true);
  });

  it("keys on the release, so a new build asks again even at the same version", () => {
    expect(releaseId({ version: "1.0.0" })).toBe("1.0.0");
    expect(releaseId({ version: "1.0.0", build: 7 })).toBe("1.0.0+b7");
    expect(releaseId({ version: "1.0.0", build: "8", update: "abc" })).toBe(
      "1.0.0+b8+uabc",
    );
    expect(releaseId({ version: null, build: null })).toBe("0");
    const first = releaseId({ version: "1.0.0", build: 7 });
    expect(needsLiveAck(first, first)).toBe(false);
    expect(needsLiveAck(first, releaseId({ version: "1.0.0", build: 8 }))).toBe(
      true,
    );
    expect(needsLiveAck(first, releaseId({ version: "1.0.1", build: 7 }))).toBe(
      true,
    );
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
    expect(items[2].label.startsWith("Next turn. Step 3 of 4.")).toBe(true);
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

describe("one announcement per step (A11Y-006)", () => {
  // A drive where the hook hands back a fresh step object with a shorter
  // distance on every GPS fix or simulation tick.
  const ticks = route.steps.flatMap((st) =>
    st.distanceM > 0
      ? [1, 0.75, 0.5, 0.25, 0.05].map((f) => ({
          ...st,
          distanceM: Math.round(st.distanceM * f),
        }))
      : [{ ...st }, { ...st }],
  );

  function drive(voiceOn: boolean) {
    let last = "";
    const said: string[] = [];
    for (const st of ticks) {
      const key = stepIdentity(route, st);
      const say = nextStepAnnouncement(
        last,
        key,
        stepAnnouncement(st, metres),
        voiceOn,
      );
      last = key;
      if (say) said.push(say);
    }
    return said;
  }

  it("announces each step once over a ticking drive", () => {
    const said = drive(false);
    expect(said).toHaveLength(route.steps.length);
    expect(said[1]).toBe("In 800 m, turn left onto Euston Road");
    // The text-keyed rule announced on every distance change.
    let last = "";
    let textKeyed = 0;
    for (const st of ticks) {
      const text = stepAnnouncement(st, metres);
      if (nextAnnouncement(last, text, false)) textKeyed++;
      last = text;
    }
    expect(textKeyed).toBeGreaterThan(route.steps.length);
  });

  it("stays quiet with voice on and keys on route id plus index", () => {
    expect(drive(true)).toEqual([]);
    expect(stepIdentity(route, { ...route.steps[2], distanceM: 5 })).toBe(
      "r1#2",
    );
    expect(stepIdentity({ ...route, id: "r2" }, route.steps[2])).toBe("r2#2");
    expect(stepIdentity(null, route.steps[0])).toBe("");
    expect(stepIdentity(route, null)).toBe("");
    expect(nextStepAnnouncement("r1#1", "r1#1", "x", false)).toBeNull();
    expect(nextStepAnnouncement("r1#1", "r1#2", "", false)).toBeNull();
    expect(nextStepAnnouncement("r1#1", "", "x", false)).toBeNull();
  });

  it("announces the same step again on a new trip", () => {
    // Guidance ends (key becomes empty) and restarts on the same route.
    expect(nextStepAnnouncement("", "r1#0", "Head north", false)).toBe(
      "Head north",
    );
  });
});

describe("ending guidance (UX-005)", () => {
  it("X and back both ask before ending live guidance", () => {
    expect(endButtonAction("live")).toBe("confirm");
    expect(backAction({ ...idle, active: true })).toEqual({
      kind: "confirm-end",
    });
  });
  it("X ends a simulation straight away", () => {
    expect(endButtonAction("simulation")).toBe("end");
    expect(endButtonAction(undefined)).toBe("end");
  });
});

describe("notification prompt timing (UX-010)", () => {
  it("asks only before guidance, never from a guidance update", () => {
    expect(mayAskNotifications("onboarding", false)).toBe(true);
    expect(mayAskNotifications("live-ack", false)).toBe(true);
    expect(mayAskNotifications("live-start", false)).toBe(true);
    expect(mayAskNotifications("guidance-update", false)).toBe(false);
    for (const p of ["onboarding", "live-ack", "live-start"] as const)
      expect(mayAskNotifications(p, true)).toBe(false);
  });

  it("labels a backgrounded live card as paused", () => {
    const content = { title: "200 m · Turn left", body: "3 km · 8 min" };
    expect(
      backgroundCardContent(
        { active: true, source: "live", phase: "guiding" },
        content,
      ),
    ).toEqual({
      title: "Guidance paused. Open NEXORA to continue.",
      body: "Last instruction: 200 m · Turn left",
    });
    expect(
      backgroundCardContent(
        { active: true, source: "simulation", phase: "guiding" },
        content,
      ),
    ).toBe(content);
    expect(
      backgroundCardContent(
        { active: false, source: "live", phase: "arrived" },
        content,
      ),
    ).toBe(content);
  });

  it("the lock-screen card never asks for permission from a guidance update", async () => {
    const { startLockScreenGuidance, requestGuidanceNotifications } =
      await import("../lib/car/lock-screen-guidance");
    startLockScreenGuidance();
    const snap = (over: Record<string, unknown> = {}) => ({
      active: true,
      phase: "guiding",
      source: "live",
      simulated: false,
      tripId: "t1",
      destinationName: "Tate Modern",
      destinationCoordinate: null,
      next: { instruction: "Turn left onto Euston Road" },
      distanceToNextM: 200,
      remainingDistanceM: 3000,
      remainingDurationS: 480,
      etaMs: null,
      muted: true,
      metric: true,
      statusLine: "Unverified for road use",
      geometry: [],
      position: null,
      ...over,
    });
    // Guidance starts and updates in the foreground, then the app is backgrounded.
    rn.publish(snap());
    rn.publish(snap({ distanceToNextM: 150 }));
    rn.setAppState("background");
    rn.publish(snap({ distanceToNextM: 100 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(rn.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    // Not granted yet, so nothing was shown either.
    expect(rn.notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    // Asked from the live acknowledgement, before guidance starts.
    rn.setAppState("active");
    rn.publish(snap({ active: false, phase: "idle" }));
    expect(await requestGuidanceNotifications("live-ack", true)).toBe(false);
    expect(rn.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await requestGuidanceNotifications("live-ack", false)).toBe(true);
    expect(rn.notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);

    rn.publish(snap());
    rn.setAppState("background");
    await new Promise((r) => setTimeout(r, 0));
    const shown =
      rn.notifications.scheduleNotificationAsync.mock.calls.at(-1)?.[0];
    expect(shown?.content.title).toBe(
      "Guidance paused. Open NEXORA to continue.",
    );
    expect(rn.notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
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
  it("ui palette text colours pass contrast on its surfaces", () => {
    expect(palette.muted).toBe(A11Y_COLORS.light.muted);
    for (const bg of [palette.surface, palette.background])
      for (const fg of [palette.muted, palette.amber, palette.ink])
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  // Guard against the failing literals coming back in inline styles.
  it("Panels and NexoraApp no longer use the failing ring, track or label colours", () => {
    const src =
      read("components/nexora/Panels.tsx") +
      read("components/nexora/NexoraApp.tsx");
    for (const bad of ["#AABBB2", "#CBD5D1", "#CAD7D0", 'color: "#9B6500"'])
      expect(src).not.toContain(bad);
  });
});

describe("server notice inside sheets (UX-009)", () => {
  it("shows while waking or unreachable, never when ready or offline", () => {
    expect(panelServerNotice("ready", true)).toBeNull();
    expect(panelServerNotice(undefined, false)).toBeNull();
    expect(panelServerNotice("waking", true, false)).toBeNull();
    expect(panelServerNotice("waking", false)).toMatchObject({
      warning: false,
    });
    expect(panelServerNotice("waking", false)?.text).toContain("first search");
    expect(panelServerNotice("waking", true)?.text).toContain(
      "this can take up to a minute",
    );
    expect(panelServerNotice("unreachable", false)).toMatchObject({
      warning: true,
    });
  });
});

describe("server cold-start banner", () => {
  it("shows while the server wakes or is unreachable, never when ready or offline", () => {
    expect(serverBanner("ready", true)).toBeNull();
    expect(serverBanner(undefined, true)).toBeNull();
    expect(serverBanner("waking", false)).toBeNull();
    expect(serverBanner("waking", true)).toMatchObject({ warning: false });
    expect(serverBanner("waking", true)?.text).toContain("up to a minute");
    expect(serverBanner("unreachable", true)).toMatchObject({ warning: true });
  });
});
