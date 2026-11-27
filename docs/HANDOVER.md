# NEXORA Maps — handover

## Current status (27 Nov 2026)

- **Source and deploys.** The code lives in the private GitHub repo `Amepps1994/nexora-maps`. Every pull request runs
  CI (`.github/workflows/ci.yml`: typecheck, lint, tests, server build). Render deploys `main` to
  https://nexora-api-cfoh.onrender.com (free plan, sleeps after 15 minutes idle). Manus is no longer used.
- **Android.** EAS builds an installable APK (`eas.json` profiles `preview` and `production-apk`; see
  [RELEASE.md](RELEASE.md)). Build `a4265095` launched to the full map on an x86_64 Android emulator (API 37). No
  physical-phone or in-car test has been recorded yet.
- **Features added since the original slice.** LocationIQ live search, up to three stops with leave / arrive times,
  TfL road disruptions, the offline London pack, live GPS turn-by-turn guidance with voice, and Android Auto /
  lock-screen guidance. CarPlay waits for Apple's entitlement.
- **Not yet verified.** Live guidance and car displays are unverified for road use until device tests LG-1 to LG-10
  in [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) pass on a real phone.
- **Open owner actions.** Rotate `DATABASE_URL` and `JWT_SECRET` (they appeared in old EAS build logs) and delete the
  old logs; choose the final Android application id. The audit and roadmap are in `roadmap/`.
- **Microphone.** The app no longer bundles `expo-audio` / `expo-video`, and the Android build strips
  `RECORD_AUDIO`. Voice guidance is text-to-speech only.

Use [README.md](../README.md) for local development and [SETUP.md](SETUP.md) for provider configuration.

## Historical record (26–27 Nov 2026, Manus era)

Everything below was written while the app was hosted on Manus, before the Render backend, EAS builds and the
features above existed. It is kept as a record of what was validated then. Where it says "no APK", "lookup not
configured" or "not implemented", the current status above supersedes it.


The app opens in Manus Preview and is built with the fixed Expo / React Native / TypeScript mobile starter. It is a functioning planning and simulated-navigation slice, not a landing page. Nothing has been published, purchased or released to app stores. No installable APK/IPA has been produced. Native road guidance is not enabled.

### What works today

The interactive, attributed OpenStreetMap/Leaflet map supports pan, zoom, scale, pins, recenter, destination markers and selected-route overlays. The web rendering boundary is an iframe; iOS/Android source uses a compatible WebView. Map handshakes time out into a working retry control. Light/dark appearance and reduced-motion/display-unit controls work; a dark map is explicitly a raster display treatment, not another imagery provider.

Search filters a labelled twelve-point London demo catalogue and accepts latitude, longitude. Dropped pins supply arbitrary destinations. Manual origin and destination swap work; endpoint changes invalidate old routes and late responses. A configurable operator-controlled geocoder adapter validates response schemas. Live address/postcode lookup is **not configured** and has a setup/disabled state; public Nominatim is intentionally rejected.

OSRM's non-commercial hosted test service returned actual graph geometry and deterministic instructions for King's Cross → Tate Modern in driving, walking and cycling profiles. Car returned one route; foot and bike returned two. Only distinct alternatives survive de-duplication. The route-scoring policy compares known duration/turn-event counts, with default versioned 0.50/0.20/0.15/0.15 weights renormalised over available dimensions. Relaxed changes the preference weights. No cost, live-traffic, road-limit or calibrated reliability value is fabricated. Turn-event count is a simple supplied-complexity proxy, not a judgement that a road is easy or safe.

The simulator replays geometry by interpolated distance, updates deterministic step distance and progress, hides bottom tabs, blocks manual reports while playback is moving, supports pause/end and explicitly simulated ETA jitter/GPS-loss/offline/closure/recovery events. Domain rules enforce max(180 seconds,10%) soft savings, three stable updates and 90-second cooldown, with essential exceptions. A synthetic closure with no usable compliant candidate enters safe-stop recovery and disables Resume; no illegal detour is invented. It does not ingest live traffic or perform actual GPS navigation. Simulation event injection is a developer/test control, not an interaction to use while driving.

Saved places and home/work, appearance, units and preferences persist locally. Trip-summary history is opt-in, with no raw trace. Privacy export opens/downloads JSON. Confirmed deletion clears guest state, device-origin data, pending location results and map GPS marker. Foreground device-location request code exists, but permissions/accuracy/lifecycle have not been verified on physical iOS/Android devices. There is no background watcher, hidden location sharing, account sync or advertising analytics.

Test reports use local-only submission, same-category spatial/time de-duplication, bounded TTL, rate limits, pending/approved/rejected status and explicit test confirmations. Reports never reach a live system or affect engine routes. Same-device confirmation is not independent corroboration. Segment/direction matching, contributor isolation, independent voting, real abuse protection and production moderation remain absent. The real admin endpoint denies anonymous requests with HTTP 403; local review is intentionally labelled a demo console.

### Added 27 November 2026

The route planner now supports up to three ordered stops (add, reorder, remove, per-leg totals), leave now / leave at / arrive by estimates in UK time from free-flow durations, and an honest avoid motorways/tolls/ferries state that stays disabled because the hosted test graph rejects every exclude. Evidence, commands and limits are in [itinerary-validation-2026-11-27.md](itinerary-validation-2026-11-27.md). Tests now total 181 passing with the same one pre-existing skip.

### Actual validation on 26 November 2026

`pnpm db:push` completed against the supplied starter user schema before API startup. Managed `api` and `metro` listeners were registered on ports 3000 and 8081, and both were verified listening. `GET /api/health` returned HTTP 200. No incident/guest data is written to the managed database.

`pnpm check` passed with TypeScript exit zero. `pnpm lint` passed with no actionable lint findings; the starter emits pnpm-field and JavaScript module-type warnings. `pnpm test` passed **139 tests**, with **one pre-existing auth.logout test skipped**: 96 domain/fixture tests, 6 session/playback tests, 12 malformed-provider-schema tests and 25 starter CORS tests. Outputs are retained in `typecheck-output.txt`, `lint-output.txt` and `test-output.txt`. These tests are not physical-device or complete React-hook lifecycle tests.

Six finite HTTP smoke checks passed: health 200, capabilities 200, coordinate bounds 400, unsupported truck profile 400, unconfigured postcode search 503 and anonymous admin 403. `api-smoke-results.json` records actual timestamps/statuses. Stored `live-route-sample.json`, `walking-route-sample.json` and `cycling-route-sample.json` contain the three permitted test-provider smoke responses, not a statistically meaningful benchmark.

Browser DOM smoke checks exercised destination selection, real walking alternatives, relaxed scoring and start. They verified tabs hidden, moving report blocked, pause-to-report, submission/local review/confirmation, no-candidate closure Resume disabled, offline cached-route disclaimer, recovery, simulated arrival and privacy/no tracking links. Additional UI checks confirmed guest deletion and local bookmark persistence. The immediate-report smoke initially failed because the review clock preceded a new report timestamp; one observed timestamp now drives both ledger and clock, and the corrected path executed without an assertion exception. A transient map endpoint failure during development reload was investigated: local/forwarded endpoints were HTTP 200 once recovered, and the handshake timeout/retry flow was added. These are controlled browser smoke tests, not a comprehensive automated native E2E suite. The reproducible console scenario is `scripts/browser-smoke.js`.

`pnpm build` compiled the Express backend. `npx expo export --platform all --output-dir dist-mobile` successfully compiled **iOS, Android and Web bundles** after final map/report fixes. This proves JavaScript/platform-boundary compilation, not native release packaging, installation, OS permissions, battery, background execution or road-safe navigation. Output is retained in `expo-export-output.txt`; generated bundle directories are excluded from source control/export.

A source regex scan for common secret literals/private keys found no matches in application modules and `.env.example`; that is a limited scan, not a security certification. `pnpm audit --json` produced no usable metadata, so dependency-vulnerability audit remains **blocked/unverified**, not passed. A read-only validation agent found route-loading invalidation, precise-origin deletion, closure Resume bypass and tile-network recovery defects; targeted fixes were applied and relevant UI/type/test paths rechecked. Native touch/assistive-technology/contrast and real-device permission gates remain unverified.

### Screens, design and limits

Implemented screen captures are under `screenshots/`. They are Expo Web planning/simulation views, never evidence of native road guidance. The UI uses original split-path branding, midnight/white/deep teal surfaces, blue real-test routes and dotted teal synthetic geometry. Reusable controls, sheets, route cards, status notices, turn banner and speed-unknown tile live under `components/nexora`.

The final [phone simulation capture](screenshots/phone-simulation.webp) is a clean crop of an actual 390 × 740 CSS-pixel web viewport, not a native-device screenshot or generated mock-up. A persistent OpenStreetMap attribution badge remains visible above route sheets; the map also retains its linked Leaflet/OpenStreetMap attribution. The final attribution change passed typecheck/lint and iOS/Android/Web bundle export.

Some supporting labels are small and complete WCAG 2.2 AA/large-text/VoiceOver/TalkBack validation is not claimed. Sheets scroll; drag-to-resize is not implemented. Map rotation, pitch, compass, clustering and true 3D are not implemented. Route drag, stop-order optimisation, time windows, real hard-attribute avoidance and ETA intervals are deferred. (Ordered stops, free-flow leave/arrive estimates and the disabled-avoidance state were added on 27 November 2026.) Unknown legal-access coverage is always disclosed. No truck-safe, accessible, reliable, economical or eco-savings guarantee is offered.

Offline region packages, local search graph/rerouting, voice, background/lock-screen guidance, official traffic/closures, validated lane/landmark navigation, live trip sharing, EV/parking/charges, public transit, AI, car displays and global production deployment are not implemented. Their controls do not appear falsely enabled. Offline package gate is blocked, not replaced by cached tiles or a fake Download button. Trademark/domain, provider terms, jurisdiction matrix, DPIA, legal review, moderation operations and dependency audit are required before beta/public launch.

### Continue safely

Use README.md for the demo; SETUP.md and PROVIDER_RESEARCH.md for actual policies/provider configuration; PRIVACY_SECURITY.md for draft notices, security and moderation; DEVICE_TEST_PLAN.md for native validation; FEATURE_MANIFEST.json and ROADMAP.md for every retained requirement, phased dependencies, states and planning effort ranges. Full broad source paragraphs remain unfinished where advanced clauses are missing; evidence-backed delivered subfeatures are listed separately instead of declaring their parent requirement complete.

This handover intentionally does not claim the whole P0 acceptance contract is complete. It delivers the requested end-to-end vertical slice with explicit blocked gates and an exportable source project. Use Dashboard Connect Expo for device preview; obtain required native/provider/legal approvals before requesting a signed development build or any publication.
