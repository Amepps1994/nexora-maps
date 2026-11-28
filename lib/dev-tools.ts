import { devToolsEnabled } from "@/components/nexora/screen-logic";

/**
 * True in development builds (or builds made with EXPO_PUBLIC_NEXORA_DEV_TOOLS=1):
 * shows simulated navigation and the test event buttons. Release builds start
 * live GPS guidance only.
 */
export const DEV_TOOLS = devToolsEnabled(
  typeof __DEV__ !== "undefined" && __DEV__,
  process.env.EXPO_PUBLIC_NEXORA_DEV_TOOLS,
);
