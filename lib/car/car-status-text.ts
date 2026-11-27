import { Platform } from "react-native";
import Constants from "expo-constants";
import { getCarConnection } from "./car-displays";
import { carIntegrationStatus, readCarFlags } from "./car-status";

/** Settings text for car displays and the lock-screen card (read at render time). */
export function carStatusText(): string {
  return carIntegrationStatus(
    Platform.OS,
    readCarFlags(Constants.expoConfig?.extra),
    getCarConnection(),
  );
}
