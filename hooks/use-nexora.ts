import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Linking } from "react-native";
import {
  api,
  ApiError,
  friendlyApiError,
  useServerState,
  ROUTE_TIMEOUT_MS,
  SEARCH_TIMEOUT_MS,
} from "@/lib/nexora-api";
import {
  createLatestOnly,
  createRerouteController,
  idleCarGuidance,
} from "@/lib/nexora-controllers";
import { buildCarGuidance } from "@/shared/nexora/car-guidance";
import { DEV_TOOLS } from "@/lib/dev-tools";
import { liveStartMessage } from "@/components/nexora/screen-logic";
import { onCarCommand, publishCarGuidance } from "@/lib/car/guidance-bus";
import type { Coord, Place, Route, Incident } from "@/shared/nexora/domain";
import {
  scoreRoutes,
  validateCoord,
  rerouteDecision,
} from "@/shared/nexora/domain";
import { sessionReducer, playbackAt } from "@/shared/nexora/session";
import {
  say,
  useLiveGuidance,
  useSpokenGuidance,
} from "@/hooks/use-live-guidance";
import { DEMO_PLACES, syntheticItinerary } from "@/shared/nexora/fixtures";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/shared/nexora/places";
import { normaliseMapView, type MapView } from "@/shared/nexora/map-view";
import {
  addStop,
  checkItinerary,
  moveStop,
  removeStop,
  type Avoidance,
  type ScheduleKind,
} from "@/shared/nexora/itinerary";
import {
  ROUTING_PROFILES,
  mergeHealth,
  providerHealthSummary,
  type HealthMap,
  type LocationPermission,
} from "@/shared/nexora/status";

export type Panel =
  | null
  | "search"
  | "place"
  | "routes"
  | "layers"
  | "providers"
  | "privacy"
  | "report"
  | "review"
  | "export"
  | "onboard";
export type Preferences = {
  dark: boolean;
  metric: boolean;
  reducedMotion: boolean;
  history: boolean;
  routeMode: "automatic" | "ask" | "locked";
  onboardingSeen: boolean;
  /** MAP-3D: flat map or tilted 3D buildings. */
  mapView: MapView;
};
type Trip = {
  id: string;
  origin: string;
  destination: string;
  distanceM: number;
  durationS: number;
  completedAt: string;
  /** false only for trips guided by live device GPS. */
  simulated: boolean;
};
const STORE = "nexora-local-guest-v1";
const defaultPrefs: Preferences = {
  dark: false,
  metric: false,
  reducedMotion: false,
  history: false,
  routeMode: "locked",
  onboardingSeen: false,
  mapView: "2d",
};
export function useNexora() {
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [saved, setSaved] = useState<Place[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [reports, setReports] = useState<Incident[]>([]);
  const [home, setHome] = useState<Place | null>(null);
  const [work, setWork] = useState<Place | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState("Home");
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState("");
  const [searchFor, setSearchFor] = useState<
    "destination" | "origin" | "home" | "work" | "stop"
  >("destination");
  const [searchResults, setSearchResults] = useState<Place[] | null>(null);
  const [origin, setOrigin] = useState<Place>(DEMO_PLACES[0]);
  const [destination, setDestination] = useState<Place | null>(null);
  const [stops, setStops] = useState<Place[]>([]);
  const [avoid, setAvoid] = useState<Avoidance[]>([]);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("now");
  const [scheduleTime, setScheduleTime] = useState("");
  const [mode, setMode] = useState<"driving" | "walking" | "cycling">(
    "driving",
  );
  const [preference, setPreference] = useState<"fastest" | "relaxed">(
    "fastest",
  );
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [state, setState] = useReducer(sessionReducer, "idle");
  const requestGeneration = useRef(0);
  const locationGeneration = useRef(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [guidanceSource, setGuidanceSource] = useState<"simulation" | "live">(
    "live",
  );
  const [tripSeq, setTripSeq] = useState(0);
  const [event, setEvent] = useState("");
  const [online, setOnline] = useState(true);
  const [gps, setGps] = useState<Coord | undefined>();
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [permission, setPermission] =
    useState<LocationPermission>("undetermined");
  const [locationFixAt, setLocationFixAt] = useState<string | null>(null);
  const [deviceHealth, setDeviceHealth] = useState<HealthMap>({});
  const [providerRefreshing, setProviderRefreshing] = useState(false);
  const [center, setCenter] = useState<Coord | undefined>();
  const [mapCommand, setMapCommand] = useState("");
  const [capabilities, setCapabilities] = useState<any>(null);
  // "waking" while the free Render server boots (about 50 s after 15 min idle).
  const serverState = useServerState();
  const capabilitiesLoading = useRef<Promise<void> | null>(null);
  /** Load capabilities with backoff; shared while one load is in flight. */
  function loadCapabilities() {
    if (capabilitiesLoading.current) return capabilitiesLoading.current;
    const load = api
      .capabilities()
      .then(setCapabilities)
      .catch(() => {
        /* the search panel retries when opened; local search still works */
      })
      .finally(() => {
        capabilitiesLoading.current = null;
      });
    capabilitiesLoading.current = load;
    return load;
  }
  /** Only the newest live search may report back (BUG-006). */
  const searchRef = useRef<ReturnType<typeof createLatestOnly> | null>(null);
  searchRef.current ??= createLatestOnly();
  const search = searchRef.current;
  /** Drop any in-flight live search so a slow reply cannot overwrite newer state. */
  function cancelSearch() {
    search.cancel();
  }
  /** Reroute requests and the visited-stop offset of the current trip (BUG-002). */
  const rerouteRef = useRef<ReturnType<
    typeof createRerouteController<Place, Route>
  > | null>(null);
  rerouteRef.current ??= createRerouteController<Place, Route>(api);
  const reroute = rerouteRef.current;
  const tripRecorded = useRef(false);
  // Live nearby places (OpenStreetMap via the server's Overpass route).
  const [browsing, setBrowsing] = useState<PlaceCategory | null>(null);
  const [highlights, setHighlights] = useState<Place[] | null>(null);
  const nearbyRef = useRef<ReturnType<typeof createLatestOnly> | null>(null);
  nearbyRef.current ??= createLatestOnly();
  const nearbyReq = nearbyRef.current;
  const hydratedRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(STORE)
      .then((raw) => {
        if (raw) {
          const data = JSON.parse(raw);
          setPrefs({
            ...defaultPrefs,
            ...data.prefs,
            mapView: normaliseMapView(data.prefs?.mapView),
          });
          setSaved(data.saved || []);
          setTrips(data.trips || []);
          setReports(data.reports || []);
          setHome(data.home || null);
          setWork(data.work || null);
        }
      })
      .catch(() => setToast("Local data could not be loaded."))
      .finally(() => {
        hydratedRef.current = true;
        setHydrated(true);
      });
    // Start waking the server at once, then load capabilities with backoff (BUG-001).
    // The client turns synchronous fetch throws (e.g. "Invalid URL" when the API base
    // URL is empty on native) into rejections, so neither can crash the app on launch.
    api.warmUp().catch(() => {});
    loadCapabilities();
    readLocationPermission();
    return () => cancelSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(
      STORE,
      JSON.stringify({ prefs, saved, trips, reports, home, work }),
    ).catch(() => setToast("Local changes could not be saved."));
  }, [prefs, saved, trips, reports, home, work, hydrated]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const ranked = useMemo(
    () => scoreRoutes(routes, preference),
    [routes, preference],
  );
  const route = ranked.find((r) => r.id === selectedId) || ranked[0];
  const active = ["navigating", "degraded", "offline", "rerouting"].includes(
    state,
  );
  const moving = active && !paused;
  const isLive = active && guidanceSource === "live";
  const live = useLiveGuidance({
    route,
    mode,
    routeMode: prefs.routeMode,
    requestReroute: async (from, passed) => {
      // Visited-stop offset (BUG-002) and the state-aware timeout (BUG-007, BUG-013)
      // live in lib/nexora-controllers.ts, where they are tested.
      const candidates = await reroute.request(
        { destination: destination?.coordinate, stops, mode, avoid },
        from,
        passed,
      );
      if (!candidates.length) return null;
      return scoreRoutes(candidates, preference)[0] ?? null;
    },
    applyReroute: (next) => {
      reroute.apply();
      setRoutes([next]);
      setSelectedId(next.id);
    },
    speak: (text) => {
      if (!muted) say(text);
    },
    // Live GPS drives progress and the navigation state; the timer below is simulation only.
    onUpdate: ({ status, progress: fraction }) => {
      if (status === "arrived") {
        setProgress(1);
        return;
      }
      if (fraction !== null) setProgress(fraction);
      if (status === "weak-signal") setState("degraded");
      else if (status === "rerouting") setState("rerouting");
      else if (status === "on-route" || status === "off-route")
        setState("navigating");
      else if (status === "error" || status === "denied") {
        setState("degraded");
        setToast(
          "Location stopped. Guidance paused; stop safely before changing settings.",
        );
      }
    },
  });
  const stopLive = live.stop;
  useSpokenGuidance({
    route,
    progress: !active
      ? null
      : isLive
        ? live.alongM === null
          ? null
          : live.progress
        : progress,
    mode,
    metric: prefs.metric,
    enabled: !muted && active,
    tripKey: `${guidanceSource}:${tripSeq}`,
  });
  useEffect(() => {
    if (
      !active ||
      guidanceSource === "live" ||
      paused ||
      state === "degraded" ||
      state === "offline" ||
      state === "rerouting"
    )
      return;
    const timer = setInterval(
      () => setProgress((p) => Math.min(1, p + 0.012)),
      prefs.reducedMotion ? 1200 : 700,
    );
    return () => clearInterval(timer);
  }, [active, guidanceSource, paused, state, prefs.reducedMotion]);
  useEffect(() => {
    if (progress < 1 || !active) return;
    stopLive();
    setState("arrived");
    setEvent("");
    setGps(undefined);
    if (prefs.history && !tripRecorded.current && route && destination) {
      tripRecorded.current = true;
      setTrips((t) =>
        [
          {
            id: String(Date.now()),
            origin: origin.name,
            destination: destination.name,
            distanceM: route.distanceM,
            durationS: route.durationS,
            completedAt: new Date().toISOString(),
            simulated: guidanceSource !== "live",
          },
          ...t,
        ].slice(0, 50),
      );
    }
  }, [progress, active, prefs.history, route, destination, origin.name, guidanceSource, stopLive]);
  const playback = useMemo(
    () => (route ? playbackAt(route, progress) : null),
    [route, progress],
  );
  const position = isLive
    ? live.position
    : active && state !== "degraded"
      ? playback?.position
      : undefined;
  const step = isLive ? live.step : playback?.step;
  const localResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Instant matches among live places already loaded; Search asks the geocoder.
    const known = highlights ?? [];
    const result = q
      ? known.filter((p) =>
          `${p.name} ${p.subtitle} ${p.category}`.toLowerCase().includes(q),
        )
      : known;
    const match = query.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (match) {
      const c: Coord = [Number(match[2]), Number(match[1])];
      if (validateCoord(c))
        return [
          {
            id: "coordinates",
            name: "Entered coordinates",
            subtitle: `${match[1]}, ${match[2]} · latitude, longitude`,
            coordinate: c,
            category: "pin",
            source: "User-entered coordinates",
          },
        ];
    }
    return result;
  }, [query, highlights]);
  const results = searchResults || localResults;
  function openSearch(forField: typeof searchFor = "destination") {
    if (active) return;
    cancelSearch();
    setBusy(false);
    // The server may have been asleep at launch: try again now the user wants search.
    if (!capabilities) loadCapabilities();
    setSearchFor(forField);
    setQuery("");
    setSearchResults(null);
    setBrowsing(null);
    nearbyReq.cancel();
    setError("");
    setPanel("search");
  }
  /** Where "nearby" means: the device fix, else the map centre, else the trip origin. */
  const nearbyAnchor: Coord = gps ?? center ?? origin.coordinate;
  const fetchNearby = (
    category: PlaceCategory,
    at: Coord,
    signal: AbortSignal,
  ) =>
    api
      .json<{ places: Place[] }>(
        `/api/nexora/places?category=${category}&lat=${at[1].toFixed(5)}&lon=${at[0].toFixed(5)}`,
        { signal, awakeTimeoutMs: SEARCH_TIMEOUT_MS + 4000 },
      )
      .then((d) => (Array.isArray(d?.places) ? d.places : []));
  /** Open the search sheet on live places of one category around the user. */
  async function browse(category: PlaceCategory) {
    if (active) return;
    openSearch("destination");
    setBrowsing(category);
    setBusy(true);
    await nearbyReq.run(
      (signal) => fetchNearby(category, nearbyAnchor, signal),
      {
        onResult: (places) => setSearchResults(places),
        onError: (e) =>
          setError(
            friendlyApiError(
              e,
              api.getState(),
              `${PLACE_CATEGORIES[category].label} nearby are unavailable. Try again.`,
            ),
          ),
        onSettled: () => setBusy(false),
      },
    );
  }
  // Home-screen highlights: refreshed when the anchor moves to another ~1 km cell.
  const highlightCell = `${nearbyAnchor[0].toFixed(2)},${nearbyAnchor[1].toFixed(2)}`;
  useEffect(() => {
    if (!online || active) return;
    const controller = new AbortController();
    fetchNearby("highlights", nearbyAnchor, controller.signal)
      .then((places) => setHighlights(places.slice(0, 8)))
      .catch(() => {
        /* the home list stays hidden; chips and search still work */
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightCell, online, active]);
  function choosePlace(place: Place, field = searchFor) {
    if (active) return;
    requestGeneration.current += 1;
    locationGeneration.current += 1;
    cancelSearch();
    setBusy(false);
    if (field === "origin") {
      setOrigin(place);
      setRoutes([]);
      setState("idle");
      setPanel(destination ? "routes" : null);
    } else if (field === "stop") {
      try {
        setStops((prev) => addStop(prev, place));
        setRoutes([]);
        setState("idle");
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Stop not added.");
      }
      setPanel("routes");
    } else if (field === "home") {
      setHome(place);
      setPanel(null);
      setToast("Home saved on this device.");
    } else if (field === "work") {
      setWork(place);
      setPanel(null);
      setToast("Work saved on this device.");
    } else {
      setDestination(place);
      setRoutes([]);
      setState("idle");
      setPanel("place");
    }
    setCenter(place.coordinate);
    setError("");
  }
  function pin(c: Coord) {
    if (moving || !validateCoord(c)) return;
    setSearchFor("destination");
    choosePlace(
      {
        id: `pin-${c.join(",")}`,
        name: "Dropped pin",
        subtitle: `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`,
        coordinate: c,
        category: "pin",
        source: "User-selected map coordinates",
      },
      "destination",
    );
  }
  // A new query makes any in-flight search stale (BUG-006).
  useEffect(() => {
    if (!search.inFlight()) return;
    cancelSearch();
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  async function liveSearch() {
    if (moving) return;
    nearbyReq.cancel();
    setBrowsing(null);
    setBusy(true);
    setError("");
    await search.run(
      (signal) =>
        api.json<{ results: Place[] }>(
          `/api/nexora/search?q=${encodeURIComponent(query)}`,
          // Widens to the wake timeout if the server may be asleep (BUG-013).
          { signal, awakeTimeoutMs: SEARCH_TIMEOUT_MS },
        ),
      {
        onResult: (d) =>
          setSearchResults(Array.isArray(d?.results) ? d.results : []),
        onError: (e) =>
          setError(
            friendlyApiError(e, api.getState(), "Search failed. Try again."),
          ),
        onSettled: () => setBusy(false),
      },
    );
  }
  async function calculate(useFixture = false, selectedMode = mode) {
    if (!destination || active || !online) {
      if (!online)
        setError(
          "Offline: new routes require a network connection. Explicit synthetic demo remains available.",
        );
      if (!useFixture) return;
    }
    if (!destination) return;
    const itinerary = checkItinerary(origin, stops, destination);
    if (!itinerary.ok) {
      setPanel("routes");
      setRoutes([]);
      setError(itinerary.reason);
      return;
    }
    const generation = ++requestGeneration.current;
    setPanel("routes");
    setBusy(true);
    setError("");
    setState("planning");
    setRoutes([]);
    try {
      if (useFixture) {
        const next = syntheticItinerary(
          origin,
          stops,
          destination,
          selectedMode,
        );
        setRoutes(next);
        setSelectedId(next[0]?.id || "");
      } else {
        // Up to 60 s while the server is waking, 18 s once it is awake (BUG-001).
        const data = await api.json<{ routes?: Route[] }>("/api/nexora/routes", {
          body: {
            origin: origin.coordinate,
            destination: destination.coordinate,
            mode: selectedMode,
            ...(stops.length
              ? { stops: stops.map((stop) => stop.coordinate) }
              : {}),
            ...(avoid.length && selectedMode === "driving" ? { avoid } : {}),
          },
          awakeTimeoutMs: ROUTE_TIMEOUT_MS,
        });
        if (generation !== requestGeneration.current) return;
        const next = Array.isArray(data.routes) ? data.routes : [];
        setRoutes(next);
        setSelectedId(next[0]?.id || "");
      }
      setState("preview");
    } catch (e) {
      if (generation !== requestGeneration.current) return;
      setState("idle");
      setError(friendlyApiError(e, api.getState(), "Route unavailable. Try again."));
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }
  /**
   * Start guidance. "live" (the default) follows device GPS; "simulation"
   * replays the route and is a developer tool only (DEV_TOOLS).
   */
  async function start(source: "simulation" | "live" = "live") {
    locationGeneration.current += 1;
    if (!route || busy || state !== "preview") return;
    if (source === "simulation" && !DEV_TOOLS) return;
    if (source === "live") {
      const result = await live.start();
      if (result !== "ok") {
        if (result !== "error") setPermission(result);
        setToast(liveStartMessage(result));
        if (result === "blocked") Linking.openSettings().catch(() => {});
        return;
      }
      setPermission("granted");
    } else live.stop();
    setGuidanceSource(source);
    reroute.reset();
    setTripSeq((n) => n + 1);
    tripRecorded.current = false;
    setProgress(0);
    setPaused(false);
    setEvent("");
    setState("navigating");
    setPanel(null);
  }
  function end() {
    locationGeneration.current += 1;
    live.stop();
    setGpsAccuracy(null);
    if (origin.id === "device-position") setOrigin(DEMO_PLACES[0]);
    setState("ended");
    setProgress(0);
    setPaused(false);
    setEvent("");
    setPanel(null);
    setGps(undefined);
    setToast(
      guidanceSource === "live"
        ? "Navigation ended. Location is no longer in use."
        : "Simulation ended. Location is no longer active.",
    );
  }
  function reset() {
    live.stop();
    requestGeneration.current += 1;
    locationGeneration.current += 1;
    setGps(undefined);
    setGpsAccuracy(null);
    if (origin.id === "device-position") setOrigin(DEMO_PLACES[0]);
    setBusy(false);
    setState("idle");
    setRoutes([]);
    setDestination(null);
    setStops([]);
    setPanel(null);
    setEvent("");
    setProgress(0);
    setCenter([-0.116, 51.515]);
  }
  /** Reflect the OS permission that already exists, without prompting. */
  function readLocationPermission() {
    Location.getForegroundPermissionsAsync()
      .then((p) =>
        setPermission(
          p.status === "granted"
            ? "granted"
            : p.status === "denied"
              ? p.canAskAgain
                ? "denied"
                : "blocked"
              : "undetermined",
        ),
      )
      .catch(() => {});
  }
  async function locate() {
    if (active) {
      setToast("End navigation before requesting device location.");
      return;
    }
    if (permission === "blocked") {
      // The user may have allowed it in system settings since; re-check before
      // sending them there again.
      const current = await Location.getForegroundPermissionsAsync().catch(
        () => null,
      );
      if (!current || (current.status !== "granted" && !current.canAskAgain)) {
        setToast("Location is blocked for NEXORA. Opening app settings.");
        Linking.openSettings().catch(() => {});
        return;
      }
    }
    const token = ++locationGeneration.current;
    setPermission("requesting");
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (token !== locationGeneration.current) return;
      if (p.status !== "granted") {
        const blocked = !p.canAskAgain;
        setPermission(blocked ? "blocked" : "denied");
        setToast(
          blocked
            ? "Location is blocked. Allow it in system settings, or search or pin an origin."
            : "Location not allowed. Search or pin an origin manually.",
        );
        return;
      }
      if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
        if (token !== locationGeneration.current) return;
        setPermission("services-off");
        setToast("Turn on location services, then tap the location button again.");
        return;
      }
      // A cold GPS can take a long time; fall back to the last known position
      // (if recent) rather than leaving the button spinning forever.
      let rejected = false;
      const ask = (options: Location.LocationOptions) =>
        Promise.race([
          Location.getCurrentPositionAsync(options),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
        ]).catch(() => {
          rejected = true;
          return null;
        });
      let fix = await ask({ accuracy: Location.Accuracy.Balanced });
      // Android: if the user declines Google's "Location Accuracy" prompt, the request
      // is rejected even though GPS works. Retry once from GPS alone, without the prompt.
      if (!fix && rejected && token === locationGeneration.current)
        fix = await ask({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: false,
        });
      const location =
        fix ??
        (await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60 * 1000,
        }).catch(() => null));
      if (token !== locationGeneration.current) return;
      if (!location) {
        setPermission("granted");
        setToast("No position fix yet. Try again outdoors, or set an origin manually.");
        return;
      }
      const c: Coord = [location.coords.longitude, location.coords.latitude];
      if (!validateCoord(c)) {
        setPermission("granted");
        setToast("The device returned an invalid position. Set an origin manually.");
        return;
      }
      setPermission("granted");
      setGps(c);
      setGpsAccuracy(location.coords.accuracy);
      setLocationFixAt(new Date(location.timestamp || Date.now()).toISOString());
      setCenter(c);
      requestGeneration.current += 1;
      setBusy(false);
      setRoutes([]);
      setState("idle");
      setOrigin({
        id: "device-position",
        name: "Current device location",
        subtitle: `Accuracy ±${Math.round(location.coords.accuracy || 0)} m · ${fix ? "foreground fix" : "last known position"}`,
        coordinate: c,
        category: "location",
        source: "Device GPS · not used for road guidance",
      });
      setToast(
        fix
          ? "Showing your position. It is now your route origin."
          : "Showing your last known position (no fresh fix yet).",
      );
    } catch {
      if (token !== locationGeneration.current) return;
      setPermission("unavailable");
      setToast("Location unavailable. Manual origin still works.");
    }
  }
  /**
   * Check each routing profile through the app's own API with a short fixed London
   * request, then re-read the server's capabilities. Results are measured, not assumed.
   */
  async function refreshProviders() {
    if (providerRefreshing) return;
    setProviderRefreshing(true);
    const results: HealthMap = {};
    for (const mode of ROUTING_PROFILES) {
      const started = Date.now();
      try {
        const d = await api.json<{ routes?: Route[] }>("/api/nexora/routes", {
          body: {
            origin: [-0.1196, 51.5174],
            destination: [-0.1234, 51.5113],
            mode,
          },
          awakeTimeoutMs: ROUTE_TIMEOUT_MS,
        });
        const ms = Date.now() - started;
        const checkedAt = new Date().toISOString();
        results[mode] = d?.routes?.length
          ? { status: "reachable", checkedAt, ms }
          : { status: "error", checkedAt, reason: "no route returned" };
      } catch (e) {
        const checkedAt = new Date().toISOString();
        if (e instanceof ApiError && e.kind === "http" && e.status === 429)
          results[mode] = { status: "limited", checkedAt };
        else if (e instanceof ApiError && e.kind === "http")
          results[mode] = {
            status: e.status === 503 ? "unavailable" : "error",
            checkedAt,
            reason: `HTTP ${e.status}`,
          };
        else
          results[mode] = {
            status: "unavailable",
            checkedAt,
            reason:
              e instanceof ApiError && e.kind === "timeout"
                ? "NEXORA API did not answer in time"
                : "no connection to NEXORA API",
          };
      }
    }
    try {
      const caps = await api.json<any>("/api/nexora/capabilities");
      // The server's record comes from these same probes but is stamped with the
      // server's clock. If the device clock runs behind, that record would look newer
      // and hide this device's measurement (and its timing), so let this refresh win.
      const server: HealthMap = caps?.routing?.health ?? {};
      for (const mode of ROUTING_PROFILES) {
        const mine = results[mode];
        const theirs = server[mode]?.checkedAt;
        if (mine?.checkedAt && theirs && Date.parse(theirs) > Date.parse(mine.checkedAt))
          results[mode] = { ...mine, checkedAt: theirs };
      }
      setCapabilities(caps);
    } catch {
      /* device results below still stand */
    }
    setDeviceHealth(results);
    setProviderRefreshing(false);
    setToast(providerHealthSummary(results));
  }
  const providerHealth = useMemo(
    () => mergeHealth(capabilities?.routing?.health, deviceHealth),
    [capabilities, deviceHealth],
  );
  function savePlace(place: Place) {
    setSaved((prev) =>
      prev.some((p) => p.id === place.id)
        ? prev.filter((p) => p.id !== place.id)
        : [...prev, place],
    );
    setToast(
      saved.some((p) => p.id === place.id)
        ? "Removed from saved places."
        : "Saved on this device.",
    );
  }
  function inject(type: string) {
    if (!active || guidanceSource === "live") return;
    if (type === "jitter") {
      const d = rerouteDecision({
        currentRemainingS: (route?.durationS || 1000) * (1 - progress),
        candidateRemainingS: Math.max(
          0,
          (route?.durationS || 1000) * (1 - progress) - 30,
        ),
        mode: prefs.routeMode,
        stableUpdates: 1,
        lastRerouteAt: null,
        now: Date.now(),
        stationary: paused,
      });
      setEvent(`Synthetic ETA fluctuation: ${d.reason}. No route changed.`);
    }
    if (type === "recover") {
      setState("navigating");
      setOnline(true);
      setEvent("Recovered in simulation.");
    }
    if (type === "tunnel") {
      setState("degraded");
      setEvent(
        "Synthetic GPS loss. Position uncertain; no off-route declaration.",
      );
    }
    if (type === "offline") {
      setState("offline");
      setOnline(false);
      setEvent(
        "Synthetic offline event. Cached route visible; new routing unavailable.",
      );
    }
    if (type === "closure") {
      setState("rerouting");
      setPaused(true);
      const d = rerouteDecision({
        currentRemainingS: route?.durationS || 0,
        candidateRemainingS: NaN,
        mode: prefs.routeMode,
        stableUpdates: 3,
        lastRerouteAt: Date.now(),
        now: Date.now(),
        verifiedClosure: true,
      });
      setEvent(`Synthetic verified closure overrides soft lock. ${d.reason}.`);
    }
  }
  function swapEndpoints() {
    if (!destination || active) return;
    requestGeneration.current += 1;
    const oldOrigin = origin;
    setOrigin(destination);
    setDestination(oldOrigin);
    setStops((prev) => [...prev].reverse());
    setRoutes([]);
    setSelectedId("");
    setState("idle");
    setError("");
    setBusy(false);
  }
  function invalidateRoutes() {
    requestGeneration.current += 1;
    setRoutes([]);
    setSelectedId("");
    setState("idle");
    setError("");
    setBusy(false);
  }
  function removeStopAt(index: number) {
    if (active) return;
    setStops((prev) => removeStop(prev, index));
    invalidateRoutes();
  }
  function moveStopAt(index: number, direction: -1 | 1) {
    if (active) return;
    setStops((prev) => moveStop(prev, index, direction));
    invalidateRoutes();
  }
  function toggleAvoid(a: Avoidance) {
    if (active) return;
    setAvoid((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );
    invalidateRoutes();
  }
  function zoom(command: string) {
    setMapCommand("");
    setTimeout(() => setMapCommand(command), 0);
  }
  async function clearData() {
    await AsyncStorage.removeItem(STORE);
    setSaved([]);
    setTrips([]);
    setReports([]);
    setHome(null);
    setWork(null);
    setPrefs(defaultPrefs);
    setOrigin(DEMO_PLACES[0]);
    setGpsAccuracy(null);
    setLocationFixAt(null);
    setGps(undefined);
    reset();
    // Clearing app data does not revoke the OS permission, so re-read it.
    readLocationPermission();
    setToast("Local guest data deleted. No cloud account exists.");
  }
  // Built only while the export panel is open, not on every render (PERF-002).
  const exporting = panel === "export";
  const exportData = useMemo(
    () =>
      exporting
        ? JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              storage: "local guest only",
              prefs,
              saved,
              trips,
              reports,
              home,
              work,
            },
            null,
            2,
          )
        : "",
    [exporting, prefs, saved, trips, reports, home, work],
  );
  // Car displays + lock-screen card (lib/car). Publishes the navigation state these
  // surfaces render and handles their Stop / Mute buttons. Owned by the car thread.
  const carCommands = useRef({ end, active, toggleMute: () => setMuted((m) => !m) });
  carCommands.current = { end, active, toggleMute: () => setMuted((m) => !m) };
  useEffect(
    () =>
      onCarCommand((command) => {
        const c = carCommands.current;
        if (command === "stop" && c.active) c.end();
        if (command === "toggleMute") c.toggleMute();
      }),
    [],
  );
  useEffect(() => {
    publishCarGuidance(
      buildCarGuidance({
        state,
        route: route ?? null,
        step: step ?? null,
        progress,
        paused,
        muted,
        metric: prefs.metric,
        source: guidanceSource === "live" ? "live" : "simulation",
        destinationName: destination?.name ?? null,
        position: position ?? null,
        now: Date.now(),
      }),
    );
  }, [state, route, step, progress, paused, muted, prefs.metric, destination, position, guidanceSource]);
  // On unmount (a render crash caught by the ErrorBoundary, or teardown) the trip
  // stops with this screen, so the car and lock-screen surfaces must stop too (BUG-014).
  const carPrefs = useRef({ muted, metric: prefs.metric });
  carPrefs.current = { muted, metric: prefs.metric };
  useEffect(
    () => () => publishCarGuidance(idleCarGuidance(carPrefs.current)),
    [],
  );
  return {
    prefs,
    setPrefs,
    saved,
    trips,
    reports,
    setReports,
    home,
    work,
    hydrated,
    tab,
    setTab,
    panel,
    setPanel,
    query,
    setQuery,
    searchFor,
    setSearchFor,
    results,
    searchResults,
    setSearchResults,
    origin,
    setOrigin,
    destination,
    setDestination,
    stops,
    removeStopAt,
    moveStopAt,
    avoid,
    toggleAvoid,
    scheduleKind,
    setScheduleKind,
    scheduleTime,
    setScheduleTime,
    mode,
    setMode,
    preference,
    setPreference,
    ranked,
    route,
    selectedId,
    setSelectedId,
    swapEndpoints,
    busy,
    error,
    setError,
    toast,
    setToast,
    state,
    progress,
    setProgress,
    paused,
    setPaused,
    muted,
    setMuted,
    guidanceSource,
    liveGuidance: {
      status: live.status,
      event: live.event,
      speedMps: live.speedMps,
      accuracyM: live.accuracyM,
    },
    event,
    online,
    setOnline,
    gps,
    gpsAccuracy,
    permission,
    locationFixAt,
    providerHealth,
    providerRefreshing,
    refreshProviders,
    center,
    setCenter,
    mapCommand,
    capabilities,
    serverState,
    active,
    moving,
    position,
    step,
    openSearch,
    browse,
    browsing,
    setBrowsing,
    highlights,
    choosePlace,
    pin,
    liveSearch,
    calculate,
    start,
    end,
    reset,
    locate,
    savePlace,
    inject,
    zoom,
    clearData,
    exportData,
  };
}
