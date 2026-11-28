# Technical audit at 05eeaca

All line references are at `05eeaca`. Evidence levels: **verified-static** (read in code, reasoning shown), **verified-runtime** (a command or API result), **suspected** (plausible from code, not proven), **risk**, **proposal**, **blocked** (needs a device, dashboard or the owner). No finding below was observed on a device.

The 24 new findings use `V4-` IDs. Older IDs are reconciled in ROADMAP_RECONCILIATION.md; the ones still open are summarised in §8.

## 1. Places and nearby (workstream C/D)

### V4-POI-08 · P1 · verified-static · high confidence: cold start shows places around King's Cross
- **Where:** `hooks/use-nexora.ts:110` (`origin` defaults to `DEMO_PLACES[0]`, King's Cross), `:393` (`nearbyAnchor = gps ?? center ?? origin.coordinate`), `:211-216` (launch only *reads* the permission), `:427-439` (highlights fetched for the anchor cell), `:615,621` and `:632-643` (`end()`/`reset()` clear `gps`; `reset()` sets the centre to a fixed London point).
- **Repro:** grant location once, kill the app, travel (or mock location) to Manchester, cold start. `gps` and `center` are undefined, so highlights and chips query King's Cross. After a journey ends, `gps` is cleared and the next browse falls back the same way.
- **Root cause:** no position is requested on launch even when permission is already granted, and the fallback chain ends at a demo fixture rather than "unknown".
- **Fix:** on launch with `granted`, request a last-known fix (≤5 min) then a balanced fix without prompting; keep the last good fix after `end()`; when no fix exists, use the visible map centre and label the list with the area, never the demo origin. Make the anchor rule a pure function in `lib/nexora-controllers.ts`.
- **Tests:** unit tests of the anchor rule (granted/denied/no fix/after end); hook test that launch with `granted` calls `getLastKnownPositionAsync`; device cold start away from London.
- **Acceptance:** no network request uses the King's Cross coordinate unless the user is there or picked it.

### V4-POI-01 · P1 · verified-static: cached nearby requests skip the rate limit
- **Where:** `server/nexora/places.ts:242-251` returns from the cache before `limiter.check` at `:258`. Address search does the opposite (`server/nexora/routes.ts:624-631` limit, then cache at `:633-638`).
- **Impact:** a client can request the same cell without limit. The free Render instance pays the CPU and egress.
- **Fix:** run the limiter first, or give cached hits a separate, higher per-client limit. Keep `Retry-After`.
- **Tests:** 31 cached requests from one IP → 429 with Retry-After; a second IP still served; normal browsing (6 chips + highlights) stays under the limit.

### V4-POI-03 · P1 · verified-static (partly risk): quota taken before work, no single-flight, per-process budgets
- **Where:** `server/nexora/places.ts:147-164` (separate queues and a separate `DailyBudget` for the fallback), `:213-215` (`fallbackBudget.take()` runs before `fallbackQueue.run`, so a queue-full or aborted request still spends quota), `:243-300` (two concurrent misses for the same key both go upstream), `server/nexora/geocoder.ts:185-215` (`DailyBudget` lives in memory), `server/nexora/routes.ts:640` (search takes its budget before the fetch too).
- **Impact:** quota leaks under load; the 4,000 + 800 split per LocationIQ key is enforced per process only, so a restart (Render free sleeps after idle) resets both counters. Whether that matters depends on real traffic; the provider's daily limit still applies on its side.
- **Fix:** an in-flight map keyed by `category|cell` (single-flight); reserve budget when the queued task starts and refund on QueueFullError/abort; one budget object per LocationIQ key shared by search and fallback (with sub-limits). Do not add external persistence until logs show restarts are causing overruns.
- **Tests:** 10 parallel requests for one cell → one upstream call; queue-full → budget unchanged; client abort before start → budget unchanged.

### V4-POI-04 · P2 · verified-static: radius measured from the cell, not the user
- **Where:** `shared/nexora/places.ts:98-110` (`overpassQuery` uses the snapped cell centre with the category radius; `out center tags 300` caps results in no particular order), `:282-299` (`nearestPlaces` sorts by real distance but never filters by radius).
- **Reasoning:** the snap offset can reach ±0.0025° in each axis (≈ 280 m N–S, ≈ 175 m E–W at 51.5°N), so places just inside the radius on the far side of the user are missed and places up to ≈ 330 m beyond it are included. In dense areas (Food, 1.2 km in central London) the 300 cap truncates an unordered set, so the nearest places can be dropped.
- **Fix:** query radius + max offset, then filter by real distance from the user; for dense categories tighten radius or use `qt` ordering plus a smaller cap.
- **Tests:** points at a cell corner and exactly on the radius; a fixture with >300 elements where the nearest is last.

### V4-POI-02 · P2 · verified-static: deduplication hides branches
- **Where:** `shared/nexora/places.ts:187-189` and `:251-253` key on lower-cased name plus coordinates rounded to 2 dp (a cell about 1.1 km × 0.7 km).
- **Impact:** two Costa or Tesco branches in the same cell collapse to one.
- **Fix:** dedupe by OSM id first; merge same-name features only within ~75 m (covers station node + way + relation); same rule across Overpass and LocationIQ results.
- **Tests:** two same-name cafés 400 m apart both kept; a station node and its area way merged.

### V4-POI-05 · P2 · verified-static: attribution and malformed replies
- **Where:** `hooks/use-nexora.ts:394-404` keeps only `places` and turns any unexpected body into `[]`; `shared/nexora/places.ts:270` labels LocationIQ fallback rows "© OpenStreetMap contributors"; `components/nexora/Panels.tsx:606-623` shows the search provider credit and a constant OSM note.
- **Mitigation already present:** the OSM credit is always shown when browsing, and the LocationIQ credit appears through the search line whenever search is configured. So this is a correctness gap, not a missing credit today.
- **Fix:** keep `attribution` from the reply and show it; zod-parse the reply and show an error (not "No places found") when it is malformed. Provider terms were not re-checked in this audit.

### V4-POI-06 · P2 · verified-static: no loading/stale/error state for nearby
- **Where:** `hooks/use-nexora.ts:427-439` swallows highlight failures and keeps the old list; the effect only re-runs when the rounded 0.01° cell changes.
- **Impact:** after going offline or moving, the home list can show places from somewhere else with no hint.
- **Fix:** a small status object `{state, at, anchorLabel}`; clear or label the list when the anchor cell changes; show "Updated 10:42 · near <area>".

### V4-POI-07 · P2 · verified-static: cross-panel races
- **Where:** `browse()` `:406-426` uses `nearbyReq`; `choosePlace()` `:440-445` cancels the text search but not `nearbyReq`; `calculate()` `:539-545` sets `busy`.
- **Repro:** tap Food, then pick a highlight before the nearby reply lands, then the route starts calculating; the late nearby reply runs `onSettled → setBusy(false)` and hides the route spinner while routes still load.
- **Fix:** `choosePlace`, panel close and `calculate` cancel `nearbyReq`; give each operation its own busy flag or a token.
- **Tests:** hook test with a delayed fetch and fake timers.

### V4-PRIV-04 · P3: places requests send 5-dp coordinates
- `hooks/use-nexora.ts:401` sends `toFixed(5)` (~1 m). The server snaps to a cell before calling providers, so providers never see it, but the query string can land in proxy logs. Sending 3 dp (~100 m) keeps distance ordering useful.

## 2. Map rendering (workstream B)

### V4-MAP-01 · P1 · verified-static: 3D page does not frame the route on load or theme change
- **Where:** `server/nexora/map3d-document.ts:85` (`style.load` → `render(latest, true)`), `:112` (`fitBounds` only when `!fresh`). `lastRoute` is reset at `:84`, so the route is drawn but never fitted.
- **Repro:** plan a route in 2D, switch to 3D (or switch theme while previewing): the camera stays where it was.
- **Fix:** on a fresh render, fit when not following and the route changed since the last *fit* (track `lastFitted` separately from `lastRoute`).

### V4-MAP-02 · P1 · verified-static: manual pan during guidance snaps back
- **Where:** `:92` sets `following=false` on `dragstart`; `:114` re-follows when `!following` on the next update (about once per GPS fix).
- **Fix (policy needs owner OK):** a pan pauses follow until the user taps Recenter (the 2D map already has a recenter control in `components/nexora/NexoraApp.tsx:571`), optionally auto-resume after 10 s stationary. Keep follow as the default.

### V4-MAP-03 · P1 · verified-static: heading from the globally nearest segment
- **Where:** `shared/nexora/map-view.ts:68-95` scans every segment for the nearest one on every render (`components/nexora/NexoraApp.tsx:104-106`); ties go to the later segment.
- **Impact:** on loops, out-and-back legs, parallel carriageways and junctions the nearest segment can be the wrong direction, so the camera flips. Cost is O(route points) per render.
- **Fix:** the live tracker already projects onto a matched segment with a backtrack tolerance (`shared/nexora/guidance.ts:120-145`); expose that segment from `hooks/use-live-guidance.ts` (and the playback segment for simulation), compute bearing from it, smooth (e.g. ignore changes under 3° and limit rate), and fall back to GPS course only when the tracker is acquiring.
- **Tests:** loop route, U-turn, parallel return leg, stationary drift (heading must not change), reroute.

### V4-MAP-04 · P1 · verified-static: readiness and failure handling in the 3D page
- **Where:** `:136` sends `ready` at script end, before any style has loaded; `:53` arms the 15 s style timer once, so a theme change (`:130`, `setStyle`) that never loads leaves a blank map; `:55` only falls back for errors before the first style; later tile errors just show a banner. There is no `webglcontextlost` handler.
- **Fix:** send `ready` from `style.load`; re-arm the timer on every `setStyle`; after N tile errors in a window, or on context loss, send `no3d` so the app falls back to 2D with the existing notice.
- **Tests:** runtime test with a failing style URL, a failing tile URL and a forced context loss. Source-string tests are not enough here.

### V4-MAP-05 · P2 · suspected: reload timer outlives the map it was for
- `components/nexora/JourneyMap.tsx:145-161`: `reloadTimer` is cleared only on unmount, so a 3 s reload scheduled for one document can fire after a 2D/3D or offline switch. Clear it on mode change and on `ready`.

### GEO-003 · raised to P1 · verified-static: 2D tiles straight from tile.openstreetmap.org
- `server/nexora/map-document.ts:35` and CSP `server/nexora/routes.ts:734`. With live navigation now the default and the app distributed as an APK, the OSMF tile usage policy (no heavy or app-scale use without permission) is a real risk; tiles can be blocked. The 3D view already uses OpenFreeMap. Options: render 2D with the vendored MapLibre and OpenFreeMap's flat style, or a raster provider whose terms allow app use. Owner picks; recommendation is MapLibre flat style, since it reuses what is already vendored and free.

### PERF-001 (still open)
- Whole payload stringified and injected on every update (`components/nexora/JourneyMap.tsx:209-236`). No measurement exists yet; measure first on a mid-range phone, then diff.

## 3. Navigation and release safety (workstream A)

### V4-REL-01 · P0 · owner decision: live GPS is the default with no device validation
- ce8df0e made Start launch live guidance and removed the "unverified for road use" banners. `docs/DEVICE_TEST_PLAN.md` LG-1..LG-10 have no results, and LG-2 still expects a simulation fallback that production no longer offers (`:161`). The plan's own rule, "Do not remove the 'unverified for road use' labels until LG-1 to LG-10 pass on a physical iOS and Android device" (just after the LG table), was broken by ce8df0e. LG-1 still expects that banner.
- **Recommendation:** keep live as the default (it is what the owner asked for) but show a one-line "Not yet validated for road use: passenger use or stopped only" on the start confirmation until QA-004 passes. Alternative: gate live start behind an explicit opt-in. This is Andrew's call.

### V4-NAV-01 · P1 · suspected: route origin is not checked against the user's position
- `hooks/use-nexora.ts:586-610` starts live guidance on whatever `route` is selected. With the default origin (King's Cross, `:110`) or a manually chosen remote origin, the first fixes are far off the route, the tracker confirms off-route and `maybeReroute` (`hooks/use-live-guidance.ts:156-200`) asks for a new route from the position; with `routeMode` locked, the reroute may be declined and the user hears "Off route" repeatedly.
- **Fix:** at start, if the first fix is more than ~200 m from the route start, ask "Route from your location?" and recalculate before guidance. Tests: unit test of the decision; emulator with a mock location far from the origin.

### V4-REL-04 · P1 · verified-runtime: APK provenance
- EAS build `1a370f81-99c5-4847-ab17-7a4d543f53e8` (1.2.0, versionCode 5, `production-apk`, finished 13:16:53 UTC) has `gitCommitHash: null` because builds run with `EAS_NO_VCS=1`. It was created at 12:57:03 UTC, 23 s after the 05eeaca CI run started, so it most likely contains 05eeaca or the branch tip 79d5a6d, but this cannot be proven. The APK was not downloaded or hashed (that needs approval).
- **Fix:** pass the commit into the build (for example `EXPO_PUBLIC_NEXORA_COMMIT` read into `extra` and shown in Settings → About), and record each APK's sha256 in RELEASE_READINESS.md.

### Other navigation checks (static only)
- Simulation cannot start from the production UI: `start("simulation")` returns early unless `DEV_TOOLS` (`hooks/use-nexora.ts:590`, `lib/dev-tools.ts:8`). Verified-static.
- Synthetic routes are drawn with a distinct dashed style in both maps (`map3d-document.ts` `nx-route-demo` layer). Verified-static.
- Live trip history is now recorded with `simulated: false`, but Settings still says "Keep simulated trip history" (`components/nexora/Panels.tsx:1473`) and Trips says "Complete a simulated trip" (`NexoraApp.tsx:1318`): tracked under UX-002.
- Battery, wake lock, audio focus, phone calls and Bluetooth were not assessed beyond reading `expo-keep-awake` usage; they need device runs (QA-004).

## 4. Backend (workstream D)

Verified-static at 05eeaca: trust proxy (`server/_core/app.ts:76`), `nosniff` and other headers (`:30`), JSON 404 and body-parse errors (`:38-58`), bounded queues (`routes.ts:53-110`), search cache and daily budget (`geocoder.ts`), CORS limited to GET/POST/OPTIONS. Open: V4-POI-01, V4-POI-03, V4-OPS-09 (render.yaml does not list `NEXORA_OVERPASS_URL`, `NEXORA_PLACES_FALLBACK`, `NEXORA_PLACES_FALLBACK_DAILY_BUDGET`). Anonymous access to `/api/nexora/places` is by design (guest-first app), so it is not treated as a vulnerability.

## 5. UX and accessibility (workstream E)

Open and verified-static: UX-002 (copy), A11Y-004 (8 text styles at 9–10 px), A11Y-005 (chips now 36 px high after #18), A11Y-002 (only 4 `accessibilityState` uses in Panels.tsx), UX-008 (reduced motion is an app preference, not read from the OS; the 3D follow camera makes this matter more). None of the TalkBack items can close without a device.

## 6. Offline and privacy (workstream F)

GEO-002 is still open: `lib/offline-pack.ts` never hashes the download, and a failed update can remove the working pack. GEO-007 unchanged. Offline mode shows tiles and local search only; there is no offline routing, and the app does not claim any. Location stays on the device apart from route/search/places requests (V4-PRIV-04, PRIV-003).

## 7. Maintainability and QA (workstream G)

- Largest files grew: Panels.tsx 2,051, NexoraApp.tsx 1,751, use-nexora.ts 1,113 lines (DEBT-003).
- The 3D page is covered only by source-string tests (`tests/security-admin-account.test.ts`, `tests/nexora-map-view.test.ts`); a Playwright test loading the page with a stub style would cover V4-MAP-01/02/04 (Chromium is available on CI runners).
- No hook tests exist (QA-002); every V4-POI client item needs one.
- Local runs differ from CI (OPS-008): Node 26 on the PC, no pnpm, and the two lifecycle tests fail on Windows.

## 8. Explicit unknowns

1. Device behaviour of anything in 1.2.0 (QA-004).
2. The commit inside EAS build 5 (V4-REL-04).
3. Render: deploy gating, the real X-Forwarded-For hop count, and whether old env vars are deleted (QA-001, SEC-005, SEC-013).
4. Live provider behaviour today (Overpass, LocationIQ Nearby, OpenFreeMap, OSRM): no live calls were made, to avoid spending quota.
5. Current provider terms (LocationIQ attribution wording, OSMF tile policy details) were not re-read in this audit.
6. Performance baselines: none measured, so no targets are set.
