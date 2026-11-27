// Keeps the car display native module out of iOS builds until CarPlay is switched on
// (NEXORA_CARPLAY=1, only after Apple grants the CarPlay navigation entitlement).
// Android always links it for Android Auto. See docs/CAR_DISPLAYS.md.
const carPlay = process.env.NEXORA_CARPLAY === "1";

module.exports = {
  dependencies: carPlay
    ? {}
    : {
        "@iternio/react-native-auto-play": { platforms: { ios: null } },
      },
};
