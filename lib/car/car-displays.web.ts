/**
 * Web fallback (Metro picks this for web). Native builds use car-displays.tsx.
 */
import type { CarConnection } from "./car-status";

export function startCarDisplays(): void {}

export function getCarConnection(): CarConnection {
  return "unsupported";
}

export function subscribeCarConnection(
  _listener: (c: CarConnection) => void,
): () => void {
  return () => {};
}
