// Guards for build/release configuration (roadmap WS-5: QA-001, PRIV-001, OPS-003, OPS-004, DEBT-004).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../app.config";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const pkg = JSON.parse(read("package.json"));
const eas = JSON.parse(read("eas.json"));
const nvmrc = read(".nvmrc").trim();
const major = (v: string) => /(\d+)/.exec(v)?.[1];

type Profile = { extends?: string; env?: Record<string, string>; [k: string]: unknown };
function resolveProfile(name: string): Profile {
  const p: Profile = eas.build[name];
  if (!p.extends) return p;
  const parent = resolveProfile(p.extends);
  return { ...parent, ...p, env: { ...parent.env, ...p.env } };
}

describe("PRIV-001 no microphone or media playback plugins", () => {
  const pluginNames = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));

  it("does not configure expo-audio or expo-video", () => {
    expect(pluginNames).not.toContain("expo-audio");
    expect(pluginNames).not.toContain("expo-video");
  });

  it("blocks RECORD_AUDIO and never requests it", () => {
    expect(config.android?.blockedPermissions).toContain("android.permission.RECORD_AUDIO");
    expect(config.android?.permissions ?? []).not.toContain("RECORD_AUDIO");
    expect(config.android?.permissions ?? []).not.toContain("android.permission.RECORD_AUDIO");
    expect(JSON.stringify(config.ios ?? {})).not.toMatch(/Microphone/i);
  });

  it("drops the unused media dependencies", () => {
    for (const dep of ["expo-audio", "expo-video", "expo-image"]) {
      expect(pkg.dependencies[dep]).toBeUndefined();
    }
  });
});

describe("OPS-003 EAS release profiles", () => {
  it("auto-increments the production APK version code", () => {
    expect(resolveProfile("production-apk").autoIncrement).toBe(true);
    expect(eas.cli.appVersionSource).toBe("remote");
  });

  it("has an internal preview APK profile", () => {
    const preview = resolveProfile("preview");
    expect(preview.distribution).toBe("internal");
    expect(preview.android).toEqual({ buildType: "apk" });
  });

  it("sets an explicit https API base URL on every buildable profile", () => {
    for (const name of ["preview", "production-apk"]) {
      const url = resolveProfile(name).env?.EXPO_PUBLIC_API_BASE_URL ?? "";
      expect(url, name).toMatch(/^https:\/\/[^/]+/);
    }
  });
});

describe("OPS-004 one Node version everywhere", () => {
  it("pins Node 22 in .nvmrc, package.json engines, eas.json and render.yaml", () => {
    expect(nvmrc).toBe("22");
    expect(major(pkg.engines.node)).toBe(nvmrc);
    expect(major(resolveProfile("production-apk").node as string)).toBe(nvmrc);
    expect(read("render.yaml")).toMatch(/NODE_VERSION\s*\n\s*value:\s*"22"/);
  });
});

describe("QA-001 CI workflow", () => {
  const ci = read(".github/workflows/ci.yml");

  it("runs on pull requests and pushes to main", () => {
    expect(ci).toMatch(/pull_request:/);
    expect(ci).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
  });

  it("has a verify job that installs from the lockfile and runs every gate", () => {
    expect(ci).toMatch(/^\s{2}verify:/m);
    expect(ci).toMatch(/node-version-file: \.nvmrc/);
    for (const step of [
      "pnpm install --frozen-lockfile",
      "pnpm check",
      "pnpm lint",
      "pnpm test",
      "pnpm build",
    ]) {
      expect(ci).toContain(step);
    }
  });
});

describe("DEBT-004 generated output stays out of git", () => {
  const ignored = (p: string) => {
    try {
      execFileSync("git", ["check-ignore", "-q", "--no-index", p], { cwd: root });
      return true;
    } catch {
      return false;
    }
  };

  it("ignores dist-web and new offline packs but keeps the London pack", () => {
    expect(ignored("dist-web/index.html")).toBe(true);
    expect(ignored("server/nexora/offline-data/paris/tiles.pmtiles")).toBe(true);
    expect(ignored("server/nexora/offline-data/london/tiles.pmtiles")).toBe(false);
  });
});
