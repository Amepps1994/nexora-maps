/**
 * Starts car displays (Android Auto / CarPlay) and the lock-screen guidance card.
 * Called once from the app entry (index.js). Each part fails closed: an error here is
 * logged and never stops the phone app from launching.
 */
import { startCarDisplays } from "./car-displays";
import { startLockScreenGuidance } from "./lock-screen-guidance";

export function startCarIntegrations(): void {
  try {
    startCarDisplays();
  } catch (e) {
    console.warn("[NEXORA car] car displays not started", e);
  }
  try {
    startLockScreenGuidance();
  } catch (e) {
    console.warn("[NEXORA car] lock-screen guidance not started", e);
  }
}
