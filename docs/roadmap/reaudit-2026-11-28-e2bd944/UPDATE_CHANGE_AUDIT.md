# NEXORA Maps: Update Change Audit (7d4215a → e2bd944)

Audit date 28 Nov 2026 · Back to [MASTER_ROADMAP.md](MASTER_ROADMAP.md) · Item outcomes: [ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md)

## 1. Snapshot and baseline selection

| | Value |
|---|---|
| Repository root | `C:\Users\andre\Documents\NEXORA-Maps` (Git root confirmed with `git rev-parse --show-toplevel`) |
| Branch / HEAD | `main` @ `e2bd944` ("Merge pull request #8", 27 Nov 2026 19:11 UTC), even with `origin/main` |
| Staged / unstaged tracked changes | None (`git diff --stat`, `git diff --cached --stat` empty) |
| Untracked | `docs/screenshots/apk-e2bd944-2026-11-28/` (5 emulator PNGs of the e2bd944 APK). Viewed as evidence, not modified |
| Other local work | Branch `wip/local-snap` (tip `9891fcc`, unpushed): one WIP commit adding `server/nexora/snap.ts` and a test. Read with `git show`; it appears superseded by `server/nexora/bike-snap.ts` on `main` (DEBT-009). Left alone |
| Tags / releases | None |
| Baseline | `7d4215a`, the commit the previous audit names. That audit ran on a fresh, clean cloud clone, so no dirty-tree state is missing. `7d4215a` exists locally and is an ancestor of HEAD |
| Comparison confidence | **High** |

Commands used (read-only): `git status --short --branch`, `git log --graph`, `git diff --stat 7d4215a e2bd944`, targeted `git diff 7d4215a e2bd944 -- <path>`, `git show <ref>:<path>`, `gh pr view`, `gh run list`, `gh api .../branches/main/protection`. No fetch, checkout, stash or index change.

**Limitation:** the screenshots are outside Git, so the SHA alone does not reproduce every input to this audit.

## 2. Change inventory

85 files changed: 17 added, 37 deleted, 31 modified (+4,227 / −8,289 lines). About 5,000 of the deleted lines are generated `dist-web/` output and the Manus server stack.

| Area | What changed | PR |
|---|---|---|
| CI and release | New `.github/workflows/ci.yml` (install, typecheck, lint, test, build); `.nvmrc` 22; `engines`; EAS `base`/`preview` profiles and `autoIncrement`; `docs/RELEASE.md` | #3 |
| Privacy config | `expo-audio`, `expo-video`, `expo-image` removed; `RECORD_AUDIO` blocked | #3 |
| Repo hygiene | `dist-web/` untracked and ignored; offline-pack ignore rule made explicit; README, HANDOVER, SETUP updated | #3 |
| Server surface | Deleted OAuth, JWT SDK, cookies, storage proxy, tRPC, LLM, image, voice, data API, heartbeat, `db.ts`, `drizzle/`. JSON body limit 50 MB → 16 kB, urlencoded parser removed. Bundle 67.9 kB → 45.7 kB (this audit's build) | #5, #8 |
| Dependencies | `jose`, `mysql2`, `drizzle-orm`, `drizzle-kit`, `cookie`, `@types/cookie`, `axios` removed; lockfile removals only | #8 |
| Guidance text and icons | OSRM `modifier`, `exit`, `ref` copied to `Step`; U-turn, fork, roundabout wording; new `shared/nexora/maneuver.ts`; round-trip arrival rule; geocoder rejects blank lat/lon | #4 |
| Client networking | New `lib/nexora-api-core.ts` and `lib/nexora-api.ts`: timeouts, typed errors, `warmUp()` with server state, capabilities backoff, 60 s map wait; reroute visited-stop offset (`shared/nexora/reroute.ts`); reroute timeout; search abort and stale guard; narrower WebView whitelist | #6 |
| Screens and accessibility | Android back handler, first-run sheet, live-start acknowledgement, text step list, live regions, contrast tokens, root ErrorBoundary, server-wake banner | #7 |
| Tests | 14 → 19 files; 366 → 475 cases. New: `release-config`, `server-routes`, `nexora-route-mapper`, `nexora-client-api`, `nexora-client-reroute`, `nexora-screens`. Removed: `auth.logout` (skipped suite for deleted code). `security-admin-account` rewritten for the smaller surface | #3 to #7 |
| Not changed | `docs/FEATURE_MANIFEST.json`, `docs/DEVICE_TEST_PLAN.md`, `server/nexora/{routes,map-document,offline}.ts`, `server/_core/index.ts`, `lib/offline-pack.ts`, `shared/nexora/{traffic,itinerary}.ts`, `hooks/use-{offline-regions,traffic}.ts` | |

## 3. Before/after capability matrix

| Capability | At 7d4215a | At e2bd944 | Verified how |
|---|---|---|---|
| Map, search, routing, multi-stop, traffic, offline map | IMPLEMENTED | Unchanged | Screenshots show search, route with TfL disruptions, offline installed |
| First launch after the API slept | Map failed at 10 s; search could stay "setup required" | IMPLEMENTED_UNVERIFIED: waits up to 60 s with a waking overlay and banner | Unit tests only; no timed cold start recorded |
| Turn instructions and icons | Right arrow for every non-left turn; silent U-turns | Correct per modifier; U-turns spoken | Unit table tests plus `guidance-arrow.png`. New defect: depart steps say "Head left" with a turn arrow (BUG-012) |
| Turn banner semantics | Simulation banner showed the step being driven | Unchanged; StepList and announcements now inherit it (BUG-011) | Screenshots, probe |
| Car display / lock screen next turn | Shows the step after the given step | Unchanged; wrong in live mode (BUG-010) | Pure-function probe |
| Multi-stop reroute | Second reroute re-added visited stops | Fixed | `nexora-client-reroute.test.ts` |
| Android back key | Exited the app | Closes sheets; "End guidance?" during guidance | `back-key-end-guidance.png`; other states not yet run |
| Onboarding | Never shown | Shown once after data loads | Unit tests; fresh install not yet run |
| Live GPS start | Primary button, no acknowledgement | One-time acknowledgement per app version | Unit tests; version key never changes (UX-003) |
| Screen-reader guidance | Not announced | Announced, but on every tick (A11Y-006) | Probe |
| Crash recovery | None | Root ErrorBoundary | State unit test only |
| Accounts, storage, tRPC on the API | Live, unused | Removed (404) | `server-routes.test.ts` |
| Client OAuth / tRPC code | Present | Still present and reachable by deep link (SEC-002 client half) | Static |
| CI | None | Runs on every PR and push, green; not a required check | `gh run list`, branch protection 404 |

## 4. Change-impact ledger

| ChangeID | Category | Baseline evidence | Current evidence | Affected workflow / modules | Status | Regression risk | Validation coverage | Outstanding action | Linked IDs | Conf |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-01 | CI / release | No `.github/` | `ci.yml`, `eas.json`, `.nvmrc`, `release-config.test.ts` | Every merge and build | Done | Low | CI runs green | Make `verify` required; gate Render on CI | QA-001 | high |
| CH-02 | Privacy config | Audio/video plugins, mic permission | `app.config.ts:106` blocked permission | Android manifest | Done in config | Low | Unit test of config; APK manifest not dumped | `aapt dump permissions` on APK | PRIV-001 | med |
| CH-03 | Server surface removal | OAuth/JWT/storage/tRPC routes live | `server/_core/app.ts:18-33`; `server-routes.test.ts` | Public API | Done (server) | Low | 404 tests for every removed path; route inventory | Client half; owner deletes env vars | SEC-002, SEC-013 | high |
| CH-04 | Body limit | 50 MB | 16 kB (`app.ts:8,22`) | POST routes | Done | Low (16 kB fits 3 stops) | 413 test | JSON error shape | SEC-007, OPS-006 | high |
| CH-05 | Dependency removal | 7 server deps | Removed; lockfile removals only | Install, build | Done | Low | CI build and tests | None | DEBT-001 | high |
| CH-06 | Guidance text/icon | `instruction()` without modifier; icon by word "left" | `route-mapper.ts:32-60`, `maneuver.ts` | Banner, voice, car | Done, one new defect | **Medium** (depart) | Table tests (lock in depart wording) | Fix depart | BUG-004, BUG-005, BUG-012 | high |
| CH-07 | Round-trip arrival | Arrived on first fix | `guidance.ts:115-143,267-268` | Live arrival | Done | Low | Loop and U-route tests | Device LG rows | BUG-003, QA-004 | high |
| CH-08 | API client and cold start | 10 s map timeout; raw errors | `nexora-api-core.ts`, `JourneyMap.tsx:86-101` | Launch, search, routes | Implemented | **Medium** (state can stick, BUG-013) | Strong injected-clock unit tests | Device cold-start run; AppState | BUG-001, BUG-013, UX-009 | med |
| CH-09 | Reroute offset and timeout | Visited stops re-added; no timeout | `reroute.ts`, `use-nexora.ts:227-246` | Live multi-stop | Implemented | Low | Pure tests; hook wiring untested | GPX replay | BUG-002, BUG-007, QA-002 | med |
| CH-10 | Search abort / stale guard | None | `use-nexora.ts:158-164,427-459`; `Panels.tsx:443-445` | Search | Implemented | Low | Timeout test only | Stale-response test | BUG-006 | med |
| CH-11 | Back handler | None | `NexoraApp.tsx:197-203`, `screen-logic.ts:38-60` | All sheets, guidance | Implemented | Low | Pure tests + 1 screenshot | Other states on emulator | BUG-008 | med |
| CH-12 | Onboarding, live ack | Flag never read; no ack | `NexoraApp.tsx:111-126`, `live-ack.ts` | First run, live start | Implemented | Low | Pure tests | Fresh install; version key | BUG-009, UX-003 | med |
| CH-13 | Step list and announcements | None | `StepList.tsx`, `NexoraApp.tsx:206-224` | Screen readers | Implemented, two defects | **Medium** | Pure tests miss the defects | Fix BUG-011, A11Y-006; TalkBack run | FEAT-001, A11Y-001, A11Y-006, BUG-011 | high |
| CH-14 | Server-wake banner | None | `NexoraApp.tsx:333-372` (commit 8ba0164) | Cold start UX | Implemented, hidden under sheets | Medium | None | Move into sheets | UX-009 | med |
| CH-15 | ErrorBoundary | None | `ErrorBoundary.tsx`, `app/_layout.tsx:84` | Crash recovery | Implemented | Low | State test only | Car/lock idle on crash | OPS-002, BUG-014 | med |
| CH-16 | dist-web untracked | 3.7 MB committed | Ignored | Repo size | Done | None | `release-config.test.ts` | None | DEBT-004 | high |

## 5. Regressions

- **Verified regressions: 0.** No previously working, evidenced behaviour was shown to fail now.
- **Suspected regressions / defects introduced or exposed by the update (6):**
  - A11Y-006 (introduced by PR #7): announcements fire on every tick.
  - UX-009 (introduced by PR #7, 8ba0164): wake banner hidden under sheets.
  - BUG-013 (introduced by PR #6): server state can stick on "waking".
  - BUG-012 (made worse by PR #4): depart steps now get a turn arrow and a car turn direction.
  - BUG-014 (exposed by PR #7): car and lock-screen state stays active after a caught crash. SUSPECTED.
  - UX-003 remainder (PR #7): the acknowledgement will not re-ask after an update.
- **Pre-existing defects newly found (not regressions):** BUG-010 (car next turn in live mode), BUG-011 (simulation banner semantics), UX-010 (notification prompt during guidance), BUG-015 (stale TfL snapshot), SEC-011 (geocoder quota).

## 6. Targeted regression matrix

R = run by this audit; S = static review only; O = owner/emulator task (exact steps in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#5-testing-matrix)).

| # | Scenario | Modules | Type | Result |
|---|---|---|---|---|
| 1 | Full unit suite | all | R | PASS, 475/475 |
| 2 | Typecheck | all | R | PASS |
| 3 | Server bundle builds | `server/` | R | PASS, 45.7 kB |
| 4 | Removed Manus routes return 404 with no cookie | `server/_core/app.ts` | R (in suite) | PASS |
| 5 | Live vs simulation car next-turn equality | `car-guidance.ts`, `session.ts`, `guidance.ts` | R (probe by reviewer) | **FAIL** → BUG-010 |
| 6 | Announcement count per step with distance ticking | `NexoraApp.tsx`, `screen-logic.ts` | R (probe by reviewer) | **FAIL** → A11Y-006 |
| 7 | Cold launch after Render sleeps 20+ min | `nexora-api-core.ts`, `JourneyMap.tsx` | O | Not run |
| 8 | App backgrounded 20 min, then search | `nexora-api-core.ts` | S | Fails once by design → BUG-013 |
| 9 | Back key in each state (sheet, routes-from-place, guidance, arrival, Settings, idle) | `NexoraApp.tsx` | O | Guidance state seen in screenshot; rest not run |
| 10 | Fresh install: onboarding once, location prompt | `NexoraApp.tsx` | O | Not run |
| 11 | Existing install keeps saved places (key `nexora-local-guest-v1` unchanged) | `use-nexora.ts` | S | OK |
| 12 | Live start ack after version bump | `live-ack.ts` | S | Will not re-ask (UX-003) |
| 13 | Multi-stop GPX detour, two reroutes | `reroute.ts`, `use-live-guidance.ts` | O | Not run |
| 14 | TalkBack with voice muted through a trip | `NexoraApp.tsx`, `StepList.tsx` | O | Not run (expect A11Y-006) |
| 15 | Rapid search typing and query change | `use-nexora.ts` | S | Guard looks correct; no test |
| 16 | Wake banner visible while search sheet open | `NexoraApp.tsx` | S | Hidden → UX-009 |
| 17 | Crash during guidance clears lock-screen card | `use-nexora.ts`, `ErrorBoundary.tsx` | S | Likely not → BUG-014 |
| 18 | Offline pack path after WebView whitelist change | `JourneyMap.tsx` | Screenshot | OK (`offline-installed.png`) |
| 19 | TfL disruptions on route preview | traffic | Screenshot | OK (`route-tfl-disruptions.png`) |
| 20 | Throttle behind Render proxy | `routes.ts` | S | One shared bucket (SEC-005) |

## 7. Test outcomes

| Check | Command | Ran | Outcome |
|---|---|---|---|
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit` | yes | PASS (exit 0) |
| Unit tests | `node node_modules/vitest/vitest.mjs run` | yes | PASS: 19 files, 475 tests (exit 0). No test calls the live network (providers mocked) |
| Server build | `esbuild server/_core/index.ts … --outdir=<scratchpad>` | yes | PASS, 45.7 kB; output outside the repo |
| Lint (`pnpm lint`) | `expo lint` | blocked | pnpm is not on PATH on this PC (OPS-008). CI's lint step on `e2bd944` passed with no problems reported |
| CI history | `gh run list` | yes | All recent runs green |
| Branch protection | `gh api repos/…/branches/main/protection` | yes | 404, not protected |
| Device / emulator / DHU | — | no | Not run by the auditor (no approval for builds; screenshots reviewed instead) |

**Test quality.** `nexora-client-api` and `nexora-client-reroute` are good behavioural tests with injected fetch and clocks. `nexora-route-mapper` is a strong table test but locks in BUG-012. `nexora-screens` tests pure helpers; lines 255-269 only assert source text. `nexora-car-guidance.test.ts:157` is labelled live but uses simulation semantics, which hides BUG-010. `server-routes.test.ts:46` answers any unknown URL with the OSRM fixture. Hooks and components remain untested (QA-002). See QA-006.

## 8. Migration and compatibility risks

- **Persisted data:** the guest store key is unchanged and new prefs merge over defaults, so existing installs keep their data and see onboarding once (intended).
- **Old APKs against the new API:** removed routes now 404. The shipped app never called them; the deep-link OAuth screen would show an error.
- **Render blueprint:** `NODE_ENV=production` at install time may skip devDependencies, including esbuild (OPS-005, suspected). Check the current build log before the next blueprint sync.
- **Env vars:** `JWT_SECRET`, `DATABASE_URL`, `OAUTH_SERVER_URL` and the `MANUS_*` names are no longer read and can be deleted (SEC-013).

## 9. Remaining validation work

Batch these on the next combined APK (one emulator session): BUG-001, BUG-007, BUG-008, BUG-009, A11Y-001, FEAT-001, PRIV-001, UX-003, then the device gates QA-004 after BUG-010 and BUG-011 are fixed. Owner-only checks: QA-001 settings, OPS-005 build log, SEC-013 dashboards.
