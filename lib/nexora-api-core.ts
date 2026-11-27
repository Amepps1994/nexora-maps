/**
 * Platform-free core of the NEXORA API client (BUG-001, DEBT-002 wrapper).
 *
 * Every app call to the NEXORA server goes through `createApiClient()`. It adds a
 * timeout to each request, turns failures into typed `ApiError`s (so no raw
 * "AbortError" or "Network request failed" text reaches the UI), and tracks whether
 * the server is awake. The production API runs on Render's free plan, which sleeps
 * after 15 minutes idle and takes about 50 s to wake, so the first requests after a
 * cold launch must be allowed to wait.
 *
 * This file imports nothing from React Native so it can be unit tested in Node.
 * `lib/nexora-api.ts` wires it to the app's base URL and global fetch.
 */

export type ServerState = "waking" | "ready" | "unreachable";
export type ApiErrorKind =
  | "timeout"
  | "offline"
  | "http"
  | "invalid"
  | "aborted";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** The server's own `error` text, when it sent one. */
  readonly serverMessage?: string;
  constructor(
    kind: ApiErrorKind,
    message: string,
    opts: { status?: number; serverMessage?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = opts.status;
    this.serverMessage = opts.serverMessage;
  }
}

/** Longest a request waits while the server may still be waking up. */
export const WAKE_TIMEOUT_MS = 60_000;
/** Route calculation once the server is known to be awake. */
export const ROUTE_TIMEOUT_MS = 18_000;
/** A live reroute must answer fast or the driver is left without guidance. */
export const REROUTE_TIMEOUT_MS = 10_000;
/** Place search once the server is awake. */
export const SEARCH_TIMEOUT_MS = 12_000;
/** Backoff between capability fetch attempts (2 s, 5 s, 10 s, 20 s). */
export const CAPABILITY_RETRY_DELAYS_MS = [
  2_000, 5_000, 10_000, 20_000,
] as const;
/** Pause between warm-up health checks that failed fast (connection refused, 502). */
export const WARM_UP_RETRY_MS = 2_000;

/** Pick a timeout: generous while the server may be asleep, tight once it is awake. */
export function timeoutFor(state: ServerState, awakeMs: number) {
  return state === "ready" ? awakeMs : Math.max(awakeMs, WAKE_TIMEOUT_MS);
}

/**
 * Text for the UI. Never returns raw platform error text such as "AbortError",
 * "Network request failed" or a JSON parse error. Returns "" for a caller abort,
 * which callers should treat as "say nothing".
 */
export function friendlyApiError(
  error: unknown,
  state: ServerState = "ready",
  fallback = "Something went wrong. Try again.",
): string {
  if (!(error instanceof ApiError)) return fallback;
  switch (error.kind) {
    case "aborted":
      return "";
    case "timeout":
      return state === "ready"
        ? "The NEXORA server took too long to answer. Try again."
        : "The NEXORA server is waking up. This can take up to a minute. Try again shortly.";
    case "offline":
      return state === "ready"
        ? "No connection to the NEXORA server. Check your connection and try again."
        : "The NEXORA server is waking up or unreachable. Check your connection and try again shortly.";
    case "invalid":
      return "The NEXORA server sent an unexpected reply. Try again shortly.";
    case "http":
      if (error.status === 429)
        return "Too many requests. Wait a minute and try again.";
      if (error.serverMessage) return error.serverMessage;
      if (error.status && error.status >= 500)
        return `The NEXORA server had a problem (HTTP ${error.status}). Try again shortly.`;
      return `The request was refused (HTTP ${error.status ?? "error"}).`;
  }
}

export type RequestOptions = {
  method?: "GET" | "POST";
  /** Sent as JSON. */
  body?: unknown;
  /** Defaults to `timeoutFor(state, 15 s)`. */
  timeoutMs?: number;
  /** Caller cancellation; aborting rejects with kind "aborted". */
  signal?: AbortSignal;
  /** Extra attempts after a timeout, offline or 5xx failure. Default 0. */
  retries?: number;
  /** Delay before each retry; the last value repeats. Default CAPABILITY_RETRY_DELAYS_MS. */
  retryDelaysMs?: readonly number[];
};

type Deps = {
  baseUrl: () => string;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
};

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted)
      return reject(new ApiError("aborted", "Request cancelled."));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ApiError("aborted", "Request cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Failures worth another attempt: the server may simply not be up yet. */
export function isRetryable(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.kind === "timeout" ||
      error.kind === "offline" ||
      error.kind === "invalid" ||
      (error.kind === "http" && (error.status ?? 0) >= 500))
  );
}

export function createApiClient(deps: Deps) {
  const doFetch = (...args: Parameters<typeof fetch>) =>
    (deps.fetch ?? globalThis.fetch)(...args);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  let state: ServerState = "waking";
  const listeners = new Set<() => void>();
  let warming: Promise<boolean> | null = null;

  /** Read through a function: TypeScript would otherwise narrow `state` across awaits. */
  const current = () => state;
  function setState(next: ServerState) {
    if (next === state) return;
    state = next;
    listeners.forEach((l) => l());
  }

  /** One attempt: fetch + timeout + typed errors. Resolves only for 2xx JSON. */
  async function once<T>(path: string, opts: RequestOptions): Promise<T> {
    if (opts.signal?.aborted)
      throw new ApiError("aborted", "Request cancelled.");
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = opts.timeoutMs ?? timeoutFor(state, 15_000);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forward = () => controller.abort();
    opts.signal?.addEventListener("abort", forward, { once: true });
    try {
      let response: Response;
      try {
        response = await doFetch(`${deps.baseUrl()}${path}`, {
          method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
          signal: controller.signal,
          headers:
            opts.body === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
      } catch {
        if (timedOut)
          throw new ApiError(
            "timeout",
            `No answer within ${Math.round(timeoutMs / 1000)} s.`,
          );
        if (opts.signal?.aborted)
          throw new ApiError("aborted", "Request cancelled.");
        // TypeError "Network request failed", "Invalid URL" with an empty base, DNS…
        throw new ApiError("offline", "Could not reach the NEXORA server.");
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        if (timedOut)
          throw new ApiError(
            "timeout",
            `No answer within ${Math.round(timeoutMs / 1000)} s.`,
          );
        if (opts.signal?.aborted)
          throw new ApiError("aborted", "Request cancelled.");
        // Render answers a still-booting service with an HTML 502/503 page.
        throw response.ok
          ? new ApiError("invalid", "Reply was not JSON.", {
              status: response.status,
            })
          : new ApiError("http", `HTTP ${response.status}`, {
              status: response.status,
            });
      }
      // Any reply from the app itself, even an error, means the server is awake.
      if (response.status < 500) setState("ready");
      if (!response.ok) {
        const serverMessage =
          data && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : undefined;
        throw new ApiError("http", serverMessage ?? `HTTP ${response.status}`, {
          status: response.status,
          serverMessage,
        });
      }
      return data as T;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", forward);
    }
  }

  async function json<T = unknown>(
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const retries = opts.retries ?? 0;
    const delays = opts.retryDelaysMs ?? CAPABILITY_RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt++) {
      try {
        return await once<T>(path, opts);
      } catch (error) {
        // A sleeping server times out; a ready one that stops answering may have
        // gone back to sleep (the app was in the background for 15+ minutes).
        if (
          error instanceof ApiError &&
          (error.kind === "timeout" || error.kind === "offline") &&
          state === "ready"
        ) {
          setState("waking");
          warming = null;
        }
        if (attempt >= retries || !isRetryable(error)) throw error;
        await sleep(delays[Math.min(attempt, delays.length - 1)], opts.signal);
      }
    }
  }

  /**
   * Wake the server once per launch: GET /api/health until it answers or 60 s pass.
   * Memoised, so every caller shares one warm-up. Resolves true when awake.
   */
  function warmUp(): Promise<boolean> {
    if (state === "ready") return Promise.resolve(true);
    if (warming) return warming;
    if (state === "unreachable") setState("waking");
    const deadline = now() + WAKE_TIMEOUT_MS;
    warming = (async () => {
      while (true) {
        const left = deadline - now();
        if (left <= 0) break;
        try {
          await once("/api/health", { timeoutMs: left });
          setState("ready");
          return true;
        } catch {
          if (current() === "ready") return true; // another request got through meanwhile
          const wait = Math.min(WARM_UP_RETRY_MS, deadline - now());
          if (wait <= 0) break;
          await sleep(wait);
        }
      }
      if (current() !== "ready") setState("unreachable");
      warming = null;
      return current() === "ready";
    })();
    return warming;
  }

  return {
    json,
    warmUp,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Capabilities with backoff, so a cold server still fills in search/provider info. */
    capabilities<T = unknown>(signal?: AbortSignal) {
      return json<T>("/api/nexora/capabilities", {
        signal,
        retries: CAPABILITY_RETRY_DELAYS_MS.length,
        timeoutMs: timeoutFor(state, 15_000),
      });
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;

/** When the map overlay appears and when loading gives up. */
export function mapLoadTimers(opts: {
  offlinePack: boolean;
  usingOffline: boolean;
}) {
  // An installed pack loads from disk (or is the fallback), so keep the old 10 s limit.
  if (opts.usingOffline || opts.offlinePack)
    return { wakingAfterMs: null, failAfterMs: 10_000 };
  return { wakingAfterMs: 8_000, failAfterMs: WAKE_TIMEOUT_MS };
}

/**
 * Navigation guard for the map WebView (SEC-009). Online, only the map document on
 * the API origin may load; offline, only the in-memory page.
 */
export function isAllowedMapNavigation(
  requestUrl: string,
  mapUrl: string,
  offline: boolean,
) {
  if (requestUrl === "about:blank") return true;
  if (offline) return requestUrl.startsWith("data:");
  try {
    const req = new URL(requestUrl);
    const map = new URL(mapUrl);
    return req.origin === map.origin && req.pathname === map.pathname;
  } catch {
    return false;
  }
}
