#!/usr/bin/env node
// Builds an offline region pack from a Protomaps daily basemap build (OpenStreetMap, ODbL).
//
//   node scripts/offline-region.mjs build london [--source <url-or-file>] [--out <dir>]
//   node scripts/offline-region.mjs verify london [--out <dir>]
//
// Output: <out>/<region>/{tiles.pmtiles, search.json, manifest.json}, served by
// server/nexora/offline.ts. Default out: server/nexora/offline-data.
// Only the bbox's tiles are fetched (HTTP range requests, low concurrency) once per build.
// The app never contacts tile.openstreetmap.org or build.protomaps.com itself.
// No dependencies beyond Node 20+.
import { createHash } from "node:crypto";
import { mkdirSync, openSync, readSync, closeSync, writeFileSync, renameSync, statSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const REGIONS = {
  london: { name: "Greater London", bbox: [-0.5103, 51.2868, 0.334, 51.6919], minZoom: 0, maxZoom: 14 },
};
const UA = "NEXORA-Maps-offline-pack-builder/0.1 (one-off regional extract)";
const LICENCE = "ODbL-1.0";
const ATTRIBUTION = "© OpenStreetMap contributors (ODbL) · Protomaps";

// ---------- PMTiles v3 primitives ----------
function rotate(n, x, y, rx, ry) {
  if (ry === 0) return rx !== 0 ? [n - 1 - y, n - 1 - x] : [y, x];
  return [x, y];
}
export function zxyToTileId(z, x, y) {
  let acc = ((1 << z) * (1 << z) - 1) / 3;
  let a = z - 1;
  let tx = x, ty = y;
  for (let s = 1 << a; s > 0; s >>= 1) {
    const rx = tx & s, ry = ty & s;
    acc += ((3 * rx) ^ ry) * (1 << a);
    [tx, ty] = rotate(s, tx, ty, rx, ry);
    a--;
  }
  return acc;
}
function readVarint(buf, st) {
  let result = 0, shift = 1, b;
  do {
    b = buf[st.pos++];
    result += (b & 0x7f) * shift;
    shift *= 128;
  } while (b & 0x80);
  return result;
}
function writeVarint(out, n) {
  while (n >= 0x80) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}
const u64 = (b, o) => Number(b.readBigUInt64LE(o));
export function parseHeader(b) {
  if (b.subarray(0, 7).toString("latin1") !== "PMTiles" || b[7] !== 3) throw new Error("Not a PMTiles v3 archive");
  return {
    rootOffset: u64(b, 8), rootLength: u64(b, 16), metadataOffset: u64(b, 24), metadataLength: u64(b, 32),
    leafOffset: u64(b, 40), leafLength: u64(b, 48), dataOffset: u64(b, 56), dataLength: u64(b, 64),
    internalCompression: b[97], tileCompression: b[98], tileType: b[99], minZoom: b[100], maxZoom: b[101],
  };
}
const decompress = (buf, c) => (c === 2 ? gunzipSync(buf) : c === 1 || c === 0 ? buf : (() => { throw new Error(`Unsupported compression ${c}`); })());
export function parseDirectory(buf) {
  const st = { pos: 0 };
  const n = readVarint(buf, st);
  const e = Array.from({ length: n }, () => ({ tileId: 0, runLength: 0, length: 0, offset: 0 }));
  let last = 0;
  for (const x of e) { last += readVarint(buf, st); x.tileId = last; }
  for (const x of e) x.runLength = readVarint(buf, st);
  for (const x of e) x.length = readVarint(buf, st);
  for (let i = 0; i < n; i++) {
    const v = readVarint(buf, st);
    e[i].offset = v === 0 && i > 0 ? e[i - 1].offset + e[i - 1].length : v - 1;
  }
  return e;
}
export function serializeDirectory(entries) {
  const out = [];
  writeVarint(out, entries.length);
  let last = 0;
  for (const e of entries) { writeVarint(out, e.tileId - last); last = e.tileId; }
  for (const e of entries) writeVarint(out, e.runLength);
  for (const e of entries) writeVarint(out, e.length);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    writeVarint(out, i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length ? 0 : e.offset + 1);
  }
  return Buffer.from(out);
}
function findEntry(entries, tileId) {
  let lo = 0, hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = tileId - entries[mid].tileId;
    if (c > 0) lo = mid + 1;
    else if (c < 0) hi = mid - 1;
    else return entries[mid];
  }
  if (hi >= 0) {
    const e = entries[hi];
    if (e.runLength === 0) return e; // leaf pointer
    if (tileId - e.tileId < e.runLength) return e;
  }
  return null;
}

// ---------- archive reader over HTTP ranges or a local file ----------
function makeSource(src) {
  if (/^https?:\/\//.test(src)) {
    return {
      async read(offset, length) {
        for (let attempt = 0; ; attempt++) {
          try {
            const r = await fetch(src, { headers: { Range: `bytes=${offset}-${offset + length - 1}`, "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
            if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
            const b = Buffer.from(await r.arrayBuffer());
            return r.status === 200 ? b.subarray(offset, offset + length) : b;
          } catch (e) {
            if (attempt >= 3) throw e;
            await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
          }
        }
      },
    };
  }
  const fd = openSync(src, "r");
  return {
    async read(offset, length) {
      const b = Buffer.alloc(length);
      const n = readSync(fd, b, 0, length, offset);
      return b.subarray(0, n);
    },
    close: () => closeSync(fd),
  };
}
export async function openArchive(src) {
  const source = makeSource(src);
  const head = await source.read(0, 16384);
  const h = parseHeader(head);
  const root = parseDirectory(decompress(head.subarray(h.rootOffset, h.rootOffset + h.rootLength), h.internalCompression));
  const leafCache = new Map();
  async function leaf(offset, length) {
    const key = `${offset}:${length}`;
    if (!leafCache.has(key)) leafCache.set(key, source.read(h.leafOffset + offset, length).then((b) => parseDirectory(decompress(b, h.internalCompression))));
    return leafCache.get(key);
  }
  return {
    header: h,
    async metadata() {
      if (!h.metadataLength) return {};
      return JSON.parse(decompress(await source.read(h.metadataOffset, h.metadataLength), h.internalCompression).toString("utf8"));
    },
    /** Raw (still tile-compressed) bytes, or null when the tile is absent. */
    async tile(z, x, y) {
      const id = zxyToTileId(z, x, y);
      let dir = root;
      for (let depth = 0; depth < 4; depth++) {
        const e = findEntry(dir, id);
        if (!e) return null;
        if (e.runLength > 0) return source.read(h.dataOffset + e.offset, e.length);
        dir = await leaf(e.offset, e.length);
      }
      return null;
    },
    close: () => source.close?.(),
  };
}

// ---------- writer ----------
export function writeArchive(file, tiles, meta) {
  // tiles: [{z,x,y,data:Buffer (tile-compressed)}]
  const withIds = tiles.map((t) => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y) })).sort((a, b) => a.tileId - b.tileId);
  const seen = new Map();
  const chunks = [];
  let dataLen = 0;
  const entries = [];
  for (const t of withIds) {
    const hash = createHash("sha256").update(t.data).digest("hex");
    let offset = seen.get(hash);
    if (offset === undefined) {
      offset = dataLen;
      seen.set(hash, offset);
      chunks.push(t.data);
      dataLen += t.data.length;
    }
    const prev = entries[entries.length - 1];
    if (prev && prev.offset === offset && prev.tileId + prev.runLength === t.tileId) prev.runLength++;
    else entries.push({ tileId: t.tileId, offset, length: t.data.length, runLength: 1 });
  }
  let root = gzipSync(serializeDirectory(entries));
  let leaves = Buffer.alloc(0);
  const rootLimit = meta.rootLimit || 16384; // spec: header + root fit in the first 16 KiB
  if (127 + root.length > rootLimit) {
    for (let size = meta.leafSize || 4096; ; size *= 2) {
      const rootEntries = [], leafBufs = [];
      let off = 0;
      for (let i = 0; i < entries.length; i += size) {
        const b = gzipSync(serializeDirectory(entries.slice(i, i + size)));
        rootEntries.push({ tileId: entries[i].tileId, offset: off, length: b.length, runLength: 0 });
        leafBufs.push(b);
        off += b.length;
      }
      root = gzipSync(serializeDirectory(rootEntries));
      leaves = Buffer.concat(leafBufs);
      if (127 + root.length <= rootLimit) break;
    }
  }
  const metadata = gzipSync(Buffer.from(JSON.stringify(meta.json)));
  const h = Buffer.alloc(127);
  h.write("PMTiles", 0, "latin1");
  h[7] = 3;
  const rootOffset = 127, metadataOffset = rootOffset + root.length, leafOffset = metadataOffset + metadata.length, dataOffset = leafOffset + leaves.length;
  [rootOffset, root.length, metadataOffset, metadata.length, leafOffset, leaves.length, dataOffset, dataLen, withIds.length, entries.length, seen.size]
    .forEach((v, i) => h.writeBigUInt64LE(BigInt(v), 8 + i * 8));
  h[96] = 1; // clustered
  h[97] = 2; // internal gzip
  h[98] = meta.tileCompression;
  h[99] = meta.tileType;
  h[100] = meta.minZoom;
  h[101] = meta.maxZoom;
  const [w, s, e, n] = meta.bbox;
  h.writeInt32LE(Math.round(w * 1e7), 102);
  h.writeInt32LE(Math.round(s * 1e7), 106);
  h.writeInt32LE(Math.round(e * 1e7), 110);
  h.writeInt32LE(Math.round(n * 1e7), 114);
  h[118] = Math.min(12, meta.maxZoom);
  h.writeInt32LE(Math.round(((w + e) / 2) * 1e7), 119);
  h.writeInt32LE(Math.round(((s + n) / 2) * 1e7), 123);
  writeFileSync(file, Buffer.concat([h, root, metadata, leaves, ...chunks]));
}

// ---------- tiny Mapbox Vector Tile reader (names + first point only) ----------
function pbfFields(buf, fn) {
  const st = { pos: 0 };
  while (st.pos < buf.length) {
    const key = readVarint(buf, st), field = key >> 3, wire = key & 7;
    if (wire === 0) fn(field, readVarint(buf, st), wire);
    else if (wire === 2) { const len = readVarint(buf, st); fn(field, buf.subarray(st.pos, st.pos + len), wire); st.pos += len; }
    else if (wire === 1) { fn(field, buf.subarray(st.pos, st.pos + 8), wire); st.pos += 8; }
    else if (wire === 5) { fn(field, buf.subarray(st.pos, st.pos + 4), wire); st.pos += 4; }
    else throw new Error(`Bad wire type ${wire}`);
  }
}
const packed = (buf) => { const st = { pos: 0 }, out = []; while (st.pos < buf.length) out.push(readVarint(buf, st)); return out; };
const zz = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);
export function decodeMvt(buf) {
  const layers = [];
  pbfFields(buf, (f, v) => {
    if (f !== 3) return;
    const layer = { name: "", extent: 4096, keys: [], values: [], features: [] };
    pbfFields(v, (lf, lv) => {
      if (lf === 1) layer.name = lv.toString("utf8");
      else if (lf === 3) layer.keys.push(lv.toString("utf8"));
      else if (lf === 4) {
        let val = null;
        pbfFields(lv, (vf, vv) => {
          if (vf === 1) val = vv.toString("utf8");
          else if (vf === 2) val = vv.readFloatLE(0);
          else if (vf === 3) val = vv.readDoubleLE(0);
          else if (vf === 4 || vf === 5) val = vv;
          else if (vf === 6) val = zz(vv);
          else if (vf === 7) val = Boolean(vv);
        });
        layer.values.push(val);
      } else if (lf === 2) layer.features.push(lv);
      else if (lf === 5) layer.extent = lv;
    });
    layer.features = layer.features.map((fb) => {
      const feat = { tags: [], geom: [], type: 0 };
      pbfFields(fb, (ff, fv, wire) => {
        if (ff === 2) feat.tags = wire === 2 ? packed(fv) : [fv];
        else if (ff === 3) feat.type = fv;
        else if (ff === 4) feat.geom = wire === 2 ? packed(fv) : [fv];
      });
      const props = {};
      for (let i = 0; i + 1 < feat.tags.length; i += 2) props[layer.keys[feat.tags[i]]] = layer.values[feat.tags[i + 1]];
      const first = feat.geom.length >= 3 && (feat.geom[0] & 7) === 1 ? [zz(feat.geom[1]), zz(feat.geom[2])] : null;
      return { props, type: feat.type, first };
    });
    layers.push(layer);
  });
  return layers;
}
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
const tileToLonLat = (z, x, y, px, py, extent) => {
  const n = 2 ** z, fx = x + px / extent, fy = y + py / extent;
  return [(fx / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * fy) / n))) * 180) / Math.PI];
};
export function tileRange(bbox, z) {
  const [w, s, e, n] = bbox;
  return { x0: lon2x(w, z), x1: lon2x(e, z), y0: lat2y(n, z), y1: lat2y(s, z) };
}

const STREET_KINDS = new Set(["highway", "major_road", "medium_road", "minor_road"]);
export function indexEntriesFromTile(z, x, y, layers, bbox) {
  const out = [];
  for (const layer of layers) {
    if (!["places", "pois", "roads", "transit"].includes(layer.name)) continue;
    for (const f of layer.features) {
      const name = f.props["name:en"] || f.props.name;
      if (typeof name !== "string" || !name.trim() || !f.first) continue;
      const kind = String(f.props.kind_detail && layer.name === "pois" ? f.props.kind_detail : f.props.kind || layer.name);
      if (layer.name === "roads" && !STREET_KINDS.has(String(f.props.kind))) continue;
      const [lon, lat] = tileToLonLat(z, x, y, f.first[0], f.first[1], layer.extent);
      if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      out.push([name.trim(), layer.name === "roads" ? String(f.props.kind) : kind, +lon.toFixed(5), +lat.toFixed(5)]);
    }
  }
  return out;
}
export function dedupeIndex(entries) {
  const seen = new Set(), out = [];
  for (const e of entries) {
    // Streets repeat across tiles: one entry per name per ~1 km cell.
    const key = `${e[0].toLowerCase()}|${e[1]}|${Math.round(e[2] * 70)}|${Math.round(e[3] * 110)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------- CLI ----------
async function latestBuild() {
  for (let back = 1; back <= 10; back++) {
    const d = new Date(Date.now() - back * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://build.protomaps.com/${d}.pmtiles`;
    try {
      const r = await fetch(url, { headers: { Range: "bytes=0-126", "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
      if (r.status === 206) return url;
    } catch { /* try an earlier day */ }
  }
  throw new Error("No Protomaps daily build found in the last 10 days. Pass --source <url-or-file>.");
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

async function build(id, args) {
  const region = REGIONS[id];
  if (!region) throw new Error(`Unknown region ${id}. Known: ${Object.keys(REGIONS).join(", ")}`);
  const outDir = path.resolve(args.out || "server/nexora/offline-data", id);
  mkdirSync(outDir, { recursive: true });
  const source = args.source || (await latestBuild());
  console.log(`[offline] source ${source}`);
  const archive = await openArchive(source);
  if (archive.header.tileType !== 1) throw new Error("Source is not a vector (MVT) archive.");
  const srcMeta = await archive.metadata();
  const jobs = [];
  for (let z = region.minZoom; z <= region.maxZoom; z++) {
    const r = tileRange(region.bbox, z);
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) jobs.push({ z, x, y });
  }
  console.log(`[offline] fetching ${jobs.length} tiles z${region.minZoom}-${region.maxZoom}`);
  const tiles = [];
  let index = [];
  let done = 0;
  await pool(jobs, 6, async (t) => {
    const raw = await archive.tile(t.z, t.x, t.y);
    if (raw && raw.length) {
      const plain = decompress(raw, archive.header.tileCompression);
      tiles.push({ ...t, data: gzipSync(plain, { level: 9 }) });
      if (t.z >= 13) index.push(...indexEntriesFromTile(t.z, t.x, t.y, decodeMvt(plain), region.bbox));
    }
    if (++done % 250 === 0) console.log(`[offline] ${done}/${jobs.length}`);
  });
  archive.close();
  index = dedupeIndex(index);
  const builtAt = new Date().toISOString();
  const sourceName = path.basename(source.split("?")[0]);
  const tmp = path.join(outDir, "tiles.pmtiles.tmp");
  writeArchive(tmp, tiles, {
    tileCompression: 2, tileType: 1, minZoom: region.minZoom, maxZoom: region.maxZoom, bbox: region.bbox,
    json: { ...srcMeta, name: `NEXORA ${region.name}`, attribution: ATTRIBUTION, license: LICENCE, "nexora:source": sourceName, "nexora:bbox": region.bbox, "nexora:builtAt": builtAt },
  });
  renameSync(tmp, path.join(outDir, "tiles.pmtiles"));
  writeFileSync(path.join(outDir, "search.json"), JSON.stringify({ version: 1, region: id, attribution: ATTRIBUTION, entries: index }));
  const files = {};
  for (const f of ["tiles.pmtiles", "search.json"]) files[f] = { bytes: statSync(path.join(outDir, f)).size, sha256: sha256File(path.join(outDir, f)) };
  const manifest = { version: 1, region: id, name: region.name, bbox: region.bbox, maxZoom: region.maxZoom, builtAt, source: sourceName, licence: LICENCE, attribution: ATTRIBUTION, files, searchEntries: index.length };
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`[offline] wrote ${outDir}: ${tiles.length} tiles, ${(files["tiles.pmtiles"].bytes / 1e6).toFixed(1)} MB; ${index.length} search entries`);
  return manifest;
}

async function verify(id, args) {
  const dir = path.resolve(args.out || "server/nexora/offline-data", id);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  for (const [f, m] of Object.entries(manifest.files)) {
    const p = path.join(dir, f);
    if (!existsSync(p) || statSync(p).size !== m.bytes || sha256File(p) !== m.sha256) throw new Error(`${f} does not match manifest`);
  }
  const a = await openArchive(path.join(dir, "tiles.pmtiles"));
  const z = Math.min(14, manifest.maxZoom);
  const r = tileRange(manifest.bbox, z);
  const cx = (r.x0 + r.x1) >> 1, cy = (r.y0 + r.y1) >> 1;
  const t = await a.tile(z, cx, cy);
  if (!t) throw new Error(`Centre tile z${z}/${cx}/${cy} missing`);
  const layers = decodeMvt(decompress(t, a.header.tileCompression)).map((l) => `${l.name}(${l.features.length})`);
  a.close();
  const idx = JSON.parse(readFileSync(path.join(dir, "search.json"), "utf8"));
  const result = { ok: true, region: id, builtAt: manifest.builtAt, source: manifest.source, files: manifest.files, centreTile: `${z}/${cx}/${cy}`, centreLayers: layers, searchEntries: idx.entries.length, sample: idx.entries.filter((e) => /^(Big Ben|Waterloo|Oxford Street|Hyde Park)/.test(e[0])).slice(0, 8) };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const [cmd, id = "london", ...rest] = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
  (cmd === "build" ? build(id, args) : cmd === "verify" ? verify(id, args) : Promise.reject(new Error("Usage: offline-region.mjs build|verify <region> [--source url|file] [--out dir]")))
    .catch((e) => { console.error(`[offline] ${e.message}`); process.exit(1); });
}
