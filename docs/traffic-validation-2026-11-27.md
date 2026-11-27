# Live London disruptions (TfL) — validation, 27 Nov 2026

Feature: `SLICE-TRAFFIC-TFL` (parent `TECH-TRAFFIC`, which keeps its state).
State: **implemented but unverified** (no end-to-end server fetch of the live feed, no device run).

## What it is

- Authority-reported road disruptions and closures on London roads, from the TfL Unified API
  `GET /Road/all/Disruption?stripContent=true`.
- Ingested on the server only (`server/nexora/traffic.ts`). One upstream call per 2 minutes serves
  every client (TfL licence limit: 500 calls/minute per feed). Optional `NEXORA_TFL_APP_KEY` is sent
  only to TfL and never returned to the app (tested).
- App endpoint `GET /api/nexora/traffic` returns `status` (`live`, `cached`, `stale`), `fetchedAt`,
  `expiresAt`, coverage, limits, attribution and normalised disruptions. If TfL fails and nothing is
  cached it returns 503 with no data substituted. `GET /api/nexora/traffic/capabilities` describes it.
- Map: diamond markers (amber = disruption, red = closure, outlined = planned), dashed red lines on
  closed street segments, tooltip as plain text, TfL attribution added to the map attribution while
  the layer has data. Layer toggle in Map layers ("Live London disruptions"), remembered on device.
- Route comparison: each provider route shows "N TfL disruptions on or beside this route · M with a road
  closure" plus fetch time, and the selected route lists up to three current disruptions. Route times
  are labelled free-flow and are **not** changed by this feed.
- Settings / What works today: "Road disruptions & closures" row with live status and limits;
  community reports are a separate row and stay local test reports only.

## What it is not

Live speeds or congestion, journey-time prediction, motorways or roads outside London (National
Highways not integrated), direction-of-travel or lane matching, avoidance of closures in routing.
Enforcement-camera and police categories are filtered out whatever the feed contains (tested).

## Licence

TfL Transport Data Service licence (OGL v2.0 based), read 27 Nov 2026 at
https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service — free, commercial use
allowed, requires "Powered by TfL Open Data", "Contains OS data © Crown copyright and database rights
2016" and "Geomni UK Map data © and database rights [2019]", 500 calls/min/feed, no implied
endorsement, and applies from registration. The app shows all three attribution lines.

## Evidence

1. **Anonymous access** (Andrew's desktop browser, 27 Nov 2026 02:13 UTC): HTTP 200, 105 records,
   `cache-control: max-age=150`, `access-control-allow-origin: *`. No key needed today.
2. **Full live feed checked** (same browser, 02:17 UTC): 105 records, 105 unique ids, all with a
   Point geography; 24 records have streets marked `Closed`, 250 closed segments, 0 unparseable
   segment lineStrings; 2 already expired, 1 planned, 0 provisional; 1 record had a bare number as its
   update text. `hasClosures` was `false` on every record, so closures are derived from
   `streets[].closure`. Categories seen: Works (utility, TfL, borough, construction, collaborative,
   Network Rail), Collisions, Surface damage / Pothole.
3. **Unit and API tests**: `tests/nexora-traffic.test.ts`, 15 pass, using 4 real records captured at
   02:13 UTC (`tests/fixtures/tfl-road-disruption-2026-11-27.json`). Covers closure derivation,
   expiry, planned, blocked categories, malformed records, staleness, route matching by point and by
   closed segment, coverage labels, single cached upstream call, key never echoed, 503 with nothing
   substituted, cached-not-live labelling, operator off switch.
4. **Typecheck and full suite**: `tsc --noEmit` clean; `vitest run` 9 files pass, 284 tests pass,
   1 skipped, 1 todo (cloud copy of the PC folder, 27 Nov 2026 05:06 UTC).
5. **Web smoke** (headless Chromium, `expo export --platform web`, real `createApp()`, upstream mocked
   with the captured records plus one synthetic record labelled "SMOKE TEST ONLY" placed on the OSRM
   fixture route): 5 markers, 2 closures, TfL attribution shown; toggling the layer off sent an empty
   list and on restored it; King's Cross → Tate Modern route card read "1 TfL disruption on or beside
   this route · 1 with a road closure · Live TfL disruptions · fetched 05:11 GMT"; providers row read
   "Live TfL disruptions · fetched 05:11 GMT · London roads only · not live speeds, motorways or
   route-time changes". Map tiles could not load from the cloud container (expected).

## Not yet done

- The Node server fetching TfL live end to end (cloud egress to api.tfl.gov.uk is blocked; run
  `pnpm dev` on the PC and open `/api/nexora/traffic`).
- Physical Android/iOS device check.
- National Highways (motorways/strategic roads) — needs a free developer-portal account.
- Observed in the headless smoke only, not changed here: the map iframe's `ready` message can arrive
  before the web listener attaches, so the map ignores updates until the next load.
