/**
 * Live turn-by-turn guidance policy: map matching against the route polyline,
 * off-route confirmation, progress along the route and spoken prompts.
 *
 * Pure functions only. The device watch, speech engine and network calls live in
 * hooks/use-live-guidance.ts. Off-route confirmation reuses REROUTE_POLICY so live
 * GPS cannot reroute on fewer samples, worse accuracy or while stationary.
 *
 * UNVERIFIED FOR ROAD USE until the DEVICE_TEST_PLAN live-guidance cases pass on a
 * physical iOS and Android device.
 */
import {
  haversineM,
  REROUTE_POLICY,
  validateCoord,
  type Coord,
  type Route,
  type Step,
} from "./domain";

const EARTH_RADIUS_M = 6_371_008.8;
const METRES_PER_YARD = 0.9144;
const METRES_PER_MILE = 1609.344;

export type GuidanceMode = "driving" | "walking" | "cycling";

export const GUIDANCE_POLICY = {
  /** Minimum lateral distance from the route before a sample counts as off-route. */
  offRouteDistanceM: { driving: 40, cycling: 30, walking: 25 } as Record<
    GuidanceMode,
    number
  >,
  /** Accuracy worse than this is "weak signal": no matching decisions are made. */
  maximumAccuracyM: REROUTE_POLICY.maximumOffRouteAccuracyM,
  stableSamples: REROUTE_POLICY.stableSamples,
  /** No fix for this long marks guidance degraded. */
  staleFixMs: 10_000,
  /** Below this speed the device is treated as stationary. */
  movingSpeedMps: 1,
  /** Within this distance of the final point (and on route) counts as arrived. */
  arrivalRadiusM: 25,
  /** Matching may not jump backwards more than this (GPS noise near loops). */
  backtrackToleranceM: 60,
  /** Prompt distances before each manoeuvre, largest first. */
  promptBandsM: {
    driving: [800, 300, 60],
    cycling: [200, 40],
    walking: [100, 15],
  } as Record<GuidanceMode, number[]>,
} as const;

/** Manoeuvres that do not need a spoken prompt (road name changes only). */
const SILENT_TYPES = new Set(["new name", "continue"]);

export interface RouteIndex {
  route: Route;
  /** Cumulative geometry distance at each vertex, metres. */
  cumulativeM: number[];
  totalM: number;
  /** Along-route distance where each step's manoeuvre happens. */
  stepStartM: number[];
}

export function indexRoute(route: Route): RouteIndex {
  const g = route.geometry;
  if (!Array.isArray(g) || g.length < 2 || !g.every(validateCoord))
    throw new RangeError("Route geometry needs at least two valid points");
  const cumulativeM = [0];
  for (let i = 1; i < g.length; i++)
    cumulativeM.push(cumulativeM[i - 1] + haversineM(g[i - 1], g[i]));
  const totalM = cumulativeM[cumulativeM.length - 1];
  // Provider step distances describe the road after each manoeuvre. Scale them to
  // the polyline length so the last step lands on the last vertex.
  const stepSum = route.steps.reduce(
    (a, s) => a + (Number.isFinite(s.distanceM) ? Math.max(0, s.distanceM) : 0),
    0,
  );
  const scale = stepSum > 0 ? totalM / stepSum : 0;
  const stepStartM: number[] = [];
  let acc = 0;
  for (const s of route.steps) {
    stepStartM.push(Math.min(totalM, acc * scale));
    acc += Number.isFinite(s.distanceM) ? Math.max(0, s.distanceM) : 0;
  }
  return { route, cumulativeM, totalM, stepStartM };
}

export interface Projection {
  alongM: number;
  offsetM: number;
  point: Coord;
  segment: number;
}

/** Equirectangular projection of `p` onto segment a-b; accurate to <0.1% at city scale. */
function projectSegment(p: Coord, a: Coord, b: Coord) {
  const rad = Math.PI / 180;
  const k = Math.cos(p[1] * rad);
  const ax = (a[0] - p[0]) * k,
    ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k,
    by = b[1] - p[1];
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const offsetM = Math.hypot(ax + t * dx, ay + t * dy) * rad * EARTH_RADIUS_M;
  const point: Coord = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, offsetM, point };
}

/**
 * Snap a fix to the route. With a previous along-route distance, segments that
 * would move the match backwards by more than backtrackToleranceM are ignored
 * unless nothing ahead is within the off-route threshold (overlapping loops).
 */
export function projectOnRoute(
  index: RouteIndex,
  p: Coord,
  previousAlongM: number | null = null,
): Projection {
  if (!validateCoord(p)) throw new RangeError("Invalid position");
  const g = index.route.geometry;
  let best: Projection | null = null;
  let bestAhead: Projection | null = null;
  const minAlong =
    previousAlongM === null
      ? -Infinity
      : previousAlongM - GUIDANCE_POLICY.backtrackToleranceM;
  for (let i = 0; i < g.length - 1; i++) {
    const { t, offsetM, point } = projectSegment(p, g[i], g[i + 1]);
    const segLen = index.cumulativeM[i + 1] - index.cumulativeM[i];
    const alongM = index.cumulativeM[i] + t * segLen;
    const candidate = { alongM, offsetM, point, segment: i };
    if (!best || offsetM < best.offsetM - 0.5) best = candidate;
    if (alongM >= minAlong && (!bestAhead || offsetM < bestAhead.offsetM - 0.5))
      bestAhead = candidate;
  }
  if (bestAhead && bestAhead.offsetM <= best!.offsetM + 15) return bestAhead;
  return best!;
}

/** Index of the step whose manoeuvre is the next one ahead of `alongM`. */
export function nextStepIndex(index: RouteIndex, alongM: number): number {
  const starts = index.stepStartM;
  for (let i = 0; i < starts.length; i++) if (starts[i] > alongM + 1) return i;
  return Math.max(0, starts.length - 1);
}

export interface GuidanceFix {
  coord: Coord;
  /** Horizontal accuracy radius in metres; null when the platform omits it. */
  accuracyM: number | null;
  /** Ground speed in m/s; null or negative when unknown. */
  speedMps: number | null;
  timestamp: number;
}

export type TrackerStatus =
  | "acquiring"
  | "on-route"
  | "weak-signal"
  | "off-route"
  | "arrived";

export interface TrackerState {
  status: TrackerStatus;
  alongM: number;
  offsetM: number;
  /** Consecutive trustworthy samples beyond the off-route threshold. */
  offRouteSamples: number;
  /** Snapped position when on route, raw position otherwise. */
  position: Coord | null;
  speedMps: number | null;
  accuracyM: number | null;
  lastFix: GuidanceFix | null;
  /** True once off-route is confirmed by the shared reroute thresholds. */
  offRouteConfirmed: boolean;
}

export function initialTracker(): TrackerState {
  return {
    status: "acquiring",
    alongM: 0,
    offsetM: 0,
    offRouteSamples: 0,
    position: null,
    speedMps: null,
    accuracyM: null,
    lastFix: null,
    offRouteConfirmed: false,
  };
}

function derivedSpeed(prev: GuidanceFix | null, fix: GuidanceFix): number | null {
  if (fix.speedMps !== null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0)
    return fix.speedMps;
  if (!prev) return null;
  const dt = (fix.timestamp - prev.timestamp) / 1000;
  if (!(dt > 0.5) || dt > 30) return null;
  return haversineM(prev.coord, fix.coord) / dt;
}

/** Advance the tracker with one location fix. Never throws on bad fixes. */
export function trackFix(
  index: RouteIndex,
  state: TrackerState,
  fix: GuidanceFix,
  mode: GuidanceMode,
): TrackerState {
  if (state.status === "arrived") return state;
  if (!validateCoord(fix.coord) || !Number.isFinite(fix.timestamp)) return state;
  if (state.lastFix && fix.timestamp <= state.lastFix.timestamp) return state;
  const speedMps = derivedSpeed(state.lastFix, fix);
  const accuracyM =
    fix.accuracyM !== null && Number.isFinite(fix.accuracyM) && fix.accuracyM >= 0
      ? fix.accuracyM
      : null;
  const base = { ...state, lastFix: fix, speedMps, accuracyM };
  // Untrustworthy fix: keep the last matched position, do not count off-route.
  if (accuracyM === null || accuracyM > GUIDANCE_POLICY.maximumAccuracyM) {
    return {
      ...base,
      status: "weak-signal",
      position: state.position ?? fix.coord,
      offRouteSamples: 0,
      offRouteConfirmed: false,
    };
  }
  const prevAlong = state.status === "acquiring" ? null : state.alongM;
  const proj = projectOnRoute(index, fix.coord, prevAlong);
  const threshold = Math.max(
    GUIDANCE_POLICY.offRouteDistanceM[mode],
    accuracyM * 1.5,
  );
  if (proj.offsetM > threshold) {
    const offRouteSamples = state.offRouteSamples + 1;
    const moving = speedMps !== null && speedMps >= GUIDANCE_POLICY.movingSpeedMps;
    return {
      ...base,
      status: "off-route",
      offsetM: proj.offsetM,
      position: fix.coord,
      offRouteSamples,
      offRouteConfirmed:
        moving && offRouteSamples >= GUIDANCE_POLICY.stableSamples,
    };
  }
  // Monotonic progress: small backward jitter is clamped to the previous value.
  const alongM =
    prevAlong === null ? proj.alongM : Math.max(prevAlong, proj.alongM);
  const remaining = index.totalM - alongM;
  const arrived =
    remaining <= GUIDANCE_POLICY.arrivalRadiusM ||
    haversineM(fix.coord, index.route.geometry[index.route.geometry.length - 1]) <=
      Math.min(GUIDANCE_POLICY.arrivalRadiusM, Math.max(10, accuracyM));
  return {
    ...base,
    status: arrived ? "arrived" : "on-route",
    alongM: arrived ? index.totalM : alongM,
    offsetM: proj.offsetM,
    position: proj.point,
    offRouteSamples: 0,
    offRouteConfirmed: false,
  };
}

/** Degrade when the platform stops delivering fixes (tunnel, revoked permission). */
export function checkStale(state: TrackerState, now: number): TrackerState {
  if (state.status === "arrived" || !state.lastFix) return state;
  if (now - state.lastFix.timestamp > GUIDANCE_POLICY.staleFixMs)
    return { ...state, status: "weak-signal", offRouteSamples: 0, offRouteConfirmed: false };
  return state;
}

export interface GuidanceView {
  progress: number;
  remainingM: number;
  remainingS: number;
  step: Step | undefined;
  stepIndex: number;
  distanceToStepM: number;
}

export function guidanceView(index: RouteIndex, alongM: number): GuidanceView {
  const total = index.totalM;
  const along = Math.max(0, Math.min(total, alongM));
  const remainingM = Math.max(0, total - along);
  const remainingS = total > 0 ? index.route.durationS * (remainingM / total) : 0;
  const stepIndex = nextStepIndex(index, along);
  const raw = index.route.steps[stepIndex];
  const distanceToStepM = Math.max(0, (index.stepStartM[stepIndex] ?? total) - along);
  return {
    progress: total > 0 ? along / total : 1,
    remainingM,
    remainingS,
    step: raw ? { ...raw, distanceM: distanceToStepM } : undefined,
    stepIndex,
    distanceToStepM,
  };
}

/** Spoken distance, rounded the way drivers hear it. */
export function spokenDistance(m: number, metric: boolean): string {
  if (metric) {
    if (m >= 950) {
      const km = Math.round(m / 100) / 10;
      return km === 1 ? "1 kilometre" : `${km} kilometres`;
    }
    const r = m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10);
    return `${r} metres`;
  }
  const mi = m / METRES_PER_MILE;
  if (mi >= 0.9) {
    const r = Math.round(mi * 10) / 10;
    return r === 1 ? "1 mile" : `${r} miles`;
  }
  if (mi >= 0.4) return "half a mile";
  if (mi >= 0.2) return "a quarter of a mile";
  const yd = m / METRES_PER_YARD;
  const r = yd >= 100 ? Math.round(yd / 50) * 50 : Math.max(10, Math.round(yd / 10) * 10);
  return `${r} yards`;
}

/** Strip display-only suffixes so the voice never reads "— not road guidance". */
function speakable(instruction: string): string {
  return instruction.split(" — ")[0].trim();
}

export interface Prompt {
  key: string;
  text: string;
}

/**
 * The prompt to speak now, if any. `spoken` holds keys already spoken this trip;
 * when several bands are crossed at once only the closest one is spoken and the
 * farther ones are returned in `skip` so they are never spoken late.
 */
export function nextPrompt(
  index: RouteIndex,
  alongM: number,
  mode: GuidanceMode,
  metric: boolean,
  spoken: ReadonlySet<string>,
): { prompt: Prompt | null; skip: string[] } {
  const steps = index.route.steps;
  if (!steps.length) return { prompt: null, skip: [] };
  // First instruction when guidance starts.
  if (!spoken.has("start")) {
    const first = steps[0];
    return {
      prompt: { key: "start", text: speakable(first.instruction) },
      skip: [],
    };
  }
  const view = guidanceView(index, alongM);
  const lastIndex = steps.length - 1;
  if (
    view.stepIndex === lastIndex &&
    index.totalM - alongM <= GUIDANCE_POLICY.arrivalRadiusM
  ) {
    const key = `${lastIndex}:arrive`;
    if (spoken.has(key)) return { prompt: null, skip: [] };
    return { prompt: { key, text: speakable(steps[lastIndex].instruction) }, skip: [] };
  }
  // Look past silent road-name changes to the next manoeuvre worth announcing.
  const target = nextAnnouncedStep(index, view.stepIndex);
  if (target <= 0) return { prompt: null, skip: [] };
  const distanceM = Math.max(0, index.stepStartM[target] - alongM);
  const bands = GUIDANCE_POLICY.promptBandsM[mode];
  const nowBand = bands[bands.length - 1];
  const crossed = bands.filter((b) => distanceM <= b);
  if (!crossed.length) return { prompt: null, skip: [] };
  const closest = crossed[crossed.length - 1];
  const keyFor = (b: number) => `${target}:${b}`;
  const skip = crossed.slice(0, -1).map(keyFor).filter((k) => !spoken.has(k));
  const key = keyFor(closest);
  if (spoken.has(key)) return { prompt: null, skip };
  // A warning band longer than the road since the previous manoeuvre would be
  // spoken before that manoeuvre happens; skip it rather than confuse the order.
  const previous = previousAnnouncedStep(index, target);
  const gap = index.stepStartM[target] - index.stepStartM[previous];
  if (closest !== nowBand && gap < closest * 0.6)
    return { prompt: null, skip: [...skip, key] };
  if (target === lastIndex) {
    // The arrival itself is spoken by the arrival-radius branch above.
    if (closest === nowBand) return { prompt: null, skip: [...skip, key] };
    return {
      prompt: { key, text: `Your destination is in ${spokenDistance(distanceM, metric)}` },
      skip,
    };
  }
  const instruction = speakable(steps[target].instruction);
  let text =
    closest === nowBand
      ? instruction
      : `In ${spokenDistance(distanceM, metric)}, ${lowerFirst(instruction)}`;
  if (closest === nowBand) {
    const following = nextAnnouncedStep(index, target + 1);
    if (
      following > target &&
      following < lastIndex &&
      index.stepStartM[following] - index.stepStartM[target] <= 80
    ) {
      text += `, then ${lowerFirst(speakable(steps[following].instruction))}`;
      // The chained prompt replaces every prompt for the following manoeuvre.
      bands.forEach((b) => !spoken.has(`${following}:${b}`) && skip.push(`${following}:${b}`));
    }
  }
  return { prompt: { key, text }, skip };
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function isAnnounced(step: Step | undefined): boolean {
  return Boolean(step) && !SILENT_TYPES.has(step!.type);
}

/** First step at or after `from` that gets a spoken prompt (the last step always does). */
function nextAnnouncedStep(index: RouteIndex, from: number): number {
  const steps = index.route.steps;
  for (let i = Math.max(0, from); i < steps.length; i++)
    if (isAnnounced(steps[i]) || i === steps.length - 1) return i;
  return steps.length - 1;
}

function previousAnnouncedStep(index: RouteIndex, before: number): number {
  for (let i = before - 1; i > 0; i--)
    if (isAnnounced(index.route.steps[i])) return i;
  return 0;
}

/** Number of intermediate stops already reached, from "waypoint" steps behind `alongM`. */
export function stopsPassed(index: RouteIndex, alongM: number): number {
  let n = 0;
  index.route.steps.forEach((s, i) => {
    if ((s.type === "waypoint" || s.type === "synthetic-stop") && index.stepStartM[i] <= alongM + GUIDANCE_POLICY.arrivalRadiusM)
      n++;
  });
  return n;
}
