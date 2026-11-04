import type { IncomingMessage, ServerResponse } from "node:http";

/** Expo web / Metro origins allowed to call the Tailscale API with Bearer tokens. */
export function isExpoDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    // Expo tunnel / Go web previews
    if (url.hostname.endsWith(".exp.direct") || url.hostname.endsWith(".expo.dev")) return true;
    return false;
  } catch {
    return false;
  }
}

export function corsHeaders(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !isExpoDevOrigin(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-headers": "Authorization, Content-Type, Accept",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
}

/** Attach CORS for Expo web. Returns true when an OPTIONS preflight was answered. */
export function applyExpoCors(request: IncomingMessage, response: ServerResponse): boolean {
  const headers = corsHeaders(request);
  if (Object.keys(headers).length === 0) {
    return false;
  }

  const originalWriteHead = response.writeHead.bind(response);
  response.writeHead = ((statusCode: number, ...rest: unknown[]) => {
    if (typeof rest[0] === "string") {
      const message = rest[0];
      const extra = typeof rest[1] === "object" && rest[1] ? (rest[1] as Record<string, string | number | string[]>) : {};
      return originalWriteHead(statusCode, message, { ...headers, ...extra });
    }
    const extra = typeof rest[0] === "object" && rest[0] ? (rest[0] as Record<string, string | number | string[]>) : {};
    return originalWriteHead(statusCode, { ...headers, ...extra });
  }) as typeof response.writeHead;

  if ((request.method ?? "GET").toUpperCase() === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return true;
  }
  return false;
}
