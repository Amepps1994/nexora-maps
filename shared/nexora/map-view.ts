import type { Coord } from "./domain";

/**
 * 3D / 2D map view (MAP-3D). The 2D map is the Leaflet page (online OSM raster or the
 * offline London pack). The 3D map is a separate MapLibre GL page with OpenFreeMap vector
 * tiles and extruded OpenStreetMap buildings. Both are free and need no key.
 */
export type MapView = "2d" | "3d";

/** Anything other than "3d" (old saves, bad data) means the flat map. */
export function normaliseMapView(value: unknown): MapView {
  return value === "3d" ? "3d" : "2d";
}

export type MapViewResolution = {
  view: MapView;
  /** Plain-language reason when 3D was asked for but the flat map is shown. */
  reason?: string;
};

/**
 * Which map page to load. 3D needs the online vector tiles and WebGL, so the offline
 * pack and devices without WebGL always get the flat map, with a reason the UI can show.
 */
export function resolveMapView(opts: {
  requested: MapView;
  offline: boolean;
  unavailable3d?: "webgl" | "load" | null;
}): MapViewResolution {
  if (opts.requested !== "3d") return { view: "2d" };
  if (opts.offline)
    return {
      view: "2d",
      reason: "3D needs an internet connection. Showing the flat offline map.",
    };
  if (opts.unavailable3d === "webgl")
    return {
      view: "2d",
      reason: "This device cannot draw the 3D map. Showing the flat map.",
    };
  if (opts.unavailable3d === "load")
    return {
      view: "2d",
      reason: "The 3D map could not load. Showing the flat map.",
    };
  return { view: "3d" };
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Initial compass bearing from a to b, in degrees clockwise from north (0 to 360). */
export function bearing(a: Coord, b: Coord): number {
  const [lon1, lat1] = [toRad(a[0]), toRad(a[1])];
  const [lon2, lat2] = [toRad(b[0]), toRad(b[1])];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Direction of travel along the route at `position`: the bearing of the nearest route
 * segment (projected on a local flat plane, fine at street scale). Used to turn the 3D
 * camera with the journey. Undefined when there is no usable segment.
 */
export function routeHeading(
  route: readonly Coord[] | undefined,
  position: Coord | undefined,
): number | undefined {
  if (!route || !position || route.length < 2) return undefined;
  const k = Math.cos(toRad(position[1]));
  let best = Infinity;
  let heading: number | undefined;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const ax = (a[0] - position[0]) * k;
    const ay = a[1] - position[1];
    const dx = (b[0] - a[0]) * k;
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    if (len === 0) continue;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = px * px + py * py;
    // Ties (a vertex shared by two segments) go to the later segment: the road ahead.
    if (d <= best) {
      best = d;
      heading = bearing(a, b);
    }
  }
  return heading;
}
