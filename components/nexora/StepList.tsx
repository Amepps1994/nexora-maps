import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Route, Step } from "@/shared/nexora/domain";
import { Icon, palette } from "./ui";
import { stepItems } from "./screen-logic";

/**
 * The route as a numbered text list: the map's screen-reader alternative and
 * a pre-trip / in-trip overview. Each step is one accessible element.
 */
export function StepList({
  route,
  current,
  formatDistance,
  dark,
}: {
  route: Route | null | undefined;
  current?: Step | null;
  formatDistance: (m: number) => string;
  dark: boolean;
}) {
  const items = stepItems(route, current, formatDistance);
  const ink = dark ? "#EDF4F1" : palette.ink;
  const muted = dark ? "#A0B4AF" : palette.muted;
  const accent = dark ? "#62D6BB" : palette.teal;
  if (!items.length)
    return (
      <Text style={[s.detail, { color: muted }]}>
        This route has no turn-by-turn steps.
      </Text>
    );
  return (
    <View accessibilityRole="list" style={s.list}>
      {items.map((item) => (
        <View
          key={item.key}
          accessible
          accessibilityLabel={item.label}
          style={[
            s.item,
            { borderBottomColor: dark ? "#2B3A4B" : palette.line },
            item.status === "current" && {
              backgroundColor: dark ? "#173B38" : "#F0F8F3",
            },
          ]}
        >
          <View
            style={[
              s.number,
              { borderColor: item.status === "done" ? muted : accent },
            ]}
          >
            {item.arrive ? (
              <Icon name="flag" size={12} color={accent} />
            ) : item.status === "done" ? (
              <Icon name="check" size={12} color={muted} />
            ) : (
              <Text style={[s.numberText, { color: accent }]}>
                {item.index + 1}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                s.instruction,
                {
                  color: item.status === "done" ? muted : ink,
                  fontWeight: item.status === "current" ? "700" : "500",
                },
              ]}
            >
              {item.instruction}
            </Text>
            {!!item.distance && (
              <Text style={[s.detail, { color: muted }]}>
                then {item.distance}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: 0 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: 11, fontWeight: "700" },
  instruction: { fontSize: 14, lineHeight: 20 },
  detail: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
