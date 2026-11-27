import {
  haversineM,
  navigationTransition,
  type NavigationState,
  type Route,
  type Coord,
} from "./domain";
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
/** Linear distance playback, not GPS matching, speed measurement or live guidance. */
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
  let travelled = route.distanceM * p;
  let step = route.steps[route.steps.length - 1];
  for (const s of route.steps) {
    if (travelled < s.distanceM) {
      step = { ...s, distanceM: Math.max(0, s.distanceM - travelled) };
      break;
    }
    travelled -= s.distanceM;
  }
  return { position, step };
}
