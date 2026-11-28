/**
 * Live nearby places from OpenStreetMap through the public Overpass API (free, ODbL data).
 * Pure helpers shared by the server route (server/nexora/places.ts) and the app: category
 * definitions, the Overpass query, and mapping Overpass elements to `Place`s. No network here.
 */
import { z } from "zod";
import { haversineM, validateCoord, type Coord, type Place } from "./domain";

export const PLACES_ATTRIBUTION = "© OpenStreetMap contributors";

type CategoryDef = {
  label: string;
  /** Feather icon name the app shows on chips and rows. */
  icon: string;
  /** Overpass filters, each applied as `nwr<filter>["name"](around:…)`. */
  filters: string[];
  radiusM: number;
};

export const PLACE_CATEGORIES = {
  highlights: {
    label: "Highlights",
    icon: "star",
    // Notable sights: only features with a Wikidata link, so the list stays meaningful.
    filters: [
      '["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium)$"]["wikidata"]',
      '["historic"~"^(castle|monument|memorial|building|church)$"]["wikidata"]["tourism"]',
      '["leisure"~"^(park|garden)$"]["wikidata"]',
    ],
    radiusM: 3000,
  },
  culture: {
    label: "Culture",
    icon: "aperture",
    filters: [
      '["tourism"~"^(museum|gallery|attraction)$"]',
      '["amenity"~"^(theatre|arts_centre|cinema)$"]',
    ],
    radiusM: 2500,
  },
  parks: {
    label: "Parks",
    icon: "sun",
    filters: ['["leisure"~"^(park|garden|nature_reserve)$"]'],
    radiusM: 3000,
  },
  stations: {
    label: "Stations",
    icon: "truck",
    filters: [
      '["railway"~"^(station|halt)$"]',
      '["public_transport"="station"]',
    ],
    radiusM: 2500,
  },
  food: {
    label: "Food",
    icon: "coffee",
    filters: ['["amenity"~"^(restaurant|cafe|fast_food|pub)$"]'],
    radiusM: 1200,
  },
  fuel: {
    label: "Fuel & charging",
    icon: "droplet",
    filters: ['["amenity"~"^(fuel|charging_station)$"]'],
    radiusM: 5000,
  },
  parking: {
    label: "Parking",
    icon: "square",
    filters: ['["amenity"="parking"]["access"!~"^(private|no|customers)$"]'],
    radiusM: 2000,
  },
} as const satisfies Record<string, CategoryDef>;

export type PlaceCategory = keyof typeof PLACE_CATEGORIES;
export const PLACE_CATEGORY_IDS = Object.keys(
  PLACE_CATEGORIES,
) as PlaceCategory[];
/** Chips on the home screen, in order (highlights feeds the home list instead). */
export const CHIP_CATEGORIES: PlaceCategory[] = [
  "culture",
  "parks",
  "stations",
  "food",
  "fuel",
  "parking",
];
export const isPlaceCategory = (v: unknown): v is PlaceCategory =>
  typeof v === "string" && Object.hasOwn(PLACE_CATEGORIES, v);

/** Most places returned to the app per request. */
export const MAX_NEARBY_RESULTS = 25;
/** Cache cell size in degrees (~550 m north–south in the UK). */
export const NEARBY_CELL_DEG = 0.005;

/** Snap a point to its cache cell so nearby requests share one upstream call. */
export function nearbyCell(c: Coord): Coord {
  const snap = (v: number) =>
    Number((Math.round(v / NEARBY_CELL_DEG) * NEARBY_CELL_DEG).toFixed(4));
  return [snap(c[0]), snap(c[1])];
}

/** The Overpass QL query for one category around a point. */
export function overpassQuery(category: PlaceCategory, at: Coord): string {
  const def = PLACE_CATEGORIES[category];
  const around = `(around:${def.radiusM},${at[1]},${at[0]})`;
  const parts = def.filters.map((f) => `nwr${f}["name"]${around};`).join("");
  return `[out:json][timeout:12];(${parts});out center tags 300;`;
}

const element = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
export const overpassSchema = z.object({ elements: z.array(z.unknown()) });

/** A place as cached on the server, before distance from the caller is known. */
export type NearbyEntry = Omit<Place, "subtitle"> & {
  kind: string;
  area?: string;
};

const KIND_LABELS: Record<string, string> = {
  museum: "Museum",
  gallery: "Gallery",
  attraction: "Attraction",
  viewpoint: "Viewpoint",
  zoo: "Zoo",
  theme_park: "Theme park",
  aquarium: "Aquarium",
  theatre: "Theatre",
  arts_centre: "Arts centre",
  cinema: "Cinema",
  park: "Park",
  garden: "Garden",
  nature_reserve: "Nature reserve",
  station: "Station",
  halt: "Station",
  restaurant: "Restaurant",
  cafe: "Café",
  fast_food: "Fast food",
  pub: "Pub",
  fuel: "Fuel",
  charging_station: "EV charging",
  parking: "Parking",
  castle: "Castle",
  monument: "Monument",
  memorial: "Memorial",
  building: "Historic building",
  church: "Church",
};

function kindOf(tags: Record<string, string>): string {
  for (const key of ["tourism", "amenity", "leisure", "railway", "historic"]) {
    const v = tags[key];
    if (v && KIND_LABELS[v]) return KIND_LABELS[v];
  }
  if (tags.public_transport === "station") return "Station";
  return "Place";
}

/** Map Overpass elements to cache entries: named, valid, de-duplicated by name and spot. */
export function mapOverpassElements(
  category: PlaceCategory,
  raw: unknown,
): NearbyEntry[] {
  const parsed = overpassSchema.safeParse(raw);
  if (!parsed.success) throw new TypeError("Unexpected Overpass reply");
  const seen = new Set<string>();
  const out: NearbyEntry[] = [];
  for (const item of parsed.data.elements) {
    const e = element.safeParse(item);
    if (!e.success) continue;
    const tags = e.data.tags ?? {};
    const name = (tags.name ?? "").trim();
    const lat = e.data.lat ?? e.data.center?.lat;
    const lon = e.data.lon ?? e.data.center?.lon;
    if (!name || lat === undefined || lon === undefined) continue;
    const coordinate: Coord = [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
    if (!validateCoord(coordinate)) continue;
    // Stations and big parks come back as several features: keep one per name nearby.
    const key = `${name.toLowerCase()}|${coordinate[0].toFixed(2)},${coordinate[1].toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const area =
      tags["addr:suburb"] || tags["addr:street"] || tags["addr:city"];
    out.push({
      id: `osm-${e.data.type}-${e.data.id}`,
      name: name.slice(0, 120),
      coordinate,
      category: PLACE_CATEGORIES[category].label,
      kind: kindOf(tags),
      ...(area ? { area: area.slice(0, 80) } : {}),
      source: PLACES_ATTRIBUTION,
    });
  }
  return out;
}

/**
 * LocationIQ Nearby `tag` values (OSM class:type, comma-separated) matching each category.
 * Used only when Overpass is unavailable; it cannot filter on `wikidata`, so highlights are
 * broader there.
 */
export const LOCATIONIQ_NEARBY_TAGS: Record<PlaceCategory, string> = {
  highlights:
    "tourism:attraction,tourism:museum,tourism:gallery,tourism:viewpoint,tourism:zoo,tourism:aquarium,tourism:theme_park",
  culture:
    "tourism:museum,tourism:gallery,tourism:attraction,amenity:theatre,amenity:arts_centre,amenity:cinema",
  parks: "leisure:park,leisure:garden,leisure:nature_reserve",
  stations: "railway:station,railway:halt,public_transport:station",
  food: "amenity:restaurant,amenity:cafe,amenity:fast_food,amenity:pub",
  fuel: "amenity:fuel,amenity:charging_station",
  parking: "amenity:parking",
};

const locationIqItem = z.object({
  osm_type: z.string().optional(),
  osm_id: z.union([z.string(), z.number()]).optional(),
  place_id: z.union([z.string(), z.number()]).optional(),
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  class: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  display_name: z.string().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
});

/** Map a LocationIQ Nearby reply (a JSON array) to cache entries, like `mapOverpassElements`. */
export function mapLocationIqNearby(
  category: PlaceCategory,
  raw: unknown,
): NearbyEntry[] {
  if (!Array.isArray(raw)) throw new TypeError("Unexpected LocationIQ reply");
  const seen = new Set<string>();
  const out: NearbyEntry[] = [];
  for (const item of raw) {
    const p = locationIqItem.safeParse(item);
    if (!p.success) continue;
    const d = p.data;
    const name = (d.name || d.display_name?.split(",")[0] || "").trim();
    if (!name) continue;
    const coordinate: Coord = [Number(d.lon.toFixed(6)), Number(d.lat.toFixed(6))];
    if (!validateCoord(coordinate)) continue;
    const key = `${name.toLowerCase()}|${coordinate[0].toFixed(2)},${coordinate[1].toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const addr = d.address ?? {};
    const area = [addr.suburb, addr.neighbourhood, addr.road, addr.city].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    const osmType = (d.osm_type ?? "").toLowerCase();
    const id =
      d.osm_id !== undefined && /^(node|way|relation)$/.test(osmType)
        ? `osm-${osmType}-${d.osm_id}`
        : `liq-${d.place_id ?? key}`;
    out.push({
      id,
      name: name.slice(0, 120),
      coordinate,
      category: PLACE_CATEGORIES[category].label,
      kind: (d.type && KIND_LABELS[d.type]) || "Place",
      ...(area ? { area: area.slice(0, 80) } : {}),
      source: PLACES_ATTRIBUTION,
    });
  }
  return out;
}

export function formatDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

/** The closest entries to `from`, as app `Place`s with a "Kind · area · distance" subtitle. */
export function nearestPlaces(
  entries: NearbyEntry[],
  from: Coord,
  limit = MAX_NEARBY_RESULTS,
): Place[] {
  return entries
    .map((e) => ({ e, d: haversineM(from, e.coordinate) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ e, d }) => ({
      id: e.id,
      name: e.name,
      subtitle: [e.kind, e.area, formatDistance(d)].filter(Boolean).join(" · "),
      coordinate: e.coordinate,
      category: e.category,
      source: e.source,
    }));
}
