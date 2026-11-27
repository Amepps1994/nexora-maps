# NEXORA Maps

An original Expo / React Native journey-planning app for London, with an Express API on Render. It is a private
development preview: it is **not published, and not yet verified for road use**.

## What the app does today (27 Nov 2026)

- Interactive OpenStreetMap / Leaflet map (WebView on Android and iOS, iframe on web).
- Live address and postcode search through LocationIQ (free plan, server-side key), with a London demo catalogue
  when search is not configured.
- Driving, walking and cycling routes from the free OSRM test graphs, with alternatives and up to three ordered stops.
- Labelled route simulation, plus live GPS turn-by-turn guidance with spoken instructions. Live guidance has not
  passed the device tests in [DEVICE_TEST_PLAN.md](docs/DEVICE_TEST_PLAN.md), so do not rely on it on the road.
- Live London road disruptions from the TfL open data API.
- An offline London pack (map tiles and search), served by the API from `server/nexora/offline-data/london/`.
- Android Auto and lock-screen guidance ([CAR_DISPLAYS.md](docs/CAR_DISPLAYS.md)). CarPlay stays off until Apple
  grants the entitlement. Neither has been tested in a real car.
- Guest data (saved places, preferences, opt-in trip history) stays on the device and can be exported or deleted.

Installable Android APKs are built with EAS (see [RELEASE.md](docs/RELEASE.md)) and have been tested on an x86_64
Android emulator, not yet on a physical phone.

## Local development

You need Node 22 (see `.nvmrc`) and pnpm 9.12 (`corepack enable` picks the pinned version).

```sh
pnpm install --frozen-lockfile
cp .env.example .env      # then fill in the values you need, see below
pnpm dev:server           # API on http://localhost:3000
pnpm dev:metro            # Expo on http://localhost:8081 (web); press "a" for an Android emulator
```

`pnpm dev` runs both in one terminal. To point a device or emulator at your local API, set
`EXPO_PUBLIC_API_BASE_URL` (for example `http://10.0.2.2:3000` on the Android emulator).

Checks, the same ones CI runs on every pull request ([ci.yml](.github/workflows/ci.yml)):

```sh
pnpm check   # TypeScript
pnpm lint    # ESLint (expo lint)
pnpm test    # Vitest
pnpm build   # bundles the server into dist/
```

The web-build drive script needs a fresh web export, which is not committed:

```sh
npx expo export --platform web --output-dir dist-web
node scripts/live-guidance-web-drive.js . <output-dir>
```

## Backend on Render

`render.yaml` defines the `nexora-api` web service (free plan, Frankfurt, Node 22). Render deploys every push to
`main`: it runs `pnpm install --frozen-lockfile && pnpm build` and starts `node dist/index.js`, with
`/api/nexora/capabilities` as the health check. The free plan sleeps after 15 minutes idle, so the first request
after a pause can take up to a minute. Live URL: https://nexora-api-cfoh.onrender.com

## Android builds (EAS)

Profiles live in `eas.json`: `preview` and `production-apk` both build an internal APK and set
`EXPO_PUBLIC_API_BASE_URL` to the Render URL. `production-apk` auto-increments the Android version code. Build steps,
where to record each build and how to roll back are in [docs/RELEASE.md](docs/RELEASE.md).

## Environment variables

Names only. Put real values in your private `.env` or in the Render / EAS dashboards, never in git or in an
`EXPO_PUBLIC_*` variable unless the value is public.

| Where | Variable | Purpose |
|---|---|---|
| Server | `NEXORA_GEOCODER_PROVIDER`, `NEXORA_GEOCODER_URL`, `NEXORA_GEOCODER_KEY` | Live search (`locationiq`, or a licensed / self-hosted Nominatim-compatible URL) |
| Server | `NEXORA_CAR_ROUTER`, `NEXORA_FOOT_ROUTER`, `NEXORA_BIKE_ROUTER`, `NEXORA_CAR_EXCLUDE` | OSRM routing endpoints and supported avoidances |
| Server | `NEXORA_TFL_APP_KEY`, `NEXORA_TFL_DISABLED`, `NEXORA_TFL_API_URL` | TfL road disruptions |
| Server | `NEXORA_OFFLINE_DIR` | Override where offline packs are read from |
| Server | `PORT`, `NODE_ENV` | Standard server settings |
| Server (legacy) | `JWT_SECRET`, `DATABASE_URL`, `OAUTH_SERVER_URL`, `VITE_APP_ID`, `OWNER_OPEN_ID` | Old Manus account stack, being removed |
| App build | `EXPO_PUBLIC_API_BASE_URL` | API the app calls (set per profile in `eas.json`) |
| App build | `NEXORA_ANDROID_AUTO`, `NEXORA_CARPLAY` | Car display switches (`0` turns Android Auto off, `1` turns CarPlay on) |

## Project map

- `components/nexora/`: app UI, sheets and the map boundary.
- `hooks/`: app state, networking and live guidance.
- `shared/nexora/`: pure, tested domain logic (routing policy, guidance, itinerary, providers).
- `server/nexora/`: Express endpoints for routing, search, traffic and offline packs.
- `lib/car/`, `plugins/`: Android Auto, CarPlay and lock-screen guidance.
- `tests/`: Vitest suites.
- `docs/`: [HANDOVER.md](docs/HANDOVER.md) (status), [SETUP.md](docs/SETUP.md) (providers and licensing),
  [RELEASE.md](docs/RELEASE.md), [DEVICE_TEST_PLAN.md](docs/DEVICE_TEST_PLAN.md),
  [OFFLINE_MAPS.md](docs/OFFLINE_MAPS.md), [CAR_DISPLAYS.md](docs/CAR_DISPLAYS.md),
  [PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) and the roadmap in `docs/roadmap/`.

## Limits

The OSRM and TfL services are free public services with no uptime guarantee and strict rate limits; do not load-test
them or use them at commercial scale. Routes carry no live traffic speeds, speed limits, lane guidance or truck / EV
restrictions. Trademark, provider terms, privacy (DPIA) and legal review are not done, so the app must not be
published.
