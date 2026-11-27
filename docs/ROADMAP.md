# Delivered slice status — 26 November 2026

The functioning development slice and actual evidence are in [HANDOVER.md](HANDOVER.md). Interactive map, labelled catalogue/pins, real OSRM test profiles, comparison and simulated arrival are delivered. Local bookmarks/privacy and test reports are wired. The manifest now contains evidence-backed `SLICE-*` entries. Original mixed broad requirements below remain open where any advanced clause is missing; they are not claimed complete by one working control. Physical native road guidance, full offline graph, commercial providers and release approval remain blocked. Estimates below are overlapping person-day planning ranges, not an additive budget or commitment.

**27 November 2026 update:** ordered multi-stop planning, free-flow leave/arrive estimates in UK time and an honest disabled-avoidance state were added as `SLICE-STOPS`, `SLICE-SCHEDULE` and `SLICE-AVOID`. Parents F3.2-02 and F3.2-03 remain `planned`. See [itinerary-validation-2026-11-27.md](itinerary-validation-2026-11-27.md).

**27 November 2026 security update:** adversarial admin, cross-account and session-token tests were added as `SLICE-SEC-ADMIN`, with four server fixes they exposed. Parents SEC-ADMIN and ACC-10 keep their states; logout token revocation and owner-scoped storage remain open. See [security-admin-validation-2026-11-27.md](security-admin-validation-2026-11-27.md).

# NEXORA Maps — complete phased roadmap

Snapshot: 26 November 2026. The source plan is a test-only London planning and simulated-navigation slice. The supplied TODO list is unchecked. **No original feature is certified implemented/tested here.** This documentation task ran no application build, provider smoke test, automated suite or device validation. The only `implemented but unverified` acknowledgement is the explicit foreground-location statement in plan.md, not native road guidance.

[FEATURE_MANIFEST.json](FEATURE_MANIFEST.json) is the machine-readable source of this index. It stores each original paragraph verbatim, line references, priorities, dependencies, state, acceptance and person-day range, including focused advanced subentries. The original master text is also retained intact within its source metadata. This document reproduces the requirement paragraphs in their original sections. All original clauses apply even when a criterion below highlights a test focus.

## Status and estimates

The allowed states are `implemented/tested`, `implemented but unverified`, `demo only`, `requires provider/approval` and `planned`. `demo only` requires actual isolated demo evidence; it is not assigned merely because a demo is intended. `requires provider/approval` means the listed gate is not met, not a connected external service. The main agent must update only the exact feature/subfeature proved by reproducible evidence, with commit, commands/outputs and provider/device details. Do not upgrade a full paragraph after proving one control while its advanced clauses remain unavailable.

A paragraph spanning phases has the earliest applicable priority; this does not bring every advanced clause into P0. Focused later-phase entries identify useful splits without rewriting or losing the full paragraph. Estimates are implementation/testing planning ranges in person-days, **not promises or quotes**, exclude waiting/procurement and overlap. Never add these paragraph/screen/acceptance ranges into a project total; refine after discovery and provider selection.

## Delivery sequence and gates

**P0:** finish native map shell → honest search/pin/manual origin → actual configured test route → engine-based distinct alternatives/comparison → lock/stability decisions → clearly labelled simulator → arrival/end/stop tracking. Then local saves/home-work, opt-in trips, privacy/export/delete, isolated stationary test reports/local review and provider/unsupported states. Foreground location is device-unverified; no enabled road-use guidance. Denied permissions and missing providers must still permit manual/demo planning without fabrication.

**P1:** only after provider/device/privacy gates: validated native navigation/matching/voice/background, permitted offline local graph/search/reroute, licensed authority traffic/closures, protected real community/admin operations, calibrated confidence, departure scheduling, sharing, richer places, parking/costs and profiles. London pilot needs consent and staffed moderation, not fake crowd data.

**P2:** contracted commercial traffic/expanded transit/EV/truck/global modules; grounded AI after deterministic core; lane/junction/landmark, 3D/terrain/imagery/AR, car displays/HUD and future camera feasibility. Every module needs coverage/licence/legal/safety/approval checks; unknown or unsupported capability remains disabled.

Release gates: G1 actual functional evidence; G2 provider/licence/referrer/cache compliance; G3 DPIA/security/privacy/legal; G4 physical devices/accessibility; G5 native road guidance; G6 real offline graph; G7 staffed protected community; G8 car entitlements; G9 explicit pilot/release approval. Details and current blocked/not-run status are in [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md). No release/purchase/publication is authorised. There is no public admin service; local moderation is demo-only. UK/unknown enforcement-camera and police reports stay disabled.

## Chosen boundary, providers and costs

Expo 57 / RN 0.86 native product UI surrounds a Leaflet iframe (web) / WebView (native) 2D planning map. That renderer is not a native navigation SDK; rotation/pitch/3D/native guidance need a later validated adapter. Hosted OSRM car/foot/bike endpoints are non-commercial test-only, with an application-wide **<1 request/second** budget and no SLA. Verify each actual graph profile; alternatives are not guaranteed. Geocoder is a configurable licensed/self-hosted service, with empty URL/key default and no public Nominatim fallback/autocomplete. OSM tiles are normal viewport/browser-cache/referrer only, never offline/bulk downloaded. Preserve OSM/ODbL attribution and Leaflet BSD notices; exact dependency/licence audit is pending. [1] [2] [3] [4]

[SETUP.md](SETUP.md) compares OSRM tests, self-hosted Valhalla and licensed native SDK by prerequisites and supplies 1k/10k/100k monthly-active-user formulas with every unit price **TBD**, not invented prices. It documents server-versus-device offline boundaries and pending licences. [PRIVACY_SECURITY.md](PRIVACY_SECURITY.md) supplies draft privacy/legal notices, local export/delete contract, moderation procedure and DPIA/traffic-enforcement policy.

## Risks, proposed ownership and go/no-go

Provider/licence owner: commercial data/coverage/quotas, mitigate with per-feature audits and dated terms/quotes; no production provider until approval. Native navigation lead: matching/background/offline safety/entitlements, mitigate with SDK spike and physical matrix; no road guidance/car display before evidence. Privacy/security lead: home-work inference, tracking/sharing/log leakage, mitigate minimisation/DPIA/ownership tests; no risky rollout with unresolved controls. Moderation operations lead: sparse/abusive/stale reports, mitigate truthful no-live state/licensed sources/TTL/appeals/staffing; local review cannot satisfy beta moderation. Product/release owner: liability, trademark, pilot consent/demand and costs, mitigate legal review/consented pilot/quotas/rollback; no comparative claims, billing or release without sign-off. These are proposed roles, not assigned individuals or staffed services.

## Verbatim requirement register

### Instructions

#### VISION-NAME — Working name clearance

> Working name only: verify trademark/domain availability before public launch.

**P0 · requires provider/approval · 1–4 person-days, planning only.**

Dependency: Trademark/domain search; legal approval.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Record trademark/domain clearance before public launch; no implied clearance now.

Source: `docs/MASTER_PROMPT.txt:3`. No passed evidence attached.

#### CONTRACT-01 — Original functional vertical slice and complete backlog

> Act as a senior mobile product designer, geospatial engineer, navigation SDK specialist, full-stack engineer, security engineer, accessibility expert and QA lead. Build NEXORA Maps, an original, premium, mobile-first navigation and journey intelligence application. Combine the useful capabilities of Google Maps and Waze with the strongest ideas from offline and privacy-oriented navigation apps. Do not copy their branding, proprietary maps, assets, UI or code. Do not build only a landing page, clickable mockup or static dashboard. Deliver a functioning, testable vertical slice first, then extend it in phases. Preserve a complete backlog of all requirements below.

**P0 · planned · 20–60 person-days, planning only.**

Dependency: Expo starter; permitted providers; QA.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Show an original mobile end-to-end flow, not a landing page; retain every requirement and all blocked features.

Source: `docs/MASTER_PROMPT.txt:6`. No passed evidence attached.

#### CONTRACT-02 — Approvals, secrets and honest demo boundary

> Make reasonable documented assumptions rather than stopping for nonessential questions. Do not buy subscriptions, create paid infrastructure, publish apps or accept commercial terms without approval. Never embed secret keys or pretend an external service is connected. When credentials, native modules, licensed data or approvals are unavailable, implement a provider interface, a clearly labelled demo mode and setup instructions. Keep demo information separate from real-world navigation. Do not silently substitute fabricated road conditions, businesses, speed limits, safety information, prices or GPS positions. Do not claim production readiness until the validation gates are passed.

**P0 · planned · 3–8 person-days, planning only.**

Dependency: Provider interfaces; approval record; capability flags.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. No purchases/publication/terms acceptance without approval; no bundled secrets or fabricated real-world data; demo/live isolated.

Source: `docs/MASTER_PROMPT.txt:8`. No passed evidence attached.

### 1. PRODUCT VISION AND POSITIONING

#### VISION-01 — UK guest-first journey intelligence

> Build the intelligent navigation app that helps people choose the journey they want, not merely the fastest route. Core promise: clear route choices, fewer unnecessary reroutes, dependable offline navigation, transparent uncertainty, and user control of location data. Initial market assumption: United Kingdom, starting with Greater London; architecture supports global expansion and locale-specific laws, units and languages. Support iOS and Android first; provide a responsive web planning interface only if it does not delay the mobile core. Use UK English, GBP, miles/mph by default, with metric and language options. The app must work as a guest without registration for core navigation.

**P0 · planned · 5–15 person-days, planning only.**

Dependency: Guest persistence; locale/units; mobile compatibility.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Guest works without registration; UK English/GBP/miles default and future locale options; no unsupported offline claim.

Source: `docs/MASTER_PROMPT.txt:11`. No passed evidence attached.

#### VISION-02 — Competitor hypotheses and consented pilot

> Competitor lessons: Google Maps is strong in places, multimodal travel, offline driving and increasingly conversational/immersive navigation. Waze is strong in community incidents, driver preferences and traffic-aware routing. HERE WeGo, OsmAnd and Organic Maps demonstrate offline and privacy strengths; Sygic demonstrates advanced driver-focused interfaces. User discussions report frustration with aggressive rerouting, difficult roads, stale limits and repeated instructions; these are qualitative hypotheses, not representative survey results. Differentiate on explainable routing, route stability, offline recovery and trusted data rather than claiming AI or 3D maps are novel. Validate these hypotheses with a small consented UK driver pilot before making comparative performance claims.

**P1 · requires provider/approval · 8–25 person-days, planning only.**

Dependency: Consented UK pilot; representative baseline.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Record consent, sample and controlled comparison; treat anecdotal preferences as hypotheses, not superiority claims.

Source: `docs/MASTER_PROMPT.txt:13`. No passed evidence attached.

### 2. DELIVERY CONTRACT AND PHASES

#### PHASE-P0 — Working planning and simulated-navigation MVP

> P0 — Build the working MVP: real interactive map from a permitted provider; location permission and current-position indicator; place/address/postcode search and map pin selection; driving/walking/cycling route calculation where supported; alternative routes when returned; route preview and comparison; navigation state machine with simulated route playback and live GPS integration where verified; deterministic turn instructions; route lock and reroute decision logic; saved places; manual incident submission and confirmation in a demo/test community; guest mode and privacy settings; light/dark design; permission, loading, empty, error and offline states; admin moderation and provider status; automated tests and setup guide. Implement real search and routing through permitted providers whenever configured. Prefer finishing this end-to-end flow over 100 incomplete screens. If native live guidance cannot be validated in the build environment, clearly label navigation as simulation only and do not market it as safe for road use.

**P0 · planned · 25–70 person-days, planning only.**

Dependency: F3.1-01; permitted routing/geocoder; test evidence.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Complete the original P0 flow with honest capability states; native road-use stays simulation-only until validated.

Source: `docs/MASTER_PROMPT.txt:16`. No passed evidence attached.

#### PHASE-P1 — Provider/device-validated London beta

> P1 — Beta after provider and device validation: production navigation SDK or validated equivalent, map matching, voice, background/lock-screen guidance, offline region download and local routing, official traffic/closure ingestion, real incident moderation, time-to-leave, sharing, richer place data, parking and estimated trip costs, expanded transport modes. Pilot in London with quality gates.

**P1 · requires provider/approval · 70–180 person-days, planning only.**

Dependency: Approved SDK/providers; device gates; offline graph; operations.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Every beta capability has licences, devices, staff and evidence; no premature background/offline/live claims.

Source: `docs/MASTER_PROMPT.txt:17`. No passed evidence attached.

#### PHASE-P2 — Advanced expansion

> P2 — Advanced expansion: commercial live traffic, public transit with reliable local feeds, EV routing, commercial vehicle routing, AI copilot, lane/junction/landmark guidance, 3D terrain/buildings, camera imagery, car displays, global coverage and advanced discovery. Prioritise each by data availability, licensing, safety and observed demand. No unverified feature should appear enabled in real navigation.

**P2 · requires provider/approval · 100–300 person-days, planning only.**

Dependency: Production data contracts; safety/legal review; demand.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Enable advanced capabilities only after their individual prerequisite and regional validation gates pass.

Source: `docs/MASTER_PROMPT.txt:18`. No passed evidence attached.

#### CONTRACT-03 — Feature status and capability flags

> For each feature below maintain a status manifest: implemented/tested; implemented but unverified; demo only; requires provider/approval; planned. Expose an appropriate capability flag in the UI. A disabled feature must explain its prerequisite and never look like a working control.

**P0 · planned · 2–6 person-days, planning only.**

Dependency: Manifest schema; evidence references; UI state mapping.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Use the exact five status values; every disabled control explains prerequisite and cannot masquerade as working.

Source: `docs/MASTER_PROMPT.txt:19`. No passed evidence attached.

### 3.1 Search and maps

#### F3.1-01 — Map controls, styles and licensed advanced mapping

> - Map-first screen with pan/zoom/rotate/pitch, GPS recenter, compass, scale, destination marker, route overlays, clustering and smooth camera transitions. 2D/3D styles, day/night, high contrast, traffic, transit, cycling, terrain and satellite layers where licensed and available. Avoid invented buildings or imagery. Indoor mapping, immersive previews, street-level imagery and AR walking navigation are optional advanced provider-backed modules; never imply access to Google Street View or Google imagery without a separate compatible licence.

**P0 · planned · 20–75 person-days, planning only.**

Dependency: Leaflet boundary; permitted raster source; native vector/licensed modules later.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Verify controls/attribution and unsupported states; licensed native/imagery modules must separately prove coverage and rights.

Source: `docs/MASTER_PROMPT.txt:23`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **MAP-3D · P2 · requires provider/approval · 10–35 person-days, planning only.** Focus: “2D/3D styles, day/night, high contrast, traffic, transit, cycling, terrain and satellite layers where licensed and available.” Dependency: Native vector renderer; per-layer licences/coverage. Acceptance: Every enabled layer is genuinely licensed and available with attribution; unsupported styles disabled. All related constraints in the preserved parent paragraph also apply.

- **MAP-IMMERSIVE · P2 · requires provider/approval · 20–65 person-days, planning only.** Focus: “Indoor mapping, immersive previews, street-level imagery and AR walking navigation are optional advanced provider-backed modules; never imply access to Google Street View or Google imagery without a separate compatible licence.” Dependency: Licensed imagery/indoor/AR modules; native safety review. Acceptance: Prove data rights and coverage for each optional module; no proprietary imagery implication. All related constraints in the preserved parent paragraph also apply.

#### F3.1-02 — Search, coordinates and map utilities

> - Search addresses, postcodes, place names, coordinates and categories; autocomplete with debouncing, results ranked by relevance and proximity, recent searches and offline search where supported. Support dropped pins, coordinate copying, distance measurement, destination entrance where verified, accessibility metadata and map error reporting.

**P0 · requires provider/approval · 12–35 person-days, planning only.**

Dependency: Configured licensed/self-hosted geocoder; local index for offline; metadata sources.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Configured address/postcode/coordinate search has debounce/provenance; no public Nominatim default/autocomplete; utilities and offline scope tested.

Source: `docs/MASTER_PROMPT.txt:24`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **SEARCH-OFFLINE · P1 · requires provider/approval · 8–20 person-days, planning only.** Focus: “offline search where supported.” Dependency: Local permitted geocoder/index and offline graph. Acceptance: Fresh search succeeds without network in verified coverage, otherwise clearly unavailable. All related constraints in the preserved parent paragraph also apply.

#### F3.1-03 — Discovery, rich places and saved lists

> - Discover restaurants, petrol stations, EV chargers, parking, shops, hotels, attractions, hospitals, toilets and rest areas. Place cards include source, freshness, hours, phone, website, photos, reviews, ratings, menus, accessibility, popular times and booking links only when licensed and available. Separate unavailable from closed. Do not invent reviews, reservations, wait times or prices. Allow lists, bookmarks, home/work, tags, sharing and optional sync. Respect external providers' data retention and attribution rules.

**P0 · requires provider/approval · 15–45 person-days, planning only.**

Dependency: Licensed POI/business media/booking data; retention rules; optional account sync.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Show source/freshness and unknown fields; no invented businesses/reviews/prices; saved lists/privacy/provider retention verified.

Source: `docs/MASTER_PROMPT.txt:25`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **PLACES-RICH · P1 · requires provider/approval · 12–35 person-days, planning only.** Focus: “Place cards include source, freshness, hours, phone, website, photos, reviews, ratings, menus, accessibility, popular times and booking links only when licensed and available.” Dependency: Business metadata/media licences; retention/attribution. Acceptance: Each displayed field carries actual provenance/freshness; missing values not invented. All related constraints in the preserved parent paragraph also apply.

- **SAVED-SYNC · P1 · requires provider/approval · 8–22 person-days, planning only.** Focus: “Allow lists, bookmarks, home/work, tags, sharing and optional sync.” Dependency: Authenticated owned sync/sharing; consent/privacy review. Acceptance: Local saves independent of account; cloud sync/share opt-in and revocable with ownership tests. All related constraints in the preserved parent paragraph also apply.

### 3.2 Route planning and travel modes

#### F3.2-01 — Actual transport profiles and accessible journeys

> - Support car, motorcycle, taxi, walking and cycling with actual supported profiles. Public transport (bus, train, underground, tram, ferry), mixed-mode planning, wheelchair-accessible routes, ride-hail links and airport/flight-related journey planning require appropriate providers and are phased. Do not confuse flight planning with turn-by-turn navigation. Show verified step-free status and unknowns, not guarantees of accessibility.

**P0 · requires provider/approval · 20–65 person-days, planning only.**

Dependency: Separate verified car/foot/bike graphs; licensed mode/accessibility feeds.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Each enabled mode uses an actual supported profile; phased modes remain disabled; step-free unknowns never become guarantees.

Source: `docs/MASTER_PROMPT.txt:28`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **MODE-MOTO-TAXI · P1 · requires provider/approval · 10–25 person-days, planning only.** Focus: “Support car, motorcycle, taxi, walking and cycling with actual supported profiles.” Dependency: Validated motorcycle/taxi profiles and legal access attributes. Acceptance: Motorcycle/taxi not car aliases; verify each enabled profile and legal coverage. All related constraints in the preserved parent paragraph also apply.

- **MODE-TRANSIT · P2 · requires provider/approval · 25–70 person-days, planning only.** Focus: “Public transport (bus, train, underground, tram, ferry), mixed-mode planning, wheelchair-accessible routes, ride-hail links and airport/flight-related journey planning require appropriate providers and are phased.” Dependency: Licensed transit/GTFS-RT/accessibility/ride-hail/airport feeds. Acceptance: Each transport/handoff real and coverage-labelled; flight itinerary not turn navigation, step-free unknowns preserved. All related constraints in the preserved parent paragraph also apply.

#### F3.2-02 — Origins, stops, itinerary and scheduling preview

> - Origin/current location or manual origin, destination, drag/reorder/add/remove multiple waypoints, optional round trip and itinerary optimisation with fixed stops/time windows. Route preview with distance, ETA/range, arrival time, toll/zone charges, road complexity and data coverage. Show distinct route alternatives, not duplicated routes. Let users choose depart now, depart later or arrive by; use traffic prediction only when real data supports it. Show time zones correctly.

**P0 · planned · 15–45 person-days, planning only.**

Dependency: Provider routes/steps; waypoint/optimisation support; time-zone and prediction data.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Manual origin/preview/real distinct alternatives work; multi-stop/time-window/scheduled estimates need validated support, with unknowns disclosed.

Source: `docs/MASTER_PROMPT.txt:29`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **STOPS-OPTIMISE · P1 · requires provider/approval · 10–30 person-days, planning only.** Focus: “drag/reorder/add/remove multiple waypoints, optional round trip and itinerary optimisation with fixed stops/time windows.” Dependency: Provider waypoint/optimisation solver and validated time windows. Acceptance: Ordered/round-trip/optimised stops meet declared constraints; no unsupported scheduling control. All related constraints in the preserved parent paragraph also apply.

- **DEPART-ARRIVE · P1 · requires provider/approval · 8–25 person-days, planning only.** Focus: “Let users choose depart now, depart later or arrive by; use traffic prediction only when real data supports it.” Dependency: Actual traffic prediction or schedule provider; time-zone tests. Acceptance: Future/arrival timing backed by data; uncertainty/time zones correct. All related constraints in the preserved parent paragraph also apply.

#### F3.2-03 — Route preferences and legal hard constraints

> - Preferences: fastest, shortest, economical, relaxed, avoid motorways, tolls, ferries, unpaved roads, difficult turns, narrow roads and residential shortcuts where map attributes permit; legal vehicle access, height/weight/width restrictions, HOV/pass eligibility and other jurisdiction-specific rules. Hard constraints for legal restrictions and confirmed closures; soft preferences with disclosed trade-offs. Never route through a known illegal turn or restricted road to save time. If no compliant route exists, say so. Do not promise that missing map data implies safe access.

**P0 · planned · 15–50 person-days, planning only.**

Dependency: Verified map restriction attributes; jurisdiction data; deterministic feasibility.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Exclude known illegal/closed routes; disclose unsupported preferences/missing coverage; no compliant route yields honest failure.

Source: `docs/MASTER_PROMPT.txt:30`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **PREF-ATTRIBUTES · P1 · requires provider/approval · 15–45 person-days, planning only.** Focus: “Preferences: fastest, shortest, economical, relaxed, avoid motorways, tolls, ferries, unpaved roads, difficult turns, narrow roads and residential shortcuts where map attributes permit; legal vehicle access, height/weight/width restrictions, HOV/pass eligibility and other jurisdiction-specific rules.” Dependency: Validated road attributes/restriction provider; jurisdiction policy. Acceptance: Only supported preferences offered; hard restrictions never traded off for speed and missing coverage disclosed. All related constraints in the preserved parent paragraph also apply.

#### F3.2-04 — Vehicle profiles and authoritative UK charging zones

> - Vehicle profiles: cars (petrol/diesel/hybrid/EV), motorcycles, taxis, vans and trucks. Store optional dimensions, energy consumption, charge state, charging connector, fuel type, pass/permit and emissions zone eligibility; minimise sensitive fields. Commercial routing must use validated restriction coverage; otherwise do not offer a truck-safe label. UK ULEZ/CAZ/congestion charging: obtain current zones, schedules, rules and rates from authoritative sources; show estimate date, uncertainty and official verification link. No automatic payments without explicit consent.

**P1 · requires provider/approval · 15–40 person-days, planning only.**

Dependency: Validated truck restrictions; authoritative ULEZ/CAZ/charge rules; approvals.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Minimise profile fields; no truck-safe label without coverage; dated charges and official link/uncertainty, no automatic payment.

Source: `docs/MASTER_PROMPT.txt:31`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **VEHICLE-TRUCK · P2 · requires provider/approval · 20–50 person-days, planning only.** Focus: “Commercial routing must use validated restriction coverage; otherwise do not offer a truck-safe label.” Dependency: Commercial vehicle restriction coverage; legal review. Acceptance: Dimensions/restrictions honoured on validated corpus; otherwise no truck-safe capability. All related constraints in the preserved parent paragraph also apply.

- **UK-CHARGES · P1 · requires provider/approval · 8–22 person-days, planning only.** Focus: “UK ULEZ/CAZ/congestion charging: obtain current zones, schedules, rules and rates from authoritative sources; show estimate date, uncertainty and official verification link.” Dependency: Authoritative current zones/rates/rules; update owner. Acceptance: Rules/rates dated and linked; unknown charge not zero; no automatic payment. All related constraints in the preserved parent paragraph also apply.

### 3.3 Intelligent route choice and stable rerouting (primary differentiator)

#### F3.3-01 — Deterministic explainable route scoring

> - Implement deterministic scoring over feasible provider routes: normalised travel duration, expected variability if available, total estimated cost, road complexity and preferences. Weights configurable and versioned. Example default weights 0.50 duration, 0.20 reliability, 0.15 cost, 0.15 simplicity; renormalise over known dimensions and mark missing dimensions. No fabricated inputs. Show an explanation such as '3 min longer, fewer complex turns' only when supported by route data. Show Pareto-style choices: fastest, relaxed, economical, reliable where meaningful. Eco route estimates are models, not guaranteed savings.

**P0 · planned · 6–15 person-days, planning only.**

Dependency: Engine routes/steps; versioned weights; known dimension schema.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. 0.50/0.20/0.15/0.15 weights renormalise over known inputs; missing data marked; explanations/Pareto labels derive from data.

Source: `docs/MASTER_PROMPT.txt:34`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **ROUTE-RELIABILITY-ECO · P1 · requires provider/approval · 8–25 person-days, planning only.** Focus: “Show Pareto-style choices: fastest, relaxed, economical, reliable where meaningful. Eco route estimates are models, not guaranteed savings.” Dependency: Actual variability/cost/consumption inputs; calibrated models. Acceptance: Only meaningful labels; model-based eco not a guaranteed saving, missing dimensions marked. All related constraints in the preserved parent paragraph also apply.

#### F3.3-02 — Route lock, hysteresis and essential reroutes

> - Route Lock: keep selected route while feasible; allow user override at any time. Reroute settings: automatic, ask first (only when safely stopped or via supported hands-free workflow), or locked. Default soft threshold: max(3 minutes, 10% remaining travel time); require a stable improvement over repeated updates, use a configurable cooldown (e.g. 90 s) and hysteresis to prevent oscillations. Confirmed closure, legal infeasibility or genuine off-route event overrides lock and cooldown; explain reason. When no safe compliant route is available, guide user to stop safely, not to make an abrupt manoeuvre. Never suppress essential reroutes. Offer clear comparison and reason; show what data changed.

**P0 · planned · 8–20 person-days, planning only.**

Dependency: Deterministic state machine; verified closure/legal/off-route signals.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Stable repeated gain exceeds max(180s,10% remaining), cooldown/lock apply; essential verified events override; safe no-route advice.

Source: `docs/MASTER_PROMPT.txt:35`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **REROUTE-HANDSFREE · P1 · requires provider/approval · 5–15 person-days, planning only.** Focus: “ask first (only when safely stopped or via supported hands-free workflow)” Dependency: Validated safely parked or native hands-free interaction. Acceptance: Consequential reroute prompts never require moving manual interaction. All related constraints in the preserved parent paragraph also apply.

#### F3.3-03 — GPS matching, confidence and false-reroute testing

> - Map-match GPS with heading, accuracy, timestamps and confidence; handle tunnels, parallel roads, roundabouts, low-speed drift and GPS jumps. Use several consistent samples before declaring off-route. Never use LLM-generated road geometry or manoeuvres. Route instructions must derive from validated graph/SDK. Display uncertainty when location accuracy is poor. Test false reroutes and missed turns.

**P1 · requires provider/approval · 15–45 person-days, planning only.**

Dependency: Validated native/engine matching; heading/accuracy/time; physical tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Tunnels/parallel roads/drift/jumps need consistent samples and uncertainty; geometry/instructions never generated by an LLM.

Source: `docs/MASTER_PROMPT.txt:36`. No passed evidence attached.

#### F3.3-04 — Calibrated route confidence and ETA intervals

> - Route Confidence: use source recency, route coverage and calibrated historical prediction errors if available; report 'insufficient data' rather than a numeric confidence invented from nothing. ETA intervals are model estimates, not guarantees. Record metrics with consent and evaluate calibration during beta.

**P1 · requires provider/approval · 10–30 person-days, planning only.**

Dependency: Source coverage/recency; consented historical prediction dataset.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Without calibrated data show insufficient data, not invented numeric confidence; evaluate intervals/calibration during beta.

Source: `docs/MASTER_PROMPT.txt:37`. No passed evidence attached.

### 3.4 Driving experience and safety

#### F3.4-01 — Native guidance, lane cues and advisory speed

> - Turn-by-turn text and spoken guidance, next manoeuvre distance, next-next manoeuvre if helpful, lane arrows/junction and landmark cues when supported, current speed from trustworthy GPS/vehicle data, posted limit with source/freshness, optional speeding notification, ETA/distance/time remaining, route progress, current road, compass and reroute indicator. Never infer a legal speed limit from a road class and display it as authoritative; unknown means unknown. Speed display is advisory; road signs and vehicle instruments take priority.

**P1 · requires provider/approval · 25–70 person-days, planning only.**

Dependency: Validated navigation SDK/graph; voice; lane/limit source rights; devices.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Engine-derived guidance tested on native devices; unknown posted limits remain unknown; signs/instruments take priority.

Source: `docs/MASTER_PROMPT.txt:40`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **GUIDANCE-LANES · P2 · requires provider/approval · 15–40 person-days, planning only.** Focus: “lane arrows/junction and landmark cues when supported” Dependency: Licensed lane/junction/landmark metadata; native guidance validation. Acceptance: Only verified cues displayed at correct time, never invented from LLM/map appearance. All related constraints in the preserved parent paragraph also apply.

- **SPEED-LIMIT · P1 · requires provider/approval · 10–25 person-days, planning only.** Focus: “posted limit with source/freshness, optional speeding notification” Dependency: Trustworthy GPS/vehicle speed; authoritative sourced limit data. Acceptance: Unknown means unknown; no road-class inference; advisory display tested. All related constraints in the preserved parent paragraph also apply.

#### F3.4-02 — Driving focus and accessible safe interaction

> - Focus mode with large high-contrast symbols, calm map, adaptive zoom, landscape support, minimal alerts, one-action mute and stop navigation. Relaxed and new-driver presets give earlier prompts and prefer simpler routes. Do not show social feeds, ads, keyboard entry, detailed reviews or complex forms while driving. Use conservative moving-state detection with accessible stationary flows and safe passenger controls that cannot casually defeat safety gating. Do not encourage handheld use. Voice prompts should be concise, nonrepetitive, localised and support Bluetooth/audio focus. Never obscure next turn with an alert. Provide audio-only and screen-reader compatible operation.

**P0 · planned · 12–35 person-days, planning only.**

Dependency: Moving-state UX; accessibility tests; native audio for future voice.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Large symbols and mute/end; no moving keyboard/forms/feed; no casual safety bypass; later audio/Bluetooth/accessibility verified.

Source: `docs/MASTER_PROMPT.txt:41`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **GUIDANCE-AUDIO · P1 · requires provider/approval · 10–25 person-days, planning only.** Focus: “Voice prompts should be concise, nonrepetitive, localised and support Bluetooth/audio focus.” Dependency: Native TTS/audio focus; real Bluetooth tests; safe localisation. Acceptance: Prompts/interruptions/accessibility/audio-only work on named physical devices. All related constraints in the preserved parent paragraph also apply.

#### F3.4-03 — Reliable hazard alerts and enforcement policy

> - Safety alerts: congestion, collision, roadworks, closure, lane closure, object/debris, stopped vehicle, pothole, poor visibility, flooding, ice, weather, sharp bend, speed bump, rail crossing, hazardous junction and known high-risk road segment only with reliable data and appropriate regional semantics. Speed/red-light/average-speed camera and police-related reporting only where legally allowed; enforce jurisdiction-specific feature policies, never advise evasion or unsafe actions. No dangerous routes to avoid enforcement. Treat weather and safety alerts as advisory; never label a road safe. Emergency/roadside assistance: show official contact and user-initiated call or handoff; no implied dispatch or automatic emergency response.

**P1 · requires provider/approval · 20–55 person-days, planning only.**

Dependency: Trusted/licensed feeds; legal jurisdiction policy; official assistance links.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Reliable sources/time/expiry only; UK camera/police disabled; no enforcement evasion or safe-road/dispatch promise.

Source: `docs/MASTER_PROMPT.txt:42`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **HAZARDS-LIVE · P1 · requires provider/approval · 15–45 person-days, planning only.** Focus: “Safety alerts: congestion, collision, roadworks, closure, lane closure, object/debris, stopped vehicle, pothole, poor visibility, flooding, ice, weather, sharp bend, speed bump, rail crossing, hazardous junction and known high-risk road segment only with reliable data and appropriate regional semantics.” Dependency: Licensed/authority hazard/weather feeds; freshness/TTL policy. Acceptance: No stale/unverified data labelled live/safe; category/source semantics reviewed. All related constraints in the preserved parent paragraph also apply.

- **ENFORCEMENT-POLICY · P2 · requires provider/approval · 5–20 person-days, planning only.** Focus: “Speed/red-light/average-speed camera and police-related reporting only where legally allowed; enforce jurisdiction-specific feature policies, never advise evasion or unsafe actions.” Dependency: Current jurisdiction legal/safety approval; explicit product approval. Acceptance: UK/unknown default disabled across UI/API/feeds; no evasion routing or workaround. All related constraints in the preserved parent paragraph also apply.

#### F3.4-04 — Background, car displays, media and future camera

> - App in background and lock screen, notifications, CarPlay/Android Auto and optional supported HUD are native/platform-dependent and require testing and relevant entitlements/approval. No simulated car integration represented as functioning. No direct vehicle control. Music controls through permitted OS/provider media APIs, not unauthorised integrations. Custom voice selection and optional locally recorded prompts with consent; custom vehicle icons and reduced-motion options. Camera AR, recording or dashcam features are future feasibility items, not MVP; require explicit permissions and safety/privacy review.

**P2 · requires provider/approval · 35–100 person-days, planning only.**

Dependency: Native builds; platform entitlement/approval; privacy/safety review.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. No fake native integration; approved OS/media/voice/HUD features tested; camera/dashcam future permissions/DPIA, no vehicle control.

Source: `docs/MASTER_PROMPT.txt:43`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **GUIDANCE-BACKGROUND · P1 · requires provider/approval · 15–40 person-days, planning only.** Focus: “App in background and lock screen, notifications, CarPlay/Android Auto and optional supported HUD are native/platform-dependent and require testing and relevant entitlements/approval.” Dependency: Native background permissions/build; DPIA; device lifecycle tests. Acceptance: Background/lock-screen features enabled only after permitted platform/device evidence; car displays separately gated. All related constraints in the preserved parent paragraph also apply.

- **CAR-DISPLAYS · P2 · requires provider/approval · 25–65 person-days, planning only.** Focus: “No simulated car integration represented as functioning. No direct vehicle control.” Dependency: CarPlay entitlement; Android Auto approval; permitted HUD/native integration. Acceptance: Approved physical car-display tests, no fake integration or vehicle control. All related constraints in the preserved parent paragraph also apply.

- **CUSTOM-MEDIA · P2 · requires provider/approval · 10–30 person-days, planning only.** Focus: “Music controls through permitted OS/provider media APIs, not unauthorised integrations. Custom voice selection and optional locally recorded prompts with consent; custom vehicle icons and reduced-motion options.” Dependency: Permitted media/voice assets; local recording consent; native audio tests. Acceptance: Licensed controls/voices and opt-in local recordings; reduced motion respected. All related constraints in the preserved parent paragraph also apply.

- **CAMERA-DASHCAM · P2 · requires provider/approval · 15–50 person-days, planning only.** Focus: “Camera AR, recording or dashcam features are future feasibility items, not MVP; require explicit permissions and safety/privacy review.” Dependency: Feasibility/native permissions; DPIA/legal/safety review. Acceptance: No MVP camera feature; explicit reviewed permissions and safe retention before enablement. All related constraints in the preserved parent paragraph also apply.

### 3.5 Community traffic and trusted reports

#### F3.5-01 — Stationary incident report and confirmation

> - Incident submission categories from above, map-matched road segment/direction, observed time, source type, location precision, expiry, moderation state and confirmation counts. Permit report/confirm/not-there from safe stationary UX or validated hands-free workflow. Do not reward in-motion tapping. No public user location trails, handles linked to home/work, vehicle plates or images containing personal data by default.

**P0 · planned · 5–12 person-days, planning only.**

Dependency: Local demo store; approved categories; trustworthy segment/precision.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Report fields/provenance/expiry present; manual entry safely stationary only; no public personal trails/images/plates.

Source: `docs/MASTER_PROMPT.txt:46`. No passed evidence attached.

#### F3.5-02 — Dedupe, confidence, TTL, appeal and abuse control

> - Merge spatial/time duplicates only when segment/direction/category compatible. Confidence combines independently corroborated reports, verified authority feeds, freshness decay and abuse signals; avoid treating popularity as truth. Use a configurable TTL policy by category; for example transient debris/traffic short expiry, closures longer if confirmed by authority and bounded by official schedule. Expire, retract and invalidate reports. Mark stale/unverified data clearly. Do not initiate hard reroutes from an unverified single report; apply an appropriate conservative penalty only if supported. Protect legitimate new users from reputation bias; have rate limits, appeal and moderation.

**P0 · planned · 8–20 person-days, planning only.**

Dependency: Local policy tests; independently verified sources for real reports.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Compatible segment/direction/category merge, TTL/retraction/rate limits/appeal; no hard closure from one unverified report.

Source: `docs/MASTER_PROMPT.txt:47`. No passed evidence attached.

#### F3.5-03 — Reputation, correction workflow and honest cold start

> - Optional contribution reputation, badges, anonymous community profile/moods and map correction workflow with audit trail. Gamification never incentivises speeding, extra driving, reporting volume while driving or unsafe interaction. Corrections reviewed by moderators; upstream OSM edits only with suitable permissions, contributor guidelines and consent. Community cold start: seed only licensed authority feeds and verified sources; never fake a crowd or traffic. Users see 'no live reports available' when coverage is insufficient.

**P1 · requires provider/approval · 12–35 person-days, planning only.**

Dependency: Licensed authority feeds; moderator operations; OSM contributor consent.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. No unsafe gamification/fake crowd; no live reports when sparse; upstream edits permission/audit required.

Source: `docs/MASTER_PROMPT.txt:48`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **COMMUNITY-REPUTATION · P1 · requires provider/approval · 10–25 person-days, planning only.** Focus: “Optional contribution reputation, badges, anonymous community profile/moods and map correction workflow with audit trail.” Dependency: Real moderation/audit; anti-abuse/equity policy. Acceptance: No unsafe incentive/volume rewards; correction and appeals audited. All related constraints in the preserved parent paragraph also apply.

- **COMMUNITY-OSM · P1 · requires provider/approval · 5–15 person-days, planning only.** Focus: “Corrections reviewed by moderators; upstream OSM edits only with suitable permissions, contributor guidelines and consent.” Dependency: Contributor authorisation/guidelines; informed consent; moderator review. Acceptance: No automatic upstream edits; attributable permission and audit evidence. All related constraints in the preserved parent paragraph also apply.

#### F3.5-04 — Protected admin and beta moderation operations

> - Admin incident map, review queue, deduplication, ban/appeal, abuse audit, source freshness, ingest health and jurisdiction policy configuration. Role-based access and redacted data. Moderation SLA and operations plan for beta.

**P1 · requires provider/approval · 15–40 person-days, planning only.**

Dependency: Managed auth/RBAC; redacted audit; staff/appeals/SLA.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Anonymous admin denied; role/audit/freshness/ingest policies tested; local demo never represented as protected admin.

Source: `docs/MASTER_PROMPT.txt:49`. No passed evidence attached.

### 3.6 Offline and network resilience

#### F3.6-01 — Permitted full offline packages and local rerouting

> - Download region/corridor with size estimate, free-space check, progress, cancel, resume, checksum, version, expiration, last update and delete. Offline map tiles alone are not offline routing: include local geocoding index, routable graph, supported profiles, turn instructions and local rerouting through a verified offline SDK or engine. Voice packages offline where available. Download from self-hosted/licensed offline-permitted sources, never bulk-download public OSM standard tiles. Store packages in app sandbox and verify integrity. Use atomic updates and rollback.

**P1 · requires provider/approval · 40–100 person-days, planning only.**

Dependency: Offline-permitted tiles/index/graph; native engine; integrity/storage validation.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Fresh airplane-mode search/start/reroute plus package integrity/resume/atomic update/rollback/delete; no public tile bulk download.

Source: `docs/MASTER_PROMPT.txt:52`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **OFFLINE-VOICE · P1 · requires provider/approval · 5–15 person-days, planning only.** Focus: “Voice packages offline where available.” Dependency: Offline voice redistribution licence; native TTS/package integration. Acceptance: Guidance works locally in permitted package, unavailable language clearly disclosed. All related constraints in the preserved parent paragraph also apply.

#### F3.6-02 — Network state, cache disclosure and safe reconnect

> - Network mode indicator: online, degraded, offline. Last known route may remain visible with clear cached status. Never present old traffic or closures as live; timestamp and age them. If full offline graph is unavailable, disclose limitations before journey starts. Queue safe community updates with timestamp and consent, revalidate expiry and do not publish stale hazards on reconnect. Test airplane mode, interrupted downloads, storage pressure, route boundary and recovery. GPS can work without internet, but coverage and accuracy vary.

**P0 · planned · 6–18 person-days, planning only.**

Dependency: State machine; timestamps; offline graph later; consented queue policy.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Online/degraded/offline honest; cached route not offline routing; stale traffic/queued hazards not republished as live.

Source: `docs/MASTER_PROMPT.txt:53`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **COMMUNITY-QUEUE · P1 · requires provider/approval · 5–15 person-days, planning only.** Focus: “Queue safe community updates with timestamp and consent, revalidate expiry and do not publish stale hazards on reconnect.” Dependency: Real approved community backend; retention/consent/expiry validation. Acceptance: Reconnect preserves age and never revives stale/unconsented reports. All related constraints in the preserved parent paragraph also apply.

### 3.7 Journey intelligence, EV, parking and scheduling

#### F3.7-01 — Itemised journey cost and energy estimates

> - Cost estimates: fuel = distance / configured efficiency * unit price (consistent units); EV energy estimate using configured consumption and known terrain/conditions if available; electricity price by charger/tariff; sum tolls, congestion/clean-air charges and selected parking. Itemise known, estimated and unknown components. No totals suggesting all charges are known when a component is missing. Provide price currency, source and timestamp; avoid false precision.

**P1 · requires provider/approval · 10–30 person-days, planning only.**

Dependency: Consistent consumption/price units; licensed dated charge/parking tariffs.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Fuel arithmetic and EV model units tested; known/estimated/unknown itemised; no misleading complete total/false precision.

Source: `docs/MASTER_PROMPT.txt:56`. No passed evidence attached.

#### F3.7-02 — Compatible EV stops and telemetry consent

> - EV planner: charge state, battery capacity, consumption model, connector, minimum arrival reserve, charger power, operational status, availability and fees from licensed APIs. Recommend compatible charging stops and fallback options only with data. No guaranteed charger availability or range. Add battery/temperature uncertainty, detour/time and charging duration estimates. Vehicle telemetry only via authorised integration and consent.

**P2 · requires provider/approval · 25–65 person-days, planning only.**

Dependency: Licensed charger status/fees; consumption model; authorised telemetry.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Stops compatible with reserve/connector and sourced status; uncertainty/fallback/detour shown; no range/availability guarantee.

Source: `docs/MASTER_PROMPT.txt:57`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **EV-TELEMETRY · P2 · requires provider/approval · 10–30 person-days, planning only.** Focus: “Vehicle telemetry only via authorised integration and consent.” Dependency: Vehicle provider approval; separate consent; DPIA. Acceptance: Authorised minimal telemetry with revoke/stop and no direct vehicle control. All related constraints in the preserved parent paragraph also apply.

#### F3.7-03 — Parking, fuel, rest planning and reminders

> - Parking: nearby lots, access, hours, height restrictions, tariffs, available spaces if sourced, walking distance to destination, saved parked location (local by default). Fuel stations and live prices where available. Trip planner: rest stops, meals, charging, accessibility and flexible schedules. Departure reminders local by default; optional calendar import with least privilege; respect time zones and permission denial. Weather alerts from legitimate provider, show timestamp and coverage. No guarantee of safe travel.

**P1 · requires provider/approval · 20–55 person-days, planning only.**

Dependency: Licensed parking/fuel/weather data; local notifications/calendar permission.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Source/date/height/access/availability verified or unknown; parked location local; reminders time-zone/permission safe.

Source: `docs/MASTER_PROMPT.txt:58`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **CALENDAR-REMINDERS · P1 · requires provider/approval · 5–15 person-days, planning only.** Focus: “Departure reminders local by default; optional calendar import with least privilege; respect time zones and permission denial.” Dependency: Native local notifications/calendar capability; device tests. Acceptance: Local reminders and optional least-privilege calendar handle denial/time-zone/DST. All related constraints in the preserved parent paragraph also apply.

#### F3.7-04 — Revocable sharing and local history/analytics

> - Share destination or live trip progress with explicitly selected recipients via revocable high-entropy expiring link; show only necessary data, optional approximate location and end sharing at arrival or expiry. No permanent tracking by default, no hidden sharing, no public discoverability. Friends/family are opt-in only. Share history and revoke controls. Prevent link leakage via logs/referrer. Optional local journey history/replay, distance/time/cost analytics, export/delete; no default upload of exact traces.

**P0 · requires provider/approval · 15–40 person-days, planning only.**

Dependency: Authenticated backend; high-entropy tokens; DPIA/consent; local export/delete.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Explicit recipients/minimal data; arrival/revoke/expiry stop; no link leaks/default trails; opt-in history/export/delete verified.

Source: `docs/MASTER_PROMPT.txt:59`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **LIVE-SHARING · P1 · requires provider/approval · 12–30 person-days, planning only.** Focus: “Share destination or live trip progress with explicitly selected recipients via revocable high-entropy expiring link; show only necessary data, optional approximate location and end sharing at arrival or expiry.” Dependency: Secure backend/token ownership; DPIA/explicit recipients. Acceptance: Explicit minimal sharing; revoke/arrival/expiry terminate, tokens not leaked via logs/referrer. All related constraints in the preserved parent paragraph also apply.

- **HISTORY-ANALYTICS · P1 · requires provider/approval · 8–20 person-days, planning only.** Focus: “Optional local journey history/replay, distance/time/cost analytics, export/delete; no default upload of exact traces.” Dependency: Opt-in local history; privacy/export/delete tests; sourced costs. Acceptance: History/replay local opt-in, export/delete after restart; unknown costs preserved, no default trace upload. All related constraints in the preserved parent paragraph also apply.

### 3.8 AI copilot (after core validation)

#### F3.8-01 — Grounded bounded AI copilot after core validation

> - Voice/text assistant for natural-language destination search, itinerary planning, route comparison explanations, contextual stops, settings and safe incident drafting. Ground responses in tool results from search/routing/traffic/weather/places, with source/time and unknowns. Structured tool schemas, validation, allowlisted intents and bounded arguments. LLM cannot create route geometry, change a hard restriction, invent speed limits or claim emergency assistance. Confirm consequential changes when safely possible; deterministic navigation remains independent of LLM and works without AI. Never pass raw location history to an AI service without meaningful separate consent; minimise precise coordinates and redact identifiers. Guard against prompt injection from place reviews, map content and provider text. No open-ended chat UI while driving; concise audio only for supported intents. Examples: 'Find an accessible coffee stop within a five-minute detour'; 'Why did the route change?'; 'Report roadworks ahead' (draft, validate, then safe submission). No unsupported bookings or actions. Provide fallback if service is unavailable.

**P2 · requires provider/approval · 30–80 person-days, planning only.**

Dependency: Validated core; LLM/tools; separate consent; injection/safety tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Allowlisted validated tools/source-time; no invented geometry/restrictions/emergency/bookings; driving intents concise supported audio only.

Source: `docs/MASTER_PROMPT.txt:62`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **AI-SAFETY · P2 · requires provider/approval · 10–30 person-days, planning only.** Focus: “LLM cannot create route geometry, change a hard restriction, invent speed limits or claim emergency assistance.” Dependency: Grounded tools/schema allowlist; injection tests; deterministic independent core. Acceptance: Adversarial tests preserve hard constraints and navigation without AI; no unsupported actions. All related constraints in the preserved parent paragraph also apply.

### 4. DESIGN SYSTEM — ORIGINAL PREMIUM MOBILE UX

#### DESIGN-01 — Original accessible premium mobile design

> Design a refined, calm, map-first visual identity, not a clone. Suggested palette: deep midnight #0B1220, surface #152235, light background #F5F7FA, primary teal #18BFA9, route blue #397BFF, warning amber #F5B544, danger #D94050; adjust colours to meet contrast. Use system fonts or appropriately licensed typography. Restrained translucent panels where legible, crisp vector iconography, subtle shadows, 8-point spacing, 16–24 px radii, clear hierarchy, safe-area-aware layouts. No gratuitous neon, tiny text, gratuitous glass effects or decorative charts in driving view. Ensure light/dark map styles, colour-independent route/incident symbols, reduced motion, dynamic type, screen reader labels, keyboard access on web, appropriate 44pt iOS/48dp Android touch targets. Aim WCAG 2.2 AA for web and applicable mobile accessibility guidance; validate contrast and large text with tests. Keep information glanceable; map stays dominant. Smooth animation only when it improves comprehension. Design for small phones and landscape.

**P0 · planned · 10–30 person-days, planning only.**

Dependency: Licensed fonts/icons; contrast/assistive tech/device testing.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Original identity, map dominance, light/dark, dynamic type/reduced motion/contrast/touch targets and safe areas validated.

Source: `docs/MASTER_PROMPT.txt:65`. No passed evidence attached.

#### SCREEN-A — Onboarding

> A. Onboarding: three short benefits, guest option, contextual location request, privacy choices and initial driving preferences. No permission wall.

**P0 · planned · 2–5 person-days, planning only.**

Dependency: Guest settings; contextual location/privacy.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Three benefits, guest option and privacy/preferences without permission wall.

Source: `docs/MASTER_PROMPT.txt:68`. No passed evidence attached.

#### SCREEN-B — Home/Explore

> B. Home/Explore: map, prominent search, recenter, layer button, quick destination shortcuts, category chips and draggable results sheet; compact connection/status badge. Bottom navigation Home, Trips, Saved, Settings; hide during drive.

**P0 · planned · 3–7 person-days, planning only.**

Dependency: Map boundary; search; state badge; sheets.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Map/search/recenter/layers/chips/sheet and four tabs; tabs hide during drive; connection status honest.

Source: `docs/MASTER_PROMPT.txt:69`. No passed evidence attached.

#### SCREEN-C — Search/results

> C. Search/results: recent and suggested locations, filters and distance, results on map, retry/no-results and source labels.

**P0 · planned · 2–6 person-days, planning only.**

Dependency: Configured geocoder or labelled demo; local recents.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Relevant results/source/retry/empty/filter distance; demo not represented as current provider results.

Source: `docs/MASTER_PROMPT.txt:70`. No passed evidence attached.

#### SCREEN-D — Place details

> D. Place details: hero/photo only if licensed, structured facts, actions Directions, Save, Share, Call/Website if present; uncertainty on hours/accessibility.

**P0 · planned · 2–7 person-days, planning only.**

Dependency: Licensed metadata/photos; saved state; verified actions.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Directions/save work; sharing/call/web only when real; hours/accessibility uncertain; no unlicensed photo.

Source: `docs/MASTER_PROMPT.txt:71`. No passed evidence attached.

#### SCREEN-E — Route planner

> E. Route planner: swap origin/destination, stops, travel mode, depart/arrive selector, alternative cards and compare sheet showing estimates and trade-offs, route lock, Start. Show unsupported profiles explicitly.

**P0 · planned · 4–10 person-days, planning only.**

Dependency: Route adapter; actual profiles; compare/lock state.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Manual origin/swap/mode/cards/lock/start; stops/schedule disabled if unsupported; estimates disclose unknowns.

Source: `docs/MASTER_PROMPT.txt:72`. No passed evidence attached.

#### SCREEN-F — Active navigation simulation

> F. Active navigation: large next manoeuvre banner; map with current route, position and optional lane view; speed/limit with unknown state; ETA/time/distance panel; mute, recenter, safe report and end. No bottom tabs, dense analytics or promotional banners. Upcoming turns/alerts as minimal secondary cards. Reroute suggestion with time/cost change and reason; safety gates.

**P0 · planned · 5–15 person-days, planning only.**

Dependency: Simulator/state machine; later native guidance and speed/lanes sources.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Persistent simulation badge; next turn/progress/mute/end/recenter, no tabs; unknown speed/limit and safety gates.

Source: `docs/MASTER_PROMPT.txt:73`. No passed evidence attached.

#### SCREEN-G — Safe report flow

> G. Report flow: category, prefilled road segment/time if trustworthy, confirmation, expiry status; stationary only for manual reporting. Admin review separate.

**P0 · planned · 2–5 person-days, planning only.**

Dependency: Stationary guard; demo incident policy.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Category/time/road precision only trustworthy; confirm/expiry and separate local review; no moving form.

Source: `docs/MASTER_PROMPT.txt:74`. No passed evidence attached.

#### SCREEN-H — Trips

> H. Trips: planned journeys, schedule, multi-stop editor, estimates, history (opt-in), trip replay, export/delete.

**P0 · planned · 4–12 person-days, planning only.**

Dependency: Local persistence/history opt-in; schedule/optimisation later.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Local planned/history/export/delete with opt-in; advanced editor/schedule/replay only if supported.

Source: `docs/MASTER_PROMPT.txt:75`. No passed evidence attached.

#### SCREEN-I — Offline manager

> I. Offline manager: region picker, downloads, size, coverage, update/delete and connection status.

**P1 · requires provider/approval · 5–15 person-days, planning only.**

Dependency: F3.6-01; permitted packages/local graph.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Region/size/coverage/progress/update/delete accurate; blocked until true offline stack, not a public tile downloader.

Source: `docs/MASTER_PROMPT.txt:76`. No passed evidence attached.

#### SCREEN-J — Saved

> J. Saved: lists, favourite places, home/work, sync state.

**P0 · planned · 2–6 person-days, planning only.**

Dependency: Local saved lists/home-work; account sync later.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Owned places/home-work persist and delete; sync disabled/labelled when not connected.

Source: `docs/MASTER_PROMPT.txt:77`. No passed evidence attached.

#### SCREEN-K — Settings, privacy and provider capabilities

> K. Vehicle/route preferences, alert and audio settings, appearance/accessibility, units/language, data and privacy centre, sharing management, help/feedback, legal/attribution, provider capabilities.

**P0 · planned · 5–15 person-days, planning only.**

Dependency: Local settings; privacy/export/delete; provider/legal registry.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Honest units/appearance/privacy/attribution/capability controls; unavailable vehicle/audio/sharing options explain prerequisite.

Source: `docs/MASTER_PROMPT.txt:78`. No passed evidence attached.

#### SCREEN-L — Non-public admin web console

> L. Admin web console: moderation, provider status, data freshness, audit and role management. Not publicly accessible.

**P1 · requires provider/approval · 8–25 person-days, planning only.**

Dependency: Protected auth/RBAC; operations/audit; no public demo service.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Authorised moderation/provider/audit/roles only; anonymous denied; local review labelled demo and not publicly deployed.

Source: `docs/MASTER_PROMPT.txt:79`. No passed evidence attached.

#### SCREEN-M — Backed advanced screens

> M. Advanced screens only when backed: EV/parking/cost, transit step details, AI assistant, 3D preview and car integration setup.

**P2 · requires provider/approval · 20–60 person-days, planning only.**

Dependency: EV/parking/cost/transit/AI/3D/car-display individual gates.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Each advanced screen requires actual licensed/validated backing before enabling; no fake integrations.

Source: `docs/MASTER_PROMPT.txt:80`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **ADVANCED-SCREENS · P2 · requires provider/approval · 15–45 person-days, planning only.** Focus: “M. Advanced screens only when backed: EV/parking/cost, transit step details, AI assistant, 3D preview and car integration setup.” Dependency: Individual provider/native/legal gates; licensed coverage. Acceptance: No disabled advanced screen looks operational; prerequisites/source unknowns clear. All related constraints in the preserved parent paragraph also apply.

#### DESIGN-02 — Reusable components and separated demo environment

> Build reusable components: search bar, bottom sheet, route card, route compare table, incident marker, alert banner, status badge, turn instruction, speed tile, cost breakdown, privacy permission card, error/empty/skeleton components. Show realistic but clearly labelled demo data in a distinct demo environment, not as live information.

**P0 · planned · 5–15 person-days, planning only.**

Dependency: Typed components; original design tokens; data provenance.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Shared control/state components accessible; realistic demo labelled and isolated, not live.

Source: `docs/MASTER_PROMPT.txt:81`. No passed evidence attached.

### 5. TECHNICAL ARCHITECTURE AND MANUS IMPLEMENTATION

#### TECH-01 — Expo native boundary and integration path

> Manus mobile publishing currently uses an Expo workflow. Begin with React Native + TypeScript + Expo compatible packages, Expo Router, a small state store, typed data fetching/cache and a testable domain layer. Inspect the actual Manus environment and compatible SDK versions before installation. Expo Go cannot run arbitrary native modules; if native MapLibre, offline routing, background location or car integration needs custom native code, use an Expo development build/prebuild or a supported native project, document setup and verify on real devices. Do not pretend Expo Go supports unsupported modules. If native build is blocked, deliver an honest mobile planning + simulated navigation preview and a documented native integration path. Keep core route logic platform-independent. For responsive web planner/admin use supported React/TypeScript stack; do not recreate active driving as a browser-only mock.

**P0 · planned · 8–25 person-days, planning only.**

Dependency: Actual starter compatibility; development builds; physical devices.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Expo57/RN0.86 native UI/WebView map honest; unsupported native modules require build path; core logic platform-independent.

Source: `docs/MASTER_PROMPT.txt:84`. No passed evidence attached.

#### TECH-MAP — Compatible licensed rendering and attribution

> - Map rendering: MapLibre Native/GL JS with licensed vector tiles or self-hosted tiles; attribution always visible. Rendering is not routing. If another provider is chosen, use compatible renderer, data, cache and licences. No scraping Google Maps/Waze, no copying traffic feeds or reviews, no mixing provider-restricted content incompatibly.

**P0 · planned · 6–20 person-days, planning only.**

Dependency: Renderer/source/cache compatibility; no proprietary scraping.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Visible attribution and permitted renderer/data/cache; no Google/Waze scraping or incompatible content mixing.

Source: `docs/MASTER_PROMPT.txt:87`. No passed evidence attached.

#### TECH-ROUTE — Routing adapters and offline-capability comparison

> - Routing: provider adapter for commercial navigation SDK or self-hosted Valhalla/appropriate engine. Valhalla supports multimodal routing and map matching; verify actual profile and data features. A server engine does not automatically give device offline routing. Use a licensed offline-capable SDK or verified native offline graph implementation for local navigation. Compare provider capabilities, coverage, cost, quotas, offline rights, lane/EV/truck/traffic support, attribution and portability before choosing. Public demo servers are not production infrastructure.

**P0 · requires provider/approval · 15–45 person-days, planning only.**

Dependency: OSRM tests; Valhalla or approved SDK; coverage/contracts.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Compare capabilities/quotas/rights/attribution; public demos not production; server engine never called device-offline.

Source: `docs/MASTER_PROMPT.txt:88`. No passed evidence attached.

#### TECH-SEARCH — Licensed/self-hosted geocoding and POI provenance

> - Geocoding/POI: licensed geocoder/search service or self-hosted index such as Pelias/Nominatim with appropriate policy and hardware; do not use public Nominatim as an unrestricted autocomplete API. Licensed business metadata provider or authoritative open datasets with provenance. Do not invent business information to fill gaps.

**P0 · requires provider/approval · 10–30 person-days, planning only.**

Dependency: Configured geocoder; hardware if self-hosted; business licences.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. No public Nominatim default/unrestricted autocomplete; actual sourced business data only.

Source: `docs/MASTER_PROMPT.txt:89`. No passed evidence attached.

#### TECH-TRAFFIC — Distinct official/licensed traffic and enrichment feeds

> - Traffic: provider adapters for commercial traffic and official feeds. UK National Highways data covers strategic roads and specific official signals, not all streets or full traffic speeds; inspect active API versions and licence, authenticate, monitor coverage. TfL open data for London transport/road data where available. Add local authority and GTFS/GTFS-RT feeds when licensed. Weather, fuel, EV, parking and pricing are distinct providers. Each adapter returns capability, timestamp, coverage, source, expiry and attribution. No assumption that Waze or Google community data can be consumed freely.

**P1 · requires provider/approval · 25–75 person-days, planning only.**

Dependency: National Highways/TfL/local/GTFS licences/API verification; other providers.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Per-adapter coverage/source/expiry/attribution; strategic-road limits disclosed; no free Google/Waze feed assumption.

Source: `docs/MASTER_PROMPT.txt:90`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **TRANSIT-FEEDS · P2 · requires provider/approval · 15–40 person-days, planning only.** Focus: “Add local authority and GTFS/GTFS-RT feeds when licensed.” Dependency: Feed licence/version/coverage; real-time freshness and ingest monitoring. Acceptance: Feeds legally sourced with coverage/freshness; not all London/UK roads promised. All related constraints in the preserved parent paragraph also apply.

#### TECH-BACKEND — Modular backend, storage/auth and environments

> - Backend: supported TypeScript/Node or equivalent API, PostgreSQL + PostGIS for spatial data if supported, Redis/queue for short-lived caching/rate limits when needed, WebSocket/SSE for authorised live incident/route sharing, scheduled feed ingestion and moderation. Prefer simple modular monolith for P0, avoid premature microservices. Separate dev/staging/prod. If Manus database lacks PostGIS, use a documented adapter and testable simple spatial approach for demo; do not imply production scale. Use managed auth with secure token/session handling; guest local storage; optional account sync. Store local preferences/download metadata in SQLite or secure platform storage as appropriate.

**P0 · planned · 15–50 person-days, planning only.**

Dependency: Starter schema/migrations; auth/DB support; later queue/live transport.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Guest local-first; no implied PostGIS/scale; separate environments; future cloud queue/auth/live systems tested before claims.

Source: `docs/MASTER_PROMPT.txt:91`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **CLOUD-LIVE · P1 · requires provider/approval · 15–40 person-days, planning only.** Focus: “WebSocket/SSE for authorised live incident/route sharing, scheduled feed ingestion and moderation.” Dependency: Protected auth/ownership; reliable host; approved operations. Acceptance: Authenticated updates/feeds with expiry/redaction/rollback and staffed moderation, no public admin. All related constraints in the preserved parent paragraph also apply.

#### TECH-DATA — Owned minimal-retention spatial data model

> - Data model: users/roles, consent_records, preferences, vehicle_profiles, saved_places/lists, planned_trips/stops, route_sessions (minimal retention), route_alternatives, incidents/confirmations, moderation_events, source_registry, provider_health, offline_packages, share_tokens, notification_preferences, privacy_requests and audit_events. Include IDs, timestamps, status, geometry/segment/direction, provenance, uncertainty, expiry and visibility where relevant. Do not persist raw GPS by default. Index spatial and expiry queries. Use migrations, constraints, ownership isolation and retention jobs. Keep user data separate from licensed map database; document ODbL obligations and derivative database implications with legal review.

**P0 · planned · 12–35 person-days, planning only.**

Dependency: Versioned migrations; ownership/expiry tests; ODbL legal review.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Required entities/provenance/uncertainty/expiry mapped; no default raw GPS; legal map/user DB separation and constraints.

Source: `docs/MASTER_PROMPT.txt:92`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **DATA-ODBL · P0 · requires provider/approval · 3–10 person-days, planning only.** Focus: “Keep user data separate from licensed map database; document ODbL obligations and derivative database implications with legal review.” Dependency: ODbL review; data ownership/model separation. Acceptance: Map/user database boundaries and derivative obligations approved; no privacy data shared as map DB. All related constraints in the preserved parent paragraph also apply.

#### TECH-API — Versioned validated API contracts

> - API contracts (adapt paths): GET /capabilities, /search, /places/:id; POST /routes, /routes/compare, /routes/reroute, /map-match; GET /incidents?bbox=; POST /incidents, /incidents/:id/confirm; CRUD /trips, /saved, /vehicles, /preferences; GET /offline/manifest; POST /shares, DELETE /shares/:id; GET /share/:token (limited read); POST /privacy/export and /privacy/delete; admin moderation and provider-health endpoints. Validate coordinate bounds, payloads, permissions, ownership, rate limits and idempotency. Use versioned schemas, OpenAPI, standard errors and redacted logs. Separate demo endpoints/data from live.

**P0 · planned · 15–45 person-days, planning only.**

Dependency: Provider/domain schemas; auth/ownership; rate limits; future endpoints.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Validate bounds/payloads/permissions/idempotency; redact errors/logs; demo/live isolated; unavailable future paths blocked.

Source: `docs/MASTER_PROMPT.txt:93`. No passed evidence attached.

#### TECH-SCHEMA — Provider route result schema and unknowns

> - Provider routing result schema: route id, geometry, distance metres, duration seconds, departure/arrival, manoeuvre list, road restrictions, optional lanes, toll/cost items, traffic segments, confidence metadata, source/attribution, generated_at, expiry, coverage. Unknown fields nullable, not zero. Include structured error states and no-route response.

**P0 · planned · 3–8 person-days, planning only.**

Dependency: Typed provider adapter; engine geometry/steps; structured errors.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Metres/seconds/source/time/coverage validated; unknown optional fields null not zero; no-route errors explicit.

Source: `docs/MASTER_PROMPT.txt:94`. No passed evidence attached.

#### TECH-NAV — Deterministic state machine, recovery and simulator

> - Navigation state machine: idle -> planning -> preview -> navigating -> degraded/offline or rerouting -> navigating -> arrived/ended. Explicit permission and low-GPS-confidence states. Persist minimal session for crash recovery; stop location on trip end. Provide a deterministic simulator that replays a licensed/synthetic GPX fixture with drift, off-route, closure and offline events; label simulation prominently and keep all reports out of live systems.

**P0 · planned · 8–22 person-days, planning only.**

Dependency: Pure domain logic; minimal persistence; fixture licence; foreground lifecycle.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. All states/permission/uncertainty/transitions tested; trip end stops tracking; fixture drift/offline/closure stays isolated.

Source: `docs/MASTER_PROMPT.txt:95`. No passed evidence attached.

#### TECH-OBS — Privacy-safe observability, flags and cost model

> - Observability: latency, errors, provider quota/health, traffic freshness, reroute rate, time to recover, navigation crash/ANR, battery, frame rate and privacy-safe aggregate telemetry. No raw location in analytics, logs or crash dumps. Feature flags and rollback. Estimate infrastructure cost with stated assumptions for 1k/10k/100k active users; map loads, routing, places, traffic, offline storage/egress, LLM and moderation; no invented provider price, use dated quotes or mark TBD. Apply quotas, budgets and alerts. Design for regional scaling only after measured demand.

**P0 · planned · 8–25 person-days, planning only.**

Dependency: Measured telemetry; quotas/budgets; approved provider quotes.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. No raw location in logs/analytics; health/rollback measurable; 1k/10k/100k cost formula uses TBD prices not invented quote.

Source: `docs/MASTER_PROMPT.txt:96`. No passed evidence attached.

### 6. SECURITY, PRIVACY, LEGAL AND ACCESSIBILITY

#### SEC-01 — Privacy, security, legal and accessibility contract

> UK GDPR/data protection by design: document purpose and legal basis for each processing operation; complete DPIA before high-risk tracking rollout and obtain legal review. Guest navigation and local-first preferences; optional cloud history and separate, freely given consent for precise background location where needed; explain why and when access occurs. OS permission is not a substitute for lawful basis. No sale of location trails or behavioural ads. Make consent withdrawal easy; stop collection/sharing immediately when disabled. Default retention proposal: raw GPS stays on device unless needed for an explicitly enabled function; short-lived server routing inputs processed only as needed; incident retention and sharing expiry by purpose; account data until deletion subject to documented legal exceptions. Define and enforce retention schedules including backups. Export/delete account and history, transparent privacy dashboard, data processor register, age/children risk assessment, incident response and breach procedure. Avoid identifying report contributors publicly. Encrypt in transit and at rest, use OS secure storage, least privilege, RBAC, row-level ownership, secret manager, dependency scanning, input validation, abuse/rate limiting, audit, CSRF/XSS protections where applicable, secure links, revoke/expire tokens and redact logs. No unauthenticated admin access. Test cross-account access and anonymous data leakage. Do not expose service credentials to client. Provide map/provider attribution, licence register, terms, privacy notice drafts and jurisdiction policy matrix. Legal notices are drafts, not legal certification. Follow UK road safety rules, app-store location/background permissions, CarPlay entitlement and Android Auto requirements. Confirm current policies at build time. Build for screen readers, large fonts, colour vision differences, reduced motion and safe audio; test with real assistive technology.

**P0 · planned · 25–70 person-days, planning only.**

Dependency: DPIA/legal/privacy owners; security tests; processor/retention register.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Every privacy/security/legal clause reviewed and tested; no anonymous admin/secret leakage; notices drafts, device accessibility evidenced.

Source: `docs/MASTER_PROMPT.txt:99`. No passed evidence attached.

Focused phased slices (full parent retained in every manifest entry):

- **DPIA-BACKGROUND · P1 · requires provider/approval · 8–25 person-days, planning only.** Focus: “complete DPIA before high-risk tracking rollout and obtain legal review.” Dependency: Controller/privacy/legal owners; data-flow/processors/retention evidence. Acceptance: No high-risk tracking/shared histories/camera/AI without approved DPIA and legal gates. All related constraints in the preserved parent paragraph also apply.

- **SEC-ADMIN · P0 · requires provider/approval · 3–10 person-days, planning only.** Focus: “No unauthenticated admin access. Test cross-account access and anonymous data leakage.” Dependency: Protected endpoint/auth design; adversarial tests. Acceptance: Anonymous admin unavailable/denied; no cross-account export/delete/report leakage. All related constraints in the preserved parent paragraph also apply.

### 7. VALIDATION AND ACCEPTANCE TESTS

#### VALIDATION-01 — Actual reproducible test evidence and safe execution

> Run typecheck, lint, unit, integration and end-to-end tests; include test fixtures, actual commands, outputs and known failures. Do not claim tests ran unless they did. Use controlled simulator/closed-course or passenger-operated device tests, never unsafe driver interaction. P0 acceptance:

**P0 · planned · 5–15 person-days, planning only.**

Dependency: Test tooling/fixtures; controlled simulation/devices.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Record actual commands/outputs/failures; never claim unrun tests; no unsafe driver interaction.

Source: `docs/MASTER_PROMPT.txt:102`. No passed evidence attached.

#### ACC-01 — Guest permissions and end-of-trip cleanup

> 01 Guest can open map, deny GPS and still search/manual-origin; allow permission later; trip ends and tracking stops.

**P0 · planned · 1–3 person-days, planning only.**

Dependency: SCREEN-A; TECH-NAV; foreground device tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Run the original case on physical iOS/Android; deny/allow later/manual origin works and end stops tracking.

Source: `docs/MASTER_PROMPT.txt:103`. No passed evidence attached.

#### ACC-02 — Attributed provider search and empty/setup states

> 02 Known London address/postcode returns actual provider results with attribution; invalid query yields useful empty state; no key yields clearly labelled demo or setup state.

**P0 · requires provider/approval · 1–3 person-days, planning only.**

Dependency: Configured licensed/self-hosted geocoder; search fixtures.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Known London query returns actual attributed provider data; invalid/no-key states honest.

Source: `docs/MASTER_PROMPT.txt:104`. No passed evidence attached.

#### ACC-03 — Real routes, profiles, alternatives and simulator start

> 03 Calculate route between test points using real configured provider; geometry and instructions come from engine; alternatives only if available. Change mode/preferences/stops, compare and start simulator.

**P0 · planned · 2–5 person-days, planning only.**

Dependency: Verified configured graph profiles; route UI.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Engine geometry/steps, real distinct alternatives only; mode/preferences/stops honest, compare/start simulator.

Source: `docs/MASTER_PROMPT.txt:105`. No passed evidence attached.

#### ACC-04 — Missing-data, restriction and cost-unit tests

> 04 Route scoring handles missing dimensions, hard restrictions and conflicting preferences; explain actual differences; identical alternatives not displayed. Unit-test units and cost arithmetic.

**P0 · planned · 1–4 person-days, planning only.**

Dependency: Scoring/unit/cost fixtures.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Missing dimensions/conflicting preferences/legal exclusions explained; duplicate alternatives absent; arithmetic tested.

Source: `docs/MASTER_PROMPT.txt:106`. No passed evidence attached.

#### ACC-05 — Reroute stability and uncertainty

> 05 Repeated small ETA fluctuations never trigger unnecessary reroutes; threshold/cooldown/lock apply; verified closure/off-route overrides; no illegal detour; poor GPS does not produce false certainty.

**P0 · planned · 2–5 person-days, planning only.**

Dependency: Threshold/cooldown/lock tests; verified event fixtures.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Oscillations suppressed, essential reroutes preserved, no illegal detour or GPS false certainty.

Source: `docs/MASTER_PROMPT.txt:107`. No passed evidence attached.

#### ACC-06 — Simulated instruction progress and native verification gate

> 06 Simulator shows position, instruction progress, next turn and arrival; inject tunnel/drift and recovery; actual GPS navigation only labelled verified after native tests.

**P0 · planned · 1–4 person-days, planning only.**

Dependency: Simulator fixtures; later native device tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Position/next turn/arrival/drift/recovery explicit simulation; actual native navigation not verified before tests.

Source: `docs/MASTER_PROMPT.txt:108`. No passed evidence attached.

#### ACC-07 — Community lifecycle and demo isolation

> 07 Incident submission, dedupe, confirmation, expiry, moderation and rate limit work; a single unverified report cannot force hard closure; no demo incident reaches live data; no stale reports represented as current.

**P0 · planned · 2–5 person-days, planning only.**

Dependency: Local incident/moderation/rate-limit fixtures.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Dedupe/confirm/expiry/review/rate limit work; single report not hard closure; no live/stale leakage.

Source: `docs/MASTER_PROMPT.txt:109`. No passed evidence attached.

#### ACC-08 — Denied/degraded/error/offline honesty

> 08 Deny location, background permission, network, provider timeout/quota, invalid input, GPS loss and empty data; UI never freezes or silently invents facts. Cached tiles clearly distinguished from offline route calculation.

**P0 · planned · 2–5 person-days, planning only.**

Dependency: Fault injection; provider/schema/permission tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. No freeze/fabrication across denial/timeouts/quota/GPS loss; cache not labelled offline calculation.

Source: `docs/MASTER_PROMPT.txt:110`. No passed evidence attached.

#### ACC-09 — True offline P1 acceptance gate

> 09 Offline (P1 gate): download verified permitted package; airplane-mode start, destination search and new reroute within graph; boundary warning, interrupted download/resume, integrity failure, update and deletion; traffic unavailable labelled. If not supported, mark gate blocked.

**P1 · requires provider/approval · 5–15 person-days, planning only.**

Dependency: Permitted offline package/native graph/index; ACC-09 device protocol.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Fresh airplane-mode search/start/reroute and download integrity/resume/update/delete/boundary tests; otherwise blocked.

Source: `docs/MASTER_PROMPT.txt:111`. No passed evidence attached.

#### ACC-10 — Export/delete, token and account security

> 10 Data export/delete, revoke sharing/expiry and account isolation; guest data local; no raw GPS in logs; expired share URL inaccessible; verify secret scanning and admin protection.

**P0 · planned · 3–8 person-days, planning only.**

Dependency: Local privacy tests; future auth/shares; scans/admin tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Owned local export/delete and no raw GPS/secrets; future sharing/ownership tests blocked until implementation.

Source: `docs/MASTER_PROMPT.txt:112`. No passed evidence attached.

#### ACC-11 — Accessibility and moving-state safety

> 11 Accessibility: screen-reader meaningful order, large font, contrast, reduced motion, touch targets, landscape/safe areas and driving focus mode. Safety gating prevents keyboard/forms while moving; voice controls tested only when implemented.

**P0 · planned · 3–8 person-days, planning only.**

Dependency: Real assistive tech; contrast/font/target/focus tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Meaningful screen-reader order, large fonts/landscape/reduced motion; moving forms blocked, voice tested only if built.

Source: `docs/MASTER_PROMPT.txt:113`. No passed evidence attached.

#### ACC-12 — Physical native matrix and car-display gates

> 12 Real iOS/Android device matrix: permissions, foreground/background transitions, Bluetooth audio, thermal/battery, offline, interrupted sessions, rotation and restart. CarPlay/Android Auto require separate entitlements and platform validation. App-store release is not part of MVP unless approved.

**P0 · requires provider/approval · 5–15 person-days, planning only.**

Dependency: Physical iOS/Android devices; approved build; audio/lifecycle tests.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Record device permissions/lifecycle/audio/battery/offline/restart; car approvals separate, store release not authorised.

Source: `docs/MASTER_PROMPT.txt:114`. No passed evidence attached.

#### VALIDATION-02 — Measured goals, baseline and no superiority claims

> Proposed benchmark targets (goals, not claims): median route response <=2 s and p95 <=5 s on defined good-network London test dataset where provider permits; smooth map interactions on midrange phones; crash-free session target >=99.5% during measured beta; incident ingest latency measured by source, no stale data labelled live; reroute frequency and false reroutes lower than baseline on replay corpus without increasing illegal or infeasible routes. Measure ETA absolute error/percentile coverage, missed turns, route recovery, battery/data usage, task completion, accessibility and user-reported workload. Establish baseline with same origin/destination, times, conditions and legal constraints. Do not promise better than Google or Waze without representative field testing. Record environment, sample size and results.

**P1 · requires provider/approval · 10–30 person-days, planning only.**

Dependency: Permitted measurement corpus; consented pilot; benchmark methodology.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Measure goals with environment/sample/baseline; never claim unmeasured latency/crash/ETA/recovery or competitor advantage.

Source: `docs/MASTER_PROMPT.txt:116`. No passed evidence attached.

### 8. BUSINESS MODEL AND ROADMAP

#### BUSINESS-01 — Accessible core, consented pilot and risk ownership

> Keep core navigation, safety alerts and privacy controls accessible. Optional premium features could include advanced trip analytics, extra offline regions if costs justify, commercial vehicle planning, multi-stop optimisation or premium AI; validate willingness to pay. No intrusive ads while driving, no paid priority that changes route ranking without disclosure, no selling exact location. No billing integration until requested. Prioritise a reliable London pilot, recruit consenting users and local data partners, then expand UK regions and international coverage. Define onboarding conversion, route completion, retention, report accuracy, consent opt-in and cost per active user without invasive tracking. Track risks: commercial data contracts, sparse reports, offline engineering, map freshness, liability, platform entitlements and moderation. Set owner, mitigation and go/no-go gate for each.

**P1 · requires provider/approval · 10–30 person-days, planning only.**

Dependency: Pilot approval/partners; measured demand; risk sign-offs.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. No intrusive driving ads/sold traces/undisclosed ranking; no billing until requested; owners/mitigations/gates for each risk.

Source: `docs/MASTER_PROMPT.txt:119`. No passed evidence attached.

### 9. FINAL DELIVERABLES FROM MANUS

#### DELIVERABLE-01 — Working original mobile preview/development build

> 1. Working mobile app preview/installable development build when supported, with original visual design and end-to-end P0 flow. Optional web planner/admin preview.

**P0 · planned · 3–10 person-days, planning only.**

Dependency: End-to-end core; supported device build; evidence.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Provide actual supported preview/build and scope limits; optional web not substitute for native core.

Source: `docs/MASTER_PROMPT.txt:122`. No passed evidence attached.

#### DELIVERABLE-02 — Exportable source and reproducible configuration

> 2. Exportable complete source code if supported by Manus, with file structure, README, .env.example (no secrets), dependency lockfiles, configuration, database migrations and demo seed script. If export unsupported, report exactly what can be delivered and how to reproduce it.

**P0 · planned · 2–6 person-days, planning only.**

Dependency: Complete source/lockfile/migrations/seed; export capability.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Deliver source/structure/config/no-secret example and reproducibility; precisely disclose unsupported export.

Source: `docs/MASTER_PROMPT.txt:123`. No passed evidence attached.

#### DELIVERABLE-03 — Provider/setup/cost/licence and environment matrix

> 3. Provider comparison and chosen architecture, setup instructions, cost assumptions, map attribution and data licence register. Environment capability/status matrix and clear live vs simulated distinction.

**P0 · planned · 3–8 person-days, planning only.**

Dependency: SETUP.md; pending licence/quote audit; evidence.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Compare providers/prerequisites, costs TBD, attribution/register and live/simulation capability matrix honest.

Source: `docs/MASTER_PROMPT.txt:124`. No passed evidence attached.

#### DELIVERABLE-04 — Design/components/accessibility/privacy/moderation docs

> 4. Screens and design tokens, component library, accessibility and driving-safety checklist, privacy/security documentation and moderation procedures.

**P0 · planned · 4–12 person-days, planning only.**

Dependency: Original design; security/privacy drafts; review.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Supply actual tokens/components/screens and clear draft/test status; moderation local demo not public admin.

Source: `docs/MASTER_PROMPT.txt:125`. No passed evidence attached.

#### DELIVERABLE-05 — Actual automated/device evidence and demo scenario

> 5. Automated tests, manual device test plan, actual test results, screenshots of implemented screens, bug/known-limitations list and release checklist. Provide a reproducible demo scenario: search in London, compare routes, select relaxed, start simulated trip, inject incident, evaluate reroute, finish, review privacy and revoke share if implemented.

**P0 · planned · 4–12 person-days, planning only.**

Dependency: Executed tests/screenshots/defects; physical tests later.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Attach real outputs/results/screenshots/limits; scenario reproducible, sharing step only if implemented.

Source: `docs/MASTER_PROMPT.txt:126`. No passed evidence attached.

#### DELIVERABLE-06 — Complete phased traceability and honest status

> 6. Phased roadmap covering EVERY feature in this prompt and prior Google Maps/Waze inventory. For each mark priority, dependency, state, acceptance criterion and estimated implementation effort; do not hide deferred items. Provide a short summary of what works today, what is demo-only, what requires credentials/approval, and what is not implemented. Never claim real-time traffic or production-ready turn-by-turn navigation without evidence.

**P0 · planned · 2–6 person-days, planning only.**

Dependency: Verbatim manifest/roadmap; proved evidence updates.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Every feature discoverable with priority/dependency/state/criterion/estimate; no unproved production/live claims.

Source: `docs/MASTER_PROMPT.txt:127`. No passed evidence attached.

#### CONTRACT-04 — Build sequence and no-cost/no-publication boundary

> START NOW: create a concise architecture/implementation plan, inspect environment, then build the P0 vertical slice and test it. Do not stop at planning. Make reasonable defaults and keep a running decision log. Fix broken controls and failed tests where possible before handover. Prioritise map -> search -> route -> preview -> simulated/validated guidance -> trip completion. Only then add optional screens. Do not publish or incur costs without permission.

**P0 · planned · 1–4 person-days, planning only.**

Dependency: Map/search/routes/simulator/completion; approval controls.

Acceptance: Verify every clause of the verbatim original requirement, at its gated phase. Build/test in required order with decisions; fix failures before handover; no publication or costs without permission.

Source: `docs/MASTER_PROMPT.txt:129`. No passed evidence attached.

## Supplied architecture acknowledgement, not a passed test

### ARCH-FOREGROUND

> Finish map, search/pin, manual origin, alternative route cards, fastest/fewer-turns scoring, preview, route lock, simulator instruction progress and arrival before extending local saved places, trips, test community report/confirm/expiry/review, privacy and provider status. Manual report entry is blocked during playback. Location permission is contextual and foreground-only; a real location marker is separate from simulated position. Native foreground location integration is implemented but not device-verified; live road guidance remains blocked.

**P0 · implemented but unverified · 2–6 person-days verification/fixes, planning only.**

Dependency: Expo location permission and watcher lifecycle; Physical iOS/Android permission/accuracy/end-of-trip tests.

Acceptance: On physical iOS/Android, prove contextual deny/allow/revoke, accuracy/age and separate simulated marker; trip end stops watchers. Native live road guidance stays blocked.

Only evidence: `plan.md:13`, an unverified implementation statement. No code/test/device evidence reviewed; this must not become a live-guidance claim.

## References

[1]: https://operations.osmfoundation.org/policies/tiles/ "OSMF normal viewport, cache and referrer policy"
[2]: https://operations.osmfoundation.org/policies/nominatim/ "Public Nominatim platform and autocomplete restrictions"
[3]: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server "OSRM non-commercial demo restrictions and no SLA"
[4]: https://project-osrm.org/docs/v5.24.0/api/ "OSRM profiles, engine routes and alternatives not guaranteed"
