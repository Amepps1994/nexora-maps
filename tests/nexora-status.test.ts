import { describe, expect, it } from "vitest";
import {
  ago,
  locationStatusText,
  mergeHealth,
  providerHealthLines,
  providerHealthSummary,
} from "../shared/nexora/status";

const now = Date.parse("2026-11-27T02:10:00Z");

describe("provider health text", () => {
  it("never prints raw JSON and lists all three profiles", () => {
    const lines = providerHealthLines(
      { driving: { status: "reachable", checkedAt: "2026-11-27T01:03:37.344Z" } },
      now,
    );
    expect(lines).toEqual([
      "Driving: Working · checked 1 h ago",
      "Walking: Not checked yet",
      "Cycling: Not checked yet",
    ]);
    expect(lines.join("\n")).not.toMatch(/[{}"]/);
  });
  it("shows latency, failures and rate limits in words", () => {
    const lines = providerHealthLines(
      {
        driving: { status: "reachable", checkedAt: "2026-11-27T02:09:50Z", ms: 412.4 },
        walking: { status: "unavailable", checkedAt: "2026-11-27T02:09:51Z", reason: "HTTP 503" },
        cycling: { status: "limited", checkedAt: "2026-11-27T02:09:52Z" },
      },
      now,
    );
    expect(lines[0]).toBe("Driving: Working · 412 ms · checked just now");
    expect(lines[1]).toBe("Walking: Unavailable · HTTP 503 · checked just now");
    expect(lines[2]).toContain("Rate-limited");
  });
  it("handles missing or malformed health", () => {
    expect(providerHealthLines(null, now)).toHaveLength(3);
    expect(mergeHealth(null, undefined, { driving: undefined } as never)).toEqual({});
    expect(ago("not a date", now)).toBe("");
  });
  it("keeps the newest check per profile", () => {
    const merged = mergeHealth(
      { driving: { status: "unavailable", checkedAt: "2026-11-27T01:00:00Z" } },
      { driving: { status: "reachable", checkedAt: "2026-11-27T02:00:00Z", ms: 300 } },
      { driving: { status: "error", checkedAt: "2026-11-27T00:00:00Z" } },
    );
    expect(merged.driving?.status).toBe("reachable");
  });
  it("summarises a refresh honestly", () => {
    const at = "2026-11-27T02:00:00Z";
    expect(
      providerHealthSummary({
        driving: { status: "reachable", checkedAt: at },
        walking: { status: "reachable", checkedAt: at },
        cycling: { status: "reachable", checkedAt: at },
      }),
    ).toBe("All three routing profiles are working.");
    expect(
      providerHealthSummary({
        driving: { status: "reachable", checkedAt: at },
        walking: { status: "unavailable", checkedAt: at },
      }),
    ).toBe("Routing works for driving; walking and cycling did not respond.");
    expect(providerHealthSummary({})).toMatch(/^No routing profile responded/);
  });
});

describe("location status text", () => {
  it("replaces the raw 'Not requested · device-unverified' wording", () => {
    const t = locationStatusText("undetermined", null, now);
    expect(t).toMatch(/^Not requested · tap to allow/);
    expect(t).not.toContain("device-unverified");
  });
  it("describes each permission state", () => {
    expect(
      locationStatusText("granted", { accuracy: 12.6, at: "2026-11-27T02:08:00Z" }, now),
    ).toBe("Allowed · last fix ±13 m, 2 min ago · foreground only · no background tracking");
    expect(locationStatusText("granted", null, now)).toMatch(/^Allowed · tap to show/);
    expect(locationStatusText("blocked", null, now)).toMatch(/system settings/);
    expect(locationStatusText("denied", null, now)).toMatch(/^Not allowed/);
    expect(locationStatusText("services-off", null, now)).toMatch(/services are off/);
    expect(locationStatusText("requesting", null, now)).toBe("Finding your position…");
  });
});
