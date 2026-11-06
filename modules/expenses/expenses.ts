import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { expenses } from "../../lib/schema.ts";

export class ExpenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseError";
  }
}

export type ExpenseCategory =
  | "client_payment"
  | "investment"
  | "other"
  | "work_permit"
  | "insurance"
  | "medical"
  | "deposit";

export type ExpenseRecord = {
  id: string;
  expenseDate: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  clientCompanyId: string | null;
  clientName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  counterparty: string | null;
  note: string | null;
  recurrenceKey: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseTotals = {
  client_payment: string;
  investment: string;
  other: string;
  work_permit: string;
  insurance: string;
  medical: string;
  deposit: string;
  all: string;
};

export type ExpenseListResult = {
  expenses: ExpenseRecord[];
  totals: ExpenseTotals;
};

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  client_company_id: string | null;
  client_name: string | null;
  employee_id: string | null;
  employee_name: string | null;
  counterparty: string | null;
  note: string | null;
  recurrence_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const categories = new Set<ExpenseCategory>([
  "client_payment",
  "investment",
  "other",
  "work_permit",
  "insurance",
  "medical",
  "deposit",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateOnly(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ExpenseError(`${label} must be YYYY-MM-DD`);
  return text;
}

function money(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new ExpenseError(`${label} must be a number`);
  if (Number(text) <= 0) throw new ExpenseError(`${label} must be greater than 0`);
  return Number(text).toFixed(2);
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function categoryOf(value: unknown): ExpenseCategory {
  const text = typeof value === "string" ? value.trim() : "";
  if (!categories.has(text as ExpenseCategory)) {
    throw new ExpenseError("Category is invalid");
  }
  return text as ExpenseCategory;
}

function mapRow(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    expenseDate: row.expense_date,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    counterparty: row.counterparty,
    note: row.note,
    recurrenceKey: row.recurrence_key,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertClientCompany(id: string): Promise<void> {
  const result = await pool.query<{ kind: string }>(`select kind from companies where id = $1`, [id]);
  const row = result.rows[0];
  if (!row) throw new ExpenseError("Client company not found");
  if (row.kind !== "client") throw new ExpenseError("Linked company must be a client");
}

async function assertEmployee(id: string): Promise<void> {
  const result = await pool.query(`select 1 from employees where id = $1`, [id]);
  if (!result.rows[0]) throw new ExpenseError("Employee not found");
}

async function normalizeLinks(
  category: ExpenseCategory,
  clientCompanyId: string | null,
  counterparty: string | null,
  employeeId: string | null,
): Promise<{ clientCompanyId: string | null; counterparty: string | null; employeeId: string | null }> {
  if (employeeId) {
    if (!uuidPattern.test(employeeId)) throw new ExpenseError("Employee id is invalid");
    await assertEmployee(employeeId);
  }
  if (category === "client_payment") {
    if (clientCompanyId) {
      if (!uuidPattern.test(clientCompanyId)) throw new ExpenseError("Client company id is invalid");
      await assertClientCompany(clientCompanyId);
    }
    return { clientCompanyId, counterparty, employeeId };
  }
  if (clientCompanyId) throw new ExpenseError("Only client payments can link to a client company");
  return { clientCompanyId: null, counterparty, employeeId };
}

function emptyTotals(): ExpenseTotals {
  return {
    client_payment: "0.00",
    investment: "0.00",
    other: "0.00",
    work_permit: "0.00",
    insurance: "0.00",
    medical: "0.00",
    deposit: "0.00",
    all: "0.00",
  };
}

const selectSql = `select e.id, e.expense_date::text, e.amount::text, e.currency, e.category,
            e.client_company_id, c.legal_name as client_name,
            e.employee_id, emp.legal_name as employee_name,
            e.counterparty, e.note, e.recurrence_key,
            e.created_by, e.created_at::text, e.updated_at::text
     from expenses e
     left join companies c on c.id = e.client_company_id
     left join employees emp on emp.id = e.employee_id`;

export async function listExpenses(filters: {
  category?: string | null;
  from?: string | null;
  to?: string | null;
  clientId?: string | null;
  employeeId?: string | null;
  q?: string | null;
}): Promise<ExpenseListResult> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.category && categories.has(filters.category as ExpenseCategory)) {
    params.push(filters.category);
    where.push(`e.category = $${params.length}`);
  }
  if (filters.from) {
    params.push(dateOnly(filters.from, "From date"));
    where.push(`e.expense_date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(dateOnly(filters.to, "To date"));
    where.push(`e.expense_date <= $${params.length}`);
  }
  if (filters.clientId) {
    if (!uuidPattern.test(filters.clientId)) throw new ExpenseError("Client id is invalid");
    params.push(filters.clientId);
    where.push(`e.client_company_id = $${params.length}`);
  }
  if (filters.employeeId) {
    if (!uuidPattern.test(filters.employeeId)) throw new ExpenseError("Employee id is invalid");
    params.push(filters.employeeId);
    where.push(`e.employee_id = $${params.length}`);
  }
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim().toLowerCase()}%`);
    where.push(
      `(lower(coalesce(e.counterparty, '')) like $${params.length}
        or lower(coalesce(e.note, '')) like $${params.length}
        or lower(coalesce(c.legal_name, '')) like $${params.length}
        or lower(coalesce(emp.legal_name, '')) like $${params.length})`,
    );
  }

  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const result = await pool.query<ExpenseRow>(
    `${selectSql}
     ${clause}
     order by e.expense_date desc, e.created_at desc`,
    params,
  );

  const expensesList = result.rows.map(mapRow);
  const totals = emptyTotals();
  let all = 0;
  for (const item of expensesList) {
    const amount = Number(item.amount);
    all += amount;
    totals[item.category] = (Number(totals[item.category]) + amount).toFixed(2);
  }
  totals.all = all.toFixed(2);
  return { expenses: expensesList, totals };
}

export async function getExpense(id: string): Promise<ExpenseRecord | null> {
  const result = await pool.query<ExpenseRow>(`${selectSql} where e.id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function createExpense(
  input: Record<string, unknown>,
  createdBy: string | null,
): Promise<ExpenseRecord> {
  const category = categoryOf(input.category);
  const clientRaw =
    typeof input.clientCompanyId === "string" && input.clientCompanyId.trim() ? input.clientCompanyId.trim() : null;
  const employeeRaw =
    typeof input.employeeId === "string" && input.employeeId.trim() ? input.employeeId.trim() : null;
  const links = await normalizeLinks(category, clientRaw, optionalText(input.counterparty), employeeRaw);
  const recurrenceKey = optionalText(input.recurrenceKey);
  const id = randomUUID();
  try {
    await db.insert(expenses).values({
      id,
      expenseDate: dateOnly(input.expenseDate, "Expense date"),
      amount: money(input.amount, "Amount"),
      currency: (typeof input.currency === "string" && input.currency.trim() ? input.currency.trim() : "MVR").slice(
        0,
        8,
      ),
      category,
      clientCompanyId: links.clientCompanyId,
      employeeId: links.employeeId,
      counterparty: links.counterparty,
      note: optionalText(input.note),
      recurrenceKey,
      createdBy,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (recurrenceKey && /expenses_recurrence_key|duplicate key/i.test(message)) {
      throw new ExpenseError("This recurring expense was already posted");
    }
    throw error;
  }
  const created = await getExpense(id);
  if (!created) throw new ExpenseError("Could not create expense");
  return created;
}

export async function updateExpense(id: string, input: Record<string, unknown>): Promise<ExpenseRecord> {
  const existing = await getExpense(id);
  if (!existing) throw new ExpenseError("Expense not found");
  const category = input.category == null ? existing.category : categoryOf(input.category);
  const clientRaw =
    input.clientCompanyId === null || input.clientCompanyId === ""
      ? null
      : typeof input.clientCompanyId === "string"
        ? input.clientCompanyId.trim() || null
        : existing.clientCompanyId;
  const employeeRaw =
    input.employeeId === null || input.employeeId === ""
      ? null
      : typeof input.employeeId === "string"
        ? input.employeeId.trim() || null
        : existing.employeeId;
  const counterparty = input.counterparty === undefined ? existing.counterparty : optionalText(input.counterparty);
  const links = await normalizeLinks(category, clientRaw, counterparty, employeeRaw);
  await db
    .update(expenses)
    .set({
      expenseDate: input.expenseDate == null ? existing.expenseDate : dateOnly(input.expenseDate, "Expense date"),
      amount: input.amount == null ? existing.amount : money(input.amount, "Amount"),
      currency: (typeof input.currency === "string" && input.currency.trim()
        ? input.currency.trim()
        : existing.currency
      ).slice(0, 8),
      category,
      clientCompanyId: links.clientCompanyId,
      employeeId: links.employeeId,
      counterparty: links.counterparty,
      note: input.note === undefined ? existing.note : optionalText(input.note),
      recurrenceKey:
        input.recurrenceKey === undefined ? existing.recurrenceKey : optionalText(input.recurrenceKey),
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, id));
  const updated = await getExpense(id);
  if (!updated) throw new ExpenseError("Could not update expense");
  return updated;
}

export async function deleteExpense(id: string): Promise<void> {
  const existing = await getExpense(id);
  if (!existing) throw new ExpenseError("Expense not found");
  await db.delete(expenses).where(eq(expenses.id, id));
}
