import type { IncomingMessage, ServerResponse } from "node:http";
import { listCompanies } from "../modules/companies/companies.ts";
import { createEmployee } from "../modules/hr/employees.ts";
import {
  addProjectDocument,
  addQuotaPool,
  addSite,
  createProject,
  getProjectView,
  listProjects,
  openSlot,
  openSlotForName,
  ProjectError,
} from "../modules/projects/projects.ts";
import { projectNotice, projectNoticeIsError, renderProjectDetail, renderProjectList } from "./projects-page.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(html);
}

function wantsJson(request: IncomingMessage): boolean {
  const accept = request.headers.accept ?? "";
  const type = request.headers["content-type"] ?? "";
  return accept.includes("application/json") || type.includes("application/json");
}

function complete(request: IncomingMessage, response: ServerResponse, location: string, error?: string): void {
  if (wantsJson(request)) {
    if (error) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ location }));
    return;
  }
  response.writeHead(303, { location });
  response.end();
}

async function readRecord(request: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 100_000) throw new ProjectError("Request body is too large");
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if ((request.headers["content-type"] ?? "").includes("application/json")) {
    const parsed: unknown = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProjectError("Request body must be an object");
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value == null ? "" : String(value)]));
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function projectIdFrom(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([0-9a-f-]{36})(?:\/|$)/i);
  return match && uuidPattern.test(match[1]) ? match[1] : null;
}

export async function handleProjectRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? "GET";
  const projectId = projectIdFrom(url.pathname);
  const notice = projectNotice(url.searchParams.get("notice") ?? url.searchParams.get("error"));
  const isError = projectNoticeIsError(url.searchParams.get("error"));

  if (method === "GET" && url.pathname === "/projects") {
    sendHtml(response, 200, renderProjectList(await listProjects(), await listCompanies(), notice, isError));
    return true;
  }

  if (method === "GET" && projectId && url.pathname === `/projects/${projectId}`) {
    const view = await getProjectView(projectId);
    if (!view) return false;
    sendHtml(response, 200, renderProjectDetail(view, notice, isError));
    return true;
  }

  if (method !== "POST") return false;

  try {
    if (url.pathname === "/projects") {
      const record = await readRecord(request);
      const created = await createProject(record.companyId ?? "", record.name ?? "");
      complete(request, response, `/projects/${created.id}?notice=project`);
      return true;
    }
    if (url.pathname === "/hr/employees") {
      const record = await readRecord(request);
      await createEmployee(record.companyId ?? "", record.legalName ?? "");
      complete(request, response, "/?notice=employee");
      return true;
    }
    if (!projectId) return false;
    const record = await readRecord(request);
    if (url.pathname === `/projects/${projectId}/sites`) {
      await addSite(projectId, record.name ?? "", record.siteType, record.address);
      complete(request, response, `/projects/${projectId}?notice=site`);
      return true;
    }
    if (url.pathname === `/projects/${projectId}/pools`) {
      await addQuotaPool(projectId, record.siteId ?? "", record.name ?? "", Number(record.capacity), record.poolNumber);
      complete(request, response, `/projects/${projectId}?notice=pool`);
      return true;
    }
    if (url.pathname === `/projects/${projectId}/documents`) {
      await addProjectDocument(projectId, record.title ?? "", record.notes ?? "");
      complete(request, response, `/projects/${projectId}?notice=document`);
      return true;
    }
    if (url.pathname === `/projects/${projectId}/slots`) {
      const slotId = record.slotId && uuidPattern.test(record.slotId) ? record.slotId : undefined;
      if (record.employeeId && uuidPattern.test(record.employeeId)) {
        await openSlot(projectId, record.quotaPoolId ?? "", record.employeeId, slotId);
      } else if ((record.employeeName ?? "").trim()) {
        await openSlotForName(projectId, record.quotaPoolId ?? "", record.employeeName, slotId);
      } else {
        throw new ProjectError("Choose a work permit holder or enter a new name");
      }
      complete(request, response, `/projects/${projectId}?notice=slot`);
      return true;
    }
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const code =
      message.includes("no open place") ? "pool-full" :
      message.includes("already has a slot") ? "duplicate-slot" :
      message.includes("another company") ? "wrong-company" :
      "missing";
    const target = projectId ? `/projects/${projectId}` : "/projects";
    complete(request, response, `${target}?error=${code}`, projectNotice(code) ?? message);
    return true;
  }
}
