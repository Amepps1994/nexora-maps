# NEXORA Maps: Master Roadmap (V2 re-audit)

Audit date 28 November 2026 · Current: `main` @ `e2bd944` · Baseline: `7d4215a` (previous audit, high confidence) · Mode: read-only (only this directory was written)

Companion documents:
- [UPDATE_CHANGE_AUDIT.md](UPDATE_CHANGE_AUDIT.md): what changed since the last audit, change-impact ledger, regression matrix
- [ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md): outcome for each of the 70 prior items
- [TECHNICAL_AUDIT.md](TECHNICAL_AUDIT.md): method, inventory, validation ledger, the 23 new findings, security review, test gaps
- [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md): feature assessment and deferred ideas
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): workstreams, task packets, testing matrix, gates, prompt template
- [NEXT_SPRINT.md](NEXT_SPRINT.md): standalone sprint brief
- [PRIORITISED_BACKLOG.csv](PRIORITISED_BACKLOG.csv): 78 active items · [AUDIT_BASELINE.json](AUDIT_BASELINE.json): metadata for the next re-audit

---

## 1. Executive summary

NEXORA Maps is a private, guest-first London journey planner and guidance preview for Android (Expo 57 / React Native 0.86), backed by a small anonymous Express API on Render's free plan. People can search places (LocationIQ), plan car, foot or bike routes with up to three stops (public OSRM), compare routes, see TfL road disruptions, use an offline London map, and run simulated or live GPS guidance with voice. Android Auto, CarPlay and a lock-screen card are wired but never run on a car head unit.

Since the last audit, six PRs (#3 to #8) merged the previous sprint's five workstreams. **The sprint landed well:** the Manus account, storage and tRPC stack is gone from the server; CI runs on every PR; guidance text, U-turns and turn arrows are fixed; the app now waits for the sleeping server; multi-stop reroutes no longer send you back; the back key, onboarding, live-start acknowledgement, text step list and ErrorBoundary exist. Tests grew from 366 to 475, all passing, typecheck clean, server build passing.

**What still matters most:**
1. **A wrong-direction defect on the car and lock-screen surfaces (BUG-010, P0).** In live GPS mode they show the manoeuvre after next. It predates the sprint and was hidden by a mislabelled test. The simulation banner has the mirror problem (BUG-011).
2. **The API abuse surface was never touched.** The rate-limit and map-document packets from the last plan were not started: one shared throttle bucket for everyone behind Render (SEC-005), an unbounded shared provider queue (SEC-007), any-origin `postMessage` with HTML tooltips (SEC-006), and now confirmed, no protection for the LocationIQ free quota (SEC-011).
3. **No device validation yet (QA-004, P0).** Several sprint items are implemented but unverified; one emulator session on the next combined APK can close most of them.
4. **CI does not gate anything.** It is green, but `main` is not protected and Render deploys every push (QA-001).

The next sprint splits into six workstreams with disjoint files (section 8), then one combined APK and a validation session.

## 2. Post-update progress and regression assessment

Counts come from the [reconciliation ledger](ROADMAP_RECONCILIATION.md) (denominator: 70 prior items).

| | Count | Notes |
|---|---|---|
| Completed and verified | 14 | SEC-003, SEC-004, SEC-009, BUG-002..005, GEO-005, PERF-002, DEBT-004, DEBT-008, OPS-003, OPS-004, DOC-001 |
| Implemented, awaiting runtime check | 10 | BUG-001, BUG-006..009, PRIV-001, UX-003, A11Y-001, A11Y-003, FEAT-001 |
| Partial | 10 | SEC-002 (client half), SEC-007 (queue), QA-001 (gate), QA-002, QA-003, OPS-002 (server), UX-005, A11Y-004, DEBT-001, DEBT-002 |
| Still open | 35 | Includes SEC-005, SEC-006, SEC-008, GEO-004, OPS-001 in files identical to `7d4215a` |
| Superseded | 1 | SEC-001 → owner task SEC-013 |
| Verified regressions | **0** | |
| Suspected regressions or defects introduced/exposed by the update | 6 | A11Y-006, UX-009, BUG-013 (introduced); BUG-012 (made worse); BUG-014 (exposed, suspected); UX-003 remainder |
| New pre-existing defects found | 5 | BUG-010, BUG-011, UX-010, BUG-015, SEC-011 |
| New findings in total | 23 | 20 verified, 2 suspected, 1 risk |

Strict completion is 14 of 70 (20 %); counting unverified implementations it is 24 of 70 (34 %). Much of what is not complete is waiting for an emulator session rather than for code.

**Invalidated recommendations:** SEC-001's code criteria (the code is gone), the Manus-specific parts of SEC-003/004, and the claim that GitHub Actions was not running (PRs #6 and #7 said so; the run history shows every run green).

**Newly unlocked:** a small anonymous API that is cheap to harden; one typed client for wake handling and validation; OSRM modifier data for lane hints (FEAT-002); CI ready to become a gate.

## 3. Current product and architecture

Architecture diagram, module map and feature status are in [TECHNICAL_AUDIT.md §2-4](TECHNICAL_AUDIT.md#3-current-architecture). In short:

| Layer | Key files | State |
|---|---|---|
| Screens | `components/nexora/NexoraApp.tsx` (1717 lines), `Panels.tsx` (1941), `StepList.tsx`, `screen-logic.ts` | Works on emulator; god files growing (DEBT-003) |
| State and guidance | `hooks/use-nexora.ts` (1035), `hooks/use-live-guidance.ts`, `shared/nexora/*` | Pure domain well tested; hooks untested (QA-002) |
| API client | `lib/nexora-api-core.ts` | New, well tested; resume handling missing (BUG-013) |
| Car surfaces | `lib/car/*`, `shared/nexora/car-guidance.ts` | Wrong next turn in live mode (BUG-010); never run on DHU |
| Server | `server/_core/app.ts` (34 lines), `server/nexora/routes.ts` | Anonymous, small; abuse controls weak |

**Maturity: private technical preview.** Planning works on the emulator (five screenshots of the e2bd944 APK). Live guidance, car output and multi-user operation are unvalidated.

**Unknowns:** Render dashboard settings and real wake time, the LocationIQ plan quota and caching terms, whether the leaked database still exists, Render's build behaviour with `NODE_ENV=production` (OPS-005), any physical-phone behaviour.

## 4. Top risks

| # | Risk | Items | Why it matters |
|---|---|---|---|
| 1 | Wrong next turn on car and lock-screen surfaces | BUG-010 | Safety-relevant once anyone drives; a test hid it |
| 2 | One client can lock out search/routing for everyone or drain the geocoder quota | SEC-005, SEC-011, SEC-007 | Shared bucket behind Render, no budget, unbounded queue |
| 3 | Road use before device validation | QA-004 | LG rows and DHU never run |
| 4 | Leaked database credential still live | SEC-013 | Independent of the app code now |
| 5 | Untested merges ship straight to production | QA-001 | Six workstreams merging in parallel again |
| 6 | Map page can be framed and fed HTML | SEC-006, SEC-008 | Low impact today (demo places), easy to fix |
| 7 | Distracting dialogs and hidden status during critical moments | UX-010, UX-009 | Notification prompt during guidance; wake banner under sheets |

## 5. Prioritisation approach

Same scheme as the previous audit and the V2 brief:
- **P0** urgent verified safety/security issue or core blocker; **P1** high-value reliability or workflow fix; **P2** worthwhile after core stability; **P3** defer pending evidence.
- **Score** = (Impact + Urgency + RiskReduction + StrategicFit) × confidence (0.5/0.75/1.0) ÷ effort weight (XS 1, S 2, M 3, L 5, XL 8). Components are in the CSV. The score sorts within a priority only; P0 and hard prerequisites override it.
- Effort is one developer who knows the stack, tests included. No user research exists; impact is the auditor's judgement against the app's purpose.

**Totals (78 active rows):** P0 2, P1 17, P2 36, P3 23. By reconciliation: 35 open, 10 partial, 10 implemented-unverified (validation only), 23 new. By evidence: 55 verified (49 static, 4 runtime, 2 screenshot), 10 implemented-unverified, 3 suspected, 3 risk, 7 proposed features. By status: 38 Ready, 9 Needs Verification, 28 Proposed, 3 Blocked.

## 6. Phased roadmap

| Phase | Objective | Items | Exit criteria | Horizon |
|---|---|---|---|---|
| **0: Blockers and validation** | Fix the wrong-direction defect, make CI a gate, clean up secrets, validate what landed | BUG-010, QA-004, QA-001, BUG-001, SEC-013, OPS-005, and the validation set BUG-007, BUG-008, BUG-009, PRIV-001, A11Y-001, FEAT-001 | No open P0; TP-9 results recorded with build id and SHA; `verify` required; DHU shows the correct next turn | Next sprint (QA-004 rows right after the combined APK) |
| **1: Correctness, abuse resistance, regression protection** | Close the carried-over server items and the new client defects, with tests | BUG-011..015, A11Y-006, UX-009, UX-010, UX-001, UX-003, UX-005, SEC-005, SEC-006, SEC-007, SEC-008, SEC-011, SEC-012, SEC-002, GEO-004, OPS-001, OPS-002, OPS-006, OPS-007, PERF-004, QA-002, QA-003, QA-006, BUG-006, DOC-003 | CI green and required; every P1 has a regression test; a second client is not throttled by the first; geocoder budget enforced | Next sprint to +2 weeks |
| **2: Foundations** | Make the code cheaper to change and measure performance | DEBT-001, DEBT-002, DEBT-003, DEBT-007, DEBT-009, GEO-001, GEO-002, GEO-007, PERF-001, QA-005, DOC-002, OPS-008 | No file over about 500 lines in `components/nexora`; all fetches through one validated client; baseline performance numbers recorded | 1-2 months |
| **3: UX and accessibility** | Clear, honest, accessible product | UX-002, UX-004 + FEAT-005, UX-006, UX-007, UX-008, UX-011, A11Y-002..005, DEBT-006, PRIV-002, PRIV-003 | TalkBack journey without the map; Accessibility Scanner clean on core screens; WCAG 2.2 AA contrast (proposed target) | 1-3 months, overlaps Phase 2 |
| **4: Capabilities** | Features on the stable base | FEAT-003, FEAT-006, FEAT-002, FEAT-004, GEO-003, GEO-006, PERF-003, DEBT-005 | Each feature meets its acceptance criteria; basemap source fits its licence before any wider beta | 3+ months |
| **5: Scale and experiments** | Needs device certainty or infrastructure | FEAT-007, FEAT-008, I18N-001, CarPlay entitlement | Physical-device drives pass; hosting decision made | Later, evidence-dependent |

Rollback for every phase: each workstream is its own PR (`git revert`); Render "Rollback to previous deploy" for the server; the previous APK stays installable (build id in `docs/RELEASE.md`).

## 7. Dependencies, critical path and release gates

Full graph in [IMPLEMENTATION_PLAN.md §1](IMPLEMENTATION_PLAN.md#1-dependency-order).

- **Critical path:** BUG-010/011 (TP-1) → merge all workstreams → combined APK → QA-004 device gates.
- **Foundational:** SEC-005 unlocks SEC-011, SEC-007 and FEAT-004. BUG-013 precedes UX-009. TP-1 precedes the TalkBack and DHU checks.
- **Safe to parallelise:** the six workstreams in section 8 touch disjoint files. Owner tasks run any time.

| Milestone | Contents | Gate (testable) |
|---|---|---|
| M0: Secrets cleaned, CI required | SEC-013, QA-001 | Retired names absent in Render and EAS; a red PR cannot merge |
| M1: Correct guidance output | BUG-010, BUG-011, BUG-012, A11Y-006 | Live and simulation snapshots match in tests; one announcement per step |
| M2: Hardened API | SEC-005, SEC-011, SEC-007, SEC-006 | Per-client 429s; budget 503 with no upstream call; foreign `postMessage` ignored |
| M3: Combined APK validated | TP-9 | Validation rows recorded; DHU next-turn check passes |
| M4: Road-use preview | QA-004 on a phone | LG-1..LG-10 pass with build id and SHA |

## 8. Next sprint: six workstreams for one combined APK

Packets TP-1 to TP-9 are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#3-engineering-task-packets); the one-developer order and fallback are in [NEXT_SPRINT.md](NEXT_SPRINT.md).

| WS | Theme | Owns | Items |
|---|---|---|---|
| **WS-A** | Guidance step semantics | `shared/nexora/{session,car-guidance,maneuver,guidance}.ts`, `server/nexora/route-mapper.ts` + their tests | BUG-010, BUG-011, BUG-012, QA-006 (car test) |
| **WS-B** | API abuse, quota and errors | `server/nexora/{routes,geocoder}.ts`, `server/_core/app.ts`, `render.yaml` + server-routes/security tests | SEC-005, SEC-011, SEC-007, GEO-004, OPS-001, OPS-005, SEC-008, OPS-006, OPS-007, QA-003, QA-006 (mocks) |
| **WS-C** | Map document, traffic, server lifecycle | `server/nexora/{map-document,traffic}.ts`, `shared/nexora/traffic.ts`, `server/_core/{index,cors}.ts` + tests | SEC-006, UX-001, BUG-015, PERF-004, OPS-002, SEC-012 |
| **WS-D** | Client networking | `lib/nexora-api{,-core}.ts`, `hooks/use-nexora.ts`, `hooks/use-traffic.ts` + client-api tests | BUG-013, BUG-014, BUG-006 test, QA-002 (controller tests) |
| **WS-E** | Screens, safety prompts, accessibility | `components/nexora/{NexoraApp,Panels,StepList}.tsx`, `screen-logic.ts`, `live-ack.ts`, `lib/car/lock-screen-guidance.ts` + screens test | A11Y-006, UX-009, UX-010, UX-005, UX-003, QA-006 (screens); stretch FEAT-005/UX-004, UX-002 |
| **WS-F** | Client Manus cleanup and docs | `app/_layout.tsx`, `app/oauth/**`, `lib/_core/**`, `lib/trpc.ts`, `hooks/use-auth.ts`, `constants/oauth.ts`, template components, `package.json`, lockfile, `app.config.ts` OAuth lines, `docs/FEATURE_MANIFEST.json`, `docs/DEVICE_TEST_PLAN.md` | SEC-002, DEBT-001, DOC-003 |

Merge order **A → B → C → D → E → F**. Only WS-F touches dependencies. After all merge: one `production-apk` EAS build (owner's typed approval), then TP-9 (validation batch and QA-004).

**Start first:** TP-1 in WS-A. It is the only verified wrong-direction defect, it is on the critical path, and it is small. **If only a no-code action is possible:** the owner switches on branch protection and deletes the retired secrets.

**Fallback if capacity is lower:** WS-A, the SEC-005/SEC-011 part of WS-B, BUG-013 from WS-D, A11Y-006 from WS-E; move the rest to the following sprint.

## 9. Decisions needed from the owner

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Merge PR #2 (previous roadmap) so both audits live on `main` | Yes (docs only) |
| D2 | Final applicationId and URL scheme (still `space.manus…`) | Decide before wider distribution |
| D3 | Accept the 8 s waking overlay instead of the original 3 s | Accept if the cold-start run looks right |
| D4 | Daily LocationIQ budget | About 90 % of the plan's daily quota |
| D5 | Delete `wip/local-snap` | Yes if nothing is missing from `bike-snap.ts` |

## 10. Recommended next action

1. Owner: require the `verify` check on `main`, set Render to deploy after checks pass, delete the retired env vars and the leaked database user, and read the latest Render build log (QA-001, SEC-013, OPS-005).
2. Start the six workstream threads (WS-A first), each with the single-task template in [IMPLEMENTATION_PLAN.md §8](IMPLEMENTATION_PLAN.md#8-reusable-single-task-prompt-template).
3. After all six merge, run one EAS `production-apk` build (owner's typed approval), then TP-9 on the emulator and the LG rows on a phone.
