import {
  haversineM,
  navigationTransition,
  type NavigationState,
  type Route,
  type Coord,
  type Step,
} from "./domain";
import { guidanceView, indexRoute, type RouteIndex } from "./guidance";
export function sessionReducer(
  state: NavigationState,
  next: NavigationState,
): NavigationState {
  if (state === next) return state;
  if (
    next === "idle" &&
    !["idle", "planning", "preview", "ended"].includes(state)
  )
    return navigationTransition(navigationTransition(state, "ended"), "idle");
  return navigationTransition(state, next);
}
/**
 * Linear distance playback, not GPS matching, speed measurement or live guidance.
 * `step` is the upcoming manoeuvre and `distanceM` the distance to it, never the
 * segment being driven.
 */
export function playbackAt(route: Route, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const distances = route.geometry
    .slice(1)
    .map((c, i) => haversineM(route.geometry[i], c));
  const total = distances.reduce((a, b) => a + b, 0);
  let remaining = total * p;
  let position: Coord = [...route.geometry[route.geometry.length - 1]];
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i]) {
      const fraction = distances[i] === 0 ? 0 : remaining / distances[i];
      const a = route.geometry[i],
        b = route.geometry[i + 1];
      position = [
        a[0] + (b[0] - a[0]) * fraction,
        a[1] + (b[1] - a[1]) * fraction,
      ];
      break;
    }
    remaining -= distances[i];
  }
  return { position, step: upcomingStepAt(route, p) };
}

/**
 * The next manoeuvre at `progress` along the route, with `distanceM` set to the
 * distance left to it. This is the same meaning `guidanceView` gives live GPS
 * guidance, so the banner, step list, voice and car displays all agree in both
 * simulation and live mode (BUG-010, BUG-011). At the end it is the arrival step.
 */
function upcomingStepAt(route: Route, p: number): Step {
  const last = route.steps[route.steps.length - 1];
  let index: RouteIndex;
  try {
    index = indexRoute(route);
  } catch {
    // Degenerate geometry: no distances to compare, so report the arrival step.
    return last ? { ...last, distanceM: 0 } : last;
  }
  return guidanceView(index, index.totalM * p).step ?? last;
}
