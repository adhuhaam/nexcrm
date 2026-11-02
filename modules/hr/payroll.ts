import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { clientAllocations, companies, payRunItems, payRuns } from "../../lib/schema.ts";

export class PayrollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollError";
  }
}

export type PayRunRecord = {
  id: string;
  employerCompanyId: string;
  employerName: string;
  clientCompanyId: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "locked";
  lockedAt: string | null;
  createdAt: string;
  items: {
    id: string;
    allocationId: string;
    employeeId: string;
    employeeName: string;
    designation: string | null;
    staffSalary: string;
    billRate: string;
    currency: string;
  }[];
  totals: { staffSalary: string; billRate: string };
};

function dateOnly(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new PayrollError(`${label} must be YYYY-MM-DD`);
  return text;
}

async function loadPayRun(id: string): Promise<PayRunRecord | null> {
  const result = await pool.query<{
    id: string;
    employer_company_id: string;
    employer_name: string;
    client_company_id: string;
    client_name: string;
    period_start: string;
    period_end: string;
    status: "draft" | "locked";
    locked_at: string | null;
    created_at: string;
  }>(
    `select p.id, p.employer_company_id, emp.legal_name as employer_name,
            p.client_company_id, cli.legal_name as client_name,
            p.period_start::text, p.period_end::text, p.status, p.locked_at::text, p.created_at::text
     from pay_runs p
     join companies emp on emp.id = p.employer_company_id
     join companies cli on cli.id = p.client_company_id
     where p.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  const items = await pool.query<{
    id: string;
    allocation_id: string;
    employee_id: string;
    employee_name: string;
    designation: string | null;
    staff_salary: string;
    bill_rate: string;
    currency: string;
  }>(
    `select id, allocation_id, employee_id, employee_name, designation,
            staff_salary::text, bill_rate::text, currency
     from pay_run_items where pay_run_id = $1 order by employee_name`,
    [id],
  );
  let staff = 0;
  let bill = 0;
  const mapped = items.rows.map((item) => {
    staff += Number(item.staff_salary);
    bill += Number(item.bill_rate);
    return {
      id: item.id,
      allocationId: item.allocation_id,
      employeeId: item.employee_id,
      employeeName: item.employee_name,
      designation: item.designation,
      staffSalary: item.staff_salary,
      billRate: item.bill_rate,
      currency: item.currency,
    };
  });
  return {
    id: row.id,
    employerCompanyId: row.employer_company_id,
    employerName: row.employer_name,
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    items: mapped,
    totals: { staffSalary: staff.toFixed(2), billRate: bill.toFixed(2) },
  };
}

export async function listPayRuns(): Promise<Omit<PayRunRecord, "items" | "totals">[]> {
  const result = await pool.query(
    `select p.id, p.employer_company_id, emp.legal_name as employer_name,
            p.client_company_id, cli.legal_name as client_name,
            p.period_start::text, p.period_end::text, p.status, p.locked_at::text, p.created_at::text
     from pay_runs p
     join companies emp on emp.id = p.employer_company_id
     join companies cli on cli.id = p.client_company_id
     order by p.period_start desc, cli.legal_name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    employerCompanyId: row.employer_company_id,
    employerName: row.employer_name,
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
  }));
}

export async function getPayRun(id: string): Promise<PayRunRecord | null> {
  return loadPayRun(id);
}

export async function createPayRun(input: {
  clientCompanyId: string;
  employerCompanyId?: string | null;
  periodStart: string;
  periodEnd: string;
  createdBy?: string | null;
}): Promise<PayRunRecord> {
  const periodStart = dateOnly(input.periodStart, "Period start");
  const periodEnd = dateOnly(input.periodEnd, "Period end");
  if (periodEnd < periodStart) throw new PayrollError("Period end must be on or after period start");

  const client = await db.select().from(companies).where(eq(companies.id, input.clientCompanyId)).limit(1);
  if (!client[0] || client[0].kind !== "client") throw new PayrollError("Select a client company");

  const allocations = await db
    .select()
    .from(clientAllocations)
    .where(and(eq(clientAllocations.clientCompanyId, input.clientCompanyId), eq(clientAllocations.status, "active")));

  if (!allocations.length) throw new PayrollError("No active allocations for this client");

  const employerId = input.employerCompanyId || allocations[0].employerCompanyId;
  const employer = await db.select().from(companies).where(eq(companies.id, employerId)).limit(1);
  if (!employer[0] || employer[0].kind !== "employer") throw new PayrollError("Employer company is required");

  const inPeriod = allocations.filter((row) => {
    const join = String(row.joinDate);
    const resign = row.resignDate ? String(row.resignDate) : null;
    if (join > periodEnd) return false;
    if (resign && resign < periodStart) return false;
    return true;
  });
  if (!inPeriod.length) throw new PayrollError("No allocations overlap this period");

  const id = randomUUID();
  await db.insert(payRuns).values({
    id,
    employerCompanyId: employerId,
    clientCompanyId: input.clientCompanyId,
    periodStart,
    periodEnd,
    status: "draft",
    createdBy: input.createdBy ?? null,
  });

  for (const allocation of inPeriod) {
    const emp = await pool.query<{ legal_name: string }>(`select legal_name from employees where id = $1`, [
      allocation.employeeId,
    ]);
    const employeeName = emp.rows[0]?.legal_name ?? "Unknown";
    await db.insert(payRunItems).values({
      id: randomUUID(),
      payRunId: id,
      allocationId: allocation.id,
      employeeId: allocation.employeeId,
      employeeName,
      designation: allocation.designation,
      staffSalary: allocation.staffSalary,
      billRate: allocation.billRate,
      currency: allocation.currency,
      snapshot: {
        allocationId: allocation.id,
        staffSalary: allocation.staffSalary,
        billRate: allocation.billRate,
        currency: allocation.currency,
        joinDate: allocation.joinDate,
        periodStart,
        periodEnd,
      },
    });
  }

  const created = await loadPayRun(id);
  if (!created) throw new PayrollError("Could not create pay run");
  return created;
}

export async function lockPayRun(id: string): Promise<PayRunRecord> {
  const existing = await loadPayRun(id);
  if (!existing) throw new PayrollError("Pay run not found");
  if (existing.status === "locked") throw new PayrollError("Pay run is already locked");
  await db
    .update(payRuns)
    .set({ status: "locked", lockedAt: new Date() })
    .where(eq(payRuns.id, id));
  const locked = await loadPayRun(id);
  if (!locked) throw new PayrollError("Could not lock pay run");
  return locked;
}
