# NEXORA Maps — setup and provider decisions

Build snapshot: 26 November 2026. This is a private development planning and simulated-navigation project, not road-use guidance. Actual automated, API and browser evidence is recorded in HANDOVER.md and retained output files. Physical device tests and production provider validation remain blocked.

## Environment and native/WebView boundary

The supplied package.json declares Expo `~57.0.24`, React Native `0.86.3`, React `19.2.3`, TypeScript `~6.0.3`, Expo Router and pnpm `9.12.0`. This is the installed starter version family recorded in plan.md, not a recommendation to downgrade to an older Expo release. Preserve the starter and lockfile; verify compatibility before adding packages.

React Native owns onboarding, screens, search, route sheets, navigation controls, permission flows and local state. The implemented map boundary is Leaflet inside an iframe on web and `react-native-webview` on iOS/Android. The renderer provides a 2D planning preview, not a native navigation SDK. A WebView bridge should carry a bounded, validated map-event schema, never arbitrary JavaScript or service secrets. Allowlist origins and outbound navigation; test external-link handling and bridge payload limits. These protections are requirements, not verified implementation claims.

Pan/zoom, pins, scale, route overlays and recenter belong to the P0 target. Rotation, pitch, true 3D/vector layers and native camera/navigation behaviour remain gated. A dark raster filter is a display treatment, not a separate licensed dark map source. Expo Go does not make arbitrary native navigation, offline graph, background location or car-display modules available. Custom native capabilities require compatible development builds/prebuild or a supported native project and real-device validation. **Native live road guidance, background guidance, offline local routing, CarPlay and Android Auto are blocked.** A real foreground GPS marker must remain distinct from simulator position.

The plan uses a simple Express/TypeScript provider boundary and local guest persistence. The starter package includes a MySQL driver and Drizzle; it does not establish PostGIS availability. Do not describe the managed database as PostgreSQL/PostGIS without a verified adapter and deployment. There is no public admin service; local moderation is a demo, not protected production administration.

## Reproduce the development environment

Use Node 22 (`.nvmrc`) and the pinned pnpm (`corepack enable`). These commands reproduce the checks that CI runs on
every pull request; record real results separately:

```sh
pnpm install --frozen-lockfile
cp .env.example .env   # fill in private values; never commit .env
pnpm check
pnpm lint
pnpm test
pnpm build
```

For local work, run `pnpm dev:server` (API on port 3000) and `pnpm dev:metro` (Expo on port 8081) in separate
terminals, or both with `pnpm dev`. `android` / `ios` start Expo for a compatible emulator or device; they do not
produce or validate a signed release. Installable Android builds go through EAS, see [RELEASE.md](RELEASE.md). The
hosted API runs on Render from `render.yaml`. Avoid `pnpm format` during a documentation-only task because it
rewrites the whole project. No store publication, paid infrastructure, purchases or commercial terms acceptance are
authorised.

**No database.** The Manus-era MySQL / Drizzle starter database and the `db:push` script were removed on 27 Nov 2026; the API keeps no server-side user data. Backend credentials must never be copied into the client or committed. The empty geocoder key field in .env.example is not a credential.

Record command, timestamp, commit, environment, exit status, output and known failures in the final delivery evidence. Tests are not assumed to pass because a script exists. See [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) for manual validation and blocked release gates.

## OSRM hosted test setup

The example supplies three separate profile graphs:

```dotenv
NEXORA_CAR_ROUTER=https://routing.openstreetmap.de/routed-car
NEXORA_FOOT_ROUTER=https://routing.openstreetmap.de/routed-foot
NEXORA_BIKE_ROUTER=https://routing.openstreetmap.de/routed-bike
NEXORA_GEOCODER_PROVIDER=
NEXORA_GEOCODER_URL=
NEXORA_GEOCODER_KEY=
```

OSRM's demo policy limits service to reasonable non-commercial uses, at most one request per second, with no uptime, latency or update guarantee. NEXORA's safer test budget is **strictly below one request per second across the whole application and all profiles**, including retries, comparison and reroute calls. Use a shared queue/cooldown and bounded retry backoff; do not multiply allowances per user/device/endpoint. Do not load-test the public server. The FOSSGIS operator also requires attribution, appropriate client identification/referrer, a map-fix link and no heavy usage or scraping. It states that route requests are saved in its server log; local-first preferences do not mean provider coordinates stay on device. Use synthetic/non-sensitive test endpoints only. [3] [5]

Selecting `/routed-foot` or `/routed-bike` chooses the independently prepared graph; changing only the URL's profile string does not turn a car graph into pedestrian/cycling data. OSRM profiles are fixed during graph preparation. The stored London car/foot/bike smoke samples substantiate enabled test modes; revalidate after changing providers. Verify one permitted London case per mode before enabling a replacement; a failed/unverified profile must remain unavailable with its reason. Hosted behaviour, restriction coverage and routes are not legal/safety guarantees. [4] [5]

**Avoidances.** `NEXORA_CAR_EXCLUDE` lists the exclude classes a self-hosted OSRM car graph was built with (for example `motorway,toll,ferry`). It is empty by default because the hosted test car graph returned HTTP 400 `InvalidValue` for every exclude on 27 November 2026 ([probe](provider-capability-probe-2026-11-27.json)). Only declared classes are offered in the app; anything else is refused with HTTP 422 before the provider is called. **Stops.** Up to three stops are sent as OSRM via-points in order; the test service returned no alternatives for multi-stop requests.

The intended request shape, for deliberately chosen non-sensitive test coordinates, is:

```text
{profile-base}/route/v1/driving/{longitude},{latitude};{longitude},{latitude}?overview=full&geometries=geojson&steps=true&alternatives=true
```

Confirm the adapter uses the selected profile base and the operator's accepted URL path. Do not enable modes based solely on an HTTP 200; validate `code`, finite distance/duration, bounds, geometry, manoeuvres, no-route cases and distinct alternatives. `alternatives=true` requests alternatives but does not guarantee any. Show only distinct returned routes; never fabricate alternatives or road geometry on failure. Engine-derived steps can drive a labelled simulator but are not validated native live guidance. No traffic, authoritative speed limit, comprehensive legal vehicle restriction, cost, lane, EV, truck or offline-device support is implied by these endpoints. [4]

## Geocoder and place-data setup

The default geocoder URL and key are deliberately empty. Search without a configured live adapter should show a clearly labelled London demo catalogue/coordinate-input or setup state, not a disguised real postcode lookup. Supply a licensed service with terms permitting the intended search/autocomplete/caching, or an operator-controlled self-hosted geocoder/index. Configure its URL, authentication, schema adapter, supported locales, rate budget, provenance, retention and attribution. Verify actual London address/postcode results and useful empty/error states before enabling live-search capability.

**LocationIQ adapter (implemented, `server/nexora/geocoder.ts`).** Set `NEXORA_GEOCODER_PROVIDER=locationiq` and `NEXORA_GEOCODER_KEY=<access token>` in the private server environment only (never `EXPO_PUBLIC_*`, never this repo). The URL defaults to the EU region `https://eu1.locationiq.com/v1/search`. Requests are GB-only with a Greater London bias, `limit=8`, sent through the shared server-side provider queue (one request per ~1.1 s, plus 15 searches/minute per client). LocationIQ's "no results" HTTP 404 is shown as an empty result; failures and rate limits return honest errors, never fabricated places. Free plan: 5,000 requests/day, commercial use allowed only with a visible "Search by LocationIQ.com" link, which the search panel shows from `/api/nexora/capabilities`. Restrict the token to the backend's IP in the LocationIQ dashboard where possible. Any other Nominatim-compatible licensed/self-hosted endpoint can be set with `NEXORA_GEOCODER_URL` (key sent as a Bearer token). Keys are refused over plain HTTP.

Public `nominatim.openstreetmap.org` is **not** a fallback/default. Its policy prohibits autocomplete and prohibits generic geocoding/search automatically built or offered by no-code/low-code/vibe-coding platforms absent a deliberate informed decision by a responsible application developer. This project makes no such decision and keeps it off. Self-hosted Nominatim or a third-party instance has its own operator terms; the public-instance restrictions are not a licence for every other endpoint. Do not send private/confidential search text to public services. A geocoder is not a business metadata licence: photos, hours, reviews, bookings, prices and accessibility need separate verified sources. [2]

## Provider comparison by prerequisites, not invented prices

### OSRM hosted test endpoints

Appropriate only for the bounded non-commercial planning/simulator development flow. Requires policy-compliant identifying requests, aggregate rate control, network access, validated profile responses and OSM attribution. Alternatives may be absent. No SLA; public demos are not production infrastructure. No contracted traffic, lane, truck/EV, offline-device or native guidance commitment. Price quote: **TBD/not a production quotation**; there is no scaling plan that relies on public-test capacity. [3] [4] [5]

### Self-hosted Valhalla

Candidate for provider-controlled routing/matching and selected multimodal profiles described in the master brief. Requires a legal regional data extract, graph build/update pipeline, actual profile/restriction coverage checks, infrastructure approval, operations/on-call, backups and measured capacity. Traffic, truck restrictions, transit feeds, EV planning and costing must each be proven for the chosen graph/version/data; the engine's name is not a coverage guarantee. Self-hosting a server does not provide device-offline routing: a verified native local engine/SDK and downloadable graph are separate projects. Licence/version/compatibility review and hosting costs: **TBD**, no deployment performed.

### Licensed native navigation SDK

Candidate for validated native map matching, voice, background/lock-screen guidance and potentially licensed offline, traffic, lane/junction, EV/truck or car-display capabilities. Require a named SDK/version compatible with Expo 57/RN 0.86 or an approved native path, UK coverage and feature evidence, explicit offline/data-retention rights, telemetry/DPA assessment, API-key restrictions, entitlements, attribution and real-device test results. Procurement and acceptance of commercial terms require approval. Quote, billing unit, quotas, SLA and each optional feature: **TBD**, not assumed included. Never compare an unquoted SDK price with community-hosted test capacity as if both were production offers.

All candidates must be compared on coverage/freshness, legal constraints, portability, quotas, cancellation/recovery, latency, offline rights, attribution and safety. Obtain dated quotes and coverage demonstrations before selection. Provider capability flags must disable unverified features and explain the missing prerequisite.

## Cost model for 1k / 10k / 100k active users

This is a parameterised monthly planning formula, not a quote, forecast or commitment. Let `U` be monthly active users. Define measured/assumed per-user usage inputs before calculating: `m` billable map units, `r` routing requests, `g` geocoder/place units, `t` traffic units, `o` stored offline GB, `e` download/egress GB, `a_in` and `a_out` AI tokens, `i` moderation events and `h` moderation staff hours. All quantities and all unit prices remain **TBD** until measurement/contracts; prices are not zero when unknown.

```text
Variable(U) = U * (
  m * P_map + r * P_route + g * P_places + t * P_traffic
  + o * P_storage_GBmonth + e * P_egress_GB
  + (a_in / 1000000) * P_LLM_input_Mtokens
  + (a_out / 1000000) * P_LLM_output_Mtokens
  + i * P_moderation_event + h * P_staff_hour
)
Monthly(U) = F_compute + F_database + F_monitoring + F_backup
             + F_licences + Variable(U)
Cost_per_active_user(U) = Monthly(U) / U
C_1k   = Monthly(1000)    # numeric result TBD
C_10k  = Monthly(10000)   # numeric result TBD
C_100k = Monthly(100000)  # numeric result TBD
```

Provider billing units may be sessions, requests, tile loads or users; adapt `m` etc. to the quoted contract instead of assuming equivalence. Include cache hit ratios, route retries/reroutes, download size/update cadence, burst factor and storage retention. Avoid double-counting staff/event moderation charges if alternatives. Fixed costs can change in steps with scale; minimum commitments, tiers, overage, taxes, currency conversion and safety reserve are separately **TBD**. Record dated prices, currency, exclusions and source when approved. Do not extrapolate public OSM tile or OSRM demo allowances to any of these commercial cohorts. Set budgets/quotas/alerts before enabling paid adapters; no billing integration is authorised.

## Attribution and pending licence register

Every map view/export must retain visible `© OpenStreetMap contributors` with an ODbL/copyright link; map attribution cannot disappear under the journey sheet, in landscape, dark mode or screenshots. Keep required routing/provider source credit and map-fix link too. OSM data is under ODbL; produced-work/derivative database and redistribution obligations need legal review. Keep private user data separate from licensed map databases. [1] [5] [6]

Leaflet upstream is BSD 2-Clause: retain copyright, conditions and disclaimer for source/binary redistribution. This does not license map tiles/data. Preserve notices rather than replacing them with NEXORA branding. The exact bundled Leaflet version, CDN assets, notice inclusion and licence compatibility are **verification pending**. [7]

Dependency licence verification is pending for the actual lockfile and distributed artifacts, including Expo packages, React/React Native, Expo Router/location/secure-store, AsyncStorage, WebView, React Query, tRPC, Express, Drizzle/MySQL driver, Zod, icons/fonts, any remote Leaflet/style assets, OSRM integration and any future Valhalla/native SDK. Do not infer compliance from package names. The release owner must record package/version, source, exact licence text, required notice, data/caching restrictions, vulnerabilities, maintainer and verified date; audit transitive dependencies and generated assets. Commercial geocoder/places/traffic/weather/fuel/EV/parking/transit licences and processor agreements are **not obtained**. No proprietary Google/Waze imagery, traffic, reviews or branding is authorised. Brand/trademark/domain availability remains pending.

## Public raster tiles and offline boundary

OSM standard raster tiles are limited here to normal human-controlled viewport viewing. Respect browser/HTTP cache headers; do not force `no-cache`. Web requests need a valid HTTP Referer and must not use a policy that suppresses it; normal browser caching is expected. Native/WebView identification and actual outgoing headers need verification, especially inline documents/opaque origins. If valid identification/referrer and caching cannot be proved, disable that tile source and configure an approved alternative instead of spoofing a browser or installing an anonymous proxy. Do not use bots to pan maps for evidence. OSM policy allows no bulk download, prefetch or offline packages from public standard tiles; changing it to a button named “save region” does not make it permitted. [1]

Cached route geometry/viewport tiles are not an offline routable graph. Offline region/corridor functionality stays blocked until an offline-permitted map source, local index/graph, supported profiles/instructions, integrity/atomic update/rollback and native airplane-mode rerouting all pass. See the full clauses in [FEATURE_MANIFEST.json](FEATURE_MANIFEST.json) and [ROADMAP.md](ROADMAP.md).

## References

## Live London disruptions (TfL)

The server reads TfL road disruptions (`/Road/all/Disruption`) and serves them at `/api/nexora/traffic`, cached for 2 minutes for all clients. It works without a key at low volume. For anything beyond local testing, register a free app key at https://api-portal.tfl.gov.uk, put it in your private `.env` as `NEXORA_TFL_APP_KEY`, and never in an `EXPO_PUBLIC_*` variable. `NEXORA_TFL_DISABLED=1` turns the feed off. Coverage is London roads reported to TfL only; it is not live speeds and does not change route times. Attribution required by the TfL licence is shown on the map. See [traffic-validation-2026-11-27.md](traffic-validation-2026-11-27.md).

[1]: https://operations.osmfoundation.org/policies/tiles/ "OSMF standard tile usage policy"
[2]: https://operations.osmfoundation.org/policies/nominatim/ "Public Nominatim usage policy"
[3]: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server "OSRM non-commercial demo policy"
[4]: https://project-osrm.org/docs/v5.24.0/api/ "OSRM API and alternatives limitation"
[5]: https://routing.openstreetmap.de/about.html "FOSSGIS routing service conditions and privacy"
[6]: https://www.openstreetmap.org/copyright "OSM attribution and ODbL"
[7]: https://github.com/Leaflet/Leaflet/blob/main/LICENSE "Leaflet BSD 2-Clause licence"
