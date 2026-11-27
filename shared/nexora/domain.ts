/** Provider-independent policies. No location tracking, network calls or mutable state. */
export type Coord = [number, number]; // [longitude, latitude], WGS84 degrees

export interface Place {
  id: string;
  name: string;
  subtitle: string;
  coordinate: Coord;
  category: string;
  source: string;
}

export interface Step {
  instruction: string;
  distanceM: number;
  durationS: number;
  coordinate: Coord;
  type: string;
}

export interface Route {
  id: string;
  geometry: Coord[];
  distanceM: number;
  durationS: number;
  steps: Step[];
  source: string;
  generatedAt: string;
  demo: boolean;
  /** Calibrated provider reliability in [0, 1]; null means unknown. */
  reliability: number | null;
  costGBP: number | null;
  /** Provider-supplied non-negative complexity; lower is simpler. */
  complexity: number | null;
  /** Provider feasibility, or simulation-only feasibility when demo=true. */
  feasible: boolean;
  /** Per-leg engine totals when the itinerary has intermediate stops. */
  legs?: { distanceM: number; durationS: number }[];
  /** Avoidance classes the provider actually applied to this route. */
  excluded?: string[];
}

const METRES_PER_MILE = 1609.344;
const IMPERIAL_GALLON_LITRES = 4.54609;
const EARTH_RADIUS_M = 6_371_008.8;

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
  return value;
}

export function validateCoord(c: unknown): c is Coord {
  return (
    Array.isArray(c) &&
    c.length === 2 &&
    typeof c[0] === "number" &&
    typeof c[1] === "number" &&
    Number.isFinite(c[0]) &&
    Number.isFinite(c[1]) &&
    Math.abs(c[0]) <= 180 &&
    Math.abs(c[1]) <= 90
  );
}

export function miles(m: number): number {
  return nonNegative(m, "Distance") / METRES_PER_MILE;
}

/** Display rounding only; zero stays zero and positive sub-minute trips show 1 min. */
export function durationLabel(s: number): string {
  nonNegative(s, "Duration");
  const minutes = s === 0 ? 0 : Math.max(1, Math.round(s / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr${remainder ? ` ${remainder} min` : ""}`;
}

/** UK miles by default; metric uses metres below 1 km and kilometres otherwise. */
export function distanceLabel(m: number, metric = false): string {
  nonNegative(m, "Distance");
  if (metric)
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
  return `${miles(m).toFixed(1)} mi`;
}

/** Fuel-only estimate. mpg is UK imperial miles/gallon; price is GBP/litre. */
export function fuelCostGBP(
  distanceM: number,
  mpg: number,
  pricePerLitre: number,
): number {
  nonNegative(distanceM, "Distance");
  nonNegative(pricePerLitre, "Fuel price");
  if (!Number.isFinite(mpg) || mpg <= 0)
    throw new RangeError("UK mpg must be positive");
  return (miles(distanceM) / mpg) * IMPERIAL_GALLON_LITRES * pricePerLitre;
}

export function haversineM(a: Coord, b: Coord): number {
  if (!validateCoord(a) || !validateCoord(b))
    throw new RangeError("Invalid coordinate");
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Local segment projection is only for alternative de-duplication, never GPS matching.
function segmentDistanceM(point: Coord, start: Coord, end: Coord): number {
  const rad = Math.PI / 180;
  const scale = Math.cos(point[1] * rad);
  const longitudeDelta = (longitude: number): number =>
    ((longitude - point[0] + 540) % 360) - 180;
  const ax = longitudeDelta(start[0]) * scale;
  const ay = start[1] - point[1];
  const bx = longitudeDelta(end[0]) * scale;
  const by = end[1] - point[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy) * rad * EARTH_RADIUS_M;
}

function validGeometry(geometry: Coord[]): boolean {
  return (
    Array.isArray(geometry) &&
    geometry.length >= 2 &&
    geometry.every(validateCoord)
  );
}

function samePath(a: Route, b: Route): boolean {
  if (!validGeometry(a.geometry) || !validGeometry(b.geometry)) return false;
  if (
    haversineM(a.geometry[0], b.geometry[0]) > 10 ||
    haversineM(
      a.geometry[a.geometry.length - 1],
      b.geometry[b.geometry.length - 1],
    ) > 10
  )
    return false;
  // Do not collapse a longer loop into a shorter route sharing the same corridor.
  const pathLength = (geometry: Coord[]): number =>
    geometry
      .slice(1)
      .reduce(
        (total, point, index) => total + haversineM(geometry[index], point),
        0,
      );
  const lengthA = pathLength(a.geometry);
  const lengthB = pathLength(b.geometry);
  if (
    Math.abs(lengthA - lengthB) >
    Math.max(10, Math.max(lengthA, lengthB) * 0.03)
  )
    return false;
  const follows = (points: Coord[], path: Coord[]): boolean =>
    points.every((point) =>
      path
        .slice(1)
        .some((end, index) => segmentDistanceM(point, path[index], end) <= 10),
    );
  return follows(a.geometry, b.geometry) && follows(b.geometry, a.geometry);
}

/** Keep the first occurrence of an ID or equivalent directed path (10 m tolerance).
 * Equivalent paths may have different vertex sampling. Input arrays are never mutated.
 */
export function dedupeRoutes<T extends Route>(routes: readonly T[]): T[] {
  const result: T[] = [];
  for (const route of routes) {
    if (
      !result.some(
        (existing) => existing.id === route.id || samePath(existing, route),
      )
    )
      result.push(route);
  }
  return result;
}

export type RoutePreference = "fastest" | "relaxed";
export type ScoredRoute = Route & {
  score: number;
  label: string;
  explanation: string;
};
export const ROUTE_SCORE_VERSION = "1.0.0";
export const ROUTE_SCORE_WEIGHTS = {
  fastest: { duration: 0.5, reliability: 0.2, cost: 0.15, complexity: 0.15 },
  relaxed: { duration: 0.35, reliability: 0.2, cost: 0.15, complexity: 0.3 },
} as const;

type Dimension = keyof typeof ROUTE_SCORE_WEIGHTS.fastest;

/** Higher score is better (0–100), relative to the supplied feasible alternatives.
 * Lower duration/cost/complexity and higher reliability are preferred. Null/invalid
 * optional dimensions are omitted and the known weights are renormalised per route.
 * This is a preference score, NOT a confidence or safety rating. Unknown legal access
 * must be resolved by a provider; feasible=false is always excluded before scoring.
 */
export function scoreRoutes(
  routes: readonly Route[],
  preference: RoutePreference,
): ScoredRoute[] {
  const weights = ROUTE_SCORE_WEIGHTS[preference];
  if (!weights) throw new RangeError("Unknown route preference");
  const feasible = dedupeRoutes(
    routes.filter(
      (route) =>
        route.feasible &&
        Number.isFinite(route.durationS) &&
        route.durationS >= 0 &&
        Number.isFinite(route.distanceM) &&
        route.distanceM >= 0 &&
        validGeometry(route.geometry),
    ),
  );
  if (!feasible.length) return [];
  const dimensions: Dimension[] = [
    "duration",
    "reliability",
    "cost",
    "complexity",
  ];
  const valueFor = (route: Route, dimension: Dimension): number | null => {
    const value =
      dimension === "duration"
        ? route.durationS
        : dimension === "cost"
          ? route.costGBP
          : route[dimension];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      return null;
    if (dimension === "reliability" && value > 1) return null;
    return value;
  };
  const ranges = Object.fromEntries(
    dimensions.map((dimension) => {
      const values = feasible
        .map((route) => valueFor(route, dimension))
        .filter((value): value is number => value !== null);
      return [
        dimension,
        { min: Math.min(...values), max: Math.max(...values) },
      ];
    }),
  ) as Record<Dimension, { min: number; max: number }>;
  const fastest = Math.min(...feasible.map((route) => route.durationS));
  return feasible
    .map((route) => {
      let weighted = 0;
      let knownWeight = 0;
      const missing: string[] = [];
      for (const dimension of dimensions) {
        const value = valueFor(route, dimension);
        if (value === null) {
          missing.push(dimension === "cost" ? "cost" : dimension);
          continue;
        }
        const { min, max } = ranges[dimension];
        const utility =
          max === min
            ? 1
            : dimension === "reliability"
              ? (value - min) / (max - min)
              : (max - value) / (max - min);
        weighted += utility * weights[dimension];
        knownWeight += weights[dimension];
      }
      const delta = route.durationS - fastest;
      const parts = [
        delta === 0
          ? "Shortest supplied travel time"
          : `${durationLabel(delta)} longer than the fastest alternative`,
      ];
      const complexity = valueFor(route, "complexity");
      const simpler =
        complexity !== null &&
        feasible.some((other) => {
          const otherComplexity = valueFor(other, "complexity");
          return otherComplexity !== null && otherComplexity > complexity;
        });
      if (simpler) parts.push("lower supplied road-complexity value");
      if (missing.length)
        parts.push(
          `unknown: ${missing.join(", ")}; weights renormalised over known inputs`,
        );
      if (route.demo)
        parts.push("synthetic simulation only; not road-safe guidance");
      return {
        ...route,
        score: Math.min(100, Math.max(0, (weighted / knownWeight) * 100)),
        label:
          preference === "relaxed" && simpler
            ? "Relaxed"
            : delta === 0
              ? "Fastest"
              : "Alternative",
        explanation: parts.join("; ") + ".",
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.durationS - b.durationS ||
        a.id.localeCompare(b.id),
    );
}

/** All timestamps are Unix milliseconds. Remaining durations are seconds.
 * `illegal` and `verifiedClosure` describe the CURRENT route, not the candidate.
 * The caller must supply an already legal, feasible candidate; a missing/invalid
 * candidate duration means no reroute and requires a safe-stop/recovery workflow.
 * `stableUpdates` counts consecutive consistent candidate/off-route samples.
 * `stationary=true` must be trustworthy, not a casual bypass of driving UX gating.
 * Off-route overrides require >=3 stable samples, accuracy <=25 m and moving status.
 * Verified closure/legal infeasibility do not depend on GPS accuracy or cooldown.
 */
export interface RerouteInput {
  currentRemainingS: number;
  candidateRemainingS: number;
  mode: "automatic" | "ask" | "locked";
  stableUpdates: number;
  lastRerouteAt: number | null;
  now: number;
  verifiedClosure?: boolean;
  illegal?: boolean;
  offRoute?: boolean;
  accuracyM?: number;
  stationary?: boolean;
}

export interface RerouteResult {
  reroute: boolean;
  reason: string;
  ask: boolean;
}
export const REROUTE_POLICY = {
  minimumSavingS: 180,
  remainingFraction: 0.1,
  cooldownMs: 90_000,
  stableSamples: 3,
  maximumOffRouteAccuracyM: 25,
} as const;

export function rerouteDecision(input: RerouteInput): RerouteResult {
  const no = (reason: string): RerouteResult => ({
    reroute: false,
    reason,
    ask: false,
  });
  const yes = (reason: string): RerouteResult => ({
    reroute: true,
    reason,
    ask: false,
  });
  if (
    !Number.isFinite(input.now) ||
    !["automatic", "ask", "locked"].includes(input.mode)
  )
    return no("Invalid reroute context");
  if (
    !Number.isFinite(input.candidateRemainingS) ||
    input.candidateRemainingS < 0
  ) {
    return no(
      "No usable compliant candidate; stop safely rather than follow an abrupt detour",
    );
  }
  if (input.illegal)
    return yes(
      "Current route is legally infeasible; essential reroute overrides lock and cooldown",
    );
  if (input.verifiedClosure)
    return yes(
      "Verified closure; essential reroute overrides lock and cooldown",
    );
  const stable =
    Number.isInteger(input.stableUpdates) &&
    input.stableUpdates >= REROUTE_POLICY.stableSamples;
  if (input.offRoute) {
    if (
      !Number.isFinite(input.accuracyM) ||
      input.accuracyM! < 0 ||
      input.accuracyM! > REROUTE_POLICY.maximumOffRouteAccuracyM
    ) {
      return no(
        "Off-route location is untrustworthy: accuracy missing or poor",
      );
    }
    if (input.stationary !== false)
      return no(
        "Off-route event not confirmed while moving; stationary drift is not an essential reroute",
      );
    if (!stable)
      return no("Off-route event needs three stable location samples");
    return yes(
      "Trustworthy off-route event; essential reroute overrides lock and cooldown",
    );
  }
  if (input.mode === "locked") return no("Route locked; no essential change");
  if (!Number.isFinite(input.currentRemainingS) || input.currentRemainingS < 0)
    return no("Current remaining duration is unknown");
  const threshold = Math.max(
    REROUTE_POLICY.minimumSavingS,
    input.currentRemainingS * REROUTE_POLICY.remainingFraction,
  );
  if (input.currentRemainingS - input.candidateRemainingS < threshold)
    return no("Improvement below the 180 s / 10% threshold");
  if (!stable)
    return no("Improvement needs three stable updates; ignoring ETA jitter");
  if (input.lastRerouteAt !== null) {
    if (
      !Number.isFinite(input.lastRerouteAt) ||
      input.now - input.lastRerouteAt < REROUTE_POLICY.cooldownMs
    )
      return no("90 s reroute cooldown is active");
  }
  if (input.mode === "ask") {
    if (input.stationary !== true)
      return no("Ask-first suggestion deferred until safely stationary");
    return {
      reroute: false,
      ask: true,
      reason: "Stable worthwhile improvement; ask before changing the route",
    };
  }
  return yes("Stable improvement meets the 180 s / 10% threshold");
}

export type NavigationState =
  | "idle"
  | "planning"
  | "preview"
  | "navigating"
  | "degraded"
  | "offline"
  | "rerouting"
  | "arrived"
  | "ended";

const NAVIGATION_TRANSITIONS: Record<
  NavigationState,
  readonly NavigationState[]
> = {
  idle: ["planning"],
  planning: ["preview", "idle", "ended"],
  preview: ["planning", "navigating", "idle", "ended"],
  navigating: ["degraded", "offline", "rerouting", "arrived", "ended"],
  degraded: ["navigating", "offline", "rerouting", "arrived", "ended"],
  offline: ["navigating", "degraded", "rerouting", "arrived", "ended"],
  rerouting: ["navigating", "degraded", "offline", "arrived", "ended"],
  arrived: ["ended"],
  ended: ["idle", "planning"],
};

/** Validate an explicit transition; invalid or same-state transitions throw. */
export function navigationTransition(
  current: NavigationState,
  next: NavigationState,
): NavigationState {
  if (
    !Object.prototype.hasOwnProperty.call(NAVIGATION_TRANSITIONS, current) ||
    !NAVIGATION_TRANSITIONS[current].includes(next)
  ) {
    throw new RangeError(
      `Invalid navigation transition: ${current} -> ${next}`,
    );
  }
  return next;
}

export const transitionNavigation = navigationTransition;

export interface Incident {
  id: string;
  category: string;
  coordinate: Coord;
  observedAt: number;
  expiresAt: number;
  confirmations: number;
  status: "pending" | "approved" | "rejected";
  demo: true;
}

/** Local demo policy only: never an authority-verified closure or live traffic feed. */
export const INCIDENT_POLICY = {
  dedupeRadiusM: 60,
  dedupeWindowMs: 15 * 60_000,
  rateWindowMs: 60 * 60_000,
  maxSubmissions: 5,
  defaultTtlMs: 30 * 60_000,
  ttlByCategoryMs: {
    traffic: 15 * 60_000,
    congestion: 15 * 60_000,
    debris: 30 * 60_000,
    "stopped vehicle": 30 * 60_000,
    collision: 60 * 60_000,
    closure: 60 * 60_000,
    roadworks: 2 * 60 * 60_000,
    pothole: 24 * 60 * 60_000,
  } as Readonly<Record<string, number>>,
} as const;

/** Return a NEW complete local report array. New reports are pending with ZERO
 * confirmations; an idempotent spatial/time duplicate returns an unchanged copy.
 * At most five NEW accepted incidents per rolling hour per supplied local ledger.
 * Keep expired/rejected records in this ledger for at least an hour: passing only
 * liveIncidents() would defeat the rate limit. Duplicate retries are not submissions
 * and do not invent corroboration, refresh TTL or reset observedAt. There is no user
 * identity, segment/direction metadata or server abuse protection in this demo schema.
 * Invalid input or rate limit throws RangeError. Caller owns persistence/moderation.
 */
export function createIncident(
  reports: readonly Incident[],
  category: string,
  coordinate: Coord,
  now: number,
): Incident[] {
  if (!validateCoord(coordinate) || !Number.isFinite(now) || now < 0)
    throw new RangeError("Invalid incident location or time");
  const canonicalCategory = category.trim().toLowerCase();
  if (!canonicalCategory || canonicalCategory.length > 80)
    throw new RangeError("Invalid incident category");
  const duplicate = reports.some(
    (report) =>
      report.demo === true &&
      report.status !== "rejected" &&
      report.category.trim().toLowerCase() === canonicalCategory &&
      now >= report.observedAt &&
      now - report.observedAt <= INCIDENT_POLICY.dedupeWindowMs &&
      report.expiresAt > now &&
      validateCoord(report.coordinate) &&
      haversineM(report.coordinate, coordinate) <=
        INCIDENT_POLICY.dedupeRadiusM,
  );
  if (duplicate) return [...reports];
  const submissions = reports.filter(
    (report) =>
      report.demo === true &&
      Number.isFinite(report.observedAt) &&
      report.observedAt <= now &&
      report.observedAt > now - INCIDENT_POLICY.rateWindowMs,
  ).length;
  if (submissions >= INCIDENT_POLICY.maxSubmissions)
    throw new RangeError(
      "Demo incident rate limit: maximum 5 new submissions per hour",
    );
  const ttl = Object.prototype.hasOwnProperty.call(
    INCIDENT_POLICY.ttlByCategoryMs,
    canonicalCategory,
  )
    ? INCIDENT_POLICY.ttlByCategoryMs[canonicalCategory]
    : INCIDENT_POLICY.defaultTtlMs;
  const baseId = `demo-${now}-${canonicalCategory.replace(/[^a-z0-9]+/g, "-")}`;
  let id = baseId;
  let suffix = 1;
  while (reports.some((report) => report.id === id))
    id = `${baseId}-${suffix++}`;
  return [
    ...reports,
    {
      id,
      category: canonicalCategory,
      coordinate: [...coordinate],
      observedAt: now,
      expiresAt: now + ttl,
      confirmations: 0,
      status: "pending",
      demo: true,
    },
  ];
}

/** Unexpired pending/approved DEMO reports, not a claim of verified live conditions.
 * Pending entries remain visible for local review; rejected/future/malformed data is excluded.
 */
export function liveIncidents(
  reports: readonly Incident[],
  now: number,
): Incident[] {
  if (!Number.isFinite(now) || now < 0)
    throw new RangeError("Invalid incident time");
  return reports.filter(
    (report) =>
      report.demo === true &&
      (report.status === "pending" || report.status === "approved") &&
      validateCoord(report.coordinate) &&
      Number.isFinite(report.observedAt) &&
      Number.isFinite(report.expiresAt) &&
      report.observedAt <= now &&
      report.expiresAt > now,
  );
}
