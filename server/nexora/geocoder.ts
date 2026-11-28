/**
 * Server-side geocoder configuration. The access key lives only in the server
 * environment (NEXORA_GEOCODER_KEY) and is never returned to the client.
 *
 * Supported adapters:
 * - "locationiq": LocationIQ Search API (Nominatim-compatible JSON). Key sent as the
 *   `key` query parameter. Free plan requires a visible "Search by LocationIQ.com" link.
 * - "nominatim": an operator-controlled / licensed Nominatim-compatible endpoint.
 *   Optional key sent as a Bearer token.
 * Public nominatim.openstreetmap.org is always refused (OSMF policy; see docs/SETUP.md).
 */
export type GeocoderProvider = "locationiq" | "nominatim";

export type GeocoderConfig = {
  provider: GeocoderProvider;
  base: URL;
  key: string;
  label: string;
  attribution: string;
  attributionUrl: string;
};

export const LOCATIONIQ_DEFAULT_URL = "https://eu1.locationiq.com/v1/search";
const BLOCKED_HOSTS = new Set(["nominatim.openstreetmap.org"]);
// Greater London bias (lon/lat). Results elsewhere in GB are still returned.
const LONDON_VIEWBOX = "-0.5103,51.6919,0.3340,51.2868";

export function resolveGeocoder(
  env: Record<string, string | undefined> = process.env,
): GeocoderConfig | null {
  const key = (env.NEXORA_GEOCODER_KEY || "").trim();
  const declared = (env.NEXORA_GEOCODER_PROVIDER || "").trim().toLowerCase();
  let raw = (env.NEXORA_GEOCODER_URL || "").trim();
  if (!raw && declared === "locationiq") raw = LOCATIONIQ_DEFAULT_URL;
  if (!raw) return null;
  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  // Never send an access key over plain HTTP.
  if (base.protocol === "http:" && key) return null;
  if (BLOCKED_HOSTS.has(base.hostname)) return null;
  const isLocationIq =
    declared === "locationiq" || base.hostname.endsWith(".locationiq.com");
  if (isLocationIq) {
    if (!key) return null; // LocationIQ always needs an access token
    return {
      provider: "locationiq",
      base,
      key,
      label: "LocationIQ",
      attribution: "Search by LocationIQ.com · © OpenStreetMap contributors",
      attributionUrl: "https://locationiq.com",
    };
  }
  return {
    provider: "nominatim",
    base,
    key,
    label: "Configured geocoder",
    attribution: "Configured geocoder · OpenStreetMap attribution where applicable",
    attributionUrl: "https://www.openstreetmap.org/copyright",
  };
}

export function buildSearchRequest(cfg: GeocoderConfig, q: string) {
  const url = new URL(cfg.base.toString());
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("countrycodes", "gb");
  url.searchParams.set("accept-language", "en");
  url.searchParams.set("viewbox", LONDON_VIEWBOX);
  const headers: Record<string, string> = {};
  if (cfg.provider === "locationiq") {
    url.searchParams.set("format", "json");
    url.searchParams.set("dedupe", "1");
    url.searchParams.set("key", cfg.key);
  } else {
    url.searchParams.set("format", "jsonv2");
    if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
  }
  return { url: url.toString(), headers };
}

/** LocationIQ answers "no results" with HTTP 404 rather than an empty array. */
export function isEmptyResultStatus(cfg: GeocoderConfig, status: number) {
  return cfg.provider === "locationiq" && status === 404;
}

// ---- SEC-011: quota protection -------------------------------------------------------------
//
// LocationIQ's free plan allows 5,000 requests a day (2/s, 60/min) and lets free accounts cache
// results for up to 48 hours ("If you're on the free plan, we allow caching for upto 48 hours",
// help.locationiq.com article 36000216111, read 28 Nov 2026). Both limits below are env-tunable
// so they can be relaxed on Render without a deploy.

/** Default daily upstream budget: well under the free plan's 5,000/day (decision D4 is open). */
export const DEFAULT_GEOCODER_DAILY_BUDGET = 4000;
/** Default cache lifetime: 24 h, half of LocationIQ's 48 h free-plan cap. */
export const DEFAULT_SEARCH_CACHE_TTL_S = 24 * 60 * 60;
/** Never cache longer than the free plan allows, whatever the env says. */
export const MAX_SEARCH_CACHE_TTL_S = 48 * 60 * 60;
export const DEFAULT_SEARCH_CACHE_ENTRIES = 500;

type Env = Record<string, string | undefined>;

function readInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * NEXORA_GEOCODER_DAILY_BUDGET: upstream geocoder calls allowed per UTC day. "off" disables
 * the budget (only sensible on a paid or self-hosted geocoder). Invalid values use the default.
 */
export function geocoderDailyBudget(env: Env = process.env): number | null {
  const raw = (env.NEXORA_GEOCODER_DAILY_BUDGET || "").trim().toLowerCase();
  if (raw === "off") return null;
  const n = readInt(raw, DEFAULT_GEOCODER_DAILY_BUDGET);
  return n > 0 ? n : DEFAULT_GEOCODER_DAILY_BUDGET;
}

/** NEXORA_SEARCH_CACHE_TTL_S: cache lifetime in seconds, 0 disables, capped at 48 h. */
export function searchCacheTtlSeconds(env: Env = process.env): number {
  return Math.min(
    readInt(env.NEXORA_SEARCH_CACHE_TTL_S, DEFAULT_SEARCH_CACHE_TTL_S),
    MAX_SEARCH_CACHE_TTL_S,
  );
}

/** Lowercase, trimmed, inner whitespace collapsed: "  Tate   MODERN " and "tate modern" match. */
export function normaliseSearchQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Small in-memory LRU with a fixed TTL. Holds only provider results, never keys or client data. */
export class SearchCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  hits = 0;
  misses = 0;
  constructor(
    readonly ttlMs: number,
    readonly maxEntries: number = DEFAULT_SEARCH_CACHE_ENTRIES,
    private now: () => number = Date.now,
  ) {}
  get enabled() {
    return this.ttlMs > 0 && this.maxEntries > 0;
  }
  get size() {
    return this.entries.size;
  }
  get(key: string): T | undefined {
    if (!this.enabled) return undefined;
    const hit = this.entries.get(key);
    if (!hit || hit.expires <= this.now()) {
      if (hit) this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Refresh recency without extending the TTL.
    this.entries.delete(key);
    this.entries.set(key, hit);
    this.hits += 1;
    return hit.value;
  }
  set(key: string, value: T) {
    if (!this.enabled) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Counts upstream calls per UTC day and refuses once the budget is spent. */
export class DailyBudget {
  private day: string;
  private used = 0;
  private exhausted = false;
  constructor(
    readonly limit: number | null,
    private now: () => number = Date.now,
  ) {
    this.day = utcDay(now());
  }
  private roll() {
    const today = utcDay(this.now());
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
      this.exhausted = false;
    }
  }
  /** Reserve one upstream call. False means the budget is spent: do not call upstream. */
  take(): boolean {
    this.roll();
    if (this.exhausted) return false;
    if (this.limit !== null && this.used >= this.limit) return false;
    this.used += 1;
    return true;
  }
  /** The provider itself said the day's quota is gone (LocationIQ "Rate Limited Day"). */
  markExhausted() {
    this.roll();
    this.exhausted = true;
  }
  snapshot() {
    this.roll();
    const remaining =
      this.limit === null
        ? null
        : this.exhausted
          ? 0
          : Math.max(0, this.limit - this.used);
    const next = new Date(`${this.day}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return {
      dailyBudget: this.limit,
      usedToday: this.used,
      remaining,
      resetsAt: next.toISOString(),
    };
  }
}
