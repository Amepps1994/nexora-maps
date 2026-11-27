/**
 * Plain-language status text for the Settings screen: routing provider health per
 * profile and the foreground location permission. Pure functions so they are tested
 * without a device.
 */
export const ROUTING_PROFILES = ["driving", "walking", "cycling"] as const;
export type RoutingProfile = (typeof ROUTING_PROFILES)[number];

export type ProfileHealth = {
  status: string;
  checkedAt: string | null;
  /** Round-trip time measured by this device, when it ran the check. */
  ms?: number;
  /** Short reason when a check did not succeed. */
  reason?: string;
};
export type HealthMap = Partial<Record<string, ProfileHealth | undefined>>;

const PROFILE_LABELS: Record<RoutingProfile, string> = {
  driving: "Driving",
  walking: "Walking",
  cycling: "Cycling",
};
const STATUS_LABELS: Record<string, string> = {
  reachable: "Working",
  unavailable: "Unavailable",
  limited: "Rate-limited, try again in a minute",
  error: "Check failed",
};

export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Newest check wins when the device's own probe and the server's record disagree. */
export function mergeHealth(...maps: (HealthMap | null | undefined)[]): HealthMap {
  const out: HealthMap = {};
  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const [mode, h] of Object.entries(map)) {
      if (!h || typeof h.status !== "string") continue;
      const prev = out[mode];
      const prevT = prev?.checkedAt ? Date.parse(prev.checkedAt) : -Infinity;
      const t = h.checkedAt ? Date.parse(h.checkedAt) : -Infinity;
      if (!prev || t >= prevT) out[mode] = h;
    }
  }
  return out;
}

/** One readable line per routing profile, e.g. "Driving: Working · 420 ms · checked 2 min ago". */
export function providerHealthLines(
  health: HealthMap | null | undefined,
  now: number,
): string[] {
  return ROUTING_PROFILES.map((mode) => {
    const h = health?.[mode];
    const label = PROFILE_LABELS[mode];
    if (!h) return `${label}: Not checked yet`;
    const parts = [STATUS_LABELS[h.status] ?? h.status];
    if (h.status === "reachable" && typeof h.ms === "number")
      parts.push(`${Math.round(h.ms)} ms`);
    if (h.status !== "reachable" && h.reason) parts.push(h.reason);
    const when = ago(h.checkedAt, now);
    if (when) parts.push(`checked ${when}`);
    return `${label}: ${parts.join(" · ")}`;
  });
}

/** Short summary for a toast after a refresh. */
export function providerHealthSummary(health: HealthMap | null | undefined): string {
  const ok = ROUTING_PROFILES.filter((m) => health?.[m]?.status === "reachable");
  if (ok.length === ROUTING_PROFILES.length) return "All three routing profiles are working.";
  if (!ok.length) return "No routing profile responded. Planning falls back to manual or demo routes only when you choose them.";
  const down = ROUTING_PROFILES.filter((m) => !ok.includes(m)).map((m) => PROFILE_LABELS[m].toLowerCase());
  return `Routing works for ${ok.map((m) => PROFILE_LABELS[m].toLowerCase()).join(" and ")}; ${down.join(" and ")} did not respond.`;
}

export type LocationPermission =
  | "undetermined"
  | "granted"
  | "denied"
  | "blocked"
  | "services-off"
  | "unavailable"
  | "requesting";

export function locationStatusText(
  permission: LocationPermission,
  fix: { accuracy: number | null; at: string | null } | null,
  now: number,
): string {
  const tail = "foreground only · no background tracking";
  switch (permission) {
    case "granted": {
      if (fix?.at) {
        const acc = fix.accuracy != null ? ` ±${Math.round(fix.accuracy)} m` : "";
        return `Allowed · last fix${acc}, ${ago(fix.at, now)} · ${tail}`;
      }
      return `Allowed · tap to show your position · ${tail}`;
    }
    case "requesting":
      return "Finding your position…";
    case "denied":
      return "Not allowed · tap to ask again · search or pin an origin instead";
    case "blocked":
      return "Blocked in system settings · tap to open app settings";
    case "services-off":
      return "Location services are off on this device · turn them on, then tap";
    case "unavailable":
      return "No position available yet · tap to try again";
    default:
      return `Not requested · tap to allow · ${tail}`;
  }
}
