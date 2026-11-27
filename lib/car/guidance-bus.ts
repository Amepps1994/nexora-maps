/**
 * In-process hand-off between the phone navigation state (hooks/use-nexora.ts) and the
 * car / lock-screen surfaces. The car screen is a separate React root in the same JS
 * runtime, so it cannot read the phone's React state; it subscribes here instead.
 * Pure TypeScript: no React, no native modules.
 */
import type { CarGuidanceSnapshot } from "@/shared/nexora/car-guidance";

export type CarCommand = "stop" | "toggleMute";

type SnapshotListener = (snapshot: CarGuidanceSnapshot) => void;
type CommandListener = (command: CarCommand) => void;

let latest: CarGuidanceSnapshot | null = null;
const snapshotListeners = new Set<SnapshotListener>();
const commandListeners = new Set<CommandListener>();

function changed(
  a: CarGuidanceSnapshot | null,
  b: CarGuidanceSnapshot,
): boolean {
  if (!a) return true;
  // etaMs moves with the clock on every render; only republish when it shifts by 30 s+.
  const { etaMs: ea, geometry: ga, ...ra } = a;
  const { etaMs: eb, geometry: gb, ...rb } = b;
  if (ga.length !== gb.length || a.tripId !== b.tripId) return true;
  if ((ea === null) !== (eb === null)) return true;
  if (ea !== null && eb !== null && Math.abs(ea - eb) >= 30000) return true;
  return JSON.stringify(ra) !== JSON.stringify(rb);
}

export function publishCarGuidance(snapshot: CarGuidanceSnapshot): void {
  if (!changed(latest, snapshot)) return;
  latest = snapshot;
  for (const l of [...snapshotListeners]) {
    try {
      l(snapshot);
    } catch {
      // A failing car surface must never break phone navigation.
    }
  }
}

export function getCarGuidance(): CarGuidanceSnapshot | null {
  return latest;
}

/** Subscribe; the listener is called immediately with the latest snapshot, if any. */
export function subscribeCarGuidance(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener);
  if (latest) {
    try {
      listener(latest);
    } catch {
      // ignore, see publishCarGuidance
    }
  }
  return () => {
    snapshotListeners.delete(listener);
  };
}

export function sendCarCommand(command: CarCommand): void {
  for (const l of [...commandListeners]) {
    try {
      l(command);
    } catch {
      // ignore
    }
  }
}

export function onCarCommand(listener: CommandListener): () => void {
  commandListeners.add(listener);
  return () => {
    commandListeners.delete(listener);
  };
}

/** Test helper. */
export function resetCarGuidanceBus(): void {
  latest = null;
  snapshotListeners.clear();
  commandListeners.clear();
}
