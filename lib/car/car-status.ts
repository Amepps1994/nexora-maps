/**
 * Build flags and the plain-language status shown in Settings for car displays and the
 * lock-screen guidance card. Pure: callers pass in platform, flags and connection state.
 */
export type CarDisplayFlags = {
  /** Android Auto is compiled into Android builds (config plugin + library). */
  androidAuto: boolean;
  /** CarPlay needs Apple's CarPlay navigation entitlement; off until Apple grants it. */
  carPlay: boolean;
};

export const DEFAULT_CAR_FLAGS: CarDisplayFlags = {
  androidAuto: true,
  carPlay: false,
};

export function readCarFlags(extra: unknown): CarDisplayFlags {
  const raw = (
    extra as { carDisplays?: Partial<CarDisplayFlags> } | null | undefined
  )?.carDisplays;
  return {
    androidAuto: raw?.androidAuto ?? DEFAULT_CAR_FLAGS.androidAuto,
    carPlay: raw?.carPlay ?? DEFAULT_CAR_FLAGS.carPlay,
  };
}

export type CarConnection = "unsupported" | "disconnected" | "connected";

export function carIntegrationStatus(
  platform: string,
  flags: CarDisplayFlags,
  connection: CarConnection,
): string {
  const verify = "unverified for road use until tested in a real car";
  if (platform === "android") {
    if (!flags.androidAuto)
      return "Android Auto off in this build · lock-screen card available";
    if (connection === "connected")
      return `Android Auto connected · lock-screen card on · ${verify}`;
    return `Android Auto ready (connect a car or Desktop Head Unit) · lock-screen card on · ${verify}`;
  }
  if (platform === "ios") {
    if (!flags.carPlay)
      return "CarPlay waiting for Apple's CarPlay navigation entitlement · lock-screen card on";
    if (connection === "connected") return `CarPlay connected · ${verify}`;
    return `CarPlay ready (connect a car or CarPlay Simulator) · ${verify}`;
  }
  return "CarPlay, Android Auto and lock-screen guidance need the iOS or Android app";
}
