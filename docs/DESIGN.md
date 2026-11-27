# Original design and component system

NEXORA uses an original split-path/compass identity, not Google/Waze marks or assets. The square native icon is bundled across iOS/Android/splash/favicon, and the launcher identity is registered as durable project logo metadata. Product screens remain React Native; only the map rendering surface is isolated web code.

## Tokens and components

Primary button/text teal is `#087F73`; accent teal is `#18BFA9`; ink is `#0B1220`; route blue is `#397BFF`; neutral secondary text is `#647570`. Light surfaces are white and `#F5F7FA`, with `#E6ECE9` dividers. Dark surface is `#152235`, text `#EDF4F1`, secondary `#A0B4AF` and light teal `#62D6BB`. Warnings use readable brown/amber on pale amber in light mode and amber on deep brown in dark mode. The OS standard/system sans-serif requires no externally licensed display font. Headings are 24–27 px; main search/action labels 15–16 px; supporting labels range 9–14 px. Small supporting sizes are a known accessibility-review item, not proof of AA conformance.

`ui.tsx` supplies Mark, Icon, IconButton, Button and Badge. `JourneyMap.tsx` supplies the renderer boundary and loaded/error/retry state. `Panels.tsx` supplies searchable results, place facts, route cards/comparison, route lock, permission/privacy cards, empty/error states and local incident/category/review controls. `NexoraApp.tsx` supplies floating search, category chips, anchored scrolling bottom sheets, Home/Trips/Saved/Settings, next-turn banner, speed-unknown tile, simulation event/recovery alert and arrival view. Radius ranges 12–25 px; controls use roughly 48 px targets and 8–16 px gaps. No photo/review/business-image placeholders, fake chart data or decorative driving analytics are used.

## Implemented screens

Explore, search, place details, route preview/alternatives, active simulation and arrival, safe test-report flow/review, local Trips, Saved, Settings, appearance, privacy/export, provider status and optional guest-benefits sheet are implemented. The benefits sheet is accessible via About rather than a registration or permission wall. Offline capabilities are a blocked-state section, not a fake downloader. Production admin, waypoint editor, schedule, EV/transit/AI/3D and car-integration screens are not implemented.

## Safety and accessibility checklist

Simulation-only labels persist, real and synthetic route appearance differ, unknown speed/limits remain unknown, keyboard/report forms are absent from moving playback, bottom tabs hide during playback, End is one action, closure safe-stop cannot be resumed without explicit simulated recovery, and unavailable voice explains its prerequisite rather than pretending to mute sound. Test-control event injection is not a supported real-driver interaction. Map attribution is placed clear of phone sheets; map pins and user GPS/simulated marker use different shapes.

Standard RN font scaling and accessibility labels/roles are used; reduced-motion toggles disable smooth camera motion; appearance and units are user-controlled. A 390-pixel responsive web viewport was inspected. Native VoiceOver/TalkBack, complete semantic traversal, focus traps/order, keyboard accessibility, 200% text, contrast audit, safe-area/landscape and OS permission/audio tests remain pending in DEVICE_TEST_PLAN.md. No WCAG certification or physical-device safety claim is made. Sheets scroll but are not draggable. A future native navigation SDK needs its own human-factors/device validation and cannot inherit clearance from this UI.
