import type { IncomingMessage, ServerResponse } from "node:http";
import { type OfficeUser } from "../modules/access/access.ts";
import { upsertEmployeeSelfServiceAccount } from "../modules/employee-self/accounts.ts";
import {
  changePassword,
  EmployeeSelfError,
  getAttendanceMonth,
  getDashboard,
  getPayslipLine,
  getProfile,
  getSalaryMonth,
  getXpatView,
  listSalaryHistory,
  updateProfilePhone,
} from "../modules/employee-self/service.ts";
import { AccessError } from "../modules/access/access.ts";

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
    if (size > 100_000) throw new EmployeeSelfError("Request body is too large");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new EmployeeSelfError("Request body must be an object");
  return parsed as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEmployeeUser(user: OfficeUser): string {
  if (user.role.slug !== "employee_self_service" || !user.employeeId) {
    throw new EmployeeSelfError("Self-service API is for employee accounts only.", 403);
  }
  return user.employeeId;
}

function fail(response: ServerResponse, error: unknown): void {
  if (error instanceof EmployeeSelfError || error instanceof AccessError) {
    sendJson(response, error instanceof EmployeeSelfError ? error.status : 400, { error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }
  sendJson(response, 400, { error: error instanceof Error ? error.message : "Request failed" });
}

/** HR: create or reset employee self-service login (admin-set password). */
export async function handleEmployeeSelfServiceAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const match = url.pathname.match(/^\/api\/v1\/employees\/([0-9a-f-]{36})\/self-service-account$/i);
  if (!match) return false;
  if (method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: "Cross-origin request rejected" });
    return true;
  }
  try {
    const body = await readJson(request);
    const result = await upsertEmployeeSelfServiceAccount({
      employeeId: match[1] ?? "",
      phone: text(body.phone),
      password: text(body.password),
      name: text(body.name) || undefined,
    });
    sendJson(response, 200, result);
  } catch (error) {
    fail(response, error);
  }
  return true;
}

export async function handleEmployeeSelfApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  user: OfficeUser,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;
  if (!path.startsWith("/api/v1/ess")) return false;

  try {
    const employeeId = requireEmployeeUser(user);

    if (method === "GET" && path === "/api/v1/ess/dashboard") {
      sendJson(response, 200, await getDashboard(employeeId));
      return true;
    }

    if (method === "GET" && path === "/api/v1/ess/attendance") {
      const month =
        url.searchParams.get("month") ??
        `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
      sendJson(response, 200, await getAttendanceMonth(employeeId, month));
      return true;
    }

    if (method === "GET" && path === "/api/v1/ess/salary/history") {
      sendJson(response, 200, { items: await listSalaryHistory(employeeId) });
      return true;
    }

    if (method === "GET" && path === "/api/v1/ess/salary") {
      const month =
        url.searchParams.get("month") ??
        `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
      sendJson(response, 200, { item: await getSalaryMonth(employeeId, month) });
      return true;
    }

    const payslipMatch = path.match(/^\/api\/v1\/ess\/salary\/([0-9a-f-]{36})\/payslip$/i);
    if (method === "GET" && payslipMatch && uuidPattern.test(payslipMatch[1] ?? "")) {
      sendJson(response, 200, await getPayslipLine(employeeId, payslipMatch[1] ?? ""));
      return true;
    }

    if (method === "GET" && path === "/api/v1/ess/xpat") {
      sendJson(response, 200, await getXpatView(employeeId));
      return true;
    }

    if (method === "GET" && path === "/api/v1/ess/profile") {
      sendJson(response, 200, await getProfile(user.id, employeeId));
      return true;
    }

    if (method === "POST" && path === "/api/v1/ess/profile/phone") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(response, 200, await updateProfilePhone(user.id, employeeId, text(body.phone), text(body.phoneConfirm)));
      return true;
    }

    if (method === "POST" && (path === "/api/v1/ess/profile/password" || path === "/api/v1/ess/change-password")) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      await changePassword(user.id, employeeId, text(body.currentPassword), text(body.newPassword));
      sendJson(response, 200, { ok: true, mustChangePassword: false });
      return true;
    }

    sendJson(response, 404, { error: "Not found" });
    return true;
  } catch (error) {
    fail(response, error);
    return true;
  }
}
