# Next sprint (10 working days, from 05eeaca)

## One developer, in order

| Day | Work | Items | Gate |
|---|---|---|---|
| 1 | Commit recorded in builds; device test plan rewritten for 1.2.x; Windows-safe lifecycle tests | V4-REL-04, DOC-003, DOC-002, OPS-008 | Plan reviewed by Andrew |
| 2–3 | Nearby anchor and launch fix; live-start origin check; start notice per Andrew's decision | V4-POI-08, V4-NAV-01, V4-REL-01 | Anchor and start-check tests pass |
| 4 | Places server: limiter before cache, single-flight, budget reservation | V4-POI-01, V4-POI-03 | Concurrency tests pass |
| 5 | Radius filter and dedup; render.yaml knobs | V4-POI-04, V4-POI-02, V4-OPS-09 | Border/branch tests pass |
| 6 | Nearby status, race fixes, attribution, coordinate precision, copy | V4-POI-06, V4-POI-07, V4-POI-05, V4-PRIV-04, UX-002 | Hook race test passes |
| 7–8 | 3D: framing, pan policy, matched-segment heading, readiness/fallback, reload timer, runtime test | V4-MAP-01..05 | Playwright 3D test passes |
| 9 | 2D tile source (if decided) or offline pack hashing | GEO-003 or GEO-002/GEO-007 | Map/offline tests pass |
| 10 | Version 1.3.0, combined APK (Andrew's typed approval), device session | QA-004 rows in RELEASE_READINESS.md §3 | Results recorded with build id, commit and sha256 |

## Parallel alternative

Five threads, one per packet (WS-G places server, WS-H nearby client and live start, WS-I map, WS-J offline, WS-K release/docs), merged K → G → J → H → I, then one APK. About 3–5 days elapsed instead of 10.

## Owner actions (Andrew)

1. Decide V4-REL-01, V4-MAP-02 and GEO-003 (MASTER_ROADMAP.md §6).
2. Render: set auto-deploy to "after CI checks pass", and confirm the latest deploy log built with `--prod=false` (QA-001, OPS-005).
3. Delete or rotate the retired secrets (SEC-013) and rotate anything that was inside a shared archive's `.env` (V4-REL-03).
4. Type approval for the combined EAS build in a thread on the PC.
5. Run, or nominate someone to run, the device rows; passenger or closed-area only for live guidance.

## Device gates for this sprint
Cold start nearby away from London; live start from a remote origin; 3D toggle with a route, pan during guidance, offline fallback; places during an Overpass outage (mirror off); LG-1..LG-10; DHU next-turn (R-11).

## Deferred, on purpose
DEBT-003 (split big files) until hook tests exist; PERF-001 until a baseline is measured; A11Y-004/005 sweep next sprint (both big screen files are owned this sprint); DEBT-005 until the owner plan; all FEAT-* proposals; FEAT-007 (Play background-location policy).
