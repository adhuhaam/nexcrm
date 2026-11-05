import { createServer } from "node:http";
import { handleRequest } from "./http.ts";
import { serveWeb } from "./static.ts";
import { applyExpoCors } from "../lib/cors.ts";
import { pool } from "../lib/db.ts";
import { checkHealth } from "../lib/health.ts";
import { migrate } from "../lib/migrate.ts";
import { seedAccess } from "../modules/access/seed.ts";
import { ensureFileRoot } from "../modules/files/storage.ts";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3000");

await migrate(pool);
await ensureFileRoot();
await seedAccess();

const server = createServer(async (request, response) => {
  if (applyExpoCors(request, response)) return;

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/health") {
    try {
      const report = await checkHealth();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(report));
    } catch (error) {
      const message = error instanceof Error ? error.message : "health check failed";
      console.error(message);
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
    }
    return;
  }

  if (serveWeb(request, response, url.pathname)) return;
  await handleRequest(request, response);
});

server.listen(port, host, () => {
  console.log(`NEXCRM listening on http://${host}:${port}`);
});

function shutdown(): void {
  server.close(() => {
    void pool.end();
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
