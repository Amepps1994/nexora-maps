import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
export const palette = {
  ink: "#0B1220",
  muted: "#5C6D68",
  teal: "#087F73",
  accent: "#18BFA9",
  line: "#E6ECE9",
  surface: "#FFFFFF",
  background: "#F5F7FA",
  blue: "#397BFF",
  amber: "#9B6500",
};
// One spacing, radius and type scale for the home surfaces, so cards,
// chips and sheets line up instead of each picking its own numbers.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const radius = { sm: 12, md: 16, lg: 22, pill: 999 };
export const type = {
  caption: 11,
  label: 13,
  body: 15,
  title: 20,
};
// A single soft shadow for floating controls on the map.
export const floatShadow = {
  shadowColor: "#0B1220",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 2,
} as const;
export function Mark({
  size = 30,
  color = "#087F73",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M4 27V7l7-3v11l14-9 3 2-17 19v-9l-7 9Z" fill={color} />
      <Path d="m21 4 9-2-2 9-3-4-4-3Z" fill={color} />
    </Svg>
  );
}
export function Icon({
  name,
  size = 22,
  color = palette.ink,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
}
export function IconButton({
  name,
  onPress,
  label,
  dark = false,
  active = false,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  label: string;
  dark?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: active ? palette.teal : dark ? "#152235" : "#fff",
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Icon
        name={name}
        color={active || dark ? "#fff" : palette.ink}
        size={21}
      />
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  dark = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
  dark?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && { backgroundColor: dark ? "#25364B" : "#EDF4F1" },
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          color={secondary ? (dark ? "#fff" : palette.teal) : "#fff"}
          size={19}
        />
      )}
      <Text
        style={[
          styles.buttonText,
          secondary && { color: dark ? "#fff" : palette.teal },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Badge({
  text,
  warning = false,
  dark = false,
}: {
  text: string;
  warning?: boolean;
  dark?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: warning
            ? dark
              ? "#392D18"
              : "#FFF5DD"
            : dark
              ? "#123A35"
              : "#E7F5EE",
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: warning ? "#AD760D" : palette.teal },
        ]}
      />
      <Text
        style={[
          styles.badgeText,
          {
            color: warning
              ? dark
                ? "#F5B544"
                : "#89601A"
              : dark
                ? "#62D6BB"
                : "#216D55",
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  iconButton: {
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
  button: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.teal,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 20,
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 20,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
});
