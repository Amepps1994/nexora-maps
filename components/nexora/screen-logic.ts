/**
 * Pure screen helpers for the NEXORA UI: back-button order, first-run and
 * live-start acknowledgement rules, step list text, screen-reader
 * announcements and colour contrast. No React Native imports, so the rules
 * can be unit tested in Node.
 */
import type { Panel } from "@/hooks/use-nexora";
import type { Place, Route, Step } from "@/shared/nexora/domain";
import type { CarGuidanceSnapshot } from "@/shared/nexora/car-guidance";

// ---------------------------------------------------------------------------
// Android back button (BUG-008)

export type BackState = {
  panel: Panel;
  /** Guidance (simulation or live) is running. */
  active: boolean;
  /** The "End guidance?" confirmation is showing. */
  confirmingEnd: boolean;
  /** The live-start acknowledgement is showing inside the routes sheet. */
  liveAckOpen?: boolean;
  /** The arrival card is showing. */
  arrived: boolean;
  hasDestination: boolean;
  tab: string;
};

export type BackAction =
  | { kind: "dismiss-confirm" }
  | { kind: "close-live-ack" }
  | { kind: "panel"; to: Panel }
  | { kind: "confirm-end" }
  | { kind: "reset" }
  | { kind: "home-tab" }
  /** Let the OS handle it (leave the app). */
  | { kind: "exit" };

/** Which panel the back button returns to from `panel`. */
export function previousPanel(panel: Panel, hasDestination: boolean): Panel {
  if (panel === "routes") return hasDestination ? "place" : null;
  if (panel === "export") return "privacy";
  return null;
}

/**
 * What one press of the hardware back button should do. The innermost
 * thing closes first; guidance is never ended without a confirmation.
 */
export function backAction(s: BackState): BackAction {
  if (s.confirmingEnd) return { kind: "dismiss-confirm" };
  if (s.liveAckOpen) return { kind: "close-live-ack" };
  if (s.panel)
    return { kind: "panel", to: previousPanel(s.panel, s.hasDestination) };
  if (s.active) return { kind: "confirm-end" };
  if (s.arrived) return { kind: "reset" };
  if (s.tab !== "Home") return { kind: "home-tab" };
  return { kind: "exit" };
}

// ---------------------------------------------------------------------------
// First run and default origin (BUG-009)

export function shouldAutoOpenOnboarding(
  hydrated: boolean,
  onboardingSeen: boolean,
  alreadyOpened: boolean,
): boolean {
  return hydrated && !onboardingSeen && !alreadyOpened;
}

/** id of the demo origin the planner starts from (fixtures DEMO_PLACES[0]). */
export const DEMO_ORIGIN_ID = "kings-cross";

export function isDemoOrigin(origin: Pick<Place, "id">): boolean {
  return origin.id === DEMO_ORIGIN_ID;
}

export function originNotice(
  origin: Pick<Place, "id" | "name">,
): string | null {
  return isDemoOrigin(origin) ? `Starting from ${origin.name} (demo)` : null;
}

// ---------------------------------------------------------------------------
// Live GPS acknowledgement (UX-003)

export const LIVE_ACK_STORE = "nexora-live-ack-v1";

/**
 * Identifier the acknowledgement is keyed to (UX-003). `version` in
 * app.config.ts alone stayed at 1.0.0 across builds, so the native build
 * number (Android versionCode / iOS buildNumber) and the update id are part
 * of the key: a new APK or OTA update asks again even if nobody bumped the
 * version string.
 */
export function releaseId(parts: {
  version?: string | null;
  build?: string | number | null;
  update?: string | null;
}): string {
  const out = [parts.version?.toString().trim() || "0"];
  const build = parts.build?.toString().trim();
  if (build) out.push(`b${build}`);
  const update = parts.update?.trim();
  if (update) out.push(`u${update}`);
  return out.join("+");
}

/** The acknowledgement is asked once per install and release. */
export function needsLiveAck(
  storedVersion: string | null | undefined,
  appVersion: string,
): boolean {
  return !storedVersion || storedVersion !== appVersion;
}

/**
 * What the guidance X button does (UX-005). Live GPS guidance asks first,
 * with the same "End guidance?" sheet as the back key; a simulation is a test
 * tool and ends straight away.
 */
export function endButtonAction(
  source: "simulation" | "live" | string | null | undefined,
): "confirm" | "end" {
  return source === "live" ? "confirm" : "end";
}

// ---------------------------------------------------------------------------
// Notification permission timing (UX-010)

/**
 * Where the guidance-card notification permission may be requested. Only
 * from a screen the user is looking at before guidance starts (onboarding's
 * location step or the live GPS acknowledgement), never from a guidance
 * update, so no system dialog covers an active guidance screen.
 */
export type NotificationAskPoint =
  | "onboarding"
  | "live-ack"
  | "live-start"
  | "guidance-update";

export function mayAskNotifications(
  point: NotificationAskPoint,
  guidanceActive: boolean,
): boolean {
  if (guidanceActive) return false;
  return point !== "guidance-update";
}

/**
 * Lock-screen card text while the app is in the background (UX-010). Live
 * GPS guidance only runs while the app is open, so a backgrounded live card
 * says it is paused instead of showing a turn that may no longer be right.
 */
export function backgroundCardContent(
  snapshot: Pick<CarGuidanceSnapshot, "active" | "source" | "phase">,
  content: { title: string; body: string },
): { title: string; body: string } {
  if (snapshot.active && snapshot.source === "live")
    return {
      title: "Guidance paused. Open NEXORA to continue.",
      body: content.title ? `Last instruction: ${content.title}` : content.body,
    };
  return content;
}

// ---------------------------------------------------------------------------
// Step list (FEAT-001)

export type StepStatus = "done" | "current" | "next";

export type StepItem = {
  key: string;
  index: number;
  instruction: string;
  distance: string;
  status: StepStatus;
  arrive: boolean;
  /** Full sentence for screen readers. */
  label: string;
};

function sameStep(a: Step, b: Step): boolean {
  return (
    a === b ||
    (a.instruction === b.instruction &&
      a.coordinate[0] === b.coordinate[0] &&
      a.coordinate[1] === b.coordinate[1])
  );
}

/** Index of `current` in `steps`, or -1 when it is not known. */
export function currentStepIndex(steps: Step[], current?: Step | null): number {
  if (!current) return -1;
  return steps.findIndex((s) => sameStep(s, current));
}

/**
 * Every step of the route as text, marked done / current / next. `current`
 * is the guidance step, which means the next manoeuvre to make (PR #10), so
 * it is read as "Next turn". With no current step (planning) all steps are
 * "next".
 */
export function stepItems(
  route: Pick<Route, "steps" | "id"> | null | undefined,
  current: Step | null | undefined,
  formatDistance: (m: number) => string,
): StepItem[] {
  if (!route) return [];
  const at = currentStepIndex(route.steps, current);
  const total = route.steps.length;
  return route.steps.map((step, index) => {
    const status: StepStatus =
      at < 0 || index > at ? "next" : index === at ? "current" : "done";
    const arrive = step.type.includes("arrive");
    const instruction =
      step.instruction.trim() || (arrive ? "Arrive" : "Continue");
    const distance =
      arrive || step.distanceM <= 0 ? "" : formatDistance(step.distanceM);
    const prefix =
      status === "current"
        ? "Next turn. "
        : status === "done"
          ? "Done. "
          : "";
    return {
      key: `${route.id}-${index}`,
      index,
      instruction,
      distance,
      status,
      arrive,
      label: `${prefix}Step ${index + 1} of ${total}. ${instruction}${distance ? `, then ${distance}` : ""}.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Screen-reader announcements (A11Y-001)

/** Spoken text for the turn banner. */
export function stepAnnouncement(
  step: Pick<Step, "instruction" | "distanceM" | "type"> | null | undefined,
  formatDistance: (m: number) => string,
): string {
  if (!step) return "";
  const text = step.instruction.trim();
  if (!text) return "";
  if (step.type.includes("arrive") || step.distanceM <= 0) return text;
  return `In ${formatDistance(step.distanceM)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/**
 * Identity of the step being announced (A11Y-006): route id plus the step's
 * index in that route. The distance in the spoken text changes on every GPS
 * fix or simulation tick, so the text itself cannot be the key. Empty when
 * there is no step.
 */
export function stepIdentity(
  route: Pick<Route, "id" | "steps"> | null | undefined,
  step: Step | null | undefined,
): string {
  if (!route || !step) return "";
  const at = currentStepIndex(route.steps, step);
  // A step that is not in the route (should not happen) falls back to its
  // instruction, which still ignores distance-only changes.
  return at >= 0
    ? `${route.id}#${at}`
    : `${route.id}~${step.instruction.trim()}`;
}

/**
 * Step announcement to make now (A11Y-006), or null. Announces once when the
 * step identity changes, never when only the distance in `text` changes.
 * With voice guidance on, the speech engine already reads the step.
 */
export function nextStepAnnouncement(
  previousKey: string,
  key: string,
  text: string,
  voiceOn: boolean,
): string | null {
  if (!key || key === previousKey || !text) return null;
  return voiceOn ? null : text;
}

/**
 * Text to announce now, or null when nothing changed since `previous`. Each
 * new step is announced once; repeated renders with the same text are quiet.
 * When voice guidance is on the speech engine already reads the step, so
 * the screen reader stays quiet to avoid two voices.
 */
export function nextAnnouncement(
  previous: string,
  next: string,
  voiceOn: boolean,
): string | null {
  if (!next || next === previous) return null;
  return voiceOn ? null : next;
}

// ---------------------------------------------------------------------------
// Colour contrast (A11Y-003)

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, "$&$&") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Accessible colours for the elements the audit flagged. */
export const A11Y_COLORS = {
  light: {
    surface: "#FFFFFF",
    muted: "#5C6D68",
    safetyLabel: "#9B6500",
    radioRing: "#7A8B85",
    switchTrackOff: "#7A8B85",
  },
  dark: {
    surface: "#152235",
    muted: "#A0B4AF",
    safetyLabel: "#F5B544",
    radioRing: "#7A8B85",
    switchTrackOff: "#7A8B85",
  },
} as const;

export function a11yColors(dark: boolean) {
  return dark ? A11Y_COLORS.dark : A11Y_COLORS.light;
}

// ---------------------------------------------------------------------------
// Root error boundary (OPS-002)

export type BoundaryState = { failed: boolean; message: string };

/** State for the root error boundary; `null` clears it. */
export function boundaryState(error: unknown): BoundaryState {
  if (error === null || error === undefined)
    return { failed: false, message: "" };
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim().slice(0, 160) || "Unknown error";
  return { failed: true, message };
}

// ---------------------------------------------------------------------------
// Server cold start banner (BUG-001 UI part)

/**
 * Waking / unreachable line shown at the top of the search and routes sheets
 * (UX-009). Those sheets cover the home banner, so without this the user
 * waits on a slow first request with no explanation.
 */
export function panelServerNotice(
  state: "waking" | "ready" | "unreachable" | undefined,
  busy: boolean,
  online = true,
): { text: string; warning: boolean } | null {
  if (!online || !state || state === "ready") return null;
  if (state === "waking")
    return {
      text: busy
        ? "Waking the NEXORA server… this can take up to a minute."
        : "The NEXORA server is waking up. The first search or route can take up to a minute.",
      warning: false,
    };
  return {
    text: "NEXORA server unreachable. Demo places, saved places and offline maps still work.",
    warning: true,
  };
}

/** Banner text for the API server state, or null when it is ready. */
export function serverBanner(
  state: "waking" | "ready" | "unreachable" | undefined,
  online: boolean,
): { text: string; warning: boolean } | null {
  if (!online || !state || state === "ready") return null;
  if (state === "waking")
    return {
      text: "Waking the NEXORA server… the first search or route can take up to a minute.",
      warning: false,
    };
  return {
    text: "NEXORA server unreachable. Saved places and offline maps still work; try again shortly.",
    warning: true,
  };
}

// ---------------------------------------------------------------------------
// Starting guidance: live GPS by default, simulation for developers only

/**
 * Developer tools (simulated navigation, test event buttons) appear in
 * development builds, or in any build made with EXPO_PUBLIC_NEXORA_DEV_TOOLS=1.
 * Release APKs show live GPS guidance only.
 */
export function devToolsEnabled(
  isDev: boolean,
  flag?: string | null,
): boolean {
  return isDev || flag?.trim() === "1";
}

/** Which start buttons the route sheet offers. */
export function guidanceStartChoices(
  route: Pick<Route, "demo"> | null | undefined,
  devTools: boolean,
): { live: boolean; simulation: boolean } {
  if (!route) return { live: false, simulation: false };
  // A synthetic sample route (server unreachable) does not start where the
  // phone is, so it cannot be followed with GPS.
  return { live: !route.demo, simulation: devTools };
}

export type LiveStartResult =
  | "ok"
  | "denied"
  | "blocked"
  | "services-off"
  | "error";

/** What to tell the user when live guidance could not start. */
export function liveStartMessage(result: LiveStartResult): string {
  switch (result) {
    case "ok":
      return "";
    case "denied":
      return "Navigation needs location access. Allow it when asked, then tap Start again.";
    case "blocked":
      return "Location is blocked for NEXORA. Allow it in system settings, then tap Start again.";
    case "services-off":
      return "Turn on location services, then tap Start again.";
    default:
      return "Couldn't get your location. Check location is on, then tap Start again.";
  }
}
