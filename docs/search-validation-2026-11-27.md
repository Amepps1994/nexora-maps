# Live search validation, 27 Nov 2026 (LocationIQ)

Adapter: `server/nexora/geocoder.ts`, wired in `server/nexora/routes.ts` (`/api/nexora/search`, `/api/nexora/capabilities`).
Config: `NEXORA_GEOCODER_PROVIDER=locationiq`, `NEXORA_GEOCODER_KEY` in the git-ignored local `.env` only (server-side; not in any `EXPO_PUBLIC_*` value or the client bundle). Endpoint `https://eu1.locationiq.com/v1/search`, GB only, London viewbox bias, limit 8.

## Environment
Local development API on Andrew's PC (`tsx server/_core/index.ts`, port 3917) and Expo web on port 8093 with `EXPO_PUBLIC_API_BASE_URL=http://localhost:3917`.
**Not yet verified:** the deployed Manus backend (`nexora-4jxn4lnl.manus.space`) used by the installed APK still runs older code with no geocoder configured, so the APK still reports "live provider not configured". No new APK was built.

## API results (real provider responses)
| Query | Result |
|---|---|
| `SE1 9TG` | SE1 9TG, London Borough of Southwark (postcode) -0.09977, 51.50766 |
| `Tate Modern` | Tate Modern, Bankside, SE1 9TG (gallery) |
| `10 Downing Street` | 10 Downing Street, Westminster, SW1A 2AA (government) |
| `Manchester Piccadilly` | Manchester Piccadilly station, M60 7RA (GB outside London still returned) |
| `zzqxwv nowhere` | `{"results":[]}` (LocationIQ 404 mapped to empty, not an error) |
| no key configured | HTTP 503 "Live search needs a licensed or self-hosted search provider" |

Capabilities: `search: {configured: true, provider: "LocationIQ", attribution: "Search by LocationIQ.com · © OpenStreetMap contributors"}`.

## In-app (Expo web)
Searched `SW1A 1AA` → "CONFIGURED PROVIDER RESULTS" listing SW1A 1AA, City of Westminster; tapping it pinned the place on the map with the LocationIQ/OSM source badge and "Find routes". Attribution link shown under the search button. Screenshot: `screenshots/live-search-locationiq-2026-11-27.jpg`.

## Tests
`npx vitest run`: 269 passed, 1 skipped, 1 todo (includes 10 new tests in `tests/nexora-geocoder.test.ts`). `tsc --noEmit` clean.

## Not covered
Autocomplete/debounce (submit-only by design to stay inside the 5,000/day free quota), recent searches, offline search, business metadata, native Android verification against a backend that has the key.

## Hosted backend (Render, replaces Manus), 27 Nov 2026 13:05 UTC
`https://nexora-api-cfoh.onrender.com` (render.yaml, free tier, key set in the Render dashboard only):
`/api/nexora/capabilities` reports `search.configured: true, provider: LocationIQ`; `search?q=SW1A 1AA` returned SW1A 1AA, City of Westminster; `/api/nexora/map` 200; driving route King's Cross → Tate Modern returned OSRM geometry; offline London region `available: true` and `tiles.pmtiles` served in full (56,370,125 bytes).
`app.config.ts` now falls back to this URL (no EAS `EXPO_PUBLIC_API_BASE_URL` is set for production). A native APK against it is not yet built or tested.

## Native APK on the Android emulator, 27 Nov 2026 13:42 UTC
EAS build fd60ec8d-0c69-4e01-adad-579ad9e48878 (production-apk, combined build of all threads), installed with `adb install -r` on emulator-5554. The first launch hit Render's cold-start page in the map view; after the service woke (~1 min) the relaunch loaded the map with TfL disruptions. Searched `SW1A 1AA` → LocationIQ result with attribution; selected it; Find routes from King's Cross returned a 14 min / 3.3 mi drive and the route drew on the map. Screenshots: `screenshots/apk-render-2026-11-27/`. No Manus backend involved.
