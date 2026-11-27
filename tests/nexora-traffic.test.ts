import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildTflSnapshot,
  disruptionsOnRoute,
  normaliseTflDisruption,
  routeTrafficLabel,
  snapshotFreshness,
  inLondonCoverage,
  routeCoverage,
  TFL_ATTRIBUTION,
  TRAFFIC_POLICY,
} from "../shared/nexora/traffic";
import type { Coord } from "../shared/nexora/domain";
import {
  registerTrafficRoutes,
  resetTrafficCache,
} from "../server/nexora/traffic";

// Real TfL records captured on 27 Nov 2026 (see fixture header).
const captured = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/tfl-road-disruption-2026-11-27.json"),
    "utf8",
  ),
);
const feed: unknown[] = captured.body;
const at = new Date("2026-11-27T02:15:00Z");

describe("TfL disruption normalisation", () => {
  const snap = buildTflSnapshot(feed, at);

  it("keeps every captured record with source, times and attribution", () => {
    expect(snap.disruptions).toHaveLength(4);
    expect(snap.rejected).toBe(0);
    expect(snap.attribution).toEqual(TFL_ATTRIBUTION);
    expect(snap.attribution[0]).toBe("Powered by TfL Open Data");
    expect(snap.fetchedAt).toBe(at.toISOString());
    expect(Date.parse(snap.expiresAt) - at.getTime()).toBe(
      TRAFFIC_POLICY.cacheTtlMs,
    );
    for (const d of snap.disruptions) {
      expect(d.source).toBe("TfL");
      expect(d.id.startsWith("tfl-TIMS-")).toBe(true);
      expect(d.updatedAt).not.toBeNull();
    }
  });

  it("derives closures from street closure even when hasClosures is false", () => {
    const brixton = snap.disruptions.find((d) => d.id === "tfl-TIMS-238390")!;
    expect(brixton.closure).toBe(true);
    expect(brixton.closedStreets).toEqual([
      "[A2217] COLDHARBOUR LANE (SW2 ,SW9)",
    ]);
    expect(brixton.lines).toHaveLength(3);
    expect(brixton.lines[0][0]).toEqual([-0.115256, 51.461347]);
    // Closures rank ahead of other moderate disruptions.
    expect(snap.disruptions[0].id).toBe("tfl-TIMS-238390");
  });

  it("drops bare reference numbers TfL sometimes publishes as update text", () => {
    const marylebone = snap.disruptions.find(
      (d) => d.id === "tfl-TIMS-238748",
    )!;
    expect(marylebone.update).toBeNull();
    expect(marylebone.summary).toMatch(/collision/);
  });

  it("drops expired records and marks future ones planned", () => {
    const later = new Date("2026-11-27T18:00:00Z"); // after Islington ends at 17:00Z
    const ids = buildTflSnapshot(feed, later).disruptions.map((d) => d.id);
    expect(ids).not.toContain("tfl-TIMS-237786");
    const future = {
      ...(feed[0] as object),
      id: "X1",
      startDateTime: "2026-11-28T09:00:00Z",
    };
    const d = normaliseTflDisruption(future, at);
    expect(d && d !== "rejected" && d.planned).toBe(true);
  });

  it("never surfaces enforcement-camera or police categories", () => {
    for (const category of ["Speed camera", "Police checkpoint"]) {
      const blocked = { ...(feed[1] as object), id: "B", category };
      expect(normaliseTflDisruption(blocked, at)).toBeNull();
    }
  });

  it("rejects malformed records instead of inventing a location", () => {
    const snapBad = buildTflSnapshot(
      [{ id: "no-point", category: "Works" }, 42, ...feed],
      at,
    );
    expect(snapBad.rejected).toBe(2);
    expect(snapBad.disruptions).toHaveLength(4);
    expect(() => buildTflSnapshot({ not: "array" }, at)).toThrow();
  });

  it("labels snapshots stale after the policy window", () => {
    expect(snapshotFreshness(at.toISOString(), at)).toBe("fresh");
    const old = new Date(at.getTime() + TRAFFIC_POLICY.staleAfterMs + 1);
    expect(snapshotFreshness(at.toISOString(), old)).toBe("stale");
    expect(snapshotFreshness("not a date", at)).toBe("stale");
  });
});

describe("route matching", () => {
  const snap = buildTflSnapshot(feed, at);
  // Straight line along Marylebone Road through the Baker Street junction.
  const marylebone: Coord[] = [
    [-0.1655, 51.5223],
    [-0.1505, 51.5216],
  ];
  // Line along Coldharbour Lane, touching only the closed segments.
  const coldharbour: Coord[] = [
    [-0.1118, 51.46188],
    [-0.1156, 51.46126],
  ];
  const farAway: Coord[] = [
    [-0.02, 51.6],
    [-0.01, 51.61],
  ];

  it("lists a point disruption on the route and nothing far away", () => {
    const hits = disruptionsOnRoute(marylebone, snap.disruptions);
    expect(hits.map((d) => d.id)).toEqual(["tfl-TIMS-238748"]);
    expect(disruptionsOnRoute(farAway, snap.disruptions)).toEqual([]);
  });

  it("matches a closure by its closed street segments", () => {
    const hits = disruptionsOnRoute(coldharbour, snap.disruptions);
    expect(hits.map((d) => d.id)).toContain("tfl-TIMS-238390");
    expect(routeTrafficLabel(hits, "full")).toBe(
      "1 TfL disruption on or beside this route · 1 with a road closure",
    );
  });

  it("states coverage honestly in the route label", () => {
    expect(routeTrafficLabel([], "full")).toBe(
      "No TfL-reported disruptions on this route",
    );
    expect(routeTrafficLabel([], "none")).toBe(
      "Outside TfL disruption coverage",
    );
    expect(routeTrafficLabel([], "partial")).toBe(
      "No TfL-reported disruptions on this route · part of the route is outside TfL coverage",
    );
    expect(routeCoverage(marylebone)).toBe("full");
    expect(
      routeCoverage([
        [-0.12, 51.5],
        [-1.2, 51.75],
      ]),
    ).toBe("partial");
    expect(
      routeCoverage([
        [-2.2, 53.4],
        [-2.3, 53.5],
      ]),
    ).toBe("none");
    expect(inLondonCoverage([-0.1276, 51.5072])).toBe(true);
    expect(inLondonCoverage([-2.2426, 53.4808])).toBe(false); // Manchester
  });
});

describe("traffic API", () => {
  let server: Server;
  let base = "";
  const realFetch = globalThis.fetch;
  const upstream: string[] = [];
  let respond: () => Response = () =>
    new Response(JSON.stringify(feed), { status: 200 });
  // Pin the server clock to the fixture capture time. With the real clock, disruptions in the
  // captured feed expire (Islington ends 2026-11-27T17:00Z) and the snapshot shrinks over time.
  let clock = at.getTime();
  beforeAll(async () => {
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith(base)) return realFetch(input, init);
        upstream.push(url);
        return respond();
      },
    );
    const app = express();
    registerTrafficRoutes(app);
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    vi.restoreAllMocks();
    server?.close();
  });
  afterEach(() => {
    upstream.length = 0;
    resetTrafficCache();
    delete process.env.NEXORA_TFL_APP_KEY;
    delete process.env.NEXORA_TFL_DISABLED;
    respond = () => new Response(JSON.stringify(feed), { status: 200 });
  });
  const get = (path = "/api/nexora/traffic") => realFetch(`${base}${path}`);

  it("serves a live snapshot and caches it across clients", async () => {
    const a = await get();
    expect(a.status).toBe(200);
    const body = await a.json();
    expect(body.status).toBe("live");
    expect(body.disruptions).toHaveLength(4);
    expect(body.attribution[0]).toBe("Powered by TfL Open Data");
    await get();
    await get();
    expect(upstream).toHaveLength(1);
    expect(upstream[0]).toBe(
      "https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true",
    );
  });

  it("sends the app key upstream but never returns it", async () => {
    process.env.NEXORA_TFL_APP_KEY = "test-key-not-real";
    const res = await get();
    const text = await res.text();
    expect(upstream[0]).toContain("app_key=test-key-not-real");
    expect(text).not.toContain("test-key-not-real");
    const caps = await (await get("/api/nexora/traffic/capabilities")).text();
    expect(caps).not.toContain("test-key-not-real");
    expect(JSON.parse(caps)).toMatchObject({
      appKeyConfigured: true,
      liveSpeeds: false,
      affectsRouteTimes: false,
    });
  });

  it("returns 503 with nothing substituted when TfL fails and no cache exists", async () => {
    respond = () => new Response("down", { status: 502 });
    const res = await get();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("unavailable");
    expect(body.disruptions).toBeUndefined();
  });

  it("labels a previous snapshot as cached, not live, when TfL fails", async () => {
    await get();
    const now = clock;
    clock = now + TRAFFIC_POLICY.cacheTtlMs + 1000;
    respond = () => new Response("down", { status: 500 });
    try {
      const body = await (await get()).json();
      expect(body.status).toBe("cached");
      expect(body.upstreamError).toBe(true);
      expect(body.fetchedAt).toBeTruthy();
    } finally {
      clock = now;
    }
  });

  it("can be switched off by the operator", async () => {
    process.env.NEXORA_TFL_DISABLED = "1";
    const res = await get();
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("disabled");
    expect(upstream).toHaveLength(0);
  });
});
