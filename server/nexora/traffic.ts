import type { Express } from "express";
import {
  ageSnapshot,
  buildTflSnapshot,
  snapshotFreshness,
  TFL_ATTRIBUTION,
  TRAFFIC_LIMITS,
  TRAFFIC_POLICY,
  type TrafficSnapshot,
} from "../../shared/nexora/traffic";

/**
 * Server-side ingestion of TfL road disruptions. The app never calls TfL directly and
 * never sees the app key: one cached upstream request per TTL serves every client,
 * which keeps usage far below TfL's 500 calls/minute licence limit.
 */
const TFL_BASE = () =>
  (process.env.NEXORA_TFL_API_URL || "https://api.tfl.gov.uk").replace(
    /\/$/,
    "",
  );
const enabled = () => process.env.NEXORA_TFL_DISABLED !== "1";

type State = {
  snapshot: TrafficSnapshot | null;
  fetchedAtMs: number;
  inflight: Promise<TrafficSnapshot> | null;
  /** When the last upstream call failed; drives the failure backoff (PERF-004). */
  failedAtMs: number | null;
  lastError: { at: string; status: number | null } | null;
};
const state: State = {
  snapshot: null,
  fetchedAtMs: 0,
  inflight: null,
  failedAtMs: null,
  lastError: null,
};

/** Test hook: forget cached data between tests. */
export function resetTrafficCache() {
  state.snapshot = null;
  state.fetchedAtMs = 0;
  state.inflight = null;
  state.failedAtMs = null;
  state.lastError = null;
}

class UpstreamError extends Error {
  constructor(readonly status: number | null) {
    super("TfL feed unavailable");
  }
}

async function fetchTfl(now: () => Date): Promise<TrafficSnapshot> {
  const url = new URL(`${TFL_BASE()}/Road/all/Disruption`);
  url.searchParams.set("stripContent", "true");
  const key = process.env.NEXORA_TFL_APP_KEY;
  if (key) url.searchParams.set("app_key", key);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: "application/json",
        "User-Agent": "NEXORA-Maps/0.1 (private development preview)",
      },
    });
  } catch {
    throw new UpstreamError(null);
  }
  if (!response.ok) throw new UpstreamError(response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new UpstreamError(response.status);
  }
  try {
    return buildTflSnapshot(body, now());
  } catch {
    throw new UpstreamError(response.status);
  }
}

export async function getTrafficSnapshot(
  now: () => Date = () => new Date(Date.now()),
) {
  const age = now().getTime() - state.fetchedAtMs;
  if (state.snapshot && age < TRAFFIC_POLICY.cacheTtlMs) return state.snapshot;
  // Negative cache: during an outage answer at once instead of waiting on TfL again.
  if (
    !state.inflight &&
    state.failedAtMs !== null &&
    now().getTime() - state.failedAtMs < TRAFFIC_POLICY.failureBackoffMs
  )
    throw new UpstreamError(state.lastError?.status ?? null);
  if (!state.inflight)
    state.inflight = fetchTfl(now)
      .then((snapshot) => {
        state.snapshot = snapshot;
        state.fetchedAtMs = Date.parse(snapshot.fetchedAt);
        state.failedAtMs = null;
        state.lastError = null;
        return snapshot;
      })
      .catch((e) => {
        state.failedAtMs = now().getTime();
        state.lastError = {
          at: now().toISOString(),
          status: e instanceof UpstreamError ? e.status : null,
        };
        throw e;
      })
      .finally(() => {
        state.inflight = null;
      });
  return state.inflight;
}

export function trafficCapability() {
  return {
    provider: "TfL Unified API (Road disruptions)",
    enabled: enabled(),
    appKeyConfigured: Boolean(process.env.NEXORA_TFL_APP_KEY),
    coverage: "Greater London roads reported to TfL",
    kind: "authority-reported disruptions and closures",
    liveSpeeds: false,
    affectsRouteTimes: false,
    nationalHighways: false,
    lastFetchedAt: state.snapshot?.fetchedAt ?? null,
    lastError: state.lastError,
    limits: TRAFFIC_LIMITS,
    attribution: TFL_ATTRIBUTION,
  };
}

export function registerTrafficRoutes(app: Express) {
  app.get("/api/nexora/traffic/capabilities", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(trafficCapability());
  });
  app.get("/api/nexora/traffic", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!enabled()) {
      res.status(503).json({
        status: "disabled",
        error: "Live London disruptions are turned off on this server.",
      });
      return;
    }
    try {
      const snapshot = await getTrafficSnapshot();
      res.json({ status: "live", ...snapshot });
    } catch {
      const now = new Date(Date.now());
      // Old data is re-aged (ended records dropped, planned recomputed), labelled with its
      // age, never presented as live, and withheld entirely once too old (BUG-015).
      const last = state.snapshot ? ageSnapshot(state.snapshot, now) : null;
      if (last) {
        res.json({
          status:
            snapshotFreshness(last.fetchedAt, now) === "fresh"
              ? "cached"
              : "stale",
          upstreamError: true,
          ...last,
        });
        return;
      }
      res.status(503).json({
        status: "unavailable",
        error:
          "TfL disruption feed is unavailable. No traffic data is shown and none has been substituted.",
      });
    }
  });
}
