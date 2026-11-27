/** Pure itinerary, scheduling and avoidance policies. No network, storage or clocks:
 * callers pass `now`. Nothing here predicts traffic or claims legal access.
 */
import { haversineM, validateCoord, type Place } from "./domain";

/** UI limit. The API accepts up to five; three keeps requests small for the
 * shared non-commercial test router and keeps the planner readable. */
export const MAX_INTERMEDIATE_STOPS = 3;
/** Points closer than this are treated as the same place. */
export const MIN_POINT_SEPARATION_M = 25;

export type ItineraryCheck = { ok: true } | { ok: false; reason: string };

/** Validate origin → stops → destination. Adjacent points must be distinct. */
export function checkItinerary(
  origin: Place,
  stops: readonly Place[],
  destination: Place | null,
): ItineraryCheck {
  if (!destination) return { ok: false, reason: "Choose a destination." };
  if (stops.length > MAX_INTERMEDIATE_STOPS)
    return {
      ok: false,
      reason: `At most ${MAX_INTERMEDIATE_STOPS} stops are supported.`,
    };
  const points = [origin, ...stops, destination];
  if (!points.every((p) => validateCoord(p.coordinate)))
    return { ok: false, reason: "A point has invalid coordinates." };
  for (let i = 1; i < points.length; i++) {
    if (
      haversineM(points[i - 1].coordinate, points[i].coordinate) <
      MIN_POINT_SEPARATION_M
    )
      return {
        ok: false,
        reason: `${points[i].name} is the same place as the point before it.`,
      };
  }
  return { ok: true };
}

/** Append a stop (before the destination). Returns a NEW array; throws RangeError
 * when the limit is reached or the coordinate is invalid. */
export function addStop(stops: readonly Place[], place: Place): Place[] {
  if (!validateCoord(place.coordinate))
    throw new RangeError("Invalid stop coordinate");
  if (stops.length >= MAX_INTERMEDIATE_STOPS)
    throw new RangeError(
      `At most ${MAX_INTERMEDIATE_STOPS} stops are supported`,
    );
  // Same place picked twice gets a distinct key so list rendering stays stable.
  let id = `stop-${place.id}`;
  let n = 2;
  while (stops.some((s) => s.id === id)) id = `stop-${place.id}-${n++}`;
  return [...stops, { ...place, id, coordinate: [...place.coordinate] }];
}

export function removeStop(stops: readonly Place[], index: number): Place[] {
  if (!Number.isInteger(index) || index < 0 || index >= stops.length)
    return [...stops];
  return stops.filter((_, i) => i !== index);
}

/** Move a stop one place up (-1) or down (+1). Out-of-range moves are no-ops. */
export function moveStop(
  stops: readonly Place[],
  index: number,
  direction: -1 | 1,
): Place[] {
  const target = index + direction;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= stops.length ||
    target < 0 ||
    target >= stops.length
  )
    return [...stops];
  const next = [...stops];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// ---------------------------------------------------------------------------
// Departure / arrival planning. Engine durations are free-flow estimates from
// the routing graph; there is no traffic model, so a later departure uses the
// SAME duration and says so.

export type ScheduleKind = "now" | "depart" | "arrive";
export const SCHEDULE_POLICY = {
  /** Requested times this far in the past are treated as "now". */
  pastToleranceMs: 60_000,
  /** Free-flow estimates are not offered beyond this horizon. */
  maxHorizonMs: 7 * 24 * 60 * 60_000,
  basis:
    "Free-flow routing-engine estimate. No traffic prediction is available, so the duration does not change with the time of day.",
} as const;

export type ScheduleResult =
  | {
      ok: true;
      kind: ScheduleKind;
      departAt: number;
      arriveAt: number;
      /** Arrive-by target missed even when leaving now. */
      late: boolean;
      basis: string;
    }
  | { ok: false; reason: string };

export function scheduleEstimate(input: {
  durationS: number;
  kind: ScheduleKind;
  /** Requested departure or arrival time in Unix ms; ignored for "now". */
  at?: number;
  now: number;
}): ScheduleResult {
  const { durationS, kind, now } = input;
  if (!Number.isFinite(durationS) || durationS < 0)
    return { ok: false, reason: "Route duration is unknown." };
  if (!Number.isFinite(now)) return { ok: false, reason: "Invalid clock." };
  const durationMs = durationS * 1000;
  const result = (departAt: number, late = false): ScheduleResult => ({
    ok: true,
    kind,
    departAt,
    arriveAt: departAt + durationMs,
    late,
    basis: SCHEDULE_POLICY.basis,
  });
  if (kind === "now") return result(now);
  const at = input.at;
  if (typeof at !== "number" || !Number.isFinite(at))
    return { ok: false, reason: "Choose a time." };
  if (at - now > SCHEDULE_POLICY.maxHorizonMs)
    return {
      ok: false,
      reason: "Estimates are limited to the next 7 days.",
    };
  if (kind === "depart") {
    if (at < now - SCHEDULE_POLICY.pastToleranceMs)
      return { ok: false, reason: "That departure time has passed." };
    return result(Math.max(at, now));
  }
  if (kind === "arrive") {
    const departAt = at - durationMs;
    if (departAt < now - SCHEDULE_POLICY.pastToleranceMs)
      return result(now, true);
    return result(Math.max(departAt, now));
  }
  return { ok: false, reason: "Unknown schedule type." };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** UK wall-clock label, e.g. "14:05 GMT" or "Sat 28 Nov 09:30 GMT" when the
 * day differs from `now`. Computed from the UK DST rule, not device ICU data, so
 * iOS, Android (Hermes) and web show the same zone regardless of device setting. */
export function ukClockLabel(ms: number, now?: number): string {
  if (!Number.isFinite(ms)) return "unknown";
  const offset = ukOffsetMinutes(ms);
  const local = new Date(ms + offset * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} ${offset ? "BST" : "GMT"}`;
  if (now === undefined || !Number.isFinite(now)) return time;
  const localNow = new Date(now + ukOffsetMinutes(now) * 60_000);
  const sameDay =
    localNow.getUTCFullYear() === local.getUTCFullYear() &&
    localNow.getUTCMonth() === local.getUTCMonth() &&
    localNow.getUTCDate() === local.getUTCDate();
  return sameDay
    ? time
    : `${DAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${time}`;
}

/** Parse "HH:MM" as a time in UK local time on the next occurrence (today, or
 * tomorrow if already passed by more than the tolerance). Returns Unix ms or null. */
export function nextUkTime(hhmm: string, now: number): number | null {
  const m = /^\s*([01]?\d|2[0-3]):([0-5]\d)\s*$/.exec(hhmm);
  if (!m || !Number.isFinite(now)) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  for (const dayOffset of [0, 1]) {
    const candidate = ukWallClockToUtc(now, dayOffset, hours, minutes);
    if (candidate === null) return null;
    if (candidate >= now - SCHEDULE_POLICY.pastToleranceMs) return candidate;
  }
  return null;
}

/** Offset of Europe/London from UTC in minutes at instant `t` (0 or 60). */
export function ukOffsetMinutes(t: number): number {
  // UK rule since 1996: BST from 01:00 UTC on the last Sunday in March until
  // 01:00 UTC on the last Sunday in October. Computed directly so Hermes builds
  // without full ICU time-zone data still get correct UK time.
  const year = new Date(t).getUTCFullYear();
  const lastSunday = (month: number) => {
    const d = new Date(Date.UTC(year, month + 1, 0, 1));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  };
  return t >= lastSunday(2) && t < lastSunday(9) ? 60 : 0;
}

function ukWallClockToUtc(
  now: number,
  dayOffset: number,
  hours: number,
  minutes: number,
): number | null {
  const localNow = new Date(now + ukOffsetMinutes(now) * 60_000);
  const guess = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + dayOffset,
    hours,
    minutes,
  );
  // Resolve offset at the target instant (handles the two DST change days).
  const first = guess - ukOffsetMinutes(guess) * 60_000;
  const resolved = guess - ukOffsetMinutes(first) * 60_000;
  return Number.isFinite(resolved) ? resolved : null;
}

// ---------------------------------------------------------------------------
// Avoidances. Only classes the configured graph declares are offered; the
// hosted OSRM test graph supports none (probe 27 Nov 2026).

export const AVOIDANCES = ["motorway", "toll", "ferry"] as const;
export type Avoidance = (typeof AVOIDANCES)[number];
export const AVOIDANCE_LABELS: Record<Avoidance, string> = {
  motorway: "Motorways",
  toll: "Tolls",
  ferry: "Ferries",
};

/** Parse operator configuration such as "motorway,toll". Unknown names dropped. */
export function parseAvoidanceConfig(raw: string | undefined): Avoidance[] {
  if (!raw) return [];
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return AVOIDANCES.filter((a) => wanted.includes(a));
}

export type AvoidanceCheck =
  | { ok: true; exclude: Avoidance[] }
  | { ok: false; reason: string };

export function checkAvoidances(
  requested: readonly string[],
  mode: string,
  supported: readonly Avoidance[],
): AvoidanceCheck {
  const unique = [...new Set(requested)];
  if (!unique.length) return { ok: true, exclude: [] };
  if (mode !== "driving")
    return {
      ok: false,
      reason: "Avoidances are only defined for driving routes.",
    };
  const unsupported = unique.filter(
    (a) => !(supported as readonly string[]).includes(a),
  );
  if (unsupported.length)
    return {
      ok: false,
      reason: `The configured routing graph cannot avoid: ${unsupported.join(", ")}. No route was requested, so nothing is presented as avoiding them.`,
    };
  return { ok: true, exclude: AVOIDANCES.filter((a) => unique.includes(a)) };
}
