import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { companies, employees, otEntries, otRates, projects } from "../../lib/schema.ts";

export class OtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtError";
  }
}

export type OtScope = "company" | "project" | "client";

export type OtRateRecord = {
  id: string;
  scope: OtScope;
  companyId: string | null;
  companyName: string | null;
  projectId: string | null;
  projectName: string | null;
  clientCompanyId: string | null;
  clientName: string | null;
  hourlyRate: string;
  currency: string;
  label: string | null;
  active: boolean;
  updatedAt: string;
};

export type OtEntryRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  hours: string;
  companyId: string | null;
  companyName: string | null;
  projectId: string | null;
  projectName: string | null;
  clientCompanyId: string | null;
  clientName: string | null;
  hourlyRate: string;
  currency: string;
  amount: string;
  note: string | null;
  createdAt: string;
};

export type ResolvedOtRate = {
  hourlyRate: string;
  currency: string;
  source: OtScope | "none";
  rateId: string | null;
  label: string | null;
};

const scopes = new Set<OtScope>(["company", "project", "client"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!uuidPattern.test(value.trim())) throw new OtError("Invalid id");
  return value.trim();
}

function uuidRequired(value: unknown, label: string): string {
  const id = uuidOrNull(value);
  if (!id) throw new OtError(`${label} is required`);
  return id;
}

function money(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new OtError(`${label} must be a number`);
  return text;
}

function hoursOf(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text) || Number(text) <= 0) throw new OtError("Hours must be greater than 0");
  return text;
}

function dateOnly(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new OtError(`${label} must be YYYY-MM-DD`);
  return text;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function scopeOf(value: unknown): OtScope {
  const text = typeof value === "string" ? value.trim() : "";
  if (!scopes.has(text as OtScope)) throw new OtError("Scope must be company, project, or client");
  return text as OtScope;
}

function roundMoney(hours: string, rate: string): string {
  return (Math.round(Number(hours) * Number(rate) * 100) / 100).toFixed(2);
}

export async function listOtRates(): Promise<OtRateRecord[]> {
  const result = await pool.query<{
    id: string;
    scope: OtScope;
    company_id: string | null;
    company_name: string | null;
    project_id: string | null;
    project_name: string | null;
    client_company_id: string | null;
    client_name: string | null;
    hourly_rate: string;
    currency: string;
    label: string | null;
    active: boolean;
    updated_at: string;
  }>(
    `select
      ot_rates.id,
      ot_rates.scope,
      ot_rates.company_id,
      employer.legal_name as company_name,
      ot_rates.project_id,
      projects.name as project_name,
      ot_rates.client_company_id,
      client.legal_name as client_name,
      ot_rates.hourly_rate::text,
      ot_rates.currency,
      ot_rates.label,
      ot_rates.active,
      ot_rates.updated_at::text
    from ot_rates
    left join companies employer on employer.id = ot_rates.company_id
    left join projects on projects.id = ot_rates.project_id
    left join companies client on client.id = ot_rates.client_company_id
    where ot_rates.active = true
    order by ot_rates.scope, coalesce(client.legal_name, projects.name, employer.legal_name)`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    companyId: row.company_id,
    companyName: row.company_name,
    projectId: row.project_id,
    projectName: row.project_name,
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    hourlyRate: row.hourly_rate,
    currency: row.currency,
    label: row.label,
    active: row.active,
    updatedAt: row.updated_at,
  }));
}

export async function upsertOtRate(input: Record<string, unknown>): Promise<OtRateRecord> {
  const scope = scopeOf(input.scope);
  const hourlyRate = money(input.hourlyRate, "Hourly rate");
  const currency = (typeof input.currency === "string" && input.currency.trim()) || "MVR";
  const label = optionalText(input.label);
  let companyId: string | null = null;
  let projectId: string | null = null;
  let clientCompanyId: string | null = null;

  if (scope === "company") {
    companyId = uuidRequired(input.companyId, "Company");
    const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!rows[0]) throw new OtError("Company not found");
  } else if (scope === "project") {
    projectId = uuidRequired(input.projectId, "Project");
    const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new OtError("Project not found");
    companyId = rows[0].companyId;
  } else {
    clientCompanyId = uuidRequired(input.clientCompanyId, "Client");
    const rows = await db.select().from(companies).where(eq(companies.id, clientCompanyId)).limit(1);
    if (!rows[0] || rows[0].kind !== "client") throw new OtError("Client company not found");
  }

  // Deactivate previous active rate for same target, then insert (keeps history simple)
  if (scope === "company" && companyId) {
    await pool.query(`update ot_rates set active = false, updated_at = now() where scope = 'company' and company_id = $1 and active = true`, [
      companyId,
    ]);
  } else if (scope === "project" && projectId) {
    await pool.query(`update ot_rates set active = false, updated_at = now() where scope = 'project' and project_id = $1 and active = true`, [
      projectId,
    ]);
  } else if (scope === "client" && clientCompanyId) {
    await pool.query(
      `update ot_rates set active = false, updated_at = now() where scope = 'client' and client_company_id = $1 and active = true`,
      [clientCompanyId],
    );
  }

  const id = randomUUID();
  await db.insert(otRates).values({
    id,
    scope,
    companyId,
    projectId,
    clientCompanyId,
    hourlyRate,
    currency,
    label,
    active: true,
  });
  const listed = await listOtRates();
  const created = listed.find((row) => row.id === id);
  if (!created) throw new OtError("Could not save OT rate");
  return created;
}

export async function deleteOtRate(id: string): Promise<boolean> {
  if (!uuidPattern.test(id)) return false;
  await pool.query(`update ot_rates set active = false, updated_at = now() where id = $1`, [id]);
  return true;
}

/** Prefer client rate, then project, then employer company. */
export async function resolveOtRate(input: {
  companyId?: string | null;
  projectId?: string | null;
  clientCompanyId?: string | null;
}): Promise<ResolvedOtRate> {
  if (input.clientCompanyId && uuidPattern.test(input.clientCompanyId)) {
    const client = await pool.query<{ id: string; hourly_rate: string; currency: string; label: string | null }>(
      `select id, hourly_rate::text, currency, label from ot_rates
       where active = true and scope = 'client' and client_company_id = $1 limit 1`,
      [input.clientCompanyId],
    );
    if (client.rows[0]) {
      return {
        hourlyRate: client.rows[0].hourly_rate,
        currency: client.rows[0].currency,
        source: "client",
        rateId: client.rows[0].id,
        label: client.rows[0].label,
      };
    }
  }
  if (input.projectId && uuidPattern.test(input.projectId)) {
    const project = await pool.query<{ id: string; hourly_rate: string; currency: string; label: string | null }>(
      `select id, hourly_rate::text, currency, label from ot_rates
       where active = true and scope = 'project' and project_id = $1 limit 1`,
      [input.projectId],
    );
    if (project.rows[0]) {
      return {
        hourlyRate: project.rows[0].hourly_rate,
        currency: project.rows[0].currency,
        source: "project",
        rateId: project.rows[0].id,
        label: project.rows[0].label,
      };
    }
  }
  if (input.companyId && uuidPattern.test(input.companyId)) {
    const company = await pool.query<{ id: string; hourly_rate: string; currency: string; label: string | null }>(
      `select id, hourly_rate::text, currency, label from ot_rates
       where active = true and scope = 'company' and company_id = $1 limit 1`,
      [input.companyId],
    );
    if (company.rows[0]) {
      return {
        hourlyRate: company.rows[0].hourly_rate,
        currency: company.rows[0].currency,
        source: "company",
        rateId: company.rows[0].id,
        label: company.rows[0].label,
      };
    }
  }
  return { hourlyRate: "0", currency: "MVR", source: "none", rateId: null, label: null };
}

export async function listOtEntries(filters?: {
  from?: string | null;
  to?: string | null;
  employeeId?: string | null;
  companyId?: string | null;
  clientId?: string | null;
}): Promise<{ entries: OtEntryRecord[]; totalAmount: string; totalHours: string }> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replace("?", `$${params.length}`));
  };
  if (filters?.from) add("ot_entries.work_date >= ?", dateOnly(filters.from, "From"));
  if (filters?.to) add("ot_entries.work_date <= ?", dateOnly(filters.to, "To"));
  if (filters?.employeeId && uuidPattern.test(filters.employeeId)) add("ot_entries.employee_id = ?", filters.employeeId);
  if (filters?.companyId && uuidPattern.test(filters.companyId)) add("ot_entries.company_id = ?", filters.companyId);
  if (filters?.clientId && uuidPattern.test(filters.clientId)) add("ot_entries.client_company_id = ?", filters.clientId);
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

  const result = await pool.query<{
    id: string;
    employee_id: string;
    employee_name: string;
    work_date: string;
    hours: string;
    company_id: string | null;
    company_name: string | null;
    project_id: string | null;
    project_name: string | null;
    client_company_id: string | null;
    client_name: string | null;
    hourly_rate: string;
    currency: string;
    amount: string;
    note: string | null;
    created_at: string;
  }>(
    `select
      ot_entries.id,
      ot_entries.employee_id,
      employees.legal_name as employee_name,
      ot_entries.work_date::text,
      ot_entries.hours::text,
      ot_entries.company_id,
      employer.legal_name as company_name,
      ot_entries.project_id,
      projects.name as project_name,
      ot_entries.client_company_id,
      client.legal_name as client_name,
      ot_entries.hourly_rate::text,
      ot_entries.currency,
      ot_entries.amount::text,
      ot_entries.note,
      ot_entries.created_at::text
    from ot_entries
    inner join employees on employees.id = ot_entries.employee_id
    left join companies employer on employer.id = ot_entries.company_id
    left join projects on projects.id = ot_entries.project_id
    left join companies client on client.id = ot_entries.client_company_id
    ${where}
    order by ot_entries.work_date desc, employees.legal_name
    limit 500`,
    params,
  );

  let totalAmount = 0;
  let totalHours = 0;
  const entries = result.rows.map((row) => {
    totalAmount += Number(row.amount);
    totalHours += Number(row.hours);
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      workDate: row.work_date,
      hours: row.hours,
      companyId: row.company_id,
      companyName: row.company_name,
      projectId: row.project_id,
      projectName: row.project_name,
      clientCompanyId: row.client_company_id,
      clientName: row.client_name,
      hourlyRate: row.hourly_rate,
      currency: row.currency,
      amount: row.amount,
      note: row.note,
      createdAt: row.created_at,
    };
  });
  return {
    entries,
    totalAmount: totalAmount.toFixed(2),
    totalHours: totalHours.toFixed(2),
  };
}

export async function createOtEntry(input: Record<string, unknown>, createdBy: string | null): Promise<OtEntryRecord> {
  const employeeId = uuidRequired(input.employeeId, "Employee");
  const workDate = dateOnly(input.workDate, "Date");
  const hours = hoursOf(input.hours);
  const projectId = uuidOrNull(input.projectId);
  const clientCompanyId = uuidOrNull(input.clientCompanyId);
  const note = optionalText(input.note);

  const employeeRows = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  const employee = employeeRows[0];
  if (!employee) throw new OtError("Employee not found");
  const companyId = uuidOrNull(input.companyId) ?? employee.companyId;

  if (projectId) {
    const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new OtError("Project not found");
  }
  if (clientCompanyId) {
    const rows = await db.select().from(companies).where(eq(companies.id, clientCompanyId)).limit(1);
    if (!rows[0] || rows[0].kind !== "client") throw new OtError("Client not found");
  }

  let hourlyRate: string;
  let currency: string;
  if (typeof input.hourlyRate === "string" && input.hourlyRate.trim()) {
    hourlyRate = money(input.hourlyRate, "Hourly rate");
    currency = (typeof input.currency === "string" && input.currency.trim()) || "MVR";
  } else {
    const resolved = await resolveOtRate({ companyId, projectId, clientCompanyId });
    if (resolved.source === "none") {
      throw new OtError("No OT rate found for this company/project/client — set a rate first");
    }
    hourlyRate = resolved.hourlyRate;
    currency = resolved.currency;
  }

  const amount = roundMoney(hours, hourlyRate);
  const id = randomUUID();
  await db.insert(otEntries).values({
    id,
    employeeId,
    workDate,
    hours,
    companyId,
    projectId,
    clientCompanyId,
    hourlyRate,
    currency,
    amount,
    note,
    createdBy,
  });

  const listed = await listOtEntries({ employeeId });
  const created = listed.entries.find((row) => row.id === id);
  if (!created) throw new OtError("Could not save OT entry");
  return created;
}

export async function deleteOtEntry(id: string): Promise<boolean> {
  if (!uuidPattern.test(id)) return false;
  const result = await db.delete(otEntries).where(eq(otEntries.id, id)).returning({ id: otEntries.id });
  return Boolean(result[0]);
}
