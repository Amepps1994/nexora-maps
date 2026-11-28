/**
 * GET /api/nexora/places?category=<id>&lat=<lat>&lon=<lon>
 *
 * Live nearby places from OpenStreetMap via the public Overpass API: free, no key, ODbL data.
 * Requests are snapped to ~500 m cells and cached (default 6 h) so a busy area costs one
 * upstream call; calls go one at a time with a gap (Overpass fair use), with a mirror tried
 * when the main instance fails. No query text, coordinates or key are logged.
 */
import type { Express } from "express";
import { z } from "zod";
import { SearchCache } from "./geocoder";
import { ProviderQueue, QueueFullError, RateLimiter } from "./routes";
import {
  PLACES_ATTRIBUTION,
  PLACE_CATEGORY_IDS,
  isPlaceCategory,
  mapOverpassElements,
  nearbyCell,
  nearestPlaces,
  overpassQuery,
  type NearbyEntry,
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
  now?: () => number;
  env?: Env;
};

const query = z.object({
  category: z.string(),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

class UpstreamError extends Error {
  constructor(readonly status: number) {
    super("Overpass unavailable");
  }
}

export function registerPlacesRoutes(
  app: Express,
  options: PlacesOptions = {},
) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const queue = new ProviderQueue("places", options.spacingMs ?? 1000, 5);
  const limiter = new RateLimiter(options.perMinute ?? 30, 60_000, 10_000, now);
  const cache = new SearchCache<NearbyEntry[]>(
    options.cacheTtlMs ?? 6 * 3600_000,
    2000,
    now,
  );
  const budgetMs = options.budgetMs ?? 14_000;

  async function fetchOverpass(
    body: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const urls = overpassUrls(env);
    let last: unknown = new UpstreamError(503);
    for (const url of urls) {
      try {
        return await queue.run(signal, async () => {
          const r = await fetch(url, {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent":
                "NEXORA-Maps/0.1 (private non-commercial development preview)",
            },
            body: `data=${encodeURIComponent(body)}`,
          });
          if (!r.ok) throw new UpstreamError(r.status);
          return r.json();
        });
      } catch (e) {
        if (signal.aborted || e instanceof QueueFullError) throw e;
        last = e;
      }
    }
    throw last;
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
        attribution: PLACES_ATTRIBUTION,
        places: nearestPlaces(cached, from),
      });
      return;
    }
    if (!overpassUrls(env).length) {
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
    try {
      const data = await fetchOverpass(
        overpassQuery(category, cell),
        controller.signal,
      );
      const entries = mapOverpassElements(category, data);
      cache.set(key, entries);
      res.json({
        attribution: PLACES_ATTRIBUTION,
        places: nearestPlaces(entries, from),
      });
    } catch (e) {
      if (res.headersSent || res.writableEnded) return;
      const cls =
        e instanceof QueueFullError
          ? "queue_full"
          : e instanceof TypeError && /Overpass/.test(e.message)
            ? "schema"
            : e instanceof UpstreamError
              ? e.status === 429
                ? "rate_limited"
                : "http"
              : controller.signal.aborted
                ? "timeout"
                : "network";
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
