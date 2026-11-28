import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError } from "@/lib/nexora-api";
import {
  snapshotFreshness,
  type TrafficSnapshot,
} from "@/shared/nexora/traffic";
import { ukClockLabel } from "@/shared/nexora/itinerary";

/** Client view of the server's TfL disruption feed. The app never calls TfL itself. */
export type TrafficStatus =
  | "loading"
  | "live"
  | "cached"
  | "stale"
  | "unavailable"
  | "disabled"
  | "off";

const REFRESH_MS = 3 * 60_000;
const LAYER_KEY = "nexora-traffic-layer-v1";

export function useTraffic(online: boolean) {
  const [visible, setVisibleState] = useState(true);
  const [snapshot, setSnapshot] = useState<TrafficSnapshot | null>(null);
  const [status, setStatus] = useState<TrafficStatus>("loading");
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(LAYER_KEY)
      .then((v) => {
        if (v === "off") setVisibleState(false);
      })
      .catch(() => {});
  }, []);
  const setVisible = useCallback((v: boolean) => {
    setVisibleState(v);
    AsyncStorage.setItem(LAYER_KEY, v ? "on" : "off").catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    const id = ++generation.current;
    // Through the shared client (BUG-013): a reply marks the server awake, a timeout
    // marks it waking and starts a warm-up, and the timeout follows the server state.
    api
      .json<Partial<TrafficSnapshot> & { status?: string }>(
        "/api/nexora/traffic",
      )
      .then((body) => {
        if (id !== generation.current) return;
        setNow(new Date());
        if (Array.isArray(body?.disruptions)) {
          setSnapshot(body as TrafficSnapshot);
          setStatus(
            body.status === "live" || body.status === "cached"
              ? body.status
              : "stale",
          );
        } else setStatus("unavailable");
      })
      .catch((e: unknown) => {
        if (id !== generation.current) return;
        setNow(new Date());
        const body =
          e instanceof ApiError ? (e.body as { status?: unknown } | undefined) : undefined;
        setStatus(body?.status === "disabled" ? "disabled" : "unavailable");
      });
  }, []);

  useEffect(() => {
    if (!visible || !online) return;
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, REFRESH_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [visible, online, refresh]);

  // A snapshot we hold but can no longer refresh ages into "stale" on screen.
  const shownStatus: TrafficStatus = !visible
    ? "off"
    : snapshot && (status === "unavailable" || !online)
      ? snapshotFreshness(snapshot.fetchedAt, now) === "fresh"
        ? "cached"
        : "stale"
      : status;

  return {
    visible,
    setVisible,
    status: shownStatus,
    snapshot: visible ? snapshot : null,
    disruptions: visible && snapshot ? snapshot.disruptions : [],
    refresh,
  };
}
export type TrafficModel = ReturnType<typeof useTraffic>;

/** "TfL · updated 14:05" in UK time, with the state spelled out when not live. */
export function trafficStatusLine(t: TrafficModel): string {
  // ukClockLabel uses the UK DST rule, not device ICU data (Hermes-safe).
  const when = t.snapshot
    ? ukClockLabel(Date.parse(t.snapshot.fetchedAt))
    : null;
  switch (t.status) {
    case "live":
      return `Live TfL disruptions · fetched ${when}`;
    case "cached":
      return `TfL disruptions from ${when} · could not refresh`;
    case "stale":
      return `Out of date: TfL disruptions from ${when}. Not live.`;
    case "loading":
      return "Loading TfL disruptions…";
    case "disabled":
      return "Live disruptions are turned off on this server";
    case "off":
      return "Disruption layer hidden";
    default:
      return "TfL disruptions unavailable · nothing shown";
  }
}
