/**
 * Location watch options for live guidance, in the order they are tried.
 *
 * The first asks for the best accuracy, which on Android may show Google's
 * "Location Accuracy" dialog. If the user taps "No thanks" the watch fails even
 * though GPS works, so the second attempt asks for high (GPS) accuracy without
 * that dialog. Pure: the expo-location accuracy values are passed in, so this
 * is testable without native modules.
 */
export interface LiveWatchOptions {
  accuracy: number;
  timeInterval: number;
  distanceInterval: number;
  mayShowUserSettingsDialog?: boolean;
}

export function liveWatchAttempts(accuracy: {
  best: number;
  high: number;
}): LiveWatchOptions[] {
  const common = { timeInterval: 1000, distanceInterval: 2 };
  return [
    { accuracy: accuracy.best, ...common },
    { accuracy: accuracy.high, ...common, mayShowUserSettingsDialog: false },
  ];
}
