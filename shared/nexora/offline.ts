import { z } from "zod";
import type { Coord, Place } from "./domain";

/**
 * Offline regions built only from openly licensed data:
 * - Map: Protomaps basemap tiles (PMTiles v3), derived from OpenStreetMap (ODbL 1.0).
 * - Search: a name index extracted from those same tiles (places, POIs, named streets).
 * Packs are produced by scripts/offline-region.mjs from a Protomaps daily build and are
 * served by our own API (or EXPO_PUBLIC_NEXORA_OFFLINE_BASE_URL). The app never
 * bulk-downloads tile.openstreetmap.org, which its tile usage policy forbids.
 */
export const OFFLINE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL) &middot; <a href="https://protomaps.com">Protomaps</a>';
export const OFFLINE_ATTRIBUTION_TEXT =
  "© OpenStreetMap contributors (ODbL) · Protomaps";

export const OFFLINE_PACK_FILES = ["tiles.pmtiles", "search.json"] as const;
export type OfflinePackFile = (typeof OFFLINE_PACK_FILES)[number];
/** Map shell assets copied into each pack so the map opens with no network at all. */
export const OFFLINE_SHELL_ASSETS = [
  "leaflet.js",
  "leaflet.css",
  "pmtiles.js",
  "protomaps-leaflet.js",
] as const;

export type OfflineRegionDef = {
  id: string;
  name: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  minZoom: number;
  /** Highest zoom stored. The renderer over-zooms beyond it. */
  maxZoom: number;
};

export const OFFLINE_REGIONS: OfflineRegionDef[] = [
  {
    id: "london",
    name: "Greater London",
    bbox: [-0.5103, 51.2868, 0.334, 51.6919],
    minZoom: 0,
    maxZoom: 14,
  },
];

export const offlineRegionId = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/)
  .refine((id) => OFFLINE_REGIONS.some((r) => r.id === id));

export const packManifestSchema = z.object({
  version: z.literal(1),
  region: z.string(),
  name: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  maxZoom: z.number().int().min(0).max(16),
  builtAt: z.string(),
  /** Protomaps build the tiles were extracted from, e.g. 20261126.pmtiles. */
  source: z.string(),
  licence: z.string(),
  attribution: z.string(),
  files: z.record(
    z.string(),
    z.object({ bytes: z.number().int().positive(), sha256: z.string() }),
  ),
  searchEntries: z.number().int().min(0),
});
export type PackManifest = z.infer<typeof packManifestSchema>;

/** [name, kind, lon, lat] — kept as tuples so a London index stays a few MB. */
export type OfflineIndexEntry = [string, string, number, number];
export const searchIndexSchema = z.object({
  version: z.literal(1),
  region: z.string(),
  attribution: z.string(),
  entries: z.array(
    z.tuple([z.string().min(1), z.string(), z.number(), z.number()]),
  ),
});
export type OfflineSearchIndex = z.infer<typeof searchIndexSchema>;

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const KIND_LABEL: Record<string, string> = {
  locality: "Area",
  neighbourhood: "Neighbourhood",
  macrohood: "District",
  station: "Station",
  train_station: "Station",
  bus_stop: "Bus stop",
  aerodrome: "Airport",
  highway: "Street",
  major_road: "Street",
  medium_road: "Street",
  minor_road: "Street",
  path: "Path",
  park: "Park",
  hospital: "Hospital",
  museum: "Museum",
  school: "School",
  university: "University",
};
const label = (kind: string) =>
  KIND_LABEL[kind] ||
  (kind ? kind[0].toUpperCase() + kind.slice(1).replace(/_/g, " ") : "Place");

function distanceKm(a: Coord, b: Coord) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Prefix/word search over the offline name index. Ranking: exact name, then name
 * prefix, then word prefix, then substring; ties broken by distance to `near`.
 * Returns no invented data: every hit is a named OSM feature from the pack.
 */
export function searchOfflineIndex(
  index: Pick<OfflineSearchIndex, "entries" | "region">,
  query: string,
  near?: Coord,
  limit = 8,
): Place[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const scored: { e: OfflineIndexEntry; score: number }[] = [];
  for (const e of index.entries) {
    const name = fold(e[0]);
    let score: number;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(` ${q}`)) score = 2;
    else if (q.length >= 3 && name.includes(q)) score = 3;
    else continue;
    if (near) score += Math.min(distanceKm(near, [e[2], e[3]]), 60) / 61;
    scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score || a.e[0].length - b.e[0].length);
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const { e } of scored) {
    const key = `${fold(e[0])}|${label(e[1])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `offline-${index.region}-${e[2].toFixed(5)},${e[3].toFixed(5)}`,
      name: e[0],
      subtitle: `${label(e[1])} · offline ${index.region} pack`,
      coordinate: [e[2], e[3]],
      category: e[1] || "place",
      source: `Offline pack · ${OFFLINE_ATTRIBUTION_TEXT}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** PMTiles v3 files start with the ASCII magic "PMTiles" followed by version byte 3. */
export function isPmtilesV3(head: Uint8Array) {
  const magic = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73];
  return head.length >= 8 && magic.every((b, i) => head[i] === b) && head[7] === 3;
}

export function formatBytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

/**
 * Turns the online map document (downloaded with the pack) into a self-contained
 * offline page: inlines Leaflet, loads PMTiles + protomaps-leaflet, and installs
 * window.nexoraTileLayer so the page draws vector tiles read from the device file
 * through the React Native bridge instead of fetching raster tiles. Dark mode reuses
 * the page's existing CSS treatment of the tile pane.
 */
export function buildOfflineMapHtml(
  doc: string,
  assets: Record<(typeof OFFLINE_SHELL_ASSETS)[number], string>,
  opts: { maxZoom: number; bbox: [number, number, number, number] },
) {
  const safe = (js: string) => js.replace(/<\/script/gi, "<\\/script");
  const bridge = `<script>${safe(assets["pmtiles.js"])}</script><script>${safe(assets["protomaps-leaflet.js"])}</script><script>
(function(){
 var pending={},seq=0;
 function post(d){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(d));}
 window.nexoraBytes=function(id,b64,err){var p=pending[id];if(!p)return;delete pending[id];if(err){p.reject(new Error(err));return;}var s=atob(b64),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);p.resolve({data:u.buffer});};
 var source={getKey:function(){return 'nexora-offline'},getBytes:function(offset,length){return new Promise(function(resolve,reject){var id=++seq;pending[id]={resolve:resolve,reject:reject};post({type:'bytes',id:id,offset:offset,length:length});});}};
 window.nexoraTileLayer=function(L){
  var b=${JSON.stringify(opts.bbox)};
  return protomapsL.leafletLayer({url:new pmtiles.PMTiles(source),flavor:'light',lang:'en',maxDataZoom:${opts.maxZoom},maxZoom:19,bounds:L.latLngBounds([b[1],b[0]],[b[3],b[2]]),attribution:${JSON.stringify(OFFLINE_ATTRIBUTION + " · offline pack")}});
 };
})();
</script>`;
  return doc
    .replace(
      /<link rel="stylesheet" href="\/api\/nexora\/map-assets\/leaflet\.css">/,
      () => `<style>${assets["leaflet.css"].replace(/<\/style/gi, "")}</style>`,
    )
    .replace(
      /<script src="\/api\/nexora\/map-assets\/leaflet\.js"><\/script>/,
      () => `<script>${safe(assets["leaflet.js"])}</script>${bridge}`,
    )
    .replace(
      "Map tiles are unavailable. Check your connection. Cached route is not offline navigation.",
      "Offline map pack could not be read. Re-download it in Settings.",
    );
}
