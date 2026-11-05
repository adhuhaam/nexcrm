import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createCompany,
  getCompany,
  getCompanyDetail,
  listCompanies,
  listCompaniesWithCounts,
  setCompanyBrandingFile,
  updateCompany,
  type CompanyBrandingSlot,
} from "../modules/companies/companies.ts";
import { userForToken } from "../modules/access/access.ts";
import { FileError, readMultipart, storeBuffer } from "../modules/files/storage.ts";
import {
  editorCompanyId,
  getPreferences,
  setDefaultCompany,
  setSelectedCompany,
} from "../modules/companies/preferences.ts";
import { CompanyValidationError, type CompanyInput } from "../modules/companies/validation.ts";
import { captureSnapshot, getSnapshot, listSnapshots } from "../modules/documents/snapshots.ts";
import { listEmployees } from "../modules/hr/employees.ts";
import { getWorkPermit, listWorkPermits } from "../modules/hr/work-permits.ts";
import { getProjectView, listProjects } from "../modules/projects/projects.ts";
import { guardAccess } from "./access-http.ts";
import { handleAgencyApi } from "./agency-http.ts";
import { handleAttendanceApi } from "./attendance-http.ts";
import { handleExpensesApi } from "./expenses-http.ts";
import { handleOtApi } from "./ot-http.ts";
import { handleHrApi } from "./hr-http.ts";
import { noticeText, renderPage, type PageModel } from "./page.ts";
import { handleProjectRequest } from "./projects-http.ts";
import { handleWorkPermitRequest } from "./work-permits-http.ts";
import { handleXpatApi } from "./xpat-http.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 100_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readRecord(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(request);
  const type = request.headers["content-type"] ?? "";
  if (type.includes("application/json")) {
    const parsed: unknown = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CompanyValidationError("Request body must be an object", "legalName");
    }
    return parsed as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function complete(request: IncomingMessage, response: ServerResponse, location: string): void {
  const accept = request.headers.accept ?? "";
  const type = request.headers["content-type"] ?? "";
  if (accept.includes("application/json") || type.includes("application/json")) {
    sendJson(response, 200, { location });
    return;
  }
  response.writeHead(303, { location });
  response.end();
}

function companyIdFromPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length);
  return uuidPattern.test(id) ? id : null;
}

async function pageModel(search: URLSearchParams, error: string | null, draft: CompanyInput | null): Promise<PageModel> {
  const companies = await listCompanies();
  const preferences = await getPreferences();
  const requested = search.get("company");
  const editorId = requested === "new" ? null : requested && uuidPattern.test(requested) ? requested : editorCompanyId(preferences) ?? companies[0]?.id ?? null;
  const existing = editorId ? await getCompany(editorId) : null;
  const editor = draft
    ? { id: existing?.id ?? null, ...draft }
    : existing
      ? { ...existing }
      : {
          id: null,
          kind: "employer",
          legalName: "",
          registrationNumber: null,
          tinNumber: null,
          registeredAddress: null,
          country: null,
          businessActivity: null,
          phone: null,
          email: null,
          documentPrefix: null,
          signatoryName: null,
          signatoryTitle: null,
        };
  return {
    companies,
    preferences,
    editor,
    snapshots: await listSnapshots(),
    employees: (await listEmployees()).employees,
    notice: noticeText(search.get("notice")),
    error,
  };
}

function sendPage(response: ServerResponse, status: number, model: PageModel): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(renderPage(model));
}

function draftFrom(record: Record<string, unknown>): CompanyInput {
  const text = (key: string) => (typeof record[key] === "string" ? record[key].trim() : "");
  const orNull = (key: string) => text(key) || null;
  const kindRaw = text("kind") || "employer";
  return {
    kind: kindRaw === "client" ? "client" : "employer",
    legalName: text("legalName"),
    registrationNumber: orNull("registrationNumber"),
    tinNumber: orNull("tinNumber"),
    registeredAddress: orNull("registeredAddress"),
    country: orNull("country"),
    businessActivity: orNull("businessActivity"),
    phone: orNull("phone"),
    email: orNull("email"),
    documentPrefix: orNull("documentPrefix"),
    signatoryName: orNull("signatoryName"),
    signatoryTitle: orNull("signatoryTitle"),
  };
}

export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";
  if (await guardAccess(request, response, url)) return;

  if (await handleAgencyApi(request, response, url)) return;
  if (await handleAttendanceApi(request, response, url)) return;
  if (await handleOtApi(request, response, url)) return;
  if (await handleExpensesApi(request, response, url)) return;
  if (await handleXpatApi(request, response, url)) return;
  if (await handleHrApi(request, response, url)) return;

  if (method === "GET" && url.pathname === "/api/v1/hr") {
    sendJson(response, 200, await pageModel(url.searchParams, null, null));
    return;
  }
  if (method === "GET" && url.pathname === "/api/v1/work-permits") {
    sendJson(response, 200, { workPermits: await listWorkPermits() });
    return;
  }
  const workPermitId = companyIdFromPath(url.pathname, "/api/v1/work-permits/");
  if (method === "GET" && workPermitId) {
    const record = await getWorkPermit(workPermitId);
    if (!record) {
      sendJson(response, 404, { error: "Work permit not found" });
      return;
    }
    sendJson(response, 200, record);
    return;
  }
  if (method === "GET" && url.pathname === "/api/v1/projects") {
    sendJson(response, 200, { projects: await listProjects(), companies: await listCompanies("employer") });
    return;
  }
  const projectApiId = companyIdFromPath(url.pathname, "/api/v1/projects/");
  if (method === "GET" && projectApiId) {
    const view = await getProjectView(projectApiId);
    if (!view) {
      sendJson(response, 404, { error: "Project not found" });
      return;
    }
    sendJson(response, 200, view);
    return;
  }

  if (method === "GET" && url.pathname === "/") {
    sendPage(response, 200, await pageModel(url.searchParams, null, null));
    return;
  }

  if (url.pathname === "/work-permits" || url.pathname.startsWith("/work-permits/")) {
    if (method !== "GET" && !sameOrigin(request)) {
      sendJson(response, 403, { error: "Cross-origin request rejected" });
      return;
    }
    const handledPermit = await handleWorkPermitRequest(request, response, url);
    if (handledPermit) return;
  }

  if (url.pathname === "/projects" || url.pathname.startsWith("/projects/") || url.pathname === "/hr/employees") {
    if (method !== "GET" && !sameOrigin(request)) {
      sendJson(response, 403, { error: "Cross-origin request rejected" });
      return;
    }
    const handled = await handleProjectRequest(request, response, url);
    if (handled) return;
  }

  if (method !== "GET" && !sameOrigin(request)) {
    sendJson(response, 403, { error: "Cross-origin request rejected" });
    return;
  }

  let formRecord: Record<string, unknown> | null = null;
  let formCompanyId: string | null = null;

  try {
    if (method === "GET" && url.pathname === "/api/v1/companies") {
      const kindParam = url.searchParams.get("kind");
      const kind = kindParam === "employer" || kindParam === "client" ? kindParam : null;
      const withCounts = url.searchParams.get("counts") === "1" || Boolean(url.searchParams.get("q"));
      if (withCounts) {
        sendJson(response, 200, {
          companies: await listCompaniesWithCounts({ kind, q: url.searchParams.get("q") }),
          preferences: await getPreferences(),
        });
        return;
      }
      sendJson(response, 200, { companies: await listCompanies(kind), preferences: await getPreferences() });
      return;
    }

    const companyApiId = companyIdFromPath(url.pathname, "/api/v1/companies/");
    if (method === "GET" && companyApiId && url.pathname === `/api/v1/companies/${companyApiId}`) {
      const detail = await getCompanyDetail(companyApiId);
      if (!detail) {
        sendJson(response, 404, { error: "Company not found" });
        return;
      }
      sendJson(response, 200, detail);
      return;
    }

    const brandingMatch = url.pathname.match(
      /^\/api\/v1\/companies\/([0-9a-f-]{36})\/assets\/(letterhead|seal|signature)$/i,
    );
    if (brandingMatch) {
      const brandCompanyId = brandingMatch[1];
      const slot = brandingMatch[2].toLowerCase() as CompanyBrandingSlot;
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return;
      }
      const existing = await getCompany(brandCompanyId);
      if (!existing) {
        sendJson(response, 404, { error: "Company not found" });
        return;
      }
      if (method === "DELETE") {
        const updated = await setCompanyBrandingFile(brandCompanyId, slot, null);
        sendJson(response, 200, { company: updated });
        return;
      }
      if (method === "POST") {
        try {
          const multipart = await readMultipart(request);
          if (!multipart.file) {
            sendJson(response, 400, { error: "Upload an image file" });
            return;
          }
          if (!multipart.file.mimeType.startsWith("image/") && multipart.file.mimeType !== "application/pdf") {
            sendJson(response, 400, { error: "Branding asset must be an image (or PDF for letterhead)" });
            return;
          }
          if (slot !== "letterhead" && !multipart.file.mimeType.startsWith("image/")) {
            sendJson(response, 400, { error: "Seal and signature must be images" });
            return;
          }
          const cookie = request.headers.cookie ?? "";
          const token = cookie.match(/(?:^|;\s*)nexcrm_session=([^;]+)/)?.[1] ?? null;
          const user = token ? await userForToken(decodeURIComponent(token)) : null;
          const kind =
            slot === "letterhead" ? "company_letterhead" : slot === "seal" ? "company_seal" : "company_signature";
          const stored = await storeBuffer({
            buffer: multipart.file.buffer,
            originalName: multipart.file.filename,
            mimeType: multipart.file.mimeType,
            kind,
            uploadedBy: user?.id ?? null,
            entityType: "company",
            entityId: brandCompanyId,
            label: slot === "letterhead" ? "Letterhead" : slot === "seal" ? "Stamp / seal" : "Authorized signature",
          });
          const updated = await setCompanyBrandingFile(brandCompanyId, slot, stored.id);
          sendJson(response, 201, { company: updated, file: stored });
          return;
        } catch (reason) {
          if (reason instanceof FileError) {
            sendJson(response, 400, { error: reason.message });
            return;
          }
          throw reason;
        }
      }
    }

    if (method === "POST" && (url.pathname === "/companies" || url.pathname === "/api/v1/companies")) {
      formCompanyId = "new";
      const record = await readRecord(request);
      formRecord = record;
      const created = await createCompany(record as CompanyInput);
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 201, created);
        return;
      }
      complete(request, response, `/?company=${created.id}&notice=saved`);
      return;
    }

    const companyId = companyIdFromPath(url.pathname, "/companies/") ?? companyIdFromPath(url.pathname, "/api/v1/companies/");
    if (companyId && (method === "POST" || method === "PATCH")) {
      formCompanyId = companyId;
      const record = await readRecord(request);
      formRecord = record;
      const updated = await updateCompany(companyId, record as CompanyInput);
      if (!updated) {
        sendJson(response, 404, { error: "Company not found" });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 200, updated);
        return;
      }
      complete(request, response, `/?company=${updated.id}&notice=saved`);
      return;
    }

    if (method === "POST" && (url.pathname === "/preferences/default" || url.pathname === "/preferences/selected")) {
      const record = await readRecord(request);
      const id = String(record.companyId ?? "");
      if (!uuidPattern.test(id)) {
        sendJson(response, 400, { error: "Company id is required" });
        return;
      }
      const preferences = url.pathname.endsWith("/default") ? await setDefaultCompany(id) : await setSelectedCompany(id);
      const returnTo = typeof record.returnTo === "string" && (record.returnTo === "new" || uuidPattern.test(record.returnTo)) ? record.returnTo : id;
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 200, preferences);
        return;
      }
      complete(request, response, `/companies?company=${returnTo}&notice=${url.pathname.endsWith("/default") ? "default-set" : "selected"}`);
      return;
    }

    if (method === "POST" && (url.pathname === "/documents" || url.pathname === "/api/v1/documents")) {
      const record = await readRecord(request);
      const id = String(record.companyId ?? "");
      const snapshot = uuidPattern.test(id) ? await captureSnapshot(id) : null;
      if (!snapshot) {
        sendJson(response, 404, { error: "Company not found" });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 201, snapshot);
        return;
      }
      complete(request, response, `/?company=${id}&notice=snapshot`);
      return;
    }

    if (method === "GET" && url.pathname === "/api/v1/documents") {
      sendJson(response, 200, { documents: await listSnapshots() });
      return;
    }

    const snapshotId = companyIdFromPath(url.pathname, "/api/v1/documents/");
    if (method === "GET" && snapshotId) {
      const snapshot = await getSnapshot(snapshotId);
      if (!snapshot) {
        sendJson(response, 404, { error: "Document not found" });
        return;
      }
      sendJson(response, 200, snapshot);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof CompanyValidationError) {
      const wantsHtml = !(request.headers["content-type"] ?? "").includes("application/json");
      if (wantsHtml) {
        const search = new URLSearchParams(formCompanyId ? { company: formCompanyId } : undefined);
        sendPage(response, 400, await pageModel(search, error.message, formRecord ? draftFrom(formRecord) : null));
        return;
      }
      sendJson(response, 400, { error: error.message, field: error.field });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON" });
      return;
    }
    console.error(error instanceof Error ? error.message : "request failed");
    sendJson(response, 500, { error: "Request failed" });
  }
}
