# Car displays and lock-screen guidance

Status, 27 Nov 2026: **built, not yet tested on a device.** Android Auto, the lock-screen card
and the CarPlay scaffold compile into the JS bundle, pass typecheck/lint/unit tests and the
Expo prebuild output was checked. Nothing here has run on a phone, a Desktop Head Unit or a
car. Every car and lock-screen surface says **"Unverified for road use"** and simulated
guidance says **"Simulation"**, per ROADMAP F3.4-04 / CAR-DISPLAYS. Do not upgrade the
feature manifest until the tests below pass with recorded evidence.

## What is free and what is not

| Piece | Provider | Cost / approval |
| --- | --- | --- |
| Android Auto app (navigation category) | Google Android for Cars App Library via `@iternio/react-native-auto-play` 0.10.5 (MIT) | Free. Testing with the Desktop Head Unit is free. Publishing a navigation app to Android Auto on Google Play needs Google's Android Auto app review (free, part of Play review) |
| CarPlay | Apple CarPlay framework via the same library | Needs an **Apple Developer Program** membership (paid, ~$99/yr) **and** Apple's **CarPlay Navigation** entitlement (free application, Apple approves) |
| Manoeuvre icons on the car screen | Google Material Icons font (Apache 2.0), `assets/fonts/nexora_car_icons.ttf` | Free |
| Car route overview | Drawn with react-native-svg from the route geometry (no map tiles) | Free; real map tiles on the car need a tile source the offline-maps work chooses |
| Lock-screen card | `expo-notifications` local notification | Free |

## How it fits together

```
hooks/use-nexora.ts ──buildCarGuidance()──► lib/car/guidance-bus.ts ──► lib/car/car-displays.tsx  (Android Auto / CarPlay)
        ▲                                         │                 └─► lib/car/lock-screen-guidance.ts (notification)
        └──── onCarCommand("stop" | "toggleMute") ◄┘  (car buttons)
```

- `shared/nexora/car-guidance.ts`: pure snapshot (next manoeuvre, distance to it, remaining
  distance/time, ETA, status line). Unit tested in `tests/nexora-car-guidance.test.ts`.
- `hooks/use-nexora.ts`: one block before `return` publishes the snapshot and handles the
  car's End / Mute buttons. `source` is `"simulation"` today; the live GPS work switches it
  to `"live"` when guidance is GPS driven.
- `lib/car/car-displays.tsx`: on car connect, a `MapTemplate` with the route overview, the
  host's own manoeuvre card, travel estimates and Mute / End buttons. Traffic side is set to
  left (UK). `car-displays.web.ts` is the web no-op.
- `lib/car/lock-screen-guidance.ts`: while guidance runs and NEXORA is not in the
  foreground, one silent ongoing notification (channel `nexora-guidance`, low importance,
  public on the lock screen). Notification permission is asked when guidance first starts,
  not at launch. Removed when guidance ends or the app comes back to the foreground.
- `index.js`: new app entry (`package.json` `main`). Installs the library's car-safe timers
  first, starts car integrations, then loads `expo-router/entry`. Each step is wrapped so a
  failure is logged and the phone app still starts.
- `plugins/with-car-displays.js` + `app.config.ts` `carDisplays`: Android gradle properties
  (navigation category, phone build), car icon font into `res/font`, removes the library's
  CAR_FUEL / CAR_MILEAGE / CAR_SPEED permissions (NEXORA does not read vehicle data).
  CarPlay parts (entitlement, scene manifest, AppDelegate hook, font) apply only with
  `NEXORA_CARPLAY=1`.
- `react-native.config.js`: keeps the native module out of iOS builds unless
  `NEXORA_CARPLAY=1`, so the current iOS app is unchanged.
- Settings → "Car displays & lock screen" shows the real state (built / connected / waiting
  for Apple).

## Known limits

- **Lock screen with the phone locked:** there is no background location yet, so the card
  shows the last update the app made. It keeps updating while NEXORA's process is running
  (Android Auto connected keeps it running as a foreground service). Proper background
  guidance needs background location + a foreground service, coordinated with the live GPS
  work, and a DPIA update (docs/PRIVACY_SECURITY.md).
- **No map tiles on the car**, only the route line and position dot.
- **CarPlay on iOS changes the app to scenes.** The library notes `expo-splash-screen` and
  React Native `AppState` misbehave with scenes; this must be tested before CarPlay ships.
- The iOS AppDelegate hook was generated and checked by `expo prebuild` only; it has never
  been compiled (needs Xcode 27 on a Mac or an EAS iOS build).

## Test: Android Auto with the free Desktop Head Unit (DHU)

Needs a **new native build** (the current APK does not contain the car service). Either an
EAS build (uses build quota, needs Andrew's typed go-ahead) or a free local build on the PC
with Android Studio's SDK: `npx expo run:android --variant release`.

1. Android Studio → SDK Manager → SDK Tools → tick **Android Auto Desktop Head Unit
   Emulator** → Apply. It installs to `%LOCALAPPDATA%\Android\Sdk\extras\google\auto\`.
2. The phone or emulator needs the Android Auto app. An emulator must use a **Google Play**
   system image. A physical Android phone over USB is the most reliable option.
3. On the phone: Settings → Connected devices → Android Auto (or the Android Auto app) →
   tap **Version** 10 times → ⋮ → **Developer settings** → enable **Unknown sources** (the
   APK is not from Play) → ⋮ → **Start head unit server**.
4. On the PC: `adb forward tcp:5277 tcp:5277`, then run
   `%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe`.
5. Pick NEXORA in the DHU launcher. Expect: dark route overview, "Plan a route on your
   phone to start".
6. On the phone, plan a route and start guidance. Expect on the DHU: manoeuvre card with
   arrow and distance, ETA, "Simulation · Unverified for road use" while simulated.
7. Tap End on the DHU → phone guidance ends. Tap Mute → phone mute toggles.
8. Press Home on the phone while guiding → lock-screen card appears with next turn and ETA.
   Return to NEXORA → the card disappears.
9. Regression: launch the app with no car connected, check the map, search, routing and
   Settings still work (the new entry file runs first).

Record screenshots and `adb logcat | findstr "NEXORA AutoPlay"` output in `docs/` before
changing any manifest state.

## CarPlay: what Andrew needs to apply for

1. Join the **Apple Developer Program** (developer.apple.com/programs, paid yearly).
2. Request the CarPlay entitlement at **developer.apple.com/contact/carplay/**, choosing
   **CarPlay Navigation app**. Give the bundle id from app.config.ts
   (`space.manus.nexora.t265420090014141`) and describe turn-by-turn navigation. Apple reviews
   it; approval is not guaranteed and can take weeks.
3. After approval, in Certificates, Identifiers & Profiles enable the
   **CarPlay Navigation** capability on that App ID and regenerate the provisioning profile.
4. Build with `NEXORA_CARPLAY=1` (EAS iOS build on an Xcode 27 image). Test in Xcode's
   CarPlay Simulator (needs a Mac) or on an iPhone with a CarPlay head unit.
