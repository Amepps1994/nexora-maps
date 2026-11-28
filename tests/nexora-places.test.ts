/**
 * Live nearby places: Overpass query building, element mapping, and the
 * /api/nexora/places route (cache, validation, mirror fallback, failures).
 * Overpass is mocked; nothing leaves the test process.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/_core/app";
import { overpassUrls, DEFAULT_OVERPASS_URLS } from "../server/nexora/places";
import {
  CHIP_CATEGORIES,
  PLACE_CATEGORIES,
  formatDistance,
  isPlaceCategory,
  mapOverpassElements,
  nearbyCell,
  nearestPlaces,
  overpassQuery,
} from "../shared/nexora/places";

// Shape of a real Overpass `out center tags` reply (trimmed).
const overpassReply = {
  version: 0.6,
  generator: "Overpass API",
  elements: [
    {
      type: "way",
      id: 4256245,
      center: { lat: 51.5076, lon: -0.0994 },
      tags: {
        name: "Tate Modern",
        tourism: "museum",
        "addr:street": "Bankside",
      },
    },
    {
      type: "node",
      id: 111,
      lat: 51.5194,
      lon: -0.127,
      tags: { name: "British Museum", tourism: "museum" },
    },
    // Duplicate feature for the same place (node + building): kept once.
    {
      type: "node",
      id: 112,
      lat: 51.51941,
      lon: -0.12701,
      tags: { name: "British Museum", tourism: "museum" },
    },
    // No name, no coordinates, junk: all dropped.
    {
      type: "node",
      id: 113,
      lat: 51.5,
      lon: -0.1,
      tags: { tourism: "museum" },
    },
    { type: "way", id: 114, tags: { name: "Nowhere", tourism: "gallery" } },
    { type: "bogus" },
    {
      type: "node",
      id: 115,
      lat: 51.5081,
      lon: -0.0759,
      tags: { name: "Tower Bridge", amenity: "theatre" },
    },
  ],
};

describe("shared places helpers", () => {
  it("knows its categories and chips", () => {
    expect(isPlaceCategory("culture")).toBe(true);
    expect(isPlaceCategory("toString")).toBe(false);
    expect(isPlaceCategory(undefined)).toBe(false);
    for (const c of CHIP_CATEGORIES)
      expect(PLACE_CATEGORIES[c].filters.length).toBeGreaterThan(0);
  });

  it("builds a bounded Overpass query around the point", () => {
    const q = overpassQuery("parks", [-0.1, 51.5]);
    expect(q).toMatch(/^\[out:json\]\[timeout:\d+\];/);
    expect(q).toContain(
      'nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"](around:3000,51.5,-0.1);',
    );
    expect(q).toMatch(/out center tags \d+;$/);
  });

  it("snaps points to ~500 m cells", () => {
    expect(nearbyCell([-0.1238, 51.5308])).toEqual([-0.125, 51.53]);
    expect(nearbyCell([-0.1236, 51.5309])).toEqual(
      nearbyCell([-0.1238, 51.5308]),
    );
  });

  it("maps elements to named, de-duplicated places", () => {
    const entries = mapOverpassElements("culture", overpassReply);
    expect(entries.map((e) => e.name)).toEqual([
      "Tate Modern",
      "British Museum",
      "Tower Bridge",
    ]);
    expect(entries[0]).toMatchObject({
      id: "osm-way-4256245",
      coordinate: [-0.0994, 51.5076],
      category: "Culture",
      kind: "Museum",
      area: "Bankside",
      source: "© OpenStreetMap contributors",
    });
    expect(entries[2].kind).toBe("Theatre");
    expect(() => mapOverpassElements("culture", { nope: 1 })).toThrow(
      TypeError,
    );
  });

  it("sorts by distance and writes a readable subtitle", () => {
    const entries = mapOverpassElements("culture", overpassReply);
    const near = nearestPlaces(entries, [-0.1269, 51.5194], 2);
    expect(near.map((p) => p.name)).toEqual(["British Museum", "Tate Modern"]);
    expect(near[0].subtitle).toBe("Museum · 10 m");
    expect(near[1].subtitle).toMatch(/^Museum · Bankside · 2\.\d km$/);
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(12_345)).toBe("12 km");
  });

  it("reads Overpass endpoints from the environment", () => {
    expect(overpassUrls({})).toEqual(DEFAULT_OVERPASS_URLS);
    expect(overpassUrls({ NEXORA_OVERPASS_URL: "off" })).toEqual([]);
    expect(
      overpassUrls({
        NEXORA_OVERPASS_URL: "https://a/x, ftp://b, https://c/y",
      }),
    ).toEqual(["https://a/x", "https://c/y"]);
  });
});

describe("/api/nexora/places", () => {
  const realFetch = globalThis.fetch;
  const servers: Server[] = [];
  let upstream: { url: string; body: string }[] = [];
  let reply: (url: string) => Response | Promise<Response> = () =>
    new Response(JSON.stringify(overpassReply), { status: 200 });

  beforeAll(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith("http://127.0.0.1")) return realFetch(input, init);
        upstream.push({ url, body: String(init?.body ?? "") });
        return reply(url);
      },
    );
  });
  afterEach(() => {
    upstream = [];
    reply = () => new Response(JSON.stringify(overpassReply), { status: 200 });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  });

  async function listen() {
    const s = createApp({ places: { spacingMs: 0, env: {} } }).listen(0);
    await new Promise<void>((r) => s.once("listening", r));
    servers.push(s);
    const base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    return (path: string) => realFetch(`${base}${path}`);
  }

  it("returns live places, closest first, and caches the cell", async () => {
    const call = await listen();
    const r = await call(
      "/api/nexora/places?category=culture&lat=51.5194&lon=-0.1269",
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.attribution).toBe("© OpenStreetMap contributors");
    expect(body.places[0].name).toBe("British Museum");
    expect(upstream).toHaveLength(1);
    expect(upstream[0].url).toBe(DEFAULT_OVERPASS_URLS[0]);
    expect(decodeURIComponent(upstream[0].body)).toContain(
      '["tourism"~"^(museum|gallery|attraction)$"]',
    );
    // Same ~500 m cell: answered from cache, distances from the new point.
    const again = await (
      await call("/api/nexora/places?category=culture&lat=51.5195&lon=-0.1268")
    ).json();
    expect(again.places[0].name).toBe("British Museum");
    expect(upstream).toHaveLength(1);
  });

  it("rejects bad input without calling Overpass", async () => {
    const call = await listen();
    for (const q of [
      "category=casinos&lat=51.5&lon=-0.1",
      "category=culture&lat=91&lon=0",
      "category=culture&lat=abc&lon=0",
      "category=culture",
    ]) {
      const r = await call(`/api/nexora/places?${q}`);
      expect(r.status).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });

  it("falls back to the mirror when the main instance fails", async () => {
    const call = await listen();
    reply = (url) =>
      url === DEFAULT_OVERPASS_URLS[0]
        ? new Response("busy", { status: 504 })
        : new Response(JSON.stringify(overpassReply), { status: 200 });
    const r = await call("/api/nexora/places?category=parks&lat=51.5&lon=-0.1");
    expect(r.status).toBe(200);
    expect(upstream.map((u) => u.url)).toEqual(DEFAULT_OVERPASS_URLS);
  });

  it("answers 503 with a friendly error when every instance fails", async () => {
    const call = await listen();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = () => new Response("rate limited", { status: 429 });
    const r = await call("/api/nexora/places?category=food&lat=51.5&lon=-0.1");
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/busy/);
    const line = JSON.parse(String(warn.mock.calls.at(-1)?.[0]));
    expect(line).toMatchObject({
      event: "provider_failure",
      provider: "places",
      class: "rate_limited",
    });
    expect(JSON.stringify(line)).not.toContain("51.5");
    warn.mockRestore();
  });

  it("answers 502 on a malformed reply", async () => {
    const call = await listen();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = () => new Response(JSON.stringify({ nope: true }), { status: 200 });
    const r = await call(
      "/api/nexora/places?category=stations&lat=51.5&lon=-0.1",
    );
    expect(r.status).toBe(502);
    warn.mockRestore();
  });
});
