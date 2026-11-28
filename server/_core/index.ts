import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "./app";

/** How long in-flight requests get to finish after SIGTERM before the process exits anyway. */
const SHUTDOWN_GRACE_MS = 10_000;

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}

function fail(stage: string, error: unknown): never {
  // Logs the error class and message only; request data and env values never reach here.
  console.error(`[api] ${stage}: ${describeError(error)}`);
  process.exit(1);
}

function handleShutdown(server: Server) {
  let stopping = false;
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(`[api] ${signal} received, closing server`);
    const force = setTimeout(() => {
      console.error("[api] shutdown timed out, exiting");
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    force.unref();
    server.close((error) => {
      if (error) fail("shutdown failed", error);
      process.exit(0);
    });
    // Idle keep-alive sockets would otherwise hold close() open until the grace period ends.
    server.closeIdleConnections();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

async function startServer() {
  const app = createApp();
  const server = createServer(app);

  const port = parseInt(process.env.PORT || "3000");
  server.on("error", (error) => fail("server error", error));
  handleShutdown(server);
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

startServer().catch((error) => fail("server failed to start", error));
