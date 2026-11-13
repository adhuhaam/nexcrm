/**
 * Local CORS proxy for Expo web → JACMS API.
 * Strips Origin so login works before server CORS is deployed.
 */
import http from "node:http";
import https from "node:https";
function jacmsEnv(suffix: string, fallback: string): string {
  const primary = process.env[`JACMS_${suffix}`];
  if (primary) return primary;
  const legacy = process.env[`NEXCRM_${suffix}`];
  if (legacy) {
    console.warn(`[jacms] Deprecated env NEXCRM_${suffix}; use JACMS_${suffix}.`);
    return legacy;
  }
  return fallback;
}

const DEFAULT_ORIGIN =
  process.env.EXPO_PUBLIC_JACMS_API_URL?.trim() ||
  process.env.APP_URL?.trim() ||
  "https://jacms.bluraymaldives.site";
const TARGET = jacmsEnv("API_ORIGIN", DEFAULT_ORIGIN);
const PORT = Number(jacmsEnv("API_PROXY_PORT", "8787"));
const target = new URL(TARGET);

const server = http.createServer((req, res) => {
  const origin = req.headers.origin ?? "http://localhost:8081";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const upstreamPath = req.url ?? "/";
  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host };
  delete headers.origin;
  delete headers.host;
  headers.host = target.host;

  const transport = target.protocol === "http:" ? http : https;
  const upstream = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: upstreamPath,
      method: req.method,
      headers,
    },
    (up) => {
      const outHeaders = { ...up.headers };
      delete outHeaders["access-control-allow-origin"];
      delete outHeaders["access-control-allow-headers"];
      delete outHeaders["access-control-allow-methods"];
      res.writeHead(up.statusCode ?? 502, outHeaders);
      up.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Proxy could not reach ${TARGET}: ${error.message}` }));
  });

  req.pipe(upstream);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`JACMS API proxy http://127.0.0.1:${PORT} → ${TARGET}`);
});
