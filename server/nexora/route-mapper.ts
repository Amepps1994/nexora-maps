import { osrmSchema } from "../../shared/nexora/provider";
import type { Route } from "../../shared/nexora/domain";

type Mode = "driving" | "walking" | "cycling";

export function instruction(step: any, legIndex = 0, legCount = 1): string {
  const m = step.maneuver || {};
  const road = step.name ? ` onto ${step.name}` : "";
  if (m.type === "depart") return `Head ${m.modifier || "straight"}${road}`;
  if (m.type === "arrive")
    return legIndex < legCount - 1
      ? `Arrive at stop ${legIndex + 1}`
      : "Arrive at your destination";
  if (m.type === "roundabout" || m.type === "rotary")
    return `At the roundabout, take exit ${m.exit || "indicated"}${road}`;
  if (m.type === "continue" || m.type === "new name") return `Continue${road}`;
  return `${m.type === "fork" ? "Keep" : "Turn"} ${m.modifier || "straight"}${road}`;
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
