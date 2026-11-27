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
