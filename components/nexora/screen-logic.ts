/**
 * Pure screen helpers for the NEXORA UI: back-button order, first-run and
 * live-start acknowledgement rules, step list text, screen-reader
 * announcements and colour contrast. No React Native imports, so the rules
 * can be unit tested in Node.
 */
import type { Panel } from "@/hooks/use-nexora";
import type { Place, Route, Step } from "@/shared/nexora/domain";

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

/** The acknowledgement is asked once per install and app version. */
export function needsLiveAck(
  storedVersion: string | null | undefined,
  appVersion: string,
): boolean {
  return storedVersion !== appVersion;
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
 * Every step of the route as text, marked done / current / next. With no
 * current step (planning) all steps are "next".
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
        ? "Current step. "
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
