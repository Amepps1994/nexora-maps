# NEXORA Maps — device test plan and release gates

Snapshot: 26 November 2026. **This is a plan, not test results. Every case below is NOT RUN unless the main agent attaches actual evidence.** Supplied TODO.md has no checked acceptance item. A foreground location implementation is described in plan.md but is not device-verified. No native live guidance, background navigation, offline graph, voice/car-display or production readiness is certified.

## Safe execution and evidence

Use the deterministic simulator, a controlled closed course or a passenger operating the device without distracting a driver. No handheld driver tests on public roads. Zero speed at a traffic light is not safely parked. Use synthetic/non-sensitive coordinates with hosted providers; honour the shared below-one-request/second OSRM test budget and normal-view OSM tile policy. Never benchmark/load-test public endpoints or bulk-download tiles.

For every run record commit/build ID, date, tester, physical device/model, OS/build, Expo/development-build versus web environment, renderer/provider URLs/profile versions, connection condition, permission setting and fixture. Record expected/actual, pass/fail/blocked/not-run, command/logs with coordinates/tokens redacted, screenshot/video with consent, defect ID and retest evidence. Screenshots do not prove live guidance or backend authorisation. Attach command output and exit status rather than saying “tests pass”. Capture no private journeys or plates/faces.

## Minimum physical device matrix

Models/OS versions below are selection criteria, not devices tested or claims of current platform support. Choose actual devices within the installed SDK's supported range; record exact versions. Real-device access is a blocker until supplied.

| Slot | Device selection | Required coverage | Current evidence |
| --- | --- | --- | --- |
| iOS-small | Small-screen physical iPhone, minimum supported iOS | Safe areas, large fonts, VoiceOver, permission deny/allow, WebView attribution, landscape | NOT RUN |
| iOS-main | Current supported mainstream physical iPhone/iOS | Foreground GPS, app switch/lock/restart, Low Power Mode, Bluetooth interruptions | NOT RUN |
| Android-mid | Midrange physical Android, minimum supported OS | TalkBack, process death, permission precision/denial, WebView, battery/data/frame rate | NOT RUN |
| Android-current | Current supported Android physical handset | Permission revocation, background restrictions, audio focus, rotation, storage pressure | NOT RUN |
| Android-low | Supported lower-resource/small-screen Android | Memory pressure, slow network, long session, dynamic font and touch targets | NOT RUN |
| Web | Desktop Chrome/Safari/Firefox and mobile browser within supported range | Keyboard/focus, resize, iframe referrer/cache, permission/empty states | NOT RUN; planning only |
| Native-offline | Physical iOS and Android development builds with verified local engine | Airplane-mode fresh search/start/reroute, graph boundary/integrity | BLOCKED: no approved offline stack |
| Car-display | Android Auto Desktop Head Unit, then a real car; CarPlay after Apple entitlement | Platform-specific UI, entitlements, interaction/audio restrictions | NOT RUN: Android Auto built (docs/CAR_DISPLAYS.md), untested; CarPlay blocked on Apple entitlement |

Emulators/simulators support deterministic and layout checks but cannot substitute for GPS, Bluetooth, thermals, battery, native lifecycle or car-display validation. Use an approved development build for custom native modules; Expo Go/WebView preview is not proof that they work.

## Reproducible P0 simulator scenario

Open as guest and deny location. Select a clearly labelled London demo destination or coordinate pair, set a manual origin, then request a permitted configured test route. If no live provider is reachable, show the error; explicitly choose a synthetic fixture rather than silently swapping geometry. Check source/unknowns and only distinct returned alternatives. Select fewer-turns/relaxed only where real manoeuvre data supports the difference; no unsupported reliability/cost label. Lock the selected route and start **simulation** with a persistent badge and no bottom tabs.

Advance instructions and progress, inject labelled tunnel/drift, offline, genuine off-route and closure fixture events, and check recovery/reroute explanations. Confirm small ETA oscillations do not reroute; a single unverified demo report cannot close a road. Manual report entry must be blocked while playback is moving; pause/end safely before using the local demo report workflow. Complete arrival/end and verify foreground watchers/session state stop. Save/home-work, opted-in history, local export/delete and restart must be checked if implemented. Sharing/revocation is skipped and recorded blocked unless an actual approved implementation exists. No demo report may reach a live service.

## Original acceptance cases and execution details

The manifest retains acceptance clauses ACC-01 through ACC-12 verbatim. These procedures complement, never replace, their full requirements.

### ACC-01 — guest and foreground permission

Fresh guest install opens map without registration; deny, deny permanently, allow later, approximate/precise where supported, revoke in OS settings and return. Manual origin still works. Verify contextual prompt, no permission wall, real GPS accuracy/age distinct from simulator and watcher teardown after end. Check permissions on every physical iOS/Android slot. Status: NOT RUN.

### ACC-02 — real search versus demo

Use a configured licensed/self-hosted geocoder for known London address/postcode and check returned source/attribution. Test malformed/empty/long/no-result query, debounce/cancel and provider timeout/quota. With URL/key absent, show setup/labelled demo, never claim a live result. Confirm no request is made to public Nominatim and no invented hours/business data appears. Status: NOT RUN; live geocoder requires configuration.

### ACC-03 — route/profile integrity

One non-sensitive permitted case for each independently configured car/foot/bike graph; verify response code, bounds, distances/durations/steps/geometry, provider source and no-route. Distinguish unreachable endpoint and unsupported profile. Check origin/mode/preferences/stops only if supported and compare/start simulator. Alternatives requested but absent must not create duplicate/fabricated routes. Legal/speed-limit/traffic/cost/lane unknowns remain unknown. Status: NOT RUN; no modes considered verified here.

### ACC-04 — scoring and arithmetic

Unit/integration fixtures for missing dimensions, renormalised 0.50/0.20/0.15/0.15 versioned weights, infeasible/legal exclusions, conflicting preferences, simplicity based on actual steps, distinct alternatives, metric/imperial conversion and fuel/energy/cost units. Unknown cost is not zero; explanations agree with inputs. Status: NOT RUN.

### ACC-05 — stable rerouting

Replay repeated changes below max(180 seconds, 10% remaining time), above threshold stable across samples, cooldown/hysteresis, lock/user override and no-route. Verified closure/legal infeasibility/genuine off-route override soft lock and cooldown; unverified incident cannot. Drift/jump/tunnel/parallel-road/roundabout cases show uncertainty and need consistent samples. Safety stop guidance instead of abrupt illegal detour. Status: NOT RUN.

### ACC-06 — simulator and location confidence

Check every state transition idle/planning/preview/navigating/degraded/offline/rerouting/arrived/ended, deterministic next turn/progress/arrival, start/end/recenter/mute actions and crash/restart minimal-session recovery. Inject drift/off-route/tunnel/GPS loss and network restore. Simulator label survives every state; engine/synthetic data provenance remains visible. Foreground marker tests cannot enable live native guidance. Status: NOT RUN.

### ACC-07 — isolated community/moderation

Safely stationary manual report/confirm/not-there; compatible segment/direction/time dedupe, rate limits, TTL expiry/retraction, stale labels, review/reject/appeal fixtures. Check blocked UK camera/police categories via UI and tampered payload. Confirm no hard closure from one unverified report and no live network publication. Local moderation explicitly demo-only; anonymous production admin routes must be unavailable/deny access, not an exposed demo console. Status: NOT RUN.

### ACC-08 — failure and offline disclosure

Deny permissions, lose network/GPS, inject slow response/timeout/quota/invalid schema/no data and recover. No UI freeze or invented route/location/business/safety fact. Cached route/tiles show cache timestamp, not live traffic or offline graph coverage. Disabled features have prerequisite messages and no false working controls. Status: NOT RUN.

### ACC-09 — genuine offline navigation gate

BLOCKED until permitted offline map packages plus local geocoder/routable graph/profiles/instructions/native rerouter exist. Then test download size/free space/progress/cancel/resume, checksum/version/expiry, atomic update/rollback, deletion/storage pressure and boundary warning. In airplane mode start a new route, search a new destination and create a new reroute wholly in graph. Old traffic unavailable/aged; reconnect queues revalidate expiry. Public standard OSM tiles must never be bulk downloaded. Cached geometry or an online server does not pass this case.

### ACC-10 — privacy and authorisation

Guest save/history opt-in persists only as intended; local export contains owned data and no secrets; deletion clears owned keys/watchers/session state and stays cleared after restart. Inspect network and redacted logs for raw GPS/traces/tokens. For future accounts/shares, test ownership isolation, high-entropy expiry/revoke/arrival stop, inaccessible expired URL and no referrer leakage; those cases remain blocked unless implemented. Run actual secret/dependency scans and anonymous/admin privilege tests. Status: NOT RUN.

### ACC-11 — accessibility and driving focus

VoiceOver/TalkBack meaningful order/labels, keyboard web navigation/focus, large fonts without clipping, contrast and colour-independent symbols, reduced motion, minimum 44pt iOS/48dp Android targets, small phone/landscape/safe area and map attribution not covered. Focus mode removes tabs/dense forms; moving playback blocks keyboard/manual reporting and cannot be casually bypassed via a passenger switch. Audio-only/hands-free controls are blocked until implemented and validated. Status: NOT RUN.

### ACC-12 — native lifecycle/audio/device gate

Physical-device tests for permission variants, app background/lock/foreground, process kill/restart, interrupted sessions/calls, audio focus/Bluetooth route changes, rotation, screen reader and weak-GPS recovery. Measure session duration, frame rate, data, thermals and battery on defined fixtures with consent. Background/voice functionality stays unavailable unless truly built and tested. Separate CarPlay/Android Auto approval and tests required; store release outside MVP. Status: NOT RUN.

## Automated verification and benchmark evidence

Run `pnpm check`, `pnpm lint` and `pnpm test` on the actual commit and retain their complete output/exit codes. Inventory which tests are unit/integration; the presence of a `test` script is not E2E coverage. Record E2E tooling/commands only when it exists. Add pure-domain fixtures for route scoring/stability, expiry/dedupe, invalid provider response, units and permission teardown. Mock timeout/quota/closures locally rather than stressing public providers. No commands were executed for this documentation snapshot.

Master-brief goals are not achieved measurements: route median <=2 s/p95 <=5 s on a defined permitted good-network London dataset, beta crash-free sessions >=99.5%, smooth midrange map interaction, better false-reroute behaviour without illegal/infeasible routes, ETA calibration, missed turns/recovery, battery/data, completion/accessibility/workload. Define sample size, devices, network, provider permissions, corpus, baseline and confidence/percentile method before collecting. Never claim superiority to Google/Waze from synthetic replay or an anecdote. Public OSRM load benchmarks are not authorised.

## Release gates and proposed owners

| Gate | Evidence required | Proposed responsible role | Current disposition |
| --- | --- | --- | --- |
| G0 traceability | Every original clause in manifest/roadmap; honest flags/prerequisites | Main agent/product owner | Documentation generated; feature evidence pending |
| G1 P0 functional | Actual type/lint/unit/integration/E2E outputs and ACC-01..08/10..11 results | Engineering + QA | NOT RUN; no completed P0 claim |
| G2 provider/licence | Profiles, geocoder, attribution/referrer/cache, restrictions, quotes/terms/processor register | Provider/licence owner | BLOCKED; hosted tests are not production |
| G3 privacy/security | DPIA where needed, legal notice/contact, retention, export/delete, scans, ownership/admin tests | Privacy + security lead | BLOCKED; drafts only |
| G4 device/accessibility | Named physical iOS/Android matrix, assistive tech, lifecycle/audio/battery evidence | Mobile QA + accessibility lead | BLOCKED; no physical results |
| G5 native road guidance | Validated native SDK/graph, matching/voice/foreground-background safety, controlled field tests | Navigation safety lead | BLOCKED; simulation only |
| G6 offline graph | Offline-permitted source, local graph/index and full ACC-09 evidence | Offline engineering + QA | BLOCKED; no public tile downloads |
| G7 live community | Licensed authority feeds, real RBAC admin, redacted audit, staffing/SLA/appeals | Moderation operations | BLOCKED; local demo only |
| G8 car displays | Separate CarPlay/Android Auto entitlements, approved integrations/platform tests | Native/platform owner | BLOCKED: Android Auto code ready for DHU test; CarPlay needs Apple entitlement |
| G9 public pilot/release | Approved pilot consent, all applicable gates, risk sign-off/rollback, store policy review and explicit release approval | Product/controller/release owner | NOT AUTHORISED |

Roles must be assigned to actual people before beta. A gate stays blocked/not-run until proof exists; documentation or a working web preview cannot clear it. The main agent must update only the exact proved feature/subfeature, not an entire mixed paragraph after testing one control. Keep unverified advanced clauses discoverable and disabled.

## Live GPS guidance and voice (added 2026-11-27)

Status: **implemented, unverified for road use.** Verified so far only with mock GPS: 35 unit tests on the real
King's Cross → Tate Modern OSRM route (`tests/nexora-guidance.test.ts`) and a full mock-GPS drive in the web build
(`scripts/live-guidance-web-drive.js`, result in `docs/live-guidance-mock-drive-2026-11-27.json`). No physical-device
or emulator run yet. Foreground only: no background location, no foreground service; the screen is kept awake.

How it works: `hooks/use-live-guidance.ts` watches foreground location (BestForNavigation, 1 s / 2 m), snaps each
fix to the route (`shared/nexora/guidance.ts`), and speaks prompts with expo-speech (en-GB). Off-route needs the
same thresholds as `REROUTE_POLICY` (accuracy ≤ 25 m, moving, 3 stable samples); the candidate route is then put
through `rerouteDecision()` unchanged. Fixes worse than 25 m, or none for 10 s, mark guidance degraded.

Emulator test (Android): install a build that includes expo-speech, open Extended controls → Location → Routes,
import `docs/mock-gps/kings-cross-tate-modern.gpx` (or `-detour.gpx`, which leaves the route at 1.5 km), plan
King's Cross → Tate Modern by car with provider routes, tap **Start live GPS guidance**, then play the route.

| # | Case | Expected | Result |
|---|---|---|---|
| LG-1 | Start live guidance, allow location | Banner "LIVE GPS · UNVERIFIED FOR ROAD USE", "Head left onto Euston Road" spoken | Mock web: pass. Device: not run |
| LG-2 | Deny location | Toast, stays in preview, simulation still offered | Not run |
| LG-3 | Drive on route | Progress, distance and ETA fall; "In half a mile / 300 yards / Turn left onto Southwark Street" | Mock web: pass. Device: not run |
| LG-4 | Detour GPX | "Off route. Finding a new route." after 3 fixes, new route from current position | Mock web: pass. Device: not run |
| LG-5 | Tunnel / GPS off for 10 s | "Weak GPS signal", no off-route, recovers when fixes return | Unit: pass. Device: not run |
| LG-6 | Voice toggle | "Voice on/off" silences and restores prompts; Settings row reflects it | Not run |
| LG-7 | Arrival | "Arrive at your destination", "Live GPS guidance complete", location watch stops | Mock web: pass. Device: not run |
| LG-8 | Phone call / other audio during guidance | Prompts do not crash; audio ducking behaviour recorded | Not run |
| LG-9 | App backgrounded mid-route | Guidance stops updating (foreground only); resumes on return | Not run |
| LG-10 | iOS silent switch | Record whether prompts play | Not run |

Do not remove the "unverified for road use" labels until LG-1 to LG-10 pass on a physical iOS and Android device.
