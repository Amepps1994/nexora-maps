/**
 * The hosted OSRM bike profile can snap a point on a bridge deck to an unnamed
 * river-level way a metre or two closer, which then starts or ends the route with a
 * long "pushing bike" segment and a big detour (London Bridge -> Tate Modern came back
 * as 2.7 km instead of ~1.4 km; probe 27 Nov 2026). These helpers spot that and pick a
 * named road that is almost as close.
 */
type Step = { mode?: string; distance?: number };
type Leg = { steps?: Step[] };
type OsrmRoute = { distance?: number; legs?: Leg[] };
type NearestWaypoint = { name?: string; distance?: number; location?: [number, number] };

/** A walked segment this long at either end of a bike route suggests a bad snap. */
export const SUSPECT_PUSH_METRES = 150;
/** How much further a named road may be than the closest way and still be preferred. */
export const NAMED_SNAP_SLACK_METRES = 10;

const isLongPush = (s?: Step) =>
  !!s && s.mode === "pushing bike" && (s.distance ?? 0) > SUSPECT_PUSH_METRES;

/** Indexes into the request's coordinate list (0 = origin, last = destination) to re-snap. */
export function suspectBikeEnds(route: OsrmRoute | undefined, pointCount: number): number[] {
  const legs = route?.legs ?? [];
  if (!legs.length || pointCount < 2) return [];
  const out: number[] = [];
  if (isLongPush(legs[0].steps?.[0])) out.push(0);
  const last = legs[legs.length - 1].steps ?? [];
  // The final step is the zero-length "arrive" manoeuvre; check the one before it.
  if (last.length > 1 && isLongPush(last[last.length - 2])) out.push(pointCount - 1);
  return out;
}

/** A named way from /nearest that is nearly as close as an unnamed closest one. */
export function betterNamedSnap(
  waypoints: NearestWaypoint[] | undefined,
): { location: [number, number]; name: string } | null {
  if (!waypoints?.length) return null;
  const [closest] = waypoints;
  if (closest.name) return null;
  const limit = (closest.distance ?? 0) + NAMED_SNAP_SLACK_METRES;
  const named = waypoints.find(
    (w) =>
      w.name &&
      Array.isArray(w.location) &&
      w.location.length === 2 &&
      (w.distance ?? Infinity) <= limit,
  );
  return named ? { location: named.location!, name: named.name! } : null;
}
