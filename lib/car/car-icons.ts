/**
 * Subset of Google Material Icons (Apache License 2.0) used on car displays.
 * Font file: assets/fonts/nexora_car_icons.ttf (copied from @expo/vector-icons MaterialIcons.ttf).
 * Code points come from @expo/vector-icons glyphmaps/MaterialIcons.json.
 */
export const CAR_ICON_FONT = "nexora_car_icons";
export const CAR_GLYPHS = {
  "turn-left": 60326,
  "turn-right": 60331,
  "turn-slight-left": 60324,
  "turn-slight-right": 60314,
  "turn-sharp-left": 60327,
  "turn-sharp-right": 60330,
  "u-turn-left": 60321,
  "u-turn-right": 60322,
  straight: 60309,
  "roundabout-left": 60313,
  "roundabout-right": 60323,
  "fork-left": 60320,
  "fork-right": 60332,
  "ramp-left": 60316,
  "ramp-right": 60310,
  merge: 60312,
  "directions-boat": 58674,
  flag: 57683,
  place: 58719,
  navigation: 58717,
  "volume-off": 57423,
  "volume-up": 57424,
  close: 58829,
  "trip-origin": 58747,
} as const;
export type CarGlyphName = keyof typeof CAR_GLYPHS;
