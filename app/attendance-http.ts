import type { IncomingMessage, ServerResponse } from "node:http";
import { userForToken } from "../modules/access/access.ts";
import {
  AttendanceError,
  createAttendance,
  deleteAttendance,
  getAttendance,
  getMonthSheet,
  getPeriodSummary,
  listAttendance,
  saveEmployeeMonth,
  saveEmployeeMonthBulk,
  updateAttendance,
  upsertAttendanceDay,
} from "../modules/hr/attendance.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cookieName = "nexcrm_session";

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
    if (size > 1_000_000) throw new Error("Request body is too large");
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

export async function handleAttendanceApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;
  if (!path.startsWith("/api/v1/attendance")) return false;

  try {
    if (method === "GET" && path === "/api/v1/attendance") {
      sendJson(
        response,
        200,
        await listAttendance({
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          status: url.searchParams.get("status"),
          employeeId: url.searchParams.get("employeeId"),
          companyId: url.searchParams.get("companyId"),
          q: url.searchParams.get("q"),
        }),
      );
      return true;
    }

    if (method === "GET" && path === "/api/v1/attendance/month") {
      const year = Number(url.searchParams.get("year"));
      const month = Number(url.searchParams.get("month"));
      sendJson(
        response,
        200,
        await getMonthSheet({
          year,
          month,
          companyId: url.searchParams.get("companyId"),
          clientCompanyId: url.searchParams.get("clientCompanyId"),
          q: url.searchParams.get("q"),
        }),
      );
      return true;
    }

    if (method === "GET" && path === "/api/v1/attendance/period-summary") {
      sendJson(
        response,
        200,
        await getPeriodSummary({
          clientCompanyId: url.searchParams.get("clientCompanyId"),
          employerCompanyId: url.searchParams.get("employerCompanyId"),
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        }),
      );
      return true;
    }

    if (method === "POST" && path === "/api/v1/attendance/month/employee") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(
        response,
        200,
        await saveEmployeeMonth({
          employeeId: body.employeeId,
          year: body.year,
          month: body.month,
          days: body.days,
          createdBy: await actorId(request),
        }),
      );
      return true;
    }

    if (method === "POST" && path === "/api/v1/attendance/month/bulk") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(
        response,
        200,
        await saveEmployeeMonthBulk({
          year: body.year,
          month: body.month,
          employees: body.employees,
          createdBy: await actorId(request),
        }),
      );
      return true;
    }

    if (method === "POST" && path === "/api/v1/attendance") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 201, await createAttendance(await readJson(request), await actorId(request)));
      return true;
    }

    if (method === "POST" && path === "/api/v1/attendance/day") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(
        response,
        201,
        await upsertAttendanceDay({
          attendanceDate: body.attendanceDate,
          status: body.status,
          employeeIds: body.employeeIds,
          note: body.note,
          createdBy: await actorId(request),
        }),
      );
      return true;
    }

    const attendanceId = idFrom(path, "/api/v1/attendance/");
    if (method === "GET" && attendanceId && path === `/api/v1/attendance/${attendanceId}`) {
      const record = await getAttendance(attendanceId);
      if (!record) {
        sendJson(response, 404, { error: "Attendance record not found" });
        return true;
      }
      sendJson(response, 200, record);
      return true;
    }

    if (method === "PATCH" && attendanceId && path === `/api/v1/attendance/${attendanceId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const updated = await updateAttendance(attendanceId, await readJson(request));
      if (!updated) {
        sendJson(response, 404, { error: "Attendance record not found" });
        return true;
      }
      sendJson(response, 200, updated);
      return true;
    }

    if (method === "DELETE" && attendanceId && path === `/api/v1/attendance/${attendanceId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const deleted = await deleteAttendance(attendanceId);
      if (!deleted) {
        sendJson(response, 404, { error: "Attendance record not found" });
        return true;
      }
      sendJson(response, 200, { ok: true });
      return true;
    }

    sendJson(response, 404, { error: "Attendance route not found" });
    return true;
  } catch (error) {
    const message = error instanceof AttendanceError || error instanceof Error ? error.message : "Attendance request failed";
    const status = error instanceof AttendanceError ? 400 : 500;
    sendJson(response, status, { error: message });
    return true;
  }
}
