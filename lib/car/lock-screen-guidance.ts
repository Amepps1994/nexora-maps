/**
 * Lock-screen / notification-shade guidance card.
 *
 * While guidance runs and the app is not in the foreground, one silent, ongoing
 * notification shows the next manoeuvre, distance and ETA. It is replaced in place (same
 * identifier) and removed when guidance ends or the app returns to the foreground.
 *
 * Limits (stated in Settings and docs/CAR_DISPLAYS.md):
 *  - No background location yet, so with the phone locked the card shows the last update
 *    the app made; it keeps updating only while the app is running (e.g. with Android Auto
 *    connected, which keeps the app alive as a foreground service).
 *  - Unverified for road use until tested in a real car.
 *  - Live GPS guidance only runs while the app is open, so a backgrounded live card says
 *    "Guidance paused. Open NEXORA to continue." instead of a turn that may be stale (UX-010).
 *
 * Permission (UX-010): the notification permission is requested only by
 * `requestGuidanceNotifications()`, which the app calls from onboarding's location step
 * and the live GPS acknowledgement, before guidance starts. Guidance updates never ask,
 * so no system dialog appears over an active guidance screen.
 */
import { AppState, Platform, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import {
  lockScreenContent,
  type CarGuidanceSnapshot,
} from "@/shared/nexora/car-guidance";
import { subscribeCarGuidance } from "./guidance-bus";
import {
  backgroundCardContent,
  mayAskNotifications,
  type NotificationAskPoint,
} from "@/components/nexora/screen-logic";

export const GUIDANCE_CHANNEL_ID = "nexora-guidance";
const NOTIFICATION_ID = "nexora-guidance-card";

let started = false;
let permission: "unknown" | "granted" | "denied" = "unknown";
let shown = false;
let lastKey = "";

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(GUIDANCE_CHANNEL_ID, {
    name: "Navigation guidance",
    description: "Next turn and arrival time while NEXORA guidance runs",
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
    showBadge: false,
  });
}

/**
 * Whether the card may be shown. With `ask` false (guidance updates) this only reads the
 * current permission and never opens a system dialog.
 */
async function ensurePermission(ask: boolean): Promise<boolean> {
  if (permission === "granted") return true;
  if (permission === "denied" && !ask) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && ask && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (granted) {
      permission = "granted";
      await ensureChannel();
    } else if (ask || !current.canAskAgain) {
      permission = "denied";
    }
  } catch {
    if (ask) permission = "denied";
  }
  return permission === "granted";
}

/**
 * Ask for the guidance-card notification permission. Call only from a screen shown before
 * guidance starts; returns false (without asking) on web or while guidance is active.
 */
export async function requestGuidanceNotifications(
  point: NotificationAskPoint,
  guidanceActive = false,
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!mayAskNotifications(point, guidanceActive))
    return ensurePermission(false);
  return ensurePermission(true);
}

async function clear(): Promise<void> {
  if (!shown) return;
  shown = false;
  lastKey = "";
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {
    // already gone
  }
}

async function show(s: CarGuidanceSnapshot): Promise<void> {
  const { title, body } = backgroundCardContent(s, lockScreenContent(s));
  const key = `${title}|${body}`;
  if (shown && key === lastKey) return;
  if (!(await ensurePermission(false))) return;
  lastKey = key;
  shown = true;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        data: { kind: "nexora-guidance" },
      },
      trigger:
        Platform.OS === "android" ? { channelId: GUIDANCE_CHANNEL_ID } : null,
    });
  } catch {
    shown = false;
  }
}

/** Start mirroring guidance to the lock screen. Safe to call more than once. */
export function startLockScreenGuidance(): void {
  if (started || Platform.OS === "web") return;
  started = true;
  let latest: CarGuidanceSnapshot | null = null;
  let appState: AppStateStatus = AppState.currentState;

  const update = () => {
    const wanted = !!latest && (latest.active || latest.phase === "arrived");
    if (!wanted || appState === "active") {
      void clear();
      return;
    }
    void show(latest!);
  };

  subscribeCarGuidance((s) => {
    // Never ask for permission here (UX-010): see requestGuidanceNotifications.
    latest = s;
    update();
  });
  AppState.addEventListener("change", (next) => {
    appState = next;
    update();
  });
}
