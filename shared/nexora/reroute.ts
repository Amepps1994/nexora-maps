/**
 * Pure reroute bookkeeping for live guidance (BUG-002, BUG-007).
 *
 * BUG-002: `stopsPassed()` counts waypoints on the *current* route. After one reroute
 * the current route only contains the stops that were still ahead, so slicing the
 * original stop list by that count re-added visited stops on the second reroute.
 * `remainingStops()` keeps a cumulative offset into the original list instead.
 *
 * BUG-007: the candidate used to be judged on the position at reply time. If the
 * driver had stopped (traffic lights) by then, a confirmed off-route was treated as
 * "stationary drift" and the new route thrown away. `judgeRerouteCandidate()` judges
 * it on the fix that confirmed the off-route, and only declines it if the driver has
 * since rejoined the route.
 */
import { rerouteDecision, type RerouteResult } from "./domain";
import { GUIDANCE_POLICY, type TrackerState } from "./guidance";

/**
 * @param stops the trip's original intermediate stops, in order
 * @param visitedOffset how many of them earlier reroutes already dropped
 * @param passedOnCurrent stops passed on the route being followed now
 * @returns the stops to send with the reroute, and the offset to keep if it is applied
 */
export function remainingStops<T>(
  stops: readonly T[],
  visitedOffset: number,
  passedOnCurrent: number,
): { remaining: T[]; nextOffset: number } {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const nextOffset = Math.min(
    stops.length,
    safe(visitedOffset) + safe(passedOnCurrent),
  );
  return { remaining: stops.slice(nextOffset), nextOffset };
}

export function judgeRerouteCandidate(input: {
  /** Tracker state when the reroute was requested (off-route confirmed while moving). */
  requested: TrackerState;
  /** Tracker state when the candidate arrived. */
  latest: TrackerState;
  candidateRemainingS: number;
  currentRemainingS: number;
  routeMode: "automatic" | "ask" | "locked";
  lastRerouteAt: number | null;
  now: number;
}): RerouteResult {
  const { requested, latest } = input;
  if (latest.status === "on-route" || latest.status === "arrived")
    return {
      reroute: false,
      ask: false,
      reason: "Back on the route; new route not needed",
    };
  return rerouteDecision({
    currentRemainingS: input.currentRemainingS,
    candidateRemainingS: input.candidateRemainingS,
    mode: input.routeMode,
    stableUpdates: requested.offRouteSamples,
    lastRerouteAt: input.lastRerouteAt,
    now: input.now,
    offRoute: requested.status === "off-route",
    accuracyM: requested.accuracyM ?? undefined,
    stationary:
      requested.speedMps === null
        ? undefined
        : requested.speedMps < GUIDANCE_POLICY.movingSpeedMps,
  });
}
