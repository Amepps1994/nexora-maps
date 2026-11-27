// NEXORA app entry. Expo Router stays the app; this file only runs car integration setup
// first. See docs/CAR_DISPLAYS.md.
const { Platform } = require("react-native");
const Constants = require("expo-constants").default;

const car = Constants.expoConfig?.extra?.carDisplays ?? {};
const carLinked =
  (Platform.OS === "android" && car.androidAuto !== false) ||
  (Platform.OS === "ios" && car.carPlay === true);

if (carLinked) {
  try {
    // Keeps JS timers running while a car screen is driven with the phone locked.
    require("@iternio/react-native-auto-play/installTimers");
  } catch (e) {
    console.warn("[NEXORA car] background timers not installed", e);
  }
}

try {
  require("./lib/car/start").startCarIntegrations();
} catch (e) {
  console.warn("[NEXORA car] car integrations not started", e);
}

require("expo-router/entry");
