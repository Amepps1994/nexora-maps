import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import JourneyMap from "./JourneyMap";
import { useOfflineRegions } from "@/hooks/use-offline-regions";
import { Badge, Button, Icon, IconButton, Mark, palette } from "./ui";
import { maneuverIcon } from "@/shared/nexora/maneuver";
import { Panels, type AppModel } from "./Panels";
import { useNexora } from "@/hooks/use-nexora";
import { useTraffic } from "@/hooks/use-traffic";
import { CHIP_CATEGORIES, PLACE_CATEGORIES } from "@/shared/nexora/places";
import { distanceLabel, durationLabel } from "@/shared/nexora/domain";
import { StepList } from "./StepList";
import { liveAckRequired, saveLiveAck } from "./live-ack";
import { requestGuidanceNotifications } from "@/lib/car/lock-screen-guidance";
import { DEV_TOOLS } from "@/lib/dev-tools";
import {
  a11yColors,
  backAction,
  endButtonAction,
  nextAnnouncement,
  nextStepAnnouncement,
  serverBanner,
  shouldAutoOpenOnboarding,
  stepAnnouncement,
  stepIdentity,
} from "./screen-logic";

const LIVE_LABEL: Record<string, string> = {
  acquiring: "Waiting for GPS…",
  "on-route": "On route",
  "weak-signal": "Weak GPS signal · position uncertain",
  "off-route": "Off route",
  rerouting: "Finding a new route…",
  arrived: "Arrived",
  denied: "Location permission needed",
  error: "Location unavailable",
  off: "",
};

export default function NexoraApp() {
  const n = useNexora();
  const traffic = useTraffic(n.online);
  const offline = useOfflineRegions();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= 760;
  const landscape = width > height;
  const dark = n.prefs.dark;
  const surface = dark ? "#152235" : "#fff";
  const ink = dark ? "#EDF4F1" : palette.ink;
  const muted = dark ? "#A0B4AF" : palette.muted;
  const navHeight = 70 + (desktop ? 0 : insets.bottom);
  const left = desktop ? 28 : 16;
  const sheetWidth = desktop ? 424 : width - 24;
  // Live places on the map: the category being browsed, else nearby highlights.
  const mapPlaces = useMemo(
    () => (n.browsing && n.searchResults) || n.highlights || [],
    [n.browsing, n.searchResults, n.highlights],
  );
  const mapData = useMemo(
    () => ({
      dark,
      controlTop: desktop ? 76 : 205,
      reducedMotion: n.prefs.reducedMotion,
      places: mapPlaces,
      destination: n.destination?.coordinate,
      stops: n.stops.map((stop) => stop.coordinate),
      route: n.route?.geometry,
      synthetic: n.route?.demo,
      position: n.position,
      gps: n.gps,
      center: n.center,
      command: n.mapCommand,
      traffic: traffic.disruptions.map((d) => ({
        id: d.id,
        point: d.point,
        lines: d.lines,
        closure: d.closure,
        planned: d.planned,
        title: `${d.closure ? "Closure · " : ""}${d.severity} · ${d.summary}${d.planned ? " (planned)" : ""} · TfL`,
      })),
    }),
    [
      dark,
      desktop,
      n.prefs.reducedMotion,
      n.destination,
      n.stops,
      n.route,
      n.position,
      n.gps,
      n.center,
      n.mapCommand,
      traffic.disruptions,
      mapPlaces,
    ],
  );
  const navNames = [
    ["Home", "map"],
    ["Trips", "navigation"],
    ["Saved", "bookmark"],
    ["Settings", "sliders"],
  ] as const;
  const top = Math.max(insets.top, desktop ? 22 : 18);
  const colors = a11yColors(dark);
  const formatDistance = (m: number) => distanceLabel(m, n.prefs.metric);

  // BUG-009: show the first-run sheet once, after local data has loaded.
  const onboardingOpened = useRef(false);
  useEffect(() => {
    if (
      shouldAutoOpenOnboarding(
        n.hydrated,
        n.prefs.onboardingSeen,
        onboardingOpened.current,
      )
    ) {
      onboardingOpened.current = true;
      // Marked seen as soon as it is shown, so dismissing it also counts.
      n.setPrefs((p) => ({ ...p, onboardingSeen: true }));
      if (!n.panel) n.setPanel("onboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.hydrated, n.prefs.onboardingSeen]);

  // UX-003: the first live GPS start per install and app version shows a
  // short road-safety notice.
  const [liveAckOpen, setLiveAckOpen] = useState(false);
  const liveUi = {
    ackOpen: liveAckOpen,
    requestLive: async () => {
      if (await liveAckRequired()) {
        setLiveAckOpen(true);
        return;
      }
      // UX-010: any notification prompt appears before guidance starts.
      await requestGuidanceNotifications("live-start", n.active);
      n.start("live");
    },
    acceptLive: async () => {
      await saveLiveAck();
      await requestGuidanceNotifications("live-ack", n.active);
      setLiveAckOpen(false);
      n.start("live");
    },
    cancelLive: () => setLiveAckOpen(false),
  };
  // Leaving the routes sheet drops the acknowledgement (state adjusted
  // during render, React's pattern for state derived from props).
  const [ackPanel, setAckPanel] = useState(n.panel);
  if (ackPanel !== n.panel) {
    setAckPanel(n.panel);
    if (n.panel !== "routes") setLiveAckOpen(false);
  }

  // BUG-008: hardware back closes the innermost thing first and never ends
  // guidance without asking.
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmActive, setConfirmActive] = useState(n.active);
  if (confirmActive !== n.active) {
    setConfirmActive(n.active);
    if (!n.active) setConfirmEnd(false);
  }
  const onBack = useRef<() => boolean>(() => false);
  useEffect(() => {
    onBack.current = () => {
      const action = backAction({
        panel: n.panel,
        active: n.active,
        confirmingEnd: confirmEnd,
        liveAckOpen,
        arrived: n.state === "arrived",
        hasDestination: Boolean(n.destination),
        tab: n.tab,
      });
      switch (action.kind) {
        case "dismiss-confirm":
          setConfirmEnd(false);
          return true;
        case "close-live-ack":
          setLiveAckOpen(false);
          return true;
        case "panel":
          n.setError("");
          n.setPanel(action.to);
          return true;
        case "confirm-end":
          setConfirmEnd(true);
          return true;
        case "reset":
          n.reset();
          return true;
        case "home-tab":
          n.setTab("Home");
          return true;
        default:
          return false;
      }
    };
  });
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () =>
      onBack.current(),
    );
    return () => sub.remove();
  }, []);

  // A11Y-001 / A11Y-006: announce each new step once to screen readers when
  // voice guidance is off, keyed on the step (route id + index) so distance
  // updates on every GPS fix or tick stay quiet; and every guidance event
  // (off route, GPS loss).
  const stepKey = n.active ? stepIdentity(n.route, n.step) : "";
  const stepText = n.active ? stepAnnouncement(n.step, formatDistance) : "";
  const lastStepKey = useRef("");
  useEffect(() => {
    const say = nextStepAnnouncement(
      lastStepKey.current,
      stepKey,
      stepText,
      !n.muted,
    );
    lastStepKey.current = stepKey;
    if (say) AccessibilityInfo.announceForAccessibility(say);
    // stepText is read only when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, n.muted]);
  const eventText = n.active
    ? n.event || (n.guidanceSource === "live" ? n.liveGuidance.event : "")
    : "";
  const lastEventText = useRef("");
  useEffect(() => {
    const say = nextAnnouncement(lastEventText.current, eventText, false);
    lastEventText.current = eventText;
    // Android reads the banner through its assertive live region.
    if (say && Platform.OS !== "android")
      AccessibilityInfo.announceForAccessibility(say);
  }, [eventText]);

  const [showSteps, setShowSteps] = useState(false);
  const server = serverBanner(n.serverState, n.online);
  // UX-009: the map tools sit below the top area (search, chips and the
  // server banner) so the banner always has its own slot.
  const [topAreaHeight, setTopAreaHeight] = useState(0);
  return (
    <View style={[s.root, { backgroundColor: dark ? "#0B1220" : "#E9EEEB" }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={StyleSheet.absoluteFill}>
        <JourneyMap
          data={mapData}
          onPin={n.pin}
          onPlace={(id) => {
            const p = mapPlaces.find((p) => p.id === id);
            if (p && !n.moving) {
              n.setSearchFor("destination");
              n.choosePlace(p, "destination");
            }
          }}
          onNetwork={n.setOnline}
          offlinePack={offline.mapPack}
          preferOffline={offline.preferOffline}
        />
      </View>
      {!n.active && n.state !== "arrived" && (
        <>
          <View
            pointerEvents="box-none"
            onLayout={(e) => setTopAreaHeight(e.nativeEvent.layout.height)}
            style={[
              s.topArea,
              { top, left, width: desktop ? 424 : width - 32 },
            ]}
          >
            <View style={s.brandRow}>
              <View style={[s.brand, { backgroundColor: surface }]}>
                <Mark size={26} color={dark ? "#62D6BB" : palette.teal} />
                <Text style={[s.brandText, { color: ink }]}>
                  NEXORA
                  <Text style={[s.brandMaps, { color: muted }]}> MAPS</Text>
                </Text>
              </View>
              {!n.online && (
                <Pressable
                  accessibilityLabel="View provider capabilities"
                  accessibilityRole="button"
                  onPress={() => n.setPanel("providers")}
                >
                  <Badge text="Offline · limited" warning dark={dark} />
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search a destination"
              onPress={() => n.openSearch()}
              style={[s.searchBar, { backgroundColor: surface }]}
            >
              <Icon name="search" color={muted} size={21} />
              <Text style={[s.searchPlaceholder, { color: ink }]}>
                Where would you like to go?
              </Text>
              <View
                style={[
                  s.searchDivider,
                  { backgroundColor: dark ? "#304256" : "#E6ECE9" },
                ]}
              />
              <Icon name="arrow-up-right" size={22} color={palette.teal} />
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              {CHIP_CATEGORIES.map((id) => {
                const c = PLACE_CATEGORIES[id];
                const on = n.browsing === id && n.panel === "search";
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.label} nearby`}
                    accessibilityState={{ selected: on }}
                    onPress={() => n.browse(id)}
                    style={[
                      s.chip,
                      {
                        backgroundColor: on
                          ? dark
                            ? "#1B3E3C"
                            : "#E4F3EC"
                          : surface,
                      },
                    ]}
                  >
                    <Icon
                      name={c.icon}
                      size={15}
                      color={dark ? "#62D6BB" : palette.teal}
                    />
                    <Text style={[s.chipText, { color: ink }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {server && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[
                  s.serverBanner,
                  {
                    backgroundColor: server.warning
                      ? dark
                        ? "#392D1C"
                        : "#FFF5DE"
                      : surface,
                  },
                ]}
              >
                {server.warning ? (
                  <Icon
                    name="alert-circle"
                    size={17}
                    color={dark ? "#F5B544" : palette.amber}
                  />
                ) : (
                  <ActivityIndicator size="small" color={palette.teal} />
                )}
                <Text
                  style={[
                    s.serverText,
                    {
                      color: server.warning
                        ? dark
                          ? "#F5CB7F"
                          : "#79541B"
                        : ink,
                    },
                  ]}
                >
                  {server.text}
                </Text>
              </View>
            )}
          </View>
          {desktop && (
            <View style={[s.desktopBadge, { top: top + 10, right: 26 }]}>
              <View style={[s.desktopTag, { backgroundColor: surface }]}>
                <Icon name="shield" size={15} color={palette.teal} />
                <Text style={{ fontSize: 12, color: muted }}>
                  A calmer way there.
                </Text>
                <Text style={{ fontSize: 11, color: muted }}>London · UK</Text>
              </View>
            </View>
          )}
          <View
            style={[
              s.mapTools,
              {
                right: desktop ? 26 : 16,
                top: desktop
                  ? "42%"
                  : Math.max(
                      220,
                      Math.min(height * 0.35, 300),
                      topAreaHeight ? top + topAreaHeight + 12 : 0,
                    ),
              },
            ]}
          >
            <IconButton
              name="layers"
              label="Map layers and appearance"
              dark={dark}
              onPress={() => n.setPanel("layers")}
            />
            <IconButton
              name="crosshair"
              label="Request current device location"
              dark={dark}
              onPress={n.locate}
            />
            {desktop && (
              <>
                <IconButton
                  name="plus"
                  label="Zoom map in"
                  dark={dark}
                  onPress={() => n.zoom("zoomIn")}
                />
                <IconButton
                  name="minus"
                  label="Zoom map out"
                  dark={dark}
                  onPress={() => n.zoom("zoomOut")}
                />
              </>
            )}
          </View>
        </>
      )}
      {n.active && (
        <>
          <View
            style={[
              s.turnBanner,
              {
                top,
                left,
                width: desktop ? 430 : width - 32,
                backgroundColor: surface,
              },
            ]}
          >
            <View style={s.simulationLabel}>
              <View style={s.simDot} />
              <Text style={[s.simulationText, { color: colors.safetyLabel }]}>
                {n.guidanceSource === "live"
                  ? ["LIVE", LIVE_LABEL[n.liveGuidance.status]]
                      .filter(Boolean)
                      .join(" · ")
                      .toUpperCase()
                  : "SIMULATION ONLY · NOT ROAD GUIDANCE"}
              </Text>
            </View>
            <View
              style={s.turnContent}
              accessible
              accessibilityLabel={
                stepAnnouncement(n.step, formatDistance) ||
                n.step?.instruction ||
                "Following the test route"
              }
            >
              <Icon
                name={maneuverIcon(n.step)}
                size={42}
                color={dark ? "#62D6BB" : palette.teal}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.nextDistance, { color: ink }]}>
                  {n.step
                    ? distanceLabel(n.step.distanceM, n.prefs.metric)
                    : "Continue playback"}
                </Text>
                <Text style={[s.turnText, { color: ink }]} numberOfLines={2}>
                  {n.step?.instruction || "Following the test route"}
                </Text>
              </View>
            </View>
          </View>
          {Boolean(
            n.event || (n.guidanceSource === "live" && n.liveGuidance.event),
          ) && (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={[
                s.eventBanner,
                {
                  left,
                  width: desktop ? 430 : width - 32,
                  top: top + 160,
                  backgroundColor: dark ? "#392D1C" : "#FFF5DE",
                },
              ]}
            >
              <Icon
                name="alert-circle"
                size={20}
                color={dark ? "#F5B544" : palette.amber}
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  lineHeight: 18,
                  color: dark ? "#F5CB7F" : "#79541B",
                }}
              >
                {n.event || n.liveGuidance.event}
              </Text>
            </View>
          )}
          <View
            style={[
              s.activeTools,
              { right: desktop ? 28 : 16, top: top + 275 },
            ]}
          >
            <IconButton
              name="crosshair"
              label={
                n.guidanceSource === "live"
                  ? "Recenter on your position"
                  : "Recenter simulated position"
              }
              dark={dark}
              onPress={() => {
                if (n.position) n.setCenter([...n.position]);
              }}
            />
            <View style={[s.speedTile, { backgroundColor: surface }]}>
              <Text style={[s.speedNumber, { color: ink }]}>
                {n.guidanceSource === "live" && n.liveGuidance.speedMps !== null
                  ? Math.round(
                      n.liveGuidance.speedMps *
                        (n.prefs.metric ? 3.6 : 2.23694),
                    )
                  : "—"}
              </Text>
              <Text style={[s.speedLabel, { color: muted }]}>
                {n.prefs.metric ? "km/h" : "mph"}
              </Text>
              <Text style={[s.speedUnknown, { color: muted }]}>
                Limit unknown
              </Text>
            </View>
          </View>
          <View
            style={[
              s.navPanel,
              {
                left: desktop ? 28 : 12,
                bottom: 34 + insets.bottom,
                width: sheetWidth,
                backgroundColor: surface,
                maxHeight: landscape ? "48%" : undefined,
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, gap: 15 }}
            >
              <View style={s.stats}>
                <View>
                  <Text style={[s.statNumber, { color: ink }]}>
                    {durationLabel(
                      (n.route?.durationS || 0) * (1 - n.progress),
                    )}
                  </Text>
                  <Text style={[s.statLabel, { color: muted }]}>
                    {n.guidanceSource === "live"
                      ? "remaining (provider estimate)"
                      : "simulated remaining"}
                  </Text>
                </View>
                <View style={s.statDivider} />
                <View>
                  <Text style={[s.statNumber, { color: ink }]}>
                    {distanceLabel(
                      (n.route?.distanceM || 0) * (1 - n.progress),
                      n.prefs.metric,
                    )}
                  </Text>
                  <Text style={[s.statLabel, { color: muted }]}>
                    to destination
                  </Text>
                </View>
                <View style={s.lockTag}>
                  <Icon
                    name={n.prefs.routeMode === "locked" ? "lock" : "shuffle"}
                    size={18}
                    color={palette.teal}
                  />
                </View>
              </View>
              <View
                style={[
                  s.progressTrack,
                  { backgroundColor: dark ? "#2A3B4F" : "#E8F0EB" },
                ]}
              >
                <View
                  style={{
                    height: 4,
                    width: `${n.progress * 100}%`,
                    backgroundColor: palette.teal,
                    borderRadius: 4,
                  }}
                />
              </View>
              <View style={s.navControls}>
                <View style={{ flex: 1 }}>
                  {n.guidanceSource === "live" ? (
                    <Button
                      title={n.muted ? "Voice off" : "Voice on"}
                      icon={n.muted ? "volume-x" : "volume-2"}
                      secondary={n.muted}
                      dark={dark}
                      onPress={() => n.setMuted(!n.muted)}
                    />
                  ) : (
                    <Button
                      title={
                        n.state === "rerouting"
                          ? "Recovery required"
                          : n.paused
                            ? "Resume"
                            : "Pause"
                      }
                      disabled={n.state === "rerouting"}
                      icon={n.paused ? "play" : "pause"}
                      onPress={() => n.setPaused(!n.paused)}
                    />
                  )}
                </View>
                {n.guidanceSource !== "live" && (
                  <IconButton
                    name={n.muted ? "volume-x" : "volume-2"}
                    dark={dark}
                    label={
                      n.muted
                        ? "Turn voice guidance on"
                        : "Turn voice guidance off"
                    }
                    onPress={() => n.setMuted(!n.muted)}
                  />
                )}
                {DEV_TOOLS && (
                <IconButton
                  name="flag"
                  dark={dark}
                  label="Report test incident; pause required"
                  onPress={() => {
                    if (n.moving)
                      n.setToast(
                        n.guidanceSource === "live"
                          ? "Stop safely and end guidance before entering a report."
                          : "Pause simulation before entering a test report.",
                      );
                    else n.setPanel("report");
                  }}
                />
                )}
                <IconButton
                  name="list"
                  dark={dark}
                  active={showSteps}
                  label={showSteps ? "Hide step list" : "Show step list"}
                  onPress={() => setShowSteps((v) => !v)}
                />
                <IconButton
                  name="x"
                  dark={dark}
                  label={
                    n.guidanceSource === "live"
                      ? "End live guidance"
                      : "End simulation"
                  }
                  onPress={() => {
                    // UX-005: live guidance asks first, like the back key.
                    if (endButtonAction(n.guidanceSource) === "confirm")
                      setConfirmEnd(true);
                    else n.end();
                  }}
                />
              </View>
              {showSteps && (
                <StepList
                  route={n.route}
                  current={n.step}
                  formatDistance={formatDistance}
                  dark={dark}
                />
              )}
              {n.guidanceSource !== "live" && DEV_TOOLS && (
                <>
                  <View style={s.simEvents}>
                    {[
                      ["jitter", "ETA jitter"],
                      ["tunnel", "GPS loss"],
                      ["offline", "Offline"],
                      ["closure", "Closure"],
                      ["recover", "Recover"],
                    ].map(([type, label]) => (
                      <Pressable
                        key={type}
                        accessibilityRole="button"
                        onPress={() => n.inject(type)}
                        style={[
                          s.eventButton,
                          { backgroundColor: dark ? "#23354A" : "#F0F4F1" },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            color: muted,
                            fontWeight: "600",
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={n.state === "rerouting"}
                    onPress={() => n.setProgress(1)}
                    style={s.finishLink}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: dark ? "#62D6BB" : palette.teal,
                        fontWeight: "600",
                      }}
                    >
                      Finish simulated journey
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </>
      )}
      {n.state === "arrived" && (
        <View
          style={[
            s.bottomSheet,
            {
              left: desktop ? 28 : 12,
              bottom: 38 + insets.bottom,
              width: sheetWidth,
              backgroundColor: surface,
            },
          ]}
        >
          <View style={{ padding: 26, gap: 18, alignItems: "center" }}>
            <View style={s.arrivalIcon}>
              <Icon name="check" size={35} color={palette.teal} />
            </View>
            <Badge
              text={
                n.guidanceSource === "live"
                  ? "Live GPS guidance complete"
                  : "Simulation complete"
              }
              warning
              dark={dark}
            />
            <Text style={[s.homeTitle, { color: ink }]}>
              {n.guidanceSource === "live"
                ? "You’ve arrived."
                : "You’ve arrived. In preview."}
            </Text>
            <Text style={[s.homeCopy, { color: muted, textAlign: "center" }]}>
              {n.guidanceSource === "live"
                ? `${n.destination?.name ?? "Destination"}. Your GPS reached the end of the route. The location watch has stopped.`
                : `${n.destination?.name}. No real-world arrival has been verified.`}
            </Text>
            <View style={{ width: "100%", gap: 10 }}>
              <Button title="Back to the map" onPress={n.reset} />
              <Button
                title="Review my privacy"
                secondary
                dark={dark}
                onPress={() => n.setPanel("privacy")}
              />
            </View>
          </View>
        </View>
      )}
      {!n.active && n.state !== "arrived" && !n.panel && (
        <View
          style={[
            s.bottomSheet,
            {
              left: desktop ? 28 : 12,
              bottom: navHeight + 24,
              width: sheetWidth,
              backgroundColor: surface,
              maxHeight: landscape ? "45%" : Math.min(480, height * 0.43),
            },
          ]}
        >
          {n.tab === "Home" ? <HomeCard n={n} /> : <SecondaryPage n={n} />}
        </View>
      )}
      {n.panel && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Pressable
            accessibilityLabel="Dismiss sheet"
            onPress={() => {
              n.setPanel(null);
              n.setError("");
            }}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: desktop ? "#0B12201A" : "#0B122026" },
            ]}
          />
          <View
            style={[
              s.bottomSheet,
              {
                left: desktop ? 28 : 12,
                bottom:
                  n.active || n.state === "arrived"
                    ? 26 + insets.bottom
                    : navHeight + 23,
                width: sheetWidth,
                backgroundColor: surface,
                maxHeight:
                  height -
                  (n.active ? top + 35 : desktop ? 110 : 135) -
                  (n.active ? 50 : navHeight),
              },
            ]}
          >
            <View
              style={[
                s.handle,
                { backgroundColor: dark ? "#3A4A5A" : "#D9E3DD" },
              ]}
            />
            <Panels n={n} traffic={traffic} live={liveUi} />
          </View>
        </View>
      )}
      {!n.active && n.state !== "arrived" && (
        <View
          style={[
            s.bottomNav,
            {
              height: navHeight,
              paddingBottom: desktop ? 0 : insets.bottom,
              backgroundColor: surface,
              borderTopColor: dark ? "#25374A" : "#E1E9E3",
              left: desktop ? 28 : 0,
              width: desktop ? 424 : "100%",
              borderRadius: desktop ? 22 : 0,
              bottom: desktop ? 16 : 0,
            },
          ]}
        >
          {navNames.map(([name, icon]) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityLabel={name}
              accessibilityState={{ selected: n.tab === name }}
              onPress={() => {
                n.setTab(name);
                n.setPanel(null);
                n.setError("");
              }}
              style={s.navTab}
            >
              <View
                style={[
                  s.navIcon,
                  n.tab === name && {
                    backgroundColor: dark ? "#15443C" : "#E5F4EB",
                  },
                ]}
              >
                <Icon
                  name={icon}
                  size={21}
                  color={
                    n.tab === name ? (dark ? "#62D6BB" : palette.teal) : muted
                  }
                />
              </View>
              <Text
                style={[
                  s.tabText,
                  {
                    color:
                      n.tab === name
                        ? dark
                          ? "#62D6BB"
                          : palette.teal
                        : muted,
                    fontWeight: n.tab === name ? "700" : "500",
                  },
                ]}
              >
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {confirmEnd && n.active && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Pressable
            accessibilityLabel="Keep guidance running"
            onPress={() => setConfirmEnd(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: "#0B122040" }]}
          />
          <View
            accessibilityViewIsModal
            style={[
              s.bottomSheet,
              {
                left: desktop ? 28 : 12,
                bottom: 34 + insets.bottom,
                width: sheetWidth,
                backgroundColor: surface,
              },
            ]}
          >
            <View style={{ padding: 22, gap: 14 }}>
              <Text
                accessibilityRole="header"
                style={[s.homeTitle, { color: ink }]}
              >
                End guidance?
              </Text>
              <Text style={[s.homeCopy, { color: muted }]}>
                {n.guidanceSource === "live"
                  ? "Live GPS guidance and the location watch will stop."
                  : "The simulation will stop."}
              </Text>
              <Button title="Keep going" onPress={() => setConfirmEnd(false)} />
              <Button
                title="End guidance"
                secondary
                dark={dark}
                onPress={() => {
                  setConfirmEnd(false);
                  n.end();
                }}
              />
            </View>
          </View>
        </View>
      )}
      {Boolean(n.toast) && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            s.toast,
            {
              top: top + 190,
              left: desktop ? 28 : 16,
              maxWidth: desktop ? 424 : width - 32,
              backgroundColor: dark ? "#23384A" : "#0B1220",
            },
          ]}
        >
          <Text style={s.toastText}>{n.toast}</Text>
        </View>
      )}
      {/* Only during guidance: the idle map needs no footer. */}
      {n.active && (
        <View
          pointerEvents="none"
          style={[
            s.footnote,
            {
              bottom:
                desktop || n.active || n.state === "arrived"
                  ? 8
                  : navHeight + 4,
              left: desktop ? 28 : 16,
            },
          ]}
        >
          <Text
            style={[
              s.footnoteText,
              {
                color: dark ? "#DFEAE4" : "#455B50",
                backgroundColor: dark ? "#0B1220B0" : "#FFFFFFD9",
              },
            ]}
          >
            {n.guidanceSource === "live"
              ? "Live GPS · keep the app open"
              : "Simulation only · not for road use"}
          </Text>
        </View>
      )}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: 12,
          bottom: n.active || n.state === "arrived" ? 8 : navHeight + 4,
          backgroundColor: dark ? "#152235" : "#FFFFFFF0",
          paddingHorizontal: 7,
          paddingVertical: 4,
          borderRadius: 5,
        }}
      >
        <Text style={{ color: dark ? "#EDF4F1" : "#334155", fontSize: 10 }}>
          © OpenStreetMap contributors
        </Text>
      </View>
      {!n.hydrated && (
        <View
          style={[
            StyleSheet.absoluteFill,
            s.loading,
            { backgroundColor: surface },
          ]}
        >
          <Mark size={46} />
          <ActivityIndicator color={palette.teal} />
          <Text style={{ color: muted }}>Preparing your map…</Text>
        </View>
      )}
    </View>
  );
}
function HomeCard({ n }: { n: AppModel }) {
  const dark = n.prefs.dark,
    ink = dark ? "#EDF4F1" : palette.ink,
    muted = dark ? "#A0B4AF" : palette.muted;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.homeContent}
    >
      <View style={s.sectionRow}>
        <Text style={[s.eyebrow, { color: dark ? "#62D6BB" : palette.teal }]}>
          LESS SECOND-GUESSING. MORE GOING.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Learn about NEXORA"
          style={s.infoTap}
          onPress={() => n.setPanel("onboard")}
        >
          <Icon name="info" size={17} color={muted} />
        </Pressable>
      </View>
      <Text style={[s.homeTitle, { color: ink }]}>
        A better way to your day.
      </Text>
      <Text style={[s.homeCopy, { color: muted }]}>
        Find a place. Choose your pace.
      </Text>
      <View style={s.shortcutRow}>
        {(
          [
            { name: "Home", icon: "home", place: n.home, field: "home" },
            { name: "Work", icon: "briefcase", place: n.work, field: "work" },
          ] as const
        ).map(({ name, icon, place, field }) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            onPress={() => {
              if (place) {
                n.setSearchFor("destination");
                n.choosePlace(place, "destination");
              } else n.openSearch(field);
            }}
            style={[
              s.shortcut,
              { backgroundColor: dark ? "#22374A" : "#F3F6F3" },
            ]}
          >
            <View
              style={[
                s.shortcutIcon,
                { backgroundColor: dark ? "#2B454A" : "#E4EDE7" },
              ]}
            >
              <Icon
                name={icon}
                size={18}
                color={dark ? "#62D6BB" : palette.teal}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.shortcutTitle, { color: ink }]}>{name}</Text>
              <Text style={[s.shortcutSub, { color: muted }]}>
                {place ? "Saved locally" : "Set location"}
              </Text>
            </View>
            {!place && <Icon name="plus" size={15} color={muted} />}
          </Pressable>
        ))}
      </View>
      {Boolean(n.highlights?.length) && (
        <View style={[s.sectionRow, { marginTop: 8 }]}>
          <Text style={[s.eyebrow, { color: muted }]}>NEARBY HIGHLIGHTS</Text>
        </View>
      )}
      {(n.highlights ?? []).slice(0, 3).map((p, i) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`${p.name}, ${p.subtitle}`}
          onPress={() => {
            n.setSearchFor("destination");
            n.choosePlace(p, "destination");
          }}
          style={[
            s.inspiration,
            { borderTopColor: dark ? "#2C3D4F" : "#E8EEE9" },
          ]}
        >
          <View
            style={[
              s.inspireIcon,
              {
                backgroundColor:
                  i % 2 === 0
                    ? dark
                      ? "#34394C"
                      : "#EFEEF5"
                    : dark
                      ? "#1D3D35"
                      : "#EAF2E7",
              },
            ]}
          >
            <Icon
              name={/park|garden/i.test(p.subtitle) ? "sun" : "star"}
              size={24}
              color={
                i % 2 === 0
                  ? dark
                    ? "#B8AFE4"
                    : "#78729C"
                  : dark
                    ? "#86C9A9"
                    : "#5A8266"
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.inspireTitle, { color: ink }]}>{p.name}</Text>
            <Text style={[s.inspireSub, { color: muted }]}>{p.subtitle}</Text>
          </View>
          <Icon name="arrow-up-right" size={19} color={muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
function SecondaryPage({ n }: { n: AppModel }) {
  const dark = n.prefs.dark,
    ink = dark ? "#EDF4F1" : palette.ink,
    muted = dark ? "#A0B4AF" : palette.muted;
  const header = (label: string, title: string, copy: string) => (
    <>
      <Text style={[s.eyebrow, { color: dark ? "#62D6BB" : palette.teal }]}>
        {label}
      </Text>
      <Text style={[s.homeTitle, { color: ink }]}>{title}</Text>
      <Text style={[s.homeCopy, { color: muted }]}>{copy}</Text>
    </>
  );
  const setting = (
    title: string,
    detail: string,
    icon: React.ComponentProps<typeof Icon>["name"],
    action: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      onPress={action}
      style={[
        s.settingRow,
        { borderBottomColor: dark ? "#2B3E50" : "#E5ECE7" },
      ]}
    >
      <Icon name={icon} size={21} color={dark ? "#62D6BB" : palette.teal} />
      <View style={{ flex: 1 }}>
        <Text style={[s.inspireTitle, { color: ink }]}>{title}</Text>
        <Text style={[s.inspireSub, { color: muted }]}>{detail}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={muted} />
    </Pressable>
  );
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.homeContent}
    >
      {n.tab === "Trips" ? (
        <>
          {header(
            "YOUR JOURNEYS",
            "A little space for your plans.",
            "History stays off until you choose otherwise.",
          )}
          {n.trips.length ? (
            n.trips.map((t) => (
              <View
                key={t.id}
                style={[
                  s.settingRow,
                  { borderBottomColor: dark ? "#2B3E50" : "#E5ECE7" },
                ]}
              >
                <Icon name="navigation" color={palette.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.inspireTitle, { color: ink }]}>
                    {t.destination}
                  </Text>
                  <Text style={[s.inspireSub, { color: muted }]}>
                    {t.origin} · {distanceLabel(t.distanceM, n.prefs.metric)} ·{" "}
                    {durationLabel(t.durationS)}
                  </Text>
                  <Text style={[s.demoLabel, { color: muted }]}>
                    {t.simulated === false ? "Live GPS" : "Simulated"} ·{" "}
                    {new Date(t.completedAt).toLocaleDateString("en-GB")}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={s.pageEmpty}>
              <Icon name="navigation" size={35} color={muted} />
              <Text style={[s.inspireTitle, { color: ink }]}>
                No saved journeys yet
              </Text>
              <Text style={[s.homeCopy, { color: muted, textAlign: "center" }]}>
                Complete a simulated trip with history enabled to see it here.
              </Text>
            </View>
          )}
          <Button
            title="Plan a journey"
            icon="plus"
            onPress={() => {
              n.setTab("Home");
              n.openSearch();
            }}
          />
          {setting(
            "Journey history",
            n.prefs.history
              ? "Opted in · on this device only"
              : "Off · no default trip retention",
            "shield",
            () => n.setPanel("privacy"),
          )}
          <Text style={[s.homeCopy, { color: muted }]}>
            Scheduled and multi-stop trips are planned for beta; no reminders
            are currently scheduled.
          </Text>
        </>
      ) : n.tab === "Saved" ? (
        <>
          {header(
            "YOUR PLACES",
            "Keep the good places close.",
            "Private bookmarks, saved on this device.",
          )}
          {n.saved.length ? (
            n.saved.map((p) => (
              <View
                key={p.id}
                style={[
                  s.settingRow,
                  { borderBottomColor: dark ? "#2B3E50" : "#E5ECE7" },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    n.setSearchFor("destination");
                    n.choosePlace(p, "destination");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    flex: 1,
                    minHeight: 48,
                  }}
                >
                  <Icon name="map-pin" color={palette.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.inspireTitle, { color: ink }]}>
                      {p.name}
                    </Text>
                    <Text style={[s.inspireSub, { color: muted }]}>
                      {p.category} · local only
                    </Text>
                  </View>
                </Pressable>
                <IconButton
                  name="bookmark"
                  label={`Remove ${p.name} from saved`}
                  dark={dark}
                  onPress={() => n.savePlace(p)}
                />
              </View>
            ))
          ) : (
            <View style={s.pageEmpty}>
              <Icon name="bookmark" size={35} color={muted} />
              <Text style={[s.inspireTitle, { color: ink }]}>
                Your favourites start here
              </Text>
              <Text style={[s.homeCopy, { color: muted, textAlign: "center" }]}>
                Find a destination and tap Save place.
              </Text>
            </View>
          )}
          <Button
            title="Find a place to save"
            icon="search"
            onPress={() => n.openSearch()}
          />
          <Badge text="Local storage · cloud sync not enabled" dark={dark} />
        </>
      ) : (
        <>
          {header(
            "MADE FOR YOUR JOURNEY",
            "Small settings. More control.",
            "Guest mode · no account required.",
          )}
          {setting(
            "Privacy & your data",
            "Local history, permissions, export and delete",
            "shield",
            () => n.setPanel("privacy"),
          )}
          {setting(
            "Appearance & units",
            `${dark ? "Dark" : "Light"} mode · ${n.prefs.metric ? "kilometres" : "miles"} · reduced motion`,
            "sun",
            () => n.setPanel("layers"),
          )}
          <View
            style={[
              s.settingRow,
              { borderBottomColor: dark ? "#2B3E50" : "#E5ECE7" },
            ]}
          >
            <Icon name="lock" color={palette.teal} />
            <View style={{ flex: 1 }}>
              <Text style={[s.inspireTitle, { color: ink }]}>
                Stable route preference
              </Text>
              <Text style={[s.inspireSub, { color: muted }]}>
                3 min / 10% saving · 90 s cooldown
              </Text>
            </View>
          </View>
          <View style={s.rerouteOptions}>
            {(["automatic", "ask", "locked"] as const).map((mode) => (
              <Pressable
                accessibilityRole="button"
                key={mode}
                onPress={() => n.setPrefs((p) => ({ ...p, routeMode: mode }))}
                style={[
                  s.eventButton,
                  {
                    backgroundColor:
                      n.prefs.routeMode === mode
                        ? dark
                          ? "#17463D"
                          : "#E6F4EB"
                        : dark
                          ? "#25374A"
                          : "#F2F5F2",
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      n.prefs.routeMode === mode
                        ? dark
                          ? "#62D6BB"
                          : palette.teal
                        : muted,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {mode === "automatic"
                    ? "Automatic"
                    : mode === "ask"
                      ? "Ask first"
                      : "Locked"}
                </Text>
              </Pressable>
            ))}
          </View>
          {setting(
            "Providers & offline capabilities",
            "What is enabled, unknown or awaiting setup",
            "layers",
            () => n.setPanel("providers"),
          )}
          {setting(
            "Test community",
            "Device-local incident queue · not live traffic",
            "flag",
            () => n.setPanel("review"),
          )}
          {setting(
            "About NEXORA",
            "Original London planning preview · v0.1",
            "info",
            () => n.setPanel("onboard"),
          )}
          <Text style={[s.homeCopy, { color: muted }]}>
            No ads. No default location history.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  topArea: { position: "absolute", gap: 14 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 13,
    shadowColor: "#162C24",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
  brandText: { fontWeight: "800", fontSize: 16, letterSpacing: 2 },
  brandMaps: { fontWeight: "500", fontSize: 10, letterSpacing: 1.3 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 17,
    minHeight: 58,
    borderRadius: 19,
    shadowColor: "#172E25",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  searchPlaceholder: { fontSize: 15, fontWeight: "500", flex: 1 },
  searchDivider: { width: 1, height: 23 },
  chips: { gap: 8, paddingBottom: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 22,
    paddingHorizontal: 14,
    minHeight: 48,
    shadowColor: "#10271A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  serverBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  serverText: { flex: 1, fontSize: 13, lineHeight: 18 },
  desktopBadge: { position: "absolute" },
  desktopTag: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mapTools: { position: "absolute", gap: 10 },
  bottomSheet: {
    position: "absolute",
    borderRadius: 25,
    overflow: "hidden",
    shadowColor: "#0B2015",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 22,
    elevation: 8,
  },
  handle: {
    width: 35,
    height: 4,
    borderRadius: 3,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: -4,
  },
  homeContent: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 9,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 5,
  },
  eyebrow: { fontSize: 9, fontWeight: "700", letterSpacing: 1.3 },
  infoTap: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  homeTitle: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 31,
  },
  homeCopy: { fontSize: 13, lineHeight: 20 },
  shortcutRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    marginBottom: 11,
  },
  shortcut: {
    flex: 1,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  shortcutIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutTitle: { fontSize: 13, fontWeight: "600" },
  shortcutSub: { fontSize: 10, marginTop: 3 },
  demoLabel: { fontSize: 9, lineHeight: 16 },
  inspiration: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingTop: 12,
    paddingBottom: 7,
    borderTopWidth: 1,
    minHeight: 72,
  },
  inspireIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  inspireTitle: { fontSize: 14, fontWeight: "600" },
  inspireSub: { fontSize: 11, lineHeight: 17, marginTop: 4 },
  bottomNav: {
    position: "absolute",
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 9,
  },
  navTab: { flex: 1, alignItems: "center", gap: 4, minHeight: 52 },
  navIcon: {
    width: 45,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: { fontSize: 10 },
  toast: {
    position: "absolute",
    padding: 15,
    borderRadius: 15,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 5 },
  },
  toastText: { fontSize: 13, lineHeight: 19, color: "#fff" },
  footnote: { position: "absolute" },
  footnoteText: {
    fontSize: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  loading: { alignItems: "center", justifyContent: "center", gap: 22 },
  turnBanner: {
    position: "absolute",
    padding: 18,
    borderRadius: 22,
    shadowColor: "#0B1220",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  simulationLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 14,
  },
  simDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#CB880E" },
  simulationText: {
    flex: 1,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  turnContent: { flexDirection: "row", gap: 17, alignItems: "center" },
  nextDistance: { fontSize: 27, fontWeight: "700", letterSpacing: -1 },
  turnText: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  eventBanner: {
    position: "absolute",
    padding: 15,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  activeTools: { position: "absolute", gap: 12, alignItems: "flex-end" },
  speedTile: {
    width: 83,
    padding: 12,
    borderRadius: 17,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
  },
  speedNumber: { fontSize: 30, fontWeight: "700" },
  speedLabel: { fontSize: 10 },
  speedUnknown: { fontSize: 8, marginTop: 7 },
  navPanel: {
    position: "absolute",
    borderRadius: 23,
    overflow: "hidden",
    shadowColor: "#0B1220",
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 4 },
  },
  stats: { flexDirection: "row", gap: 17, alignItems: "center" },
  statNumber: { fontSize: 26, fontWeight: "700", letterSpacing: -0.8 },
  statLabel: { fontSize: 10, marginTop: 5 },
  statDivider: { width: 1, height: 39, backgroundColor: "#DDE6E1" },
  lockTag: {
    marginLeft: "auto",
    padding: 11,
    borderRadius: 13,
    backgroundColor: "#E9F5EF",
  },
  progressTrack: { height: 4, borderRadius: 4, overflow: "hidden" },
  navControls: { flexDirection: "row", alignItems: "center", gap: 7 },
  simEvents: { flexDirection: "row", gap: 6 },
  eventButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 5,
  },
  finishLink: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  arrivalIcon: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#E7F5ED",
    alignItems: "center",
    justifyContent: "center",
  },
  pageEmpty: { alignItems: "center", gap: 14, paddingVertical: 20 },
  settingRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    minHeight: 70,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rerouteOptions: { flexDirection: "row", gap: 8 },
});
