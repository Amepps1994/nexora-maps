/**
 * QA-002: the wiring behind hooks/use-nexora.ts that the hook itself used to hold
 * untested. Search staleness (BUG-006), reroute requests through the API client
 * (BUG-002, BUG-007, BUG-013) and the idle car snapshot on unmount (BUG-014).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  REROUTE_TIMEOUT_MS,
  REROUTE_WAKING_TIMEOUT_MS,
  createApiClient,
} from "../lib/nexora-api-core";
import {
  createLatestOnly,
  createRerouteController,
  idleCarGuidance,
} from "../lib/nexora-controllers";
import {
  getCarGuidance,
  publishCarGuidance,
  subscribeCarGuidance,
} from "../lib/car/guidance-bus";
import { buildCarGuidance } from "../shared/nexora/car-guidance";
import { DEMO_PLACES, syntheticRoute } from "../shared/nexora/fixtures";

const BASE = "https://nexora-api.example.test";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A promise the test resolves by hand, to control reply order. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("live search keeps only the newest reply (BUG-006)", () => {
  it("an older search answering after a newer one never overwrites it", async () => {
    const search = createLatestOnly();
    const shown: string[] = [];
    const errors: unknown[] = [];
    let settled = 0;
    const slow = deferred<string>();
    const fast = deferred<string>();
    const handlers = {
      onResult: (v: string) => shown.push(v),
      onError: (e: unknown) => errors.push(e),
      onSettled: () => settled++,
    };
    const first = search.run(() => slow.promise, handlers); // "lond"
    const second = search.run(() => fast.promise, handlers); // "london"
    fast.resolve("results for london");
    await second;
    slow.resolve("results for lond");
    await first;
    expect(shown).toEqual(["results for london"]);
    expect(errors).toEqual([]);
    expect(settled).toBe(1);
    expect(search.inFlight()).toBe(false);
  });

  it("starting a newer search aborts the older request", async () => {
    const search = createLatestOnly();
    const signals: AbortSignal[] = [];
    const noop = { onResult: () => {} };
    void search.run((signal) => {
      signals.push(signal);
      return new Promise(() => {});
    }, noop);
    void search.run((signal) => {
      signals.push(signal);
      return new Promise(() => {});
    }, noop);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(search.inFlight()).toBe(true);
  });

  it("a query change (cancel) drops the in-flight reply and its error", async () => {
    const search = createLatestOnly();
    const shown: string[] = [];
    const errors: unknown[] = [];
    let settled = 0;
    const reply = deferred<string>();
    const running = search.run(() => reply.promise, {
      onResult: (v) => shown.push(v),
      onError: (e) => errors.push(e),
      onSettled: () => settled++,
    });
    search.cancel();
    expect(search.inFlight()).toBe(false);
    reply.reject(new ApiError("aborted", "Request cancelled."));
    await running;
    expect(shown).toEqual([]);
    expect(errors).toEqual([]);
    expect(settled).toBe(0);
  });

  it("through the real API client: the stale reply is dropped and its request aborted", async () => {
    const replies: {
      url: string;
      signal?: AbortSignal | null;
      answer: (body: unknown) => void;
    }[] = [];
    const fetch = vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) =>
          replies.push({
            url,
            signal: init?.signal,
            answer: (body) => resolve(jsonResponse(body)),
          }),
        ),
    );
    const api = createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const search = createLatestOnly();
    let results: string[] | null = null;
    let lastError = "";
    const runSearch = (q: string) =>
      search.run(
        (signal) =>
          api.json<{ results: string[] }>(
            `/api/nexora/search?q=${encodeURIComponent(q)}`,
            { signal, awakeTimeoutMs: 12_000 },
          ),
        {
          onResult: (d) => (results = d.results),
          onError: (e) => (lastError = String(e)),
        },
      );
    const older = runSearch("kings");
    const newer = runSearch("kings cross");
    expect(replies).toHaveLength(2);
    expect(replies[0].signal?.aborted).toBe(true);
    replies[1].answer({ results: ["King's Cross"] });
    await newer;
    replies[0].answer({ results: ["Kingston"] });
    await older;
    expect(results).toEqual(["King's Cross"]);
    expect(lastError).toBe("");
  });
});

type Stop = { name: string; coordinate: [number, number] };
const A: Stop = { name: "A", coordinate: [-0.12, 51.5] };
const B: Stop = { name: "B", coordinate: [-0.11, 51.51] };
const C: Stop = { name: "C", coordinate: [-0.1, 51.52] };
const DEST: [number, number] = [-0.09, 51.53];
const HERE: [number, number] = [-0.125, 51.499];

function recordingApi(reply: unknown = { routes: [{ id: "r2" }] }) {
  const sent: { url: string; body: any }[] = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    sent.push({
      url: url.replace(BASE, ""),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Promise.resolve(jsonResponse(reply));
  });
  const api = createApiClient({
    baseUrl: () => BASE,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { api, sent, fetch };
}

describe("reroute wiring (QA-002: BUG-002 offset through the controller)", () => {
  const trip = { destination: DEST, stops: [A, B, C], mode: "driving", avoid: [] };

  it("sends only the stops still ahead, across two applied reroutes", async () => {
    const { api, sent } = recordingApi();
    const reroute = createRerouteController<Stop>(api);
    // Off route after passing A on the original route.
    await reroute.request(trip, HERE, 1);
    expect(sent[0].url).toBe("/api/nexora/routes");
    expect(sent[0].body.stops).toEqual([B.coordinate, C.coordinate]);
    reroute.apply();
    expect(reroute.visitedStops()).toBe(1);
    // Second reroute with nothing passed on the new route: B and C still ahead.
    await reroute.request(trip, HERE, 0);
    expect(sent[1].body.stops).toEqual([B.coordinate, C.coordinate]);
    reroute.apply();
    // Passed B on the rerouted route.
    await reroute.request(trip, HERE, 1);
    expect(sent[2].body.stops).toEqual([C.coordinate]);
    expect(sent[2].body.origin).toEqual(HERE);
    expect(sent[2].body.destination).toEqual(DEST);
  });

  it("a declined candidate does not advance the offset", async () => {
    const { api, sent } = recordingApi();
    const reroute = createRerouteController<Stop>(api);
    await reroute.request(trip, HERE, 2); // candidate not applied
    await reroute.request(trip, HERE, 1);
    expect(sent[1].body.stops).toEqual([B.coordinate, C.coordinate]);
  });

  it("reset() starts a new trip from the full stop list", async () => {
    const { api, sent } = recordingApi();
    const reroute = createRerouteController<Stop>(api);
    await reroute.request(trip, HERE, 2);
    reroute.apply();
    reroute.reset();
    await reroute.request(trip, HERE, 0);
    expect(sent[1].body.stops).toEqual([A.coordinate, B.coordinate, C.coordinate]);
  });

  it("omits stops once all are passed, and avoid unless driving", async () => {
    const { api, sent } = recordingApi();
    const reroute = createRerouteController<Stop>(api);
    await reroute.request({ ...trip, avoid: ["tolls"] }, HERE, 3);
    expect(sent[0].body).not.toHaveProperty("stops");
    expect(sent[0].body.avoid).toEqual(["tolls"]);
    await reroute.request({ ...trip, mode: "cycling", avoid: ["tolls"] }, HERE, 0);
    expect(sent[1].body).not.toHaveProperty("avoid");
    expect(sent[1].body.mode).toBe("cycling");
  });

  it("returns the candidates, or [] when the server has none", async () => {
    const some = createRerouteController<Stop, { id: string }>(recordingApi().api);
    await expect(some.request(trip, HERE, 0)).resolves.toEqual([{ id: "r2" }]);
    const none = createRerouteController<Stop>(recordingApi({ routes: [] }).api);
    await expect(none.request(trip, HERE, 0)).resolves.toEqual([]);
    const odd = createRerouteController<Stop>(recordingApi({}).api);
    await expect(odd.request(trip, HERE, 0)).resolves.toEqual([]);
  });
});

describe("reroute timeout follows the server state (BUG-007, BUG-013)", () => {
  function hangingApi() {
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/nexora/capabilities"))
        return Promise.resolve(jsonResponse({}));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("Aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    return createApiClient({
      baseUrl: () => BASE,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
  }
  const trip = { destination: DEST, stops: [] as Stop[], mode: "driving", avoid: [] };

  it("gives up after 10 s on an awake server, so guidance is not left rerouting", async () => {
    vi.useFakeTimers();
    const api = hangingApi();
    await api.json("/api/nexora/capabilities");
    const reroute = createRerouteController<Stop>(api);
    let kind = "";
    void reroute.request(trip, HERE, 0).catch((e) => (kind = e.kind));
    await vi.advanceTimersByTimeAsync(REROUTE_TIMEOUT_MS - 1);
    expect(kind).toBe("");
    await vi.advanceTimersByTimeAsync(1);
    expect(kind).toBe("timeout");
  });

  it("waits up to 30 s while the server is waking, never the full minute", async () => {
    vi.useFakeTimers();
    const api = hangingApi();
    expect(api.getState()).toBe("waking");
    const reroute = createRerouteController<Stop>(api);
    let kind = "";
    void reroute.request(trip, HERE, 0).catch((e) => (kind = e.kind));
    await vi.advanceTimersByTimeAsync(REROUTE_TIMEOUT_MS + 1);
    expect(kind).toBe("");
    await vi.advanceTimersByTimeAsync(REROUTE_WAKING_TIMEOUT_MS - REROUTE_TIMEOUT_MS);
    expect(kind).toBe("timeout");
  });

  it("after 20 min without a reply, the next reroute uses the waking budget", async () => {
    vi.useFakeTimers();
    const api = hangingApi();
    await api.json("/api/nexora/capabilities");
    expect(api.getState()).toBe("ready");
    vi.setSystemTime(Date.now() + 20 * 60_000);
    const reroute = createRerouteController<Stop>(api);
    let kind = "";
    void reroute.request(trip, HERE, 0).catch((e) => (kind = e.kind));
    expect(api.getState()).toBe("waking");
    await vi.advanceTimersByTimeAsync(REROUTE_TIMEOUT_MS + 1);
    expect(kind).toBe("");
    await vi.advanceTimersByTimeAsync(REROUTE_WAKING_TIMEOUT_MS);
    expect(kind).toBe("timeout");
  });
});

describe("car and lock-screen guidance end with the phone screen (BUG-014)", () => {
  it("the idle snapshot is inactive and clears an active trip for subscribers", () => {
    const route = syntheticRoute(DEMO_PLACES[0], DEMO_PLACES[1], "driving")[0];
    const seen: boolean[] = [];
    const unsubscribe = subscribeCarGuidance((s) => seen.push(s.active));
    publishCarGuidance(
      buildCarGuidance({
        state: "navigating",
        route,
        step: route.steps[0],
        progress: 0.3,
        paused: false,
        muted: false,
        metric: true,
        now: 1_000,
      }),
    );
    expect(getCarGuidance()?.active).toBe(true);
    // What use-nexora's unmount cleanup publishes when the ErrorBoundary catches a crash.
    publishCarGuidance(idleCarGuidance({ muted: true, metric: false }, 2_000));
    const latest = getCarGuidance();
    expect(latest?.active).toBe(false);
    expect(latest?.phase).toBe("idle");
    expect(latest?.next).toBeNull();
    expect(latest?.tripId).toBeNull();
    expect(latest?.muted).toBe(true);
    expect(latest?.metric).toBe(false);
    expect(seen.at(-1)).toBe(false);
    unsubscribe();
  });
});
