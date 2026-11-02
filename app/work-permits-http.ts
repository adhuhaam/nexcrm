import type { IncomingMessage, ServerResponse } from "node:http";
import { listCompanies } from "../modules/companies/companies.ts";
import { editorCompanyId, getPreferences } from "../modules/companies/preferences.ts";
import {
  getWorkPermit,
  listWorkPermits,
  parseWorkPermit,
  saveWorkPermit,
  WorkPermitError,
  type WorkPermitInput,
} from "../modules/hr/work-permits.ts";
import { emptyWorkPermit, renderWorkPermitForm, renderWorkPermitList } from "./work-permits-page.ts";

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
    if (size > 100_000) throw new WorkPermitError("Request body is too large");
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if ((request.headers["content-type"] ?? "").includes("application/json")) {
    const parsed: unknown = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new WorkPermitError("Request body must be an object");
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value == null ? "" : String(value)]));
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function permitId(pathname: string): string | null {
  const id = pathname.slice("/work-permits/".length);
  return uuidPattern.test(id) ? id : null;
}

export async function handleWorkPermitRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? "GET";
  const companies = await listCompanies();
  if (method === "GET" && url.pathname === "/work-permits") {
    const notice = url.searchParams.get("notice") === "saved" ? "Work permit saved." : null;
    sendHtml(response, 200, renderWorkPermitList(await listWorkPermits(), notice));
    return true;
  }
  if (method === "GET" && url.pathname === "/work-permits/new") {
    const preferences = await getPreferences();
    const companyId = editorCompanyId(preferences) ?? companies[0]?.id ?? "";
    sendHtml(response, 200, renderWorkPermitForm(companies, emptyWorkPermit(companyId), null));
    return true;
  }
  const id = permitId(url.pathname);
  if (method === "GET" && id) {
    const record = await getWorkPermit(id);
    if (!record) {
      sendHtml(response, 404, renderWorkPermitList(await listWorkPermits(), null));
      return true;
    }
    const notice = url.searchParams.get("notice") === "saved" ? "Work permit saved." : null;
    sendHtml(response, 200, renderWorkPermitForm(companies, record, null, notice));
    return true;
  }
  if (method === "POST" && (url.pathname === "/work-permits" || id)) {
    let draft: WorkPermitInput | null = null;
    try {
      const record = await readRecord(request);
      draft = parseWorkPermit(record);
      const saved = await saveWorkPermit(draft, id ?? undefined);
      complete(request, response, `/work-permits/${saved}?notice=saved`);
      return true;
    } catch (error) {
      const message = error instanceof WorkPermitError ? error.message : "Work permit could not be saved";
      if (wantsJson(request)) {
        complete(request, response, url.pathname, message);
        return true;
      }
      const fallback = draft ?? emptyWorkPermit(companies[0]?.id ?? "");
      sendHtml(response, 400, renderWorkPermitForm(companies, { ...fallback, id }, message));
      return true;
    }
  }
  return false;
}
