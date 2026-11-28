import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  devToolsEnabled,
  guidanceStartChoices,
  liveStartMessage,
} from "../components/nexora/screen-logic";
import { liveWatchAttempts } from "../lib/live-watch-options";

const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

describe("developer tools flag", () => {
  it("is on in development builds", () => {
    expect(devToolsEnabled(true)).toBe(true);
    expect(devToolsEnabled(true, "0")).toBe(true);
  });
  it("is off in release builds unless the env flag is 1", () => {
    expect(devToolsEnabled(false)).toBe(false);
    expect(devToolsEnabled(false, "")).toBe(false);
    expect(devToolsEnabled(false, "true")).toBe(false);
    expect(devToolsEnabled(false, "1")).toBe(true);
  });
});

describe("start choices", () => {
  it("release builds only offer live GPS for a provider route", () => {
    expect(guidanceStartChoices({ demo: false }, false)).toEqual({
      live: true,
      simulation: false,
    });
  });
  it("a sample route cannot be followed with GPS", () => {
    expect(guidanceStartChoices({ demo: true }, false)).toEqual({
      live: false,
      simulation: false,
    });
    expect(guidanceStartChoices({ demo: true }, true).simulation).toBe(true);
  });
  it("developer builds also offer simulation", () => {
    expect(guidanceStartChoices({ demo: false }, true)).toEqual({
      live: true,
      simulation: true,
    });
  });
  it("offers nothing without a route", () => {
    expect(guidanceStartChoices(null, true)).toEqual({
      live: false,
      simulation: false,
    });
  });
});

describe("live start messages", () => {
  it("only blames permission when permission was actually refused", () => {
    expect(liveStartMessage("error")).not.toMatch(/permission/i);
    expect(liveStartMessage("services-off")).toMatch(/location services/i);
    expect(liveStartMessage("denied")).toMatch(/location access/i);
    expect(liveStartMessage("blocked")).toMatch(/settings/i);
    expect(liveStartMessage("ok")).toBe("");
  });
});

describe("live watch attempts (Location Accuracy 'No thanks')", () => {
  const attempts = liveWatchAttempts({ best: 6, high: 4 });
  it("first asks for the best accuracy, which may show the Google dialog", () => {
    expect(attempts[0].accuracy).toBe(6);
    expect(attempts[0].mayShowUserSettingsDialog).toBeUndefined();
  });
  it("then falls back to GPS accuracy without the dialog", () => {
    expect(attempts).toHaveLength(2);
    expect(attempts[1].accuracy).toBe(4);
    expect(attempts[1].mayShowUserSettingsDialog).toBe(false);
    expect(attempts[1].timeInterval).toBe(attempts[0].timeInterval);
  });
});

describe("release copy", () => {
  const app = read("components/nexora/NexoraApp.tsx");
  const panels = read("components/nexora/Panels.tsx");
  it("no longer shows the unverified or development-build banners", () => {
    for (const src of [app, panels]) {
      expect(src).not.toMatch(/UNVERIFIED FOR ROAD USE/);
      expect(src).not.toMatch(/unverified for road use/i);
      expect(src).not.toMatch(/development build offers simulated/);
    }
  });
  it("hides the test event buttons behind the developer flag", () => {
    expect(app).toMatch(/n\.guidanceSource !== "live" && DEV_TOOLS/);
  });
  it("starts live guidance by default", () => {
    expect(read("hooks/use-nexora.ts")).toMatch(
      /async function start\(source: "simulation" \| "live" = "live"\)/,
    );
  });
});
