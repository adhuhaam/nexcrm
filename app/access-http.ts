import type { IncomingMessage, ServerResponse } from "node:http";
import { isExpoDevOrigin } from "../lib/cors.ts";
import {
  AccessError,
  accessCatalog,
  authorize,
  closeSession,
  createRole,
  createUser,
  deleteRole,
  listRoles,
  listUsers,
  openSession,
  updateRole,
  updateUser,
  userForToken,
  type OfficeUser,
} from "../modules/access/access.ts";
import type { ModulePermission } from "../modules/access/permissions.ts";
import { getSystemHealth } from "../lib/health.ts";
import {
  getSystemSettingsView,
  saveSystemSettings,
  settingsCatalog,
} from "../modules/settings/settings.ts";
import { ExpenseError } from "../modules/expenses/expenses.ts";
import {
  getFinanceFeeSettings,
  listDepositRates,
  updateFinanceFeeSettings,
  upsertDepositRate,
} from "../modules/expenses/finance.ts";

const cookieName = "nexcrm_session";

function sendJson(response: ServerResponse, status: number, body: unknown, extra?: Record<string, string>): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extra });
  response.end(JSON.stringify(body));
}

function wantsJson(request: IncomingMessage): boolean {
  const accept = request.headers.accept ?? "";
  const type = request.headers["content-type"] ?? "";
  return accept.includes("application/json") || type.includes("application/json");
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
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === cookieName) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function cookieHeader(token: string, request: IncomingMessage, clear = false): string {
  const secure = request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  const value = clear ? "" : token;
  const age = clear ? 0 : 60 * 60 * 12;
  return `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
}

async function readRecord(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 100_000) throw new AccessError("Request body is too large");
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const type = request.headers["content-type"] ?? "";
  if (type.includes("application/json")) {
    const parsed: unknown = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new AccessError("Request body must be an object");
    return parsed as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

function readClientIds(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

function readPermissions(value: unknown): ModulePermission[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: ModulePermission[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const module = text(row.module);
    if (!module) continue;
    rows.push({
      module,
      canView: flag(row.canView),
      canCreate: flag(row.canCreate),
      canEdit: flag(row.canEdit),
      canDelete: flag(row.canDelete),
    });
  }
  return rows.length ? rows : undefined;
}

function publicView(user: OfficeUser | null) {
  if (!user) return { user: null };
  return {
    user: { id: user.id, name: user.name, email: user.email },
    role: user.role,
    scopedClientIds: user.scopedClientIds,
  };
}

function denied(request: IncomingMessage, response: ServerResponse, status: number, message: string): void {
  if (wantsJson(request) || (request.method ?? "GET") !== "GET") {
    sendJson(response, status, { error: message });
    return;
  }
  response.writeHead(303, { location: status === 401 ? "/login" : "/" });
  response.end();
}

export async function guardAccess(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;
  const token = readCookie(request);

  if (method === "POST" && path === "/login") {
    // Same-site office UI, native Expo (no Origin), or Expo web/Metro on localhost / tunnels.
    const origin = request.headers.origin;
    if (origin && !sameOrigin(request) && !(typeof origin === "string" && isExpoDevOrigin(origin))) {
      sendJson(response, 403, { error: "Sign-in must come from this site." });
      return true;
    }
    try {
      const body = await readRecord(request);
      const opened = await openSession(text(body.email), text(body.password));
      if (!opened) {
        sendJson(response, 401, { error: "Email or password is not recognised." });
        return true;
      }
      sendJson(response, 200, { location: "/", token: opened.token }, { "set-cookie": cookieHeader(opened.token, request) });
    } catch (error) {
      const message = error instanceof AccessError ? error.message : "Sign-in failed.";
      sendJson(response, 400, { error: message });
    }
    return true;
  }

  if (method === "POST" && path === "/logout") {
    if (token) await closeSession(token);
    if (wantsJson(request)) {
      sendJson(response, 200, { location: "/login" }, { "set-cookie": cookieHeader("", request, true) });
    } else {
      response.writeHead(303, { location: "/login", "set-cookie": cookieHeader("", request, true) });
      response.end();
    }
    return true;
  }

  const user = token ? await userForToken(token) : null;
  if (method === "GET" && path === "/api/v1/session") {
    sendJson(response, 200, publicView(user));
    return true;
  }

  if (!user) {
    denied(request, response, 401, "Sign in to open the office.");
    return true;
  }

  const refusal = authorize(method, path, user);
  if (refusal) {
    denied(request, response, 403, refusal);
    return true;
  }

  if (path.startsWith("/api/v1/admin")) return handleAdmin(request, response, url, user);
  return false;
}

async function handleAdmin(request: IncomingMessage, response: ServerResponse, url: URL, user: OfficeUser): Promise<boolean> {
  const method = request.method ?? "GET";
  if (method === "GET" && url.pathname === "/api/v1/admin/access") {
    const { listCompanies } = await import("../modules/companies/companies.ts");
    sendJson(response, 200, {
      roles: await listRoles(),
      users: await listUsers(),
      clients: await listCompanies("client"),
      actorId: user.id,
      catalog: accessCatalog(),
    });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/v1/admin/settings") {
    sendJson(response, 200, {
      ...(await getSystemSettingsView()),
      catalog: settingsCatalog(),
    });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/v1/admin/health") {
    sendJson(response, 200, await getSystemHealth());
    return true;
  }
  if (method === "GET" && url.pathname === "/api/v1/admin/finance-rates") {
    sendJson(response, 200, await getFinanceFeeSettings());
    return true;
  }
  if (method === "GET" && url.pathname === "/api/v1/admin/deposit-rates") {
    sendJson(response, 200, { rates: await listDepositRates(url.searchParams.get("q")) });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/v1/admin/finance-rates") {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: "This change must come from this site." });
      return true;
    }
    try {
      const body = await readRecord(request);
      sendJson(response, 200, await updateFinanceFeeSettings(body));
    } catch (error) {
      const message =
        error instanceof ExpenseError || error instanceof AccessError || error instanceof SyntaxError
          ? error.message
          : "Could not save finance rates.";
      sendJson(response, 400, { error: message });
    }
    return true;
  }
  if (
    (method === "PUT" || method === "POST") &&
    url.pathname === "/api/v1/admin/deposit-rates"
  ) {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: "This change must come from this site." });
      return true;
    }
    try {
      const body = await readRecord(request);
      sendJson(
        response,
        200,
        await upsertDepositRate({
          id: typeof body.id === "string" ? body.id : null,
          countryName: text(body.countryName),
          isoCode: text(body.isoCode),
          amount: text(body.amount),
        }),
      );
    } catch (error) {
      const message =
        error instanceof ExpenseError || error instanceof AccessError || error instanceof SyntaxError
          ? error.message
          : "Could not save deposit rate.";
      sendJson(response, 400, { error: message });
    }
    return true;
  }
  if (method === "POST" && url.pathname === "/api/v1/admin/settings") {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: "This change must come from this site." });
      return true;
    }
    try {
      const body = await readRecord(request);
      const clearApiKey = flag(body.clearApiKey);
      const apiKey = body.apiKey === undefined ? undefined : text(body.apiKey);
      const model = body.model === undefined ? undefined : text(body.model);
      const settings = await saveSystemSettings({
        apiKey: clearApiKey ? null : apiKey,
        clearApiKey,
        model,
        officeName: body.officeName === undefined ? undefined : text(body.officeName),
        supportEmail: body.supportEmail === undefined ? undefined : text(body.supportEmail),
        timeZone: body.timeZone === undefined ? undefined : text(body.timeZone),
        currency: body.currency === undefined ? undefined : text(body.currency),
        dateFormat: body.dateFormat === undefined ? undefined : text(body.dateFormat),
        weekStartsOn: body.weekStartsOn === undefined ? undefined : text(body.weekStartsOn),
      });
      sendJson(response, 200, { ...settings, catalog: settingsCatalog() });
    } catch (error) {
      const message = error instanceof AccessError || error instanceof SyntaxError ? error.message : "Could not save settings.";
      sendJson(response, 400, { error: message });
    }
    return true;
  }
  if (method !== "POST") {
    sendJson(response, 404, { error: "That access page was not found." });
    return true;
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: "This change must come from this site." });
    return true;
  }
  try {
    const body = await readRecord(request);
    if (url.pathname === "/api/v1/admin/roles") {
      const created = await createRole({
        name: text(body.name),
        canPreview: flag(body.canPreview),
        canEdit: flag(body.canEdit),
        canDelete: flag(body.canDelete),
        permissions: readPermissions(body.permissions),
      });
      sendJson(response, 200, {
        ok: true,
        role: created,
        location: text(body.returnTo) === "/users" ? "/users" : "/admin",
      });
      return true;
    }
    const roleId = url.pathname.match(/^\/api\/v1\/admin\/roles\/([0-9a-f-]{36})$/i)?.[1];
    if (roleId && url.pathname.endsWith(roleId)) {
      await updateRole(roleId, {
        name: text(body.name),
        canPreview: flag(body.canPreview),
        canEdit: flag(body.canEdit),
        canDelete: flag(body.canDelete),
        permissions: readPermissions(body.permissions),
      });
      sendJson(response, 200, { ok: true, location: text(body.returnTo) === "/users" ? "/users" : "/admin" });
      return true;
    }
    const deleteId = url.pathname.match(/^\/api\/v1\/admin\/roles\/([0-9a-f-]{36})\/delete$/i)?.[1];
    if (deleteId) {
      await deleteRole(deleteId);
      sendJson(response, 200, { location: text(body.returnTo) === "/users" ? "/users" : "/admin" });
      return true;
    }
    if (url.pathname === "/api/v1/admin/users") {
      await createUser({
        name: text(body.name),
        email: text(body.email),
        password: text(body.password),
        roleId: text(body.roleId),
        clientCompanyIds: readClientIds(body.clientCompanyIds),
      });
      const returnTo = text(body.returnTo) === "/admin" ? "/admin" : "/users";
      sendJson(response, 200, { location: returnTo });
      return true;
    }
    const userId = url.pathname.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})$/i)?.[1];
    if (userId) {
      await updateUser(userId, {
        roleId: text(body.roleId),
        active: flag(body.active),
        name: body.name === undefined ? undefined : text(body.name),
        password: body.password === undefined ? undefined : text(body.password),
        clientCompanyIds: body.clientCompanyIds === undefined ? undefined : readClientIds(body.clientCompanyIds),
      });
      const returnTo = text(body.returnTo) === "/admin" ? "/admin" : "/users";
      sendJson(response, 200, { location: returnTo });
      return true;
    }
  } catch (error) {
    const message = error instanceof AccessError || error instanceof SyntaxError ? error.message : "Could not save access.";
    sendJson(response, 400, { error: message });
    return true;
  }
  sendJson(response, 404, { error: "That access page was not found." });
  return true;
}
