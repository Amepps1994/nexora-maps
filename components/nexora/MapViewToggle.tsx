import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import type { MapView } from "@/shared/nexora/map-view";
import { palette } from "./ui";

/** MAP-3D: one tap between the flat map and the tilted 3D map. Shows the view you get. */
export function MapViewToggle({
  view,
  onChange,
  dark = false,
}: {
  view: MapView;
  onChange: (view: MapView) => void;
  dark?: boolean;
}) {
  const next: MapView = view === "3d" ? "2d" : "3d";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        next === "3d" ? "Show 3D map with buildings" : "Show flat 2D map"
      }
      onPress={() => onChange(next)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: dark ? "#152235" : "#fff",
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[styles.text, { color: dark ? "#fff" : palette.ink }]}>
        {next === "3d" ? "3D" : "2D"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B1220",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  text: { fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
});
