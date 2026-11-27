# Stops, departure times and avoidances — 27 November 2026

This adds three P0 subfeatures from F3.2-02 and F3.2-03. Their parent requirements stay `planned`; see `SLICE-STOPS`, `SLICE-SCHEDULE` and `SLICE-AVOID` in FEATURE_MANIFEST.json.

## What changed

**Stops.** The route planner has an "Add stop" control (up to three stops). Each stop can be moved earlier or later and removed. Any change clears old routes. Stops go to the API in order, the map shows numbered stop markers, each route card shows per-leg time and distance, and the arrival at an intermediate stop reads "Arrive at stop N". The explicit synthetic demo also supports stops and stays labelled as not road guidance. Round trips, order optimisation, drag-to-reorder and time windows are not built.

**When.** Leave now, Leave at and Arrive by, with a 24-hour UK time. The estimate uses the routing engine's free-flow duration and says that no traffic prediction exists. An arrive-by target that cannot be met is flagged. Times are always UK (GMT/BST), computed from the UK daylight-saving rule so they do not depend on device time-zone data.

**Avoid.** Motorways, tolls and ferries appear for driving, but they are disabled with a reason because the current test graph supports none of them. The API refuses unsupported avoidances with HTTP 422 before calling the provider. An operator running their own OSRM car graph built with exclude classes can set `NEXORA_CAR_EXCLUDE=motorway,toll,ferry` to enable them; that path is tested only against a mocked provider.

## Evidence

Provider probe: `provider-capability-probe-2026-11-27.json`. From a desktop browser (the build container cannot reach the provider), routing.openstreetmap.de returned one route with two legs for car, foot and bike with a stop at St Paul's, and no alternatives. Every `exclude` value, including motorway, toll and ferry, returned HTTP 400 `InvalidValue`. Steps carried no road-class data.

Commands run in the build container on 27 Nov 2026:

| Command | Result | Output |
|---|---|---|
| `pnpm check` | exit 0 | `typecheck-output-2026-11-27.txt` |
| `pnpm lint` | 0 errors, 1 pre-existing warning (`navHeight` in NexoraApp.tsx) | `lint-output-2026-11-27.txt` |
| `pnpm test` | 181 passed, 1 pre-existing skip (was 139 + 1) | `test-output-2026-11-27.txt` |
| `npx expo export --platform all` | iOS, Android and web bundles compiled | `expo-export-output-2026-11-27.txt` |
| `node scripts/itinerary-smoke.js` | 16 of 16 checks passed, no page errors | `itinerary-smoke-results-2026-11-27.txt` |

The 42 new tests are in `tests/nexora-itinerary.test.ts`. They use a trimmed copy of the real multi-stop car response (`tests/fixtures/osrm-car-multistop.json`) and a mocked provider for the HTTP route tests.

The browser smoke ran the web export at 390 × 844 with the API server behind a local proxy. The live provider and map tiles were unreachable from that container, so the smoke used the explicit synthetic demo route. It confirmed the honest provider error, disabled avoidance chips and their note, adding, reordering and removing stops, the leg breakdown, leave-now and arrive-by estimates, rejection of a bad time, and starting the simulation. Screenshots: `screenshots/planner-stops.png`, `screenshots/planner-two-stops.png`.

## Not verified

- A live app request with stops through the NEXORA server to the provider (needs a machine that can reach the provider).
- Any physical Android or iOS device, TalkBack or VoiceOver.
- Any routing graph that actually supports avoidances.
