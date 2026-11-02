import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { allocationEvents, clientAllocations, companies, employees, employments } from "../../lib/schema.ts";

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationError";
  }
}

export type AllocationRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employerCompanyId: string;
  employerName: string;
  clientCompanyId: string;
  clientName: string;
  joinDate: string;
  resignDate: string | null;
  designation: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  status: "active" | "ended";
  createdAt: string;
};

function money(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new AllocationError(`${label} must be a number`);
  return text;
}

function dateOnly(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AllocationError(`${label} must be YYYY-MM-DD`);
  return text;
}

async function mapRow(id: string): Promise<AllocationRecord | null> {
  const result = await pool.query<{
    id: string;
    employee_id: string;
    employee_name: string;
    employer_company_id: string;
    employer_name: string;
    client_company_id: string;
    client_name: string;
    join_date: string;
    resign_date: string | null;
    designation: string | null;
    staff_salary: string;
    bill_rate: string;
    currency: string;
    status: "active" | "ended";
    created_at: string;
  }>(
    `select a.id, a.employee_id, e.legal_name as employee_name,
            a.employer_company_id, emp.legal_name as employer_name,
            a.client_company_id, cli.legal_name as client_name,
            a.join_date::text, a.resign_date::text, a.designation,
            a.staff_salary::text, a.bill_rate::text, a.currency, a.status, a.created_at::text
     from client_allocations a
     join employees e on e.id = a.employee_id
     join companies emp on emp.id = a.employer_company_id
     join companies cli on cli.id = a.client_company_id
     where a.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employerCompanyId: row.employer_company_id,
    employerName: row.employer_name,
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    joinDate: row.join_date,
    resignDate: row.resign_date,
    designation: row.designation,
    staffSalary: row.staff_salary,
    billRate: row.bill_rate,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listAllocations(filters?: {
  clientCompanyId?: string | null;
  status?: string | null;
}): Promise<AllocationRecord[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters?.clientCompanyId) {
    params.push(filters.clientCompanyId);
    where.push(`a.client_company_id = $${params.length}`);
  }
  if (filters?.status === "active" || filters?.status === "ended") {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }
  const result = await pool.query(
    `select a.id, a.employee_id, e.legal_name as employee_name,
            a.employer_company_id, emp.legal_name as employer_name,
            a.client_company_id, cli.legal_name as client_name,
            a.join_date::text, a.resign_date::text, a.designation,
            a.staff_salary::text, a.bill_rate::text, a.currency, a.status, a.created_at::text
     from client_allocations a
     join employees e on e.id = a.employee_id
     join companies emp on emp.id = a.employer_company_id
     join companies cli on cli.id = a.client_company_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by a.join_date desc, e.legal_name`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employerCompanyId: row.employer_company_id,
    employerName: row.employer_name,
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    joinDate: row.join_date,
    resignDate: row.resign_date,
    designation: row.designation,
    staffSalary: row.staff_salary,
    billRate: row.bill_rate,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function headcountByClient(): Promise<
  { clientCompanyId: string; clientName: string; activeCount: number; staffSalaryTotal: string; billRateTotal: string }[]
> {
  const result = await pool.query<{
    client_company_id: string;
    client_name: string;
    active_count: string;
    staff_salary_total: string;
    bill_rate_total: string;
  }>(
    `select cli.id as client_company_id, cli.legal_name as client_name,
            count(*)::text as active_count,
            coalesce(sum(a.staff_salary), 0)::text as staff_salary_total,
            coalesce(sum(a.bill_rate), 0)::text as bill_rate_total
     from client_allocations a
     join companies cli on cli.id = a.client_company_id
     where a.status = 'active'
     group by cli.id, cli.legal_name
     order by cli.legal_name`,
  );
  return result.rows.map((row) => ({
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    activeCount: Number(row.active_count),
    staffSalaryTotal: row.staff_salary_total,
    billRateTotal: row.bill_rate_total,
  }));
}

export async function createAllocation(input: {
  employeeId: string;
  clientCompanyId: string;
  joinDate: string;
  designation?: string | null;
  staffSalary: string;
  billRate: string;
  currency?: string;
  createdBy?: string | null;
}): Promise<AllocationRecord> {
  const employeeRows = await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1);
  const employee = employeeRows[0];
  if (!employee) throw new AllocationError("Employee not found");

  const employmentRows = await db
    .select()
    .from(employments)
    .where(and(eq(employments.employeeId, input.employeeId), eq(employments.status, "active")))
    .limit(1);
  let employerId = employmentRows[0]?.employerCompanyId ?? employee.companyId;

  const employer = await db.select().from(companies).where(eq(companies.id, employerId)).limit(1);
  if (!employer[0] || employer[0].kind !== "employer") throw new AllocationError("Legal employer company is required");

  const client = await db.select().from(companies).where(eq(companies.id, input.clientCompanyId)).limit(1);
  if (!client[0] || client[0].kind !== "client") throw new AllocationError("Select a client company");

  const active = await db
    .select()
    .from(clientAllocations)
    .where(and(eq(clientAllocations.employeeId, input.employeeId), eq(clientAllocations.status, "active")))
    .limit(1);
  if (active[0]) throw new AllocationError("Employee already has an active client allocation. Resign first.");

  if (!employmentRows[0]) {
    await db.insert(employments).values({
      id: randomUUID(),
      employeeId: input.employeeId,
      employerCompanyId: employerId,
      joinDate: dateOnly(input.joinDate, "Join date"),
      status: "active",
    });
  }

  const id = randomUUID();
  const joinDate = dateOnly(input.joinDate, "Join date");
  const staffSalary = money(input.staffSalary, "Staff salary");
  const billRate = money(input.billRate, "Bill rate");
  const currency = (input.currency?.trim() || "MVR").slice(0, 8);
  const designation = input.designation?.trim() || null;

  await db.insert(clientAllocations).values({
    id,
    employeeId: input.employeeId,
    employerCompanyId: employerId,
    clientCompanyId: input.clientCompanyId,
    joinDate,
    designation,
    staffSalary,
    billRate,
    currency,
    status: "active",
  });

  await db.insert(allocationEvents).values({
    id: randomUUID(),
    allocationId: id,
    eventType: "join",
    payload: {
      joinDate,
      designation,
      staffSalary,
      billRate,
      currency,
      clientCompanyId: input.clientCompanyId,
      employerCompanyId: employerId,
    },
    createdBy: input.createdBy ?? null,
  });

  const created = await mapRow(id);
  if (!created) throw new AllocationError("Could not create allocation");
  return created;
}

export async function resignAllocation(
  id: string,
  resignDate: string,
  createdBy?: string | null,
): Promise<AllocationRecord> {
  const existing = await mapRow(id);
  if (!existing) throw new AllocationError("Allocation not found");
  if (existing.status !== "active") throw new AllocationError("Allocation is already ended");
  const date = dateOnly(resignDate, "Resign date");
  if (date < existing.joinDate) throw new AllocationError("Resign date cannot be before join date");

  await db
    .update(clientAllocations)
    .set({ status: "ended", resignDate: date, updatedAt: new Date() })
    .where(eq(clientAllocations.id, id));

  await db.insert(allocationEvents).values({
    id: randomUUID(),
    allocationId: id,
    eventType: "resign",
    payload: { resignDate: date, previous: existing },
    createdBy: createdBy ?? null,
  });

  const updated = await mapRow(id);
  if (!updated) throw new AllocationError("Could not resign allocation");
  return updated;
}

export async function changeAllocationRates(
  id: string,
  input: { staffSalary: string; billRate: string; currency?: string; createdBy?: string | null },
): Promise<AllocationRecord> {
  const existing = await mapRow(id);
  if (!existing) throw new AllocationError("Allocation not found");
  if (existing.status !== "active") throw new AllocationError("Cannot change rates on an ended allocation");
  const staffSalary = money(input.staffSalary, "Staff salary");
  const billRate = money(input.billRate, "Bill rate");
  const currency = (input.currency?.trim() || existing.currency).slice(0, 8);

  await db
    .update(clientAllocations)
    .set({ staffSalary, billRate, currency, updatedAt: new Date() })
    .where(eq(clientAllocations.id, id));

  await db.insert(allocationEvents).values({
    id: randomUUID(),
    allocationId: id,
    eventType: "rate_change",
    payload: {
      previous: { staffSalary: existing.staffSalary, billRate: existing.billRate, currency: existing.currency },
      next: { staffSalary, billRate, currency },
    },
    createdBy: input.createdBy ?? null,
  });

  const updated = await mapRow(id);
  if (!updated) throw new AllocationError("Could not update rates");
  return updated;
}

export async function listAllocationEvents(allocationId: string) {
  const rows = await db
    .select()
    .from(allocationEvents)
    .where(eq(allocationEvents.allocationId, allocationId));
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      eventType: row.eventType,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
}
