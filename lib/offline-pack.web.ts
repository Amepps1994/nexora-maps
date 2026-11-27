// Web preview: offline packs need on-device storage, which only the Android/iOS app has.
import type {
  OfflineRegionDef,
  OfflineSearchIndex,
  PackManifest,
} from "@/shared/nexora/offline";

export const offlineSupported = false;
const unsupported = () => {
  throw new Error("Offline regions are available in the Android and iOS app.");
};
export const packBaseUrl = () => "";
export const readInstalled = (_id: string): PackManifest | null => null;
export const freeBytes = () => null;
export const downloadShell = async (_id: string, _signal?: AbortSignal) =>
  unsupported();
export const downloadPack = async (
  _r: OfflineRegionDef,
  _m: PackManifest,
  _p: (f: number) => void,
  _s?: AbortSignal,
) => unsupported();
export const removePack = (_id: string) => {};
export const loadSearchIndex = async (
  _id: string,
): Promise<OfflineSearchIndex> => unsupported() as never;
export const loadOfflineMapHtml = async (
  _r: OfflineRegionDef,
): Promise<string> => unsupported() as never;
export const openTileReader = (_id: string) => ({
  read: (_o: number, _l: number): string => unsupported() as never,
  close: () => {},
});
export type TileReader = ReturnType<typeof openTileReader>;
