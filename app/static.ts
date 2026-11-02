import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const distRoot = join(import.meta.dirname, "../web/dist");

const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function fileFor(pathname: string): string | null {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!relative || relative.includes("\0")) return null;
  const full = normalize(join(distRoot, relative));
  if (full !== distRoot && !full.startsWith(`${distRoot}${sep}`)) return null;
  return full;
}

function sendFile(request: IncomingMessage, response: ServerResponse, file: string, cache: string, type?: string): void {
  response.writeHead(200, {
    "content-type": type ?? types[extname(file)] ?? "application/octet-stream",
    "cache-control": cache,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.svg" ||
    pathname === "/icons.svg" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js"
  );
}

export function serveWeb(request: IncomingMessage, response: ServerResponse, pathname: string): boolean {
  if ((request.method !== "GET" && request.method !== "HEAD") || !existsSync(distRoot)) return false;

  // Never hijack API / health
  if (pathname.startsWith("/api/") || pathname === "/health") return false;

  if (isStaticAsset(pathname)) {
    const file = fileFor(pathname);
    if (!file || !existsSync(file) || !statSync(file).isFile()) return false;
    const immutable = pathname.startsWith("/assets/");
    const sw = pathname === "/sw.js";
    sendFile(
      request,
      response,
      file,
      sw ? "no-cache" : immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400",
      pathname === "/sw.js" ? "text/javascript; charset=utf-8" : undefined,
    );
    return true;
  }

  // SPA: any other non-file GET serves index.html (PWA deep links + mobile routes)
  const index = join(distRoot, "index.html");
  if (!existsSync(index)) return false;
  // Prefer real files if present (e.g. rare root assets)
  const maybe = fileFor(pathname);
  if (maybe && existsSync(maybe) && statSync(maybe).isFile() && extname(maybe)) {
    sendFile(request, response, maybe, "public, max-age=86400");
    return true;
  }
  sendFile(request, response, index, "no-store");
  return true;
}
