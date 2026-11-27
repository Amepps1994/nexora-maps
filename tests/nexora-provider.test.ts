import { describe, it, expect } from "vitest";
import {
  osrmSchema,
  geocoderSchema,
  coordinateSchema,
} from "../shared/nexora/provider";
const valid = {
  code: "Ok",
  routes: [
    {
      distance: 100,
      duration: 20,
      geometry: {
        coordinates: [
          [0, 51],
          [0.01, 51.01],
        ],
      },
      legs: [
        {
          steps: [
            {
              distance: 100,
              duration: 20,
              name: "Test road",
              maneuver: { location: [0, 51], type: "depart" },
            },
          ],
        },
      ],
    },
  ],
};
describe("external response validation", () => {
  it("accepts a graph response with geometry and instructions", () =>
    expect(osrmSchema.safeParse(valid).success).toBe(true));
  it.each(["NoRoute", "InvalidQuery", "Error"])(
    "rejects provider status %s",
    (code) =>
      expect(osrmSchema.safeParse({ ...valid, code }).success).toBe(false),
  );
  it("rejects missing routes", () =>
    expect(osrmSchema.safeParse({ code: "Ok", routes: [] }).success).toBe(
      false,
    ));
  it("rejects nonfinite duration", () =>
    expect(
      osrmSchema.safeParse({
        ...valid,
        routes: [{ ...valid.routes[0], duration: NaN }],
      }).success,
    ).toBe(false));
  it("rejects invalid geometry", () =>
    expect(
      osrmSchema.safeParse({
        ...valid,
        routes: [
          { ...valid.routes[0], geometry: { coordinates: [[200, 51]] } },
        ],
      }).success,
    ).toBe(false));
  it("rejects missing graph steps", () =>
    expect(
      osrmSchema.safeParse({
        ...valid,
        routes: [{ ...valid.routes[0], legs: [{ steps: [] }] }],
      }).success,
    ).toBe(false));
  it("rejects invalid coordinates", () =>
    expect(coordinateSchema.safeParse([0, 91]).success).toBe(false));
  it("accepts an empty search as empty not fabricated", () =>
    expect(geocoderSchema.parse([])).toEqual([]));
  it("normalises configured geocoder numeric strings", () =>
    expect(
      geocoderSchema.parse([
        { place_id: 1, display_name: "London", lon: "-.1", lat: "51.5" },
      ])[0].lat,
    ).toBe(51.5));
  it("rejects malformed geocoder rows", () =>
    expect(
      geocoderSchema.safeParse([
        { place_id: 1, display_name: "London", lon: 0, lat: "not a number" },
      ]).success,
    ).toBe(false));
});
