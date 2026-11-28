import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { LIVE_ACK_STORE, needsLiveAck, releaseId } from "./screen-logic";

/**
 * Release the live GPS acknowledgement is keyed to (UX-003): the app version
 * plus the native build number where the platform reports one (iOS
 * buildNumber, or versionCode / buildNumber when app.config.ts sets them).
 * With EAS's remote version source the Android versionCode is not visible to
 * JS without expo-application, so on Android the key changes when `version`
 * in app.config.ts is bumped for each release (docs/RELEASE.md).
 */
export const APP_VERSION = releaseId({
  version: Constants.expoConfig?.version,
  build:
    Constants.platform?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    Constants.expoConfig?.ios?.buildNumber ??
    null,
});

/** True when the live-start acknowledgement still has to be shown. */
export async function liveAckRequired(): Promise<boolean> {
  try {
    return needsLiveAck(
      await AsyncStorage.getItem(LIVE_ACK_STORE),
      APP_VERSION,
    );
  } catch {
    return true;
  }
}

export async function saveLiveAck(): Promise<void> {
  try {
    await AsyncStorage.setItem(LIVE_ACK_STORE, APP_VERSION);
  } catch {
    // Not saved: the acknowledgement is asked again next time, which is safe.
  }
}
