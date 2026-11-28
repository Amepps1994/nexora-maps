# Roadmap reconciliation: V2 (e2bd944) → V4 (05eeaca)

Denominator: the **78 rows** of `docs/roadmap/reaudit-2026-11-28-e2bd944/PRIORITISED_BACKLOG.csv`. Every row is listed once below. A PR title or commit message was never taken as proof: each "verified-fixed" was checked in code and has a passing automated test at 05eeaca (CI run 46147129938, 647/647).

## Counts

| V4 status | Meaning | Count |
|---|---|---|
| verified-fixed | Code and automated tests meet every acceptance criterion that can be checked off-device | 20 |
| implemented-unverified | Code landed; a device, TalkBack or APK check is still owed | 12 |
| partial | Some criteria met; code work remains | 8 |
| open | Not started, or still reproducible in code | 26 |
| owner-check | Needs Andrew (dashboard, secrets, decision) | 4 |
| blocked | External approval needed (FEAT-007) | 1 |
| proposal | Feature idea, unchanged | 7 |
| obsolete | No longer applicable | 0 |
| **Total** | | **78** |

No item became obsolete: the items about simulation (BUG-011, UX-006) still apply to the developer build and to live guidance respectively. Items that are complete in code but owed a device check are counted as implemented-unverified, not complete.

Priority changes: BUG-010 P0→P1 (fixed in code, device check left), GEO-003 P2→P1 (live default + tile policy), DEBT-005 P2→P1 (it absorbs V4 seed V4-REL-02), DOC-003 P2→P1 (testers follow a stale plan), BUG-009 P2→P1 (sits on the V4-POI-08 path), QA-001 P1→P2 (required check now set), the verified-fixed items moved to P3 so they sort last.

Seed IDs from the V4 prompt: V4-POI-01..07, V4-MAP-01..05, V4-REL-01 and V4-REL-03 are kept as new rows. **V4-REL-02 is not a new row**: it is the same issue as DEBT-005 and is tracked there, to avoid double counting. 10 further new rows come from this audit (V4-POI-08, V4-NAV-01, V4-REL-04, V4-PRIV-04, V4-OPS-09, V4-FEAT-01..05). Total new: 24.

## Every V2 item

| ID | V2 priority / status | V4 priority | V4 status | Evidence | What changed since e2bd944 | Still missing |
|---|---|---|---|---|---|---|
| BUG-010 | P0 / Ready | P1 | implemented-unverified | verified-static | 082e10c (#10) fixed buildCarGuidance; unit tests pass; R-11 not run | Car and lock-screen cards show the step guidanceView returns, on DHU and a phone lock screen |
| QA-004 | P0 / Ready | P0 | open | blocked | No new device evidence since e2bd944 screenshots; live GPS is now the default path | Every row in RELEASE_READINESS.md §3 has a dated result on a build whose commit is recorded |
| QA-001 | P1 / Ready | P2 | partial | verified-runtime | Required status check verify is now set on main; Render gate not verifiable from the repo | Required check verify (done); admins also bound or a recorded decision; Render auto-deploy set to after CI checks pass |
| BUG-001 | P1 / Needs Verification | P1 | implemented-unverified | verified-static | Unchanged in principle; BUG-013 work (#11) strengthened it | Fresh install with Render asleep reaches the map within 60 s and shows the waking notice |
| BUG-012 | P1 / Ready | P2 | implemented-unverified | verified-static | Fixed in 082e10c with tests | First instruction reads Head <compass> on <road> on device and in voice |
| A11Y-006 | P1 / Ready | P2 | implemented-unverified | verified-static | Fixed in e59beaf (#14) with screen-logic tests | TalkBack announces once per step on device |
| SEC-013 | P1 / Ready | P1 | owner-check | blocked | Repository cannot prove it; render.yaml comment still asks for deletion | Owner confirms each old secret rotated or deleted at its provider, with date |
| BUG-011 | P1 / Ready | P3 | verified-fixed | verified-static | Fixed in 082e10c; simulation is developer-only since ce8df0e | - |
| SEC-011 | P1 / Ready | P2 | partial | verified-static | c8ac668 added 24 h cache and 4,000/day budget; budget is per process and separate from the places fallback (see V4-POI-03) | Cache and budget exist (done); budget survives restarts or is shared per credential with places fallback |
| SEC-006 | P1 / Ready | P3 | verified-fixed | verified-static | ff78898; 3D page (bc33ded) uses the same origin rule | - |
| SEC-007 | P1 / Ready | P3 | verified-fixed | verified-static | c8ac668; places reuses ProviderQueue(…,5) | - |
| QA-003 | P1 / Ready | P3 | verified-fixed | verified-runtime | c8ac668 | - |
| BUG-013 | P1 / Ready | P2 | implemented-unverified | verified-static | 81f6501 (#11) with client tests | Resolves to ready/unreachable within 60 s on device after resume |
| SEC-005 | P1 / Ready | P2 | partial | verified-static | c8ac668 sets trust proxy from env; correct hop count is an assumption | trust proxy set (done); hop count confirmed against Render's real X-Forwarded-For chain |
| UX-010 | P1 / Ready | P3 | implemented-unverified | verified-static | e59beaf | Prompt shows before guidance starts on Android 13+ |
| UX-001 | P1 / Ready | P3 | implemented-unverified | verified-static | ff78898; 3D has the same compact credit | One collapsed credit line on phone in 2D and 3D |
| OPS-005 | P1 / Needs Verification | P3 | owner-check | verified-static | c8ac668 added --prod=false | A Render deploy of 05eeaca succeeded with this buildCommand |
| QA-002 | P1 / Ready | P1 | partial | verified-static | 81f6501 moved logic into pure controllers; hooks themselves still untested | Controllers tested (done); renderHook/component tests for live guidance GPX replay, nearby/search races, 3D toggle |
| UX-009 | P1 / Ready | P3 | implemented-unverified | verified-static | e59beaf | Notice visible inside sheets on device |
| A11Y-001 | P2 / Needs Verification | P2 | open | blocked | No device run | TalkBack walkthrough recorded |
| UX-005 | P2 / Ready | P3 | implemented-unverified | verified-static | e59beaf | End asks for confirmation on device |
| BUG-015 | P2 / Ready | P3 | verified-fixed | verified-static | ff78898 | - |
| BUG-008 | P2 / Needs Verification | P2 | open | blocked | No device run | Back order matches screen-logic on emulator |
| BUG-009 | P2 / Needs Verification | P1 | open | blocked | Raised to P1 because the cold-start nearby defect (V4-POI-08) sits on this path | Fresh install: onboarding, permission, map centres on the user, nearby uses the fix |
| OPS-002 | P2 / Ready | P3 | verified-fixed | verified-runtime | ff78898 | - |
| UX-003 | P2 / Ready | P3 | verified-fixed | verified-static | c851529 + 1.2.0 bump | - |
| PRIV-001 | P2 / Needs Verification | P2 | implemented-unverified | verified-static | Config still blocks RECORD_AUDIO; APK not inspected | aapt dump permissions on the 1.2.0 APK shows no RECORD_AUDIO |
| OPS-001 | P2 / Ready | P3 | verified-fixed | verified-static | c8ac668 | - |
| BUG-006 | P2 / Ready | P3 | verified-fixed | verified-static | 81f6501 | - |
| OPS-006 | P2 / Ready | P3 | verified-fixed | verified-static | c8ac668 | - |
| BUG-014 | P2 / Ready | P3 | implemented-unverified | verified-static | 81f6501 | Idle snapshot after crash on DHU |
| FEAT-001 | P2 / Needs Verification | P2 | open | blocked | No device run | TalkBack reads list in order |
| GEO-004 | P2 / Ready | P3 | verified-fixed | verified-static | c8ac668 | - |
| DEBT-002 | P2 / Proposed | P2 | partial | verified-static | Traffic moved to shared client in 81f6501; places reply unparsed | Traffic and offline via shared client (traffic done); places/search/routes replies schema-parsed |
| UX-002 | P2 / Ready | P2 | open | verified-static | Still present; now more wrong because live GPS is the default | No 'planned for beta' or 'simulated trip' copy for features that are live |
| UX-004 | P2 / Ready | P3 | verified-fixed | verified-static | ce8df0e | - |
| A11Y-003 | P2 / Needs Verification | P2 | open | suspected | #18 changed tokens; no sweep recorded | All text pairs >= 4.5:1 in both themes |
| QA-006 | P2 / Ready | P3 | verified-fixed | verified-static | 082e10c, c8ac668, e59beaf | - |
| SEC-008 | P2 / Ready | P3 | verified-fixed | verified-static | c8ac668, bc33ded | - |
| DEBT-005 | P2 / Blocked | P1 | owner-check | verified-static | Unchanged. V4 seed V4-REL-02 is the same item and is tracked here | Owner-approved migration plan (package id, scheme, deep links, signing, data migration); icon bundled locally |
| OPS-007 | P2 / Ready | P3 | verified-fixed | verified-static | c8ac668, 05eeaca | - |
| GEO-001 | P2 / Proposed | P2 | open | suspected | Backtrack tolerance exists; no forward bound | Forward jump bounded by speed x dt + tolerance; loop GPX passes |
| SEC-002 | P2 / Ready | P3 | verified-fixed | verified-static | c851529 | - |
| BUG-007 | P2 / Needs Verification | P2 | open | blocked | Controller tests landed; device not run | GPX detour replay on device reroutes once |
| FEAT-005 | P2 / Ready | P3 | verified-fixed | verified-static | ce8df0e | - |
| DOC-003 | P2 / Ready | P1 | partial | verified-static | c851529 refreshed it for 1.1.0; now stale again (1.1.0 'not built', LG-2 'simulation still offered') | Plan names 1.2.0 build 5, live-by-default expectations, LG-2 without simulation fallback, 3D/nearby rows |
| GEO-002 | P2 / Proposed | P2 | open | verified-static | No sha256 code in lib/offline-pack.ts | Downloaded pack hashed and compared before swap; old pack kept until new one verifies |
| PERF-001 | P2 / Proposed | P2 | open | verified-static | Unchanged; 3D adds heading calc each render | Diffed messages; measured update cost < budget on mid-range phone |
| A11Y-002 | P2 / Proposed | P2 | partial | verified-static | Some controls done | All toggles/segments expose role and selected/checked |
| FEAT-003 | P2 / Proposed | P3 | proposal | proposal | Not implemented | Local, opt-out, clearable list |
| GEO-003 | P2 / Proposed | P1 | open | verified-static | Unchanged; raised to P1 because live use is now the default and the 3D view already uses OpenFreeMap | 2D map uses a provider whose terms allow app use (e.g. OpenFreeMap via MapLibre raster-free path, or self-hosted), with attribution |
| A11Y-004 | P2 / Ready | P2 | open | verified-static | 8 remain after #18 | No text below 12 px; scales with font size |
| FEAT-006 | P2 / Proposed | P3 | proposal | proposal | Not implemented | Pack from release asset, hash-verified |
| DEBT-003 | P2 / Proposed | P2 | open | verified-static | Grew again (Panels 1941->2051) | Places/search, map, guidance split behind tests with no behaviour change |
| FEAT-007 | P2 / Blocked | P2 | blocked | blocked | Unchanged | Background location with foreground notification; Play policy declaration |
| DEBT-001 | P3 / Ready | P3 | verified-fixed | verified-static | c851529 | - |
| SEC-012 | P3 / Ready | P3 | verified-fixed | verified-static | ff78898 | - |
| PERF-004 | P3 / Ready | P3 | verified-fixed | verified-static | ff78898 | - |
| DOC-002 | P3 / Proposed | P3 | open | verified-static | Still present | Moved under a dated evidence folder or removed |
| UX-006 | P3 / Proposed | P3 | open | suspected | Simulation now dev-only; live case unverified | Speed tile hidden without data; icon labelled |
| A11Y-005 | P3 / Proposed | P2 | open | verified-static | #18 made chips 36 px high (now smaller) | All targets >= 48 dp |
| OPS-008 | P3 / Proposed | P3 | open | verified-runtime | This audit: 645/647 locally, the 2 failures are Windows signal/port semantics; CI passes | Node 22 via nvm/volta on the PC, or lifecycle tests skip SIGTERM assertions on win32 |
| GEO-007 | P3 / Proposed | P3 | open | verified-static | Unchanged | Versioned URLs or consistent caching |
| DEBT-007 | P3 / Proposed | P3 | open | verified-static | Unchanged | Typed schemas |
| DEBT-009 | P3 / Blocked | P3 | owner-check | verified-static | Unchanged, preserved | Owner keeps or deletes |
| DEBT-006 | P3 / Proposed | P3 | partial | verified-static | #18 added space/radius/type tokens; colours still inline | Colours from tokens; dark follows system |
| PRIV-002 | P3 / Proposed | P3 | proposal | verified-static | Unchanged | Decision recorded; optional encryption |
| FEAT-002 | P3 / Proposed | P3 | proposal | proposal | Unchanged | Icons for all OSRM types; lanes only from OSRM intersections |
| GEO-006 | P3 / Proposed | P3 | open | verified-static | Unchanged | Segment-distance matching |
| UX-007 | P3 / Proposed | P3 | implemented-unverified | verified-static | 9e1166f made the home sheet collapsible | Handle collapses/expands on device |
| QA-005 | P3 / Proposed | P3 | open | verified-static | Places route takes env via options (good); others unchanged | Env injected; state per instance |
| FEAT-004 | P3 / Proposed | P3 | proposal | proposal | Unchanged | Autocomplete only if provider terms allow; within budget |
| UX-011 | P3 / Proposed | P3 | open | verified-static | Unchanged | Recalculate after locate when a destination exists |
| PRIV-003 | P3 / Proposed | P3 | open | verified-static | Unchanged; places also send 5-dp coordinates (see V4-PRIV-04) | POST search or confirmed log redaction |
| PERF-003 | P3 / Proposed | P3 | open | verified-static | Unchanged | Served from static host |
| UX-008 | P3 / Proposed | P3 | open | verified-static | Unchanged; 3D camera motion makes it more relevant | Default from AccessibilityInfo.isReduceMotionEnabled |
| I18N-001 | P3 / Proposed | P3 | proposal | verified-static | Unchanged | Strings extracted |
| FEAT-008 | P3 / Proposed | P3 | proposal | proposal | Unchanged | Self-hosted OSRM with GB extract, cost recorded |

## New items (24)

| ID | Priority | Status | Evidence | Title | Refs |
|---|---|---|---|---|---|
| V4-POI-08 | P1 | open | verified-static | Cold start: nearby and highlights centre on the King's Cross demo origin until Locate is tapped | `hooks/use-nexora.ts:110,189-219,393,427-439,615,621,632-643` |
| V4-POI-01 | P1 | open | verified-static | Cached nearby requests bypass the per-client rate limit | `server/nexora/places.ts:242-251 (cache) before 258 (limiter);server/nexora/routes.ts:624-638 (search limits first)` |
| V4-POI-03 | P1 | open | verified-static | Places quota and queue semantics: quota taken before queued work, no single-flight, budgets per process | `server/nexora/places.ts:147-164,213-215,243-300;server/nexora/geocoder.ts:185-215;server/nexora/routes.ts:640` |
| V4-MAP-01 | P1 | open | verified-static | 3D: route not framed when the 3D page loads or the theme changes during route preview | `server/nexora/map3d-document.ts:85 (render(latest,true)),112 (fitBounds skipped when fresh)` |
| V4-MAP-02 | P1 | open | verified-static | 3D: dragging during guidance snaps back on the next update | `server/nexora/map3d-document.ts:92,114` |
| V4-MAP-03 | P1 | open | verified-static | 3D heading uses the globally nearest segment (jitter on loops/parallel roads; O(n) per render) | `shared/nexora/map-view.ts:68-95;components/nexora/NexoraApp.tsx:104-106;shared/nexora/guidance.ts:120-145 (tracker already knows the matched segment)` |
| V4-MAP-04 | P1 | open | verified-static | 3D: 'ready' sent before the style loads; theme-change style failures and later tile failures never fall back | `server/nexora/map3d-document.ts:53-56,130,136` |
| V4-MAP-05 | P2 | open | suspected | Map reload timer not tied to map generation | `components/nexora/JourneyMap.tsx:145-161` |
| V4-POI-07 | P2 | open | verified-static | Late nearby reply can clear 'busy' for a route calculation; choosePlace does not cancel nearby | `hooks/use-nexora.ts:406-426,440-445,499-522,539-545` |
| V4-POI-06 | P2 | open | verified-static | Nearby/highlights have no loading/stale/error state; old highlights stay after failure or region change | `hooks/use-nexora.ts:427-439;components/nexora/Panels.tsx:537-556` |
| V4-POI-04 | P2 | open | verified-static | Nearby radius measured from the snapped cell, not the user; 300-result cap truncates arbitrarily | `shared/nexora/places.ts:98-110,282-299` |
| V4-POI-02 | P2 | open | verified-static | Dedup by lower-cased name + 2-dp coordinates hides same-brand branches | `shared/nexora/places.ts:187-189,251-253` |
| V4-POI-05 | P2 | open | verified-static | Places reply attribution discarded; fallback rows labelled OSM-only; malformed reply treated as empty | `hooks/use-nexora.ts:394-404;shared/nexora/places.ts:270;components/nexora/Panels.tsx:606-623` |
| V4-REL-01 | P0 | owner-check | verified-static | Default Start is live GPS navigation with no device validation; road-use warning banner removed | `hooks/use-nexora.ts:586-610;ce8df0e;docs/DEVICE_TEST_PLAN.md:161` |
| V4-REL-04 | P1 | open | verified-runtime | APK provenance: EAS builds carry no commit hash (EAS_NO_VCS=1) | `EAS build 1a370f81 (1.2.0 / 5, gitCommitHash null, created 12:57:03Z, 23 s after 05eeaca CI start);eas.json` |
| V4-NAV-01 | P1 | open | suspected | Live start does not check that the route origin is near the user | `hooks/use-nexora.ts:110,586-610;hooks/use-live-guidance.ts:156-200` |
| V4-REL-03 | P1 | owner-check | blocked | Source archive shared with .env inside | `(archive outside repo; .env not inspected)` |
| V4-PRIV-04 | P3 | open | verified-static | Places requests send 5-dp (~1 m) coordinates although the server only needs the cell | `hooks/use-nexora.ts:401` |
| V4-OPS-09 | P3 | open | verified-static | render.yaml does not list the places knobs (NEXORA_OVERPASS_URL, NEXORA_PLACES_FALLBACK*) | `render.yaml:1-15;server/nexora/places.ts:36-97` |
| V4-FEAT-01 | P2 | proposal | proposal | Search this area: nearby follows the map you are looking at | `server/nexora/map-document.ts;server/nexora/map3d-document.ts;hooks/use-nexora.ts:393` |
| V4-FEAT-02 | P2 | proposal | proposal | Place details from OSM tags (opening hours, wheelchair, website, phone) | `shared/nexora/places.ts:168-203;components/nexora/Panels.tsx` |
| V4-FEAT-03 | P3 | proposal | proposal | 3D view options: north-up / heading-up and 2D during guidance | `server/nexora/map3d-document.ts` |
| V4-FEAT-04 | P3 | proposal | proposal | GPX export of a planned route (local share sheet, no upload) | `shared/nexora/domain.ts;components/nexora/Panels.tsx` |
| V4-FEAT-05 | P3 | proposal | proposal | Offline pack update and storage UI | `lib/offline-pack.ts;components/nexora/Panels.tsx` |
