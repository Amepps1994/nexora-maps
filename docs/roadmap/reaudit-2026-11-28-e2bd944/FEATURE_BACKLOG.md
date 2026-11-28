# NEXORA Maps: Feature Backlog (V2 re-audit)

Audit date 28 Nov 2026 · `main` @ `e2bd944` · Back to [MASTER_ROADMAP.md](MASTER_ROADMAP.md)

## 1. Assessment

NEXORA Maps is a guest-first London journey planner and guidance preview for Android: search, plan up to three stops by car, foot or bike, compare routes, see TfL disruptions, use an offline London map, and run simulated or live GPS guidance with voice. The users are the owner and a small group of testers; there is no account system.

The sprint since the last audit was almost entirely correctness, resilience and accessibility work. One proposed feature shipped (FEAT-001, text step list, awaiting TalkBack validation). The other seven proposals are still open, and nothing in the code duplicates them.

**Recommendation: add no new feature IDs this round.** The highest user value now comes from making existing features trustworthy: the car display gives a wrong next turn in live mode (BUG-010), the simulation banner shows the wrong step (BUG-011), the device gates have never run (QA-004), and the API can be locked out or have its geocoder quota drained by one client (SEC-005, SEC-011). New features would add surface on top of those gaps. The ideas evaluated and not added are in section 5.

## 2. Capability comparison (searched before proposing)

| Candidate area | What exists now (evidence) | Decision |
|---|---|---|
| Autocomplete | Submit-only search; capabilities `autocomplete:false` (`server/nexora/routes.ts:125,127`) | Keep FEAT-004 (P3), after SEC-005 and SEC-011 and a LocationIQ terms check |
| Search history / recents | None; saved places and home/work exist (`hooks/use-nexora.ts`) | Keep FEAT-003 (P2) |
| Categories / nearby | Offline search index and LocationIQ forward search only | Defer (section 5) |
| Favourites, saved places, home/work | IMPLEMENTED (local AsyncStorage, export and delete) | No new work; PRIV-002 covers storage hardening |
| Map layers, basemap switching | Online OSM raster, offline PMTiles, TfL disruption layer toggle | No new work; GEO-003 is the basemap licensing task |
| Multi-stop, travel modes, alternatives, leave-at/arrive-by | IMPLEMENTED (3 stops) | GEO-004 aligns the server limit |
| Text route summary / step list | IMPLEMENTED in PR #7 (`components/nexora/StepList.tsx`) | FEAT-001 is validation only, after BUG-011 |
| Lane and junction hints | Turn icons now follow OSRM modifiers (`shared/nexora/maneuver.ts`); no lanes | Keep FEAT-002 (P3) |
| Sharing | Place share as text (`lib/nexora-share.ts`), data export | Defer trip/ETA sharing (section 5) |
| Offline | Map and search offline; no offline routing; pack in git, no sha256 on device | Keep FEAT-006 (P2); GEO-002 |
| Background guidance | Foreground only (`backgroundGPS:false`) | Keep FEAT-007 (P2), blocked by QA-004 |
| Developer tools in release builds | Inject buttons and theme lab visible (`NexoraApp.tsx:687-696`, `app/dev/theme-lab.tsx`) | Keep FEAT-005 (P2), unblocks UX-004 |
| Routing provider | Public OSRM (`routes.ts:41-51`) | Keep FEAT-008 (P3) |

## 3. Active feature specifications

Scores use (Impact + Urgency + RiskReduction + StrategicFit) × confidence ÷ effort weight; components are in the [CSV](PRIORITISED_BACKLOG.csv). Full original specifications (user stories, UX, non-goals) are in the previous `FEATURE_BACKLOG.md` on the PR #2 branch; only what changed is repeated here.

### Core value

| ID | Feature | Priority · effort · score | Current gap | MVP | Acceptance / success metric | Depends on |
|---|---|---|---|---|---|---|
| FEAT-001 | Text step list and route overview | P2 · XS · validation | Shipped; StepList marks the wrong "current" step in simulation (BUG-011) | Fix BUG-011, then a TalkBack run | A TalkBack user completes a simulated trip using only the list | BUG-011 |
| FEAT-005 | Developer mode gating test tools and engineering copy | P2 · S · 4.50 | Inject buttons visible in the release APK during guidance | Hidden by default; long-press on the version label enables it for the session | Release build shows no inject buttons or theme-lab route | — |
| FEAT-003 | Recent searches and destinations (local, opt-out, clearable) | P2 · S · 3.38 | None | Last 10 destinations in search; cleared by Delete my data; off switch in privacy | Recent shown within 1 tap; delete clears it | — |
| FEAT-006 | Host offline packs outside git with sha256-verified, atomic updates | P2 · M · 2.75 | 56 MB pack tracked in git and served by the free instance | GitHub Release asset + manifest sha256; device verifies before swap | Pack updates without a git push; corrupt download keeps the old pack | GEO-002, GEO-007 |

### Differentiators

| ID | Feature | Priority · effort · score | Current gap | MVP | Depends on |
|---|---|---|---|---|---|
| FEAT-007 | Screen-off guidance via an Android foreground service | P2 · L · 1.65 | Foreground only; lock-screen card can go stale (UX-010) | Foreground service with persistent notification, background location permission flow | QA-004 device gates |
| FEAT-002 | Lane hints from OSRM intersections | P3 · M | Icons done; lanes not parsed | Show lanes only when OSRM returns them; never invent | BUG-012 |
| FEAT-004 | Debounced live search suggestions with quota guard | P3 · M | Submit-only | 3+ chars, 350 ms debounce, server cache and budget | SEC-005, SEC-011, LocationIQ terms |

### Speculative / infrastructure

| ID | Feature | Priority · effort | Note |
|---|---|---|---|
| FEAT-008 | Self-hosted OSRM (open source) | P3 · L | Removes public-server limits and enables avoidances; needs a host beyond the Render free plan. Only if SEC-005/007 and real usage show the public server is the bottleneck |

Advanced follow-ons (not scheduled): FEAT-004 could later move to a self-hosted Photon (open source) geocoder over the offline index; FEAT-007 could add Android Auto background guidance once DHU testing passes.

## 4. Success metrics (privacy-preserving)

No analytics exist and none should be added without consent. Measure with release checklists and test evidence instead: device-gate rows passed per build (QA-004), cold-start-to-map time on the emulator (BUG-001), number of announcements per step in TalkBack (A11Y-006), and searches served from cache versus upstream (SEC-011, server counters only, no query text).

## 5. Deferred and rejected ideas

| Idea | Decision | Reason |
|---|---|---|
| Share trip summary and ETA (extend `lib/nexora-share.ts`) | Deferred | Cheap, but an ETA is only trustworthy once live guidance is device-validated |
| Nearby categories (fuel, EV chargers, toilets, parking) | Deferred | Needs a licensed POI source with freshness and attribution; the offline index has no categories |
| Live community incident reports | Deferred | Needs moderation, abuse controls and accounts; current reports are demo-only by design |
| Public transport and step-free routing | Deferred | Needs TfL Journey Planner integration and accessibility data validation; large scope |
| Accounts and sync | Rejected for now | The Manus account stack was just removed; rebuild only on a reviewed design if users ask |
| AI trip planning or natural-language search | Rejected | No user need shown; adds cost and privacy risk |
| 3D buildings, terrain, satellite | Rejected | Licensing cost; no user value for a London driving preview |
| Speed-camera or police alerts | Rejected | Excluded by the project rules (no UK enforcement reports) |
