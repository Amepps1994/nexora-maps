/**
 * Android Auto (and, once Apple grants the entitlement, CarPlay) navigation screen.
 *
 * Built on @iternio/react-native-auto-play (MIT), which wraps Google's Android for Cars
 * App Library and Apple's CarPlay framework. The car shows:
 *  - a MapTemplate whose surface draws the route overview (react-native-svg, no tiles),
 *  - the host's own manoeuvre card and travel estimates while guidance runs,
 *  - Mute and End buttons that call back into the phone's navigation via the bus.
 *
 * Everything here is unverified for road use until tested in a real car (ROADMAP
 * CAR-DISPLAYS). Simulated guidance is labelled as simulation on the car screen.
 */
import React, { useEffect, useState } from "react";
import { Platform, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import Constants from "expo-constants";
import {
  carHostDistance,
  formatCarDistance,
  formatCarDuration,
  type CarGuidanceSnapshot,
  type CarManeuver,
} from "@/shared/nexora/car-guidance";
import { sendCarCommand, subscribeCarGuidance } from "./guidance-bus";
import { CAR_GLYPHS, CAR_ICON_FONT, type CarGlyphName } from "./car-icons";
import { readCarFlags, type CarConnection } from "./car-status";
import type {
  MapTemplateConfig,
  RoutingManeuver,
} from "@iternio/react-native-auto-play";

type AutoPlay = typeof import("@iternio/react-native-auto-play");
type MapTemplateInstance = InstanceType<AutoPlay["MapTemplate"]>;

let started = false;
let connection: CarConnection = "unsupported";
const connectionListeners = new Set<(c: CarConnection) => void>();

function setConnection(next: CarConnection) {
  connection = next;
  for (const l of [...connectionListeners]) l(next);
}

export function getCarConnection(): CarConnection {
  return connection;
}

export function subscribeCarConnection(
  listener: (c: CarConnection) => void,
): () => void {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  } catch {
    return "Europe/London";
  }
}

function glyphFor(m: CarManeuver): CarGlyphName {
  switch (m.kind) {
    case "arrive":
    case "waypoint":
      return "flag";
    case "depart":
      return "navigation";
    case "roundabout":
      return "roundabout-left"; // UK: clockwise roundabouts
    case "fork":
      return m.direction.includes("right") ? "fork-right" : "fork-left";
    case "on-ramp":
    case "off-ramp":
      return m.direction.includes("right") ? "ramp-right" : "ramp-left";
    case "ferry":
      return "directions-boat";
    case "keep":
      return "merge";
    case "straight":
      return "straight";
    case "turn":
    default:
      switch (m.direction) {
        case "left":
          return "turn-left";
        case "right":
          return "turn-right";
        case "slight-left":
          return "turn-slight-left";
        case "slight-right":
          return "turn-slight-right";
        case "sharp-left":
          return "turn-sharp-left";
        case "sharp-right":
          return "turn-sharp-right";
        case "uturn":
          return "u-turn-right";
        default:
          return "straight";
      }
  }
}

function hostManeuverFields(
  lib: AutoPlay,
  m: CarManeuver,
): Record<string, unknown> {
  const {
    ManeuverType,
    TurnType,
    ForkType,
    OffRampType,
    OnRampType,
    KeepType,
  } = lib;
  const right = m.direction.includes("right");
  switch (m.kind) {
    case "depart":
      return { maneuverType: ManeuverType.Depart };
    case "arrive":
    case "waypoint":
      return { maneuverType: ManeuverType.Arrive };
    case "roundabout":
      return {
        maneuverType: ManeuverType.Roundabout,
        ...(m.exit ? { exitNumber: m.exit } : {}),
      };
    case "fork":
      return {
        maneuverType: ManeuverType.Fork,
        forkType: right ? ForkType.Right : ForkType.Left,
      };
    case "keep":
      return {
        maneuverType: ManeuverType.Keep,
        keepType: right ? KeepType.Right : KeepType.Left,
      };
    case "off-ramp":
      return {
        maneuverType: ManeuverType.OffRamp,
        offRampType: right ? OffRampType.NormalRight : OffRampType.NormalLeft,
      };
    case "on-ramp":
      return {
        maneuverType: ManeuverType.OnRamp,
        onRampType: right ? OnRampType.NormalRight : OnRampType.NormalLeft,
      };
    case "ferry":
      return { maneuverType: ManeuverType.EnterFerry };
    case "straight":
      return { maneuverType: ManeuverType.Straight };
    default: {
      const turn: Record<string, number> = {
        left: TurnType.NormalLeft,
        right: TurnType.NormalRight,
        "slight-left": TurnType.SlightLeft,
        "slight-right": TurnType.SlightRight,
        "sharp-left": TurnType.SharpLeft,
        "sharp-right": TurnType.SharpRight,
        uturn: TurnType.UTurnRight,
        straight: TurnType.NoTurn,
      };
      return {
        maneuverType: ManeuverType.Turn,
        turnType: turn[m.direction] ?? TurnType.NoTurn,
      };
    }
  }
}

function travelEstimates(s: CarGuidanceSnapshot, toNext: boolean) {
  const meters = toNext
    ? (s.distanceToNextM ?? 0)
    : (s.remainingDistanceM ?? 0);
  const seconds = toNext
    ? Math.round(
        ((s.remainingDurationS ?? 0) * (s.distanceToNextM ?? 0)) /
          Math.max(1, s.remainingDistanceM ?? 1),
      )
    : (s.remainingDurationS ?? 0);
  return {
    distanceRemaining: carHostDistance(meters, s.metric),
    timeRemaining: { timezone: timeZone(), seconds },
  };
}

function destinationPoint(s: CarGuidanceSnapshot) {
  const [lon, lat] = s.destinationCoordinate ?? [0, 0];
  return {
    latitude: lat,
    longitude: lon,
    name: s.destinationName || "Destination",
    travelEstimates: travelEstimates(s, false),
  };
}

/** Route overview drawn on the car surface. No map tiles: tiles need a licensed provider. */
function CarMapScreen() {
  const [s, setS] = useState<CarGuidanceSnapshot | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => subscribeCarGuidance(setS), []);
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });

  let points = "";
  let dot: { x: number; y: number } | null = null;
  if (s && s.geometry.length > 1 && size.width > 0) {
    const lons = s.geometry.map((c) => c[0]);
    const lats = s.geometry.map((c) => c[1]);
    const minX = Math.min(...lons),
      maxX = Math.max(...lons),
      minY = Math.min(...lats),
      maxY = Math.max(...lats);
    const k = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
    const spanX = Math.max(1e-6, (maxX - minX) * k);
    const spanY = Math.max(1e-6, maxY - minY);
    const pad = 48;
    const scale = Math.min(
      (size.width - pad * 2) / spanX,
      (size.height - pad * 2) / spanY,
    );
    const ox = (size.width - spanX * scale) / 2;
    const oy = (size.height - spanY * scale) / 2;
    const project = (c: [number, number]) => ({
      x: ox + (c[0] - minX) * k * scale,
      y: oy + (maxY - c[1]) * scale,
    });
    points = s.geometry
      .map(project)
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    if (s.position) dot = project(s.position);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }} onLayout={onLayout}>
      {points ? (
        <Svg
          width={size.width}
          height={size.height}
          style={{ position: "absolute" }}
        >
          <Polyline
            points={points}
            fill="none"
            stroke="#3B82F6"
            strokeWidth={8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {dot ? (
            <Circle
              cx={dot.x}
              cy={dot.y}
              r={12}
              fill="#FFFFFF"
              stroke="#3B82F6"
              strokeWidth={5}
            />
          ) : null}
        </Svg>
      ) : null}
      <View style={{ position: "absolute", left: 16, bottom: 16, right: 16 }}>
        {s && !s.active && s.next && s.phase === "preview" ? (
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "600" }}>
            {s.destinationName ?? "Route"} ·{" "}
            {formatCarDistance(s.remainingDistanceM ?? 0, s.metric)} ·{" "}
            {formatCarDuration(s.remainingDurationS ?? 0)}
          </Text>
        ) : null}
        <Text style={{ color: "#CBD5E1", fontSize: 14, marginTop: 4 }}>
          {s ? s.statusLine : "Plan a route on your phone to start"}
        </Text>
        <Text style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>
          NEXORA · route overview only, no map tiles
        </Text>
      </View>
    </View>
  );
}

function syncTemplate(
  lib: AutoPlay,
  template: MapTemplateInstance,
  s: CarGuidanceSnapshot,
  nav: { tripId: string | null },
) {
  if (s.active && s.tripId) {
    if (nav.tripId !== s.tripId) {
      if (nav.tripId) template.stopNavigation();
      nav.tripId = s.tripId;
      const point = destinationPoint(s);
      template
        .startNavigation({
          id: s.tripId,
          routeChoice: {
            id: s.tripId,
            summaryVariants: [point.name],
            additionalInformationVariants: [s.statusLine],
            selectionSummaryVariants: [s.statusLine],
            steps: [point],
          },
        })
        .catch(() => {});
    }
    if (s.phase === "rerouting") {
      template.updateManeuvers({
        type: "loading",
        cardBackgroundColor: "#0B1220",
        text: "Rerouting",
      });
    } else if (s.next) {
      const maneuver = {
        id: `${s.tripId}:${s.next.coordinate.join(",")}:${s.next.kind}`,
        type: "routing",
        travelEstimates: travelEstimates(s, true),
        trafficSide: lib.TrafficSide.Left, // UK driving; roundabouts clockwise
        ...(s.next.roadName ? { roadName: [s.next.roadName] } : {}),
        ...hostManeuverFields(lib, s.next),
        attributedInstructionVariants: [{ text: s.next.instruction }],
        symbolImage: {
          type: "glyph",
          name: glyphFor(s.next),
          color: "default",
        },
        cardBackgroundColor: s.simulated ? "#334155" : "#0B1220",
      } as unknown as RoutingManeuver;
      template.updateManeuvers([maneuver]);
    }
    template.updateTravelEstimates([destinationPoint(s)]);
  } else if (nav.tripId) {
    template.stopNavigation();
    nav.tripId = null;
  }
}

function connect(lib: AutoPlay, sessionId: number) {
  const nav = { tripId: null as string | null };
  const isCurrent = () =>
    lib.HybridAutoPlay.getCurrentSessionId() === sessionId;
  const config: MapTemplateConfig = {
    component: CarMapScreen,
    onStopNavigation: () => {
      nav.tripId = null;
      sendCarCommand("stop");
    },
    headerActions: {
      android: [
        {
          type: "image",
          image: { type: "glyph", name: "volume-off", color: "default" },
          onPress: () => sendCarCommand("toggleMute"),
        },
        {
          type: "image",
          image: { type: "glyph", name: "close", color: "default" },
          onPress: () => sendCarCommand("stop"),
        },
      ],
      ios: {
        trailingNavigationBarButtons: [
          {
            type: "text",
            title: "Mute",
            onPress: () => sendCarCommand("toggleMute"),
          },
          { type: "text", title: "End", onPress: () => sendCarCommand("stop") },
        ],
      },
    },
  };
  const template: MapTemplateInstance = new lib.MapTemplate(config);
  template.setRootTemplate();
  const unsubscribe = subscribeCarGuidance((s) => {
    if (!isCurrent()) return;
    try {
      syncTemplate(lib, template, s, nav);
    } catch (e) {
      console.warn("[NEXORA car] update failed", e);
    }
  });
  const off = lib.HybridAutoPlay.addListener("didDisconnect", (id) => {
    if (id !== sessionId) return;
    unsubscribe();
    off();
  });
}

/**
 * Register car templates. Safe to call at startup with no car connected; a no-op when the
 * platform's car integration is switched off in app.config.ts (extra.carDisplays).
 */
export function startCarDisplays(): void {
  if (started) return;
  started = true;
  const flags = readCarFlags(Constants.expoConfig?.extra);
  const enabled =
    (Platform.OS === "android" && flags.androidAuto) ||
    (Platform.OS === "ios" && flags.carPlay);
  if (!enabled) return;
  try {
    // Required lazily: on iOS without the CarPlay entitlement the native module is not
    // linked at all (react-native.config.js), so a top-level import would throw.
    const lib: AutoPlay = require("@iternio/react-native-auto-play");
    lib.setIconFont(CAR_ICON_FONT, CAR_GLYPHS);
    setConnection("disconnected");
    lib.HybridAutoPlay.addListener("didConnect", (sessionId) => {
      setConnection("connected");
      try {
        connect(lib, sessionId);
      } catch (e) {
        console.warn("[NEXORA car] could not build car screen", e);
      }
    });
    lib.HybridAutoPlay.addListener("didDisconnect", () =>
      setConnection("disconnected"),
    );
  } catch (e) {
    setConnection("unsupported");
    console.warn("[NEXORA car] car display library unavailable", e);
  }
}
