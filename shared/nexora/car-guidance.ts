/**
 * Platform-neutral guidance snapshot for car displays (Android Auto, CarPlay) and the
 * lock-screen card. Pure: no React, no native modules, no timers, no network.
 *
 * Safety rule (ROADMAP F3.4-04 / CAR-DISPLAYS): car and lock-screen surfaces are
 * unverified for road use until tested in a real car. Every snapshot carries that label,
 * and simulated guidance is always marked as simulated.
 */
import type { NavigationState, Route, Step } from "./domain";
import {
  roadNameFromText,
  stepDirection,
  type TurnDirection,
} from "./maneuver";

export type GuidanceSource = "simulation" | "live";

export type CarManeuverKind =
  | "depart"
  | "arrive"
  | "waypoint"
  | "straight"
  | "turn"
  | "roundabout"
  | "fork"
  | "keep"
  | "on-ramp"
  | "off-ramp"
  | "ferry";

export type CarTurnDirection = TurnDirection;

export interface CarManeuver {
  kind: CarManeuverKind;
  direction: CarTurnDirection;
  /** Roundabout exit, 1-based, when the provider gave one. */
  exit?: number;
  roadName?: string;
  instruction: string;
  /** [longitude, latitude] of the manoeuvre point. */
  coordinate: [number, number];
}

export type CarGuidancePhase =
  | "idle"
  | "preview"
  | "guiding"
  | "paused"
  | "degraded"
  | "offline"
  | "rerouting"
  | "arrived";

export interface CarGuidanceSnapshot {
  /** True while a guidance session is running (navigating/degraded/offline/rerouting). */
  active: boolean;
  phase: CarGuidancePhase;
  source: GuidanceSource;
  simulated: boolean;
  /** Stable id for the current trip, so car hosts can tell a new trip from an update. */
  tripId: string | null;
  destinationName: string | null;
  destinationCoordinate: [number, number] | null;
  /** The next manoeuvre the driver must make (not the segment being driven). */
  next: CarManeuver | null;
  distanceToNextM: number | null;
  remainingDistanceM: number | null;
  remainingDurationS: number | null;
  /** Arrival time in ms since epoch, or null when unknown. */
  etaMs: number | null;
  muted: boolean;
  metric: boolean;
  /** Short status line, always shown on car and lock-screen surfaces. */
  statusLine: string;
  /** Route geometry for the car overview drawing, [lon, lat] pairs. */
  geometry: [number, number][];
  /** Current position on the route, when known. */
  position: [number, number] | null;
}

export interface CarGuidanceInput {
  state: NavigationState;
  route?: Route | null;
  step?: Step | null;
  progress: number;
  paused: boolean;
  muted: boolean;
  metric: boolean;
  source?: GuidanceSource;
  destinationName?: string | null;
  position?: [number, number] | null;
  now: number;
}

export const ROAD_USE_LABEL = "Unverified for road use";

const ACTIVE_STATES: readonly NavigationState[] = [
  "navigating",
  "degraded",
  "offline",
  "rerouting",
];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Map a NEXORA route step (OSRM maneuver type + instruction) to a car manoeuvre. */
export function toCarManeuver(step: Step): CarManeuver {
  const type = (step.type || "").toLowerCase();
  const text = step.instruction || "";
  const roadName = roadNameFromText(text) ?? (step.ref || undefined);
  // The provider modifier wins; older saved routes fall back to the text before
  // "onto <road>", so road names like "Left Bank Road" never change the arrow.
  const direction = stepDirection(step);
  const base = {
    instruction: text,
    coordinate: [step.coordinate[0], step.coordinate[1]] as [number, number],
    ...(roadName ? { roadName } : {}),
  };
  if (type === "depart") return { ...base, kind: "depart", direction };
  if (type === "arrive" || type === "synthetic-arrive")
    return { ...base, kind: "arrive", direction };
  if (type.includes("waypoint") || type === "synthetic-stop")
    return { ...base, kind: "waypoint", direction };
  if (
    type === "roundabout" ||
    type === "rotary" ||
    (type.startsWith("roundabout") && type !== "roundabout turn")
  ) {
    const textExit = text.replace(/\bonto\s+.+$/i, "").match(/\bexit\s+(\d+)/i);
    const exit = step.exit ?? (textExit ? Number(textExit[1]) : undefined);
    return {
      ...base,
      kind: "roundabout",
      direction,
      ...(exit ? { exit } : {}),
    };
  }
  if (type === "fork") return { ...base, kind: "fork", direction };
  if (type === "on ramp") return { ...base, kind: "on-ramp", direction };
  if (type === "off ramp") return { ...base, kind: "off-ramp", direction };
  if (type === "merge") return { ...base, kind: "keep", direction };
  if (type === "ferry" || /\bferry\b/i.test(text.replace(/\bonto\s+.+$/i, "")))
    return { ...base, kind: "ferry", direction };
  // A `continue` / `new name` that bends is a real manoeuvre (BUG-004):
  // slight bends are "keep", turns and U-turns are "turn".
  if (direction === "straight")
    return { ...base, kind: "straight", direction: "straight" };
  if (
    (type === "continue" || type === "new name") &&
    direction.startsWith("slight")
  )
    return { ...base, kind: "keep", direction };
  return { ...base, kind: "turn", direction };
}

function sameStep(a: Step, b: Step): boolean {
  return (
    a.instruction === b.instruction &&
    a.type === b.type &&
    a.coordinate[0] === b.coordinate[0] &&
    a.coordinate[1] === b.coordinate[1]
  );
}

function phaseFor(state: NavigationState, paused: boolean): CarGuidancePhase {
  switch (state) {
    case "navigating":
      return paused ? "paused" : "guiding";
    case "degraded":
    case "offline":
    case "rerouting":
      return state;
    case "preview":
      return "preview";
    case "arrived":
      return "arrived";
    default:
      return "idle";
  }
}

function statusLineFor(phase: CarGuidancePhase, simulated: boolean): string {
  const tag = simulated ? `Simulation · ${ROAD_USE_LABEL}` : ROAD_USE_LABEL;
  switch (phase) {
    case "guiding":
      return tag;
    case "paused":
      return `Paused · ${tag}`;
    case "degraded":
      return `GPS signal weak · position uncertain · ${ROAD_USE_LABEL}`;
    case "offline":
      return `Offline · cached route only · ${ROAD_USE_LABEL}`;
    case "rerouting":
      return `Rerouting · ${ROAD_USE_LABEL}`;
    case "arrived":
      return "You have arrived";
    case "preview":
      return "Route ready on your phone · start guidance there";
    default:
      return "Plan a route on your phone to start";
  }
}

/** Build the snapshot every car and lock-screen surface renders. */
export function buildCarGuidance(input: CarGuidanceInput): CarGuidanceSnapshot {
  const source: GuidanceSource = input.source ?? "simulation";
  const route = input.route ?? null;
  const active = ACTIVE_STATES.includes(input.state) && !!route;
  const phase = route ? phaseFor(input.state, input.paused) : "idle";
  const simulated = source === "simulation" || !!route?.demo;
  const p = clamp01(input.progress);
  const destination = route?.steps.length
    ? route.steps[route.steps.length - 1].coordinate
    : route?.geometry.length
      ? route.geometry[route.geometry.length - 1]
      : null;

  let next: CarManeuver | null = null;
  let distanceToNextM: number | null = null;
  if (route && route.steps.length) {
    const current = input.step ?? route.steps[0];
    const index = route.steps.findIndex((s) => sameStep(s, current));
    const nextStep =
      index >= 0 && index + 1 < route.steps.length
        ? route.steps[index + 1]
        : index >= 0
          ? route.steps[index]
          : current;
    next = toCarManeuver(nextStep);
    distanceToNextM = Math.max(0, Math.round(current.distanceM));
    if (phase === "arrived") {
      next = toCarManeuver(route.steps[route.steps.length - 1]);
      next.kind = "arrive";
      distanceToNextM = 0;
    }
  }

  const remainingDistanceM = route
    ? Math.max(0, Math.round(route.distanceM * (1 - p)))
    : null;
  const remainingDurationS = route
    ? Math.max(0, Math.round(route.durationS * (1 - p)))
    : null;
  const etaMs =
    remainingDurationS !== null && phase !== "arrived"
      ? input.now + remainingDurationS * 1000
      : null;

  return {
    active,
    phase,
    source,
    simulated,
    tripId: route ? route.id : null,
    destinationName: input.destinationName ?? null,
    destinationCoordinate: destination
      ? [destination[0], destination[1]]
      : null,
    next,
    distanceToNextM,
    remainingDistanceM,
    remainingDurationS,
    etaMs,
    muted: input.muted,
    metric: input.metric,
    statusLine: statusLineFor(phase, simulated),
    geometry: route ? route.geometry.map((c) => [c[0], c[1]]) : [],
    position: input.position ? [input.position[0], input.position[1]] : null,
  };
}

/** Human distance: metric uses m/km, imperial uses yd/mi (UK road convention). */
export function formatCarDistance(meters: number, metric: boolean): string {
  const m = Math.max(0, meters);
  if (metric) {
    if (m < 1000) return `${Math.round(m / 10) * 10} m`;
    return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
  }
  const yards = m / 0.9144;
  if (yards < 300) return `${Math.round(yards / 10) * 10} yd`;
  const miles = m / 1609.344;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

export function formatCarDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Distance value + unit as car hosts expect it (Android Auto / CarPlay Distance). */
export function carHostDistance(
  meters: number,
  metric: boolean,
): { value: number; unit: "meters" | "kilometers" | "yards" | "miles" } {
  const m = Math.max(0, meters);
  if (metric)
    return m < 1000
      ? { value: Math.round(m), unit: "meters" }
      : { value: Math.round(m / 100) / 10, unit: "kilometers" };
  const yards = m / 0.9144;
  if (yards < 300) return { value: Math.round(yards), unit: "yards" };
  return { value: Math.round((m / 1609.344) * 10) / 10, unit: "miles" };
}

/** Title/body for the lock-screen / notification-shade guidance card. */
export function lockScreenContent(s: CarGuidanceSnapshot): {
  title: string;
  body: string;
} {
  if (s.phase === "arrived")
    return {
      title: s.destinationName ? `Arrived · ${s.destinationName}` : "Arrived",
      body: ROAD_USE_LABEL,
    };
  const title =
    s.next && s.distanceToNextM !== null
      ? `${formatCarDistance(s.distanceToNextM, s.metric)} · ${s.next.instruction}`
      : "NEXORA guidance";
  const parts: string[] = [];
  if (s.remainingDistanceM !== null)
    parts.push(formatCarDistance(s.remainingDistanceM, s.metric));
  if (s.remainingDurationS !== null)
    parts.push(formatCarDuration(s.remainingDurationS));
  if (s.destinationName) parts.push(`to ${s.destinationName}`);
  parts.push(s.statusLine);
  return { title, body: parts.join(" · ") };
}
