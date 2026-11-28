import React, { useEffect, useMemo, useState } from "react";
import { carStatusText } from "@/lib/car/car-status-text";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNexora } from "@/hooks/use-nexora";
import {
  createIncident,
  distanceLabel,
  durationLabel,
  liveIncidents,
} from "@/shared/nexora/domain";
import {
  AVOIDANCES,
  AVOIDANCE_LABELS,
  MAX_INTERMEDIATE_STOPS,
  nextUkTime,
  scheduleEstimate,
  ukClockLabel,
} from "@/shared/nexora/itinerary";
import {
  locationStatusText,
  providerHealthLines,
} from "@/shared/nexora/status";
import { exportGuestData, shareText } from "@/lib/nexora-share";
import { trafficStatusLine, type TrafficModel } from "@/hooks/use-traffic";
import {
  disruptionsOnRoute,
  routeCoverage,
  routeTrafficLabel,
  type TrafficDisruption,
} from "@/shared/nexora/traffic";
import { Badge, Button, Icon, IconButton, palette } from "./ui";
import { StepList } from "./StepList";
import {
  a11yColors,
  guidanceStartChoices,
  isDemoOrigin,
  originNotice,
  panelServerNotice,
} from "./screen-logic";
import { requestGuidanceNotifications } from "@/lib/car/lock-screen-guidance";
import { DEV_TOOLS } from "@/lib/dev-tools";
import { useOfflineRegions } from "@/hooks/use-offline-regions";
import { OFFLINE_REGIONS, formatBytes } from "@/shared/nexora/offline";
import { PLACES_ATTRIBUTION, PLACE_CATEGORIES } from "@/shared/nexora/places";

/** Feather icon for a place row, from its live category label. */
function placeIcon(
  category: string,
): React.ComponentProps<typeof Icon>["name"] {
  const c = Object.values(PLACE_CATEGORIES).find((d) => d.label === category);
  if (c) return c.icon;
  return /park/i.test(category)
    ? "sun"
    : /station/i.test(category)
      ? "truck"
      : "map-pin";
}
export type AppModel = ReturnType<typeof useNexora>;
/** Live GPS start flow owned by NexoraApp (one-time acknowledgement). */
export type LiveStartUi = {
  ackOpen: boolean;
  requestLive: () => void;
  acceptLive: () => void;
  cancelLive: () => void;
};
export function Panels({
  n,
  traffic,
  live,
}: {
  n: AppModel;
  traffic?: TrafficModel;
  live?: LiveStartUi;
}) {
  const [showSteps, setShowSteps] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  // BUG-006 (UI part): the query the provider results on screen belong to.
  const [searchedFor, setSearchedFor] = useState("");
  const offline = useOfflineRegions();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // UX-005: offline region waiting for a delete confirmation.
  const [offlineDelete, setOfflineDelete] = useState<string | null>(null);
  const trafficDisruptions = traffic?.disruptions;
  // TfL disruptions on or beside each candidate route. Does not change route times.
  const routeTraffic = useMemo(() => {
    const out: Record<string, { label: string; hits: TrafficDisruption[] }> =
      {};
    if (!traffic || !trafficDisruptions || !traffic.snapshot) return out;
    for (const r of n.ranked) {
      if (r.demo || r.geometry.length < 2) continue;
      const hits = disruptionsOnRoute(r.geometry, trafficDisruptions);
      out[r.id] = {
        hits,
        label: routeTrafficLabel(hits, routeCoverage(r.geometry)),
      };
    }
    return out;
  }, [n.ranked, trafficDisruptions, traffic]);
  const [category, setCategory] = useState("roadworks");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const dark = n.prefs.dark;
  const ink = dark ? "#EDF4F1" : palette.ink;
  const muted = dark ? "#A0B4AF" : palette.muted;
  const surface = dark ? "#152235" : "#fff";
  const colors = a11yColors(dark);
  const formatDistance = (m: number) => distanceLabel(m, n.prefs.metric);
  const runLiveSearch = () => {
    setSearchedFor(n.query.trim());
    n.liveSearch();
  };
  const staleResults =
    Boolean(n.searchResults) &&
    searchedFor !== "" &&
    n.query.trim() !== searchedFor;
  const disclosure = (label: string, open: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={s.disclosure}
    >
      <Text style={[s.linkText, { color: dark ? "#62D6BB" : palette.teal }]}>
        {label}
      </Text>
      <Icon
        name={open ? "chevron-up" : "chevron-down"}
        size={18}
        color={dark ? "#62D6BB" : palette.teal}
      />
    </Pressable>
  );
  const heading = (title: string, subtitle?: string) => (
    <View style={s.heading}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={[s.title, { color: ink }]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[s.subtitle, { color: muted }]}>{subtitle}</Text>
        )}
      </View>
      <IconButton
        name="x"
        label="Close sheet"
        dark={dark}
        onPress={() => {
          n.setPanel(null);
          n.setError("");
        }}
      />
    </View>
  );
  const note = (text: string, warning = false) => (
    <View
      style={[
        s.note,
        {
          backgroundColor: warning
            ? dark
              ? "#332D23"
              : "#FFF7E6"
            : dark
              ? "#223247"
              : "#F2F6F4",
        },
      ]}
    >
      <Icon
        name={warning ? "alert-circle" : "info"}
        size={17}
        color={warning ? (dark ? "#F5B544" : palette.amber) : muted}
      />
      <Text
        style={[
          s.noteText,
          { color: warning ? (dark ? "#F5CB7F" : "#79541B") : muted },
        ]}
      >
        {text}
      </Text>
    </View>
  );
  const row = (
    name: string,
    detail: string,
    icon: React.ComponentProps<typeof Icon>["name"],
    onPress?: () => void,
  ) => (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={[s.row, { borderBottomColor: dark ? "#2B3A4B" : palette.line }]}
    >
      <View
        style={[s.rowIcon, { backgroundColor: dark ? "#263B47" : "#EFF5F1" }]}
      >
        <Icon name={icon} color={dark ? "#62D6BB" : palette.teal} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: ink }]}>{name}</Text>
        <Text style={[s.rowDetail, { color: muted }]}>{detail}</Text>
      </View>
      {onPress && <Icon name="chevron-right" size={18} color={muted} />}
    </Pressable>
  );
  const toggle = (
    name: string,
    detail: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <View
      style={[s.row, { borderBottomColor: dark ? "#2B3A4B" : palette.line }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: ink }]}>{name}</Text>
        <Text style={[s.rowDetail, { color: muted }]}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={name}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.switchTrackOff, true: palette.teal }}
      />
    </View>
  );
  const packBytes = (m: { files: Record<string, { bytes: number }> }) =>
    Object.values(m.files).reduce((a, f) => a + f.bytes, 0);
  const offlineRows = () => {
    if (!offline.supported)
      return row(
        "Offline regions",
        "Available in the Android and iOS app · this web preview is online only",
        "download-cloud",
      );
    return (
      <>
        {OFFLINE_REGIONS.map((region) => {
          const installed = offline.installed[region.id];
          const remote = offline.catalog?.find((c) => c.id === region.id);
          const progress = offline.progress[region.id];
          const error = offline.errors[region.id];
          const update =
            installed &&
            remote?.manifest &&
            remote.manifest.builtAt !== installed.builtAt;
          return (
            <React.Fragment key={region.id}>
              {row(
                `${region.name} offline map`,
                progress != null
                  ? `Downloading · ${Math.round(progress * 100)}%`
                  : installed
                    ? `Installed · ${formatBytes(packBytes(installed))} · map + place search · data ${installed.builtAt.slice(0, 10)}`
                    : remote?.available && remote.manifest
                      ? `${formatBytes(packBytes(remote.manifest))} download · OpenStreetMap vector map + place search`
                      : offline.catalogError ||
                        "Not published on the NEXORA server yet",
                "download-cloud",
              )}
              {installed &&
                toggle(
                  "Use offline map",
                  "Draw the map from this device even when online. It is also used automatically if the online map fails to load.",
                  offline.preferOffline,
                  (v) => offline.setPreferOffline(v),
                )}
              {progress != null ? (
                <Button
                  title="Cancel download"
                  secondary
                  dark={dark}
                  onPress={() => offline.cancel(region.id)}
                />
              ) : (
                <>
                  {(!installed || update) && (
                    <Button
                      title={
                        update
                          ? `Update ${region.name}`
                          : `Download ${region.name}`
                      }
                      icon="download"
                      dark={dark}
                      disabled={!remote?.available}
                      onPress={() => offline.download(region.id)}
                    />
                  )}
                  {installed && offlineDelete !== region.id && (
                    <Button
                      title="Delete offline region"
                      secondary
                      dark={dark}
                      onPress={() => setOfflineDelete(region.id)}
                    />
                  )}
                  {installed && offlineDelete === region.id && (
                    <View style={{ gap: 10 }}>
                      {note(
                        `Delete the ${region.name} offline map from this device? You will need to download it again to use it offline.`,
                        true,
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${region.name} offline map`}
                        onPress={() => {
                          setOfflineDelete(null);
                          offline.remove(region.id);
                          n.setToast(`${region.name} offline map deleted.`);
                        }}
                        style={({ pressed }) => [
                          s.destructive,
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <Icon name="trash-2" size={18} color="#FFFFFF" />
                        <Text style={s.destructiveText}>
                          Delete offline map
                        </Text>
                      </Pressable>
                      <Button
                        title="Keep offline map"
                        secondary
                        dark={dark}
                        onPress={() => setOfflineDelete(null)}
                      />
                    </View>
                  )}
                </>
              )}
              {!!error && note(error, true)}
            </React.Fragment>
          );
        })}
        {note(
          "Offline maps use OpenStreetMap data (ODbL) packaged as Protomaps vector tiles and served by NEXORA, never bulk-downloaded from OpenStreetMap's tile servers. Search covers named places, stops and streets, not house numbers. New routes still need a connection.",
        )}
      </>
    );
  };
  async function shareDestination() {
    if (!n.destination) return;
    try {
      n.setToast(
        await shareText(
          `${n.destination.name}\n${n.destination.coordinate[1]}, ${n.destination.coordinate[0]}\nhttps://www.openstreetmap.org/?mlat=${n.destination.coordinate[1]}&mlon=${n.destination.coordinate[0]}#map=16/${n.destination.coordinate[1]}/${n.destination.coordinate[0]}`,
        ),
      );
    } catch (e) {
      n.setToast(e instanceof Error ? e.message : "Sharing cancelled.");
    }
  }
  const error = Boolean(n.error) && (
    <View style={[s.note, { backgroundColor: dark ? "#412B32" : "#FFF0F1" }]}>
      <Icon name="alert-triangle" color="#BD3445" size={18} />
      <Text style={[s.noteText, { color: dark ? "#FFACB7" : "#A82C3D" }]}>
        {n.error}
      </Text>
    </View>
  );
  // UX-009: the search and routes sheets cover the home banner, so they show
  // the server waking / unreachable line themselves.
  const notice = panelServerNotice(n.serverState, n.busy, n.online);
  const startChoices = guidanceStartChoices(n.route, DEV_TOOLS);
  const serverNotice = notice && (
    <View
      accessibilityLiveRegion="polite"
      style={[
        s.note,
        {
          alignItems: "center",
          backgroundColor: notice.warning
            ? dark
              ? "#332D23"
              : "#FFF7E6"
            : dark
              ? "#223247"
              : "#F2F6F4",
        },
      ]}
    >
      {notice.warning ? (
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
          s.noteText,
          {
            color: notice.warning ? (dark ? "#F5CB7F" : "#79541B") : ink,
          },
        ]}
      >
        {notice.text}
      </Text>
    </View>
  );
  const chip = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
    disabled = false,
    a11y?: string,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={a11y || label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.chip,
        {
          borderColor: selected ? palette.teal : dark ? "#324459" : "#D9E3DE",
          backgroundColor: selected
            ? dark
              ? "#15483F"
              : "#E6F4ED"
            : "transparent",
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? (dark ? "#62D6BB" : palette.teal) : muted,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  const supportedAvoid: string[] =
    n.capabilities?.routing?.avoid?.driving ?? [];
  const scheduleAt =
    n.scheduleKind === "now" ? undefined : nextUkTime(n.scheduleTime, now);
  const schedule =
    n.route && (n.scheduleKind === "now" || scheduleAt !== null)
      ? scheduleEstimate({
          durationS: n.route.durationS,
          kind: n.scheduleKind,
          at: scheduleAt ?? undefined,
          now,
        })
      : null;
  let body: React.ReactNode;
  if (n.panel === "search")
    body = (
      <>
        {heading(
          n.browsing
            ? `${PLACE_CATEGORIES[n.browsing].label} nearby`
            : n.searchFor === "origin"
              ? "Where from?"
              : n.searchFor === "home"
                ? "Set your home"
                : n.searchFor === "work"
                  ? "Set your work"
                  : n.searchFor === "stop"
                    ? "Add a stop"
                    : "Find your next stop",
          n.browsing
            ? "Live places around you from OpenStreetMap, closest first."
            : n.capabilities?.search?.configured
              ? "Search any UK address, postcode or place, or enter latitude, longitude."
              : "Browse nearby places or enter latitude, longitude.",
        )}
        {serverNotice}
        <View
          style={[
            s.inputWrap,
            { backgroundColor: dark ? "#243449" : "#F2F5F3" },
          ]}
        >
          <Icon name="search" color={muted} />
          <TextInput
            autoFocus
            accessibilityLabel="Search destinations"
            placeholder="Place, address or coordinates"
            placeholderTextColor={muted}
            value={n.query}
            onChangeText={(q) => {
              n.setQuery(q);
              if (n.browsing) {
                n.setBrowsing(null);
                n.setSearchResults(null);
              }
              // Keep the last provider results on screen while typing; they
              // are labelled as out of date until Search runs again.
              if (!q.trim()) n.setSearchResults(null);
            }}
            onSubmitEditing={
              n.capabilities?.search?.configured ? runLiveSearch : undefined
            }
            style={[s.input, { color: ink }]}
            returnKeyType="search"
          />
          {n.query.length > 0 && (
            <Pressable
              style={s.smallTap}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => {
                n.setQuery("");
                n.setSearchResults(null);
              }}
            >
              <Icon name="x" size={18} color={muted} />
            </Pressable>
          )}
        </View>
        <View style={s.between}>
          <Text
            accessibilityLiveRegion="polite"
            style={[s.eyebrow, { color: muted }]}
          >
            {n.busy && n.browsing
              ? "FINDING PLACES NEARBY…"
              : n.busy && n.searchResults
                ? "SEARCHING…"
                : staleResults
                  ? `RESULTS FOR “${searchedFor.toUpperCase()}” · PRESS SEARCH TO UPDATE`
                  : n.browsing && n.searchResults
                    ? `${n.searchResults.length} ${PLACE_CATEGORIES[n.browsing].label.toUpperCase()} NEARBY`
                    : n.searchResults
                      ? "SEARCH RESULTS"
                      : n.query
                        ? "NEARBY MATCHES"
                        : n.results.length
                          ? "NEARBY HIGHLIGHTS"
                          : ""}
          </Text>
        </View>
        {error}
        {n.busy && <ActivityIndicator color={palette.teal} />}
        <View>
          {n.results.map((p) => (
            <React.Fragment key={p.id}>
              {row(p.name, p.subtitle, placeIcon(p.category), () =>
                n.choosePlace(p),
              )}
            </React.Fragment>
          ))}
        </View>
        {n.results.length === 0 && !n.busy && (n.query || n.browsing) && (
          <View style={s.empty}>
            <Icon name="search" size={32} color={muted} />
            <Text style={[s.rowTitle, { color: ink }]}>
              {n.searchResults || n.browsing
                ? "No places found"
                : "No nearby matches"}
            </Text>
            <Text style={[s.subtitle, { color: muted }]}>
              {n.browsing
                ? "Nothing of this kind is mapped close by. Try another category or search by name."
                : n.searchResults
                  ? "The search provider found nothing for that text. Check spelling, add a town or postcode, or drop a map pin."
                  : n.capabilities?.search?.configured
                    ? "Press Search to look up any UK address, postcode or place."
                    : "Enter coordinates or drop a map pin. Address search needs a configured provider."}
            </Text>
          </View>
        )}
        <Button
          title={
            n.capabilities?.search?.configured
              ? `Search ${n.capabilities.search.provider || "configured provider"}`
              : "Live address search: setup required"
          }
          disabled={
            !n.capabilities?.search?.configured || n.query.length < 3 || n.busy
          }
          onPress={runLiveSearch}
          secondary
          dark={dark}
          icon="globe"
        />
        {n.capabilities?.search?.attribution && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={n.capabilities.search.attribution}
            onPress={() =>
              n.capabilities?.search?.attributionUrl &&
              Linking.openURL(n.capabilities.search.attributionUrl)
            }
          >
            <Text style={[s.subtitle, { color: palette.teal }]}>
              {n.capabilities.search.attribution}
            </Text>
          </Pressable>
        )}
        {(n.browsing || (!n.searchResults && n.results.length > 0)) &&
          note(
            `Places ${PLACES_ATTRIBUTION}. Points mark the place, not always its entrance.`,
          )}
      </>
    );
  else if (n.panel === "place" && n.destination)
    body = (
      <>
        {heading(n.destination.name, n.destination.subtitle)}
        <View style={s.placeHero}>
          <View
            style={[
              s.heroIcon,
              { backgroundColor: dark ? "#1B3E3C" : "#E4F3EC" },
            ]}
          >
            <Icon
              name={placeIcon(n.destination.category)}
              size={35}
              color={dark ? "#62D6BB" : palette.teal}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.eyebrow, { color: palette.teal }]}>
              {n.destination.category.toUpperCase()}
            </Text>
            <Text style={[s.rowTitle, { color: ink }]}>
              A destination, not a data guess.
            </Text>
            <Text style={[s.rowDetail, { color: muted }]}>
              Hours, reviews and accessibility: unknown
            </Text>
          </View>
        </View>
        <Badge
          text={n.destination.source}
          warning={n.destination.source.includes("Demo")}
          dark={dark}
        />
        <Text selectable style={[s.coords, { color: muted }]}>
          {n.destination.coordinate[1].toFixed(5)},{" "}
          {n.destination.coordinate[0].toFixed(5)}
        </Text>
        <Button
          title="Find routes"
          icon="navigation"
          onPress={() => n.calculate()}
          dark={dark}
        />
        <View style={s.actions}>
          <View style={{ flex: 1 }}>
            <Button
              title={
                n.saved.some((p) => p.id === n.destination!.id)
                  ? "Saved"
                  : "Save place"
              }
              icon="bookmark"
              secondary
              dark={dark}
              onPress={() => n.savePlace(n.destination!)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Share"
              icon="share-2"
              secondary
              dark={dark}
              onPress={shareDestination}
            />
          </View>
        </View>
        {note(
          "Verify local access, signage and restrictions independently.",
        )}
      </>
    );
  else if (n.panel === "routes" && live?.ackOpen)
    body = (
      <>
        {heading(
          "Before you start",
          "A quick note, shown once for this version of the app.",
        )}
        {row(
          "Keep your eyes on the road",
          "Set the route before you move. Obey road signs and traffic rules over the app.",
          "eye",
        )}
        {row(
          "No live traffic or speed limits",
          "Times are free-flow estimates. The app only works while it is open on screen.",
          "info",
        )}
        <Button
          title="Start navigation"
          icon="navigation"
          dark={dark}
          onPress={live.acceptLive}
        />
        <Pressable
          accessibilityRole="button"
          onPress={live.cancelLive}
          style={s.link}
        >
          <Text
            style={[s.linkText, { color: dark ? "#62D6BB" : palette.teal }]}
          >
            Back to routes
          </Text>
        </Pressable>
      </>
    );
  else if (n.panel === "routes")
    body = (
      <>
        {heading(
          "Your route. Your call.",
          "Choose the journey that feels right.",
        )}
        {serverNotice}
        <View
          style={[
            s.originBox,
            { backgroundColor: dark ? "#223247" : "#F5F7F5" },
          ]}
        >
          <View style={{ gap: 12 }}>
            <View style={s.originDot} />
            <View style={s.destDot} />
          </View>
          <View style={{ flex: 1 }}>
            <Pressable
              accessibilityLabel="Change origin"
              onPress={() => n.openSearch("origin")}
              style={s.originRow}
            >
              <Text numberOfLines={1} style={[s.originText, { color: ink }]}>
                {n.origin.name}
              </Text>
              <Text style={[s.tiny, { color: muted }]}>
                {n.origin.id === "device-position"
                  ? "Device fix"
                  : isDemoOrigin(n.origin)
                    ? "Default demo origin · tap to change"
                    : "Manual origin"}
              </Text>
            </Pressable>
            {n.stops.map((stop, i) => (
              <View key={stop.id}>
                <View
                  style={{
                    height: 1,
                    backgroundColor: dark ? "#344459" : "#E1E8E4",
                  }}
                />
                <View style={[s.originRow, s.actions]}>
                  <View style={s.stopBadge}>
                    <Text style={s.stopBadgeText}>{i + 1}</Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[s.originText, { color: ink, flex: 1 }]}
                  >
                    {stop.name}
                  </Text>
                  {n.stops.length > 1 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        i === 0
                          ? `Move stop ${i + 1} later`
                          : `Move stop ${i + 1} earlier`
                      }
                      onPress={() => n.moveStopAt(i, i === 0 ? 1 : -1)}
                      style={s.stopTool}
                    >
                      <Icon
                        name={i === 0 ? "chevron-down" : "chevron-up"}
                        size={18}
                        color={muted}
                      />
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove stop ${i + 1}, ${stop.name}`}
                    onPress={() => n.removeStopAt(i)}
                    style={s.stopTool}
                  >
                    <Icon name="x" size={18} color={muted} />
                  </Pressable>
                </View>
              </View>
            ))}
            <View
              style={{
                height: 1,
                backgroundColor: dark ? "#344459" : "#E1E8E4",
              }}
            />
            <Pressable
              accessibilityLabel="Change destination"
              onPress={() => n.openSearch()}
              style={s.originRow}
            >
              <Text numberOfLines={1} style={[s.originText, { color: ink }]}>
                {n.destination?.name || "Choose destination"}
              </Text>
            </Pressable>
          </View>
          <IconButton
            name="repeat"
            dark={dark}
            label="Swap origin and destination"
            onPress={n.swapEndpoints}
          />
        </View>
        {originNotice(n.origin) && (
          <View style={[s.between, { flexWrap: "wrap" }]}>
            <Text style={[s.originNotice, { color: ink }]}>
              {originNotice(n.origin)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my location as the starting point"
              disabled={n.busy}
              onPress={n.locate}
              style={[s.addStop, { opacity: n.busy ? 0.45 : 1 }]}
            >
              <Icon
                name="crosshair"
                size={18}
                color={dark ? "#62D6BB" : palette.teal}
              />
              <Text
                style={[s.linkText, { color: dark ? "#62D6BB" : palette.teal }]}
              >
                Use my location
              </Text>
            </Pressable>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            n.stops.length >= MAX_INTERMEDIATE_STOPS
              ? `Stop limit reached, ${MAX_INTERMEDIATE_STOPS} stops`
              : "Add a stop"
          }
          disabled={n.stops.length >= MAX_INTERMEDIATE_STOPS || n.busy}
          onPress={() => n.openSearch("stop")}
          style={[
            s.addStop,
            {
              opacity:
                n.stops.length >= MAX_INTERMEDIATE_STOPS || n.busy ? 0.45 : 1,
            },
          ]}
        >
          <Icon
            name="plus-circle"
            size={18}
            color={dark ? "#62D6BB" : palette.teal}
          />
          <Text
            style={[s.linkText, { color: dark ? "#62D6BB" : palette.teal }]}
          >
            {n.stops.length >= MAX_INTERMEDIATE_STOPS
              ? `Up to ${MAX_INTERMEDIATE_STOPS} stops`
              : "Add stop"}
          </Text>
        </Pressable>
        <View style={s.modeRow}>
          {(
            [
              ["driving", "truck", "Drive"],
              ["walking", "user", "Walk"],
              ["cycling", "activity", "Cycle"],
            ] as const
          ).map(([mode, icon, label]) => (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: n.mode === mode }}
              disabled={n.busy}
              onPress={() => {
                n.setMode(mode);
                n.calculate(false, mode);
              }}
              style={[
                s.modeButton,
                n.mode === mode && {
                  backgroundColor: dark ? "#15483F" : "#E6F4ED",
                  borderColor: palette.teal,
                },
              ]}
            >
              <Icon
                name={icon}
                size={19}
                color={
                  n.mode === mode ? (dark ? "#62D6BB" : palette.teal) : muted
                }
              />
              <Text
                style={{
                  color:
                    n.mode === mode ? (dark ? "#62D6BB" : palette.teal) : muted,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.between}>
          <Text style={[s.eyebrow, { color: muted }]}>ROUTE ALTERNATIVES</Text>
          <View style={s.preference}>
            {(["fastest", "relaxed"] as const).map((p) => (
              <Pressable
                accessibilityRole="button"
                key={p}
                onPress={() => {
                  n.setPreference(p);
                  n.setSelectedId("");
                }}
                style={[
                  s.prefButton,
                  n.preference === p && {
                    backgroundColor: dark ? "#31465A" : "#E9F0EC",
                  },
                ]}
              >
                <Text
                  style={{
                    color: n.preference === p ? ink : muted,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {p === "fastest" ? "Fastest" : "Relaxed"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {n.mode === "driving" && (
          <View style={{ gap: 8 }}>
            <Text style={[s.eyebrow, { color: muted }]}>AVOID</Text>
            <View style={s.categories}>
              {AVOIDANCES.map((a) =>
                chip(
                  a,
                  AVOIDANCE_LABELS[a],
                  n.avoid.includes(a),
                  () => n.toggleAvoid(a),
                  n.busy || !supportedAvoid.includes(a),
                  supportedAvoid.includes(a)
                    ? `Avoid ${AVOIDANCE_LABELS[a]}`
                    : `Avoid ${AVOIDANCE_LABELS[a]}, not supported by the current routing graph`,
                ),
              )}
            </View>
            {AVOIDANCES.some((a) => !supportedAvoid.includes(a)) && (
              <Text style={[s.tiny, { color: muted }]}>
                {supportedAvoid.length
                  ? "Greyed-out avoidances are not supported by the configured routing graph."
                  : "The current test routing graph supports no avoidances (checked 27 Nov 2026), so these stay off. Routes may use motorways, tolls or ferries."}
              </Text>
            )}
          </View>
        )}
        {error}
        {n.busy ? (
          <View style={s.empty}>
            <ActivityIndicator color={palette.teal} />
            <Text style={[s.subtitle, { color: muted }]}>
              Calculating with the routing engine…
            </Text>
          </View>
        ) : (
          n.ranked.map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`${r.label}, ${durationLabel(r.durationS)}, ${distanceLabel(r.distanceM, n.prefs.metric)}`}
              accessibilityState={{ selected: n.route?.id === r.id }}
              onPress={() => n.setSelectedId(r.id)}
              style={[
                s.routeCard,
                {
                  borderColor:
                    n.route?.id === r.id
                      ? palette.teal
                      : dark
                        ? "#324459"
                        : "#E3EAE6",
                  backgroundColor:
                    n.route?.id === r.id
                      ? dark
                        ? "#173B38"
                        : "#F0F8F3"
                      : surface,
                },
              ]}
            >
              <View style={s.between}>
                <View style={s.actions}>
                  <View
                    style={[
                      s.radio,
                      { borderColor: colors.radioRing },
                      n.route?.id === r.id && {
                        borderColor: palette.teal,
                        backgroundColor: palette.teal,
                      },
                    ]}
                  />
                  <Text style={[s.routeTitle, { color: ink }]}>{r.label}</Text>
                </View>
                {i === 0 && <Badge text="Best match" dark={dark} />}
              </View>
              <View style={[s.actions, { marginTop: 12 }]}>
                <Text style={[s.routeTime, { color: ink }]}>
                  {durationLabel(r.durationS)}
                </Text>
                <Text style={[s.rowDetail, { color: muted }]}>
                  {distanceLabel(r.distanceM, n.prefs.metric)}
                  {r.complexity !== null
                    ? ` · ${r.complexity} turn events`
                    : ""}
                </Text>
              </View>
              <Text style={[s.routeExplain, { color: muted }]}>
                {r.explanation}
              </Text>
              {r.legs && r.legs.length > 1 && (
                <View style={{ marginTop: 6, gap: 2 }}>
                  {r.legs.map((leg, li) => (
                    <Text key={li} style={[s.rowDetail, { color: muted }]}>
                      {li === r.legs!.length - 1
                        ? `Stop ${li} → destination`
                        : li === 0
                          ? "Origin → stop 1"
                          : `Stop ${li} → stop ${li + 1}`}
                      {": "}
                      {durationLabel(leg.durationS)} ·{" "}
                      {distanceLabel(leg.distanceM, n.prefs.metric)}
                    </Text>
                  ))}
                </View>
              )}
              <Text style={[s.tiny, { color: muted }]}>
                {r.demo
                  ? "Synthetic fixture · no road geometry"
                  : "OSRM test engine · free-flow time, not adjusted for traffic"}
              </Text>
              {!r.demo && traffic && (
                <Text
                  style={[
                    s.tiny,
                    {
                      color: routeTraffic[r.id]?.hits.some(
                        (h) => h.closure && !h.planned,
                      )
                        ? dark
                          ? "#F5CB7F"
                          : "#79541B"
                        : muted,
                    },
                  ]}
                >
                  {routeTraffic[r.id]
                    ? `${routeTraffic[r.id].label} · ${trafficStatusLine(traffic)}`
                    : trafficStatusLine(traffic)}
                </Text>
              )}
              {!r.demo &&
                n.route?.id === r.id &&
                (routeTraffic[r.id]?.hits || [])
                  .filter((h) => !h.planned)
                  .slice(0, 3)
                  .map((h) => (
                    <Text
                      key={h.id}
                      style={[s.rowDetail, { color: muted, marginTop: 4 }]}
                    >
                      {h.closure ? "Closure · " : ""}
                      {h.severity} · {h.summary}
                      {h.update ? ` ${h.update}` : ""}
                    </Text>
                  ))}
            </Pressable>
          ))
        )}
        {!n.busy && !n.ranked.length && (
          <Button
            title="Calculate provider routes"
            icon="refresh-cw"
            onPress={() => n.calculate()}
            dark={dark}
          />
        )}
        {n.route && !n.busy && (
          <View style={{ gap: 8 }}>
            <Text style={[s.eyebrow, { color: muted }]}>WHEN</Text>
            <View style={s.categories}>
              {(
                [
                  ["now", "Leave now"],
                  ["depart", "Leave at"],
                  ["arrive", "Arrive by"],
                ] as const
              ).map(([kind, label]) =>
                chip(kind, label, n.scheduleKind === kind, () =>
                  n.setScheduleKind(kind),
                ),
              )}
            </View>
            {n.scheduleKind !== "now" && (
              <View
                style={[
                  s.inputWrap,
                  { backgroundColor: dark ? "#243449" : "#F2F5F3" },
                ]}
              >
                <Icon name="clock" color={muted} />
                <TextInput
                  accessibilityLabel={
                    n.scheduleKind === "depart"
                      ? "Departure time, 24-hour UK time"
                      : "Arrival time, 24-hour UK time"
                  }
                  value={n.scheduleTime}
                  onChangeText={n.setScheduleTime}
                  placeholder="HH:MM (UK time)"
                  placeholderTextColor={muted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={[s.input, { color: ink }]}
                />
              </View>
            )}
            {n.scheduleKind !== "now" &&
              n.scheduleTime.length > 0 &&
              scheduleAt === null && (
                <Text style={[s.rowDetail, { color: "#BD3445" }]}>
                  Enter a 24-hour time such as 08:30.
                </Text>
              )}
            {schedule && !schedule.ok && (
              <Text style={[s.rowDetail, { color: "#BD3445" }]}>
                {schedule.reason}
              </Text>
            )}
            {schedule && schedule.ok && (
              <>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[s.rowTitle, { color: ink }]}
                >
                  Leave {ukClockLabel(schedule.departAt, now)} · arrive about{" "}
                  {ukClockLabel(schedule.arriveAt, now)}
                </Text>
                {schedule.late && (
                  <Text style={[s.rowDetail, { color: "#BD3445" }]}>
                    Even leaving now, the estimate arrives after your target
                    time.
                  </Text>
                )}
                <Text style={[s.tiny, { color: muted }]}>{schedule.basis}</Text>
              </>
            )}
          </View>
        )}
        <View style={s.lockRow}>
          <Icon
            name={n.prefs.routeMode === "locked" ? "lock" : "shuffle"}
            color={palette.teal}
            size={19}
          />
          <View style={{ flex: 1 }}>
            <Text style={[s.rowTitle, { color: ink }]}>Route lock</Text>
            <Text style={[s.rowDetail, { color: muted }]}>
              Soft changes wait. Essential reroutes take priority.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Route lock"
            value={n.prefs.routeMode === "locked"}
            onValueChange={(v) =>
              n.setPrefs((p) => ({
                ...p,
                routeMode: v ? "locked" : "automatic",
              }))
            }
            trackColor={{ false: colors.switchTrackOff, true: palette.teal }}
          />
        </View>
        {n.route && (
          <>
            {disclosure(
              showSteps
                ? "Hide steps"
                : `View ${n.route.steps.length} steps as a list`,
              showSteps,
              () => setShowSteps((v) => !v),
            )}
            {showSteps && (
              <StepList
                route={n.route}
                formatDistance={formatDistance}
                dark={dark}
              />
            )}
            {startChoices.live && (
              <Button
                title="Start"
                icon="navigation"
                disabled={n.busy || n.error.includes("Recalculate")}
                onPress={() => (live ? live.requestLive() : n.start("live"))}
              />
            )}
            {startChoices.simulation && (
              <Button
                title="Simulate (developer)"
                icon="play"
                secondary={startChoices.live}
                dark={dark}
                disabled={n.busy || n.error.includes("Recalculate")}
                onPress={() => n.start("simulation")}
              />
            )}
            {n.route.demo &&
              note(
                "This is a sample route because the route server couldn't be reached, so it can't guide you. Try again in a moment.",
                true,
              )}
          </>
        )}
        {disclosure("About these results", showAbout, () =>
          setShowAbout((v) => !v),
        )}
        {showAbout && (
          <View style={{ gap: 10 }}>
            {n.route &&
              !n.route.demo &&
              note(
                "Navigation follows your phone's GPS with spoken turns while the app is open. No live traffic or speed limits.",
              )}
            <Text style={[s.tiny, { color: muted }]}>
              Stops are visited in the order shown; order optimisation and time
              windows are not available. Times are UK time.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => n.calculate(true)}
              disabled={n.busy}
              style={s.link}
            >
              <Text
                style={[s.linkText, { color: dark ? "#62D6BB" : palette.teal }]}
              >
                Use explicitly synthetic demo instead
              </Text>
            </Pressable>
          </View>
        )}
      </>
    );
  else if (n.panel === "layers")
    body = (
      <>
        {heading("Make the map yours", "Keep only what helps your journey.")}
        {toggle(
          "Dark appearance",
          "Display treatment of the same OSM raster map.",
          dark,
          (v) => n.setPrefs((p) => ({ ...p, dark: v })),
        )}
        {toggle(
          "Metric distances",
          "Use kilometres instead of miles.",
          n.prefs.metric,
          (v) => n.setPrefs((p) => ({ ...p, metric: v })),
        )}
        {toggle(
          "Reduced motion",
          "Instant camera moves and slower playback.",
          n.prefs.reducedMotion,
          (v) => n.setPrefs((p) => ({ ...p, reducedMotion: v })),
        )}
        {row("Standard street map", "Available · OpenStreetMap raster", "map")}
        {traffic &&
          toggle(
            "Live London disruptions",
            `${trafficStatusLine(traffic)}. Works, collisions and closures reported to TfL. Not traffic speeds.`,
            traffic.visible,
            traffic.setVisible,
          )}
        {row(
          "Traffic speeds, satellite, terrain and 3D",
          "Unavailable · licensed/vector providers required",
          "layers",
        )}
        {note(
          "No invented imagery. Offline maps come from a downloadable OpenStreetMap region in Settings, never from public OSM tile servers. Attribution remains visible.",
        )}
      </>
    );
  else if (n.panel === "providers")
    body = (
      <>
        {heading("What works today", "Every capability has a clear boundary.")}
        <Badge text="Private development preview" warning dark={dark} />
        {row(
          "Interactive map",
          "OpenStreetMap raster · online viewing only",
          "map",
        )}
        {row(
          "Driving, walking and cycling",
          "Separate OSRM test profiles · no SLA or live traffic",
          "navigation",
        )}
        {row(
          "Place & address search",
          n.capabilities?.search?.configured
            ? `${n.capabilities.search.provider || "Configured geocoder"} · live UK search · press Search to submit`
            : "Coordinates and map pins · address search not configured",
          "search",
        )}
        {row(
          "Nearby places",
          "OpenStreetMap via Overpass · live, free, no business hours or reviews",
          "compass",
        )}
        {row(
          "Navigation",
          "Live GPS turn-by-turn with voice · works while the app is open",
          "play-circle",
        )}
        {row(
          "Voice guidance",
          n.muted
            ? "Spoken turn instructions available · currently muted"
            : "Spoken turn instructions on · on-device voice (expo-speech)",
          n.muted ? "volume-x" : "volume-2",
          () => n.setMuted(!n.muted),
        )}
        {row(
          "Foreground device location",
          locationStatusText(
            n.permission,
            { accuracy: n.gpsAccuracy, at: n.locationFixAt },
            now,
          ),
          "crosshair",
          n.permission === "requesting" ? undefined : n.locate,
        )}
        {offlineRows()}
        {row(
          "Road disruptions & closures",
          traffic
            ? `${trafficStatusLine(traffic)} · London roads only · not live speeds, motorways or route-time changes`
            : "Unavailable",
          "alert-triangle",
          traffic ? () => n.setPanel("layers") : undefined,
        )}
        {row(
          "Community reports",
          "No live reports available · local test reports only",
          "alert-circle",
          () => n.setPanel("review"),
        )}
        {row("Car displays & lock screen", carStatusText(), "smartphone")}
        {row(
          "EV, trucks, zones, costs and AI",
          "Requires verified providers and validation · planned",
          "zap",
        )}
        {row(
          "Provider health",
          providerHealthLines(n.providerHealth, now).join("\n"),
          "activity",
        )}
        {n.providerRefreshing ? (
          <View
            style={[s.actions, { justifyContent: "center", minHeight: 48 }]}
          >
            <ActivityIndicator color={palette.teal} />
            <Text style={[s.subtitle, { color: muted }]}>
              Checking driving, walking and cycling…
            </Text>
          </View>
        ) : (
          <Button
            title="Refresh provider status"
            secondary
            dark={dark}
            onPress={n.refreshProviders}
          />
        )}
        {note(
          "A provider route is a planning result, not evidence of current safe or legal road access.",
          true,
        )}
      </>
    );
  else if (n.panel === "privacy")
    body = (
      <>
        {heading(
          "Your journey. Your data.",
          "Guest by default. Local by design.",
        )}
        <View
          style={[
            s.privacyHero,
            { backgroundColor: dark ? "#173B38" : "#EAF5EF" },
          ]}
        >
          <Icon
            name="shield"
            size={32}
            color={dark ? "#62D6BB" : palette.teal}
          />
          <Text style={[s.rowTitle, { color: ink }]}>
            No account. No location trail.
          </Text>
          <Text style={[s.subtitle, { color: muted }]}>
            Preferences, bookmarks and test reports stay on this device. No
            advertising analytics.
          </Text>
        </View>
        {toggle(
          "Keep simulated trip history",
          "Off by default. No exact route or GPS trace saved.",
          n.prefs.history,
          (v) => n.setPrefs((p) => ({ ...p, history: v })),
        )}
        {row(
          "Location permission",
          `${n.permission} · foreground fix only`,
          "crosshair",
          n.locate,
        )}
        {row(
          "Live trip sharing",
          "Not implemented. No tracking links exist to revoke.",
          "share-2",
        )}
        {row(
          "Export local guest data",
          "Download JSON on web; native system share sheet.",
          "upload",
          () => n.setPanel("export"),
        )}
        {row(
          "Delete local guest data",
          "Remove saved places, preferences and demo history.",
          "trash-2",
          () => setDeleteConfirm(true),
        )}
        {deleteConfirm && (
          <View style={{ gap: 10 }}>
            {note(
              "Delete all NEXORA guest data on this device? This cannot be undone.",
              true,
            )}
            <Button
              title="Delete my local data"
              onPress={() => {
                n.clearData();
                setDeleteConfirm(false);
              }}
            />
            <Button
              title="Keep my data"
              secondary
              dark={dark}
              onPress={() => setDeleteConfirm(false)}
            />
          </View>
        )}
        {note(
          "Map tile requests reveal the viewed area to OSM. Test routing sends only the requested endpoints to OSRM. These external services have their own privacy policies. No GPS history is uploaded.",
        )}
        {note(
          "Privacy and legal notices are draft documentation. DPIA, legal review and native permission validation remain required before beta.",
        )}
      </>
    );
  else if (n.panel === "export")
    body = (
      <>
        {heading(
          "Your local data",
          "A portable JSON export. No cloud account exists.",
        )}
        <Button
          title="Export JSON"
          icon="download"
          onPress={async () => {
            try {
              await exportGuestData(n.exportData);
              n.setToast("Local data export opened.");
            } catch {
              n.setToast(
                "Export could not open. Select the JSON below to copy.",
              );
            }
          }}
        />
        <Text
          selectable
          style={[
            s.export,
            { color: ink, backgroundColor: dark ? "#223247" : "#F2F6F4" },
          ]}
        >
          {n.exportData}
        </Text>
      </>
    );
  else if (n.panel === "report")
    body = (
      <>
        {heading(
          "Add a test report",
          "Local demo community · not live traffic.",
        )}
        <Badge text="Demo only · device-local" warning dark={dark} />
        {n.moving ? (
          note(
            "Pause simulated playback before entering a report. Real driving reporting is not enabled.",
            true,
          )
        ) : (
          <>
            <Text style={[s.subtitle, { color: muted }]}>
              Location:{" "}
              {n.position
                ? "simulated position"
                : n.destination?.name || "manual origin"}{" "}
              · observed now. Road segment and direction are not verified.
            </Text>
            <View style={s.categories}>
              {[
                "roadworks",
                "closure",
                "debris",
                "collision",
                "pothole",
                "congestion",
              ].map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  onPress={() => setCategory(c)}
                  style={[
                    s.category,
                    {
                      borderColor:
                        category === c
                          ? palette.teal
                          : dark
                            ? "#34465B"
                            : "#DFE7E2",
                      backgroundColor:
                        category === c
                          ? dark
                            ? "#173B38"
                            : "#EAF5EF"
                          : surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        category === c
                          ? dark
                            ? "#62D6BB"
                            : palette.teal
                          : ink,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {c[0].toUpperCase() + c.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {error}
            <Button
              title="Submit to local test queue"
              icon="flag"
              onPress={() => {
                try {
                  const observedAt = Date.now();
                  setNow(observedAt);
                  n.setReports(
                    createIncident(
                      n.reports,
                      category,
                      n.position ||
                        n.destination?.coordinate ||
                        n.origin.coordinate,
                      observedAt,
                    ),
                  );
                  n.setToast(
                    "Test report queued. No live report was published.",
                  );
                  n.setPanel("review");
                } catch (e) {
                  n.setError(
                    e instanceof Error ? e.message : "Report rejected.",
                  );
                }
              }}
            />
            {note(
              "An unverified test report never changes a real route. Duplicates within 60 m / 15 minutes are merged; maximum 5 new reports per hour.",
            )}
          </>
        )}
      </>
    );
  else if (n.panel === "review")
    body = (
      <>
        {heading(
          "Test community",
          "Local review console · not production admin.",
        )}
        <Badge text="No live reports available" warning dark={dark} />
        <Text style={[s.subtitle, { color: muted }]}>
          Pending reports are unverified. Approving a local fixture is not an
          authority confirmation.
        </Text>
        {liveIncidents(n.reports, now).length === 0 ? (
          <View style={s.empty}>
            <Icon name="check-circle" size={36} color={palette.teal} />
            <Text style={[s.rowTitle, { color: ink }]}>A clear test queue</Text>
            <Text style={[s.subtitle, { color: muted }]}>
              No current local reports. Expired entries stay in the rate-limit
              ledger.
            </Text>
          </View>
        ) : (
          liveIncidents(n.reports, now).map((r) => (
            <View
              key={r.id}
              style={[
                s.routeCard,
                { borderColor: dark ? "#34465B" : "#E1E8E4" },
              ]}
            >
              <Text style={[s.rowTitle, { color: ink }]}>
                {r.category.toUpperCase()}
              </Text>
              <Text style={[s.rowDetail, { color: muted }]}>
                {r.status} · {r.confirmations} test confirmations · expires{" "}
                {new Date(r.expiresAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <View style={[s.actions, { marginTop: 12 }]}>
                <Button
                  title="Confirm"
                  secondary
                  dark={dark}
                  onPress={() => {
                    if (n.moving) return;
                    n.setReports(
                      n.reports.map((x) =>
                        x.id === r.id
                          ? { ...x, confirmations: x.confirmations + 1 }
                          : x,
                      ),
                    );
                    n.setToast(
                      "Local test confirmation added, not independent corroboration.",
                    );
                  }}
                />
                <Button
                  title="Not there"
                  secondary
                  dark={dark}
                  onPress={() =>
                    n.setReports(
                      n.reports.map((x) =>
                        x.id === r.id ? { ...x, status: "rejected" } : x,
                      ),
                    )
                  }
                />
              </View>
              {r.status === "pending" && DEV_TOOLS && (
                <Pressable
                  accessibilityRole="button"
                  style={s.link}
                  onPress={() =>
                    n.setReports(
                      n.reports.map((x) =>
                        x.id === r.id ? { ...x, status: "approved" } : x,
                      ),
                    )
                  }
                >
                  <Text
                    style={[
                      s.linkText,
                      { color: dark ? "#62D6BB" : palette.teal },
                    ]}
                  >
                    Approve test fixture
                  </Text>
                </Pressable>
              )}
            </View>
          ))
        )}
        <Button
          title="Add a test report"
          onPress={() => n.setPanel("report")}
          secondary
          dark={dark}
        />
        {note(
          "Real admin API denies anonymous access. RBAC, audit, appeals and operations are beta prerequisites.",
        )}
      </>
    );
  else if (n.panel === "onboard")
    body = (
      <>
        {heading(
          "Less second-guessing.",
          "Meet NEXORA, your calmer journey planner.",
        )}
        <View style={{ gap: 4 }}>
          {row(
            "Choose your kind of journey",
            "Compare known route trade-offs, not invented promises.",
            "navigation",
          )}
          {row(
            "Keep your route steady",
            "Route lock ignores small fluctuations, never essential changes.",
            "lock",
          )}
          {row(
            "Keep your data yours",
            "Guest planning. Local bookmarks. No default GPS history.",
            "shield",
          )}
        </View>
        {note(
          "Turn-by-turn navigation follows your GPS while the app is open. Full offline routing is not enabled.",
        )}
        <View
          style={[
            s.privacyHero,
            { backgroundColor: dark ? "#223247" : "#F2F6F4" },
          ]}
        >
          <Text style={[s.rowTitle, { color: ink }]}>
            Start routes from where you are
          </Text>
          <Text style={[s.rowDetail, { color: muted }]}>
            Without your location, routes start from King&apos;s Cross, a demo
            point. NEXORA asks for your location only while the app is open, to
            set your starting point. It is not saved as history. You can skip
            this and search or pin a start point instead.
          </Text>
          <Button
            title="Use my location"
            icon="crosshair"
            dark={dark}
            onPress={async () => {
              n.setPrefs((p) => ({ ...p, onboardingSeen: true }));
              n.setPanel(null);
              await n.locate();
              // UX-010: ask for the guidance card here, before any guidance,
              // so the system dialog never appears over a guidance screen.
              await requestGuidanceNotifications("onboarding", n.active);
            }}
          />
        </View>
        <Button
          title="Continue as guest"
          onPress={() => {
            n.setPrefs((p) => ({ ...p, onboardingSeen: true }));
            n.setPanel(null);
          }}
        />
        <Button
          title="Review privacy choices"
          secondary
          dark={dark}
          onPress={() => n.setPanel("privacy")}
        />
      </>
    );
  else return null;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ maxHeight: "100%" }}
      contentContainerStyle={s.content}
    >
      {body}
    </ScrollView>
  );
}
export const s = StyleSheet.create({
  content: { padding: 22, gap: 16, paddingBottom: 26 },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 20, marginTop: 4 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.35 },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 15,
    paddingLeft: 14,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 16, minWidth: 0 },
  smallTap: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "600" },
  rowDetail: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  destructive: {
    minHeight: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: "#B42335",
  },
  destructiveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    borderRadius: 13,
  },
  noteText: { fontSize: 12, lineHeight: 18, flex: 1 },
  empty: { paddingVertical: 26, alignItems: "center", gap: 12 },
  placeHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 8,
  },
  heroIcon: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  coords: { fontSize: 13, letterSpacing: 0.5 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  originBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
  },
  originDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#087F73",
  },
  destDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: "#087F73",
  },
  originRow: { minHeight: 48, justifyContent: "center" },
  originNotice: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    flexShrink: 1,
  },
  disclosure: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  originText: { fontSize: 14, fontWeight: "600" },
  tiny: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  preference: { flexDirection: "row", gap: 2 },
  prefButton: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 9 },
  routeCard: { padding: 16, borderWidth: 1.5, borderRadius: 18, gap: 4 },
  routeTitle: { fontSize: 15, fontWeight: "700" },
  routeTime: { fontSize: 27, fontWeight: "700", letterSpacing: -1 },
  radio: {
    width: 17,
    height: 17,
    borderWidth: 1.5,
    borderRadius: 9,
  },
  routeExplain: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  link: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  linkText: { fontSize: 13, fontWeight: "600" },
  privacyHero: { padding: 20, borderRadius: 18, gap: 12 },
  export: {
    padding: 14,
    borderRadius: 12,
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 17,
  },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
  },
  addStop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  stopTool: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#397BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stopBadgeText: { fontSize: 11, fontWeight: "700", color: "#397BFF" },
  category: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
  },
});
