import type { IncomingMessage, ServerResponse } from "node:http";
import { userForToken } from "../modules/access/access.ts";
import { XpatError } from "../modules/integrations/xpat.ts";
import {
  importFromXpat,
  previewXpatLookup,
  syncAllFromXpat,
  syncEmployeeFromXpat,
  XpatSyncError,
} from "../modules/integrations/xpat-sync.ts";
import { readSessionToken } from "../lib/session-cookie.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function readCookie(request: IncomingMessage): string | null {
  return readSessionToken(request);
}

async function actorId(request: IncomingMessage): Promise<string | null> {
  const token = readCookie(request);
  if (!token) return null;
  const user = await userForToken(token);
  return user?.id ?? null;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 100_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object");
  return parsed as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fail(response: ServerResponse, error: unknown): void {
  if (error instanceof XpatError || error instanceof XpatSyncError) {
    sendJson(response, error.status, { error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }
  sendJson(response, 400, { error: error instanceof Error ? error.message : "Xpat request failed" });
}

export async function handleXpatApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;

  const employeeSyncMatch = path.match(/^\/api\/v1\/employees\/([0-9a-f-]{36})\/xpat-sync$/i);
  const isXpatRoute =
    path.startsWith("/api/v1/integrations/xpat") || Boolean(employeeSyncMatch);
  if (!isXpatRoute) return false;

  if (method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: "Cross-origin request rejected" });
    return true;
  }

  const uploadedBy = await actorId(request);

  try {
    const body = await readJson(request);

    if (path === "/api/v1/integrations/xpat/lookup") {
      const preview = await previewXpatLookup({
        workPermitNumber: text(body.workPermitNumber),
        passportNumber: text(body.passportNumber) || null,
        lastName: text(body.lastName) || null,
      });
      sendJson(response, 200, { preview });
      return true;
    }

    if (path === "/api/v1/integrations/xpat/import") {
      const companyId = text(body.companyId);
      if (!uuidPattern.test(companyId)) {
        sendJson(response, 400, { error: "Company is required" });
        return true;
      }
      const result = await importFromXpat({
        companyId,
        workPermitNumber: text(body.workPermitNumber),
        passportNumber: text(body.passportNumber) || null,
        lastName: text(body.lastName) || null,
        uploadedBy,
      });
      sendJson(response, result.created ? 201 : 200, result);
      return true;
    }

    if (path === "/api/v1/integrations/xpat/sync-all") {
      const summary = await syncAllFromXpat(uploadedBy);
      sendJson(response, 200, summary);
      return true;
    }

    if (employeeSyncMatch) {
      const employeeId = employeeSyncMatch[1] ?? "";
      const result = await syncEmployeeFromXpat({
        employeeId,
        passportNumber: text(body.passportNumber) || null,
        lastName: text(body.lastName) || null,
        uploadedBy,
      });
      sendJson(response, 200, result);
      return true;
    }

    sendJson(response, 404, { error: "Xpat route not found" });
    return true;
  } catch (error) {
    fail(response, error);
    return true;
  }
}
