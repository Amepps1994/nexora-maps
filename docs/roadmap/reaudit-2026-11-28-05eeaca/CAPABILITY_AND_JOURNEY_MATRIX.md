# Capability and journey matrix (05eeaca)

Legend: **Code** = present in code; **Tested** = automated tests pass; **Device** = seen working on a device for this version; **–** = not available. No row has device evidence for 1.2.0; the e2bd944 screenshots cover older behaviour only.

## Capabilities

| Capability | Android | iOS | Web (dev) | Car | Evidence / notes |
|---|---|---|---|---|---|
| Address and postcode search (LocationIQ) | Code, Tested | Code (no iOS build) | Code | – | Needs server key; 24 h cache, 4,000/day budget |
| Live nearby places by category | Code, Tested (server) | Code | Code | – | Overpass, LocationIQ Nearby fallback; V4-POI-08 cold-start defect |
| Home highlights | Code | Code | Code | – | Wikidata-linked sights only; V4-POI-06 |
| Routing car/walk/cycle, up to 3 stops, depart time | Code, Tested | Code | Code | – | Public OSRM; avoid options unavailable |
| Route alternatives and preference scoring | Code, Tested | Code | Code | – | |
| Live GPS turn-by-turn (default Start) | Code, Tested (logic) | Code | Partial | – | Unvalidated (V4-REL-01, QA-004) |
| Voice guidance | Code | Code | Browser TTS | – | No audio-focus testing |
| Off-route and reroute | Code, Tested (controllers) | Code | Code | – | BUG-007 device check |
| Simulation | Developer builds only | same | same | – | `DEV_TOOLS` |
| 2D map (Leaflet) | Code, Tested | Code | Code | – | tile.openstreetmap.org (GEO-003) |
| 3D map (MapLibre/OpenFreeMap) | Code | Code | Code | – | V4-MAP-01..05; falls back to 2D without WebGL |
| TfL disruptions overlay | Code, Tested | Code | Code | – | London only; not traffic speeds |
| Offline London map + local search | Code, Tested; Device at e2bd944 | Code | – | – | No offline routing; GEO-002 |
| Android Auto | Code | – | – | Code, DHU not run for 1.2.0 | BUG-010 fix needs R-11 |
| CarPlay | Gated off | Needs Apple entitlement | – | – | Blocked |
| Lock-screen guidance card | Code | Code | – | – | Notification permission asked before guidance (UX-010) |
| Screen-off guidance | – | – | – | – | FEAT-007 blocked |
| Saved places, home/work, trips | Code (AsyncStorage) | Code | Code | – | Plaintext on device (PRIV-002) |
| Accounts / sync | – by design | – | – | – | Guest-first |

## Journey states (live guidance)

| State | Entry | What the user sees | Exit | Gaps |
|---|---|---|---|---|
| idle | launch | Map, compact home sheet, highlights | search/browse/pin | V4-POI-08 anchor |
| planning | Directions | Spinner in routes sheet | routes or error | V4-POI-07 busy race |
| preview | routes returned | Alternatives, Start | Start | V4-NAV-01 origin check; V4-MAP-01 in 3D |
| navigating | Start (live) | Banner, next turn, follow camera | arrive/end/off-route | V4-MAP-02/03 in 3D |
| degraded | weak GPS / location error | "Guidance paused" | fix recovers | device check |
| rerouting | confirmed off-route | "Finding a new route" | new route or reason | BUG-007 |
| arrived | progress 1 | Arrival, trip saved if history on | dismiss | "simulated" copy (UX-002) |
| ended | End (confirmed) | Toast, location released | idle | `gps` cleared → anchor falls back (V4-POI-08) |

## Offline and privacy behaviour

| Situation | Behaviour (code) |
|---|---|
| Offline with pack | Offline map tiles and local search; no new routes ("new routes require a network connection") |
| Offline without pack | Map document fails, error shown; highlights keep old list silently (V4-POI-06) |
| Location denied | Search/pin origin manually; live Start explains permission |
| What leaves the device | Search text (GET), route coordinates, places coordinates at 5 dp (V4-PRIV-04); the server sends providers only the snapped cell for places |
| Retention | Local only; history switch; export/delete in Settings |
