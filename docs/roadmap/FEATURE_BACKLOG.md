# NEXORA Maps — Feature Backlog

Back to [MASTER_ROADMAP.md](MASTER_ROADMAP.md). Scores are in [PRIORITISED_BACKLOG.csv](PRIORITISED_BACKLOG.csv).

## 1. How features were chosen

The app's purpose is set out in `docs/ROADMAP.md` (VISION-01): a guest-first UK/London journey-planning and stable-guidance app, built on free or open providers by the owner's preference.

`docs/FEATURE_MANIFEST.json` already holds a 141-entry long-term requirement register. That register covers EV, community, transit, CarPlay and similar. This backlog does **not** duplicate it. It picks the features that:
- close a gap found in this audit,
- are cheap on the current stack, and
- do not need paid providers or new infrastructure.

Each one has been checked as not already present in the code.

| Tier | Features |
|---|---|
| Core value (fix what users already touch) | FEAT-001 step list, FEAT-005 developer mode, FEAT-003 recents |
| Differentiators (build on the "stable guidance" positioning) | FEAT-002 manoeuvre and lane graphics, FEAT-007 screen-off guidance |
| Infrastructure-enabling | FEAT-006 pack hosting, FEAT-004 search suggestions |
| Speculative / experiment | FEAT-008 self-hosted OSRM |

## 2. Feature specifications

### FEAT-001: Text step list and route overview
- **Problem.** Users cannot preview the turns before starting. Screen-reader users have no alternative to the map.
- **Users.** Every planner, TalkBack users, and passengers.
- **Story.** "Before I start, I want to scroll through every turn so I know whether the route uses roads I'm comfortable with."
- **Gap and evidence.**
  - Only the current step is ever rendered (`components/nexora/NexoraApp.tsx:287-294`).
  - The steps already exist on each `Route` (`shared/nexora/domain.ts:13-19`).
  - Linked to A11Y-001 and the map-alternative gap in [TECHNICAL_AUDIT.md](TECHNICAL_AUDIT.md).
- **UX.**
  - A "Steps (n)" disclosure on the routes sheet under each route card.
  - During guidance, a "Steps" button opens a list that scrolls to the current step.
  - Each row shows icon (from BUG-005), instruction, and distance in the user's units.
  - The list is not interactive while moving: read only, with no inputs.
- **MVP.** A read-only list built from `route.steps`, plus a pure formatter in `shared/nexora`.
- **Non-goals.** Step-level re-planning, lane info, and printing.
- **Technical approach.**
  - Add `formatSteps(route, units)` to `shared/nexora/guidance.ts` or a new `steps.ts`.
  - Add a FlatList in `Panels.tsx`.
  - Give it `accessibilityRole="list"`.
- **Data/API.** None new.
- **Modules.** `Panels.tsx`, `NexoraApp.tsx`, `shared/nexora`.
- **Dependencies.** Better with BUG-004 and BUG-005 (correct text and icons), but not blocked by them.
- **Cost, licensing and privacy.** None.
- **Acceptance.**
  - Every step of the selected route appears in order, and the distances sum to the route distance within rounding.
  - TalkBack reads each row.
  - The list is hidden behind a button while moving.
- **Success metric.** A TalkBack tester completes plan → review → start without touching the map.
- **Validation.** Unit test of the formatter, plus a TalkBack walk-through.
- **Effort.** S. **Risk.** Low. **Priority.** P1.

### FEAT-002: Full manoeuvre icon set with lane hints
- **Problem.** Ambiguous guidance at complex London junctions.
- **Gap.** Only two arrows exist (BUG-005). OSRM `intersections[].lanes` is not requested or mapped (`server/nexora/route-mapper.ts`).
- **MVP.** A complete icon set by `type`/`modifier` (BUG-005 delivers this), plus lane arrows when OSRM returns `lanes`.
- **Non-goals.** Junction views and invented lane data.
- **Approach.**
  - Pass `steps=true&annotations=false` (already done) and read `intersections`.
  - Map the lane `indications` and `valid` flags into a compact `lanes` array on `Step`.
  - Render them in the turn banner and on car displays (`shared/nexora/car-guidance.ts`).
- **Dependencies.** BUG-004 and BUG-005.
- **Licensing.** OSM data under ODbL, already attributed.
- **Acceptance.**
  - Lanes are shown only when they are present in the OSRM fixture.
  - Unit table tests cover the mapping.
- **Metric.** Fewer missed turns in LG device drives. This is qualitative until telemetry exists.
- **Effort.** M. **Priority.** P2.

### FEAT-003: Recent searches and destinations
- **Problem.** Repeat London trips need re-typing.
- **Gap.**
  - The search panel shows only demo or provider results (`components/nexora/Panels.tsx:395-410`).
  - Trip history is off by default (`hooks/use-nexora.ts:72`).
- **MVP.**
  - The last 10 chosen destinations are kept locally and shown when the query is empty.
  - Delete-my-data and a Privacy switch clear them.
- **Non-goals.** Cloud sync and query-string history.
- **Privacy.** Stored locally only. This is a new kind of location record, so it is opt-out, clearable, and included in export.
- **Acceptance.**
  - After choosing 11 destinations, the list shows the latest 10.
  - "Delete my local data" empties it.
  - The export JSON includes it.
- **Effort.** S. **Priority.** P2.

### FEAT-004: Debounced live search suggestions
- **Problem.** Search is submit-only (`Panels.tsx:367-369`), and typing discards results (BUG-006).
- **MVP.** Suggestions after 3 or more characters and a 350 ms pause, calling the existing `/api/nexora/search` (or the LocationIQ autocomplete endpoint), with a short server cache.
- **Dependencies.**
  - SEC-005: separate limits and a daily cap, otherwise one user can drain the quota.
  - BUG-006: a stale-response guard.
- **Cost and licensing.** Each keystroke batch is a provider request. **Verify LocationIQ free-plan limits and autocomplete terms first** (status: Needs Verification). Public Nominatim must not be used for autocomplete (`.env.example`).
- **Acceptance.**
  - At most 1 request per 350 ms per user.
  - Cache hits never call the provider.
  - The daily cap is enforced.
- **Effort.** M. **Priority.** P2.

### FEAT-005: Developer mode
- **Problem.** Test tools appear in the end-user UI (UX-004): inject buttons, "Approve test fixture", synthetic demo, and `/dev/theme-lab`.
- **MVP.**
  - A `prefs.developer` flag, off by default in release builds and toggled by a long-press on the version row.
  - It gates the test tools and engineering copy.
  - `app/dev/*` redirects when `!__DEV__ && !developer`.
- **Acceptance.**
  - A release APK shows no test tools until developer mode is enabled.
  - The browser smoke scripts still work, because they enable developer mode first.
- **Effort.** S. **Priority.** P2. It ships with UX-004 in WS-4 if there is capacity.

### FEAT-006: Host offline packs outside git, with verified atomic updates
- **Problem.**
  - The 56 MB PMTiles file lives in git and is force-added against `.gitignore`.
  - Every Render build clones it.
  - The device never checks sha256, and an update deletes the old pack first (GEO-002, DEBT-004, PERF-003).
- **MVP.**
  1. Publish packs as a GitHub Release asset (free) with the manifest.
  2. Render `buildCommand` downloads and verifies sha256.
  3. The device downloads into a temp directory, verifies (adds `expo-crypto`), then swaps.
- **Non-goals.** A CDN, new regions, or rewriting git history. History rewriting needs a separate owner decision.
- **Acceptance.**
  - `git ls-files` shows no `.pmtiles`.
  - `/api/nexora/offline/regions` still shows London as available.
  - A corrupted download is rejected.
  - An aborted update keeps the old pack.
- **Effort.** M. **Priority.** P2.

### FEAT-007: Screen-off guidance (Android foreground service)
- **Problem.**
  - Guidance is foreground-only. With the screen off, the GPS watch and voice may stop. Keep-awake prevents auto-lock (`hooks/use-live-guidance.ts:270`), but not a manual lock.
  - The capabilities response reports `backgroundGPS:false`.
- **MVP.** `expo-location` background updates with a foreground-service notification, only while guidance is active. Show a rationale before the background-permission prompt.
- **Dependencies.** QA-004 must pass first, because foreground guidance must be proven before adding background behaviour.
- **Privacy.** Background location is a sensitive permission and needs a Play policy declaration. Location stays on the device, and nothing is uploaded.
- **Acceptance.** On a physical device, guidance and voice continue for 10 minutes with the screen locked, and stop when guidance ends.
- **Effort.** L. **Priority.** P2, Phase 5. **Status.** Blocked.

### FEAT-008: Self-hosted OSRM (experiment)
- **Problem.**
  - The public OSRM server requires < 1 request per second, has no SLA, and rejects every `exclude` (probe: `docs/provider-capability-probe-2026-11-27.json`).
  - Because of that, the avoid-motorway, toll and ferry options are disabled.
- **MVP.** A Greater London car graph built with `exclude` classes on a small VM, with `NEXORA_CAR_ROUTER` pointed at it. The code already supports this through `NEXORA_CAR_EXCLUDE` (`.env.example`).
- **Cost.** Software is free (OSRM is BSD-2). Hosting is **not** free on the Render free tier, because it needs about 2–4 GB RAM.
- **Acceptance.** The probe script shows that excludes are honoured.
- **Effort.** L. **Priority.** P3, pending a hosting decision.

## 3. Deferred or rejected

| Idea | Decision | Reason |
|---|---|---|
| AI or natural-language trip planning | Rejected for now | No user evidence. Needs a paid LLM and new privacy surface. The leftover `llm.ts` is being removed (DEBT-001) |
| 3D, terrain or rotation | Deferred | The Leaflet raster renderer cannot do it. It needs a MapLibre migration, which is XL |
| Live community incident reports | Deferred | Needs moderation, abuse controls and a backend datastore (ROADMAP F3.5-*). Demo-only today, and should stay so |
| Paid live traffic speeds (TomTom, HERE) | Rejected | Conflicts with the free/open-provider preference. TfL disruptions cover the free tier |
| CarPlay | Blocked | Needs the Apple CarPlay navigation entitlement (`docs/CAR_DISPLAYS.md`) |
| Accounts and cloud sync | Deferred | The app is guest-first. Rebuild it on a reviewed design after SEC-002 removes the Manus stack |
| EV routing and charging | Deferred | Needs provider data and vehicle profiles (ROADMAP F3.2-04, F3.7-02) |
| Route sharing with live location | Deferred | Text sharing already exists (`lib/nexora-share.ts`). Live location sharing needs a backend and consent design |
