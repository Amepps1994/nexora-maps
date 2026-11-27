import {
  haversineM,
  validateCoord,
  type Coord,
  type Place,
  type Route,
  type Step,
} from "./domain";

const CATALOGUE_SOURCE = "Demo catalogue · coordinates only";

/** Approximate landmark points, not entrances, businesses, accessibility or routing data. */
export const DEMO_PLACES: Place[] = [
  {
    id: "kings-cross",
    name: "King's Cross",
    subtitle: "London station · demo landmark point",
    coordinate: [-0.1238, 51.5308],
    category: "Station",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "tate-modern",
    name: "Tate Modern",
    subtitle: "Bankside · demo landmark point",
    coordinate: [-0.0994, 51.5076],
    category: "Culture",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "victoria-park",
    name: "Victoria Park",
    subtitle: "East London · demo landmark point",
    coordinate: [-0.0391, 51.5366],
    category: "Park",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "british-museum",
    name: "British Museum",
    subtitle: "Bloomsbury · demo landmark point",
    coordinate: [-0.1269, 51.5194],
    category: "Culture",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "tower-bridge",
    name: "Tower Bridge",
    subtitle: "River Thames · demo landmark point",
    coordinate: [-0.0754, 51.5055],
    category: "Landmark",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "regents-park",
    name: "Regent's Park",
    subtitle: "North-west central London · demo landmark point",
    coordinate: [-0.1569, 51.5313],
    category: "Park",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "greenwich",
    name: "Greenwich",
    subtitle: "Royal Observatory area · demo landmark point",
    coordinate: [-0.0015, 51.4769],
    category: "Landmark",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "hyde-park",
    name: "Hyde Park",
    subtitle: "West central London · demo landmark point",
    coordinate: [-0.1657, 51.5073],
    category: "Park",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "waterloo",
    name: "Waterloo",
    subtitle: "London station · demo landmark point",
    coordinate: [-0.1136, 51.5033],
    category: "Station",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "borough-market",
    name: "Borough Market",
    subtitle: "Southwark · demo landmark point",
    coordinate: [-0.0904, 51.5055],
    category: "Market",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "st-pauls",
    name: "St Paul's Cathedral",
    subtitle: "City of London · demo landmark point",
    coordinate: [-0.0983, 51.5138],
    category: "Landmark",
    source: CATALOGUE_SOURCE,
  },
  {
    id: "paddington",
    name: "Paddington",
    subtitle: "London station · demo landmark point",
    coordinate: [-0.175, 51.5154],
    category: "Station",
    source: CATALOGUE_SOURCE,
  },
];

export const SYNTHETIC_ROUTE_SOURCE =
  "Synthetic simulation fixture · not road geometry · not road-safe";
const FIXTURE_GENERATED_AT = "2026-11-26T00:00:00.000Z";

/** Two deterministic mathematical polylines for UI/simulator testing ONLY.
 * These may cross buildings, water and restricted areas: never follow them on a road.
 * Duration and complexity are invented SIMULATION parameters, not travel predictions.
 * `feasible=true` means the fixture can play, NOT legal/safe real-world access.
 * No GPS positions, graph manoeuvres, cost, traffic or calibrated confidence are claimed.
 * Accept driving/car/drive, walking/walk and cycling/cycle; unsupported modes throw.
 */
export function syntheticRoute(
  origin: Place,
  dest: Place,
  mode: string,
): Route[] {
  if (!validateCoord(origin.coordinate) || !validateCoord(dest.coordinate))
    throw new RangeError("Invalid fixture endpoints");
  const speeds: Record<string, number> = {
    driving: 8,
    drive: 8,
    car: 8,
    walking: 1.4,
    walk: 1.4,
    cycling: 4.5,
    cycle: 4.5,
  };
  const canonicalMode = mode.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(speeds, canonicalMode))
    throw new RangeError("Unsupported simulation mode");
  if (haversineM(origin.coordinate, dest.coordinate) < 1)
    throw new RangeError("Choose distinct simulation endpoints");
  const speed = speeds[canonicalMode];
  const start: Coord = [...origin.coordinate];
  const end: Coord = [...dest.coordinate];
  // Opposite bows deliberately do not try to imitate a street network.
  const interpolate = (fraction: number, bow: number): Coord => {
    const latitude = start[1] + (end[1] - start[1]) * fraction + bow;
    const longitude = start[0] + (end[0] - start[0]) * fraction - bow;
    const coordinate: Coord = [
      Math.max(-180, Math.min(180, longitude)),
      Math.max(-90, Math.min(90, latitude)),
    ];
    return coordinate;
  };
  const geometries: Coord[][] = [
    [
      start,
      interpolate(0.25, 0.0015),
      interpolate(0.5, -0.001),
      interpolate(0.75, 0.0015),
      end,
    ],
    [[...start], interpolate(0.5, -0.004), [...end]],
  ];
  return geometries.map((geometry, alternative) => {
    const pace = speed / (alternative === 1 ? 1.2 : 1);
    const steps: Step[] = geometry.slice(1).map((coordinate, index) => {
      const distanceM = haversineM(geometry[index], coordinate);
      const last = index === geometry.length - 2;
      return {
        instruction: last
          ? `Simulated arrival at ${dest.name} — not road guidance`
          : `Simulation waypoint ${index + 1} — not a road manoeuvre`,
        distanceM,
        durationS: distanceM / pace,
        coordinate: [...coordinate],
        type: last ? "synthetic-arrive" : "synthetic-waypoint",
      };
    });
    return {
      id: `synthetic-${origin.id}-${dest.id}-${canonicalMode}-${alternative + 1}`,
      geometry,
      distanceM: steps.reduce((total, step) => total + step.distanceM, 0),
      durationS: steps.reduce((total, step) => total + step.durationS, 0),
      steps,
      source: SYNTHETIC_ROUTE_SOURCE,
      generatedAt: FIXTURE_GENERATED_AT,
      demo: true,
      reliability: null,
      costGBP: null,
      complexity: geometry.length - 2,
      feasible: true,
    };
  });
}

/** Synthetic multi-stop itinerary: one simulated route made of the first
 * synthetic alternative for each leg. Same honesty rules as syntheticRoute:
 * straight bowed lines, never road geometry. Without stops it is syntheticRoute. */
export function syntheticItinerary(
  origin: Place,
  stops: readonly Place[],
  dest: Place,
  mode: string,
): Route[] {
  if (!stops.length) return syntheticRoute(origin, dest, mode);
  const points = [origin, ...stops, dest];
  const legs = points
    .slice(1)
    .map((point, i) => syntheticRoute(points[i], point, mode)[0]);
  const geometry: Coord[] = legs.flatMap((leg, i) =>
    i === 0 ? leg.geometry : leg.geometry.slice(1),
  );
  const steps: Step[] = legs.flatMap((leg, i) =>
    leg.steps.map((step) =>
      step.type === "synthetic-arrive" && i < legs.length - 1
        ? {
            ...step,
            instruction: `Simulated arrival at stop ${i + 1}: ${points[i + 1].name} — not road guidance`,
            type: "synthetic-stop",
          }
        : step,
    ),
  );
  return [
    {
      ...legs[0],
      id: `synthetic-${points.map((p) => p.id).join("-")}-${mode.trim().toLowerCase()}`,
      geometry,
      steps,
      distanceM: legs.reduce((t, l) => t + l.distanceM, 0),
      durationS: legs.reduce((t, l) => t + l.durationS, 0),
      complexity: legs.reduce((t, l) => t + (l.complexity ?? 0), 0),
      legs: legs.map((l) => ({
        distanceM: l.distanceM,
        durationS: l.durationS,
      })),
    },
  ];
}
