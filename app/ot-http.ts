import type { IncomingMessage, ServerResponse } from "node:http";
import { userForToken } from "../modules/access/access.ts";
import {
  createOtEntry,
  deleteOtEntry,
  deleteOtRate,
  listOtEntries,
  listOtRates,
  OtError,
  resolveOtRate,
  upsertOtRate,
} from "../modules/hr/ot.ts";
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

function idFrom(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const id = path.slice(prefix.length).split("/")[0] ?? "";
  return uuidPattern.test(id) ? id : null;
}

export async function handleOtApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;
  if (!path.startsWith("/api/v1/ot")) return false;

  try {
    if (method === "GET" && path === "/api/v1/ot/rates") {
      sendJson(response, 200, { rates: await listOtRates() });
      return true;
    }

    if (method === "POST" && path === "/api/v1/ot/rates") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 201, await upsertOtRate(await readJson(request)));
      return true;
    }

    if (method === "GET" && path === "/api/v1/ot/resolve") {
      sendJson(
        response,
        200,
        await resolveOtRate({
          companyId: url.searchParams.get("companyId"),
          projectId: url.searchParams.get("projectId"),
          clientCompanyId: url.searchParams.get("clientCompanyId"),
        }),
      );
      return true;
    }

    const rateId = idFrom(path, "/api/v1/ot/rates/");
    if (method === "DELETE" && rateId && path === `/api/v1/ot/rates/${rateId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      await deleteOtRate(rateId);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (method === "GET" && path === "/api/v1/ot/entries") {
      sendJson(
        response,
        200,
        await listOtEntries({
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          employeeId: url.searchParams.get("employeeId"),
          companyId: url.searchParams.get("companyId"),
          clientId: url.searchParams.get("clientId"),
        }),
      );
      return true;
    }

    if (method === "POST" && path === "/api/v1/ot/entries") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 201, await createOtEntry(await readJson(request), await actorId(request)));
      return true;
    }

    const entryId = idFrom(path, "/api/v1/ot/entries/");
    if (method === "DELETE" && entryId && path === `/api/v1/ot/entries/${entryId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const deleted = await deleteOtEntry(entryId);
      if (!deleted) {
        sendJson(response, 404, { error: "OT entry not found" });
        return true;
      }
      sendJson(response, 200, { ok: true });
      return true;
    }

    sendJson(response, 404, { error: "OT route not found" });
    return true;
  } catch (error) {
    const message = error instanceof OtError || error instanceof Error ? error.message : "OT request failed";
    sendJson(response, error instanceof OtError ? 400 : 500, { error: message });
    return true;
  }
}
