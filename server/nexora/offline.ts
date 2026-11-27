import type { Express } from "express";
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  OFFLINE_PACK_FILES,
  OFFLINE_REGIONS,
  OFFLINE_SHELL_ASSETS,
  offlineRegionId,
  packManifestSchema,
  type PackManifest,
} from "../../shared/nexora/offline";

/** Where scripts/offline-region.mjs writes packs: <dir>/<region>/{manifest.json,tiles.pmtiles,search.json}. */
export const offlineDataDir = () =>
  path.resolve(process.env.NEXORA_OFFLINE_DIR || "server/nexora/offline-data");

function readManifest(id: string): PackManifest | null {
  const file = path.join(offlineDataDir(), id, "manifest.json");
  if (!existsSync(file)) return null;
  try {
    const manifest = packManifestSchema.parse(
      JSON.parse(readFileSync(file, "utf8")),
    );
    // A manifest only counts if every file it lists is really on disk at that size.
    for (const name of OFFLINE_PACK_FILES) {
      const meta = manifest.files[name];
      const p = path.join(offlineDataDir(), id, name);
      if (!meta || !existsSync(p) || statSync(p).size !== meta.bytes)
        return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

export function registerOfflineRoutes(app: Express) {
  app.get("/api/nexora/offline/regions", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      regions: OFFLINE_REGIONS.map((r) => {
        const manifest = readManifest(r.id);
        return {
          ...r,
          available: Boolean(manifest),
          manifest,
          reason: manifest
            ? undefined
            : "Pack not built on this server yet. Run: node scripts/offline-region.mjs build " +
              r.id,
        };
      }),
      shellAssets: OFFLINE_SHELL_ASSETS,
    });
  });
  app.get("/api/nexora/offline/regions/:id/:file", (req, res) => {
    const id = offlineRegionId.safeParse(req.params.id);
    const file = String(req.params.file);
    const allowed = [...OFFLINE_PACK_FILES, "manifest.json"] as string[];
    if (!id.success || !allowed.includes(file)) {
      res.status(404).json({ error: "Unknown offline region file." });
      return;
    }
    if (!readManifest(id.data)) {
      res.status(404).json({ error: "Offline region is not built." });
      return;
    }
    // sendFile supports Range and ETag, so interrupted downloads can resume.
    res.sendFile(path.join(offlineDataDir(), id.data, file), {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": file.endsWith(".pmtiles")
          ? "application/vnd.pmtiles"
          : "application/json",
      },
    });
  });
}
