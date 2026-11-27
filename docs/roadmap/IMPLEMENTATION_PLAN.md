# NEXORA Maps — Implementation Plan

Back to [MASTER_ROADMAP.md](MASTER_ROADMAP.md) · Evidence: [TECHNICAL_AUDIT.md](TECHNICAL_AUDIT.md) · Rows: [PRIORITISED_BACKLOG.csv](PRIORITISED_BACKLOG.csv)

Nothing in this plan has been implemented. Each packet still needs the owner's approval before a coding session starts.

## 1. Dependency order

1. **Owner actions, no code:**
   - SEC-001: rotate the secrets in the Render and EAS dashboards.
   - D1: decide whether to remove the Manus stack.
2. **WS-5 / QA-001 (CI).** Lands first, so the other PRs are checked automatically.
3. **WS-1, WS-2, WS-3 and WS-4 run in parallel.** They own disjoint files (section 2).
4. **Merge order:** WS-5 → WS-1 → WS-2 → WS-3 → WS-4. Rebase each PR onto `main` before merging, and re-run CI after each merge.
5. **Combined EAS `production-apk` build.** Needs Andrew's typed approval.
6. **QA-004 device gates** against that build.
7. **Phase 2 work:** DEBT-003 (split the god files) only after QA-002's hook tests exist.

Hard prerequisites:
- BUG-005 needs `Step.modifier` from BUG-004. Both are in WS-2.
- FEAT-004 needs SEC-005 and BUG-006.
- FEAT-007 needs QA-004.
- DEBT-001 should follow SEC-002.

## 2. Parallel workstreams for the combined APK

Global rules for every workstream:
- Touch only the files the workstream owns.
- Add no dependencies (WS-5 is the only workstream that edits `package.json` / `pnpm-lock.yaml`).
- Add tests for every change.
- Run `pnpm check && pnpm lint && pnpm test` before opening the PR.
- Do not edit `docs/FEATURE_MANIFEST.json` states without evidence.
- Do not start an EAS build.

| WS | Owns | Must not touch | Items (sprint scope) | Stretch | Effort |
|---|---|---|---|---|---|
| **WS-1 Server** | `server/**` except `server/nexora/route-mapper.ts`; `render.yaml`; `drizzle/`, `drizzle.config.ts`; `tests/security-admin-account.test.ts`, `tests/auth.logout.test.ts`, `tests/cors.test.ts`, new `tests/server-*.test.ts` | client code, `shared/**` (may import from it, not edit it) | SEC-002 (+SEC-003, SEC-004), SEC-001 code part, SEC-005, SEC-006, SEC-007, QA-003, OPS-001, OPS-002 server part, GEO-004, UX-001 | DEBT-001 (server files), SEC-008, QA-005 | M–L (6–9 d) |
| **WS-2 Guidance** | `shared/nexora/guidance.ts`, `car-guidance.ts`, `domain.ts` (Step type only), `provider.ts`; new `shared/nexora/maneuver.ts`; `server/nexora/route-mapper.ts`; `tests/nexora-guidance.test.ts`, `tests/nexora-car-guidance.test.ts`, `tests/nexora-provider.test.ts`, new `tests/nexora-route-mapper.test.ts`; **only** the turn-icon expression at `components/nexora/NexoraApp.tsx:275-282` | other parts of NexoraApp, hooks, server routes | BUG-003, BUG-004, BUG-005, GEO-005 | GEO-001 | S–M (3–5 d) |
| **WS-3 Client networking** | `hooks/use-nexora.ts`, `hooks/use-live-guidance.ts`, `hooks/use-offline-regions.ts`, `components/nexora/JourneyMap.tsx`, `lib/offline-pack.ts`; new `lib/nexora-api.ts`, new `shared/nexora/reroute.ts`; new `tests/nexora-client-*.test.ts` | Panels, NexoraApp, server, shared guidance | BUG-001, BUG-002, BUG-006 (hook part), BUG-007, PERF-002 | GEO-002 (atomic swap only), DEBT-002 wrapper for all calls, SEC-009 | M–L (5–8 d) |
| **WS-4 UI and a11y** | `components/nexora/NexoraApp.tsx` (except WS-2's lines), `components/nexora/Panels.tsx`, `components/nexora/ui.tsx`, `app/_layout.tsx`, `app/dev/*` | hooks, shared, server | BUG-008, BUG-009, UX-003, A11Y-001, A11Y-003, FEAT-001, OPS-002 (ErrorBoundary), DEBT-008, BUG-006 (Panels part: keep results while typing) | UX-002, UX-004 + FEAT-005, A11Y-002, A11Y-005, UX-006 | M–L (6–9 d) |
| **WS-5 Build, CI, docs** | `.github/**`, `app.config.ts`, `eas.json`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, new `.nvmrc`, `dist-web/`, `README.md`, `docs/HANDOVER.md`, `docs/SETUP.md`, new `docs/RELEASE.md`, `docs/*-output*.txt` | source code | QA-001, PRIV-001, OPS-003, OPS-004, DEBT-004 (dist-web only), DOC-001 | DOC-002 | S–M (2–4 d) |

Known shared-file contacts:
- **WS-2 and WS-4 both edit `NexoraApp.tsx`.** WS-2 changes only the `name={...}` expression of the turn `<Icon>`. WS-4 merges last and resolves any trivial conflict.
- **WS-3 uses `MAX_INTERMEDIATE_STOPS` and `Step`.** These are read-only imports, and the `Step` field WS-2 adds is optional.
- **WS-1 removes routes that the client OAuth screens would call.** Those screens are unreachable from the UI, so nothing breaks. They are removed in Phase 2.
- **`dist-web/` is used by `scripts/live-guidance-web-drive.js:9`.** WS-5 must make that script build the bundle on demand, or document `npx expo export --platform web --output-dir dist-web` before running it.

## 3. Engineering task packets (top 10)

### TP-1: SEC-002 Remove the Manus auth, storage and tRPC stack (WS-1)
- **Goal.** No account, session or storage routes on the public API.
- **Preconditions.**
  - Owner decision D1 = remove.
  - Evidence in TECHNICAL_AUDIT §5.1.
- **Files.**
  - `server/_core/app.ts`
  - `server/_core/{oauth,sdk,storageProxy,systemRouter,context,trpc,cookies,notification}.ts`
  - `server/routers.ts`, `server/db.ts`, `drizzle/`, `drizzle.config.ts`
  - `tests/security-admin-account.test.ts`, `tests/auth.logout.test.ts`
  - Uncertain: `server/_core/cors.ts` may import cookie helpers.
- **Steps.**
  1. Pin the route inventory first. Write `tests/server-routes.test.ts` with `createApp().listen(0)` and assert today's 200/401 responses, so the change is visible.
  2. In `createApp()`:
     - remove `registerStorageProxy`, `registerOAuthRoutes`, the `/api/trpc` middleware and `clearLegacySessionCookie` (the last only if nothing else needs it);
     - set `express.json({ limit: "16kb" })` and remove `urlencoded`, unless a route needs it (grep first).
  3. Delete the modules listed above, plus `server/routers.ts`, `server/db.ts` and `drizzle/`. Keep `server/_core/env.ts` keys that the nexora routes still use.
  4. Update the tests:
     - The new 404 cases are `/api/oauth/callback`, `/api/oauth/mobile`, `/api/auth/me`, `/api/auth/session`, `/api/auth/logout`, `/manus-storage/x` and `/api/trpc/system.health`.
     - `/api/nexora/admin` stays denied.
     - Delete the `describe.skip` in `tests/auth.logout.test.ts`.
  5. Remove server-only env names from `.env.example`. That file is owned by WS-5, so hand the list to WS-5 instead.
  6. `pnpm check && pnpm test && pnpm build`.
- **Interfaces.**
  - None used by the app.
  - Render env vars `JWT_SECRET`, `DATABASE_URL` and `OAUTH_SERVER_URL` become unused. Delete them from the dashboard after deploy (owner).
- **Tests.**
  - The 404 suite above.
  - `/api/nexora/capabilities` still 200.
  - CORS tests unchanged.
- **Rollout and rollback.** Merge, then Render auto-deploys. Rollback is "Rollback to previous deploy" in Render, or revert the PR.
- **Effort.** M (3–5 d).
- **Risks.**
  - Hidden imports from `lib/_core` on the client: they are client-only, but check with `tsc`.
  - `tests/security-admin-account.test.ts` is large. Keep its nexora/admin assertions.
- **Done when.** The 404 suite passes, the server bundle size goes down, and no `sdk.` or `jose` import remains in `server/`.

### TP-2: SEC-005 + SEC-007 Fair rate limiting and bounded provider queue (WS-1)
- **Goal.**
  - One abusive client cannot lock out others or drain LocationIQ.
  - Requests cannot pile up without bound.
- **Files.** `server/_core/app.ts`, `server/nexora/routes.ts:52-99,150,278`, new `tests/server-throttle.test.ts`.
- **Steps.**
  1. In `createApp()`, add `app.set("trust proxy", 1)`. Render adds exactly one proxy hop; confirm this in Render docs during implementation.
  2. Replace the single `limits` Map with a small limiter factory `createLimiter({ windowMs, max })`. Use separate instances: routes 15/min/IP, search 30/min/IP.
  3. Prune expired entries on access.
  4. Add a global daily search counter. Set it from `NEXORA_SEARCH_DAILY_CAP`, defaulting below the LocationIQ free-plan limit; confirm the plan number in the dashboard. Return 503 with `{error:"search quota reserved"}` when it is exceeded.
  5. Split `providerFetch` into one queue per upstream host:
     - OSRM: 1.1 s spacing, unchanged.
     - LocationIQ: its own spacing, from config.
     - Cap each queue at 20 waiting jobs and return 503 `{error:"busy"}` when it is full.
     - Skip queued jobs whose `req` has closed.
  6. Export `__resetLimitersForTests()` so tests don't leak state between each other (QA-005).
- **Tests.**
  - Two `X-Forwarded-For` values get independent buckets.
  - The 16th route request gets 429.
  - A search does not wait behind 5 queued routes.
  - The 21st waiting job gets 503.
  - Use fake timers and mock `fetch`.
- **Rollback.** Revert. The limits are config, so they can be raised via env without a deploy of code.
- **Effort.** S (1–2 d).
- **Done when.** The tests pass, and a manual check on Render shows hashed IPs differing across two networks. Log a hash, never the raw IP.

### TP-3: SEC-006 + UX-001 Map document hardening and compact attribution (WS-1)
- **Files.** `server/nexora/map-document.ts`, new `tests/server-map-document.test.ts` (jsdom; vitest supports `// @vitest-environment jsdom`, but check that jsdom is installed and do not add it, otherwise test the string output only).
- **Steps.**
  1. In the `message` listener, accept the message only if `e.source === window.parent` and `e.origin` is in an allowlist injected into the document. The allowlist is derived from CORS config plus the native WebView case. Native `injectJavaScript` calls `nexoraUpdate` directly and does not use `message`.
  2. Replace `bindTooltip(p.name)` with `bindTooltip(textNode(p.name))`, where `textNode` builds an element using `textContent`.
  3. Replace `postMessage(..., '*')` with the parent origin.
  4. Attribution:
     - Use `L.control.attribution({ position: 'bottomleft', prefix: false })` with a collapsed "ⓘ" toggle that expands the full credits.
     - Stop moving `.leaflet-top.leaflet-right` for attribution.
     - Keep the OSM, TfL and offline credits reachable within one tap.
- **Tests.**
  - The document contains no `bindTooltip(p.name)`.
  - A foreign-origin event does not change layers (jsdom if available).
  - The attribution element exists in a bottom corner.
- **Acceptance.** Re-taken emulator screenshots show at most one line of attribution over the map.
- **Effort.** S.

### TP-4: BUG-004 + BUG-005 Correct manoeuvre text, voice and icons (WS-2)
- **Files.**
  - `shared/nexora/domain.ts` (Step: add `modifier?: string`, `exit?: number`, `ref?: string`)
  - `server/nexora/route-mapper.ts`
  - `shared/nexora/guidance.ts:53`
  - `shared/nexora/car-guidance.ts:~170`
  - new `shared/nexora/maneuver.ts`
  - `components/nexora/NexoraApp.tsx:275-282` (icon expression only)
  - tests
- **Steps.**
  1. In `mapOsrmRoutes`, copy `maneuver.modifier`, `maneuver.exit` and `step.ref` onto `Step`.
  2. Rewrite `instruction()`:
     - `continue` or `new name` with a modifier in `{uturn}` gives "Make a U-turn"; with `{left, right, slight *, sharp *}` it gives "Turn/Keep <dir> to stay on <road>". Otherwise "Continue onto <road>".
     - Plain `turn` with `uturn` gives "Make a U-turn".
     - `end of road` with `straight` gives "Continue".
     - A roundabout without `exit` gives "At the roundabout, continue onto <road>".
     - When `name` is empty, use `ref` (for example "A40").
     - Keep the existing intermediate-stop arrival labels.
  3. In `guidance.ts`, treat `continue` as silent only when the modifier is `straight` or missing.
  4. In `car-guidance.ts`, map `continue` plus a modifier to the matching car manoeuvre.
  5. Add `maneuverIcon(step): IconName` in `maneuver.ts`. Cover arrive → flag, uturn, sharp/slight/plain left/right, straight, roundabout, fork, merge, and fall back to straight. Use the icon names already in the app's icon set; check which Feather names exist.
  6. In NexoraApp, replace the text-based ternary with `maneuverIcon(n.step)`.
- **Tests.**
  - A table over every OSRM `type × modifier` combination that the mapper handles.
  - `continue`/`uturn` is announced by the guidance prompt generator.
  - The existing 29 car-guidance tests still pass.
- **Backward compatibility.** The new Step fields are optional. Old saved routes in AsyncStorage (if any) still render, with the straight fallback.
- **Effort.** S (1.5–2 d).
- **Done when.** The tests pass, and a simulation screenshot of the fixture route shows an up arrow on "Continue".

### TP-5: BUG-003 Round-trip arrival (WS-2)
- **File.** `shared/nexora/guidance.ts:253-256`.
- **Step.** Change the proximity clause to apply only when `alongM >= totalM - Math.max(200, 2 * arrivalRadiusM)`.
- **Tests.**
  - A loop route `home → stop → home`: the first fix at home is not arrived, and arrival happens at the end.
  - The existing arrival tests still pass.
  - A U-shaped route passing within 20 m of its end at its midpoint is not arrived.
- **Effort.** XS.

### TP-6: BUG-001 Cold-start resilience (WS-3)
- **Files.**
  - `components/nexora/JourneyMap.tsx:50-75`
  - `hooks/use-nexora.ts:148-157,405-460`
  - new `lib/nexora-api.ts`
  - new tests
- **Steps.**
  1. Create `lib/nexora-api.ts` with `apiFetch(path, { timeoutMs, signal, retries })`:
     - Use `AbortSignal.any` or a manual combination.
     - Return typed errors `{ kind: "timeout" | "offline" | "http", status }`.
     - Add `warmUp()`, which calls `GET /api/health` once per launch and stores a module-level promise.
  2. In `use-nexora`:
     - call `warmUp()` on mount;
     - fetch capabilities with retries (backoff 2 s, 5 s, 10 s, 20 s), and again when the search panel opens and `capabilities` is still null;
     - expose `serverState: "waking" | "ready" | "unreachable"`.
  3. Route calculation should use `apiFetch` with a 60 s timeout while `serverState === "waking"`, otherwise 18 s. Map errors to friendly text, such as "The NEXORA server is waking up. This can take up to a minute."
  4. In `JourneyMap`:
     - After 8 s without `ready`, show an overlay "Waking the map server…" with a spinner, instead of failing.
     - Fail at 60 s, with a Retry button that bumps `attempt`.
     - Keep the existing offline-pack fallback (`JourneyMap.tsx:67`), which already switches to an installed pack.
  5. Pass `serverState` to the UI. WS-4 renders any extra banner later; in this sprint the map overlay and the route error copy are enough.
- **Tests.**
  - `apiFetch` timeout and retry with fake timers.
  - Capabilities retry until success.
  - No raw "AbortError" text reaches the UI state.
- **Manual acceptance.** Let Render sleep for at least 20 minutes, or point at a delay proxy. Cold-launch the APK: the overlay appears within 8 s, the map loads, and search shows LocationIQ.
- **Effort.** M (3–4 d).
- **Rollback.** Revert. No data changes.

### TP-7: BUG-002 + BUG-007 Reroute correctness (WS-3)
- **Files.** `hooks/use-nexora.ts:180-205`, `hooks/use-live-guidance.ts:~150-160`, new `shared/nexora/reroute.ts`, tests.
- **Steps.**
  1. Write a pure function `remainingStops(stops, visitedOffset, passedOnCurrent) → { body, nextOffset }`.
  2. Keep a `visitedStopsRef`. Reset it when a trip starts.
  3. In `requestReroute`, compute `remainingStops(...)`. In `applyReroute`, commit `nextOffset`.
  4. Use `apiFetch` with a 10 s timeout for the reroute request.
  5. In `use-live-guidance`, when a reroute was requested because of a confirmed off-route, do not discard a returned candidate just because the user is now stationary. Hold it and apply it on the next moving fix, or apply it directly, since off-route was already confirmed.
- **Tests.**
  - Stops `[A, B]`. After passing A, the first reroute requests `[B]`. A second reroute with `passed = 0` still requests `[B]`. After passing B, it requests `[]`.
  - The candidate held while stationary is applied on the next moving fix.
  - A reroute timeout releases `reroutingRef`.
- **Effort.** S (1–2 d).

### TP-8: BUG-008 + BUG-009 + UX-003 Back button, first run and live-start acknowledgement (WS-4)
- **Files.** `components/nexora/NexoraApp.tsx`, `components/nexora/Panels.tsx`.
- **Steps.**
  1. Add a `BackHandler.addEventListener("hardwareBackPress")` effect:
     - If a panel is open, close it (routes → place → search → none).
     - If guidance is active, show a confirm sheet "End guidance?".
     - Otherwise return `false`.
     - Remove the listener on cleanup.
  2. When `hydrated && !prefs.onboardingSeen`, open the `onboard` panel once. Add a "Use my location" step that explains why, then calls the existing location request.
  3. In the routes sheet, when the origin is the demo default:
     - show "Starting from King's Cross (demo)" at 13 px or larger;
     - add a "Use my location" button.
  4. Add `prefs.liveAck` (keyed to the app version):
     - The first tap on "Start live GPS guidance" opens an acknowledgement sheet: unverified on devices, keep eyes on the road, "Start simulation instead" is the default.
     - Collapse the other notes on the routes sheet into an "About these results" disclosure.
- **Tests.** Pure helpers where possible, for example `nextPanelOnBack(panel)`. Then emulator checks with `adb shell input keyevent 4` and a fresh install.
- **Effort.** M (3–4 d).

### TP-9: QA-001 + OPS-003 CI and release hygiene (WS-5)
- **Files.** New `.github/workflows/ci.yml`, `eas.json`, new `docs/RELEASE.md`, `package.json` (`engines`), new `.nvmrc`.
- **Steps.**
  1. Write `ci.yml`. On `pull_request` and push to `main`:
     - `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` (node 22, pnpm cache);
     - `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`.
     - The Android `expo export` step is optional and manual-dispatch only.
     - Set `timeout-minutes: 20`.
  2. Owner, in the GitHub settings: make `verify` a required check on `main`. In Render: set Auto-Deploy to "After CI checks pass", if the plan offers it.
  3. In `eas.json`:
     - Add `"autoIncrement": true` to `production-apk`.
     - Add a `preview` profile (internal APK) with `env.EXPO_PUBLIC_API_BASE_URL` set explicitly.
     - Set `"node": "22.x"` for EAS.
  4. Write `docs/RELEASE.md`:
     - how to cut a build (`$env:EAS_NO_VCS='1'; npx.cmd eas-cli build -p android --profile production-apk` on the PC, with typed approval);
     - record the build id and commit in `DEVICE_TEST_PLAN.md`;
     - backend rollback through Render "Rollback", or by reverting on `main`;
     - APK rollback by reinstalling the previous build id.
- **Tests.** A throwaway PR with a failing assertion is blocked (then closed).
- **Effort.** S (1 d).

### TP-10: PRIV-001 + DEBT-004 + DOC-001 Config and docs cleanup (WS-5)
- **Steps.**
  1. Remove the `expo-audio` and `expo-video` plugin entries (`app.config.ts:133-145`) and their dependencies, plus `expo-image` if unused. Confirm with grep.
  2. In a scratch clone, run `npx expo prebuild --no-install -p android` and grep the manifest for `RECORD_AUDIO`. Discard the output.
  3. Untrack `dist-web/` (`git rm -r --cached dist-web`), add it to `.gitignore`, and update `scripts/live-guidance-web-drive.js` usage notes.
  4. In `.gitignore`, add `!server/nexora/offline-data/london/` negations, so the committed pack is explicit and future packs are not silently ignored.
  5. Rewrite the `README.md` quickstart:
     - what the app is now;
     - local dev (`pnpm dev:server`, `pnpm dev:metro`);
     - Render deploy;
     - EAS build;
     - env vars (names only).
  6. Add a dated "Current status (27 Nov 2026)" section at the top of `docs/HANDOVER.md`. Mark the Manus-era text as historical.
  7. Remove the Manus runtime guidance from `docs/SETUP.md`.
- **Acceptance.**
  - `grep -ri manus README.md docs/SETUP.md` shows only historical notes.
  - The merged manifest has no microphone permission.
  - `git ls-files dist-web` is empty.
- **Effort.** S–M (1.5–2.5 d).

## 4. First sprint (one developer equivalent, about 10 working days)

The order, if a single developer does it:

| Day | Task | Why this order |
|---|---|---|
| 0.5 | TP-9 CI | Every later change gets checked |
| 0.5 | SEC-001 (owner) and D1 | Unblocks TP-1 |
| 1–3 | TP-1 SEC-002 | Largest security reduction, and it shrinks the server |
| 3.5–4 | TP-2 SEC-005/007 | Small, server-only, and protects quota |
| 4–5.5 | TP-4 + TP-5 guidance text/icons/arrival | Safety-relevant and pure, so easy to test |
| 5.5–8 | TP-6 + TP-7 cold start and reroute | The core first-launch experience |
| 8–9.5 | TP-8 back, first run, live acknowledgement | UX blockers before the combined build |
| 9.5–10 | TP-10, A11Y-001, A11Y-003, DEBT-008 | Cheap wins |

Investigation items to settle during the sprint, before relying on them:
- The Render proxy hop count (for TP-2).
- The LocationIQ plan's daily limit (for TP-2's cap).
- Whether jsdom is available for TP-3.
- The Feather icon names available (TP-4).
- Whether `app/oauth/callback.tsx` is reachable from any deep link the app advertises (TP-1, client cleanup later).

**Definition of done for the sprint:**
- All sprint-scope items merged.
- CI green, with 0 lint warnings.
- One combined APK built.
- On the emulator: cold launch against a sleeping API, search, route, simulate, live start acknowledgement, back button, and multi-stop reroute with the GPX detour.
- QA-004 rows LG-1 to LG-8 recorded.

**Fallback scope** (at about 60% capacity): TP-9, TP-1, TP-2, TP-6, TP-4. Move TP-7, TP-8 and TP-10 to sprint 2.

**Single best first task:** TP-9 (CI). It takes half a day, carries no product risk, and protects every parallel merge after it.

## 5. Testing matrix

| Item | Unit | Integration (createApp / renderHook) | Emulator | Physical device |
|---|---|---|---|---|
| SEC-002 | — | 404 suite | — | — |
| SEC-005/007 | limiter | XFF buckets, queue cap | — | — |
| SEC-006 | — | map document (jsdom or string) | map still renders | — |
| BUG-001 | apiFetch | capabilities retry | cold launch vs sleeping Render | LG-1 |
| BUG-002/007 | remainingStops | reroute hook | GPX detour with 2 stops | LG-3/4 |
| BUG-003 | loop route | — | round-trip plan | — |
| BUG-004/005 | maneuver table | — | simulation screenshot | LG-2/6 |
| BUG-008/009, UX-003 | nextPanelOnBack | — | back key, fresh install | — |
| A11Y-001/003 | contrast script | — | TalkBack | — |
| QA-001 | — | CI run | — | — |
| QA-004 | — | — | LG-1..8 | LG-9/10, DHU |

## 6. Quality gates

- **Per PR:** CI `verify` green (check, lint with 0 warnings, test, build). New tests for each fixed item. No new dependency outside WS-5. No secrets. Only owned files touched.
- **Before the combined APK:** all five workstream PRs merged in order; `main` CI green; Render deploy healthy (`/api/health` 200); `/api/nexora/capabilities` still lists search as configured.
- **Before any road use:** QA-004 complete on a physical phone.
- **Migration:** none of the sprint items migrate stored data. TP-4 adds optional `Step` fields. TP-8 adds `prefs.liveAck`. Both are backward compatible, with defaults applied on read.
- **Rollout:** the server deploys on merge. The APK is distributed manually to the owner's emulator or phone.
- **Rollback:** Render "Rollback to previous deploy" or revert; reinstall the previous APK build id.

## 7. Reusable single-task prompt template

```text
You are implementing ONE approved NEXORA Maps roadmap item: <ITEM-ID> (<title>), as part of
workstream <WS-n>. Repo: github.com/Amepps1994/nexora-maps, branch from latest main.

Before coding:
1. git status and git log -5; confirm a clean tree on a new branch named fix/<item-id-lowercase>.
2. Read docs/roadmap/IMPLEMENTATION_PLAN.md (packet <TP-n> if any, and the WS-<n> row) and the
   <ITEM-ID> row of docs/roadmap/PRIORITISED_BACKLOG.csv. Re-verify the cited file:line evidence
   still matches the code; if it does not, stop and report what changed.
3. Touch ONLY the files that WS-<n> owns. Do not add dependencies (unless you are WS-5).
   Do not change docs/FEATURE_MANIFEST.json states without evidence. Do not start an EAS build.

Implement:
4. Write the regression test(s) first so they fail on current main, then implement the fix.
5. Keep the change minimal; no unrelated refactors.

Validate:
6. Run pnpm check, pnpm lint (0 warnings), pnpm test. Re-run only failing tests while fixing.
7. For UI items, describe the emulator check that still needs doing; do not claim it was done.

Report:
8. Open a PR titled "<ITEM-ID>: <short title>" listing: files changed, tests added, commands run
   with real outcomes, acceptance criteria met / not met, anything left for device testing, and
   any evidence that contradicted the audit. Do NOT edit docs/roadmap/* in a workstream PR
   (parallel PRs would conflict); statuses are updated in one follow-up PR after the merge.
```
