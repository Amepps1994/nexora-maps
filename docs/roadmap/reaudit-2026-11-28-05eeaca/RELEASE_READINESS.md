# Release readiness (05eeaca / APK 1.2.0 build 5)

**Verdict:** suitable for owner and passenger testing. **Not** ready for any road-use claim or wider distribution until the P0 gates below pass.

## 1. The build

| Field | Value | Evidence |
|---|---|---|
| EAS build id | 1a370f81-99c5-4847-ab17-7a4d543f53e8 | Expo build_list, 28 Nov 2026 |
| Version / versionCode | 1.2.0 / 5 | same |
| Profile / distribution | production-apk / INTERNAL | same |
| Created / finished (UTC) | 12:57:03 / 13:16:53 | same |
| Commit | **not recorded** (`gitCommitHash: null`, builds use `EAS_NO_VCS=1`) | V4-REL-04 |
| Likely source | 05eeaca or branch tip 79d5a6d (CI for 05eeaca started 23 s before the build) | inference only |
| APK sha256 | not computed (download needs approval) | – |
| Artifact | https://expo.dev/artifacts/eas/m2FJ0VzXI6xs5nQwTqrZ9x6om-jMA8UbR3QrdBi_oSg.apk (expires 12 Dec 2026) | – |

## 2. Gates

| Gate | Status | Evidence |
|---|---|---|
| Typecheck | Pass | tsc exit 0 (local) and CI |
| Lint | Pass on CI | CI run 46147129938; not runnable locally (OPS-008) |
| Unit/integration tests | Pass on CI 647/647; local 645/647 (Windows-only lifecycle failures) | EVIDENCE_INDEX.csv |
| Server bundle | Pass | esbuild exit 0 |
| `main` protected by required check | Pass (`verify`); admins not enforced | GitHub API |
| Render deploys only after CI | Unknown | Owner (QA-001) |
| Old secrets retired | Unknown | Owner (SEC-013, V4-REL-03) |
| APK provenance | Fail | V4-REL-04 |
| Device validation LG-1..10 | Not run | QA-004 |
| Road-use notice consistent with plan | Fail (labels removed before LG passed) | V4-REL-01 |

## 3. Device matrix to run on the next APK

Run on one physical Android phone (Android 13+), the Android emulator with mock routes, and the Android Auto DHU. Live guidance only as a passenger, stationary, or in a closed area.

| # | Case | Expected | Items | Result |
|---|---|---|---|---|
| LG-1 | Start live guidance, allow location | Start notice per V4-REL-01 decision; "Head <compass> on <road>" | V4-REL-01, BUG-012 | Not run |
| LG-2 | Deny location at Start | Toast explains permission; stays in preview; **no** simulation offered in production | DOC-003 | Not run |
| LG-3 | Follow route (mock GPX) | Distance/ETA fall; prompts at the right distances | BUG-010 | Not run |
| LG-4 | Detour GPX | One "Off route" prompt, new route from position | BUG-007 | Not run |
| LG-5 | 10 s GPS loss | Weak signal, no off-route, recovers | – | Not run |
| LG-6 | Voice toggle | Silences/restores | – | Not run |
| LG-7 | Arrival | Arrival prompt, watch stops, trip saved without "simulated" wording | UX-002 | Not run |
| LG-8 | Call/other audio | No crash; ducking recorded | – | Not run |
| LG-9 | Background mid-route | Stops updating; resumes on return | BUG-013 | Not run |
| LG-10 | iOS silent switch | Recorded | – | Blocked (no iOS build) |
| N-1 | Cold start with location granted, away from London | Highlights and chips near the user, never King's Cross | V4-POI-08, BUG-009 | Not run |
| N-2 | Browse Food during an Overpass outage (`NEXORA_OVERPASS_URL=off` on a test server) | LocationIQ results with credit, or a clear error | V4-POI-05 | Not run |
| N-3 | Browse, then pick a place before results land, then Directions | Route spinner stays until routes arrive | V4-POI-07 | Not run |
| S-1 | Live Start with the origin 5 km from the device | Offered "Route from your location" | V4-NAV-01 | Not run |
| M-1 | Plan a route in 2D, switch to 3D | Whole route visible | V4-MAP-01 | Not run |
| M-2 | Pan the 3D map during guidance | View stays until Recenter | V4-MAP-02 | Not run |
| M-3 | 3D on a loop route | Camera does not flip | V4-MAP-03 | Not run |
| M-4 | 3D with tiles blocked / switch theme offline | Falls back to 2D with notice | V4-MAP-04 | Not run |
| C-1 | DHU next-turn | Car card shows the next manoeuvre | BUG-010 (R-11) | Not run |
| A-1 | TalkBack during guidance | Once per step; step list readable | A11Y-006, A11Y-001, FEAT-001 | Not run |
| P-1 | `aapt dump permissions` | No RECORD_AUDIO | PRIV-001 | Not run |

## 4. Owner approvals needed

1. Typed approval in a thread on the PC for the combined EAS build.
2. The V4-REL-01, V4-MAP-02 and GEO-003 decisions.
3. Render dashboard settings (QA-001) and secret retirement (SEC-013, V4-REL-03).

## 5. Deploy and rollback checklist

1. Merge packets in order K → G → J → H → I; CI green on each.
2. Render deploys `main`; confirm `/api/health` 200 and `/api/nexora/capabilities` lists places and 3D.
3. Bump to 1.3.0, build the APK with the commit recorded; note build id, commit and sha256 here.
4. Run §3; record results with date and tester.
5. **Rollback:** server, redeploy the previous Render deploy; app, reinstall build 5 (same package id, data kept); keep both APK links until 1.3.0 passes.
