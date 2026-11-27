/**
 * Manoeuvre helpers shared by the route mapper, voice prompts, car displays and the
 * on-screen turn icon. Pure: no React, no native modules.
 *
 * Direction comes from the provider's structured `Step.modifier` when present. Older
 * saved routes (and demo fixtures) have no modifier, so the instruction text is the
 * fallback. Only the part before "onto <road>" / "to stay on <road>" is read, so a road
 * called "Left Bank Road" never changes the arrow.
 */
import type { Step } from "./domain";

export type TurnDirection =
  | "left"
  | "right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "uturn"
  | "straight";

/** Feather icon names used for the turn card. All exist in @expo/vector-icons Feather. */
export type ManeuverIconName =
  | "flag"
  | "map-pin"
  | "navigation"
  | "arrow-up"
  | "arrow-up-left"
  | "arrow-up-right"
  | "corner-up-left"
  | "corner-up-right"
  | "rotate-ccw"
  | "rotate-cw"
  | "anchor";

const MODIFIER_DIRECTIONS: Record<string, TurnDirection> = {
  uturn: "uturn",
  "sharp left": "sharp-left",
  "sharp right": "sharp-right",
  "slight left": "slight-left",
  "slight right": "slight-right",
  left: "left",
  right: "right",
  straight: "straight",
};

const TEXT_DIRECTIONS: readonly [RegExp, TurnDirection][] = [
  [/\bu-?turn\b/i, "uturn"],
  [/\bsharp left\b/i, "sharp-left"],
  [/\bsharp right\b/i, "sharp-right"],
  [/\bslight left\b/i, "slight-left"],
  [/\bslight right\b/i, "slight-right"],
  [/\bleft\b/i, "left"],
  [/\bright\b/i, "right"],
];

const ROAD_CLAUSE = /\b(?:onto|to stay on)\s+(.+)$/i;

/** OSRM modifier string → direction; undefined when absent or unknown. */
export function directionFromModifier(
  modifier: string | undefined,
): TurnDirection | undefined {
  if (!modifier) return undefined;
  return MODIFIER_DIRECTIONS[modifier.trim().toLowerCase()];
}

/** Direction from instruction text, ignoring the road-name clause. */
export function directionFromText(text: string): TurnDirection {
  const head = (text || "").replace(ROAD_CLAUSE, "");
  for (const [re, dir] of TEXT_DIRECTIONS) if (re.test(head)) return dir;
  return "straight";
}

/** Road name from "… onto <road>" or "… to stay on <road>". */
export function roadNameFromText(text: string): string | undefined {
  const m = (text || "").match(ROAD_CLAUSE);
  return m ? m[1].trim() : undefined;
}

export function stepDirection(
  step: Pick<Step, "modifier" | "instruction">,
): TurnDirection {
  return (
    directionFromModifier(step.modifier) ?? directionFromText(step.instruction)
  );
}

const SILENT_TYPES = new Set(["new name", "continue"]);

/**
 * True when a step only marks a road-name change and needs no spoken prompt.
 * `continue` / `new name` are silent only when they go straight on: a `continue`
 * with a `uturn`, `left` or `right` modifier is a real manoeuvre and must be spoken.
 */
export function isSilentStep(
  step: Pick<Step, "type" | "modifier" | "instruction">,
): boolean {
  if (!SILENT_TYPES.has((step.type || "").toLowerCase())) return false;
  return stepDirection(step) === "straight";
}

function isRoundabout(type: string): boolean {
  return (
    type === "roundabout" ||
    type === "rotary" ||
    type.startsWith("roundabout") ||
    type.startsWith("rotary")
  );
}

/** Turn-card icon from the step's type and direction. Falls back to straight ahead. */
export function maneuverIcon(
  step: Pick<Step, "type" | "modifier" | "instruction"> | null | undefined,
): ManeuverIconName {
  if (!step) return "arrow-up";
  const type = (step.type || "").toLowerCase();
  if (type.includes("arrive")) return "flag";
  if (type.includes("waypoint") || type === "synthetic-stop") return "map-pin";
  // A "roundabout turn" (mini-roundabout) is drawn as the turn itself.
  if (isRoundabout(type) && type !== "roundabout turn") return "rotate-cw";
  if (type === "ferry") return "anchor";
  const direction = stepDirection(step);
  if (type === "depart" && direction === "straight") return "navigation";
  switch (direction) {
    case "uturn":
      return "rotate-ccw";
    case "left":
    case "sharp-left":
      return "corner-up-left";
    case "right":
    case "sharp-right":
      return "corner-up-right";
    case "slight-left":
      return "arrow-up-left";
    case "slight-right":
      return "arrow-up-right";
    default:
      return "arrow-up";
  }
}
