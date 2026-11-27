import type { Express } from "express";
import { z } from "zod";
import { mapDocument } from "./map-document";
import { geocoderSchema } from "../../shared/nexora/provider";
import {
  buildSearchRequest,
  isEmptyResultStatus,
  resolveGeocoder,
} from "./geocoder";
import { mapOsrmRoutes } from "./route-mapper";
import { betterNamedSnap, suspectBikeEnds } from "./bike-snap";
import {
  AVOIDANCES,
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
  stops: z.array(coord).max(5).optional(),
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
  ) {
    super("Provider unavailable");
  }
}
const routerUrls = {
  driving:
    process.env.NEXORA_CAR_ROUTER ||
    "https://routing.openstreetmap.de/routed-car",
  walking:
    process.env.NEXORA_FOOT_ROUTER ||
    "https://routing.openstreetmap.de/routed-foot",
  cycling:
    process.env.NEXORA_BIKE_ROUTER ||
    "https://routing.openstreetmap.de/routed-bike",
};
let nextRequestAt = 0;
let queue = Promise.resolve();
const health: Record<string, { status: string; checkedAt: string | null }> = {};
async function providerFetch(url: string, headers?: Record<string, string>) {
  let release!: () => void;
  const prior = queue;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prior;
  try {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1100;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent":
          "NEXORA-Maps/0.1 (private non-commercial development preview)",
        ...headers,
      },
    });
    if (!response.ok) {
      let code: string | undefined;
      try {
        const body = await response.json();
        code = typeof body?.code === "string" ? body.code : undefined;
      } catch {
        /* non-JSON provider error */
      }
      throw new ProviderError(response.status, code);
    }
    return await response.json();
  } finally {
    release();
  }
}
const limits = new Map<string, { count: number; since: number }>();
function throttle(key: string) {
  const now = Date.now();
  const entry = limits.get(key);
  if (!entry || now - entry.since > 60000) {
    limits.set(key, { count: 1, since: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 15;
}
export function registerNexoraRoutes(app: Express) {
  app.get("/api/nexora/capabilities", (_req, res) =>
    res.json({
      version: "0.1.0",
      environment: "private test preview",
      map: "OSM interactive raster / Leaflet",
      routing: {
        provider: "OSRM test service",
        modes: ["driving", "walking", "cycling"],
        traffic: false,
        maxStops: 3,
        alternativesWithStops: false,
        avoid: { driving: supportedCarAvoidances() },
        schedule: "free-flow estimate only; no traffic prediction",
        legalCoverageVerified: false,
        health,
      },
      search: (() => {
        const g = resolveGeocoder();
        return g
          ? {
              configured: true,
              provider: g.label,
              attribution: g.attribution,
              attributionUrl: g.attributionUrl,
              autocomplete: false,
            }
          : { configured: false, autocomplete: false };
      })(),
      navigation: "simulation only",
      foregroundGPS: "implemented but device-unverified",
      backgroundGPS: false,
      offlineRouting: false,
      liveIncidents: false,
      sharing: false,
      admin: "local demo review only",
    }),
  );
  app.get("/api/nexora/map", (_req, res) => {
    res.type("html").send(mapDocument);
  });
  app.post("/api/nexora/routes", async (req, res) => {
    const parsed = routeInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          "Valid coordinates, supported mode, at most five stops and known avoidances are required.",
      });
      return;
    }
    if (throttle(req.ip || "guest")) {
      res
        .status(429)
        .json({ error: "Test request limit reached. Please wait a minute." });
      return;
    }
    const { origin, destination, mode, stops = [], avoid = [] } = parsed.data;
    const avoidance = checkAvoidances(avoid, mode, supportedCarAvoidances());
    if (!avoidance.ok) {
      res.status(422).json({ error: avoidance.reason, unsupported: true });
      return;
    }
    const coords: [number, number][] = [origin, ...stops, destination];
    const points = coords.map((c) => c.join(",")).join(";");
    const exclude = avoidance.exclude.length
      ? `&exclude=${avoidance.exclude.join(",")}`
      : "";
    const routeUrl = (pts: string) =>
      `${routerUrls[mode]}/route/v1/driving/${pts}?steps=true&alternatives=true&geometries=geojson&overview=full${exclude}`;
    try {
      let data = await providerFetch(routeUrl(points));
      const resnapped: string[] = [];
      if (mode === "cycling" && data.code === "Ok" && data.routes?.length) {
        const suspects = suspectBikeEnds(data.routes[0], coords.length);
        if (suspects.length) {
          try {
            const next = [...coords];
            for (const i of suspects) {
              const near = await providerFetch(
                `${routerUrls.cycling}/nearest/v1/driving/${coords[i].join(",")}?number=3`,
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
                routeUrl(next.map((c) => c.join(",")).join(";")),
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
            resnapped.length = 0; // keep the provider's original route
          }
        }
      }
      if (data.code !== "Ok" || !data.routes?.length) {
        res.status(404).json({
          error:
            "No route returned by the provider. Try another destination or mode.",
        });
        return;
      }
      health[mode] = {
        status: "reachable",
        checkedAt: new Date().toISOString(),
      };
      const routes = mapOsrmRoutes(data, mode, {
        excluded: avoidance.exclude,
      });
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
      health[mode] = {
        status: "unavailable",
        checkedAt: new Date().toISOString(),
      };
      res.status(503).json({
        error:
          "Routing provider is unavailable or timed out. Retry, or explicitly choose the synthetic demo. No live route has been substituted.",
      });
    }
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
    if (throttle(req.ip || "guest")) {
      res.status(429).json({ error: "Please wait before another search." });
      return;
    }
    const { url, headers } = buildSearchRequest(geocoder, q);
    let data: unknown;
    try {
      data = await providerFetch(url, headers);
    } catch (e) {
      if (e instanceof ProviderError && isEmptyResultStatus(geocoder, e.status)) {
        res.json({ results: [], attribution: geocoder.attribution });
        return;
      }
      res.status(503).json({
        error:
          e instanceof ProviderError && e.status === 429
            ? "Search provider rate limit reached. Try again shortly. No fabricated results returned."
            : "Configured search provider failed. No fabricated results returned.",
      });
      return;
    }
    const parsed = geocoderSchema.safeParse(data);
    if (!parsed.success) {
      res.status(503).json({
        error:
          "Configured search provider returned an unexpected response. No fabricated results returned.",
      });
      return;
    }
    res.json({
      attribution: geocoder.attribution,
      results: parsed.data.map((p) => ({
        id: `provider-${p.place_id}`,
        name: p.name || p.display_name.split(",")[0],
        subtitle: p.display_name,
        coordinate: [Number(p.lon), Number(p.lat)],
        category: p.type || "place",
        source: geocoder.attribution,
      })),
    });
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
