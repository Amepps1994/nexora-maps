# Implementation plan (V4, from 05eeaca)

Each packet lists the files it may change. Two packets never own the same file, except where a shared file is split by function and the merge order says who goes first. Every packet ends with `pnpm check`, `pnpm lint`, `pnpm test` green on CI and the packet's own exit gate. Status words follow the audit: a packet's items become **implemented-unverified** when merged, and only become done with the device evidence named in RELEASE_READINESS.md.

## 1. Packets

### WS-G · Places server: limits, quota, radius, dedup
- **Items:** V4-POI-01, V4-POI-03, V4-POI-04, V4-POI-02, V4-OPS-09 (and the SEC-011 residual)
- **Owns:** `server/nexora/places.ts`, `shared/nexora/places.ts`, `server/nexora/geocoder.ts`, `render.yaml`, `tests/nexora-places.test.ts`, `tests/nexora-geocoder.test.ts`. May edit **only the search route's budget call** in `server/nexora/routes.ts` (around `:640`) to use the shared reservation API; nothing else in that file.
- **Steps:** (1) limiter before cache, separate cached limit if wanted; (2) single-flight map keyed by `category|cell`; (3) `DailyBudget.reserve()/commit()/refund()` and one budget per LocationIQ key shared by search and places fallback with sub-limits; (4) query radius + max cell offset, then filter by real distance; handle the 300 cap; (5) dedupe by OSM id, then same name within ~75 m; (6) document places env knobs in render.yaml.
- **Tests:** the ones listed per item in TECHNICAL_AUDIT.md §1.
- **Exit gate:** all new tests pass; existing places/search tests unchanged in behaviour; no new env var required for defaults.
- **Rollback:** revert the PR; no data migration.
- **Effort:** 2–3.5 days.

### WS-H · Nearby client and live start
- **Items:** V4-POI-08, V4-NAV-01, V4-POI-06, V4-POI-07, V4-POI-05 (client), V4-PRIV-04, UX-002 (Panels.tsx copy), V4-REL-01 notice (only if Andrew picks an option; default: the one-line notice)
- **Owns:** `hooks/use-nexora.ts`, `lib/nexora-controllers.ts`, `components/nexora/Panels.tsx`, `tests/nexora-client-controllers.test.ts`, `tests/nexora-live-start.test.ts`, new `tests/nexora-nearby-anchor.test.ts`.
- **Steps:** (1) pure `nearbyAnchor()` in controllers: fix → recent last-known → visible centre with label → never the demo origin; (2) on launch with permission granted, get last-known then a balanced fix without prompting; keep the last fix after `end()`; (3) start check: first fix > ~200 m from route start → offer "Route from your location"; (4) nearby status `{state, at, area}` shown in the sheet; clear/label on cell change; (5) `choosePlace`, close and `calculate` cancel `nearbyReq`; separate busy ownership; (6) zod-parse the places reply, keep and show `attribution`, malformed → error; (7) send 3-dp coordinates; (8) fix "simulated" copy in Panels.tsx.
- **Exit gate:** a test proves no request uses the King's Cross point after a cold start with a fix elsewhere; race test passes.
- **Effort:** 3–4.5 days.

### WS-I · Map: 3D camera lifecycle and the 2D tile source
- **Items:** V4-MAP-01, V4-MAP-02, V4-MAP-03, V4-MAP-04, V4-MAP-05, GEO-003, UX-002 (NexoraApp.tsx copy lines 1318, 1339)
- **Owns:** `server/nexora/map3d-document.ts`, `server/nexora/map-document.ts`, `shared/nexora/map-view.ts`, `components/nexora/JourneyMap.tsx`, `components/nexora/NexoraApp.tsx`, `hooks/use-live-guidance.ts` (add a read-only `segment` to what it returns; no behaviour change), `tests/nexora-map-view.test.ts`, `tests/nexora-map-document.test.ts`, new `tests/map3d-runtime.test.ts`. May edit **only `mapDocumentCsp()`** in `server/nexora/routes.ts` (`:715-743`), after WS-G merges.
- **Steps:** (1) `lastFitted` so a fresh render fits the route once; (2) pan pauses follow until Recenter; (3) heading from the matched segment with smoothing; (4) `ready` on `style.load`, timer re-armed on `setStyle`, tile-error threshold and `webglcontextlost` → `no3d`; (5) clear reload timer on mode change/ready; (6) GEO-003: move 2D off tile.openstreetmap.org (recommended: MapLibre with OpenFreeMap flat style, same vendored library; keep Leaflet for the offline pack if simpler) and update CSP and credits; (7) NexoraApp copy.
- **Runtime test:** Playwright loads `/api/nexora/map3d` with a local stub style and asserts camera bounds after a route payload, behaviour after a synthetic drag, and `no3d` after a failing style. Uses the pre-installed Chromium on CI.
- **Decision needed for step 6:** provider choice (see MASTER_ROADMAP §6). If not decided, ship steps 1–5 and 7 and leave GEO-003 open.
- **Effort:** 3–5 days.

### WS-J · Offline pack integrity
- **Items:** GEO-002, GEO-007
- **Owns:** `lib/offline-pack.ts`, `server/nexora/offline.ts`, `shared/nexora/offline.ts`, `tests/nexora-offline.test.ts`
- **Steps:** download to a temp file, hash (sha256, streamed), compare with the manifest, then atomic swap; keep the old pack on failure; versioned URLs or matching cache headers.
- **Effort:** 1–2 days.

### WS-K · Release provenance and docs
- **Items:** V4-REL-04, DOC-003, DOC-002, OPS-008 (test part)
- **Owns:** `app.config.ts` (an `extra.commit` field only), `eas.json`, `docs/RELEASE.md`, `docs/DEVICE_TEST_PLAN.md`, `docs/FEATURE_MANIFEST.json`, `docs/test-output*.txt` (move into `docs/evidence/`), `tests/server-lifecycle.test.ts`, `tests/release-config.test.ts`
- **Steps:** (1) the build passes the commit (`EXPO_PUBLIC_NEXORA_COMMIT`) into `extra.commit` and RELEASE.md documents the build command; displaying it in Settings is a one-line follow-up for WS-H since Panels.tsx is theirs; (2) rewrite the device test plan for 1.2.x: live by default, LG-2 without simulation fallback, new rows for cold-start nearby, 3D toggle/pan/fallback, places fallback, start-from-remote-origin; (3) skip or adapt the two SIGTERM/listen assertions on `win32`.
- **Effort:** 1–1.5 days.

## 2. Merge order and conflicts

1. **WS-K** first (docs and config; it also defines how the final APK records its commit).
2. **WS-G** (server). Touches one line area of `routes.ts`.
3. **WS-J** (independent).
4. **WS-H** (client). Independent of WS-G at the API level; rebase on WS-G if the places reply shape changes (it should not).
5. **WS-I** last: it edits `mapDocumentCsp()` in `routes.ts` after WS-G, and `NexoraApp.tsx` passes the new `segment` from `use-live-guidance`.
6. Then one version bump (1.3.0, so the live-start acknowledgement asks again, UX-003) and one combined APK, built with the commit recorded, after Andrew types his approval in a thread on his PC.

Known overlaps: `Panels.tsx` belongs to WS-H only; `NexoraApp.tsx` to WS-I only; `routes.ts` is split by function between WS-G (search budget) and WS-I (map CSP).

## 3. Prompt template for each packet

```
NEXORA Maps, repo C:\Users\andre\Documents\NEXORA-Maps, base main @ <sha>.
Packet <WS-x> from docs/roadmap/reaudit-2026-11-28-05eeaca/IMPLEMENTATION_PLAN.md.
Items: <ids>. Read TECHNICAL_AUDIT.md for each item's evidence, fix and tests.
You may change only: <owned files>. Do not touch other packets' files.
Write the tests first where the item lists them. Run tsc, vitest (CI is the lint source of truth).
Do not bump the app version or run an EAS build. Open a PR titled "<WS-x>: <summary>" listing
each item as implemented-unverified with the device check still owed.
```

## 4. Not in this sprint
DEBT-003 split (after hook tests exist), PERF-001 (needs a measured baseline), A11Y-004/005 sweep (touches both big screen files; next sprint once WS-H/WS-I land), FEAT-* proposals, DEBT-005 identity migration (owner plan first), FEAT-007 (Play policy).
