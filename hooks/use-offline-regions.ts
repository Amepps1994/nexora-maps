import { useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";
import type { Coord, Place } from "@/shared/nexora/domain";
import {
  OFFLINE_REGIONS,
  packManifestSchema,
  searchOfflineIndex,
  type OfflineRegionDef,
  type OfflineSearchIndex,
  type PackManifest,
} from "@/shared/nexora/offline";
import {
  downloadPack,
  downloadShell,
  loadOfflineMapHtml,
  loadSearchIndex,
  offlineSupported,
  openTileReader,
  readInstalled,
  removePack,
  type TileReader,
} from "@/lib/offline-pack";

const PREF_KEY = "nexora.offline.preferOffline";

export type CatalogEntry = OfflineRegionDef & {
  available: boolean;
  manifest: PackManifest | null;
  reason?: string;
};
export type OfflineMapPack = {
  regionId: string;
  html: string;
  read: (offset: number, length: number) => string;
};
type State = {
  started: boolean;
  supported: boolean;
  catalog: CatalogEntry[] | null;
  catalogError: string;
  installed: Record<string, PackManifest>;
  progress: Record<string, number>;
  errors: Record<string, string>;
  preferOffline: boolean;
  mapPack: OfflineMapPack | null;
};

let state: State = {
  started: false,
  supported: offlineSupported,
  catalog: null,
  catalogError: "",
  installed: {},
  progress: {},
  errors: {},
  preferOffline: false,
  mapPack: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const indexes = new Map<string, OfflineSearchIndex>();
const aborts = new Map<string, AbortController>();
let reader: TileReader | null = null;

async function openMapPack(id: string) {
  const region = OFFLINE_REGIONS.find((r) => r.id === id);
  if (!region) return;
  try {
    const html = await loadOfflineMapHtml(region);
    reader?.close();
    const r = openTileReader(id);
    reader = r;
    set({ mapPack: { regionId: id, html, read: r.read } });
  } catch {
    set({ mapPack: null });
  }
  loadSearchIndex(id)
    .then((ix) => indexes.set(id, ix))
    .catch(() => indexes.delete(id));
}

function scanInstalled() {
  const installed: Record<string, PackManifest> = {};
  for (const r of OFFLINE_REGIONS) {
    const m = readInstalled(r.id);
    if (m) installed[r.id] = m;
  }
  set({ installed });
  return installed;
}

export async function refreshCatalog() {
  try {
    const r = await fetch(`${getApiBaseUrl()}/api/nexora/offline/regions`);
    if (!r.ok) throw new Error(`Offline catalogue unavailable (${r.status}).`);
    const d = await r.json();
    const catalog: CatalogEntry[] = OFFLINE_REGIONS.map((def) => {
      const row = (d.regions || []).find((x: any) => x?.id === def.id);
      const parsed = packManifestSchema.safeParse(row?.manifest);
      return {
        ...def,
        available: Boolean(row?.available && parsed.success),
        manifest: parsed.success ? parsed.data : null,
        reason: typeof row?.reason === "string" ? row.reason : undefined,
      };
    });
    set({ catalog, catalogError: "" });
  } catch (e) {
    set({
      catalogError:
        e instanceof Error && e.message.startsWith("Offline")
          ? e.message
          : "Offline catalogue unavailable. Connect to download a region.",
    });
  }
}

async function start() {
  if (state.started) return;
  set({ started: true });
  try {
    set({ preferOffline: (await AsyncStorage.getItem(PREF_KEY)) === "1" });
  } catch {
    /* default stays off */
  }
  if (!offlineSupported) return;
  const installed = scanInstalled();
  const first = Object.keys(installed)[0];
  if (first) await openMapPack(first);
  await refreshCatalog();
  // Keep the offline map page in step with the current online map document.
  if (first && !state.catalogError)
    downloadShell(first)
      .then(() => openMapPack(first))
      .catch(() => {
        /* keep the shell already on the device */
      });
}

export async function downloadRegion(id: string) {
  const entry = state.catalog?.find((c) => c.id === id);
  if (!entry?.available || !entry.manifest) {
    set({
      errors: {
        ...state.errors,
        [id]: entry?.reason || "This region is not available to download yet.",
      },
    });
    return;
  }
  if (aborts.has(id)) return;
  const controller = new AbortController();
  aborts.set(id, controller);
  if (state.mapPack?.regionId === id) {
    reader?.close();
    reader = null;
    set({ mapPack: null });
  }
  set({
    progress: { ...state.progress, [id]: 0 },
    errors: { ...state.errors, [id]: "" },
  });
  try {
    await downloadPack(
      entry,
      entry.manifest,
      (f) => set({ progress: { ...state.progress, [id]: f } }),
      controller.signal,
    );
    scanInstalled();
    await openMapPack(id);
  } catch (e) {
    const cancelled = controller.signal.aborted;
    removePack(id);
    scanInstalled();
    set({
      errors: {
        ...state.errors,
        [id]: cancelled
          ? "Download cancelled."
          : e instanceof Error
            ? e.message
            : "Download failed.",
      },
    });
  } finally {
    aborts.delete(id);
    const { [id]: _, ...rest } = state.progress;
    set({ progress: rest });
  }
}

export function cancelDownload(id: string) {
  aborts.get(id)?.abort();
}

export function deleteRegion(id: string) {
  cancelDownload(id);
  if (state.mapPack?.regionId === id) {
    reader?.close();
    reader = null;
    set({ mapPack: null });
  }
  indexes.delete(id);
  removePack(id);
  scanInstalled();
}

export async function setPreferOffline(v: boolean) {
  set({ preferOffline: v });
  try {
    await AsyncStorage.setItem(PREF_KEY, v ? "1" : "0");
  } catch {
    /* preference stays for this session */
  }
}

/** Offline name search across installed packs. Empty when nothing is installed. */
export function searchOffline(query: string, near?: Coord): Place[] {
  const out: Place[] = [];
  for (const ix of indexes.values())
    out.push(...searchOfflineIndex(ix, query, near));
  return out.slice(0, 8);
}

export function useOfflineRegions() {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    start();
  }, []);
  return {
    ...s,
    refreshCatalog,
    download: downloadRegion,
    cancel: cancelDownload,
    remove: deleteRegion,
    setPreferOffline,
    search: searchOffline,
  };
}
