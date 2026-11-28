# NEXORA Maps: Roadmap Reconciliation (V2 re-audit)

Audit date 28 Nov 2026 · Current: `main` @ `e2bd944` · Baseline: `7d4215a` (previous audit) · Back to [MASTER_ROADMAP.md](MASTER_ROADMAP.md)

## 1. Historical roadmap inventory

| Source | Where it lives | Used for |
|---|---|---|
| Previous audit (27 Nov 2026, commit `7d4215a`, clean cloud clone) | `docs/roadmap/{MASTER_ROADMAP,TECHNICAL_AUDIT,FEATURE_BACKLOG,IMPLEMENTATION_PLAN}.md` and `PRIORITISED_BACKLOG.csv` on branch `docs/roadmap-audit-2026-11-27` ([PR #2](https://github.com/Amepps1994/nexora-maps/pull/2), **still open, not on `main`**). Read with `git show`; not checked out. | All 70 prior IDs, acceptance criteria, priorities, dependencies |
| Workstream PRs #3 to #8 (merged 27 Nov) | PR descriptions (`gh pr view`) | Treated as claims only; every closure below was checked against code and tests |
| Older product docs | `docs/ROADMAP.md`, `docs/FEATURE_MANIFEST.json` (141 entries), `docs/HANDOVER.md`, `TODO.md`, `plan.md` | Context only. They use manifest states rather than stable backlog IDs, so they were not reconciled item by item. `FEATURE_MANIFEST.json` and `DEVICE_TEST_PLAN.md` are byte-identical to `7d4215a` (DOC-003). |
| CI history | GitHub Actions runs on every PR and `main` push since PR #3 | Evidence for QA-001 and lint |
| Emulator screenshots of the e2bd944 APK | `docs/screenshots/apk-e2bd944-2026-11-28/` (untracked, owner-supplied) | Runtime evidence for UI items |

Nothing before the 27 Nov audit could be reconciled item by item; that audit is the first reliable baseline.

## 2. Completion summary (denominator: the 70 prior IDs)

| Outcome | Count | Meaning here |
|---|---|---|
| COMPLETED_VERIFIED | 14 | Acceptance criteria met with code plus a behavioural test (or a static criterion read in code, or a CI log) |
| IMPLEMENTED_UNVERIFIED | 10 | Code and unit tests landed; a runtime acceptance check (emulator, TalkBack, built APK) is still missing. Kept only as validation work |
| PARTIAL | 10 | Part of the acceptance criteria met; the remainder is listed |
| OPEN | 35 | Still applies as written (9 audited files are byte-identical to `7d4215a`) |
| SUPERSEDED | 1 | SEC-001: the code it tested was deleted by SEC-002; owner dashboard work moves to SEC-013 |
| REGRESSED / OBSOLETE / DUPLICATE / UNKNOWN | 0 | No prior item demonstrably regressed |

- **Strict completion:** 14 of 70 (20 %). Unverified and partial items are excluded from the numerator.
- **Counting code that landed but is unverified:** 24 of 70 (34 %). Given for context only.
- **Prior P0s (6):** 2 COMPLETED_VERIFIED (SEC-003, SEC-004), 1 SUPERSEDED (SEC-001), 1 PARTIAL (SEC-002, client half), 1 IMPLEMENTED_UNVERIFIED (BUG-001), 1 OPEN (QA-004).
- **Untouched by the sprint:** `server/nexora/routes.ts`, `server/nexora/map-document.ts`, `server/nexora/offline.ts`, `server/_core/index.ts`, `lib/offline-pack.ts`, `shared/nexora/traffic.ts`, `shared/nexora/itinerary.ts`, `hooks/use-offline-regions.ts` and `hooks/use-traffic.ts` are identical to `7d4215a`. The previous plan's WS-1 packets TP-2 (rate limiting) and TP-3 (map document hardening) were never started, so SEC-005, SEC-006 and the queue half of SEC-007 carry over unchanged.

## 3. Priority changes from the previous audit

| ID | Was | Now | Why |
|---|---|---|---|
| SEC-001 | P0 | closed (SUPERSEDED) | Code removed in PR #5. Leaked-credential cleanup is owner work: new SEC-013 (P1) |
| SEC-002 | P0 | P2 | Server half done and tested. The client half (deep-link OAuth route, tRPC client) only reaches routes that now return 404, so exposure is low |
| SEC-003, SEC-004 | P0 | closed | Verified by `tests/server-routes.test.ts` |
| BUG-001 | P0 | P1 (validation) | Code landed with good unit tests; what remains is the on-device cold-start run |
| BUG-006, BUG-007, BUG-008, BUG-009, A11Y-001, FEAT-001, UX-003 | P1 | P2 (validation) | Implemented; only device or emulator checks (or one missing test) remain, batched after the combined APK |
| PRIV-001 | P1 | P2 (validation) | Config change landed and is unit-tested; check the built APK manifest |
| OPS-002 | P1 | P2 | Client ErrorBoundary landed; the server half is an XS fix |
| A11Y-003 | P1 | P2 | Flagged pairs fixed; what remains is a sweep |
| UX-001 | P2 | **P1** | Confirmed on the emulator: the attribution band sits mid-map and is now longer with the TfL credit |
| FEAT-002, FEAT-004 | P2 | P3 | Icon half of FEAT-002 is done by BUG-005; FEAT-004 waits on SEC-005, SEC-011 and the LocationIQ terms check |
| PERF-003 | P2 | P3 | Belongs with FEAT-006 (pack hosting); not urgent at current traffic |
| DEBT-001 | P2 | P3 | Only two unused template components remain |

Every other surviving item keeps its priority. Scores change only where the CSV shows new components.

## 4. Preserved IDs and aliases

- All 70 prior IDs are preserved. 55 remain in the active backlog ([PRIORITISED_BACKLOG.csv](PRIORITISED_BACKLOG.csv)); 15 are closed and live only in this ledger.
- New IDs continue each family without collision: BUG-010 to 015, A11Y-006, UX-009 to 011, SEC-011 to 013, PRIV-003, PERF-004, OPS-005 to 008, GEO-007, QA-006, DOC-003, DEBT-009.
- Findings merged into existing items:
  - Server review N-01 (provider work outlives client timeouts) → **SEC-007** (scope widened).
  - Server review N-10 and client review CL-07 (tRPC and OAuth client leftovers) → **SEC-002** (client half) and **DEBT-002**.
- Working-note aliases for new items: CL-01 → BUG-010, CL-02 → BUG-011, CL-03 → A11Y-006, CL-04 → BUG-012, CL-05 → UX-009, CL-06 → BUG-013, CL-08 → UX-010, CL-09 → BUG-014, CL-10 → UX-011; N-02 → BUG-015, N-03 → PERF-004, N-04 → OPS-005, N-05 → SEC-011, N-06 → PRIV-003, N-07 → OPS-006, N-08 → SEC-012, N-09 → OPS-007, N-11 → GEO-007, N-12 → QA-006.

## 5. Item-by-item ledger

Columns: original priority, outcome, confidence, current evidence (repo-relative), remaining gap or next action, current priority (`closed` means not in the active backlog).

| ID | Orig | Outcome | Conf | Current evidence | Remaining gap / next action | Now |
|---|---|---|---|---|---|---|
| SEC-001 | P0 | SUPERSEDED (by SEC-002 and SEC-013) | high | The code these criteria tested is gone: `server/_core/{env,sdk,oauth}.ts` and `server/db.ts` were deleted in #5. `render.yaml:5-6` says JWT_SECRET/DATABASE_URL/OAUTH_SERVER_URL are unused. | Owner: delete the vars from Render and EAS. Rotate or destroy the leaked DATABASE_URL credentials at the DB host if that DB still exists. The client still reads `EXPO_PUBLIC_OWNER_OPEN_ID` (`constants/oauth.ts:17`, `scripts/load-env.js:45`). | closed (code gone; owner work moves to SEC-013 P1) |
| SEC-002 | P0 | PARTIAL | high | Server side done: `server/_core/app.ts:18-33` has no OAuth/storage/tRPC routes. `tests/server-routes.test.ts` "SEC-002: Manus account, session and storage routes are gone" (404 and no cookie for every path); `tests/security-admin-account.test.ts` route inventory. | AC "no client code path calls them" is **not met**. `app/oauth/callback.tsx` is still a registered route (`app/_layout.tsx:92`, reachable through the `manus…` deep-link scheme) and calls `lib/_core/api.ts:86,102,117,131` (`/api/oauth/mobile`, `/api/auth/*`). `lib/trpc.ts:31` still builds an `/api/trpc` client and `app/_layout.tsx:67,85` mounts it. Delete them in the client cleanup. | P2 |
| SEC-003 | P0 | COMPLETED_VERIFIED | high | `server/_core/storageProxy.ts` and `server/storage.ts` were deleted. `tests/server-routes.test.ts` checks that `/manus-storage/*` gives a 404 with no upstream call; `security-admin-account.test.ts` storage probes return 404. | None. | closed |
| SEC-004 | P0 | COMPLETED_VERIFIED | high | `oauth.ts`, `sdk.ts` and `cookies.ts` were deleted. `tests/server-routes.test.ts` checks that `/api/auth/session`, `/api/auth/logout` and `/api/auth/me` give a 404 with no Set-Cookie. | None. | closed |
| SEC-005 | P1 | OPEN | high | `server/nexora/routes.ts:89-99` is unchanged: one shared `limits` map, no pruning, keyed on `req.ip` (`:150`, `:278`). Nothing in `server/` sets `trust proxy`. Search and routes share one bucket. No daily cap. | Do all five parts of the AC. Add the throttle test with X-Forwarded-For (audit §7 test 7). | P1 |
| SEC-006 | P1 | OPEN | high | The map document is unchanged. It accepts any-origin `message` (`map-document.ts:43`), posts with `'*'` (`:17`), and `bindTooltip(p.name)` renders the place name as HTML (`:23`). Only the host side improved: the web iframe now checks origin and targets an explicit origin (`components/nexora/JourneyMap.tsx:187-195,201-205`). | Check `e.origin` in the document, post to an explicit origin, and pass a text node to bindTooltip. Add a test (audit §7 test 8). | P1 |
| SEC-007 | P1 | PARTIAL | high | Body limit is now 16 kB (`server/_core/app.ts:8,22`). Covered by `server-routes.test.ts` "rejects a JSON body over 16 kB with 413 before routing". | The queue is still unbounded and shared by LocationIQ and OSRM (`routes.ts:52-88`). No fast 503 and no drop on client disconnect. | P1 |
| SEC-008 | P2 | OPEN | high | No CSP, nosniff or X-Powered-By handling anywhere in `server/` (grep finds nothing). Map route `routes.ts:138-140` is unchanged. | Add the headers and a test. | P2 |
| SEC-009 | P3 | COMPLETED_VERIFIED | med | `JourneyMap.tsx:247-251`: `originWhitelist=[origin‖"https://*","about:*"]` plus `isAllowedMapNavigation` (`lib/nexora-api-core.ts:328-342`). `tests/nexora-client-api.test.ts` "map WebView navigation guard (SEC-009)" (3 tests). The `offline-installed.png` screenshot shows the offline path still works. | Optional: the offline guard allows any `data:` URL (`nexora-api-core.ts:335`), and the whitelist falls back to `https://*` if the origin fails to parse. | closed |
| PRIV-001 | P1 | IMPLEMENTED_UNVERIFIED | med | Plugins and dependencies removed, plus `blockedPermissions: RECORD_AUDIO` (`app.config.ts:106`). `tests/release-config.test.ts` "PRIV-001 no microphone…" (3 tests). | The AC is about the *merged* manifest. Run `aapt dump permissions` on the e2bd944 APK (the PR only did a scratch prebuild) and attach the output. | P2 |
| PRIV-002 | P3 | OPEN | high | Home/work still go to plaintext AsyncStorage (`hooks/use-nexora.ts:199-203`). | As in the AC. | P3 |
| BUG-001 | P0 | IMPLEMENTED_UNVERIFIED | med | `lib/nexora-api-core.ts` (typed errors, `warmUp` `:263-296`, `friendlyApiError` `:66-93`). `JourneyMap.tsx:86-101` (waking overlay at 8 s, fail at 60 s). Capabilities backoff in `hooks/use-nexora.ts:143-157`. Tests: `nexora-client-api.test.ts` "apiFetch timeouts (BUG-001)", "retries and capabilities", "warm-up", "map loading". `search-tate-modern.png` shows LocationIQ configured on device. | The runtime AC (45 s delayed backend: wake copy within 3 s) has not been run. Note the overlay appears at **8 s**, not the 3 s the AC asks for. | P1 |
| BUG-002 | P1 | COMPLETED_VERIFIED | high | `shared/nexora/reroute.ts:24-35`, wired at `hooks/use-nexora.ts:227-246`, reset per trip at `:535-536`. `nexora-client-reroute.test.ts` "a second reroute with nothing passed on the new route keeps only B". | The hook wiring itself has no test (it is covered under QA-002). | closed |
| BUG-003 | P1 | COMPLETED_VERIFIED | high | `shared/nexora/guidance.ts:115-143,267-268`. `nexora-guidance.test.ts` "does not arrive on the first fix at home", "stays on route through the loop and arrives back at home". | Road validation is under QA-004. | closed |
| BUG-004 | P1 | COMPLETED_VERIFIED | high | `server/nexora/route-mapper.ts:32-60`. `nexora-route-mapper.test.ts` "OSRM type × modifier table", "never produces 'Turn uturn'…", "uses the road ref when the name is empty". `nexora-guidance.test.ts` "announces the U-turn". | None (see the "Head left" observation). | closed |
| BUG-005 | P1 | COMPLETED_VERIFIED | high | `shared/nexora/maneuver.ts`, used at `NexoraApp.tsx:458`. `nexora-route-mapper.test.ts` "maneuverIcon" (5 tests). Runtime: `guidance-arrow.png` (left arrow) and `back-key-end-guidance.png` (up arrow for "Continue"). | Fork and merge icons are not distinct from slight turns. Fine against the AC wording; check if wanted. | closed |
| BUG-006 | P1 | IMPLEMENTED_UNVERIFIED | med | Generation guard, abort and 12 s timeout in `hooks/use-nexora.ts:158-164,427-459`. Results kept and labelled at `Panels.tsx:443-445`. The timeout is tested generically ("rejects with a typed timeout"). | **No test** that an older response never overwrites a newer one (audit §7 test 5). Add a hook or controller test. The timeout is 12 s, not about 10 s (minor). | P2 |
| BUG-007 | P1 | IMPLEMENTED_UNVERIFIED | med | `REROUTE_TIMEOUT_MS=10s` (`nexora-api-core.ts:46`) passed at `use-nexora.ts:242`. `judgeRerouteCandidate` (`reroute.ts:37-69`) used at `hooks/use-live-guidance.ts:171-186`. `nexora-client-reroute.test.ts` "applies the candidate even if the driver has stopped…". | "Retries" is implicit (the next confirmed off-route sample after the request gap) and untested. Hook not tested. Needs a GPX or device run. | P2 |
| BUG-008 | P1 | IMPLEMENTED_UNVERIFIED | med | `NexoraApp.tsx:197-203` plus `screen-logic.ts:38-60`. `nexora-screens.test.ts` "Android back button (BUG-008)" (5 tests). Runtime: `back-key-end-guidance.png` shows the "End guidance?" sheet with Keep going. | No emulator evidence that back closes a sheet when not in guidance, or exits from idle. | P2 |
| BUG-009 | P1 | IMPLEMENTED_UNVERIFIED | med | `NexoraApp.tsx:111-126`, `screen-logic.ts:62-88`. `nexora-screens.test.ts` "opens onboarding once…", "names the demo origin plainly". | Fresh-install check on the emulator (clear data: onboarding once, Use my location). | P2 |
| GEO-001 | P2 | OPEN | high | PR #4 says it was not attempted. There is no speed×dt bound in `guidance.ts`. | As in the AC. | P2 |
| GEO-002 | P2 | OPEN | high | `lib/offline-pack.ts:95-101` still deletes the manifest and each file *before* downloading. Only size and magic checks (`:107-120`). No sha256. | Download to temp, verify sha256, then swap. | P2 |
| GEO-003 | P2 | OPEN | high | `map-document.ts:11` still uses `tile.openstreetmap.org`. | Required before wider beta. | P2 |
| GEO-004 | P2 | OPEN | high | `routes.ts:26` still has `.max(5)`, and the error copy at `:146` says "five". Capabilities say 3 (`:110`). `MAX_INTERMEDIATE_STOPS=3` (`shared/nexora/itinerary.ts:8`). | One-line fix plus a test. | P2 |
| GEO-005 | P2 | COMPLETED_VERIFIED | high | `shared/nexora/provider.ts:40-51`. `nexora-provider.test.ts` blank/null `it.each` (`:79`), "still accepts a genuine zero coordinate". | None. | closed |
| GEO-006 | P3 | OPEN | high | `shared/nexora/traffic.ts` is unchanged. | As in the AC. | P3 |
| PERF-001 | P2 | OPEN | high | The whole `data` is still `JSON.stringify`d into `injectJavaScript` on every change (`JourneyMap.tsx:206-208`). | As in the AC. | P2 |
| PERF-002 | P2 | COMPLETED_VERIFIED | med | `hooks/use-nexora.ts:889-892`: `useMemo`, built only while the export panel is open. A static criterion, so verified by reading the code. | None. | closed |
| PERF-003 | P2 | OPEN | high | `server/nexora/offline.ts` is unchanged. | As in the AC (merge with FEAT-006). | P3 |
| DEBT-001 | P2 | PARTIAL | high | All the server modules (llm, imageGeneration, voiceTranscription, dataApi, heartbeat, storage) were deleted in #5, and CI is green. | `components/hello-wave.tsx` and `components/parallax-scroll-view.tsx` remain and nothing imports them. Remove them with the other template files. | P3 |
| DEBT-002 | P2 | PARTIAL | high | `lib/nexora-api.ts` and `lib/nexora-api-core.ts` now own routes, search and capabilities with a shared timeout and abort. | No zod parsing of responses (`api.json<T>` casts at `nexora-api-core.ts:221`). `hooks/use-traffic.ts:46`, `hooks/use-offline-regions.ts:103` and `lib/offline-pack.ts:68` still call raw `fetch`. tRPC, superjson and react-query are still mounted (`app/_layout.tsx:20,67,85`) and are dependencies (`package.json:28-31,67`). | P2 |
| DEBT-003 | P2 | OPEN (grew) | high | `NexoraApp.tsx` is 1717 lines and `Panels.tsx` 1941 (both were around 1459/1736), and `use-nexora.ts` is 1035 (was 967). Some pure logic moved to `screen-logic.ts`. | As in the AC. | P2 |
| DEBT-004 | P2 | COMPLETED_VERIFIED | high | `git ls-files dist-web` is empty. `.gitignore:76-81` has an explicit `!london` negation. `release-config.test.ts` "ignores dist-web and new offline packs but keeps the London pack". | External hosting is FEAT-006. | closed |
| DEBT-005 | P2 | OPEN | high | `app.config.ts:9,27,36` still has the `space.manus…` bundle id, `manus…` scheme and manuscdn icon. `package.json:2` is `app-template`. `lib/_core/manus-runtime.ts` exists. 29 grep hits for "manus" in source. | Owner decision on applicationId (it changes the install identity). | P2 |
| DEBT-006 | P3 | OPEN | high | `defaultPrefs.dark=false` (`hooks/use-nexora.ts:78`), so the app ignores the system theme. Inline hex is still everywhere. | As in the AC. | P3 |
| DEBT-007 | P3 | OPEN | high | `any` remains: `JourneyMap.tsx` `handle(message:any)`, `route-mapper.ts` `instruction(step:any…)`, `use-nexora.ts:139,743`. | As in the AC. | P3 |
| QA-001 | P1 | PARTIAL | high | `.github/workflows/ci.yml` runs install, check, lint, test and build. `release-config.test.ts` "QA-001 CI workflow". CI runs are green on every PR and merge. | **`main` is not branch-protected**, so a red test does not block merge. Render still auto-deploys every push (`render.yaml`, no gate). Owner settings remain. | P1 |
| QA-002 | P1 | PARTIAL | high | Audit §7 tests 2 (`nexora-client-reroute.test.ts`), 3 (`nexora-guidance.test.ts` BUG-003 block) and 4 (`nexora-route-mapper.test.ts` table) exist. | Test 1 (live-guidance GPX replay through the controller) and test 5 (stale search) are missing. Still no test imports `use-live-guidance`, `use-nexora`, `use-offline-regions`, `lib/offline-pack` or `car-displays`. | P1 |
| QA-003 | P1 | PARTIAL | high | `server-routes.test.ts` covers "GET /api/nexora/search → 200" and "capabilities → 200 and reports search configured". | Missing: search 400/404-empty/429/5xx/malformed, key never echoed, 16th request 429, capabilities snapshot. | P1 |
| QA-004 | P0 | OPEN | high | `docs/DEVICE_TEST_PLAN.md` is unchanged since 7d4215a. The only new runtime evidence is emulator screenshots (no LG result rows, no DHU run). | Run LG-2/6/8/9/10 and DHU on the e2bd944 APK, and record build id and SHA. | P0 |
| QA-005 | P3 | OPEN | med | New tests use `vi.stubEnv`, but `process.env` is still assigned by hand (`tests/nexora-itinerary.test.ts:366,373,387`, `nexora-offline.test.ts:119`, `nexora-traffic.test.ts:233,272`, `cors.test.ts:150`). The limiter and queue are still module state (`routes.ts:52-99`). | As in the AC. | P3 |
| OPS-001 | P2 | OPEN | high | `render.yaml:15` health check is still `/api/nexora/capabilities`. Capabilities still say `navigation: "simulation only"` and `liveIncidents: false` (`routes.ts:129,133`), although TfL disruptions and live GPS ship. | As in the AC. | P2 |
| OPS-002 | P1 | PARTIAL | high | Root `ErrorBoundary` (`components/nexora/ErrorBoundary.tsx`, `app/_layout.tsx:84`). `nexora-screens.test.ts` "captures a short message and clears on retry" (pure state only). | `server/_core/index.ts:15-17` still swallows the start failure: no error logged, no `process.exit(1)`, and `server.on('error')` (EADDRINUSE) is unhandled. Nothing renders the boundary in a test. | P2 |
| OPS-003 | P1 | COMPLETED_VERIFIED | med | `eas.json:4-21` (base env URL, preview, `autoIncrement`) and `docs/RELEASE.md`. `release-config.test.ts` "OPS-003 EAS release profiles" (3 tests). | The PR left "version code increments" unchecked; confirm it on the next EAS build. `app.config.ts:62` still falls back to prod for local runs (documented). | closed |
| OPS-004 | P3 | COMPLETED_VERIFIED | high | `.nvmrc`=22, `package.json:6-8`, `eas.json:5`, `render.yaml:19-20`. `release-config.test.ts` "pins Node 22…". | None. | closed |
| DOC-001 | P2 | COMPLETED_VERIFIED | high | `README.md:53-63` (Render, EAS). Remaining "manus" mentions are historical only (`README.md:69`, `docs/SETUP.md:36`, `docs/HANDOVER.md:7,23+`). | None. | closed |
| DOC-002 | P3 | OPEN | high | `docs/test-output*.txt`, `lint-output*.txt` and others are still at the top of `docs/`. | As in the AC (CI logs now exist and can replace them). | P3 |
| UX-001 | P2 | OPEN | high | Runtime confirms it: in `guidance-arrow.png` and `back-key-end-guidance.png` the Leaflet + TfL attribution is a 3-line band across mid-map. `map-document.ts:2,9,15` is unchanged. | As in the AC. Note that the TfL attribution makes it longer. | P1 (raised from P2: confirmed on emulator, now longer) |
| UX-002 | P2 | OPEN | high | `NexoraApp.tsx:1258` "Scheduled and multi-stop trips are planned for beta" contradicts the shipped multi-stop feature. OSRM jargon at `Panels.tsx:994,1270`. | As in the AC. | P2 |
| UX-003 | P1 | IMPLEMENTED_UNVERIFIED | med | `live-ack.ts`, `screen-logic.ts:89`, ack sheet at `Panels.tsx:620`. `nexora-screens.test.ts` "is asked on first use and again after an app update". | Needs device. The version key is `expoConfig.version` (static "1.0.0", `app.config.ts:77`); `autoIncrement` bumps only versionCode, so the ack will not re-ask after an update unless `version` is bumped by hand. `route-tfl-disruptions.png` still shows "Start live GPS guidance" as the main CTA in the routes sheet (allowed by the AC). | P2 |
| UX-004 | P2 | OPEN | high | Inject buttons are visible in the release APK (`guidance-arrow.png`: ETA jitter / GPS loss / Offline / Closure / Recover; `NexoraApp.tsx:687-696`). `app/dev/theme-lab.tsx` is still routable. "Approve test fixture" is at `Panels.tsx:1666`. | Pair with FEAT-005. | P2 |
| UX-005 | P2 | PARTIAL | high | Delete-data confirm exists (`Panels.tsx:1405-1420`). The back key confirms end-of-guidance (`NexoraApp.tsx:905-942`). | The guidance **X button ends with no confirm** (`NexoraApp.tsx:664-672`, `onPress={n.end}`). Offline-region delete has no confirm (`Panels.tsx:287-292`) and is not a destructive variant (`offline-installed.png`). | P2 |
| UX-006 | P3 | OPEN | high | `back-key-end-guidance.png` shows a "— mph / Limit unknown" tile in simulation. | As in the AC. | P3 |
| UX-007 | P3 | OPEN | high | A decorative drag handle is still drawn (`search-tate-modern.png`). The sheet is static. | As in the AC. | P3 |
| UX-008 | P3 | OPEN | high | `defaultPrefs.reducedMotion=false` (`use-nexora.ts:80`); it does not read the OS setting. | As in the AC. | P3 |
| A11Y-001 | P1 | IMPLEMENTED_UNVERIFIED | med | `NexoraApp.tsx:206-224` (announce once when muted), event banner `:478-479` (alert, assertive). `nexora-screens.test.ts` "announces each new step once and stays quiet when voice is on". | TalkBack run on device. | P2 |
| A11Y-002 | P2 | OPEN | med | Not in PR #7 scope. Some `accessibilityState` existed or exists (`Panels.tsx:340,820,925`, `NexoraApp.tsx:861`). No Scanner run. | Run Accessibility Scanner and fill the gaps. | P2 |
| A11Y-003 | P1 | IMPLEMENTED_UNVERIFIED | med | Flagged tokens fixed. `nexora-screens.test.ts` "colour contrast (A11Y-003)" and "flagged colours are gone…". | Only the flagged pairs were computed. The AC covers *all* text and UI pairs in both themes, and dozens of inline hex values were never audited. Needs a full token sweep or a Scanner run. | P2 |
| A11Y-004 | P2 | PARTIAL | high | Safety label is now 11 px. | 9 to 10 px text remains: `NexoraApp.tsx:1005,1452,1531(9px),1568,1569(9px),1602,1666,1679`, `Panels.tsx:1770,1862`. Large-font overlap not checked. | P2 |
| A11Y-005 | P3 | OPEN | med | Not addressed (PR #7 lists it as stretch, not done). | Scanner run. | P3 |
| I18N-001 | P3 | OPEN | high | Strings are inline. en-GB/GMT are hard-coded (see screenshots). | As in the AC. | P3 |
| DEBT-008 | P3 | COMPLETED_VERIFIED | high | Unused dependency removed. CI run 46054949938 lint step prints no ESLint problems. | Optional: add `--max-warnings 0` (PR #3 deferred it). | closed |
| FEAT-001 | P1 | IMPLEMENTED_UNVERIFIED | med | `components/nexora/StepList.tsx`, used at `Panels.tsx:1148` and `NexoraApp.tsx:676`. `nexora-screens.test.ts` "step list (FEAT-001)" (3 tests). `route-tfl-disruptions.png` shows "View 13 steps as a list". | TalkBack journey without the map, on device. | P2 |
| FEAT-002 | P2 | OPEN | high | The icon part is done by BUG-005 (`maneuver.ts`). No lane parsing from `intersections` in `route-mapper.ts`. | Lanes. | P3 |
| FEAT-003 | P2 | OPEN | high | No recents. | As in the AC. | P2 |
| FEAT-004 | P2 | OPEN | high | `autocomplete:false` (`routes.ts:125,127`). | Needs the LocationIQ terms check first. | P3 |
| FEAT-005 | P2 | OPEN | high | No developer-mode flag. | As in the AC (unblocks UX-004). | P2 |
| FEAT-006 | P2 | OPEN | high | The pack is still in git. No sha256 check on device or on Render. | As in the AC. | P2 |
| FEAT-007 | P2 | OPEN | high | `backgroundGPS:false`. No foreground service. | Blocked by device gates. | P2 |
| FEAT-008 | P3 | OPEN | high | Public OSRM still used (`routes.ts:41-51`). | As in the AC. | P3 |

## 6. Notable reconciliation findings

1. **CI runs but gates nothing.** Every PR and `main` push since PR #3 ran green. (PR #6 and PR #7 said Actions was not running; the run history shows it was.) `main` has no branch protection and Render deploys every push, so a red test would still ship (QA-001 PARTIAL).
2. **The server abuse surface is untouched.** SEC-005, SEC-006, the queue half of SEC-007, SEC-008, OPS-001 and GEO-004 sit in files identical to `7d4215a`.
3. **SEC-002 covers only the server.** The client still registers `app/oauth/callback.tsx` (reachable by deep link) and mounts the tRPC client.
4. **Two PR #7 claims fall short in code.** The live-start acknowledgement is keyed to a `version` fixed at `1.0.0` (UX-003), and the guidance X button ends guidance with no confirmation (UX-005).
5. **Fixes confirmed at runtime.** BUG-005 (correct turn arrows) and BUG-008 (back key shows "End guidance?") are visible in the e2bd944 screenshots.

## 7. Newly unlocked opportunities

- With the Manus stack gone the API is anonymous and small (45.7 kB server bundle), so hardening it (SEC-005, SEC-006, SEC-007, SEC-008, SEC-011) is cheap and self-contained.
- The typed client in `lib/nexora-api-core.ts` gives one place for response validation (DEBT-002), wake-on-resume (BUG-013) and POST search (PRIV-003).
- `shared/nexora/maneuver.ts` plus the OSRM `modifier`, `exit` and `ref` fields make BUG-012 a one-place fix and unlock FEAT-002 lane hints.
- CI exists, so each new workstream gets automatic checks as soon as branch protection is switched on.

## 8. Unavailable historical evidence

- Neither audit has measured performance baselines (bundle size, render cost, cold-start time), so no before/after performance claims are made.
- The previous audit did not inspect the PC working copy or `wip/local-snap`; this audit read that branch with `git show` only.
- Render dashboard settings and logs are not visible from the repo.
