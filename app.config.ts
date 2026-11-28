// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "space.manus.nexora.t265420090014141";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "NEXORA Maps",
  appSlug: "nexora",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl:
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519664104693843/jZujWJpKIAkArkxY.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

// Expo serializes this browser-safe subset into native and web bundles. Server secrets must
// never enter this object. The Manus OAuth values were removed with the login stack (SEC-002).
const publicRuntime = {
  // Native builds need an absolute API URL. Every eas.json build profile sets EXPO_PUBLIC_API_BASE_URL
  // explicitly (OPS-003); this fallback to the Render-hosted backend (render.yaml) only covers local runs.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "https://nexora-api-cfoh.onrender.com",
};

// Car displays (docs/CAR_DISPLAYS.md). Android Auto is built in; CarPlay stays off until
// Apple grants the CarPlay navigation entitlement, then build with NEXORA_CARPLAY=1.
// Both are unverified for road use until tested in a real car.
const carDisplays = {
  androidAuto: process.env.NEXORA_ANDROID_AUTO !== "0",
  carPlay: process.env.NEXORA_CARPLAY === "1",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  owner: "epps1994",
  // Bump on every release build (docs/RELEASE.md): the live-start acknowledgement is keyed
  // to this value (UX-003), so a new version asks again.
  version: "1.1.0",
  extra: { ...publicRuntime, carDisplays, eas: { projectId: "97028c96-a8c6-4a91-9b16-ce0f465a5c0b" } },
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0B1220",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: [
      "POST_NOTIFICATIONS",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
    ],
    // NEXORA never records audio (voice guidance is text-to-speech only), so strip the
    // microphone permission even if a dependency's manifest tries to merge it in (PRIV-001).
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-asset",
    "expo-router",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow NEXORA to use your foreground location for planning and live turn-by-turn guidance while the app is open.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    ["./plugins/with-car-displays.js", carDisplays],
    ...(carDisplays.carPlay
      ? ([["expo-font", { ios: { fonts: ["./assets/fonts/nexora_car_icons.ttf"] } }]] as [
          string,
          unknown,
        ][])
      : []),
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
