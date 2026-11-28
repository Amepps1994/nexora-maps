/**
 * Small controllers behind hooks/use-nexora.ts, kept free of React and React Native
 * so the wiring can be unit tested in Node (QA-002). Relative imports only: vitest
 * has no "@/" alias.
 *
 * - `createLatestOnly()`: one request at a time, where a newer request or a cancel
 *   makes any older reply stale (search, BUG-006).
 * - `createRerouteController()`: builds live reroute requests, keeps the cumulative
 *   visited-stop offset (BUG-002) and picks the timeout from the server state
 *   (BUG-013).
 * - `idleCarGuidance()`: the snapshot published when the phone screen unmounts, so a
 *   crash caught by the ErrorBoundary does not leave the car and lock-screen
 *   surfaces showing a trip that is no longer running (BUG-014).
 */
import {
  buildCarGuidance,
  type CarGuidanceSnapshot,
} from "../shared/nexora/car-guidance";
import { remainingStops } from "../shared/nexora/reroute";
import type { ApiClient } from "./nexora-api-core";
import { rerouteTimeoutFor } from "./nexora-api-core";

type Coord = [number, number];

/**
 * Runs tasks so that only the newest one can report back. Starting a new task, or
 * calling `cancel()`, aborts the previous one's signal and drops its result, its
 * error and its settle callback, however late the reply arrives.
 */
export function createLatestOnly() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    /** True while the newest task has not settled. */
    inFlight: () => controller !== null,
    cancel() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
    async run<T>(
      task: (signal: AbortSignal) => Promise<T>,
      handlers: {
        onResult: (value: T) => void;
        onError?: (error: unknown) => void;
        /** Called once the newest task settles (not for stale or cancelled ones). */
        onSettled?: () => void;
      },
    ): Promise<void> {
      this.cancel();
      const mine = generation;
      const own = new AbortController();
      controller = own;
      const current = () => mine === generation;
      try {
        const value = await task(own.signal);
        if (current()) handlers.onResult(value);
      } catch (error) {
        if (current()) handlers.onError?.(error);
      } finally {
        if (current()) {
          controller = null;
          handlers.onSettled?.();
        }
      }
    },
  };
}
export type LatestOnly = ReturnType<typeof createLatestOnly>;

export type RerouteTrip<Stop extends { coordinate: Coord }> = {
  destination: Coord | null | undefined;
  /** The trip's original intermediate stops, in order. */
  stops: readonly Stop[];
  mode: string;
  avoid: readonly string[];
};

/**
 * Live reroute wiring. `request()` asks the server for a route from the current
 * position to the stops still ahead; `apply()` commits the visited-stop offset only
 * when the candidate is actually used, and `reset()` starts a new trip.
 */
export function createRerouteController<
  Stop extends { coordinate: Coord },
  R = unknown,
>(api: Pick<ApiClient, "json" | "getState" | "checkIdle">) {
  let visited = 0;
  let pending = 0;
  return {
    /** Stops of the current trip already dropped by applied reroutes. */
    visitedStops: () => visited,
    /** The request body, without sending it. Exposed for tests. */
    body(trip: RerouteTrip<Stop>, from: Coord, passed: number) {
      // `passed` counts stops on the route being followed, which after a reroute no
      // longer includes stops visited earlier, so keep a cumulative offset (BUG-002).
      const { remaining, nextOffset } = remainingStops(trip.stops, visited, passed);
      return {
        nextOffset,
        body: {
          origin: from,
          destination: trip.destination,
          mode: trip.mode,
          ...(remaining.length
            ? { stops: remaining.map((stop) => stop.coordinate) }
            : {}),
          ...(trip.avoid.length && trip.mode === "driving"
            ? { avoid: [...trip.avoid] }
            : {}),
        },
      };
    },
    async request(
      trip: RerouteTrip<Stop>,
      from: Coord,
      passed: number,
    ): Promise<R[]> {
      const { body, nextOffset } = this.body(trip, from, passed);
      pending = nextOffset;
      // A hung reroute must not leave the driver in "rerouting" (BUG-007), but a
      // server that may be asleep gets longer than 10 s (BUG-013).
      const state = api.checkIdle();
      const data = await api.json<{ routes?: R[] }>("/api/nexora/routes", {
        body,
        timeoutMs: rerouteTimeoutFor(state),
      });
      return Array.isArray(data?.routes) ? data.routes : [];
    },
    /** The last requested candidate was applied: its stops are now behind us. */
    apply() {
      visited = pending;
    },
    reset() {
      visited = 0;
      pending = 0;
    },
  };
}
export type RerouteController = ReturnType<typeof createRerouteController>;

/**
 * "Nothing running" for the car and lock-screen surfaces. Published from the cleanup
 * of the publishing effect's owner, so an unmount (ErrorBoundary, app teardown)
 * always ends any active card (BUG-014).
 */
export function idleCarGuidance(
  prefs: { muted: boolean; metric: boolean },
  now = Date.now(),
): CarGuidanceSnapshot {
  return buildCarGuidance({
    state: "idle",
    route: null,
    step: null,
    progress: 0,
    paused: false,
    muted: prefs.muted,
    metric: prefs.metric,
    now,
  });
}
