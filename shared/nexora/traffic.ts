/**
 * Official road disruption feed policy (TfL Unified API, London only).
 * Pure: parsing, normalisation, freshness and route matching. No network calls.
 *
 * What this is: authority-reported works, collisions, closures and other disruptions
 * on London roads, as published by TfL. What this is not: live traffic speeds or
 * congestion, journey-time prediction, motorway coverage outside TfL's network, or
 * community reports. Route durations are NOT adjusted by anything here.
 */
import { z } from "zod";
import type { Coord } from "./domain";

export const TFL_ATTRIBUTION = [
  "Powered by TfL Open Data",
  "Contains OS data © Crown copyright and database rights 2016",
  "Geomni UK Map data © and database rights [2019]",
] as const;

export const TRAFFIC_POLICY = {
  /** Server cache lifetime. TfL serves the feed with max-age=150. */
  cacheTtlMs: 120_000,
  /** After this age a snapshot is shown as stale, never as live. */
  staleAfterMs: 15 * 60_000,
  /**
   * After a TfL failure the last snapshot is served (re-aged, see ageSnapshot) only up to
   * this age. Older data is withheld and the endpoint answers 503 unavailable (BUG-015).
   */
  maxServeStaleMs: 60 * 60_000,
  /**
   * After a failed upstream call, further requests skip TfL for this long and answer from the
   * last snapshot (or 503) at once, instead of each waiting for the 12 s timeout (PERF-004).
   */
  failureBackoffMs: 30_000,
  /** Distance from the route line within which a disruption is listed for it. */
  routeBufferM: 60,
  /** Rough Greater London bounding box (lon/lat) used to label coverage. */
  coverageBbox: [-0.52, 51.28, 0.34, 51.7] as const,
  maxDisruptions: 400,
} as const;

/** Categories never surfaced, whatever a feed contains. UK enforcement policy. */
const BLOCKED = /camera|police|enforcement|speed ?trap|checkpoint/i;

const lonLat = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const lineString = z
  .string()
  .transform((s, ctx) => {
    try {
      return JSON.parse(s);
    } catch {
      ctx.addIssue({ code: "custom", message: "lineString is not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.array(lonLat).min(2));

const tflSegment = z
  .object({ lineString: z.string().optional() })
  .passthrough();
const tflStreet = z
  .object({
    name: z.string().optional(),
    closure: z.string().optional(),
    directions: z.string().optional(),
    segments: z.array(tflSegment).optional(),
  })
  .passthrough();

export const tflDisruptionSchema = z
  .object({
    id: z.string().min(1),
    category: z.string().default("Unknown"),
    subCategory: z.string().optional(),
    severity: z.string().default("Unknown"),
    comments: z.string().optional(),
    currentUpdate: z.string().nullable().optional(),
    currentUpdateDateTime: z.string().nullable().optional(),
    location: z.string().optional(),
    point: z.string().optional(),
    geography: z
      .object({ type: z.string(), coordinates: z.unknown() })
      .passthrough()
      .nullable()
      .optional(),
    startDateTime: z.string().nullable().optional(),
    endDateTime: z.string().nullable().optional(),
    lastModifiedTime: z.string().nullable().optional(),
    isProvisional: z.boolean().optional(),
    hasClosures: z.boolean().optional(),
    streets: z.array(tflStreet).nullable().optional(),
  })
  .passthrough();

export type TrafficDisruption = {
  id: string;
  source: "TfL";
  category: string;
  subCategory: string | null;
  severity: string;
  /** True when TfL marks the disruption or any listed street as closed. */
  closure: boolean;
  closedStreets: string[];
  summary: string;
  update: string | null;
  location: string;
  point: Coord;
  /** Closed street segments only, as published. Empty when TfL gives none. */
  lines: Coord[][];
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
  provisional: boolean;
  /** Starts after the snapshot time: planned works, not current. */
  planned: boolean;
};

export type TrafficSnapshot = {
  provider: "TfL Unified API";
  coverage: string;
  limits: string[];
  attribution: readonly string[];
  fetchedAt: string;
  expiresAt: string;
  disruptions: TrafficDisruption[];
  /** Records the feed returned that failed validation and were dropped. */
  rejected: number;
};

export const TRAFFIC_LIMITS = [
  "London roads reported to TfL only. Motorways and roads outside London are not covered.",
  "Authority-reported disruptions and closures, not live speeds or congestion.",
  "Route times are free-flow engine estimates and are not changed by this feed.",
  "Direction of travel and lane-level impact are not checked against your route.",
];

function tidy(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  // TfL occasionally publishes a bare reference number as the update text.
  if (!t || /^\d+$/.test(t)) return null;
  return t;
}

function pointOf(d: z.infer<typeof tflDisruptionSchema>): Coord | null {
  const g = d.geography;
  if (g && g.type === "Point") {
    const p = lonLat.safeParse(g.coordinates);
    if (p.success) return p.data;
  }
  if (d.point) {
    try {
      const p = lonLat.safeParse(JSON.parse(d.point));
      if (p.success) return p.data;
    } catch {
      /* fall through */
    }
  }
  return null;
}

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Normalise one TfL record. Returns null for unusable, expired or blocked records. */
export function normaliseTflDisruption(
  raw: unknown,
  now: Date,
): TrafficDisruption | null | "rejected" {
  const parsed = tflDisruptionSchema.safeParse(raw);
  if (!parsed.success) return "rejected";
  const d = parsed.data;
  if (BLOCKED.test(`${d.category} ${d.subCategory ?? ""}`)) return null;
  const point = pointOf(d);
  if (!point) return "rejected";
  const end = time(d.endDateTime);
  if (end !== null && end < now.getTime()) return null;
  const start = time(d.startDateTime);
  const updated = time(d.lastModifiedTime ?? d.currentUpdateDateTime);
  const streets = d.streets ?? [];
  const closed = streets.filter((s) => /closed/i.test(s.closure ?? ""));
  const lines: Coord[][] = [];
  for (const street of closed)
    for (const seg of street.segments ?? []) {
      if (!seg.lineString) continue;
      const line = lineString.safeParse(seg.lineString);
      if (line.success) lines.push(line.data as Coord[]);
    }
  return {
    id: `tfl-${d.id}`,
    source: "TfL",
    category: d.category,
    subCategory: d.subCategory ?? null,
    severity: d.severity,
    closure: Boolean(d.hasClosures) || closed.length > 0,
    closedStreets: closed
      .map((s) => tidy(s.name))
      .filter((s): s is string => Boolean(s)),
    summary: tidy(d.comments) ?? `${d.category} reported by TfL`,
    update: tidy(d.currentUpdate),
    location: tidy(d.location) ?? "London",
    point,
    lines,
    startsAt: start === null ? null : new Date(start).toISOString(),
    endsAt: end === null ? null : new Date(end).toISOString(),
    updatedAt: updated === null ? null : new Date(updated).toISOString(),
    provisional: Boolean(d.isProvisional),
    planned: start !== null && start > now.getTime(),
  };
}

const SEVERITY_RANK: Record<string, number> = {
  severe: 0,
  serious: 1,
  moderate: 2,
  minimal: 3,
  "no impact": 4,
};
export function severityRank(
  d: Pick<TrafficDisruption, "severity" | "closure">,
) {
  const base = SEVERITY_RANK[d.severity.toLowerCase()] ?? 5;
  return d.closure ? Math.min(base, 1) - 0.5 : base;
}

function compareDisruptions(a: TrafficDisruption, b: TrafficDisruption) {
  return (
    Number(a.planned) - Number(b.planned) ||
    severityRank(a) - severityRank(b) ||
    a.id.localeCompare(b.id)
  );
}

/** Build a snapshot from the raw TfL /Road/all/Disruption array. */
export function buildTflSnapshot(raw: unknown, now: Date): TrafficSnapshot {
  if (!Array.isArray(raw)) throw new TypeError("TfL feed is not an array");
  let rejected = 0;
  const seen = new Set<string>();
  const disruptions: TrafficDisruption[] = [];
  for (const item of raw) {
    const d = normaliseTflDisruption(item, now);
    if (d === "rejected") rejected += 1;
    else if (d && !seen.has(d.id)) {
      seen.add(d.id);
      disruptions.push(d);
    }
  }
  disruptions.sort(compareDisruptions);
  return {
    provider: "TfL Unified API",
    coverage: "Greater London roads reported to TfL",
    limits: TRAFFIC_LIMITS,
    attribution: TFL_ATTRIBUTION,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + TRAFFIC_POLICY.cacheTtlMs,
    ).toISOString(),
    disruptions: disruptions.slice(0, TRAFFIC_POLICY.maxDisruptions),
    rejected,
  };
}

export type Freshness = "fresh" | "stale";
export function snapshotFreshness(fetchedAt: string, now: Date): Freshness {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return "stale";
  return now.getTime() - t > TRAFFIC_POLICY.staleAfterMs ? "stale" : "fresh";
}

/**
 * Re-evaluate an older snapshot against the current time before serving it (BUG-015):
 * records whose end time has passed are dropped and `planned` is recomputed, so ended
 * closures disappear and works that have started stop being shown as planned. Returns
 * null once the snapshot is older than `maxServeStaleMs`: it must then not be served.
 */
export function ageSnapshot(
  snapshot: TrafficSnapshot,
  now: Date,
): TrafficSnapshot | null {
  const fetched = Date.parse(snapshot.fetchedAt);
  const t = now.getTime();
  if (!Number.isFinite(fetched) || t - fetched > TRAFFIC_POLICY.maxServeStaleMs)
    return null;
  const disruptions = snapshot.disruptions
    .filter((d) => d.endsAt === null || Date.parse(d.endsAt) >= t)
    .map((d) => ({
      ...d,
      planned: d.startsAt !== null && Date.parse(d.startsAt) > t,
    }))
    .sort(compareDisruptions);
  return { ...snapshot, disruptions };
}

const EARTH_RADIUS_M = 6_371_008.8;
function pointToSegmentM(p: Coord, a: Coord, b: Coord): number {
  const rad = Math.PI / 180;
  const scale = Math.cos(p[1] * rad);
  const ax = (a[0] - p[0]) * scale;
  const ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * scale;
  const by = b[1] - p[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t =
    len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + t * dx, ay + t * dy) * rad * EARTH_RADIUS_M;
}

export function distanceToLineM(p: Coord, line: readonly Coord[]): number {
  if (line.length === 1) return pointToSegmentM(p, line[0], line[0]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++)
    best = Math.min(best, pointToSegmentM(p, line[i - 1], line[i]));
  return best;
}

function bboxOf(line: readonly Coord[], padDeg: number) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of line) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w - padDeg, s - padDeg, e + padDeg, n + padDeg];
}

/**
 * Disruptions whose reported point or closed segment lies within the buffer of the
 * route line. Direction of travel is not checked, so this means "on or beside".
 */
export function disruptionsOnRoute(
  geometry: readonly Coord[],
  disruptions: readonly TrafficDisruption[],
  bufferM: number = TRAFFIC_POLICY.routeBufferM,
): TrafficDisruption[] {
  if (geometry.length < 2 || !disruptions.length) return [];
  const pad = bufferM / 70_000 + 0.001;
  const [w, s, e, n] = bboxOf(geometry, pad);
  const inBox = ([x, y]: Coord) => x >= w && x <= e && y >= s && y <= n;
  return disruptions.filter((d) => {
    const vertices = [d.point, ...d.lines.flat()];
    return vertices.some(
      (v) => inBox(v) && distanceToLineM(v, geometry) <= bufferM,
    );
  });
}

export function inLondonCoverage(c: Coord): boolean {
  const [w, s, e, n] = TRAFFIC_POLICY.coverageBbox;
  return c[0] >= w && c[0] <= e && c[1] >= s && c[1] <= n;
}

export type RouteCoverage = "full" | "partial" | "none";
export function routeCoverage(geometry: readonly Coord[]): RouteCoverage {
  if (!geometry.length) return "none";
  const inside = geometry.filter(inLondonCoverage).length;
  return inside === geometry.length ? "full" : inside ? "partial" : "none";
}

/** One line for a route card. Never claims a delay or a time. */
export function routeTrafficLabel(
  matches: readonly TrafficDisruption[],
  coverage: RouteCoverage,
): string {
  if (coverage === "none") return "Outside TfL disruption coverage";
  const current = matches.filter((m) => !m.planned);
  const parts: string[] = [];
  if (!current.length) parts.push("No TfL-reported disruptions on this route");
  else {
    parts.push(
      `${current.length} TfL disruption${current.length === 1 ? "" : "s"} on or beside this route`,
    );
    const closures = current.filter((m) => m.closure).length;
    if (closures)
      parts.push(`${closures} with a road closure${closures === 1 ? "" : "s"}`);
  }
  if (coverage === "partial")
    parts.push("part of the route is outside TfL coverage");
  return parts.join(" · ");
}
