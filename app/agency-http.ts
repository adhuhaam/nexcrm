import type { IncomingMessage, ServerResponse } from "node:http";
import { createCompany, getCompany, listCompanies, listCompaniesWithCounts } from "../modules/companies/companies.ts";
import { CompanyValidationError } from "../modules/companies/validation.ts";
import {
  AllocationError,
  changeAllocationRates,
  createAllocation,
  createAllocationsBatch,
  headcountByClient,
  listAllocationEvents,
  listAllocations,
  endAllocation,
  transferAllocation,
} from "../modules/hr/allocations.ts";
import {
  ClientRateError,
  deleteClientDesignationRate,
  listClientDesignationRates,
  upsertClientDesignationRate,
} from "../modules/hr/client-rates.ts";
import {
  createDesignation,
  deactivateDesignation,
  DesignationError,
  listDesignations,
  updateDesignation,
} from "../modules/hr/designations.ts";
import {
  createPayRuns,
  deletePayRun,
  getPayRun,
  getPayRunForPaymentRequest,
  getPayRunForSalarySheet,
  listEmployersForClient,
  listPayRuns,
  lockPayRun,
  PayrollError,
  recalculatePayRun,
} from "../modules/hr/payroll.ts";
import {
  FileError,
  listDriveFiles,
  listEntityFiles,
  openFileStream,
  readMultipart,
  storeBuffer,
} from "../modules/files/storage.ts";
import { getLetter } from "../modules/documents/letters.ts";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.ts";
import { letters } from "../lib/schema.ts";
import { userForToken } from "../modules/access/access.ts";
import { EmployeeError, getEmployee, updateEmployee } from "../modules/hr/employees.ts";
import {
  AccommodationError,
  chargePreview,
  checkIn,
  checkOut,
  createAccommodation,
  listAccommodations,
  listActiveStays,
  updateAccommodation,
} from "../modules/hr/accommodations.ts";
import { extractPassportFields, PassportOcrError } from "../modules/hr/passport-ocr.ts";
import { onboardEmployee, OnboardError, scanPassportForOnboard } from "../modules/hr/onboard.ts";
import { getProjectView } from "../modules/projects/projects.ts";
import { openaiIntegrationStatus } from "../modules/settings/settings.ts";

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
    if (size > 200_000) throw new Error("Request body is too large");
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

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function handleAgencyApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/api/v1/accommodations") {
      sendJson(response, 200, {
        accommodations: await listAccommodations(),
        stays: await listActiveStays(),
      });
      return true;
    }
    if (method === "POST" && path === "/api/v1/accommodations") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 201, await createAccommodation(await readJson(request)));
      return true;
    }
    if (method === "GET" && path === "/api/v1/accommodations/charges") {
      sendJson(response, 200, {
        charges: await chargePreview(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? ""),
      });
      return true;
    }
    const accommodationId = idFrom(path, "/api/v1/accommodations/");
    if (method === "PATCH" && accommodationId && path === `/api/v1/accommodations/${accommodationId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 200, await updateAccommodation(accommodationId, await readJson(request)));
      return true;
    }
    if (method === "POST" && accommodationId && path === `/api/v1/accommodations/${accommodationId}/check-in`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(
        response,
        201,
        await checkIn({
          accommodationId,
          employeeId: text(body.employeeId),
          checkIn: text(body.checkIn),
          notes: text(body.notes) || null,
        }),
      );
      return true;
    }
    if (method === "POST" && path.startsWith("/api/v1/accommodations/stays/") && path.endsWith("/check-out")) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const stayId = path.slice("/api/v1/accommodations/stays/".length, -"/check-out".length);
      if (!uuidPattern.test(stayId)) {
        sendJson(response, 404, { error: "Stay not found" });
        return true;
      }
      const body = await readJson(request);
      await checkOut(stayId, text(body.checkOut));
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (method === "POST" && path === "/api/v1/employees/onboard/scan") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const multipart = await readMultipart(request);
      if (!multipart.file) {
        sendJson(response, 400, { error: "Upload a passport image" });
        return true;
      }
      const result = await scanPassportForOnboard({
        buffer: multipart.file.buffer,
        filename: multipart.file.filename,
        mimeType: multipart.file.mimeType,
        uploadedBy: await actorId(request),
      });
      sendJson(response, 201, {
        ...result,
        note: "Review proposed fields before saving. Blank means unread.",
      });
      return true;
    }

    if (method === "POST" && path === "/api/v1/employees/onboard") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      const person = body.person && typeof body.person === "object" && !Array.isArray(body.person) ? (body.person as Record<string, unknown>) : body;
      const clientAllocation =
        body.clientAllocation && typeof body.clientAllocation === "object" && !Array.isArray(body.clientAllocation)
          ? (body.clientAllocation as Record<string, unknown>)
          : null;
      const accommodationStay =
        body.accommodationStay && typeof body.accommodationStay === "object" && !Array.isArray(body.accommodationStay)
          ? (body.accommodationStay as Record<string, unknown>)
          : null;
      const created = await onboardEmployee({
        person,
        companyId: text(body.companyId || person.companyId),
        projectId: text(body.projectId) || null,
        siteId: text(body.siteId) || null,
        quotaPoolId: text(body.quotaPoolId) || null,
        slotId: text(body.slotId) || null,
        clientAllocation: clientAllocation
          ? {
              clientCompanyId: text(clientAllocation.clientCompanyId),
              joinDate: text(clientAllocation.joinDate),
              designation: text(clientAllocation.designation) || null,
              staffSalary: text(clientAllocation.staffSalary),
              billRate: text(clientAllocation.billRate),
              currency: text(clientAllocation.currency) || "MVR",
            }
          : null,
        accommodationStay: accommodationStay
          ? {
              accommodationId: text(accommodationStay.accommodationId),
              checkIn: text(accommodationStay.checkIn),
              notes: text(accommodationStay.notes) || null,
            }
          : null,
        scanFileId: text(body.scanFileId) || null,
        createdBy: await actorId(request),
      });
      sendJson(response, 201, created);
      return true;
    }

    if (method === "GET" && path === "/api/v1/onboard/options") {
      const companyId = url.searchParams.get("companyId") ?? "";
      const projectId = url.searchParams.get("projectId");
      const employers = await listCompanies("employer");
      const clients = await listCompanies("client");
      const accommodations = await listAccommodations();
      const openai = await openaiIntegrationStatus();
      let projectView = null;
      if (projectId && uuidPattern.test(projectId)) {
        projectView = await getProjectView(projectId);
      }
      sendJson(response, 200, {
        employers,
        clients,
        accommodations: accommodations.filter((item) => item.status === "active"),
        companyId: uuidPattern.test(companyId) ? companyId : null,
        project: projectView,
        openai,
      });
      return true;
    }

    if (method === "GET" && path === "/api/v1/designations") {
      const includeInactive = url.searchParams.get("includeInactive") === "1";
      sendJson(response, 200, { designations: await listDesignations({ includeInactive }) });
      return true;
    }
    if (method === "POST" && path === "/api/v1/designations") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      try {
        const body = await readJson(request);
        const created = await createDesignation({ name: body.name, sortOrder: body.sortOrder });
        sendJson(response, 201, created);
      } catch (reason) {
        if (reason instanceof DesignationError) {
          sendJson(response, 400, { error: reason.message });
          return true;
        }
        throw reason;
      }
      return true;
    }
    const designationId = idFrom(path, "/api/v1/designations/");
    if (designationId && path === `/api/v1/designations/${designationId}`) {
      try {
        if (method === "PATCH") {
          if (!sameOrigin(request)) {
            sendJson(response, 403, { error: "Cross-origin request rejected" });
            return true;
          }
          const body = await readJson(request);
          sendJson(
            response,
            200,
            await updateDesignation(designationId, {
              name: body.name,
              sortOrder: body.sortOrder,
              active: body.active,
            }),
          );
          return true;
        }
        if (method === "DELETE") {
          if (!sameOrigin(request)) {
            sendJson(response, 403, { error: "Cross-origin request rejected" });
            return true;
          }
          const ok = await deactivateDesignation(designationId);
          if (!ok) {
            sendJson(response, 404, { error: "Designation not found" });
            return true;
          }
          sendJson(response, 200, { ok: true });
          return true;
        }
      } catch (reason) {
        if (reason instanceof DesignationError) {
          sendJson(response, 400, { error: reason.message });
          return true;
        }
        throw reason;
      }
    }

    if (method === "GET" && path === "/api/v1/clients") {
      sendJson(response, 200, { clients: await listCompaniesWithCounts({ kind: "client" }) });
      return true;
    }
    if (method === "GET" && path === "/api/v1/employers") {
      sendJson(response, 200, { employers: await listCompanies("employer") });
      return true;
    }
    if (method === "POST" && path === "/api/v1/clients") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      const created = await createCompany({ ...body, kind: "client" });
      sendJson(response, 201, created);
      return true;
    }

    const clientRatesMatch = path.match(/^\/api\/v1\/clients\/([0-9a-f-]{36})\/rates(?:\/([0-9a-f-]{36}))?$/i);
    if (clientRatesMatch) {
      const clientCompanyId = clientRatesMatch[1];
      const rateId = clientRatesMatch[2] ?? null;
      try {
        if (method === "GET" && !rateId) {
          sendJson(response, 200, { rates: await listClientDesignationRates(clientCompanyId) });
          return true;
        }
        if (method === "POST" && !rateId) {
          if (!sameOrigin(request)) {
            sendJson(response, 403, { error: "Cross-origin request rejected" });
            return true;
          }
          const body = await readJson(request);
          const saved = await upsertClientDesignationRate({
            clientCompanyId,
            designation: body.designation,
            staffMonthRate: body.staffMonthRate ?? body.staffDayRate,
            billMonthRate: body.billMonthRate ?? body.billDayRate,
            currency: body.currency,
          });
          sendJson(response, 201, saved);
          return true;
        }
        if (method === "DELETE" && rateId) {
          if (!sameOrigin(request)) {
            sendJson(response, 403, { error: "Cross-origin request rejected" });
            return true;
          }
          const deleted = await deleteClientDesignationRate(rateId);
          if (!deleted) {
            sendJson(response, 404, { error: "Rate not found" });
            return true;
          }
          sendJson(response, 200, { ok: true });
          return true;
        }
      } catch (reason) {
        if (reason instanceof ClientRateError) {
          sendJson(response, 400, { error: reason.message });
          return true;
        }
        throw reason;
      }
    }

    if (method === "GET" && path === "/api/v1/allocations") {
      sendJson(response, 200, {
        allocations: await listAllocations({
          clientCompanyId: url.searchParams.get("clientCompanyId"),
          employerCompanyId: url.searchParams.get("employerCompanyId"),
          employeeId: url.searchParams.get("employeeId"),
          status: url.searchParams.get("status"),
          q: url.searchParams.get("q"),
        }),
        clients: await listCompanies("client"),
        employers: await listCompanies("employer"),
        headcount: await headcountByClient(),
      });
      return true;
    }

    if (method === "POST" && path === "/api/v1/allocations") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      const created = await createAllocation({
        employeeId: text(body.employeeId),
        clientCompanyId: text(body.clientCompanyId),
        joinDate: text(body.joinDate),
        designation: text(body.designation) || null,
        staffSalary: text(body.staffSalary),
        billRate: text(body.billRate),
        currency: text(body.currency) || "MVR",
        createdBy: await actorId(request),
      });
      sendJson(response, 201, created);
      return true;
    }

    if (method === "POST" && path === "/api/v1/allocations/batch") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      try {
        const body = await readJson(request);
        const itemsRaw = Array.isArray(body.items) ? body.items : [];
        const result = await createAllocationsBatch({
          clientCompanyId: text(body.clientCompanyId),
          joinDate: text(body.joinDate),
          items: itemsRaw.map((item) => {
            const row = item as Record<string, unknown>;
            return {
              employeeId: text(row.employeeId),
              designation: text(row.designation) || null,
              staffSalary: text(row.staffSalary),
              billRate: text(row.billRate),
              currency: text(row.currency) || undefined,
            };
          }),
          createdBy: await actorId(request),
        });
        sendJson(response, 201, result);
      } catch (reason) {
        if (reason instanceof AllocationError) {
          sendJson(response, 400, { error: reason.message });
          return true;
        }
        throw reason;
      }
      return true;
    }

    const allocationId = idFrom(path, "/api/v1/allocations/");
    if (method === "GET" && allocationId && path === `/api/v1/allocations/${allocationId}`) {
      const row = (await listAllocations()).find((item) => item.id === allocationId);
      if (!row) {
        sendJson(response, 404, { error: "Allocation not found" });
        return true;
      }
      sendJson(response, 200, { allocation: row, events: await listAllocationEvents(allocationId) });
      return true;
    }
    if (method === "POST" && allocationId && path === `/api/v1/allocations/${allocationId}/transfer`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      try {
        const body = await readJson(request);
        sendJson(
          response,
          200,
          await transferAllocation(allocationId, {
            endDate: body.endDate ?? body.resignDate,
            note: body.note,
            clientCompanyId: text(body.clientCompanyId),
            joinDate: body.joinDate,
            designation: text(body.designation) || null,
            staffSalary: text(body.staffSalary),
            billRate: text(body.billRate),
            currency: text(body.currency) || undefined,
            createdBy: await actorId(request),
          }),
        );
      } catch (reason) {
        if (reason instanceof AllocationError) {
          sendJson(response, 400, { error: reason.message });
          return true;
        }
        throw reason;
      }
      return true;
    }
    if (method === "POST" && allocationId && path === `/api/v1/allocations/${allocationId}/end`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(
        response,
        200,
        await endAllocation(allocationId, {
          endDate: body.endDate ?? body.resignDate,
          reason: body.reason,
          note: body.note,
          absentFrom: body.absentFrom,
          createdBy: await actorId(request),
        }),
      );
      return true;
    }
    if (method === "POST" && allocationId && path === `/api/v1/allocations/${allocationId}/resign`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(
        response,
        200,
        await endAllocation(allocationId, {
          endDate: body.resignDate ?? body.endDate,
          reason: "resign",
          note: body.note,
          createdBy: await actorId(request),
        }),
      );
      return true;
    }
    if (method === "POST" && allocationId && path === `/api/v1/allocations/${allocationId}/rate-change`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      sendJson(
        response,
        200,
        await changeAllocationRates(allocationId, {
          staffSalary: text(body.staffSalary),
          billRate: text(body.billRate),
          currency: text(body.currency) || undefined,
          createdBy: await actorId(request),
        }),
      );
      return true;
    }

    if (method === "GET" && path === "/api/v1/pay-runs") {
      sendJson(response, 200, {
        payRuns: await listPayRuns(),
        clients: await listCompanies("client"),
        employers: await listCompanies("employer"),
      });
      return true;
    }
    if (method === "GET" && path === "/api/v1/pay-runs/employers-for-client") {
      const clientCompanyId = url.searchParams.get("clientCompanyId") ?? "";
      sendJson(response, 200, { employers: await listEmployersForClient(clientCompanyId) });
      return true;
    }
    if (method === "POST" && path === "/api/v1/pay-runs") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      const created = await createPayRuns({
        mode: body.mode,
        clientCompanyId: body.clientCompanyId,
        employerCompanyId: body.employerCompanyId,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        createdBy: await actorId(request),
      });
      sendJson(response, 201, created);
      return true;
    }
    const payRunId = idFrom(path, "/api/v1/pay-runs/");
    if (method === "GET" && payRunId && path === `/api/v1/pay-runs/${payRunId}/payment-request`) {
      const run = await getPayRunForPaymentRequest(payRunId);
      if (!run) {
        sendJson(response, 404, { error: "Pay run not found" });
        return true;
      }
      sendJson(response, 200, run);
      return true;
    }
    if (method === "GET" && payRunId && path === `/api/v1/pay-runs/${payRunId}/salary-sheet`) {
      const run = await getPayRunForSalarySheet(payRunId);
      if (!run) {
        sendJson(response, 404, { error: "Pay run not found" });
        return true;
      }
      sendJson(response, 200, run);
      return true;
    }
    if (method === "GET" && payRunId && path === `/api/v1/pay-runs/${payRunId}`) {
      const run = await getPayRun(payRunId);
      if (!run) {
        sendJson(response, 404, { error: "Pay run not found" });
        return true;
      }
      sendJson(response, 200, run);
      return true;
    }
    if (method === "POST" && payRunId && path === `/api/v1/pay-runs/${payRunId}/lock`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 200, await lockPayRun(payRunId));
      return true;
    }
    if (method === "POST" && payRunId && path === `/api/v1/pay-runs/${payRunId}/recalculate`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 200, await recalculatePayRun(payRunId));
      return true;
    }
    if (method === "DELETE" && payRunId && path === `/api/v1/pay-runs/${payRunId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const deleted = await deletePayRun(payRunId);
      if (!deleted) {
        sendJson(response, 404, { error: "Pay run not found" });
        return true;
      }
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (method === "GET" && path.startsWith("/api/v1/files/") && path.endsWith("/download")) {
      const fileId = path.slice("/api/v1/files/".length, -"/download".length);
      if (!uuidPattern.test(fileId)) {
        sendJson(response, 404, { error: "File not found" });
        return true;
      }
      const opened = await openFileStream(fileId);
      response.writeHead(200, {
        "content-type": opened.file.mimeType,
        "content-length": String(opened.file.sizeBytes),
        "content-disposition": `attachment; filename="${opened.file.originalName.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
      });
      opened.stream.pipe(response);
      return true;
    }

    if (method === "GET" && path === "/api/v1/files/drive") {
      sendJson(response, 200, { files: await listDriveFiles() });
      return true;
    }

    if (method === "GET" && path === "/api/v1/files") {
      const entityType = url.searchParams.get("entityType") ?? "";
      const entityId = url.searchParams.get("entityId") ?? "";
      if (!entityType || !uuidPattern.test(entityId)) {
        sendJson(response, 400, { error: "entityType and entityId are required" });
        return true;
      }
      sendJson(response, 200, { files: await listEntityFiles(entityType, entityId) });
      return true;
    }

    if (method === "POST" && path === "/api/v1/files") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const multipart = await readMultipart(request);
      if (!multipart.file) {
        sendJson(response, 400, { error: "Choose a file to upload" });
        return true;
      }
      const kind = (multipart.fields.kind || "employee_doc") as
        | "passport_scan"
        | "passport_ocr_json"
        | "loa_signed"
        | "employee_doc"
        | "employee_photo"
        | "other";
      const entityType = multipart.fields.entityType || "employee";
      const entityId = multipart.fields.entityId || "";
      if (!uuidPattern.test(entityId)) {
        sendJson(response, 400, { error: "entityId is required" });
        return true;
      }
      const stored = await storeBuffer({
        buffer: multipart.file.buffer,
        originalName: multipart.file.filename,
        mimeType: multipart.file.mimeType,
        kind,
        uploadedBy: await actorId(request),
        entityType,
        entityId,
        label: multipart.fields.label || null,
        employeeIdForPath: entityType === "employee" ? entityId : multipart.fields.employeeId || null,
      });
      sendJson(response, 201, stored);
      return true;
    }

    const letterId = idFrom(path, "/api/v1/letters/");
    if (method === "POST" && letterId && path === `/api/v1/letters/${letterId}/signed-copy`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const letter = await getLetter(letterId);
      if (!letter) {
        sendJson(response, 404, { error: "Letter not found" });
        return true;
      }
      const multipart = await readMultipart(request);
      if (!multipart.file) {
        sendJson(response, 400, { error: "Upload the signed LOA PDF or image" });
        return true;
      }
      const stored = await storeBuffer({
        buffer: multipart.file.buffer,
        originalName: multipart.file.filename,
        mimeType: multipart.file.mimeType,
        kind: "loa_signed",
        uploadedBy: await actorId(request),
        entityType: "letter",
        entityId: letterId,
        label: "Signed LOA",
        employeeIdForPath: letter.employeeId,
      });
      await db
        .update(letters)
        .set({ signedFileId: stored.id, status: "signed_archived" })
        .where(eq(letters.id, letterId));
      sendJson(response, 201, { letterId, file: stored, status: "signed_archived" });
      return true;
    }

    const employeeId = idFrom(path, "/api/v1/employees/");
    if (method === "POST" && employeeId && path === `/api/v1/employees/${employeeId}/passport-ocr`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const employee = await getEmployee(employeeId);
      if (!employee) {
        sendJson(response, 404, { error: "Employee not found" });
        return true;
      }
      const multipart = await readMultipart(request);
      if (!multipart.file) {
        sendJson(response, 400, { error: "Upload a passport image or PDF" });
        return true;
      }
      const scan = await storeBuffer({
        buffer: multipart.file.buffer,
        originalName: multipart.file.filename,
        mimeType: multipart.file.mimeType,
        kind: "passport_scan",
        uploadedBy: await actorId(request),
        entityType: "employee",
        entityId: employeeId,
        label: "Passport scan",
        employeeIdForPath: employeeId,
      });
      const proposed = await extractPassportFields(multipart.file.buffer, multipart.file.mimeType);
      const ocrJson = await storeBuffer({
        buffer: Buffer.from(JSON.stringify({ proposed, sourceFileId: scan.id }, null, 2)),
        originalName: "passport-ocr.json",
        mimeType: "application/json",
        kind: "passport_ocr_json",
        uploadedBy: await actorId(request),
        entityType: "employee",
        entityId: employeeId,
        label: "Passport OCR review",
        employeeIdForPath: employeeId,
      });
      sendJson(response, 201, { scan, ocr: ocrJson, proposed, note: "Review proposed fields before applying. Blank means unread." });
      return true;
    }

    if (method === "POST" && employeeId && path === `/api/v1/employees/${employeeId}/passport-ocr/apply`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      const employee = await getEmployee(employeeId);
      if (!employee) {
        sendJson(response, 404, { error: "Employee not found" });
        return true;
      }
      const updated = await updateEmployee(employeeId, {
        ...employee,
        passportNumber: text(body.passportNumber) || employee.passportNumber,
        legalName: text(body.legalName) || employee.legalName,
        nationality: text(body.nationality) || employee.nationality,
        dateOfBirth: text(body.dateOfBirth) || employee.dateOfBirth,
        gender: text(body.gender) || employee.gender,
      });
      sendJson(response, 200, updated);
      return true;
    }

    if (method === "GET" && employeeId && path === `/api/v1/employees/${employeeId}/documents`) {
      sendJson(response, 200, { files: await listEntityFiles("employee", employeeId) });
      return true;
    }

    return false;
  } catch (error) {
    if (
      error instanceof AllocationError ||
      error instanceof PayrollError ||
      error instanceof FileError ||
      error instanceof CompanyValidationError ||
      error instanceof AccommodationError ||
      error instanceof PassportOcrError ||
      error instanceof OnboardError ||
      error instanceof EmployeeError
    ) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON" });
      return true;
    }
    throw error;
  }
}

export { headcountByClient };
