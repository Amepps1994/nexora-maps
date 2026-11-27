import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  OFFLINE_SHELL_ASSETS,
  buildOfflineMapHtml,
  isPmtilesV3,
  packManifestSchema,
  searchOfflineIndex,
} from "../shared/nexora/offline";
import { mapDocument } from "../server/nexora/map-document";
import * as pack from "../scripts/offline-region.mjs";

const index = {
  region: "london",
  entries: [
    ["Waterloo", "train_station", -0.1131, 51.5031],
    ["Waterloo Road", "major_road", -0.1095, 51.5],
    ["Big Ben", "attraction", -0.1246, 51.5007],
    ["St Pancras International", "train_station", -0.1263, 51.5306],
    ["Café Rouge", "restaurant", -0.12, 51.51],
  ] as [string, string, number, number][],
};

describe("offline search index", () => {
  it("ranks exact, then prefix, then word matches", () => {
    const r = searchOfflineIndex(index, "waterloo");
    expect(r.map((p) => p.name)).toEqual(["Waterloo", "Waterloo Road"]);
    expect(r[0].subtitle).toBe("Station · offline london pack");
    expect(r[0].source).toContain("OpenStreetMap");
  });
  it("matches inner words and ignores accents and case", () => {
    expect(searchOfflineIndex(index, "pancras")[0].name).toBe(
      "St Pancras International",
    );
    expect(searchOfflineIndex(index, "CAFE")[0].name).toBe("Café Rouge");
  });
  it("returns nothing for one character or no match", () => {
    expect(searchOfflineIndex(index, "w")).toEqual([]);
    expect(searchOfflineIndex(index, "zzzz")).toEqual([]);
  });
});

describe("offline map shell", () => {
  const assets = Object.fromEntries(
    OFFLINE_SHELL_ASSETS.map((a) => [a, `/*${a}*/</script>`]),
  ) as Record<(typeof OFFLINE_SHELL_ASSETS)[number], string>;
  const html = buildOfflineMapHtml(mapDocument, assets, {
    maxZoom: 14,
    bbox: [-0.51, 51.28, 0.33, 51.69],
  });
  it("inlines every asset and makes no server asset requests", () => {
    expect(html).not.toContain("/api/nexora/map-assets/");
    for (const a of OFFLINE_SHELL_ASSETS) expect(html).toContain(`/*${a}*/`);
    expect(html).not.toMatch(/\/\*leaflet\.js\*\/<\/script>/);
  });
  it("installs the tile hook the online document honours", () => {
    expect(mapDocument).toContain("window.nexoraTileLayer?window.nexoraTileLayer(L)");
    expect(html).toContain("window.nexoraTileLayer=function(L)");
    expect(html).toContain("OpenStreetMap");
  });
});

describe("pack builder", () => {
  it("writes PMTiles v3 that round-trips, with leaf directories", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nexora-pm-"));
    const tiles = [];
    // Scattered tiles with varied sizes defeat directory compression and force leaves.
    for (let x = 0; x < 300; x++)
      for (let y = 0; y < 300; y += 1 + ((x * 7 + y) % 3))
        tiles.push({ z: 12, x, y, data: gzipSync(Buffer.from(`${x}/${y}`.repeat(1 + ((x * y) % 5)))) });
    const file = path.join(dir, "t.pmtiles");
    pack.writeArchive(file, tiles, {
      tileCompression: 2,
      tileType: 1,
      minZoom: 12,
      maxZoom: 12,
      bbox: [-1, -1, 1, 1],
      json: { attribution: "x" },
      rootLimit: 400, // force leaf directories on this small fixture
      leafSize: 512,
    });
    expect(isPmtilesV3(readFileSync(file).subarray(0, 8))).toBe(true);
    const a = await pack.openArchive(file);
    expect(a.header.leafLength).toBeGreaterThan(0);
    const { gunzipSync } = await import("node:zlib");
    const [x, y] = [tiles[5000].x, tiles[5000].y];
    const hit = await a.tile(12, x, y);
    expect(hit).not.toBeNull();
    expect(gunzipSync(hit!).toString()).toBe(`${x}/${y}`.repeat(1 + ((x * y) % 5)));
    expect(await a.tile(12, 350, 350)).toBeNull();
    expect(await a.metadata()).toEqual({ attribution: "x" });
    a.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it("covers the London bbox and decodes named features", () => {
    const r = pack.tileRange([-0.5103, 51.2868, 0.334, 51.6919], 14);
    expect(r.x1 - r.x0).toBeGreaterThan(30);
    expect(r.y1 - r.y0).toBeGreaterThanOrEqual(30);
    expect(pack.dedupeIndex([
      ["Oxford Street", "major_road", -0.158, 51.5134],
      ["Oxford Street", "major_road", -0.1581, 51.5135],
    ])).toHaveLength(1);
  });
});

describe("offline region API", () => {
  let server: Server;
  let base = "";
  let dir = "";
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "nexora-off-"));
    process.env.NEXORA_OFFLINE_DIR = dir;
    const london = path.join(dir, "london");
    mkdirSync(london);
    const tiles = Buffer.concat([Buffer.from("PMTiles"), Buffer.from([3]), Buffer.alloc(200)]);
    const search = Buffer.from(JSON.stringify({ version: 1, region: "london", attribution: "a", entries: [] }));
    writeFileSync(path.join(london, "tiles.pmtiles"), tiles);
    writeFileSync(path.join(london, "search.json"), search);
    const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    writeFileSync(
      path.join(london, "manifest.json"),
      JSON.stringify({
        version: 1, region: "london", name: "Greater London", bbox: [-0.51, 51.28, 0.33, 51.69],
        maxZoom: 14, builtAt: "2026-11-27T00:00:00.000Z", source: "20261126.pmtiles",
        licence: "ODbL-1.0", attribution: "© OpenStreetMap contributors (ODbL) · Protomaps",
        files: { "tiles.pmtiles": { bytes: tiles.length, sha256: sha(tiles) }, "search.json": { bytes: search.length, sha256: sha(search) } },
        searchEntries: 0,
      }),
    );
    const { registerOfflineRoutes } = await import("../server/nexora/offline");
    const app = express();
    registerOfflineRoutes(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server?.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.NEXORA_OFFLINE_DIR;
  });
  it("lists the London pack with a valid manifest", async () => {
    const d = await (await fetch(`${base}/api/nexora/offline/regions`)).json();
    expect(d.regions[0].id).toBe("london");
    expect(d.regions[0].available).toBe(true);
    expect(packManifestSchema.parse(d.regions[0].manifest).licence).toBe("ODbL-1.0");
  });
  it("serves byte ranges so downloads can resume", async () => {
    const r = await fetch(`${base}/api/nexora/offline/regions/london/tiles.pmtiles`, { headers: { Range: "bytes=0-7" } });
    expect(r.status).toBe(206);
    expect(isPmtilesV3(new Uint8Array(await r.arrayBuffer()))).toBe(true);
  });
  it("refuses unknown regions, files and traversal", async () => {
    for (const p of ["paris/tiles.pmtiles", "london/..%2F..%2Fpackage.json", "london/other.bin"])
      expect((await fetch(`${base}/api/nexora/offline/regions/${p}`)).status).toBe(404);
  });
  it("reports a pack as unavailable when a file does not match its manifest", async () => {
    writeFileSync(path.join(dir, "london", "search.json"), "{}");
    const d = await (await fetch(`${base}/api/nexora/offline/regions`)).json();
    expect(d.regions[0].available).toBe(false);
    expect(d.regions[0].reason).toContain("offline-region.mjs");
  });
});
