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
import {
  overpassUrls,
  DEFAULT_OVERPASS_URLS,
  buildNearbyRequest,
  placesFallbackDailyBudget,
  resolvePlacesFallback,
  type PlacesOptions,
} from "../server/nexora/places";
import {
  CHIP_CATEGORIES,
  PLACE_CATEGORIES,
  formatDistance,
  isPlaceCategory,
  mapLocationIqNearby,
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

// Shape of a LocationIQ Nearby reply (trimmed): lat/lon are strings.
const locationIqReply = [
  {
    place_id: "331",
    osm_type: "way",
    osm_id: "4256245",
    lat: "51.5076",
    lon: "-0.0994",
    class: "tourism",
    type: "museum",
    name: "Tate Modern",
    display_name: "Tate Modern, Bankside, London",
    address: { name: "Tate Modern", road: "Bankside", city: "London" },
    distance: 12,
  },
  {
    place_id: "332",
    osm_type: "node",
    osm_id: "111",
    lat: "51.5194",
    lon: "-0.127",
    class: "tourism",
    type: "museum",
    name: "",
    display_name: "British Museum, Great Russell Street, London",
    address: { suburb: "Bloomsbury" },
  },
  { place_id: "333", lat: "x", lon: "y", name: "Broken" },
  { place_id: "334", lat: "51.5", lon: "-0.1" }, // no name at all
];

const LIQ_ENV = {
  NEXORA_GEOCODER_PROVIDER: "locationiq",
  NEXORA_GEOCODER_KEY: "pk.test-key",
};

describe("LocationIQ Nearby fallback helpers", () => {
  it("is configured only with a LocationIQ key, and can be switched off", () => {
    expect(resolvePlacesFallback({})).toBeNull();
    expect(
      resolvePlacesFallback({ ...LIQ_ENV, NEXORA_PLACES_FALLBACK: "off" }),
    ).toBeNull();
    expect(
      resolvePlacesFallback({
        NEXORA_GEOCODER_URL: "https://geo.example/search",
        NEXORA_GEOCODER_KEY: "k",
      }),
    ).toBeNull();
    const fb = resolvePlacesFallback(LIQ_ENV)!;
    expect(fb.base.toString()).toBe("https://eu1.locationiq.com/v1/nearby");
    expect(fb.attribution).toMatch(/LocationIQ/);
  });

  it("builds a bounded nearby request for the category", () => {
    const url = new URL(
      buildNearbyRequest(resolvePlacesFallback(LIQ_ENV)!, "food", [
        -0.13, 51.505,
      ]),
    );
    expect(url.searchParams.get("tag")).toBe(
      "amenity:restaurant,amenity:cafe,amenity:fast_food,amenity:pub",
    );
    expect(url.searchParams.get("radius")).toBe("1200");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("lat")).toBe("51.505");
    expect(url.searchParams.get("lon")).toBe("-0.13");
  });

  it("keeps a separate daily budget under the free plan", () => {
    expect(placesFallbackDailyBudget({})).toBe(800);
    expect(
      placesFallbackDailyBudget({ NEXORA_PLACES_FALLBACK_DAILY_BUDGET: "50" }),
    ).toBe(50);
    expect(
      placesFallbackDailyBudget({ NEXORA_PLACES_FALLBACK_DAILY_BUDGET: "-1" }),
    ).toBe(800);
  });

  it("maps nearby results like Overpass elements", () => {
    const entries = mapLocationIqNearby("culture", locationIqReply);
    expect(entries.map((e) => e.name)).toEqual([
      "Tate Modern",
      "British Museum",
    ]);
    expect(entries[0]).toMatchObject({
      id: "osm-way-4256245",
      coordinate: [-0.0994, 51.5076],
      category: "Culture",
      kind: "Museum",
      area: "Bankside",
    });
    expect(entries[1]).toMatchObject({
      id: "osm-node-111",
      area: "Bloomsbury",
    });
    expect(() => mapLocationIqNearby("culture", { error: "x" })).toThrow(
      TypeError,
    );
  });
});

/** A reply that never arrives: rejects only when the request is aborted. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });

describe("/api/nexora/places", () => {
  const realFetch = globalThis.fetch;
  const servers: Server[] = [];
  let upstream: { url: string; body: string }[] = [];
  let reply: (
    url: string,
    init?: RequestInit,
  ) => Response | Promise<Response> = () =>
    new Response(JSON.stringify(overpassReply), { status: 200 });

  beforeAll(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith("http://127.0.0.1")) return realFetch(input, init);
        upstream.push({ url, body: String(init?.body ?? "") });
        return reply(url, init);
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

  async function listen(places: PlacesOptions = {}) {
    const s = createApp({
      places: { spacingMs: 0, fallbackSpacingMs: 0, env: {}, ...places },
    }).listen(0);
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

  it("gives up on a hanging instance after its own time slot", async () => {
    const call = await listen({ attemptMs: 150, budgetMs: 2000 });
    reply = (url, init) =>
      url === DEFAULT_OVERPASS_URLS[0]
        ? hang(init)
        : new Response(JSON.stringify(overpassReply), { status: 200 });
    const started = Date.now();
    const r = await call("/api/nexora/places?category=culture&lat=51.5&lon=-0.1");
    expect(r.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(upstream.map((u) => u.url)).toEqual(DEFAULT_OVERPASS_URLS);
  });

  it("answers from LocationIQ Nearby when Overpass is down", async () => {
    const call = await listen({ env: LIQ_ENV, attemptMs: 100, budgetMs: 3000 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = (url, init) =>
      url.includes("locationiq.com")
        ? new Response(JSON.stringify(locationIqReply), { status: 200 })
        : url === DEFAULT_OVERPASS_URLS[0]
          ? new Response("bad gateway", { status: 502 })
          : hang(init);
    const r = await call(
      "/api/nexora/places?category=culture&lat=51.5194&lon=-0.1269",
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.attribution).toMatch(/LocationIQ/);
    expect(body.places[0].name).toBe("British Museum");
    const liq = upstream.find((u) => u.url.includes("locationiq.com"))!;
    expect(new URL(liq.url).pathname).toBe("/v1/nearby");
    // The fallback is logged without the key or the caller's position.
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("provider_fallback");
    expect(logged).not.toContain("pk.test-key");
    expect(logged).not.toContain("51.5");
    // Cached with its own attribution.
    const again = await (
      await call("/api/nexora/places?category=culture&lat=51.5195&lon=-0.1268")
    ).json();
    expect(again.attribution).toMatch(/LocationIQ/);
    expect(
      upstream.filter((u) => u.url.includes("locationiq.com")),
    ).toHaveLength(1);
    warn.mockRestore();
  });

  it("treats LocationIQ's 404 as nothing nearby", async () => {
    const call = await listen({ env: LIQ_ENV });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = (url) =>
      url.includes("locationiq.com")
        ? new Response(JSON.stringify({ error: "No results" }), { status: 404 })
        : new Response("down", { status: 503 });
    const r = await call("/api/nexora/places?category=parking&lat=51.5&lon=-0.1");
    expect(r.status).toBe(200);
    expect((await r.json()).places).toEqual([]);
    warn.mockRestore();
  });

  it("stops using the fallback when its daily budget is spent", async () => {
    const call = await listen({
      env: { ...LIQ_ENV, NEXORA_PLACES_FALLBACK_DAILY_BUDGET: "1" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = (url) =>
      url.includes("locationiq.com")
        ? new Response(JSON.stringify(locationIqReply), { status: 200 })
        : new Response("down", { status: 503 });
    expect(
      (await call("/api/nexora/places?category=food&lat=51.5&lon=-0.1")).status,
    ).toBe(200);
    const r = await call("/api/nexora/places?category=parks&lat=51.5&lon=-0.1");
    expect(r.status).toBe(503);
    expect(
      upstream.filter((u) => u.url.includes("locationiq.com")),
    ).toHaveLength(1);
    warn.mockRestore();
  });
});
