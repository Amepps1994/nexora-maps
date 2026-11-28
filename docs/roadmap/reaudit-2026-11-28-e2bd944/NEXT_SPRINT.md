# NEXORA Maps: Next Sprint Brief (from the V2 re-audit)

Audit 28 Nov 2026 · `main` @ `e2bd944` · Packets: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · Evidence: [TECHNICAL_AUDIT.md](TECHNICAL_AUDIT.md)

The previous sprint (WS-1 to WS-5) is done except for the items listed here. Nothing below repeats completed work.

## 1. Release blockers

| ID | Why it blocks | Owner |
|---|---|---|
| **BUG-010** (P0) | Car display and lock-screen card show the wrong next turn during live GPS guidance | Dev (WS-A) |
| **QA-004** (P0) | No device or DHU run has ever validated live guidance or car output | Owner + emulator/phone, after the combined APK |
| QA-001 (P1) | CI is green but not required, and Render deploys every push | Owner: two settings |
| SEC-013 (P1) | The leaked database credential may still be live | Owner: dashboards |

## 2. Ordered tasks (one developer)

Assumes one developer familiar with the stack, about 10 working days, tests included. In parallel threads, use the workstream split in [IMPLEMENTATION_PLAN.md §2](IMPLEMENTATION_PLAN.md#2-parallel-workstreams-disjoint-files-for-one-combined-apk).

| # | ID(s) | Task | Effort | WS |
|---|---|---|---|---|
| 0 | QA-001, SEC-013, OPS-005 | Owner: require `verify` on `main`, gate Render on CI, delete retired env vars and the leaked DB user, read the Render build log | XS | owner |
| 1 | **BUG-010, BUG-011** | One meaning for "step" (TP-1) | S | A |
| 2 | BUG-012 | Compass heading for depart (TP-2) | XS | A |
| 3 | A11Y-006 | Announce once per step | XS | E |
| 4 | SEC-005, SEC-011 | Per-client throttle behind Render; geocoder cache and daily budget (TP-3) | S-M | B |
| 5 | SEC-007 | Bounded per-provider queues with deadlines and disconnect handling (TP-4) | S | B |
| 6 | SEC-006, UX-001 | Map document origin checks, text tooltips, compact attribution (TP-5) | S | C |
| 7 | BUG-013, UX-009 | Wake after downgrade and on resume; waking line inside sheets (TP-6, part of TP-7) | S + S | D, E |
| 8 | UX-010, UX-005, UX-003 | Notification prompt before guidance; confirm X and offline delete; ack key per release (rest of TP-7) | S | E |
| 9 | QA-003, QA-006 | HTTP tests for search errors, throttle, queue; strict mocks; fix mislabelled and source-text tests | S | B, A, E |
| 10 | GEO-004, OPS-001, OPS-002, OPS-006, BUG-015 | Quick server fixes (5 stops → 3, health path and capabilities text, start-failure exit code, JSON errors, stale TfL filter) | XS each | B, C |
| 11 | SEC-002, DEBT-001, DOC-003 | Remove client OAuth/tRPC/Manus runtime; update manifest and device plan (TP-8) | S | F |
| 12 | — | Combined `production-apk` build (owner's typed approval) | — | owner |
| 13 | **QA-004** + validation batch | TP-9: BUG-001, BUG-007, BUG-008, BUG-009, A11Y-001, FEAT-001, PRIV-001, UX-003/005/009/010, then LG rows and DHU | M | owner/emulator |

## 3. Validation-first items (no code expected)

BUG-001 (cold start), BUG-007 (GPX reroute), BUG-008 (back key in each state), BUG-009 (fresh install), A11Y-001 and FEAT-001 (TalkBack), PRIV-001 (APK manifest). Each has exact steps in TP-9. If one fails, open a bug with the recording; do not reopen the original ID.

## 4. Time-boxed investigations

| Question | Time box | Output |
|---|---|---|
| Does the Render build install devDependencies with `NODE_ENV=production`? (OPS-005) | 15 min, owner reads the latest build log | Confirm or close OPS-005 |
| Do LocationIQ's terms allow caching results, and what is the plan's daily quota? (SEC-011, D4) | 30 min | Cache TTL and budget value, or "no cache" |
| Is anything in `wip/local-snap` missing from `bike-snap.ts`? (DEBT-009) | 30 min diff | Delete or port |
| How long does Render really take to wake? (BUG-001) | One cold launch with a stopwatch | Accept the 8 s overlay or tune it (D3) |

## 5. Tests and exit gates

- Every task adds the regression tests named in its packet; CI green on each PR.
- **Sprint exit:** no open P0; BUG-010 checked on the DHU or a phone; TP-9 results recorded with build id and SHA; `verify` is a required check; `pnpm lint` has 0 warnings.
- **Not in exit:** physical-phone LG rows that need real driving can trail by a few days, but the UI must keep "unverified for road use" until they pass.

## 6. Dependency constraints

- TP-1 before TP-2 (same files) and before the TalkBack checks.
- SEC-005 before SEC-011 and SEC-007 (budget and queue rely on per-client identity).
- BUG-013 before UX-009 (the banner renders that state).
- WS-F last in the merge order (lockfile).
- The combined APK only after all merges; QA-004 only on that APK.

## 7. Fallback scope (if capacity is lower)

Keep: tasks 0, 1, 2, 3, 4, 7 (BUG-013 only), 12, 13. That covers the wrong-instruction defects, the quota and lockout risk, and device validation. Move SEC-007, SEC-006, UX-001, task 8 to 11 into the following sprint.

## 8. Recommended first task

**TP-1 (BUG-010 + BUG-011).** It is the only verified defect that gives a wrong direction, it sits on the critical path to the device gates, it is small (1-2 days) and self-contained in pure, well-tested modules, and fixing it makes the step list, announcements and car output consistent before anyone validates them. If only a no-code action is possible today, do task 0 (owner settings and secret clean-up) first.
