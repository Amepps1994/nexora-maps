import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { instruction, mapOsrmRoutes } from "../server/nexora/route-mapper";
import {
  directionFromText,
  isSilentStep,
  maneuverIcon,
  stepDirection,
} from "../shared/nexora/maneuver";
import { toCarManeuver } from "../shared/nexora/car-guidance";
import type { Step } from "../shared/nexora/domain";

type RawStep = {
  name?: string;
  ref?: string;
  maneuver: { type: string; modifier?: string; exit?: number };
};

const at: [number, number] = [-0.12, 51.5];

/** Map one raw OSRM step through the real mapper and return the NEXORA Step. */
function mapped(raw: RawStep): Step {
  const route = mapOsrmRoutes(
    {
      code: "Ok",
      routes: [
        {
          distance: 200,
          duration: 20,
          geometry: { coordinates: [at, [-0.119, 51.501]] },
          legs: [
            {
              steps: [
                {
                  distance: 100,
                  duration: 10,
                  name: "Start Road",
                  maneuver: { location: at, type: "depart", modifier: "right" },
                },
                {
                  distance: 100,
                  duration: 10,
                  ...(raw.name !== undefined ? { name: raw.name } : {}),
                  ...(raw.ref !== undefined ? { ref: raw.ref } : {}),
                  maneuver: { location: at, ...raw.maneuver },
                },
                {
                  distance: 0,
                  duration: 0,
                  name: "",
                  maneuver: { location: [-0.119, 51.501], type: "arrive" },
                },
              ],
            },
          ],
        },
      ],
    },
    "driving",
  )[0];
  return route.steps[1];
}

// type, modifier, name, ref, exit → instruction, spoken?, icon, car kind, car direction
const TABLE: [
  string,
  string | undefined,
  string,
  string | undefined,
  number | undefined,
  string,
  boolean,
  string,
  string,
  string,
][] = [
  [
    "turn",
    "left",
    "Euston Road",
    undefined,
    undefined,
    "Turn left onto Euston Road",
    true,
    "corner-up-left",
    "turn",
    "left",
  ],
  [
    "turn",
    "right",
    "Euston Road",
    undefined,
    undefined,
    "Turn right onto Euston Road",
    true,
    "corner-up-right",
    "turn",
    "right",
  ],
  [
    "turn",
    "sharp left",
    "A1",
    undefined,
    undefined,
    "Turn sharp left onto A1",
    true,
    "corner-up-left",
    "turn",
    "sharp-left",
  ],
  [
    "turn",
    "sharp right",
    "A1",
    undefined,
    undefined,
    "Turn sharp right onto A1",
    true,
    "corner-up-right",
    "turn",
    "sharp-right",
  ],
  [
    "turn",
    "slight left",
    "Mall",
    undefined,
    undefined,
    "Keep left onto Mall",
    true,
    "arrow-up-left",
    "turn",
    "slight-left",
  ],
  [
    "turn",
    "slight right",
    "Mall",
    undefined,
    undefined,
    "Keep right onto Mall",
    true,
    "arrow-up-right",
    "turn",
    "slight-right",
  ],
  [
    "turn",
    "straight",
    "Strand",
    undefined,
    undefined,
    "Continue onto Strand",
    true,
    "arrow-up",
    "straight",
    "straight",
  ],
  [
    "turn",
    "uturn",
    "Strand",
    undefined,
    undefined,
    "Make a U-turn onto Strand",
    true,
    "rotate-ccw",
    "turn",
    "uturn",
  ],
  [
    "continue",
    "uturn",
    "Strand",
    undefined,
    undefined,
    "Make a U-turn onto Strand",
    true,
    "rotate-ccw",
    "turn",
    "uturn",
  ],
  [
    "continue",
    "left",
    "Strand",
    undefined,
    undefined,
    "Turn left to stay on Strand",
    true,
    "corner-up-left",
    "turn",
    "left",
  ],
  [
    "continue",
    "right",
    "Strand",
    undefined,
    undefined,
    "Turn right to stay on Strand",
    true,
    "corner-up-right",
    "turn",
    "right",
  ],
  [
    "continue",
    "slight left",
    "Strand",
    undefined,
    undefined,
    "Keep left to stay on Strand",
    true,
    "arrow-up-left",
    "keep",
    "slight-left",
  ],
  [
    "continue",
    "straight",
    "Strand",
    undefined,
    undefined,
    "Continue onto Strand",
    false,
    "arrow-up",
    "straight",
    "straight",
  ],
  [
    "continue",
    undefined,
    "Strand",
    undefined,
    undefined,
    "Continue onto Strand",
    false,
    "arrow-up",
    "straight",
    "straight",
  ],
  [
    "new name",
    "straight",
    "Borough High Street",
    undefined,
    undefined,
    "Continue onto Borough High Street",
    false,
    "arrow-up",
    "straight",
    "straight",
  ],
  [
    "new name",
    "slight right",
    "Borough High Street",
    undefined,
    undefined,
    "Keep right onto Borough High Street",
    true,
    "arrow-up-right",
    "keep",
    "slight-right",
  ],
  [
    "new name",
    "left",
    "Borough High Street",
    undefined,
    undefined,
    "Turn left onto Borough High Street",
    true,
    "corner-up-left",
    "turn",
    "left",
  ],
  [
    "end of road",
    "straight",
    "",
    undefined,
    undefined,
    "Continue",
    true,
    "arrow-up",
    "straight",
    "straight",
  ],
  [
    "end of road",
    "left",
    "Mill Lane",
    undefined,
    undefined,
    "At the end of the road, turn left onto Mill Lane",
    true,
    "corner-up-left",
    "turn",
    "left",
  ],
  [
    "fork",
    "slight left",
    "M1",
    undefined,
    undefined,
    "Keep left at the fork onto M1",
    true,
    "arrow-up-left",
    "fork",
    "slight-left",
  ],
  [
    "fork",
    "right",
    "M1",
    undefined,
    undefined,
    "Keep right at the fork onto M1",
    true,
    "corner-up-right",
    "fork",
    "right",
  ],
  [
    "merge",
    "slight right",
    "M25",
    undefined,
    undefined,
    "Merge right onto M25",
    true,
    "arrow-up-right",
    "keep",
    "slight-right",
  ],
  [
    "on ramp",
    "left",
    "",
    "M4",
    undefined,
    "Take the slip road on the left onto M4",
    true,
    "corner-up-left",
    "on-ramp",
    "left",
  ],
  [
    "off ramp",
    "slight left",
    "",
    "A40",
    undefined,
    "Take the exit on the left onto A40",
    true,
    "arrow-up-left",
    "off-ramp",
    "slight-left",
  ],
  [
    "roundabout",
    "right",
    "Pentonville Road",
    undefined,
    2,
    "At the roundabout, take exit 2 onto Pentonville Road",
    true,
    "rotate-cw",
    "roundabout",
    "right",
  ],
  [
    "roundabout",
    "straight",
    "Pentonville Road",
    undefined,
    undefined,
    "At the roundabout, continue onto Pentonville Road",
    true,
    "rotate-cw",
    "roundabout",
    "straight",
  ],
  [
    "rotary",
    "left",
    "",
    "A400",
    3,
    "At the roundabout, take exit 3 onto A400",
    true,
    "rotate-cw",
    "roundabout",
    "left",
  ],
  [
    "roundabout turn",
    "left",
    "High Street",
    undefined,
    undefined,
    "Turn left onto High Street",
    true,
    "corner-up-left",
    "turn",
    "left",
  ],
  [
    "notification",
    undefined,
    "High Street",
    undefined,
    undefined,
    "Continue onto High Street",
    true,
    "arrow-up",
    "straight",
    "straight",
  ],
];

describe("OSRM type × modifier table (BUG-004, BUG-005)", () => {
  it.each(TABLE)(
    "%s / %s",
    (type, modifier, name, ref, exit, text, spoken, icon, kind, direction) => {
      const s = mapped({
        name,
        ref,
        maneuver: {
          type,
          ...(modifier ? { modifier } : {}),
          ...(exit ? { exit } : {}),
        },
      });
      expect(s.instruction).toBe(text);
      expect(s.modifier).toBe(modifier);
      expect(isSilentStep(s)).toBe(!spoken);
      expect(maneuverIcon(s)).toBe(icon);
      const car = toCarManeuver(s);
      expect(car.kind).toBe(kind);
      expect(car.direction).toBe(direction);
      if (exit) expect(car.exit).toBe(exit);
    },
  );

  it("never produces 'Turn uturn', 'Turn straight' or 'exit indicated'", () => {
    for (const [type, modifier] of TABLE) {
      const t = instruction({ name: "", maneuver: { type, modifier } });
      expect(t).not.toMatch(/Turn uturn|Turn straight|indicated/);
    }
  });

  it("uses the road ref when the name is empty", () => {
    const s = mapped({
      name: "",
      ref: "A40",
      maneuver: { type: "turn", modifier: "left" },
    });
    expect(s.instruction).toBe("Turn left onto A40");
    expect(s.ref).toBe("A40");
    expect(toCarManeuver(s).roadName).toBe("A40");
  });

  it("prefers the name over the ref", () =>
    expect(
      instruction({
        name: "Western Avenue",
        ref: "A40",
        maneuver: { type: "turn", modifier: "left" },
      }),
    ).toBe("Turn left onto Western Avenue"));

  it("keeps the intermediate-stop and destination arrival labels", () => {
    expect(instruction({ maneuver: { type: "arrive" } }, 0, 3)).toBe(
      "Arrive at stop 1",
    );
    expect(instruction({ maneuver: { type: "arrive" } }, 1, 3)).toBe(
      "Arrive at stop 2",
    );
    expect(instruction({ maneuver: { type: "arrive" } }, 2, 3)).toBe(
      "Arrive at your destination",
    );
  });
});

describe("maneuverIcon", () => {
  const legacy = (instruction: string, type: string) =>
    maneuverIcon({ instruction, type });
  it("shows a flag on arrival and a pin at a stop", () => {
    expect(legacy("Arrive at your destination", "arrive")).toBe("flag");
    expect(legacy("Arrive at stop 1", "waypoint")).toBe("map-pin");
  });
  it("shows straight ahead for a plain continue (was a right arrow)", () =>
    expect(legacy("Continue onto Borough High Street", "new name")).toBe(
      "arrow-up",
    ));
  it("falls back to the instruction text on routes saved without a modifier", () => {
    expect(legacy("Turn left onto Euston Road", "turn")).toBe("corner-up-left");
    expect(legacy("Turn right onto Left Street", "turn")).toBe(
      "corner-up-right",
    );
    expect(legacy("Turn uturn", "turn")).toBe("rotate-ccw");
  });
  it("falls back to straight for unknown steps", () => {
    expect(maneuverIcon(null)).toBe("arrow-up");
    expect(legacy("", "")).toBe("arrow-up");
  });
  it("lets the modifier win over the text", () =>
    expect(
      maneuverIcon({
        instruction: "Continue onto Left Road",
        type: "continue",
        modifier: "uturn",
      }),
    ).toBe("rotate-ccw"));
});

describe("direction helpers", () => {
  it("ignores the road clause", () => {
    expect(directionFromText("Continue onto Left Bank Road")).toBe("straight");
    expect(directionFromText("Turn right to stay on Left Lane")).toBe("right");
  });
  it("prefers a known modifier and ignores unknown ones", () => {
    expect(stepDirection({ instruction: "Turn left", modifier: "right" })).toBe(
      "right",
    );
    expect(
      stepDirection({ instruction: "Turn left", modifier: "sideways" }),
    ).toBe("left");
  });
});

/** Map a one-step depart route through the real mapper. */
function mappedDepart(
  maneuver: Record<string, unknown>,
  name = "Euston Road",
  line: [number, number][] = [at, [-0.119, 51.501]],
): Step {
  return mapOsrmRoutes(
    {
      code: "Ok",
      routes: [
        {
          distance: 100,
          duration: 10,
          geometry: { coordinates: line },
          legs: [
            {
              steps: [
                {
                  distance: 100,
                  duration: 10,
                  name,
                  maneuver: { location: at, type: "depart", ...maneuver },
                },
                {
                  distance: 0,
                  duration: 0,
                  name: "",
                  maneuver: { location: line[line.length - 1], type: "arrive" },
                },
              ],
            },
          ],
        },
      ],
    },
    "driving",
  )[0].steps[0];
}

describe("depart steps use a compass direction (BUG-012)", () => {
  it.each([
    [0, "north"],
    [22, "north"],
    [45, "north-east"],
    [90, "east"],
    [135, "south-east"],
    [180, "south"],
    [225, "south-west"],
    [270, "west"],
    [315, "north-west"],
    [338, "north"],
    [359, "north"],
    [360, "north"],
  ])("bearing %i reads Head %s", (bearing, word) => {
    const s = mappedDepart({ bearing_after: bearing, modifier: "right" });
    expect(s.instruction).toBe(`Head ${word} on Euston Road`);
  });

  it.each(["left", "right", "slight left", "sharp right", "uturn", "straight"])(
    "ignores the depart modifier %s",
    (modifier) => {
      const s = mappedDepart({ bearing_after: 270, modifier });
      expect(s.instruction).toBe("Head west on Euston Road");
      expect(s.instruction).not.toMatch(/^Head (left|right|slight|sharp|straight)/);
      expect(maneuverIcon(s)).toBe("navigation");
      expect(stepDirection(s)).toBe("straight");
      const car = toCarManeuver(s);
      expect(car.kind).toBe("depart");
      expect(car.direction).toBe("straight");
      expect(car.roadName).toBe("Euston Road");
    },
  );

  it("reads without a road name", () =>
    expect(mappedDepart({ bearing_after: 90 }, "").instruction).toBe("Head east"));

  it("works out the bearing from the route line when OSRM leaves it out", () => {
    // Line leaves `at` due west.
    const s = mappedDepart({ modifier: "left" }, "Euston Road", [at, [-0.121, 51.5]]);
    expect(s.instruction).toBe("Head west on Euston Road");
  });

  it("does not let the road name pick the arrow", () => {
    const s = mappedDepart({ bearing_after: 0, modifier: "left" }, "Left Bank Road");
    expect(s.instruction).toBe("Head north on Left Bank Road");
    expect(directionFromText(s.instruction)).toBe("straight");
    expect(toCarManeuver(s).roadName).toBe("Left Bank Road");
  });

  it("shows the navigation icon for older saved depart steps", () =>
    expect(
      maneuverIcon({ instruction: "Head left onto Euston Road", type: "depart", modifier: "left" }),
    ).toBe("navigation"));

  it("never reads Head left/right for any mapped route in the fixtures", () => {
    for (const s of mapOsrmRoutes(
      JSON.parse(
        readFileSync(join(__dirname, "fixtures/osrm-car-multistop.json"), "utf8"),
      ).body,
      "driving",
    )[0].steps)
      expect(s.instruction).not.toMatch(/^Head (left|right|slight|sharp)/);
  });
});
