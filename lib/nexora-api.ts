/**
 * The app's one NEXORA API client. See lib/nexora-api-core.ts for the behaviour.
 */
import { useSyncExternalStore } from "react";
import { getApiBaseUrl } from "@/constants/oauth";
import { createApiClient, type ServerState } from "@/lib/nexora-api-core";

export {
  ApiError,
  friendlyApiError,
  timeoutFor,
  isAllowedMapNavigation,
  mapLoadTimers,
  REROUTE_TIMEOUT_MS,
  ROUTE_TIMEOUT_MS,
  SEARCH_TIMEOUT_MS,
  WAKE_TIMEOUT_MS,
  type ServerState,
} from "@/lib/nexora-api-core";

export const api = createApiClient({ baseUrl: getApiBaseUrl });

/** "waking" until the server first answers, "unreachable" if a 60 s warm-up failed. */
export function useServerState(): ServerState {
  return useSyncExternalStore(api.subscribe, api.getState, api.getState);
}
