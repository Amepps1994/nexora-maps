# NEXORA Maps implementation plan

Build the requested Expo React Native + TypeScript mobile app, retaining the fixed Manus starter. The initial product is a test-only London planning and simulated-navigation vertical slice, not production road guidance. No publication, purchases, paid providers, release builds or commercial terms acceptance are authorised.

## Architecture and scope

Use Expo Router for application entry, React Native components for all product UI, AsyncStorage for local guest settings, saved places, demo reports and opt-in trip history. A small typed React state hook owns the navigation state machine; pure TypeScript functions own route scoring, stable reroute decisions, unit conversion, deterministic instructions and incident policies. Backend Express endpoints adapt route providers and configured search providers with validated inputs, bounded requests and redacted errors. No location traces in analytics or server storage. Keep the managed starter schema and migrate it before API startup; do not imply PostGIS support.

The map uses Leaflet in a platform-isolated iframe on web and an Expo-compatible WebView on mobile. OpenStreetMap standard raster tiles are for normal interactive viewing only, visibly attributed, cache headers respected, never prefetched for offline. Rendering is a planning preview, not a native navigation SDK. Expose map pan, zoom, pin selection, scale and recenter; rotate/pitch/3D need a native vector map adapter later.

Search ships with an explicitly labelled London demo catalogue and coordinate input. Live address/postcode search uses a configurable licensed/self-hosted geocoder adapter only. Public Nominatim is not enabled: its current policy prohibits automatic platform-generated generic search absent a deliberate responsible developer decision; no autocomplete against that public service. Search results are never represented as current business metadata. Routing uses OSRM test routing for driving when reachable, with engine geometry and steps, no traffic or legal restriction guarantee. Walking/cycling need verified separate profile endpoints; otherwise explicitly disabled. Provider failure never silently substitutes fabricated geometry. An explicitly requested synthetic fixture offers deterministic demo playback, with a persistent simulation badge.

Finish map, search/pin, manual origin, alternative route cards, fastest/fewer-turns scoring, preview, route lock, simulator instruction progress and arrival before extending local saved places, trips, test community report/confirm/expiry/review, privacy and provider status. Manual report entry is blocked during playback. Location permission is contextual and foreground-only; a real location marker is separate from simulated position. Native foreground location integration is implemented but not device-verified; live road guidance remains blocked.

The complete original brief is retained in docs/MASTER_PROMPT.txt. docs/FEATURE_MANIFEST.json and docs/ROADMAP.md preserve every feature clause, priority, prerequisite, state, acceptance criterion and estimated effort. P1/P2 features remain clearly unavailable where provider contracts/native validation are missing. Documentation covers setup, licensing, privacy/security drafts, moderation, costs marked TBD, actual automated test output and a real device test plan.

## Project structure

- app/: Expo Router entry and native-safe screen shell.
- components/nexora/: shared icons, map boundary, sheet/cards, buttons and screen content.
- hooks/use-nexora.ts: local guest persistence, state transitions and playback orchestration.
- shared/nexora/: provider-independent schemas, route/scoring/reroute/unit/incident logic and synthetic fixtures.
- server/nexora/: provider adapters and validated REST routes; no unauthenticated admin API.
- tests/: deterministic domain/provider validation tests.
- assets/images/: original square launcher mark, splash and platform icons.
- docs/: full brief, status manifest, roadmap, provider notes, security/privacy, device validation and delivery evidence.

## Design

Reuse the brief's calm original premium map-first identity. Design movement: Swiss wayfinding meets contemporary outdoor editorial. Core principles: map dominance, glanceable hierarchy, honest capability labels and restrained touch-first controls. Use chalk-white panels over a desaturated real map, midnight text, route blue and deep accessible teal (#087F73 for text/buttons; #18BFA9 for accents). Amber signals test/uncertainty; never colour alone. Dark mode replaces surfaces with midnight and uses a dark-filtered raster presentation, labelled as a display treatment rather than a separate licensed map source.

Layout: floating compact wordmark and status over the map, a prominent search capsule, horizontal discovery chips, right-side map tools, and a rounded bottom journey sheet anchored above four simple tabs. Desktop remains a responsive map workspace, not a landing page. Signature elements: a split-path N/compass mark, fine topographic-inspired route motifs only in branding, and small uppercase teal section labels. System sans-serif uses 28/22px headlines, 16px body and 12–13px supporting labels; numeric distance uses tabular figures. Touch targets at least 48px. Keep safe areas and reduced-motion settings respected.

Interactions are concise, reversible and one-handed. Sheets reveal details without removing spatial context; route cards show real known inputs and disclose unknown costs/reliability. No animation beyond stateful feedback and route playback; reduced motion turns smooth panning off. Brand essence: journeys with less second-guessing for privacy-conscious UK travellers. Personality: calm, precise, considerate. Voice: 'A better way to your day.' and 'Your route. Your call.' The wordmark pairs a custom split-path compass symbol with widely tracked NEXORA lettering. Signature colour: journey teal.

## Decisions

26 Nov 2026: user delegates reasonable defaults and asks to build without stopping at planning. Proceed on supplied brief with the bounded P0 slice above. Expo 57 / React Native 0.86 are the installed supported starter versions. Real iOS/Android validation, background navigation, offline graph, live traffic, CarPlay and Android Auto are blocked gates. No AI copilot in P0.
