# NEXORA Maps master roadmap (V4 audit, main @ 05eeaca, 28 Nov 2026)

## 1. Executive summary

Since the V2 audit (e2bd944) twelve commits landed: the six V2 workstreams (WS-A to WS-F) and four feature PRs (live GPS by default, live OpenStreetMap places, a 3D map, a calmer home screen) plus an Overpass fallback. The code is healthier: of the 78 V2 items, 20 are now verified fixed in code and tests, and 12 more are implemented but still owe a device check. CI is green (647/647) and `main` now requires the `verify` check.

The biggest change in risk is that **Start now launches live turn-by-turn navigation, and no part of 1.2.0 has been tested on a phone, a car display or in TalkBack.** The two new features also brought new defects: nearby places centre on the King's Cross demo point after a cold start (V4-POI-08, the bug Andrew reported), and the 3D camera does not frame routes, fights the user's pan and can spin on loops (V4-MAP-01..03).

Readiness: **not ready for road use claims.** Suitable for owner and passenger testing with the known issues below.

## 2. Current architecture (re-confirmed)

Expo 57, React Native 0.86, React 19, TypeScript; Express server on Node 22 on Render's free tier (Frankfurt); Vitest; pnpm. Maps: Leaflet 2D in a WebView (tiles from tile.openstreetmap.org), MapLibre GL 3D with OpenFreeMap vector tiles, offline London PMTiles pack. Providers: OSRM public server (routing), LocationIQ (address search and Nearby fallback), Overpass (places), TfL Unified API (disruptions). Live GPS and voice via expo-location/expo-speech; Android Auto via `@iternio/react-native-auto-play`, CarPlay gated; lock-screen card via notifications. Guest-first: all user data in AsyncStorage on the device. Version 1.2.0 in `app.config.ts`; `package.json` still says `app-template` 1.0.0.

## 3. Top five risks

| # | ID | Risk | Priority |
|---|---|---|---|
| 1 | V4-REL-01 + QA-004 | Live navigation is the default and has never been validated on a device | P0 |
| 2 | V4-POI-08 + V4-NAV-01 | After a cold start, nearby and the default origin are King's Cross; starting live guidance from that origin gives a reroute loop or a wrong first instruction | P1 |
| 3 | V4-MAP-01..04 | 3D camera: route not framed, pan snaps back, heading flips on loops, broken style/tiles never fall back to 2D | P1 |
| 4 | V4-POI-01 + V4-POI-03 | Places endpoint: cached requests skip the rate limit, quota spent before work, duplicate upstream calls, budgets reset on restart | P1 |
| 5 | GEO-003 | 2D map uses OSM's own tile servers, against their policy for app-scale use | P1 |

Also P1 owner checks: SEC-013 and V4-REL-03 (retire or rotate old secrets, keep `.env` out of shared archives), V4-REL-04 (APKs do not record their commit, so build 5's source is unproven).

## 4. Phases

| Phase | Goal | Items | Effort (one developer) |
|---|---|---|---|
| 0 · Evidence hygiene | Know exactly what is built and deployed | V4-REL-04, QA-001 (Render), SEC-005 hop check, SEC-013, V4-REL-03, OPS-005, OPS-008 | 0.5–1.5 days + owner time |
| 1 · Device validation and correctness | Fix what users hit first, then test on devices | V4-POI-08, V4-NAV-01, V4-REL-01, DOC-003, then QA-004 with BUG-001/009/010/012, A11Y-006, UX-005/009/010, BUG-007/008/014 | 2–3.5 days dev + 1–2 days device |
| 2 · Resilience, camera, tests | Make places and 3D robust; hook and runtime tests | V4-POI-01..07, V4-MAP-01..05, GEO-003, GEO-002, GEO-007, QA-002, UX-002, A11Y-004/005, DEBT-002 | 8–14 days |
| 3 · Product upgrades | Discovery and journey quality | V4-FEAT-01 (search this area), V4-FEAT-02 (place details), FEAT-003 (recents), V4-FEAT-03/04, DEBT-003 split, DEBT-005 identity plan | 6–12 days |
| 4 · Large, gated | Only with demonstrated need and approvals | FEAT-006/V4-FEAT-05 offline packs, FEAT-007 screen-off guidance, FEAT-008 self-hosted OSRM, FEAT-002 lanes, I18N-001 | 10+ days, provider and policy dependent |

Estimates are ranges for code plus tests, assuming one developer who knows the codebase; device time is separate.

## 5. Delivery

- **Parallel (recommended, matches how this project works):** five packets WS-G to WS-K with disjoint files, merged K → G → J → H → I, then one 1.3.0 APK with its commit recorded. See IMPLEMENTATION_PLAN.md.
- **One developer, 10 days:** NEXT_SPRINT.md.

## 6. Owner decisions

1. **V4-REL-01:** keep live GPS as the default with a one-line "not yet validated for road use" notice at start (recommended), or require an explicit opt-in until device gates pass.
2. **V4-MAP-02:** pan pauses follow until Recenter (recommended), or auto-resume after a few seconds.
3. **GEO-003:** 2D basemap provider. Recommended: MapLibre with OpenFreeMap (free, no key, already used for 3D). Alternative: a keyed free tier from a commercial provider, which adds a key and a quota.
4. **DEBT-005:** whether and when to move off the `space.manus…` package id and `manus…` scheme. Changing the Android package makes a new app: existing installs and their local data do not carry over.
5. **Device testing:** who runs LG-1..LG-10 and the DHU checks, on which phone. Road tests only by a passenger or in a closed area.

## 7. Dependencies

QA-004 depends on V4-REL-04 (know the build) and DOC-003 (a current plan). V4-NAV-01 builds on the anchor work in V4-POI-08. V4-MAP-03 needs `use-live-guidance` to expose its matched segment. V4-FEAT-01 needs V4-POI-06/08. GEO-002 precedes FEAT-006 and V4-FEAT-05.
