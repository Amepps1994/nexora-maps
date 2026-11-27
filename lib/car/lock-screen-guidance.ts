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
 */
import { AppState, Platform, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import {
  lockScreenContent,
  type CarGuidanceSnapshot,
} from "@/shared/nexora/car-guidance";
import { subscribeCarGuidance } from "./guidance-bus";

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

async function ensurePermission(): Promise<boolean> {
  if (permission !== "unknown") return permission === "granted";
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    permission = granted ? "granted" : "denied";
    if (granted) await ensureChannel();
  } catch {
    permission = "denied";
  }
  return permission === "granted";
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
  const { title, body } = lockScreenContent(s);
  const key = `${title}|${body}`;
  if (shown && key === lastKey) return;
  if (!(await ensurePermission())) return;
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
    // Ask for notification permission when guidance starts, not at app launch.
    if (s.active && permission === "unknown") void ensurePermission();
    latest = s;
    update();
  });
  AppState.addEventListener("change", (next) => {
    appState = next;
    update();
  });
}
