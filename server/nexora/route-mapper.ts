import { osrmSchema } from "../../shared/nexora/provider";
import type { Route } from "../../shared/nexora/domain";

type Mode = "driving" | "walking" | "cycling";

const DIRECTION_WORDS: Record<string, string> = {
  left: "left",
  right: "right",
  "slight left": "slight left",
  "slight right": "slight right",
  "sharp left": "sharp left",
  "sharp right": "sharp right",
  straight: "straight",
  uturn: "uturn",
};

function directionWord(modifier: unknown): string | undefined {
  return typeof modifier === "string"
    ? DIRECTION_WORDS[modifier.trim().toLowerCase()]
    : undefined;
}

/** "left"/"slight left" → "left"; used for keep/fork/ramp phrasing. */
function side(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  if (dir.endsWith("left")) return "left";
  if (dir.endsWith("right")) return "right";
  return undefined;
}

/** Spoken/written instruction for an OSRM step (BUG-004). The direction
 * words stay in plain English so car displays and voice read the same text. */
export function instruction(step: any, legIndex = 0, legCount = 1): string {
  const m = step?.maneuver || {};
  const type = String(m.type || "");
  const dir = directionWord(m.modifier);
  const roadName =
    (typeof step?.name === "string" && step.name.trim()) ||
    (typeof step?.ref === "string" && step.ref.trim()) ||
    "";
  const onto = roadName ? ` onto ${roadName}` : "";
  const turnPhrase = (d: string) =>
    d.startsWith("slight") ? `Keep ${side(d)}` : `Turn ${d}`;

  if (type === "depart")
    return `Head ${dir && dir !== "uturn" ? dir : "straight"}${onto}`;
  if (type === "arrive")
    return legIndex < legCount - 1
      ? `Arrive at stop ${legIndex + 1}`
      : "Arrive at your destination";
  if (dir === "uturn") return `Make a U-turn${onto}`;
  if (type === "roundabout" || type === "rotary") {
    const exit = Number.isInteger(m.exit) && m.exit > 0 ? m.exit : null;
    return exit
      ? `At the roundabout, take exit ${exit}${onto}`
      : `At the roundabout, continue${onto}`;
  }
  if (type === "exit roundabout" || type === "exit rotary")
    return `Exit the roundabout${onto}`;
  if (type === "continue") {
    if (!dir || dir === "straight") return `Continue${onto}`;
    return `${turnPhrase(dir)}${roadName ? ` to stay on ${roadName}` : ""}`;
  }
  if (type === "new name") {
    if (!dir || dir === "straight") return `Continue${onto}`;
    return `${turnPhrase(dir)}${onto}`;
  }
  if (type === "fork") {
    const s = side(dir);
    return s
      ? `Keep ${s} at the fork${onto}`
      : `Keep straight at the fork${onto}`;
  }
  if (type === "merge") {
    const s = side(dir);
    return `Merge${s ? ` ${s}` : ""}${onto}`;
  }
  if (type === "on ramp") {
    const s = side(dir);
    return `Take the slip road${s ? ` on the ${s}` : ""}${onto}`;
  }
  if (type === "off ramp") {
    const s = side(dir);
    return `Take the exit${s ? ` on the ${s}` : ""}${onto}`;
  }
  if (type === "end of road") {
    if (!dir || dir === "straight") return `Continue${onto}`;
    return `At the end of the road, turn ${side(dir) ?? dir}${onto}`;
  }
  if (!dir || dir === "straight") return `Continue${onto}`;
  return `${turnPhrase(dir)}${onto}`;
}

/** Validate a raw OSRM response and map it to NEXORA routes. Throws on schema
 * failure. Intermediate-stop arrivals are labelled; the zero-length depart step
 * that OSRM repeats at the start of each later leg is dropped so playback does
 * not announce "Head …" twice in the same place. */
export function mapOsrmRoutes(
  raw: unknown,
  mode: Mode,
  options: { generatedAt?: string; excluded?: string[] } = {},
): Route[] {
  const validated = osrmSchema.parse(raw);
  const generatedAt = options.generatedAt || new Date().toISOString();
  return validated.routes.map((r, i) => {
    const legCount = r.legs.length;
    const steps = r.legs.flatMap((leg, legIndex) =>
      leg.steps
        .filter(
          (s, stepIndex) =>
            !(
              legIndex > 0 &&
              stepIndex === 0 &&
              s.maneuver.type === "depart" &&
              s.distance === 0
            ),
        )
        .map((s) => ({
          instruction: instruction(s, legIndex, legCount),
          distanceM: s.distance,
          durationS: s.duration,
          coordinate: s.maneuver.location,
          type:
            s.maneuver.type === "arrive" && legIndex < legCount - 1
              ? "waypoint"
              : s.maneuver.type,
          ...(s.maneuver.modifier ? { modifier: s.maneuver.modifier } : {}),
          ...(s.maneuver.exit !== undefined ? { exit: s.maneuver.exit } : {}),
          ...(s.ref ? { ref: s.ref } : {}),
        })),
    );
    const route: Route = {
      id: `osrm-${mode}-${legCount > 1 ? `${legCount}leg-` : ""}${i}`,
      geometry: r.geometry.coordinates,
      distanceM: r.distance,
      durationS: r.duration,
      steps,
      source: `OSRM test service · OpenStreetMap · ${mode} profile`,
      generatedAt,
      demo: false,
      reliability: null,
      costGBP: null,
      complexity: r.legs
        .flatMap((l) => l.steps)
        .filter((s) =>
          ["turn", "fork", "roundabout", "rotary"].includes(s.maneuver.type),
        ).length,
      feasible: true,
    };
    if (legCount > 1)
      route.legs = r.legs.map((l) => ({
        distanceM: l.distance ?? l.steps.reduce((a, s) => a + s.distance, 0),
        durationS: l.duration ?? l.steps.reduce((a, s) => a + s.duration, 0),
      }));
    if (options.excluded?.length) route.excluded = [...options.excluded];
    return route;
  });
}
