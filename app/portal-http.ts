import type { IncomingMessage, ServerResponse } from "node:http";
import { AccessError, type OfficeUser } from "../modules/access/access.ts";
import {
  listPortalAccountsForCompany,
  resetPortalAccountPassword,
  setPortalAccountActive,
  upsertPortalAccount,
} from "../modules/portal/accounts.ts";
import {
  clientAttendanceMonth,
  clientDashboard,
  clientInvoices,
  clientPayments,
  clientRecruitment,
  clientWorkers,
} from "../modules/portal/client.ts";
import { PortalError } from "../modules/portal/errors.ts";
import {
  employerAttendanceMonth,
  employerDashboard,
  employerEmployeeDocuments,
  employerEmployees,
  employerInvoices,
  employerPayments,
  employerPayrollMonth,
  employerQuota,
} from "../modules/portal/employer.ts";
import { PORTAL_CLIENT_ROLE, PORTAL_EMPLOYER_ROLE, requirePortalCompany } from "../modules/portal/scope.ts";
import { changePortalPassword } from "../modules/portal/shared.ts";
import { openFileStream } from "../modules/files/storage.ts";
import { pool } from "../lib/db.ts";

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

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 100_000) throw new PortalError("Request body is too large");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new PortalError("Request body must be an object");
  return parsed as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(response: ServerResponse, error: unknown): void {
  if (error instanceof PortalError || error instanceof AccessError) {
    sendJson(response, error instanceof PortalError ? error.status : 400, { error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }
  sendJson(response, 400, { error: error instanceof Error ? error.message : "Request failed" });
}

function defaultMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Admin: provision portal logins for a legal employer or client company. */
export async function handlePortalAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const listMatch = url.pathname.match(/^\/api\/v1\/companies\/([0-9a-f-]{36})\/portal-accounts$/i);
  if (listMatch) {
    const companyId = listMatch[1] ?? "";
    if (method === "GET") {
      sendJson(response, 200, { items: await listPortalAccountsForCompany(companyId) });
      return true;
    }
    if (method === "POST") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      try {
        const body = await readJson(request);
        const result = await upsertPortalAccount({
          companyId,
          email: text(body.email),
          password: text(body.password),
          name: text(body.name),
        });
        sendJson(response, 200, result);
      } catch (error) {
        fail(response, error);
      }
      return true;
    }
    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  }

  const accountMatch = url.pathname.match(/^\/api\/v1\/portal-accounts\/([0-9a-f-]{36})$/i);
  if (accountMatch && method === "PATCH") {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: "Cross-origin request rejected" });
      return true;
    }
    try {
      const body = await readJson(request);
      const userId = accountMatch[1] ?? "";
      if (body.active !== undefined) {
        await setPortalAccountActive(userId, body.active === true || body.active === "true");
      }
      const password = text(body.password);
      if (password) await resetPortalAccountPassword(userId, password);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      fail(response, error);
    }
    return true;
  }

  return false;
}

async function assertFileForEmployerEmployee(employerId: string, fileId: string): Promise<void> {
  const row = await pool.query<{ employee_id: string }>(
    `select fl.entity_id as employee_id
     from files f
     join file_links fl on fl.file_id = f.id
     join employees e on e.id = fl.entity_id and fl.entity_type = 'employee'
     where f.id = $1 and e.company_id = $2
     limit 1`,
    [fileId, employerId],
  );
  if (!row.rows[0]) throw new PortalError("File not found.", 404);
}

export async function handlePortalApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  user: OfficeUser,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;
  if (!path.startsWith("/api/v1/portal/")) return false;

  try {
    if (path.startsWith("/api/v1/portal/employer")) {
      const employerId = requirePortalCompany(user, PORTAL_EMPLOYER_ROLE);

      if (method === "GET" && path === "/api/v1/portal/employer/dashboard") {
        sendJson(response, 200, await employerDashboard(employerId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/employer/employees") {
        sendJson(response, 200, await employerEmployees(employerId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/employer/quota") {
        sendJson(response, 200, await employerQuota(employerId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/employer/invoices") {
        sendJson(response, 200, await employerInvoices(employerId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/employer/payments") {
        sendJson(response, 200, await employerPayments(employerId));
        return true;
      }
      const docsMatch = path.match(/^\/api\/v1\/portal\/employer\/employees\/([0-9a-f-]{36})\/documents$/i);
      if (method === "GET" && docsMatch) {
        sendJson(response, 200, await employerEmployeeDocuments(employerId, docsMatch[1] ?? ""));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/employer/payroll") {
        const month = url.searchParams.get("month") ?? defaultMonth();
        sendJson(response, 200, await employerPayrollMonth(employerId, month));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/employer/attendance") {
        const month = url.searchParams.get("month") ?? defaultMonth();
        sendJson(response, 200, await employerAttendanceMonth(employerId, month));
        return true;
      }
      const fileMatch = path.match(/^\/api\/v1\/portal\/employer\/files\/([0-9a-f-]{36})\/download$/i);
      if (method === "GET" && fileMatch && uuidPattern.test(fileMatch[1] ?? "")) {
        const fileId = fileMatch[1] ?? "";
        await assertFileForEmployerEmployee(employerId, fileId);
        const opened = await openFileStream(fileId);
        response.writeHead(200, {
          "content-type": opened.file.mimeType,
          "content-disposition": `attachment; filename="${opened.file.originalName.replace(/"/g, "")}"`,
        });
        opened.stream.pipe(response);
        return true;
      }
      if (method === "POST" && path === "/api/v1/portal/employer/change-password") {
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: "Cross-origin request rejected" });
          return true;
        }
        const body = await readJson(request);
        await changePortalPassword(user.id, employerId, text(body.currentPassword), text(body.newPassword));
        sendJson(response, 200, { ok: true, mustChangePassword: false });
        return true;
      }
    }

    if (path.startsWith("/api/v1/portal/client")) {
      const clientId = requirePortalCompany(user, PORTAL_CLIENT_ROLE);

      if (method === "GET" && path === "/api/v1/portal/client/dashboard") {
        sendJson(response, 200, await clientDashboard(clientId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/client/workers") {
        sendJson(response, 200, await clientWorkers(clientId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/client/recruitment") {
        sendJson(response, 200, await clientRecruitment(clientId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/client/invoices") {
        sendJson(response, 200, await clientInvoices(clientId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/client/payments") {
        sendJson(response, 200, await clientPayments(clientId));
        return true;
      }
      if (method === "GET" && path === "/api/v1/portal/client/attendance") {
        const month = url.searchParams.get("month") ?? defaultMonth();
        sendJson(response, 200, await clientAttendanceMonth(clientId, month));
        return true;
      }
      if (method === "POST" && path === "/api/v1/portal/client/change-password") {
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: "Cross-origin request rejected" });
          return true;
        }
        const body = await readJson(request);
        await changePortalPassword(user.id, clientId, text(body.currentPassword), text(body.newPassword));
        sendJson(response, 200, { ok: true, mustChangePassword: false });
        return true;
      }
    }

    sendJson(response, 404, { error: "Not found" });
    return true;
  } catch (error) {
    fail(response, error);
    return true;
  }
}
