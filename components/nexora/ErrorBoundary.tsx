import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { boundaryState, type BoundaryState } from "./screen-logic";

/**
 * Root error boundary: a render error shows a recovery screen instead of a
 * blank app. "Try again" re-mounts the tree; saved places and settings live
 * in local storage and are not touched.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = boundaryState(null);

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return boundaryState(error);
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // No crash reporting service is configured; keep the stack in device logs.
    console.error("NEXORA render error", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={s.root} accessibilityRole="alert">
        <Text style={s.title}>Something went wrong.</Text>
        <Text style={s.copy}>
          NEXORA hit an unexpected problem and stopped this screen. Your saved
          places and settings are still on this device.
        </Text>
        <Text style={s.detail} selectable>
          {this.state.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState(boundaryState(null))}
          style={s.button}
        >
          <Text style={s.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 14,
    backgroundColor: "#FFFFFF",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#0B1220" },
  copy: { fontSize: 14, lineHeight: 21, color: "#5C6D68", textAlign: "center" },
  detail: { fontSize: 12, color: "#5C6D68", textAlign: "center" },
  button: {
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: "#087F73",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
