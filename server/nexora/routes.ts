import type { Express, Response } from "express";
import { z } from "zod";
import { mapDocument } from "./map-document";
import { map3dDocument, map3dDocumentCsp } from "./map3d-document";
import { geocoderSchema } from "../../shared/nexora/provider";
import {
  DailyBudget,
  SearchCache,
  buildSearchRequest,
  geocoderDailyBudget,
  isEmptyResultStatus,
  normaliseSearchQuery,
  resolveGeocoder,
  searchCacheTtlSeconds,
} from "./geocoder";
import { mapOsrmRoutes } from "./route-mapper";
import { trustedExpoWebOrigins } from "../_core/cors";
import { betterNamedSnap, suspectBikeEnds } from "./bike-snap";
import {
  AVOIDANCES,
  MAX_INTERMEDIATE_STOPS,
  checkAvoidances,
  parseAvoidanceConfig,
} from "../../shared/nexora/itinerary";

const coord = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const routeInput = z.object({
  origin: coord,
  destination: coord,
  mode: z.enum(["driving", "walking", "cycling"]),
  // GEO-004: the same limit the app and capabilities advertise.
  stops: z.array(coord).max(MAX_INTERMEDIATE_STOPS).optional(),
  avoid: z.array(z.enum(AVOIDANCES)).max(AVOIDANCES.length).optional(),
});
/** Exclude classes the operator's car graph was built with. Empty by default:
 * the hosted test graph rejects every exclude (docs/provider-capability-probe-2026-11-27.json). */
const supportedCarAvoidances = () =>
  parseAvoidanceConfig(process.env.NEXORA_CAR_EXCLUDE);

class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    readonly detail?: string,
  ) {
    super("Provider unavailable");
  }
}
/** The provider queue is full: answer 503 at once instead of piling up work (SEC-007). */
export class QueueFullError extends Error {
  constructor(readonly queue: string) {
    super("Provider queue full");
  }
}
/** The provider answered 2xx with a body that is not JSON. */
class InvalidReplyError extends Error {
  constructor() {
    super("Provider reply was not JSON");
  }
}
/** The request was cancelled: the client went away or its time budget ran out. */
class RequestAbortedError extends Error {
  constructor() {
    super("Request aborted");
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new RequestAbortedError());
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new RequestAbortedError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/**
 * SEC-007: one FIFO queue per provider family. Calls run one at a time with a minimum spacing
 * (the public OSRM service asks for at most 1 request/s; LocationIQ's free plan allows 2/s).
 * At most `maxQueued` calls may wait; the next one fails fast with QueueFullError. A waiting
 * call whose request is aborted leaves the queue without ever reaching the provider.
 */
export class ProviderQueue {
  private waiting: Array<{ go: () => void }> = [];
  private busy = false;
  private nextAt = 0;
  constructor(
    readonly name: string,
    readonly spacingMs: number,
    readonly maxQueued: number,
  ) {}
  get depth() {
    return this.waiting.length;
  }
  async run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new RequestAbortedError();
    if (this.busy) {
      if (this.waiting.length >= this.maxQueued) throw new QueueFullError(this.name);
      await new Promise<void>((resolve, reject) => {
        const entry = {
          go: () => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          },
        };
        const onAbort = () => {
          const i = this.waiting.indexOf(entry);
          if (i >= 0) this.waiting.splice(i, 1);
          reject(new RequestAbortedError());
        };
        this.waiting.push(entry);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      // The finishing call handed `busy` straight to us.
    } else {
      this.busy = true;
    }
    try {
      const delay = Math.max(0, this.nextAt - Date.now());
      if (delay) await sleep(delay, signal);
      if (signal.aborted) throw new RequestAbortedError();
      this.nextAt = Date.now() + this.spacingMs;
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next.go();
      else this.busy = false;
    }
  }
}

/**
 * SEC-005: fixed-window limiter keyed by client IP (real client IPs need `trust proxy`, set in
 * server/_core/app.ts). One instance per route family so heavy searching cannot lock routing.
 * Idle entries are pruned so the map cannot grow without bound.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; since: number }>();
  constructor(
    readonly perWindow: number,
    readonly windowMs = 60_000,
    readonly maxKeys = 10_000,
    private now: () => number = Date.now,
  ) {}
  get size() {
    return this.hits.size;
  }
  /** True when this request is over the limit. Returns seconds to wait via `retryAfter`. */
  check(key: string): { limited: boolean; retryAfterS: number } {
    const now = this.now();
    if (this.hits.size >= this.maxKeys) this.prune(now);
    const entry = this.hits.get(key);
    if (!entry || now - entry.since >= this.windowMs) {
      this.hits.delete(key);
      this.hits.set(key, { count: 1, since: now });
      return { limited: false, retryAfterS: 0 };
    }
    entry.count += 1;
    const retryAfterS = Math.max(1, Math.ceil((entry.since + this.windowMs - now) / 1000));
    return { limited: entry.count > this.perWindow, retryAfterS };
  }
  prune(now = this.now()) {
    for (const [key, entry] of this.hits)
      if (now - entry.since >= this.windowMs) this.hits.delete(key);
    // Still full of live keys (a flood of distinct IPs): drop the oldest windows.
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

/**
 * A per-request cancellation signal: aborts when the client disconnects before the reply is
 * sent, or when the request's total time budget runs out (kept below the app's own timeouts
 * in lib/nexora-api-core.ts so the server never works on an answer nobody will read).
 */
function requestScope(res: Response, budgetMs: number) {
  const controller = new AbortController();
  let reason: "client" | "deadline" | null = null;
  const timer = setTimeout(() => {
    reason ??= "deadline";
    controller.abort();
  }, budgetMs);
  const onClose = () => {
    if (!res.writableFinished) {
      reason ??= "client";
      controller.abort();
    }
    clearTimeout(timer);
  };
  res.on("close", onClose);
  res.on("finish", () => clearTimeout(timer));
  return { signal: controller.signal, reason: () => reason };
}

export type ProviderFailureClass =
  | "http"
  | "rate_limited"
  | "timeout"
  | "network"
  | "queue_full"
  | "schema";

/** OPS-007: one structured line per provider failure. Never the query, key or coordinates. */
export type ProviderFailureLog = {
  event: "provider_failure";
  provider: "routing" | "search";
  mode?: string;
  class: ProviderFailureClass;
  status?: number;
  durationMs: number;
};

export type NexoraRouteOptions = {
  /** Minimum gap between calls to the routing provider (default 1100 ms). */
  routerSpacingMs?: number;
  /** Minimum gap between calls to the geocoder (default 550 ms; LocationIQ free = 2/s). */
  geocoderSpacingMs?: number;
  /** Calls allowed to wait per provider queue before 503 (default 5). */
  maxQueued?: number;
  /** Whole-request time budget for routing (default 9 s) and search (default 8 s). */
  routeBudgetMs?: number;
  searchBudgetMs?: number;
  /** Requests per client per minute (defaults 15 / 15). */
  searchesPerMinute?: number;
  routesPerMinute?: number;
  /** Clock for the cache, budget and limiters (tests). */
  now?: () => number;
  /** Where provider-failure lines go (default console.warn as JSON). */
  log?: (line: ProviderFailureLog) => void;
};

type Env = Record<string, string | undefined>;
const envInt = (env: Env, name: string, fallback: number) => {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};
/** Fills unset options from the environment, then from the defaults. */
export function resolveRouteOptions(
  opts: NexoraRouteOptions = {},
  env: Env = process.env,
): Required<NexoraRouteOptions> {
  return {
    routerSpacingMs: opts.routerSpacingMs ?? envInt(env, "NEXORA_ROUTER_SPACING_MS", 1100),
    geocoderSpacingMs: opts.geocoderSpacingMs ?? envInt(env, "NEXORA_GEOCODER_SPACING_MS", 550),
    maxQueued: opts.maxQueued ?? envInt(env, "NEXORA_PROVIDER_MAX_QUEUED", 5),
    routeBudgetMs: opts.routeBudgetMs ?? envInt(env, "NEXORA_ROUTE_BUDGET_MS", 9000),
    searchBudgetMs: opts.searchBudgetMs ?? envInt(env, "NEXORA_SEARCH_BUDGET_MS", 8000),
    searchesPerMinute:
      opts.searchesPerMinute ?? (envInt(env, "NEXORA_SEARCH_PER_MINUTE", 15) || 15),
    routesPerMinute: opts.routesPerMinute ?? (envInt(env, "NEXORA_ROUTES_PER_MINUTE", 15) || 15),
    now: opts.now ?? Date.now,
    log:
      opts.log ??
      ((line) => console.warn(JSON.stringify(line))),
  };
}

type SearchResult = {
  id: string;
  name: string;
  subtitle: string;
  coordinate: [number, number];
  category: string;
  source: string;
};

const routerUrls = (env: Env = process.env) => ({
  driving: env.NEXORA_CAR_ROUTER || "https://routing.openstreetmap.de/routed-car",
  walking: env.NEXORA_FOOT_ROUTER || "https://routing.openstreetmap.de/routed-foot",
  cycling: env.NEXORA_BIKE_ROUTER || "https://routing.openstreetmap.de/routed-bike",
});

/** Words the app shows when the server sheds load; each answer is JSON with no upstream call. */
const BUSY = {
  routing: "The routing service is busy. Try again in a few seconds.",
  search: "Search is busy. Try again in a few seconds.",
};

export function registerNexoraRoutes(app: Express, options: NexoraRouteOptions = {}) {
  const opts = resolveRouteOptions(options);
  const health: Record<
    string,
    { status: string; checkedAt: string | null; reason?: string }
  > = {};
  const markHealth = (mode: string, status: string, reason?: string) => {
    health[mode] = {
      status,
      checkedAt: new Date(opts.now()).toISOString(),
      ...(reason ? { reason } : {}),
    };
  };
  const queues = {
    routing: new ProviderQueue("routing", opts.routerSpacingMs, opts.maxQueued),
    search: new ProviderQueue("search", opts.geocoderSpacingMs, opts.maxQueued),
  };
  const limiters = {
    routing: new RateLimiter(opts.routesPerMinute, 60_000, 10_000, opts.now),
    search: new RateLimiter(opts.searchesPerMinute, 60_000, 10_000, opts.now),
  };
  const searchCache = new SearchCache<SearchResult[]>(
    searchCacheTtlSeconds() * 1000,
    undefined,
    opts.now,
  );
  const searchBudget = new DailyBudget(geocoderDailyBudget(), opts.now);

  /** Fetch JSON from a provider through its queue, bounded by the request's signal. */
  async function providerFetch(
    family: keyof typeof queues,
    url: string,
    signal: AbortSignal,
    headers?: Record<string, string>,
  ) {
    return queues[family].run(signal, async () => {
      let response: globalThis.Response;
      try {
        response = await fetch(url, {
          signal,
          headers: {
            "User-Agent": "NEXORA-Maps/0.1 (private non-commercial development preview)",
            ...headers,
          },
        });
      } catch (e) {
        if (signal.aborted) throw new RequestAbortedError();
        throw e;
      }
      if (!response.ok) {
        let code: string | undefined;
        let detail: string | undefined;
        try {
          const body = await response.json();
          code = typeof body?.code === "string" ? body.code : undefined;
          detail = typeof body?.error === "string" ? body.error : undefined;
        } catch {
          /* non-JSON provider error */
        }
        throw new ProviderError(response.status, code, detail);
      }
      try {
        return await response.json();
      } catch {
        if (signal.aborted) throw new RequestAbortedError();
        throw new InvalidReplyError();
      }
    });
  }

  /** Classify a failure for the log line and the reply. */
  function classify(
    e: unknown,
    scope: { reason: () => "client" | "deadline" | null },
  ): ProviderFailureClass | "client_closed" {
    if (e instanceof QueueFullError) return "queue_full";
    if (e instanceof InvalidReplyError) return "schema";
    if (e instanceof ProviderError) return e.status === 429 ? "rate_limited" : "http";
    if (e instanceof RequestAbortedError || (e as Error)?.name === "AbortError")
      return scope.reason() === "client" ? "client_closed" : "timeout";
    if (scope.reason() === "deadline") return "timeout";
    return "network";
  }
  const logFailure = (
    provider: ProviderFailureLog["provider"],
    cls: ProviderFailureClass,
    started: number,
    extra: { mode?: string; status?: number } = {},
  ) =>
    opts.log({
      event: "provider_failure",
      provider,
      ...(extra.mode ? { mode: extra.mode } : {}),
      class: cls,
      ...(extra.status !== undefined ? { status: extra.status } : {}),
      durationMs: Math.max(0, Date.now() - started),
    });

  app.get("/api/nexora/capabilities", (_req, res) =>
    res.json({
      version: "0.1.0",
      environment: "private test preview",
      map: "OSM interactive raster / Leaflet",
      routing: {
        provider: "OSRM test service",
        modes: ["driving", "walking", "cycling"],
        // Route times are free-flow estimates; TfL disruptions are shown but never change them.
        traffic: false,
        maxStops: MAX_INTERMEDIATE_STOPS,
        alternativesWithStops: false,
        avoid: { driving: supportedCarAvoidances() },
        schedule: "free-flow estimate only; no traffic prediction",
        legalCoverageVerified: false,
        perMinutePerClient: opts.routesPerMinute,
        health,
      },
      search: (() => {
        const g = resolveGeocoder();
        const budget = searchBudget.snapshot();
        const quota = {
          perMinutePerClient: opts.searchesPerMinute,
          dailyBudget: budget.dailyBudget,
          budgetRemaining: budget.remaining,
          budgetResetsAt: budget.resetsAt,
          cacheTtlSeconds: searchCache.enabled ? searchCache.ttlMs / 1000 : 0,
          cacheHits: searchCache.hits,
          upstreamCallsToday: budget.usedToday,
        };
        return g
          ? {
              configured: true,
              provider: g.label,
              attribution: g.attribution,
              attributionUrl: g.attributionUrl,
              autocomplete: false,
              ...quota,
            }
          : { configured: false, autocomplete: false };
      })(),
      navigation:
        "route simulation and foreground live GPS guidance with voice (device-unverified; not for road use)",
      foregroundGPS: "implemented but device-unverified",
      backgroundGPS: false,
      offlineRouting: false,
      offlineMaps: "London pack download (map and place search only)",
      liveIncidents: "TfL London road disruptions (shown on the map; route times unchanged)",
      sharing: false,
      admin: "disabled",
    }),
  );
  app.get("/api/nexora/map", (_req, res) => {
    // SEC-008: the map page may only be framed by the app itself (web build) and loads its
    // scripts and styles from this server; tiles come from OpenStreetMap.
    res.setHeader("Content-Security-Policy", mapDocumentCsp());
    res.type("html").send(mapDocument);
  });
  app.get("/api/nexora/map3d", (_req, res) => {
    // MAP-3D: tilted map with 3D buildings; map data from OpenFreeMap only.
    res.setHeader("Content-Security-Policy", map3dDocumentCsp());
    res.type("html").send(map3dDocument);
  });
  app.post("/api/nexora/routes", async (req, res) => {
    const parsed = routeInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: `Valid coordinates, a supported mode, at most ${MAX_INTERMEDIATE_STOPS} stops and known avoidances are required.`,
      });
      return;
    }
    const limit = limiters.routing.check(req.ip || "guest");
    if (limit.limited) {
      res
        .status(429)
        .setHeader("Retry-After", String(limit.retryAfterS))
        .json({ error: "Route request limit reached. Please wait a minute." });
      return;
    }
    const { origin, destination, mode, stops = [], avoid = [] } = parsed.data;
    const avoidance = checkAvoidances(avoid, mode, supportedCarAvoidances());
    if (!avoidance.ok) {
      res.status(422).json({ error: avoidance.reason, unsupported: true });
      return;
    }
    const urls = routerUrls();
    const coords: [number, number][] = [origin, ...stops, destination];
    const points = coords.map((c) => c.join(",")).join(";");
    const exclude = avoidance.exclude.length
      ? `&exclude=${avoidance.exclude.join(",")}`
      : "";
    const routeUrl = (pts: string) =>
      `${urls[mode]}/route/v1/driving/${pts}?steps=true&alternatives=true&geometries=geojson&overview=full${exclude}`;
    const scope = requestScope(res, opts.routeBudgetMs);
    const started = Date.now();
    let data: any;
    const resnapped: string[] = [];
    try {
      data = await providerFetch("routing", routeUrl(points), scope.signal);
      if (mode === "cycling" && data.code === "Ok" && data.routes?.length) {
        const suspects = suspectBikeEnds(data.routes[0], coords.length);
        if (suspects.length) {
          try {
            const next = [...coords];
            for (const i of suspects) {
              const near = await providerFetch(
                "routing",
                `${urls.cycling}/nearest/v1/driving/${coords[i].join(",")}?number=3`,
                scope.signal,
              );
              const better = betterNamedSnap(near?.waypoints);
              if (better) {
                next[i] = better.location;
                resnapped.push(
                  `${i === 0 ? "start" : "destination"} snapped to ${better.name}`,
                );
              }
            }
            if (resnapped.length) {
              const retry = await providerFetch(
                "routing",
                routeUrl(next.map((c) => c.join(",")).join(";")),
                scope.signal,
              );
              if (
                retry.code === "Ok" &&
                retry.routes?.length &&
                retry.routes[0].distance < data.routes[0].distance
              )
                data = retry;
              else resnapped.length = 0;
            }
          } catch {
            // Keep the provider's original route; the re-snap is optional (and shares the budget).
            resnapped.length = 0;
          }
        }
      }
    } catch (e) {
      if (e instanceof ProviderError && e.code === "InvalidValue" && exclude) {
        res.status(422).json({
          error:
            "The routing graph rejected these avoidances. No route was substituted.",
          unsupported: true,
        });
        return;
      }
      if (e instanceof ProviderError && e.code === "NoRoute") {
        res.status(404).json({
          error: avoidance.exclude.length
            ? "No route avoids everything you selected. Remove an avoidance or change a stop."
            : "No route returned by the provider. Try another destination or mode.",
        });
        return;
      }
      const cls = classify(e, scope);
      if (cls === "client_closed") return; // nobody is waiting for this answer
      logFailure("routing", cls, started, {
        mode,
        status: e instanceof ProviderError ? e.status : undefined,
      });
      if (cls === "queue_full") {
        res.status(503).setHeader("Retry-After", "5").json({ error: BUSY.routing });
        return;
      }
      if (cls === "schema") {
        markHealth(mode, "degraded", "Unexpected provider reply");
        res.status(502).json({
          error:
            "Routing provider returned a reply NEXORA could not read. No live route has been substituted.",
        });
        return;
      }
      if (cls === "rate_limited") markHealth(mode, "limited");
      else markHealth(mode, "unavailable", cls === "timeout" ? "Timed out" : undefined);
      res.status(503).json({
        error:
          "Routing provider is unavailable or timed out. Retry, or explicitly choose the synthetic demo. No live route has been substituted.",
      });
      return;
    }
    if (data?.code !== "Ok" || !data.routes?.length) {
      res.status(404).json({
        error:
          "No route returned by the provider. Try another destination or mode.",
      });
      return;
    }
    let routes;
    try {
      routes = mapOsrmRoutes(data, mode, { excluded: avoidance.exclude });
    } catch {
      // OPS-007: the provider answered; our mapping failed. That is degraded, not unavailable.
      logFailure("routing", "schema", started, { mode });
      markHealth(mode, "degraded", "Unexpected provider reply");
      res.status(502).json({
        error:
          "Routing provider returned a route NEXORA could not read. No live route has been substituted.",
      });
      return;
    }
    markHealth(mode, "reachable");
    const notes = [
      "Engine-generated test routes. No live traffic, charges or verified restriction coverage. Not for road guidance.",
    ];
    if (stops.length)
      notes.push(
        "Multi-stop requests are routed in the order shown. The test provider returned no alternatives with stops in our 27 Nov 2026 probe.",
      );
    if (resnapped.length)
      notes.push(
        `Cycling ${resnapped.join(" and ")}: the nearest path was a walking-only link that forced a detour.`,
      );
    if (avoidance.exclude.length)
      notes.push(
        `Provider applied exclude: ${avoidance.exclude.join(", ")}. Coverage of these road attributes in map data is not verified.`,
      );
    res.setHeader("Cache-Control", "no-store");
    res.json({ routes, notice: notes.join(" ") });
  });
  app.get("/api/nexora/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 3 || q.length > 150) {
      res.status(400).json({ error: "Enter 3–150 characters." });
      return;
    }
    const geocoder = resolveGeocoder();
    if (!geocoder) {
      res.status(503).json({
        error:
          "Live search needs a licensed or self-hosted search provider. Public Nominatim is not enabled.",
      });
      return;
    }
    const limit = limiters.search.check(req.ip || "guest");
    if (limit.limited) {
      res
        .status(429)
        .setHeader("Retry-After", String(limit.retryAfterS))
        .json({ error: "Please wait before another search." });
      return;
    }
    // SEC-011: identical searches within the TTL are answered from memory.
    const cacheKey = `${geocoder.provider}|8|${normaliseSearchQuery(q)}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      res.json({ attribution: geocoder.attribution, results: cached });
      return;
    }
    if (!searchBudget.take()) {
      res
        .status(503)
        .json({ error: "Search is busy today. Try again tomorrow.", budgetExhausted: true });
      return;
    }
    const { url, headers } = buildSearchRequest(geocoder, q);
    const scope = requestScope(res, opts.searchBudgetMs);
    const started = Date.now();
    let data: unknown;
    try {
      data = await providerFetch("search", url, scope.signal, headers);
    } catch (e) {
      if (e instanceof ProviderError && isEmptyResultStatus(geocoder, e.status)) {
        searchCache.set(cacheKey, []);
        res.json({ results: [], attribution: geocoder.attribution });
        return;
      }
      const cls = classify(e, scope);
      if (cls === "client_closed") return;
      logFailure("search", cls, started, {
        status: e instanceof ProviderError ? e.status : undefined,
      });
      if (cls === "queue_full") {
        res.status(503).setHeader("Retry-After", "5").json({ error: BUSY.search });
        return;
      }
      // LocationIQ answers a spent daily quota with 429 "Rate Limited Day": stop calling it.
      if (e instanceof ProviderError && e.status === 429 && /day/i.test(e.detail ?? ""))
        searchBudget.markExhausted();
      if (cls === "schema") {
        res.status(502).json({
          error:
            "Configured search provider returned an unexpected response. No fabricated results returned.",
        });
        return;
      }
      res.status(503).json({
        error:
          cls === "rate_limited"
            ? "Search provider rate limit reached. Try again shortly. No fabricated results returned."
            : cls === "timeout"
              ? "Search provider timed out. No fabricated results returned."
              : "Configured search provider failed. No fabricated results returned.",
      });
      return;
    }
    const parsed = geocoderSchema.safeParse(data);
    if (!parsed.success) {
      logFailure("search", "schema", started);
      res.status(502).json({
        error:
          "Configured search provider returned an unexpected response. No fabricated results returned.",
      });
      return;
    }
    const results: SearchResult[] = parsed.data.map((p) => ({
      id: `provider-${p.place_id}`,
      name: p.name || p.display_name.split(",")[0],
      subtitle: p.display_name,
      coordinate: [Number(p.lon), Number(p.lat)],
      category: p.type || "place",
      source: geocoder.attribution,
    }));
    searchCache.set(cacheKey, results);
    res.json({ attribution: geocoder.attribution, results });
  });
  // Deny-by-default for the bare path and every sub-path, any method. There is no
  // authenticated admin service; tests/security-admin-account.test.ts pins this.
  app.all(["/api/nexora/admin", "/api/nexora/admin/*"], (_req, res) =>
    res.status(403).json({
      error:
        "Production admin is disabled. Authenticated moderator service must be configured before beta.",
    }),
  );
}

/**
 * SEC-008: CSP for the map page. Inline script and style stay allowed because the document
 * (server/nexora/map-document.ts, owned by WS-C) is one inline page; everything else is locked
 * to this server plus OpenStreetMap tiles. frame-ancestors lets only the app's own web build
 * (configured Expo origins, or a localhost dev server) embed it; the native WebView loads it
 * top-level, where frame-ancestors does not apply.
 */
export function mapDocumentCsp(): string {
  const ancestors = [
    "'self'",
    ...trustedExpoWebOrigins(),
    "http://localhost:*",
    "http://127.0.0.1:*",
  ];
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "connect-src 'self'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${ancestors.join(" ")}`,
  ].join("; ");
}
