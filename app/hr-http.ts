import type { IncomingMessage, ServerResponse } from "node:http";
import { listCompanies, getCompany } from "../modules/companies/companies.ts";
import { getPreferences } from "../modules/companies/preferences.ts";
import {
  countLetters,
  createLetter,
  getLetter,
  listLetters,
  LetterError,
  previewDocumentNumber,
  recentLetters,
} from "../modules/documents/letters.ts";
import {
  countEmployees,
  createEmployeeRecord,
  EmployeeError,
  getEmployee,
  listAssignmentOptions,
  listEmployees,
  setEmployeePhoto,
  updateEmployee,
} from "../modules/hr/employees.ts";
import { headcountByClient } from "../modules/hr/allocations.ts";
import { readMultipart, storeBuffer } from "../modules/files/storage.ts";
import { userForToken } from "../modules/access/access.ts";

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

async function readRecord(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 200_000) throw new EmployeeError("Request body is too large");
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const type = request.headers["content-type"] ?? "";
  if (type.includes("application/json")) {
    const parsed: unknown = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new EmployeeError("Request body must be an object");
    }
    return parsed as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function idFromPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length).split("/")[0] ?? "";
  return uuidPattern.test(id) ? id : null;
}

function readCookie(request: IncomingMessage): string | null {
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

function termsFrom(record: Record<string, unknown>) {
  const text = (key: string) => (typeof record[key] === "string" ? record[key] : null);
  return {
    workSite: text("workSite"),
    siteCode: text("siteCode"),
    basicSalary: text("basicSalary") ?? text("salary"),
    benefits: text("benefits"),
    paidVacation: text("paidVacation"),
    workingHours: text("workingHours"),
    contractDuration: text("contractDuration"),
    employmentStatus: text("employmentStatus"),
  };
}

export async function handleHrApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/api/v1/hr/dashboard") {
      const [employers, clients] = await Promise.all([listCompanies("employer"), listCompanies("client")]);
      const [employeeCount, letterCount, recent, headcount] = await Promise.all([
        countEmployees(),
        countLetters(),
        recentLetters(8),
        headcountByClient(),
      ]);
      sendJson(response, 200, {
        counts: {
          companies: employers.length + clients.length,
          employers: employers.length,
          clients: clients.length,
          employees: employeeCount,
          letters: letterCount,
        },
        headcount,
        recentLetters: recent,
        preferences: await getPreferences(),
        companies: employers.map((company) => ({ id: company.id, legalName: company.legalName })),
      });
      return true;
    }

    if (method === "GET" && path === "/api/v1/employees") {
      sendJson(response, 200, {
        employees: await listEmployees({
          companyId: url.searchParams.get("companyId"),
          q: url.searchParams.get("q"),
        }),
        companies: await listCompanies("employer"),
      });
      return true;
    }

    if (method === "GET" && path === "/api/v1/employees/options") {
      const companyId = url.searchParams.get("companyId") ?? "";
      sendJson(response, 200, await listAssignmentOptions(companyId));
      return true;
    }

    const employeeId = idFromPath(path, "/api/v1/employees/");
    if (method === "GET" && employeeId && path === `/api/v1/employees/${employeeId}`) {
      const employee = await getEmployee(employeeId);
      if (!employee) {
        sendJson(response, 404, { error: "Employee not found" });
        return true;
      }
      const options = await listAssignmentOptions(employee.companyId);
      sendJson(response, 200, { employee, companies: await listCompanies("employer"), ...options });
      return true;
    }

    if (method === "POST" && path === "/api/v1/employees") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const created = await createEmployeeRecord(await readRecord(request));
      sendJson(response, 201, created);
      return true;
    }

    if (method === "POST" && employeeId && path === `/api/v1/employees/${employeeId}/photo`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const existing = await getEmployee(employeeId);
      if (!existing) {
        sendJson(response, 404, { error: "Employee not found" });
        return true;
      }
      const multipart = await readMultipart(request);
      if (!multipart.file) {
        sendJson(response, 400, { error: "Upload a photo image" });
        return true;
      }
      if (!multipart.file.mimeType.startsWith("image/")) {
        sendJson(response, 400, { error: "Photo must be an image (JPEG, PNG, WebP)" });
        return true;
      }
      const stored = await storeBuffer({
        buffer: multipart.file.buffer,
        originalName: multipart.file.filename,
        mimeType: multipart.file.mimeType,
        kind: "employee_photo",
        uploadedBy: await actorId(request),
        entityType: "employee",
        entityId: employeeId,
        label: "Employee photo",
        employeeIdForPath: employeeId,
      });
      const updated = await setEmployeePhoto(employeeId, stored.id);
      sendJson(response, 201, { employee: updated, file: stored });
      return true;
    }

    if ((method === "PATCH" || method === "POST") && employeeId && path === `/api/v1/employees/${employeeId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const updated = await updateEmployee(employeeId, await readRecord(request));
      if (!updated) {
        sendJson(response, 404, { error: "Employee not found" });
        return true;
      }
      sendJson(response, 200, updated);
      return true;
    }

    if (method === "GET" && path === "/api/v1/letters") {
      sendJson(response, 200, {
        letters: await listLetters({
          companyId: url.searchParams.get("companyId"),
          q: url.searchParams.get("q"),
        }),
        companies: await listCompanies("employer"),
      });
      return true;
    }

    if (method === "GET" && path === "/api/v1/letters/preview-number") {
      const companyId = url.searchParams.get("companyId") ?? "";
      sendJson(response, 200, { documentNumber: await previewDocumentNumber(companyId) });
      return true;
    }

    const letterId = idFromPath(path, "/api/v1/letters/");
    if (method === "GET" && letterId && path === `/api/v1/letters/${letterId}`) {
      const letter = await getLetter(letterId);
      if (!letter) {
        sendJson(response, 404, { error: "Letter not found" });
        return true;
      }
      sendJson(response, 200, letter);
      return true;
    }

    if (method === "POST" && path === "/api/v1/letters") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const record = await readRecord(request);
      const companyId = typeof record.companyId === "string" ? record.companyId : "";
      const employeeIdValue = typeof record.employeeId === "string" && uuidPattern.test(record.employeeId) ? record.employeeId : null;
      const created = await createLetter({
        companyId,
        employeeId: employeeIdValue,
        letterDate: typeof record.letterDate === "string" ? record.letterDate : "",
        documentNumber: typeof record.documentNumber === "string" ? record.documentNumber : null,
        signatoryName: typeof record.signatoryName === "string" ? record.signatoryName : null,
        signatoryTitle: typeof record.signatoryTitle === "string" ? record.signatoryTitle : null,
        letterheadAddress: typeof record.letterheadAddress === "string" ? record.letterheadAddress : null,
        phone: typeof record.phone === "string" ? record.phone : null,
        email: typeof record.email === "string" ? record.email : null,
        employeeOverride: {
          legalName: typeof record.legalName === "string" ? record.legalName : null,
          preferredName: typeof record.preferredName === "string" ? record.preferredName : null,
          passportNumber: typeof record.passportNumber === "string" ? record.passportNumber : null,
          nationality: typeof record.nationality === "string" ? record.nationality : null,
          dateOfBirth: typeof record.dateOfBirth === "string" ? record.dateOfBirth : null,
          gender: typeof record.gender === "string" ? record.gender : null,
          permanentAddress: typeof record.permanentAddress === "string" ? record.permanentAddress : null,
          emergencyContact: typeof record.emergencyContact === "string" ? record.emergencyContact : null,
          occupation: typeof record.occupation === "string" ? record.occupation : null,
          employmentStatus: typeof record.employmentStatus === "string" ? record.employmentStatus : null,
        },
        terms: termsFrom(record),
        createdBy: await actorId(request),
      });
      sendJson(response, 201, created);
      return true;
    }

    if (method === "GET" && path === "/api/v1/hr/editor-context") {
      const companyId = url.searchParams.get("companyId");
      const employeeIdParam = url.searchParams.get("employeeId");
      const companies = await listCompanies("employer");
      const preferences = await getPreferences();
      const selectedCompanyId =
        companyId && uuidPattern.test(companyId)
          ? companyId
          : preferences.selectedCompanyId ?? preferences.defaultCompanyId ?? companies[0]?.id ?? null;
      const company = selectedCompanyId ? await getCompany(selectedCompanyId) : null;
      const employees = selectedCompanyId ? await listEmployees({ companyId: selectedCompanyId }) : [];
      const employee =
        employeeIdParam && uuidPattern.test(employeeIdParam) ? await getEmployee(employeeIdParam) : null;
      const documentNumber = selectedCompanyId ? await previewDocumentNumber(selectedCompanyId) : null;
      sendJson(response, 200, {
        companies,
        preferences,
        company,
        employees,
        employee: employee && selectedCompanyId && employee.companyId === selectedCompanyId ? employee : null,
        documentNumber,
        options: selectedCompanyId ? await listAssignmentOptions(selectedCompanyId) : { projects: [], sites: [], quotaPools: [] },
      });
      return true;
    }

    return false;
  } catch (error) {
    if (error instanceof EmployeeError || error instanceof LetterError) {
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
