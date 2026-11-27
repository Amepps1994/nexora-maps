import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { LIVE_ACK_STORE, needsLiveAck } from "./screen-logic";

/** App version the live GPS acknowledgement is keyed to. */
export const APP_VERSION = Constants.expoConfig?.version ?? "0";

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
