import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { buildMapDocument, mapDocument } from "../server/nexora/map-document";
import { buildOfflineMapHtml, OFFLINE_SHELL_ASSETS } from "../shared/nexora/offline";

/**
 * SEC-006 and UX-001. The repo has no DOM library, so the page script runs in a VM against a
 * minimal fake DOM and a fake Leaflet that record what the script does with untrusted data.
 */
class FakeElement {
  children: FakeElement[] = [];
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  hidden = false;
  id = "";
  type = "";
  html: string | null = null;
  private text = "";
  listeners: Record<string, (() => void)[]> = {};
  constructor(
    readonly tagName: string,
    public className = "",
  ) {}
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.text = String(v);
    this.children = [];
    this.html = null;
  }
  set innerHTML(v: string) {
    this.html = v;
    this.children = [];
    this.text = "";
  }
  get innerHTML() {
    return this.html ?? "";
  }
  appendChild(c: FakeElement) {
    this.children.push(c);
    return c;
  }
  setAttribute(k: string, v: string) {
    this.attributes[k] = String(v);
  }
  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }
  get classList() {
    const el = this;
    return {
      add: (c: string) => (el.className = `${el.className} ${c}`.trim()),
      remove: (c: string) =>
        (el.className = el.className.split(" ").filter((x) => x !== c).join(" ")),
      contains: (c: string) => el.className.split(" ").includes(c),
    };
  }
  click() {
    (this.listeners.click ?? []).forEach((f) => f());
  }
}

type Harness = ReturnType<typeof load>;

function load(html: string, opts: { native?: boolean; framed?: boolean } = {}) {
  const script = html.match(/<script>([\s\S]*?)<\/script><\/body>/)![1];
  const tooltips: unknown[] = [];
  const updates: unknown[] = [];
  const posted: { message: any; target: string }[] = [];
  const nativePosted: string[] = [];
  const windowListeners: Record<string, ((e: any) => void)[]> = {};
  let creditBox: FakeElement | null = null;
  const chain = (extra: Record<string, unknown> = {}) => {
    const o: any = {
      addTo: () => o,
      on: () => o,
      clearLayers: () => o,
      setLatLng: () => o,
      bindTooltip: (t: unknown) => {
        tooltips.push(t);
        return o;
      },
      getBounds: () => ({}),
      ...extra,
    };
    return o;
  };
  const map = chain({
    setView: () => map,
    fitBounds: () => map,
    removeLayer: () => map,
    zoomIn: () => map,
    zoomOut: () => map,
    invalidateSize: () => map,
    project: () => ({ add: () => ({}) }),
    unproject: () => [0, 0],
  });
  const L = {
    map: () => map,
    tileLayer: (_url: string, options: Record<string, unknown>) => chain({ options }),
    layerGroup: () => chain(),
    circleMarker: () => chain(),
    marker: () => chain(),
    polyline: () => chain(),
    divIcon: (o: unknown) => o,
    control: Object.assign(
      () => {
        const c: any = {
          addTo: () => {
            creditBox = c.onAdd(map);
            return c;
          },
        };
        return c;
      },
      { scale: () => chain() },
    ),
    DomUtil: {
      create: (tag: string, cls: string, parent?: FakeElement) => {
        const el = new FakeElement(tag, cls);
        parent?.appendChild(el);
        return el;
      },
      addClass: (el: FakeElement, c: string) => el.classList.add(c),
      removeClass: (el: FakeElement, c: string) => el.classList.remove(c),
    },
    DomEvent: {
      on: (el: FakeElement, ev: string, f: () => void) => {
        (el.listeners[ev] ??= []).push(f);
      },
      disableClickPropagation: () => {},
      disableScrollPropagation: () => {},
    },
  };
  const errorBox = new FakeElement("div");
  const document = {
    getElementById: () => errorBox,
    createElement: (tag: string) => new FakeElement(tag),
    querySelectorAll: () => [],
    body: new FakeElement("body"),
  };
  const parent: any = {
    postMessage: (message: unknown, target: string) => {
      if (target === "*") throw new Error("wildcard target origin");
      posted.push({ message, target });
    },
  };
  const window: any = {
    L,
    navigator: { onLine: true },
    addEventListener: (ev: string, f: (e: any) => void) => {
      (windowListeners[ev] ??= []).push(f);
    },
  };
  window.window = window;
  window.parent = opts.framed === false ? window : parent;
  if (opts.native) window.ReactNativeWebView = { postMessage: (s: string) => nativePosted.push(s) };
  runInNewContext(script, {
    window,
    document,
    L,
    navigator: window.navigator,
    setTimeout: () => 0,
    JSON,
    Object,
    String,
    Number,
    Boolean,
  });
  const realUpdate = window.nexoraUpdate;
  window.nexoraUpdate = (d: unknown) => {
    updates.push(d);
    realUpdate(d);
  };
  const dispatch = (e: { origin: string; source: unknown; data: unknown }) =>
    (windowListeners.message ?? []).forEach((f) => f(e));
  return {
    window,
    parent,
    tooltips,
    updates,
    posted,
    nativePosted,
    dispatch,
    credits: () => creditBox!,
  };
}

const APP = "https://8081-sandbox.example.test";
const update = (h: Harness, data: unknown, origin = APP, source: unknown = h.parent) =>
  h.dispatch({ origin, source, data: { nexoraMap: true, data } });

describe("map document messaging (SEC-006)", () => {
  it("accepts updates only from the embedding window on a trusted origin", () => {
    const h = load(buildMapDocument([APP]));
    update(h, { dark: true }, "https://evil.example.test");
    update(h, { dark: true }, APP, {});
    update(h, { dark: true }, "null");
    expect(h.updates).toHaveLength(0);
    update(h, { dark: true });
    expect(h.updates).toHaveLength(1);
  });

  it("ignores every window message when no web origin is configured", () => {
    const h = load(buildMapDocument([]));
    update(h, { dark: true }, "https://anything.example.test");
    expect(h.updates).toHaveLength(0);
    expect(h.posted).toHaveLength(0);
  });

  it("ignores window messages inside the native WebView, which uses injectJavaScript", () => {
    const h = load(buildMapDocument([APP]), { native: true });
    update(h, { dark: true });
    expect(h.updates).toHaveLength(0);
    expect(JSON.parse(h.nativePosted[0])).toEqual({ type: "ready" });
  });

  it("posts replies to the configured origins only, never '*'", () => {
    const h = load(buildMapDocument([APP, "https://8328-sandbox.example.test"]));
    expect(h.posted).toEqual([
      { message: { nexora: true, type: "ready" }, target: APP },
      { message: { nexora: true, type: "ready" }, target: "https://8328-sandbox.example.test" },
    ]);
    expect(mapDocument).not.toMatch(/postMessage\([^)]*'\*'\)/);
  });

  it("does not post anywhere when opened directly rather than framed", () => {
    const h = load(buildMapDocument([APP]), { framed: false });
    expect(h.posted).toHaveLength(0);
  });

  it("renders place names as text, not HTML", () => {
    const h = load(buildMapDocument([APP]));
    const name = '<img src=x onerror="alert(document.domain)">';
    update(h, { places: [{ id: "p1", name, coordinate: [-0.12, 51.5] }] });
    expect(h.tooltips).toHaveLength(1);
    const tip = h.tooltips[0] as FakeElement;
    expect(tip).toBeInstanceOf(FakeElement);
    expect(tip.textContent).toBe(name);
    expect(tip.html).toBeNull();
  });

  it("keeps hostile origin strings from closing the inline script", () => {
    const html = buildMapDocument(["https://a.test/</script><script>alert(1)//"]);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain("\\u003c/script\\u003e");
  });
});

describe("map credits (UX-001)", () => {
  it("replaces Leaflet's attribution band with one collapsed line", () => {
    expect(mapDocument).toContain("attributionControl:false");
    expect(mapDocument).not.toContain("attributionControl.setPosition");
    const h = load(buildMapDocument([APP]));
    const box = h.credits();
    const [button, list] = box.children;
    expect(button.tagName).toBe("button");
    expect(button.textContent).toBe("© OpenStreetMap ⓘ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(list.hidden).toBe(true);
    expect(list.children[0].innerHTML).toContain("openstreetmap.org/copyright");
  });

  it("opens the full credits in one tap, including every TfL licence line while disruptions show", () => {
    const h = load(buildMapDocument([APP]));
    update(h, {
      traffic: [{ title: "Road closed", point: [-0.1, 51.5], lines: [], closure: true, planned: false }],
    });
    const [button, list] = h.credits().children;
    expect(button.textContent).toBe("© OpenStreetMap · TfL ⓘ");
    button.click();
    expect(list.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const text = list.children.map((c) => c.textContent || c.innerHTML).join("\n");
    expect(text).toContain("Powered by TfL Open Data");
    expect(text).toContain("Contains OS data © Crown copyright and database rights 2016");
    expect(text).toContain("Geomni UK Map data © and database rights [2019]");
    update(h, { traffic: [] });
    expect(button.textContent).toBe("© OpenStreetMap ⓘ");
    expect(list.children.map((c) => c.textContent).join("")).not.toContain("TfL");
    button.click();
    expect(list.hidden).toBe(true);
  });

  it("credits the offline pack's own attribution in the offline shell", () => {
    const assets = Object.fromEntries(OFFLINE_SHELL_ASSETS.map((a) => [a, `/*${a}*/`])) as Record<
      (typeof OFFLINE_SHELL_ASSETS)[number],
      string
    >;
    const html = buildOfflineMapHtml(mapDocument, assets, { maxZoom: 14, bbox: [-0.5, 51.3, 0.3, 51.7] });
    expect(html).toContain("tiles.options&&tiles.options.attribution");
    expect(html).toContain("offline pack");
  });
});
