# Update change audit: e2bd944 → 05eeaca

- **Baseline:** `e2bd944` (V2 re-audit, `docs/roadmap/reaudit-2026-11-28-e2bd944/`, PR #9)
- **Current:** `05eeaca66eb5d5d67af53688361bb96f327ace0e` (`main`, equal to `origin/main` on 28 Nov 2026 16:45 UTC)
- **Command:** `git diff --stat --ignore-cr-at-eol e2bd944 05eeaca` → 12 commits, 88 files, +7,784 / −2,183
- **Working tree:** clean apart from the untracked `docs/screenshots/apk-e2bd944-2026-11-28/` (evidence for e2bd944 only, not touched)
- **Other local branches (preserved, not modified):** `wip/local-snap` @ 9891fcc (unpushed), `claude/project-thread-2dxedb` @ 79d5a6d (holds the 1.2.0 bump c87485f and the pre-squash version of #20; both reached `main` through 05eeaca)

The prompt's snapshot facts were all re-confirmed: 12 commits, 88 files, `app.config.ts` version 1.2.0, `package.json` still `app-template` 1.0.0, and the stack it lists.

## 1. Commit by commit

| # | Commit | PR | Files (+/−) | What changed | Backlog items it targets | Audit verdict |
|---|---|---|---|---|---|---|
| 1 | 082e10c | #10 WS-A | 8 (+408/−50) | Car guidance uses the given step as the next manoeuvre; `playbackAt` returns the upcoming step; depart wording from `bearing_after` | BUG-010, BUG-011, BUG-012, QA-006 (car) | Fixed in code with tests. BUG-010/012 still need device evidence (R-11) |
| 2 | 809434c | #9 | 9 docs | V2 re-audit documents | – | Docs only |
| 3 | 81f6501 | #11 WS-D | 7 (+860/−82) | Waking-state warm-up, 14-min idle detection, AppState resume, idle car snapshot on unmount, pure controllers in `lib/nexora-controllers.ts` | BUG-013, BUG-014, BUG-006, QA-002 (part) | Fixed in code with controller tests; hooks still not tested directly |
| 4 | ff78898 | #12 WS-C | 9 (+676/−36) | Map postMessage origin rules and text rendering, compact credits, stale-TfL ageing, 30 s TfL backoff, start/listen/SIGTERM handling, tighter CORS | SEC-006, UX-001, BUG-015, PERF-004, OPS-002, SEC-012 | Fixed with tests. Lifecycle tests fail on Windows only (OPS-008) |
| 5 | e59beaf | #14 WS-E | 6 (+651/−70) | TalkBack once per step, wake notice inside sheets, notification prompt before guidance, end confirmation | A11Y-006, UX-009, UX-010, UX-005, UX-003, QA-006 (screens) | Logic tested; TalkBack/device behaviour unverified |
| 6 | c8ac668 | #15 WS-B | 7 (+1266/−137) | trust proxy, per-family limits, search cache + 4,000/day budget, bounded per-provider queues, JSON 404/errors, headers/CSP, render.yaml fixes, structured failure logs | SEC-005, SEC-011, SEC-007, GEO-004, SEC-008, OPS-001, OPS-005, OPS-006, OPS-007, QA-003, QA-006 | Fixed with strict-mock HTTP tests; Render-side behaviour (hop count, deploy) is an owner check |
| 7 | c851529 | #13 WS-F | 20 (+233/−1315) | Removed client OAuth route, tRPC, React Query, template UI; version 1.1.0; refreshed manifest and test plan | SEC-002, DEBT-001, UX-003, DOC-003 | Fixed; the test plan has since gone stale again (DOC-003) |
| 8 | ce8df0e | #16 | 11 (+343/−109) | **Start now launches live GPS**; simulation and test controls only with `DEV_TOOLS`; road-use warning banners removed; Android accuracy-prompt fix | UX-004, FEAT-005 | Fixed as described; creates V4-REL-01 (release gate) and V4-NAV-01 |
| 9 | a86bb86 | #17 | 8 (+918/−138) | `/api/nexora/places` (Overpass, ~500 m cell cache 6 h, queue, limiter); live chips and highlights replace demo catalogue | new | Source of V4-POI-01..08 |
| 10 | bc33ded | #19 | 13 (+579/−7) | 3D map page (vendored MapLibre GL, OpenFreeMap), follow camera with route heading, 3D/2D toggle, fallback to 2D | new | Source of V4-MAP-01..05; SEC-006 rules carried over |
| 11 | 9e1166f | #18 | 8 (+260/−263) | Compact home, collapsible sheet, spacing/radius/type tokens, smaller chips | UX-007 (part), DEBT-006 (part) | Chips are now 36 px (A11Y-005 worse) |
| 12 | 05eeaca | #20 | 5 (+444/−42) | Per-endpoint 5 s Overpass slots, LocationIQ Nearby fallback with its own 800/day budget, 1.2.0 bump | new | V4-POI-03 (budget/queue), V4-POI-05 (attribution) |

## 2. Changed files by area

| Area | Files | Main tasks now open on them |
|---|---|---|
| Places (server + shared) | server/nexora/places.ts (new, 327 lines), shared/nexora/places.ts (new, 300), tests/nexora-places.test.ts | V4-POI-01..04, V4-OPS-09 |
| Client state | hooks/use-nexora.ts (1,113 lines), lib/nexora-controllers.ts, lib/nexora-api-core.ts | V4-POI-05..08, V4-NAV-01, QA-002 |
| Map | server/nexora/map3d-document.ts (new), shared/nexora/map-view.ts (new), components/nexora/JourneyMap.tsx, server/nexora/map-document.ts | V4-MAP-01..05, GEO-003, PERF-001 |
| Screens | components/nexora/NexoraApp.tsx (1,751), Panels.tsx (2,051), screen-logic.ts, ui.tsx | UX-002, A11Y-004/005, DEBT-003 |
| Server core | server/_core/app.ts, cors.ts, index.ts, server/nexora/routes.ts, geocoder.ts, traffic.ts, render.yaml | SEC-005 (owner), SEC-011 residual |
| Release/config | app.config.ts, package.json, docs/RELEASE.md, DEVICE_TEST_PLAN.md, FEATURE_MANIFEST.json | DEBT-005, DOC-003, V4-REL-04 |

## 3. Regression matrix

"Static" means read at 05eeaca; nothing here was run on a device.

| Area | Risk from the delta | Covered by automated tests? | Gap |
|---|---|---|---|
| Live guidance start | Start is live by default (ce8df0e); remote/default origin not checked | Partly (tests/nexora-live-start.test.ts) | V4-NAV-01, QA-004 |
| Next-turn on all surfaces | Fixed in 082e10c | Yes (car-guidance, session tests) | R-11 device |
| Nearby / highlights | New feature; anchor falls back to King's Cross | Server mapping and route tests; no hook tests | V4-POI-08, V4-POI-06/07 |
| Places quota | Two in-memory budgets, quota taken before queue | Unit tests for budgets | V4-POI-03 |
| 3D map | New WebView page, camera logic | Source-string tests and map-view unit tests only | V4-MAP-01..05 need runtime tests |
| 2D map | Hardened (ff78898) | Yes | GEO-003 tile policy |
| Server lifecycle | New signal handling | Yes on Linux | Fails on Windows (OPS-008) |
| Search | Cache/budget/limits | Yes (strict mocks) | Budget restarts with process |
| Copy | Live default makes "simulated trip" copy wrong | No | UX-002 |

## 4. Checks run for this audit

| Command | Exit | Duration | Result | Limitations |
|---|---|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | 2 s | No type errors | Node v26.13.1 locally; project pins 22 |
| `node node_modules/vitest/vitest.mjs run` | 1 | 32 s | 25 files, 647 tests: 645 passed, 2 failed in tests/server-lifecycle.test.ts (SIGTERM exit code `null`; listen-error case timed out at 30 s) | Windows signal and port semantics; same tests pass on CI |
| CI run 46147129938 on 05eeaca (`pnpm check`, `lint`, `test`, `build`, `expo export android`) | success | 45 s | 647/647 passed, lint clean | Linux, Node 22 |
| `esbuild server/_core/index.ts … --outdir=<scratch>` | 0 | <1 s | dist/index.js 99.2 kb | Written outside the repo |
| `pnpm lint` locally | not run | – | pnpm is not on PATH (OPS-008) | CI lint is the source of truth |
| Expo export locally, live provider calls, device runs | not run | – | Not authorised by the prompt / no quota spent | – |

The V2 audit's "475 tests" was its own baseline. The current figure is 647.
