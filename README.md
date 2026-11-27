# NEXORA Maps

An original Expo / React Native journey-planning app for a private London development preview. The map, destination selection, actual test-provider route calculation, alternatives, preferences, saved places and labelled simulator are working. **Not for road guidance. Not production-ready. Not published.**

## Try the vertical slice

Open the Manus Preview. Select Tate Modern from the London demo catalogue, or use Search / a map pin / latitude, longitude. The initial manual origin is King's Cross, explicitly labelled; it is not your GPS location. Choose Find routes. Driving, walking and cycling use separate OSRM hosted test graphs. Walking on the tested London pair returned distinct alternatives. Select Relaxed to rank known duration and turn-event counts; costs and calibrated reliability remain unknown.

Start simulation. The position, instructions and remaining values replay the selected engine route, not your movement. Pause before adding a test incident. Test reports remain device-local; Confirm is a test action, not independent public corroboration. Inject ETA jitter, GPS loss, Offline or a synthetic Closure. A closure without a verified compliant alternative blocks Resume and gives safe-stop text. Recover explicitly clears the synthetic event. Finish simulated journey and review Privacy. Actual device GPS is a foreground planning fix only; native road guidance, background tracking and speed limits are not enabled.

Saved bookmarks, home/work assignments and preferences persist locally. History is opt-in and retains only simulated trip summary, not a route/GPS trace. Export produces local JSON; Delete clears guest state and precise device-origin state. No live-sharing tokens exist.

## Development

The fixed Manus starter is Expo 57, React Native 0.86, React 19.2, TypeScript and Expo Router. Keep `pnpm-lock.yaml` and the pinned package manager. The map is Leaflet in an isolated web iframe or native WebView; product UI remains React Native.

```sh
pnpm install --frozen-lockfile
pnpm db:push
pnpm check
pnpm lint
pnpm test
pnpm build
```

Inside Manus, Metro/API are declared and restored via managed development commands (`metro`: `pnpm dev:metro`, 8081; `api`: `pnpm dev:server`, 3000). Do not launch a duplicate process. For reproduction outside Manus, run those two scripts in separate terminals and set the public API base appropriate to your device. `pnpm dev` is for ordinary external local reproduction, not the managed process workflow.

Live address/postcode lookup is not configured. Use `.env.example` to configure an operator-controlled Nominatim-compatible licensed/self-hosted endpoint; other provider formats require a schema adapter. Public Nominatim is intentionally rejected. OSRM public test routing is rate-limited globally to below 1 request/second, has no SLA and cannot serve production scale. No API key or paid provider is silently connected.

## Project map

`components/nexora` contains original UI, sheets and map boundary. `hooks/use-nexora.ts` handles guest state and orchestration. `shared/nexora` is the pure tested domain, fixtures, provider validation and session layer. `server/nexora` contains Express provider endpoints and the attributed map document. `tests` covers policy, session and malformed providers plus the starter's CORS tests. `drizzle` preserves the starter migration/schema; no spatial production database is claimed. Demo seed data is `shared/nexora/fixtures.ts`; it is imported locally, never injected into a live community/database.

See [HANDOVER.md](docs/HANDOVER.md) for actual commands/results, implemented status and limits; [SETUP.md](docs/SETUP.md) for providers, licensing and cost assumptions; [ROADMAP.md](docs/ROADMAP.md) and [FEATURE_MANIFEST.json](docs/FEATURE_MANIFEST.json) for the complete preserved requirements; [PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) for draft notices/moderation; [DEVICE_TEST_PLAN.md](docs/DEVICE_TEST_PLAN.md) for blocked native release gates.

## Builds and release boundary

Expo successfully exported iOS/Android/Web JavaScript bundles during this build. This is compile evidence, **not an installable APK/IPA, signed release, real-device test or store acceptance**. Use Dashboard Connect Expo / Expo Go for device preview under the supported account workflow. Dashboard can build native artifacts from the accepted checkpoint when authorised. None has been requested, created or published here.

Real native navigation SDK, traffic/official closure feeds, offline map+graph+search packages, speech, CarPlay/Android Auto, EV/commercial restrictions, transit and AI remain gated. Trademark/domain clearance, DPIA/legal review and provider terms are not completed. Do not use the public demo endpoints for commercial or scaled deployment.
