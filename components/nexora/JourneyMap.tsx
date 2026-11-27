import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { getApiBaseUrl } from "@/constants/oauth";
import {
  api,
  isAllowedMapNavigation,
  mapLoadTimers,
  useServerState,
} from "@/lib/nexora-api";
import type { Coord, Place } from "@/shared/nexora/domain";
import type { OfflineMapPack } from "@/hooks/use-offline-regions";

export type MapData = {
  controlTop: number;
  dark: boolean;
  reducedMotion: boolean;
  places: Place[];
  destination?: Coord;
  /** Intermediate stops, in order. */
  stops?: Coord[];
  route?: Coord[];
  synthetic?: boolean;
  position?: Coord;
  gps?: Coord;
  center?: Coord;
  zoom?: number;
  command?: string;
  /** TfL disruptions to draw. Title is plain text; the map renders it as text, not HTML. */
  traffic?: {
    id: string;
    point: Coord;
    lines: Coord[][];
    closure: boolean;
    planned: boolean;
    title: string;
  }[];
};
export default function JourneyMap({
  data,
  onPin,
  onPlace,
  onNetwork,
  offlinePack,
  preferOffline,
}: {
  data: MapData;
  onPin: (c: Coord) => void;
  onPlace: (id: string) => void;
  onNetwork: (online: boolean) => void;
  /** Installed offline region (native only). Used when preferred or when the online map fails. */
  offlinePack?: OfflineMapPack | null;
  preferOffline?: boolean;
}) {
  const web = useRef<HTMLIFrameElement>(null);
  const native = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Still loading after 8 s: the free server is probably waking up (BUG-001). */
  const [waiting, setWaiting] = useState(false);
  const serverState = useServerState();
  const [attempt, setAttempt] = useState(0);
  const [fellBack, setFellBack] = useState(false);
  const url = `${getApiBaseUrl()}/api/nexora/map?attempt=${attempt}`;
  const pack = Platform.OS !== "web" ? offlinePack : null;
  const useOffline = Boolean(pack && (preferOffline || fellBack));
  const mode = useOffline ? `offline-${pack?.regionId}` : `online-${attempt}`;
  // A new map source starts fresh (adjusting state during render, not in an effect).
  const [seenMode, setSeenMode] = useState(mode);
  if (seenMode !== mode) {
    setSeenMode(mode);
    setReady(false);
    setFailed(false);
    setWaiting(false);
  }
  // The online map could not load: switch to the installed offline region instead.
  if (failed && pack && !useOffline && !fellBack) setFellBack(true);
  // Without an offline pack, wait up to 60 s for a sleeping server instead of giving
  // up at 10 s; with one, keep falling back to it after 10 s as before.
  const timers = mapLoadTimers({
    offlinePack: Boolean(pack),
    usingOffline: useOffline,
  });
  useEffect(() => {
    if (ready) return;
    if (!useOffline) api.warmUp().catch(() => {});
    const waking =
      timers.wakingAfterMs === null
        ? null
        : setTimeout(() => setWaiting(true), timers.wakingAfterMs);
    const timeout = setTimeout(() => setFailed(true), timers.failAfterMs);
    return () => {
      if (waking) clearTimeout(waking);
      clearTimeout(timeout);
    };
  }, [ready, mode, useOffline, timers.wakingAfterMs, timers.failAfterMs]);
  // The 60 s warm-up gave up: no point waiting for the map page either.
  if (serverState === "unreachable" && !ready && !failed && !useOffline)
    setFailed(true);
  // An early load error (e.g. Render's 502 page while booting) is retried, not shown,
  // until the wait above runs out.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    },
    [],
  );
  function loadError() {
    // With a pack installed, fail now so the existing fallback switches to it.
    if (useOffline || pack || Platform.OS === "web") return setFailed(true);
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      native.current?.reload();
    }, 3000);
  }
  const packRef = useRef(pack);
  useEffect(() => {
    packRef.current = pack;
  }, [pack]);
  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  })();
  const latest = useRef({ onPin, onPlace, onNetwork });
  useEffect(() => {
    latest.current = { onPin, onPlace, onNetwork };
  }, [onPin, onPlace, onNetwork]);
  function handle(message: any) {
    if (message.type === "ready") {
      setReady(true);
      setFailed(false);
      setWaiting(false);
    }
    if (message.type === "pin" && Array.isArray(message.coordinate))
      latest.current.onPin(message.coordinate);
    if (message.type === "place" && typeof message.id === "string")
      latest.current.onPlace(message.id);
    if (message.type === "network")
      latest.current.onNetwork(Boolean(message.online));
    if (
      message.type === "bytes" &&
      Number.isInteger(message.id) &&
      Number.isInteger(message.offset) &&
      Number.isInteger(message.length) &&
      message.length > 0 &&
      message.length <= 16 * 1024 * 1024
    ) {
      let reply: string;
      try {
        const b64 = packRef.current?.read(message.offset, message.length);
        reply =
          b64 == null
            ? `window.nexoraBytes(${message.id},null,"Offline pack closed");true;`
            : `window.nexoraBytes(${message.id},${JSON.stringify(b64)});true;`;
      } catch {
        reply = `window.nexoraBytes(${message.id},null,"Offline pack unreadable");true;`;
      }
      native.current?.injectJavaScript(reply);
    }
  }
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== web.current?.contentWindow ||
        event.origin !== origin ||
        !event.data?.nexora
      )
        return;
      handle(event.data);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [origin]);
  useEffect(() => {
    if (!ready) return;
    if (Platform.OS === "web")
      web.current?.contentWindow?.postMessage(
        { nexoraMap: true, data },
        origin,
      );
    else
      native.current?.injectJavaScript(
        `window.nexoraUpdate(${JSON.stringify(data)});true;`,
      );
  }, [data, ready, origin]);
  const frame =
    Platform.OS === "web" ? (
      React.createElement("iframe", {
        ref: web,
        src: url,
        title:
          "Interactive London planning map. Tap to drop a destination pin.",
        style: { border: 0, width: "100%", height: "100%" },
        onError: () => setFailed(true),
      })
    ) : (
      <WebView
        key={mode}
        ref={native}
        source={
          useOffline && pack
            ? { html: pack.html, baseUrl: "about:blank" }
            : { uri: url }
        }
        userAgent="NEXORA-Maps/0.1 (private planning preview)"
        javaScriptEnabled
        onMessage={(e) => {
          try {
            handle(JSON.parse(e.nativeEvent.data));
          } catch {
            /* ignore invalid bridge payload */
          }
        }}
        onError={loadError}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) loadError();
        }}
        // Only the API origin and the in-memory offline page (SEC-009).
        originWhitelist={[origin || "https://*", "about:*"]}
        onShouldStartLoadWithRequest={(req) =>
          isAllowedMapNavigation(req.url, url, useOffline)
        }
        style={styles.map}
      />
    );
  return (
    <View style={styles.map}>
      {frame}
      {waiting && !ready && !failed && (
        <View
          style={styles.waking}
          accessibilityRole="progressbar"
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            serverState === "ready"
              ? "Loading the map"
              : "Waking the map server"
          }
        >
          <ActivityIndicator color="#087F73" />
          <Text style={styles.wakingText}>
            {serverState === "ready"
              ? "Loading the map…"
              : "Waking the map server… This can take up to a minute."}
          </Text>
        </View>
      )}
      {failed && (
        <View style={styles.error}>
          <Text style={styles.errorText}>
            {useOffline
              ? "Offline map pack could not be opened. Re-download it in Settings."
              : "Map unavailable. Check your connection, or download the London offline map in Settings."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry map"
            onPress={() => {
              setReady(false);
              setFailed(false);
              setWaiting(false);
              setFellBack(false);
              // A failed warm-up is tried again with the map.
              if (api.getState() === "unreachable")
                api.warmUp().catch(() => {});
              setAttempt((a) => a + 1);
            }}
            style={{
              minHeight: 48,
              backgroundColor: "#087F73",
              borderRadius: 12,
              marginTop: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Retry map</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: "#E8EEE9" },
  error: {
    position: "absolute",
    top: "42%",
    left: 30,
    right: 30,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
  },
  errorText: { color: "#0B1220", fontSize: 16 },
  waking: {
    position: "absolute",
    top: "42%",
    left: 30,
    right: 30,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wakingText: { color: "#0B1220", fontSize: 16, flex: 1 },
});
