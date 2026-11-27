/**
 * Expo config plugin: Android Auto + (gated) CarPlay for NEXORA Maps.
 *
 * Uses @iternio/react-native-auto-play (MIT), which ships the Android for Cars App Library
 * CarAppService and manifest entries. This plugin only adds what an Expo app has to supply:
 *
 * Android (always, unless androidAuto: false)
 *  - gradle.properties: navigation app category, phone (not Automotive OS) build.
 *  - res/font/nexora_car_icons.ttf: Material Icons glyphs for manoeuvre arrows/buttons.
 *  - Removes the library's CAR_FUEL / CAR_MILEAGE / CAR_SPEED permissions: NEXORA does not
 *    read vehicle telemetry (data minimisation, docs/PRIVACY_SECURITY.md).
 *  - Names the car navigation notification channel.
 *
 * iOS (only with carPlay: true, after Apple grants the CarPlay navigation entitlement)
 *  - com.apple.developer.carplay-maps entitlement.
 *  - UIApplicationSceneManifest with the library's phone + CarPlay scene delegates.
 *  - AppDelegate hook the library calls to render React on the CarPlay map surface.
 *  Without carPlay: true none of this is applied and react-native.config.js keeps the
 *  native module out of the iOS build, so the iOS app is unchanged.
 */
const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withAppDelegate,
  withDangerousMod,
  withEntitlementsPlist,
  withGradleProperties,
  withInfoPlist,
  withStringsXml,
} = require("expo/config-plugins");

const FONT_SOURCE = "assets/fonts/nexora_car_icons.ttf";
const REMOVED_PERMISSIONS = [
  "com.google.android.gms.permission.CAR_FUEL",
  "com.google.android.gms.permission.CAR_MILEAGE",
  "com.google.android.gms.permission.CAR_SPEED",
];

function setGradleProperty(props, key, value) {
  const existing = props.find((p) => p.type === "property" && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: "property", key, value });
}

function withAndroidAuto(config) {
  config = withGradleProperties(config, (c) => {
    setGradleProperty(
      c.modResults,
      "ReactNativeAutoPlay_androidAutoAppCategory",
      "navigation",
    );
    setGradleProperty(
      c.modResults,
      "ReactNativeAutoPlay_isAutomotiveApp",
      "false",
    );
    return c;
  });

  config = withDangerousMod(config, [
    "android",
    async (c) => {
      const src = path.join(c.modRequest.projectRoot, FONT_SOURCE);
      const dir = path.join(
        c.modRequest.platformProjectRoot,
        "app/src/main/res/font",
      );
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.copyFile(src, path.join(dir, "nexora_car_icons.ttf"));
      return c;
    },
  ]);

  config = withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    const perms = (manifest["uses-permission"] =
      manifest["uses-permission"] || []);
    for (const name of REMOVED_PERMISSIONS) {
      const found = perms.find((p) => p.$ && p.$["android:name"] === name);
      if (found) found.$["tools:node"] = "remove";
      else perms.push({ $: { "android:name": name, "tools:node": "remove" } });
    }
    return c;
  });

  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: "AutoPlayNotificationChannelName" },
          _: "NEXORA car navigation",
        },
      ],
      c.modResults,
    );
    return c;
  });
  return config;
}

const SCENE_MANIFEST = {
  CPSupportsInstrumentClusterNavigationScene: true,
  UIApplicationSupportsMultipleScenes: true,
  UISceneConfigurations: {
    CPTemplateApplicationInstrumentClusterSceneSessionRoleApplication: [
      {
        UISceneClassName: "CPTemplateApplicationInstrumentClusterScene",
        UISceneConfigurationName: "CarPlayCluster",
        UISceneDelegateClassName: "ClusterSceneDelegate",
      },
    ],
    CPTemplateApplicationSceneSessionRoleApplication: [
      {
        UISceneClassName: "CPTemplateApplicationScene",
        UISceneConfigurationName: "CarPlayHeadUnit",
        UISceneDelegateClassName: "HeadUnitSceneDelegate",
      },
    ],
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneClassName: "UIWindowScene",
        UISceneConfigurationName: "WindowApplication",
        UISceneDelegateClassName: "WindowApplicationSceneDelegate",
      },
    ],
  },
};

const APP_DELEGATE_HOOK = `
  // NEXORA car displays: lets @iternio/react-native-auto-play render React on CarPlay.
  @objc func getRootViewForAutoplay(
    moduleName: String,
    initialProperties: [String: Any]?
  ) -> UIView? {
    var autoPlayRootView: UIView?
    if let factory = reactNativeFactory?.rootViewFactory as? ExpoReactRootViewFactory {
      autoPlayRootView = factory.superView(
        withModuleName: moduleName,
        initialProperties: initialProperties,
        bundleConfiguration: RCTBundleConfiguration(),
        devMenuConfiguration: RCTDevMenuConfiguration(),
      )
    }
    if autoPlayRootView == nil, let factory = reactNativeFactory?.rootViewFactory {
      autoPlayRootView = factory.view(withModuleName: moduleName, initialProperties: initialProperties)
    }
    return autoPlayRootView
  }
`;

function withCarPlay(config) {
  config = withEntitlementsPlist(config, (c) => {
    c.modResults["com.apple.developer.carplay-maps"] = true;
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return c;
  });
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== "swift") {
      throw new Error(
        "with-car-displays: CarPlay hook expects a Swift AppDelegate",
      );
    }
    const src = c.modResults.contents;
    if (!src.includes("getRootViewForAutoplay")) {
      const marker = /class AppDelegate[^{]*\{/;
      if (!marker.test(src))
        throw new Error("with-car-displays: AppDelegate class not found");
      c.modResults.contents = src.replace(
        marker,
        (m) => `${m}\n${APP_DELEGATE_HOOK}`,
      );
    }
    return c;
  });
  return config;
}

module.exports = function withCarDisplays(config, props = {}) {
  const { androidAuto = true, carPlay = false } = props;
  if (androidAuto) config = withAndroidAuto(config);
  if (carPlay) config = withCarPlay(config);
  return config;
};
