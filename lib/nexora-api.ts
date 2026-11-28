/**
 * The app's one NEXORA API client. See lib/nexora-api-core.ts for the behaviour.
 */
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import { createApiClient, type ServerState } from "@/lib/nexora-api-core";

export {
  ApiError,
  friendlyApiError,
  timeoutFor,
  rerouteTimeoutFor,
  isAllowedMapNavigation,
  mapLoadTimers,
  IDLE_SLEEP_MS,
  REROUTE_TIMEOUT_MS,
  REROUTE_WAKING_TIMEOUT_MS,
  ROUTE_TIMEOUT_MS,
  SEARCH_TIMEOUT_MS,
  WAKE_TIMEOUT_MS,
  type ServerState,
} from "@/lib/nexora-api-core";

export const api = createApiClient({ baseUrl: getApiBaseUrl });

// Render sleeps after 15 minutes without a request. Coming back from the background
// after a long gap, mark the server waking and start a warm-up at once, so the
// first search or route waits long enough and the banner is right (BUG-013).
// Module scope: the client lives for the whole JS runtime, so this never unsubscribes.
AppState.addEventListener("change", (next) => {
  if (next === "active") api.checkIdle();
});

/** "waking" until the server first answers, "unreachable" if a 60 s warm-up failed. */
export function useServerState(): ServerState {
  return useSyncExternalStore(api.subscribe, api.getState, api.getState);
}
