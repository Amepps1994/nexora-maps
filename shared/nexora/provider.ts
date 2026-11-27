import { z } from "zod";
export const coordinateSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const stepSchema = z.object({
  distance: z.number().min(0),
  duration: z.number().min(0),
  name: z.string().optional(),
  maneuver: z.object({
    location: coordinateSchema,
    type: z.string(),
    modifier: z.string().optional(),
    exit: z.number().int().positive().optional(),
  }),
});
export const osrmSchema = z.object({
  code: z.literal("Ok"),
  routes: z
    .array(
      z.object({
        distance: z.number().min(0),
        duration: z.number().min(0),
        geometry: z.object({ coordinates: z.array(coordinateSchema).min(2) }),
        legs: z
          .array(
            z.object({
              distance: z.number().min(0).optional(),
              duration: z.number().min(0).optional(),
              steps: z.array(stepSchema).min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(8),
});
export const geocoderSchema = z
  .array(
    z.object({
      place_id: z.union([z.string(), z.number()]),
      name: z.string().optional(),
      display_name: z.string().min(1),
      lon: z.coerce.number().min(-180).max(180),
      lat: z.coerce.number().min(-90).max(90),
      type: z.string().optional(),
    }),
  )
  .max(20);
