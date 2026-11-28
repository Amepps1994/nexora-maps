/**
 * Device side of live turn-by-turn guidance: foreground GPS watch, map matching,
 * off-route rerouting through rerouteDecision(), spoken prompts and keep-awake.
 *
 * Foreground only: no background location, no foreground service. Guidance stops
 * when the app leaves the screen. DEVICE_TEST_PLAN LG-1..LG-10 cover it on a
 * physical device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { Coord, Route } from "@/shared/nexora/domain";
import { judgeRerouteCandidate } from "@/shared/nexora/reroute";
import {
  checkStale,
  guidanceView,
  indexRoute,
  initialTracker,
  nextPrompt,
  stopsPassed,
  trackFix,
  type GuidanceMode,
  type RouteIndex,
  type TrackerState,
} from "@/shared/nexora/guidance";
import type { LiveStartResult } from "@/components/nexora/screen-logic";
import { liveWatchAttempts } from "@/lib/live-watch-options";

const KEEP_AWAKE_TAG = "nexora-live-guidance";
/** Minimum gap between reroute requests, so a confirmed off-route state cannot spam the provider. */
const REROUTE_REQUEST_GAP_MS = 15_000;

export type LiveStatus =
  | "off"
  | "acquiring"
  | "on-route"
  | "weak-signal"
  | "off-route"
  | "rerouting"
  | "arrived"
  | "denied"
  | "error";

function safeIndex(route: Route | undefined): RouteIndex | null {
  if (!route) return null;
  try {
    return indexRoute(route);
  } catch {
    return null;
  }
}

/** Speak a prompt, cutting off anything still being read so prompts are never queued late. */
export function say(text: string) {
  try {
    Speech.stop();
    Speech.speak(text, { language: "en-GB", rate: 1 });
  } catch {
    // Voice is an enhancement; the banner still shows the instruction.
  }
}

/**
 * Spoken prompts for any guidance source (simulated playback or live GPS).
 * `tripKey` changes when a new trip starts; a new route object (reroute) also resets.
 */
export function useSpokenGuidance(opts: {
  route: Route | undefined;
  /** Fraction of the route travelled, or null when there is no trustworthy position. */
  progress: number | null;
  mode: GuidanceMode;
  metric: boolean;
  enabled: boolean;
  tripKey: string;
}) {
  const { route, progress, mode, metric, enabled, tripKey } = opts;
  const index = useMemo(() => safeIndex(route), [route]);
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    spoken.current = new Set();
  }, [tripKey, index]);
  useEffect(() => {
    if (!index || progress === null) return;
    const alongM = Math.max(0, Math.min(1, progress)) * index.totalM;
    const { prompt, skip } = nextPrompt(index, alongM, mode, metric, spoken.current);
    skip.forEach((k) => spoken.current.add(k));
    if (!prompt) return;
    spoken.current.add(prompt.key);
    if (enabled) say(prompt.text);
  }, [index, progress, mode, metric, enabled]);
  useEffect(() => {
    if (!enabled) Speech.stop().catch(() => {});
  }, [enabled]);
  useEffect(() => () => void Speech.stop().catch(() => {}), []);
}

export interface LiveUpdate {
  status: LiveStatus;
  /** Fraction of the current route travelled; null until the first matched fix. */
  progress: number | null;
}

export function useLiveGuidance(opts: {
  route: Route | undefined;
  mode: GuidanceMode;
  routeMode: "automatic" | "ask" | "locked";
  /** Fetch a candidate from the current position, skipping stops already reached. */
  requestReroute: (from: Coord, stopsPassed: number) => Promise<Route | null>;
  applyReroute: (route: Route) => void;
  speak: (text: string) => void;
  /** Called from location events (not effects) whenever status or progress changes. */
  onUpdate?: (update: LiveUpdate) => void;
}) {
  const { route } = opts;
  const index = useMemo(() => safeIndex(route), [route]);
  const [running, setRunning] = useState(false);
  // The tracker belongs to one route index; a new route (reroute) starts a fresh match.
  const [tracked, setTracked] = useState<{ index: RouteIndex | null; state: TrackerState }>(
    () => ({ index: null, state: initialTracker() }),
  );
  const [rerouting, setRerouting] = useState(false);
  const [failure, setFailure] = useState<"denied" | "error" | null>(null);
  const [event, setEvent] = useState("");
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const generation = useRef(0);
  const trackedRef = useRef(tracked);
  const indexRef = useRef(index);
  const reroutingRef = useRef(false);
  const lastRerouteAt = useRef<number | null>(null);
  const lastRequestAt = useRef(0);
  const callbacks = useRef(opts);
  useEffect(() => {
    callbacks.current = opts;
    indexRef.current = index;
  });

  const tracker = tracked.index === index ? tracked.state : initialTracker();

  const publish = useCallback((idx: RouteIndex, state: TrackerState) => {
    const value = { index: idx, state };
    trackedRef.current = value;
    setTracked(value);
    callbacks.current.onUpdate?.({
      status: reroutingRef.current ? "rerouting" : state.status,
      progress:
        state.status === "acquiring" ? null : guidanceView(idx, state.alongM).progress,
    });
  }, []);

  const setReroutingFlag = useCallback((value: boolean) => {
    reroutingRef.current = value;
    setRerouting(value);
  }, []);

  /** Confirmed off-route: fetch a candidate, then let rerouteDecision() decide. */
  const maybeReroute = useCallback(
    (idx: RouteIndex, state: TrackerState, token: number) => {
      if (!state.offRouteConfirmed || reroutingRef.current || !state.position) return;
      const now = Date.now();
      if (now - lastRequestAt.current < REROUTE_REQUEST_GAP_MS) return;
      lastRequestAt.current = now;
      setReroutingFlag(true);
      callbacks.current.onUpdate?.({ status: "rerouting", progress: null });
      callbacks.current.speak("Off route. Finding a new route.");
      const view = guidanceView(idx, state.alongM);
      callbacks.current
        .requestReroute(state.position, stopsPassed(idx, state.alongM))
        .then((candidate) => {
          if (token !== generation.current) return;
          // Judge the candidate on the fix that confirmed the off-route (moving), not
          // on the fix at reply time: stopping at lights must not discard it (BUG-007).
          const decision = judgeRerouteCandidate({
            requested: state,
            latest: trackedRef.current.state,
            currentRemainingS: view.remainingS,
            candidateRemainingS: candidate ? candidate.durationS : NaN,
            routeMode: callbacks.current.routeMode,
            lastRerouteAt: lastRerouteAt.current,
            now: Date.now(),
          });
          if (decision.reroute && candidate) {
            lastRerouteAt.current = Date.now();
            setEvent("New route from your position.");
            callbacks.current.applyReroute(candidate);
          } else {
            setEvent(decision.reason);
          }
        })
        .catch(() => {
          // requestReroute has a 10 s timeout, so a hung request lands here and the
          // finally below releases the rerouting flag.
          if (token === generation.current)
            setEvent("Reroute failed. Return to the highlighted route or stop safely.");
        })
        .finally(() => {
          if (token !== generation.current) return;
          setReroutingFlag(false);
          const current = trackedRef.current;
          if (current.index) publish(current.index, current.state);
        });
    },
    [publish, setReroutingFlag],
  );

  const stop = useCallback(() => {
    generation.current += 1;
    subscription.current?.remove();
    subscription.current = null;
    setRunning(false);
    setReroutingFlag(false);
    setEvent("");
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  }, [setReroutingFlag]);

  const start = useCallback(async (): Promise<LiveStartResult> => {
    stop();
    const token = ++generation.current;
    setFailure(null);
    lastRerouteAt.current = null;
    lastRequestAt.current = 0;
    const fail = (kind: "denied" | "error") => {
      setFailure(kind);
      callbacks.current.onUpdate?.({ status: kind, progress: null });
    };
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (token !== generation.current) return "error";
      if (permission.status !== "granted") {
        setFailure("denied");
        return permission.canAskAgain === false ? "blocked" : "denied";
      }
      if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
        if (token === generation.current) setFailure("error");
        return "services-off";
      }
      if (token !== generation.current) return "error";
      const reset = { index: null, state: initialTracker() };
      trackedRef.current = reset;
      setTracked(reset);
      const attempts = liveWatchAttempts({
        best: Location.Accuracy.BestForNavigation,
        high: Location.Accuracy.High,
      });
      let attempt = 0;
      let gotFix = false;
      const onFix = (location: Location.LocationObject) => {
        const idx = indexRef.current;
        if (token !== generation.current || !idx) return;
        gotFix = true;
        const previous =
          trackedRef.current.index === idx
            ? trackedRef.current.state
            : initialTracker();
        const next = trackFix(
          idx,
          previous,
          {
            coord: [location.coords.longitude, location.coords.latitude],
            accuracyM: location.coords.accuracy ?? null,
            speedMps: location.coords.speed ?? null,
            timestamp: location.timestamp,
          },
          callbacks.current.mode,
        );
        if (next === previous && trackedRef.current.index === idx) return;
        publish(idx, next);
        maybeReroute(idx, next, token);
      };
      // Opens the watch with the current attempt's options, moving on to the
      // next attempt when one is rejected (Android "Location Accuracy" declined).
      const openWatch = async (): Promise<Location.LocationSubscription> => {
        for (;;) {
          try {
            return await Location.watchPositionAsync(
              attempts[attempt],
              onFix,
              onError,
            );
          } catch (e) {
            if (token !== generation.current || attempt + 1 >= attempts.length)
              throw e;
            attempt += 1;
          }
        }
      };
      // Some Android versions report the declined dialog through the error
      // callback instead of a rejection: retry once before any fix arrives.
      const onError = () => {
        if (token !== generation.current) return;
        if (!gotFix && attempt + 1 < attempts.length) {
          attempt += 1;
          subscription.current?.remove();
          subscription.current = null;
          openWatch()
            .then((sub) => {
              if (token !== generation.current) sub.remove();
              else subscription.current = sub;
            })
            .catch(() => {
              if (token === generation.current) fail("error");
            });
          return;
        }
        fail("error");
      };
      const sub = await openWatch();
      if (token !== generation.current) {
        sub.remove();
        return "error";
      }
      subscription.current = sub;
      setRunning(true);
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      return "ok";
    } catch {
      if (token === generation.current) setFailure("error");
      return "error";
    }
  }, [stop, publish, maybeReroute]);

  useEffect(() => stop, [stop]);

  // Fixes stopped arriving (tunnel, permission revoked in system settings).
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const { index: idx, state } = trackedRef.current;
      if (!idx) return;
      const next = checkStale(state, Date.now());
      if (next !== state) publish(idx, next);
    }, 2000);
    return () => clearInterval(timer);
  }, [running, publish]);

  const view = index ? guidanceView(index, tracker.alongM) : null;
  const status: LiveStatus = failure
    ? failure
    : !running
      ? "off"
      : rerouting
        ? "rerouting"
        : tracker.status;
  return {
    running,
    status,
    start,
    stop,
    event,
    tracker,
    alongM: running && tracker.status !== "acquiring" ? tracker.alongM : null,
    position: running ? (tracker.position ?? undefined) : undefined,
    progress: view?.progress ?? 0,
    remainingM: view?.remainingM ?? 0,
    remainingS: view?.remainingS ?? 0,
    step: view?.step,
    speedMps: tracker.speedMps,
    accuracyM: tracker.accuracyM,
  };
}
