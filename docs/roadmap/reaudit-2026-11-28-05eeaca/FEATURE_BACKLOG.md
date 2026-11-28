# Feature backlog (V4)

Checked against 05eeaca before proposing: stop reordering (`moveStopAt`, `hooks/use-nexora.ts:920`), up to three stops, departure time, live places by category, 3D/2D toggle, offline London pack and TfL disruptions **already exist** and are not proposed again.

Score = (value × reach × confidence) ÷ effort, each 1–5; severity of defects always outranks features.

| ID | Feature | Value | Reach | Conf. | Effort (days) | Score | Prereqs | Provider / cost |
|---|---|---|---|---|---|---|---|---|
| V4-FEAT-01 | Search this area | 4 | 4 | 4 | 1–2 | 32 | V4-POI-06, V4-POI-08 | Same Overpass/LocationIQ budget |
| V4-FEAT-02 | Place details from OSM tags | 4 | 4 | 4 | 1–2 | 32 | V4-POI-05 | None (tags already fetched) |
| FEAT-003 | Recent searches and destinations | 3 | 4 | 5 | 1–2 | 30 | – | None |
| V4-FEAT-03 | North-up / heading-up, 2D during guidance | 2 | 3 | 4 | 0.5–1 | 24 | V4-MAP-02, V4-MAP-03 | None |
| V4-FEAT-04 | GPX export of a planned route | 2 | 2 | 4 | 0.5–1 | 16 | – | None |
| FEAT-004 | Debounced address suggestions | 3 | 4 | 2 | 1–2 | 12 | SEC-011, provider terms | Spends search quota fast |
| V4-FEAT-05 | Offline pack update and storage UI | 3 | 2 | 3 | 1–2 | 9 | GEO-002, FEAT-006 | Static hosting |
| FEAT-006 | Offline packs hosted outside git | 2 | 2 | 3 | 1–2 | 6 | GEO-002 | GitHub Release assets (free) |
| FEAT-002 | Full manoeuvre icons, lanes from OSRM only | 3 | 4 | 2 | 2–4 | 8 | QA-004 | None |
| FEAT-008 | Self-hosted OSRM (GB) | 3 | 5 | 2 | 3–6 | 5 | – | A VM with ~8 GB RAM; monthly cost |
| FEAT-007 | Screen-off guidance (foreground service) | 4 | 4 | 2 | 3–5 | 6 | QA-004, Play policy | None; policy declaration |
| I18N-001 | Extract strings | 1 | 2 | 4 | 2–4 | 2 | – | None |

## Details for the top proposals

### V4-FEAT-01 · Search this area
- **MVP:** both map pages post `{type:'moved', center, zoom}` on `moveend` (debounced, user gestures only). When the centre is more than one cell from the last nearby anchor, a "Search this area" chip appears above the sheet; tapping it browses the current category there.
- **Excludes:** automatic refetch on every pan (quota), clustering.
- **Modules:** `server/nexora/map-document.ts`, `map3d-document.ts`, `components/nexora/JourneyMap.tsx`, `hooks/use-nexora.ts`.
- **States:** hidden / visible / loading / error; the list header names the area ("near Deansgate").
- **Accessibility:** chip is a button with a label naming the action; announced politely.
- **Failure:** provider down → same error copy as browse.
- **Acceptance:** panning 2 km and tapping the chip lists places within the category radius of the new centre; no request on pan alone.
- **Rollout/rollback:** behind a preference default on; remove the chip to roll back.

### V4-FEAT-02 · Place details
- **MVP:** keep `opening_hours`, `wheelchair`, `website`, `phone`, `cuisine`, `fuel:*`/`socket:*` tags in `NearbyEntry`; the place sheet shows only tags that exist, with "From OpenStreetMap, check before you go".
- **Excludes:** reviews, photos, live opening status claims.
- **Data:** add an optional `details` record to `Place`; cache size grows slightly (bounded by 2,000 entries).
- **Acceptance:** a place with `wheelchair=yes` shows "Wheelchair access: yes"; a place without tags shows nothing extra; website opens only http(s).

### FEAT-003 · Recent searches and destinations
- **MVP:** last 10 chosen places, on-device, shown under the search box; clear-all in Settings; opt-out.
- **Privacy:** never synced; respects the existing history switch.

## Not proposed now
Transit and multimodal journeys (no provider-backed directions; TfL disruptions are not transit routing), lane guidance or speed limits without verified data, live traffic speeds, accounts, cloud sync, AI features, community reports without moderation, EV route planning without trustworthy charger data.
