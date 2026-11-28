/**
 * GET /api/nexora/places?category=<id>&lat=<lat>&lon=<lon>
 *
 * Live nearby places from OpenStreetMap via the public Overpass API: free, no key, ODbL data.
 * Requests are snapped to ~500 m cells and cached (default 6 h) so a busy area costs one
 * upstream call; calls go one at a time with a gap (Overpass fair use), with a mirror tried
 * when the main instance fails, and LocationIQ Nearby as a last resort when a key is set.
 * No query text, coordinates or key are logged.
 */
import type { Express } from "express";
import { z } from "zod";
import { DailyBudget, SearchCache, resolveGeocoder } from "./geocoder";
import { ProviderQueue, QueueFullError, RateLimiter } from "./routes";
import {
  LOCATIONIQ_NEARBY_TAGS,
  PLACES_ATTRIBUTION,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_IDS,
  isPlaceCategory,
  mapLocationIqNearby,
  mapOverpassElements,
  nearbyCell,
  nearestPlaces,
  overpassQuery,
  type NearbyEntry,
  type PlaceCategory,
} from "../../shared/nexora/places";

type Env = Record<string, string | undefined>;

export const DEFAULT_OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** NEXORA_OVERPASS_URL may list several endpoints separated by commas, tried in order. */
export function overpassUrls(env: Env = process.env): string[] {
  const raw = (env.NEXORA_OVERPASS_URL ?? "").trim();
  if (!raw) return DEFAULT_OVERPASS_URLS;
  if (raw === "off") return [];
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u));
}

export type PlacesOptions = {
  /** Gap between upstream calls (default 1000 ms). */
  spacingMs?: number;
  /** Cache lifetime (default 6 h). */
  cacheTtlMs?: number;
  /** Requests per client per minute (default 30). */
  perMinute?: number;
  /** Whole-request time budget (default 14 s; below the app's timeout). */
  budgetMs?: number;
  /** Most time one Overpass endpoint may take (default 5 s). */
  attemptMs?: number;
  /** Time kept back for the fallback when Overpass is slow (default 3.5 s). */
  fallbackReserveMs?: number;
  /** Gap between fallback calls (default 1000 ms). */
  fallbackSpacingMs?: number;
  now?: () => number;
  env?: Env;
};

const PLACES_USER_AGENT =
  "NEXORA-Maps/1.2 (private non-commercial development preview)";

/**
 * Overpass is a volunteer service and is sometimes overloaded for minutes at a time (502s and
 * hangs seen on 28 Nov 2026). When the server has a LocationIQ key (the address-search key),
 * its Nearby API, built on the same OpenStreetMap data, answers instead.
 * NEXORA_PLACES_FALLBACK=off disables it.
 */
export function resolvePlacesFallback(env: Env = process.env) {
  if ((env.NEXORA_PLACES_FALLBACK ?? "").trim().toLowerCase() === "off") return null;
  const g = resolveGeocoder(env);
  if (!g || g.provider !== "locationiq") return null;
  return {
    base: new URL("/v1/nearby", g.base.origin),
    key: g.key,
    attribution: g.attribution,
  };
}
export type PlacesFallback = NonNullable<ReturnType<typeof resolvePlacesFallback>>;

/**
 * NEXORA_PLACES_FALLBACK_DAILY_BUDGET: fallback calls per UTC day (default 800). Together with
 * the search budget (default 4,000) this stays under LocationIQ's free 5,000 a day.
 */
export const DEFAULT_PLACES_FALLBACK_DAILY_BUDGET = 800;
export function placesFallbackDailyBudget(env: Env = process.env): number {
  const n = Number((env.NEXORA_PLACES_FALLBACK_DAILY_BUDGET ?? "").trim());
  return Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : DEFAULT_PLACES_FALLBACK_DAILY_BUDGET;
}

export function buildNearbyRequest(
  fb: PlacesFallback,
  category: PlaceCategory,
  at: [number, number],
): string {
  const url = new URL(fb.base.toString());
  url.searchParams.set("key", fb.key);
  url.searchParams.set("lat", String(at[1]));
  url.searchParams.set("lon", String(at[0]));
  url.searchParams.set("tag", LOCATIONIQ_NEARBY_TAGS[category]);
  url.searchParams.set("radius", String(PLACE_CATEGORIES[category].radiusM));
  url.searchParams.set("limit", "50");
  url.searchParams.set("dedupe", "1");
  return url.toString();
}

const query = z.object({
  category: z.string(),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

class UpstreamError extends Error {
  constructor(readonly status: number) {
    super("Places provider unavailable");
  }
}
/** One Overpass endpoint ran out of its own time slot. */
class AttemptTimeout extends Error {
  constructor() {
    super("Places provider took too long");
  }
}

function failureClass(e: unknown, budgetSpent: boolean): string {
  if (e instanceof QueueFullError) return "queue_full";
  if (e instanceof TypeError && /Overpass|LocationIQ/.test(e.message)) return "schema";
  if (e instanceof UpstreamError) return e.status === 429 ? "rate_limited" : "http";
  if (budgetSpent || e instanceof AttemptTimeout) return "timeout";
  return "network";
}

export function registerPlacesRoutes(
  app: Express,
  options: PlacesOptions = {},
) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const queue = new ProviderQueue("places", options.spacingMs ?? 1000, 5);
  const limiter = new RateLimiter(options.perMinute ?? 30, 60_000, 10_000, now);
  const cache = new SearchCache<{ entries: NearbyEntry[]; attribution: string }>(
    options.cacheTtlMs ?? 6 * 3600_000,
    2000,
    now,
  );
  const budgetMs = options.budgetMs ?? 14_000;

  const attemptMs = options.attemptMs ?? 5000;
  const fallbackReserveMs = options.fallbackReserveMs ?? 3500;
  const fallback = resolvePlacesFallback(env);
  const fallbackQueue = new ProviderQueue(
    "places-fallback",
    options.fallbackSpacingMs ?? 1000,
    5,
  );
  const fallbackBudget = new DailyBudget(placesFallbackDailyBudget(env), now);

  /**
   * Try each Overpass endpoint, each capped at `attemptMs` so one hanging mirror cannot use
   * the whole budget. With a fallback configured, stop early enough to leave it time.
   */
  async function fetchOverpass(
    body: string,
    signal: AbortSignal,
    deadline: number,
  ): Promise<unknown> {
    const urls = overpassUrls(env);
    let last: unknown = new UpstreamError(503);
    for (const url of urls) {
      const left = deadline - Date.now() - (fallback ? fallbackReserveMs : 0);
      if (left < 1000) break;
      const attempt = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.min(attemptMs, left)),
      ]);
      try {
        return await queue.run(attempt, async () => {
          const r = await fetch(url, {
            method: "POST",
            signal: attempt,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
              "User-Agent": PLACES_USER_AGENT,
            },
            body: `data=${encodeURIComponent(body)}`,
          });
          if (!r.ok) throw new UpstreamError(r.status);
          return r.json();
        });
      } catch (e) {
        if (signal.aborted) throw e;
        last = attempt.aborted ? new AttemptTimeout() : e;
      }
    }
    throw last;
  }

  /** LocationIQ Nearby (same OSM data) when Overpass is down. Spends its own daily budget. */
  async function fetchFallback(
    category: PlaceCategory,
    cell: [number, number],
    signal: AbortSignal,
  ): Promise<NearbyEntry[]> {
    if (!fallback) throw new UpstreamError(503);
    if (!fallbackBudget.take()) throw new UpstreamError(429);
    return fallbackQueue.run(signal, async () => {
      const r = await fetch(buildNearbyRequest(fallback, category, cell), {
        signal,
        headers: { Accept: "application/json", "User-Agent": PLACES_USER_AGENT },
      });
      if (r.status === 404) return []; // LocationIQ answers "nothing nearby" with 404
      if (r.status === 429) {
        const text = await r.text().catch(() => "");
        if (/day/i.test(text)) fallbackBudget.markExhausted();
        throw new UpstreamError(429);
      }
      if (!r.ok) throw new UpstreamError(r.status);
      return mapLocationIqNearby(category, await r.json());
    });
  }

  app.get("/api/nexora/places", async (req, res) => {
    const parsed = query.safeParse(req.query);
    const category = parsed.success ? parsed.data.category : undefined;
    if (!parsed.success || !isPlaceCategory(category)) {
      res.status(400).json({
        error: `Choose a category (${PLACE_CATEGORY_IDS.join(", ")}) and a valid lat/lon.`,
      });
      return;
    }
    const { lat, lon } = parsed.data;
    const from: [number, number] = [lon, lat];
    const cell = nearbyCell(from);
    const key = `${category}|${cell.join(",")}`;
    const cached = cache.get(key);
    if (cached) {
      res.json({
        attribution: cached.attribution,
        places: nearestPlaces(cached.entries, from),
      });
      return;
    }
    if (!overpassUrls(env).length && !fallback) {
      res
        .status(503)
        .json({ error: "Nearby places are switched off on this server." });
      return;
    }
    const limit = limiter.check(req.ip || "guest");
    if (limit.limited) {
      res
        .status(429)
        .setHeader("Retry-After", String(limit.retryAfterS))
        .json({ error: "Please wait a moment before browsing more places." });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
      clearTimeout(timer);
    });
    const started = Date.now();
    const deadline = started + budgetMs;
    try {
      let entries: NearbyEntry[];
      let attribution = PLACES_ATTRIBUTION;
      try {
        if (!overpassUrls(env).length) throw new UpstreamError(503);
        const data = await fetchOverpass(
          overpassQuery(category, cell),
          controller.signal,
          deadline,
        );
        entries = mapOverpassElements(category, data);
      } catch (e) {
        if (controller.signal.aborted || !fallback) throw e;
        console.warn(
          JSON.stringify({
            event: "provider_fallback",
            provider: "places",
            from: "overpass",
            class: failureClass(e, false),
            ...(e instanceof UpstreamError ? { status: e.status } : {}),
            durationMs: Date.now() - started,
          }),
        );
        entries = await fetchFallback(category, cell, controller.signal);
        attribution = fallback.attribution;
      }
      cache.set(key, { entries, attribution });
      res.json({ attribution, places: nearestPlaces(entries, from) });
    } catch (e) {
      if (res.headersSent || res.writableEnded) return;
      const cls = failureClass(e, controller.signal.aborted);
      console.warn(
        JSON.stringify({
          event: "provider_failure",
          provider: "places",
          class: cls,
          ...(e instanceof UpstreamError ? { status: e.status } : {}),
          durationMs: Date.now() - started,
        }),
      );
      res.status(cls === "schema" ? 502 : 503).json({
        error:
          cls === "queue_full" || cls === "rate_limited"
            ? "Nearby places are busy. Try again in a few seconds."
            : cls === "timeout"
              ? "Nearby places took too long. Try again."
              : "Nearby places are unavailable right now.",
      });
    } finally {
      clearTimeout(timer);
    }
  });
}
