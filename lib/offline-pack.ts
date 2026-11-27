import { Directory, File, Paths, type FileHandle } from "expo-file-system";
import { getApiBaseUrl } from "@/constants/oauth";
import {
  OFFLINE_PACK_FILES,
  OFFLINE_SHELL_ASSETS,
  buildOfflineMapHtml,
  isPmtilesV3,
  packManifestSchema,
  searchIndexSchema,
  type OfflineRegionDef,
  type OfflineSearchIndex,
  type PackManifest,
} from "@/shared/nexora/offline";

export const offlineSupported = true;

/** Packs come from our API unless an operator points the app at another static host. */
export const packBaseUrl = () =>
  process.env.EXPO_PUBLIC_NEXORA_OFFLINE_BASE_URL ||
  `${getApiBaseUrl()}/api/nexora/offline/regions`;

const root = () => new Directory(Paths.document, "offline");
const regionDir = (id: string) => new Directory(Paths.document, "offline", id);
const shellDir = (id: string) =>
  new Directory(Paths.document, "offline", id, "shell");

export function readInstalled(id: string): PackManifest | null {
  try {
    const f = new File(regionDir(id), "manifest.json");
    if (!f.exists) return null;
    const manifest = packManifestSchema.parse(JSON.parse(f.textSync()));
    for (const name of OFFLINE_PACK_FILES) {
      const file = new File(regionDir(id), name);
      if (!file.exists || file.size !== manifest.files[name]?.bytes) return null;
    }
    for (const asset of [...OFFLINE_SHELL_ASSETS, "map.html"])
      if (!new File(shellDir(id), asset).exists) return null;
    return manifest;
  } catch {
    return null;
  }
}

export function freeBytes() {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}

/**
 * Refreshes the offline map shell (map page + Leaflet/PMTiles/protomaps scripts) so the
 * offline page tracks the current online map document. Small: about 450 KB.
 */
export async function downloadShell(id: string, signal?: AbortSignal) {
  const base = getApiBaseUrl();
  const dir = shellDir(id);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const pairs: [string, string][] = [
    ["map.html", `${base}/api/nexora/map`],
    ...OFFLINE_SHELL_ASSETS.map(
      (a) => [a, `${base}/api/nexora/map-assets/${a}`] as [string, string],
    ),
  ];
  const texts = await Promise.all(
    pairs.map(async ([name, url]) => {
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error(`Map shell file ${name} unavailable (${r.status}).`);
      return [name, await r.text()] as const;
    }),
  );
  if (!texts.find(([n]) => n === "map.html")?.[1].includes("nexoraTileLayer"))
    throw new Error("Server map page is too old for offline mode. Update the API.");
  for (const [name, text] of texts) {
    const f = new File(dir, name);
    if (f.exists) f.delete();
    f.create();
    f.write(text);
  }
}

export async function downloadPack(
  region: OfflineRegionDef,
  manifest: PackManifest,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  const need = Object.values(manifest.files).reduce((a, f) => a + f.bytes, 0);
  const free = freeBytes();
  if (free != null && free < need * 1.2)
    throw new Error("Not enough free storage for this offline region.");
  const dir = regionDir(region.id);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const stale = new File(dir, "manifest.json");
  if (stale.exists) stale.delete();
  let done = 0;
  for (const name of OFFLINE_PACK_FILES) {
    const bytes = manifest.files[name].bytes;
    const target = new File(dir, name);
    if (target.exists) target.delete();
    await File.downloadFileAsync(`${packBaseUrl()}/${region.id}/${name}`, target, {
      idempotent: true,
      signal,
      onProgress: (p) => onProgress(Math.min(1, (done + p.bytesWritten) / need)),
    });
    const got = new File(dir, name);
    if (got.size !== bytes) {
      got.delete();
      throw new Error(`Download of ${name} was incomplete. Try again.`);
    }
    if (name === "tiles.pmtiles") {
      const h = got.open();
      try {
        if (!isPmtilesV3(h.readBytes(8))) throw new Error("Tile pack is not a PMTiles v3 file.");
      } finally {
        h.close();
      }
    } else {
      searchIndexSchema.parse(JSON.parse(got.textSync()));
    }
    done += bytes;
  }
  await downloadShell(region.id, signal);
  const m = new File(dir, "manifest.json");
  m.create();
  m.write(JSON.stringify(manifest));
  onProgress(1);
}

export function removePack(id: string) {
  const dir = regionDir(id);
  if (dir.exists) dir.delete();
  const r = root();
  if (r.exists && r.list().length === 0) r.delete();
}

export async function loadSearchIndex(id: string): Promise<OfflineSearchIndex> {
  return searchIndexSchema.parse(
    JSON.parse(await new File(regionDir(id), "search.json").text()),
  );
}

export async function loadOfflineMapHtml(region: OfflineRegionDef) {
  const dir = shellDir(region.id);
  const read = (name: string) => new File(dir, name).text();
  const [doc, ...assets] = await Promise.all([
    read("map.html"),
    ...OFFLINE_SHELL_ASSETS.map(read),
  ]);
  const record = Object.fromEntries(
    OFFLINE_SHELL_ASSETS.map((a, i) => [a, assets[i]]),
  ) as Record<(typeof OFFLINE_SHELL_ASSETS)[number], string>;
  return buildOfflineMapHtml(doc, record, {
    maxZoom: region.maxZoom,
    bbox: region.bbox,
  });
}

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + 0x8000)),
    );
  return btoa(s);
}

/** Random-access reader over the on-device PMTiles file, used by the map bridge. */
export function openTileReader(id: string) {
  const file = new File(regionDir(id), "tiles.pmtiles");
  const size = file.size;
  let handle: FileHandle | null = file.open();
  return {
    read(offset: number, length: number) {
      if (!handle) throw new Error("Tile reader closed.");
      if (offset < 0 || offset >= size) return "";
      handle.offset = offset;
      return toBase64(handle.readBytes(Math.min(length, size - offset)));
    },
    close() {
      handle?.close();
      handle = null;
    },
  };
}
export type TileReader = ReturnType<typeof openTileReader>;
