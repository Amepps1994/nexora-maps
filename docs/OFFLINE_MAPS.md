# Offline maps (open data, no paid licence)

## What it does
- Settings → Providers → **Greater London offline map**: download, update, delete, and a
  "Use offline map" switch. When a pack is installed, the map also switches to it
  automatically if the online map fails to load.
- The offline map is drawn from a PMTiles vector archive stored on the device
  (`Paths.document/offline/london/`). The WebView asks React Native for byte ranges
  (`bytes` bridge message); no network request is made for tiles.
- Offline place search: `useOfflineRegions().search(query, near?)` returns named
  places, stations/POIs and streets from the pack's `search.json`.

## Data and licences
| Part | Source | Licence | Notes |
| --- | --- | --- | --- |
| Map tiles | Protomaps daily basemap build (build.protomaps.com), cut to the London bbox | ODbL 1.0 (OpenStreetMap) | Attribution "© OpenStreetMap contributors (ODbL) · Protomaps" stays on the map |
| Search index | Names extracted from the same tiles | ODbL 1.0 | No house numbers or postcodes |
| Renderer | pmtiles.js, protomaps-leaflet.js, Leaflet | BSD | `server/nexora/map-assets/THIRD_PARTY_NOTICES.md` |

The app never bulk-downloads `tile.openstreetmap.org` (forbidden by the OSM tile usage
policy). Packs are built once by the operator and served from the NEXORA API.
ODbL share-alike: if you distribute the pack, offer the extracted data under ODbL; the
pack itself is that data.

## Build and serve a pack
```
node scripts/offline-region.mjs build london      # newest Protomaps build, ~1,700 tiles z0-14
node scripts/offline-region.mjs verify london     # checks sizes, sha256, centre tile, index
```
Output goes to `server/nexora/offline-data/london/` (git-ignored). The API lists it at
`GET /api/nexora/offline/regions` and serves files with HTTP Range support from
`/api/nexora/offline/regions/london/{tiles.pmtiles,search.json}`. To host the files on a
static host instead, set `EXPO_PUBLIC_NEXORA_OFFLINE_BASE_URL` to the folder that contains
`london/`. Use `--source <file-or-url>` to build from a downloaded archive.

## Limits
- One region (Greater London). Stored up to zoom 14, over-zoomed beyond it.
- Offline **routing** is not included: new routes need a connection. A route planned while
  online stays visible.
- Web preview stays online-only; packs need the Android/iOS app.
- Needs a native build that includes `expo-file-system` (already an Expo dependency).
