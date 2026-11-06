import type { IncomingMessage, ServerResponse } from "node:http";
import { userForToken } from "../modules/access/access.ts";
import {
  createExpense,
  deleteExpense,
  ExpenseError,
  getExpense,
  listExpenses,
  updateExpense,
} from "../modules/expenses/expenses.ts";
import {
  getFinanceSummary,
  postAnnualFees,
  postWorkPermitMonth,
} from "../modules/expenses/finance.ts";

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

export async function handleExpensesApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const path = url.pathname;
  if (!path.startsWith("/api/v1/expenses")) return false;

  try {
    if (method === "GET" && path === "/api/v1/expenses/finance-summary") {
      sendJson(response, 200, await getFinanceSummary());
      return true;
    }

    if (method === "POST" && path === "/api/v1/expenses/post-month") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      const yearMonth =
        typeof body.yearMonth === "string" && body.yearMonth.trim()
          ? body.yearMonth.trim()
          : new Date().toISOString().slice(0, 7);
      sendJson(response, 200, await postWorkPermitMonth(yearMonth, await actorId(request)));
      return true;
    }

    if (method === "POST" && path === "/api/v1/expenses/post-annual") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      const body = await readJson(request);
      const year =
        typeof body.year === "string" || typeof body.year === "number"
          ? body.year
          : new Date().getFullYear();
      sendJson(response, 200, await postAnnualFees(year, await actorId(request)));
      return true;
    }

    if (method === "GET" && path === "/api/v1/expenses") {
      sendJson(
        response,
        200,
        await listExpenses({
          category: url.searchParams.get("category"),
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          clientId: url.searchParams.get("clientId"),
          employeeId: url.searchParams.get("employeeId"),
          q: url.searchParams.get("q"),
        }),
      );
      return true;
    }

    if (method === "POST" && path === "/api/v1/expenses") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 201, await createExpense(await readJson(request), await actorId(request)));
      return true;
    }

    const expenseId = idFrom(path, "/api/v1/expenses/");
    if (method === "GET" && expenseId && path === `/api/v1/expenses/${expenseId}`) {
      const record = await getExpense(expenseId);
      if (!record) {
        sendJson(response, 404, { error: "Expense not found" });
        return true;
      }
      sendJson(response, 200, record);
      return true;
    }

    if (method === "PATCH" && expenseId && path === `/api/v1/expenses/${expenseId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      sendJson(response, 200, await updateExpense(expenseId, await readJson(request)));
      return true;
    }

    if (method === "DELETE" && expenseId && path === `/api/v1/expenses/${expenseId}`) {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return true;
      }
      await deleteExpense(expenseId);
      sendJson(response, 200, { ok: true });
      return true;
    }

    sendJson(response, 404, { error: "Not found" });
    return true;
  } catch (error) {
    if (error instanceof ExpenseError) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON" });
      return true;
    }
    console.error(error instanceof Error ? error.message : "expenses request failed");
    sendJson(response, 500, { error: "Request failed" });
    return true;
  }
}
