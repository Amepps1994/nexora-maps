import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  CAPABILITY_RETRY_DELAYS_MS,
  REROUTE_TIMEOUT_MS,
  ROUTE_TIMEOUT_MS,
  WAKE_TIMEOUT_MS,
  createApiClient,
  friendlyApiError,
  isAllowedMapNavigation,
  mapLoadTimers,
  timeoutFor,
} from "../lib/nexora-api-core";

const BASE = "https://nexora-api.example.test";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A fetch that never answers until its signal aborts, like a sleeping Render dyno. */
function hangingFetch() {
  return vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("Aborted");
          e.name = "AbortError";
          reject(e);
        });
      }),
  );
}

/** Records requested delays and resolves at once, so retry tests need no real waiting. */
function instantSleep() {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

/** For promises expected to reject: resolves with the ApiError. */
const unexpected = (): ApiError => {
  throw new Error("expected the request to fail");
};
const asApiError = (e: unknown) => e as ApiError;

afterEach(() => {
  vi.useRealTimers();
});

describe("apiFetch timeouts (BUG-001)", () => {
  it("rejects with a typed timeout, never a raw AbortError", async () => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as typeof globalThis.fetch,
    });
    const pending = api.json("/api/nexora/routes", {
      body: {},
      timeoutMs: REROUTE_TIMEOUT_MS,
    });
    const caught = pending.then(unexpected, asApiError);
    await vi.advanceTimersByTimeAsync(REROUTE_TIMEOUT_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const error = await caught;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe("timeout");
    expect(error.message).not.toMatch(/abort/i);
    expect(friendlyApiError(error, "waking")).toMatch(/waking up/);
    expect(friendlyApiError(error, "ready")).not.toMatch(/abort/i);
  });

  it("waits 60 s for route calculation while the server is waking, 18 s once awake", () => {
    expect(timeoutFor("waking", ROUTE_TIMEOUT_MS)).toBe(WAKE_TIMEOUT_MS);
    expect(timeoutFor("unreachable", ROUTE_TIMEOUT_MS)).toBe(WAKE_TIMEOUT_MS);
    expect(timeoutFor("ready", ROUTE_TIMEOUT_MS)).toBe(ROUTE_TIMEOUT_MS);
  });

  it("a request that answers after 50 s succeeds with the waking timeout", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(
            () => resolve(jsonResponse({ routes: [{ id: "r1" }] })),
            50_000,
          ),
        ),
    );
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as typeof globalThis.fetch,
    });
    expect(api.getState()).toBe("waking");
    const pending = api.json<{ routes: { id: string }[] }>(
      "/api/nexora/routes",
      {
        body: {},
        timeoutMs: timeoutFor(api.getState(), ROUTE_TIMEOUT_MS),
      },
    );
    await vi.advanceTimersByTimeAsync(50_000);
    await expect(pending).resolves.toEqual({ routes: [{ id: "r1" }] });
    expect(api.getState()).toBe("ready");
  });

  it("caller aborts reject as 'aborted' and produce no UI text", async () => {
    const fetch = hangingFetch();
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as typeof globalThis.fetch,
    });
    const controller = new AbortController();
    const pending = api.json("/api/nexora/search?q=x", {
      signal: controller.signal,
      timeoutMs: 5000,
    });
    controller.abort();
    const error = await pending.then(unexpected, asApiError);
    expect(error.kind).toBe("aborted");
    expect(friendlyApiError(error)).toBe("");
  });

  it("maps network failures, HTML error pages and server errors to typed errors", async () => {
    const offline = createApiClient({
      baseUrl: () => BASE,
      fetch: (() =>
        Promise.reject(
          new TypeError("Network request failed"),
        )) as typeof fetch,
    });
    const e1 = await offline
      .json("/api/nexora/capabilities")
      .then(unexpected, asApiError);
    expect(e1.kind).toBe("offline");
    expect(friendlyApiError(e1)).not.toMatch(/Network request failed/);

    const booting = createApiClient({
      baseUrl: () => BASE,
      fetch: (() =>
        Promise.resolve(
          new Response("<html>502</html>", { status: 502 }),
        )) as typeof fetch,
    });
    const e2 = await booting
      .json("/api/nexora/capabilities")
      .then(unexpected, asApiError);
    expect(e2.kind).toBe("http");
    expect(e2.status).toBe(502);
    expect(friendlyApiError(e2)).toMatch(/HTTP 502/);
    expect(friendlyApiError(e2)).not.toMatch(/JSON|Unexpected token/);

    const refused = createApiClient({
      baseUrl: () => BASE,
      fetch: (() =>
        Promise.resolve(
          jsonResponse({ error: "Destination is outside the UK." }, 400),
        )) as typeof fetch,
    });
    const e3 = await refused
      .json("/api/nexora/routes", { body: {} })
      .then(unexpected, asApiError);
    expect(e3.kind).toBe("http");
    expect(friendlyApiError(e3)).toBe("Destination is outside the UK.");
    // A 4xx is still an answer from the app: the server is awake.
    expect(refused.getState()).toBe("ready");
  });

  it("turns a synchronous fetch throw (empty base URL) into an offline error", async () => {
    const api = createApiClient({
      baseUrl: () => "",
      fetch: (() => {
        throw new TypeError("Invalid URL: /api/nexora/capabilities");
      }) as unknown as typeof fetch,
    });
    const e = await api
      .json("/api/nexora/capabilities")
      .then(unexpected, asApiError);
    expect(e.kind).toBe("offline");
  });

  it("sends JSON bodies as POST to the base URL", async () => {
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await api.json("/api/nexora/routes", { body: { mode: "driving" } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/nexora/routes`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ mode: "driving" }));
  });
});

describe("retries and capabilities", () => {
  it("retries capabilities with 2/5/10/20 s backoff until the server answers", async () => {
    const { delays, sleep } = instantSleep();
    let calls = 0;
    const fetch = vi.fn(() => {
      calls++;
      if (calls < 4)
        return Promise.reject(new TypeError("Network request failed"));
      return Promise.resolve(
        jsonResponse({ search: { configured: true, provider: "LocationIQ" } }),
      );
    });
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
      sleep,
    });
    const caps = await api.capabilities<{ search: { provider: string } }>();
    expect(caps.search.provider).toBe("LocationIQ");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(delays).toEqual(CAPABILITY_RETRY_DELAYS_MS.slice(0, 3));
    expect(api.getState()).toBe("ready");
  });

  it("gives up after the last backoff step", async () => {
    const { delays, sleep } = instantSleep();
    const fetch = vi.fn(() =>
      Promise.reject(new TypeError("Network request failed")),
    );
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
      sleep,
    });
    const e = await api.capabilities().then(unexpected, asApiError);
    expect(e.kind).toBe("offline");
    expect(fetch).toHaveBeenCalledTimes(CAPABILITY_RETRY_DELAYS_MS.length + 1);
    expect(delays).toEqual([...CAPABILITY_RETRY_DELAYS_MS]);
  });

  it("does not retry a 4xx", async () => {
    const { sleep } = instantSleep();
    const fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: "bad" }, 400)),
    );
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
      sleep,
    });
    await api.json("/x", { retries: 3 }).catch(() => {});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a timeout on an awake server marks it waking again (slept while in background)", async () => {
    vi.useFakeTimers();
    let hang = false;
    const fetch = vi.fn((url: string, init?: RequestInit) =>
      hang
        ? hangingFetch()(url, init)
        : Promise.resolve(jsonResponse({ ok: true })),
    );
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await api.json("/api/health");
    expect(api.getState()).toBe("ready");
    hang = true;
    const caught = api
      .json("/api/nexora/routes", { body: {}, timeoutMs: 1000 })
      .then(unexpected, asApiError);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await caught).kind).toBe("timeout");
    expect(api.getState()).toBe("waking");
  });
});

describe("warm-up", () => {
  it("polls /api/health once per launch and shares the result", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetch = vi.fn((url: string) => {
      expect(url).toBe(`${BASE}/api/health`);
      calls++;
      // Render refuses or 502s for a while, then answers.
      return calls < 3
        ? Promise.resolve(new Response("booting", { status: 502 }))
        : Promise.resolve(jsonResponse({ ok: true }));
    });
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const seen: string[] = [];
    api.subscribe(() => seen.push(api.getState()));
    const a = api.warmUp();
    const b = api.warmUp();
    expect(a).toBe(b);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(a).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(seen).toEqual(["ready"]);
    await api.warmUp();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("reports unreachable after 60 s and can be retried", async () => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as typeof globalThis.fetch,
    });
    const result = api.warmUp();
    await vi.advanceTimersByTimeAsync(WAKE_TIMEOUT_MS + 10);
    await expect(result).resolves.toBe(false);
    expect(api.getState()).toBe("unreachable");
    void api.warmUp();
    expect(api.getState()).toBe("waking");
  });
});

describe("map loading", () => {
  it("shows the waking overlay at 8 s and fails at 60 s without a pack", () => {
    expect(mapLoadTimers({ offlinePack: false, usingOffline: false })).toEqual({
      wakingAfterMs: 8000,
      failAfterMs: 60000,
    });
  });
  it("keeps the 10 s fallback to an installed offline pack", () => {
    expect(
      mapLoadTimers({ offlinePack: true, usingOffline: false }).failAfterMs,
    ).toBe(10000);
    expect(
      mapLoadTimers({ offlinePack: true, usingOffline: true }).wakingAfterMs,
    ).toBeNull();
  });
});

describe("map WebView navigation guard (SEC-009)", () => {
  const map = `${BASE}/api/nexora/map?attempt=0`;
  it("allows the map document on the API origin, any query", () => {
    expect(isAllowedMapNavigation(map, map, false)).toBe(true);
    expect(
      isAllowedMapNavigation(`${BASE}/api/nexora/map?attempt=3`, map, false),
    ).toBe(true);
    expect(isAllowedMapNavigation("about:blank", map, false)).toBe(true);
  });
  it("rejects other origins, other paths and look-alike hosts", () => {
    expect(
      isAllowedMapNavigation("https://evil.example/api/nexora/map", map, false),
    ).toBe(false);
    expect(isAllowedMapNavigation(`${BASE}/api/nexora/admin`, map, false)).toBe(
      false,
    );
    expect(
      isAllowedMapNavigation(
        "https://nexora-api.example.test.evil.example/api/nexora/map",
        map,
        false,
      ),
    ).toBe(false);
    expect(isAllowedMapNavigation("not a url", map, false)).toBe(false);
  });
  it("offline allows only the in-memory page", () => {
    expect(isAllowedMapNavigation("data:text/html,x", map, true)).toBe(true);
    expect(isAllowedMapNavigation(map, map, true)).toBe(false);
  });
});
