import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:net";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

/**
 * OPS-002 (server half): the real entry point runs in a child process, so a failed start
 * is logged and exits non-zero, and SIGTERM closes the server cleanly (Render sends it on
 * every deploy and restart).
 */
const entry = join(__dirname, "../server/_core/index.ts");
const children: ChildProcess[] = [];
let blocker: Server | null = null;

afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill("SIGKILL");
  if (blocker) await new Promise((r) => blocker!.close(r));
  blocker = null;
});

function start(port: number) {
  const child = spawn(process.execPath, ["--import", "tsx", entry], {
    cwd: join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", NEXORA_TFL_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let stdout = "";
  let stderr = "";
  child.stdout!.on("data", (d) => (stdout += d));
  child.stderr!.on("data", (d) => (stderr += d));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  const listening = async () => {
    const deadline = Date.now() + 20_000;
    while (!stdout.includes("server listening")) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error(`server did not start: ${stderr}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  return { child, exited, listening, output: () => ({ stdout, stderr }) };
}

async function busyPort(): Promise<number> {
  blocker = createServer();
  blocker.listen(0, "0.0.0.0");
  await new Promise((r) => blocker!.once("listening", r));
  return (blocker.address() as AddressInfo).port;
}

describe("server lifecycle (OPS-002)", () => {
  it("logs the listen error and exits non-zero when the port is taken", async () => {
    const port = await busyPort();
    const server = start(port);
    expect(await server.exited).toBe(1);
    expect(server.output().stderr).toMatch(/\[api\] server error: EADDRINUSE/);
  }, 30_000);

  it("closes cleanly with exit code 0 on SIGTERM", async () => {
    const port = await busyPort();
    await new Promise((r) => blocker!.close(r));
    blocker = null;
    const server = start(port);
    await server.listening();
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBeLessThan(500);
    server.child.kill("SIGTERM");
    expect(await server.exited).toBe(0);
    expect(server.output().stdout).toContain("SIGTERM received");
  }, 30_000);
});
