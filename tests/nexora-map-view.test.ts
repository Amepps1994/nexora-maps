import { describe, expect, it } from "vitest";
import {
  bearing,
  normaliseMapView,
  resolveMapView,
  routeHeading,
} from "../shared/nexora/map-view";
import {
  MAP3D_STYLES,
  OPENFREEMAP_ORIGIN,
  buildMap3dDocument,
  map3dDocumentCsp,
} from "../server/nexora/map3d-document";
import { mapDocument } from "../server/nexora/map-document";
import type { Coord } from "../shared/nexora/domain";

describe("MAP-3D view choice", () => {
  it("treats anything but '3d' as the flat map", () => {
    expect(normaliseMapView("3d")).toBe("3d");
    expect(normaliseMapView("2d")).toBe("2d");
    expect(normaliseMapView(undefined)).toBe("2d");
    expect(normaliseMapView("satellite")).toBe("2d");
  });

  it("shows 3D only online with WebGL, and says why otherwise", () => {
    expect(resolveMapView({ requested: "3d", offline: false })).toEqual({ view: "3d" });
    expect(resolveMapView({ requested: "2d", offline: true })).toEqual({ view: "2d" });
    const offline = resolveMapView({ requested: "3d", offline: true });
    expect(offline.view).toBe("2d");
    expect(offline.reason).toMatch(/offline/i);
    expect(resolveMapView({ requested: "3d", offline: false, unavailable3d: "webgl" }).reason).toMatch(
      /cannot draw/,
    );
    expect(resolveMapView({ requested: "3d", offline: false, unavailable3d: "load" }).reason).toMatch(
      /could not load/,
    );
  });
});

describe("MAP-3D heading", () => {
  it("gives compass bearings", () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90, 5);
    expect(bearing([0, 1], [0, 0])).toBeCloseTo(180, 5);
    expect(bearing([1, 0], [0, 0])).toBeCloseTo(270, 5);
  });

  it("follows the nearest route segment, preferring the road ahead at a corner", () => {
    // East along Euston Road, then north.
    const route: Coord[] = [
      [-0.13, 51.528],
      [-0.12, 51.528],
      [-0.12, 51.535],
    ];
    expect(routeHeading(route, [-0.125, 51.5281])).toBeCloseTo(90, 0);
    expect(routeHeading(route, [-0.1201, 51.532])).toBeCloseTo(0, 0);
    expect(routeHeading(route, [-0.12, 51.528])).toBeCloseTo(0, 0);
  });

  it("is undefined without a route or position, and skips repeated points", () => {
    expect(routeHeading(undefined, [0, 0])).toBeUndefined();
    expect(routeHeading([[0, 0]], [0, 0])).toBeUndefined();
    expect(routeHeading([[0, 51], [0, 51]], [0, 51])).toBeUndefined();
    expect(routeHeading([[0, 51], [0, 51], [0, 51.01]], [0, 51])).toBeCloseTo(0, 5);
  });
});

describe("MAP-3D page", () => {
  const doc = buildMap3dDocument(["https://app.example"]);

  it("loads MapLibre from this server and map data only from OpenFreeMap", () => {
    expect(doc).toContain('src="/api/nexora/map-assets/maplibre-gl.js"');
    expect(doc).toContain(MAP3D_STYLES.light);
    expect(doc).toContain(MAP3D_STYLES.dark);
    const csp = map3dDocumentCsp();
    expect(csp).toContain(`connect-src 'self' ${OPENFREEMAP_ORIGIN}`);
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toContain("unsafe-eval");
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src"));
    expect(connect).toBe(`connect-src 'self' ${OPENFREEMAP_ORIGIN}`);
  });

  it("extrudes buildings and follows the heading during guidance", () => {
    expect(doc).toContain("'fill-extrusion'");
    expect(doc).toContain("render_height");
    expect(doc).toContain("pitch:60");
    expect(doc).toContain("opts.bearing=d.heading");
  });

  it("keeps the bridge locked down (SEC-006)", () => {
    expect(doc).not.toMatch(/postMessage\([^)]*'\*'\)/);
    expect(doc).toContain("parents.indexOf(e.origin)<0");
    expect(doc).toContain('"https://app.example"');
    // Disruption titles go in as text.
    expect(doc).toContain("label.textContent=t.title");
    expect(doc).not.toMatch(/innerHTML=[^'"]*t\.title/);
  });

  it("falls back to the flat map without WebGL or tiles", () => {
    expect(doc).toContain("type:'no3d'");
  });

  it("leaves the flat map page, and so the offline pack shell, as it was", () => {
    expect(mapDocument).toContain("window.nexoraTileLayer?window.nexoraTileLayer(L)");
    expect(mapDocument).not.toContain("maplibre");
  });
});
