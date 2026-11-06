import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { allocationEvents, clientAllocations, companies, employees, employments } from "../../lib/schema.ts";
import {
  applyAllocationEndAttendance,
  type AllocationEndAttendanceResult,
  type AllocationEndReason,
} from "./attendance.ts";
import { findClientDesignationRate } from "./client-rates.ts";

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationError";
  }
}

export type { AllocationEndReason };

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
  endReason: AllocationEndReason | null;
  endNote: string | null;
  designation: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  status: "active" | "ended";
  createdAt: string;
};

export type EndAllocationResult = AllocationRecord & {
  attendance: AllocationEndAttendanceResult;
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
    end_reason: AllocationEndReason | null;
    end_note: string | null;
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
            a.join_date::text, a.resign_date::text,
            a.end_reason, a.end_note, a.designation,
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
    endReason: row.end_reason,
    endNote: row.end_note,
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
  clientIds?: string[] | null;
  employerCompanyId?: string | null;
  employeeId?: string | null;
  status?: string | null;
  q?: string | null;
}): Promise<AllocationRecord[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters?.clientIds) {
    if (!filters.clientIds.length) return [];
    params.push(filters.clientIds);
    where.push(`a.client_company_id = any($${params.length}::uuid[])`);
  }
  if (filters?.clientCompanyId) {
    params.push(filters.clientCompanyId);
    where.push(`a.client_company_id = $${params.length}`);
  }
  if (filters?.employerCompanyId) {
    params.push(filters.employerCompanyId);
    where.push(`a.employer_company_id = $${params.length}`);
  }
  if (filters?.employeeId) {
    params.push(filters.employeeId);
    where.push(`a.employee_id = $${params.length}`);
  }
  if (filters?.status === "active" || filters?.status === "ended") {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }
  if (filters?.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const i = params.length;
    where.push(
      `(e.legal_name ilike $${i}
        or coalesce(a.designation, '') ilike $${i}
        or emp.legal_name ilike $${i}
        or cli.legal_name ilike $${i})`,
    );
  }
  const result = await pool.query(
    `select a.id, a.employee_id, e.legal_name as employee_name,
            a.employer_company_id, emp.legal_name as employer_name,
            a.client_company_id, cli.legal_name as client_name,
            a.join_date::text, a.resign_date::text,
            a.end_reason, a.end_note, a.designation,
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
    endReason: row.end_reason ?? null,
    endNote: row.end_note ?? null,
    designation: row.designation,
    staffSalary: row.staff_salary,
    billRate: row.bill_rate,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function headcountByClient(): Promise<
  {
    clientCompanyId: string;
    clientName: string;
    activeCount: number;
    employerCount: number;
    staffSalaryTotal: string;
    billRateTotal: string;
  }[]
> {
  const result = await pool.query<{
    client_company_id: string;
    client_name: string;
    active_count: string;
    employer_count: string;
    staff_salary_total: string;
    bill_rate_total: string;
  }>(
    `select cli.id as client_company_id, cli.legal_name as client_name,
            count(*)::text as active_count,
            count(distinct a.employer_company_id)::text as employer_count,
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
    employerCount: Number(row.employer_count),
    staffSalaryTotal: row.staff_salary_total,
    billRateTotal: row.bill_rate_total,
  }));
}

export async function createAllocation(input: {
  employeeId: string;
  clientCompanyId: string;
  joinDate: string;
  designation?: string | null;
  staffSalary?: string;
  billRate?: string;
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
  const designation = input.designation?.trim() || employee.designation?.trim() || null;
  const fromClientCard =
    designation ? await findClientDesignationRate(input.clientCompanyId, designation) : null;
  const staffFromEmployee = employee.staffDayRate != null ? String(employee.staffDayRate) : "";
  const billFromEmployee = employee.billDayRate != null ? String(employee.billDayRate) : "";
  const staffRaw = (
    input.staffSalary?.trim() ||
    fromClientCard?.staffMonthRate ||
    staffFromEmployee
  ).trim();
  const billRaw = (input.billRate?.trim() || fromClientCard?.billMonthRate || billFromEmployee).trim();
  if (!staffRaw || !billRaw) {
    throw new AllocationError(
      "Set monthly designation rates on the client, monthly rates on the employee, or enter rates here",
    );
  }
  const staffSalary = money(staffRaw, "Staff monthly salary");
  const billRate = money(billRaw, "Client monthly bill rate");
  const currency = (input.currency?.trim() || fromClientCard?.currency || "MVR").slice(0, 8);

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

function endReasonOf(value: unknown): AllocationEndReason {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "resign" || text === "terminate" || text === "lost" || text === "transfer_out") return text;
  throw new AllocationError("Reason must be resign, terminate, lost, or transfer_out");
}

/**
 * End a client allocation with a reason and auto-adjust attendance for payroll.
 * endDate is the last day on the client (inclusive for LOP).
 */
export async function endAllocation(
  id: string,
  input: {
    endDate: unknown;
    reason: unknown;
    note?: unknown;
    absentFrom?: unknown;
    createdBy?: string | null;
  },
): Promise<EndAllocationResult> {
  const existing = await mapRow(id);
  if (!existing) throw new AllocationError("Allocation not found");
  if (existing.status !== "active") throw new AllocationError("Allocation is already ended");

  const reason = endReasonOf(input.reason);
  const endDate = dateOnly(input.endDate, "End date");
  if (endDate < existing.joinDate) throw new AllocationError("End date cannot be before join date");

  const note =
    typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 1000) : null;
  const absentFromRaw =
    input.absentFrom === undefined || input.absentFrom === null || String(input.absentFrom).trim() === ""
      ? null
      : dateOnly(input.absentFrom, "Absent from");
  if (absentFromRaw && absentFromRaw < existing.joinDate) {
    throw new AllocationError("Absent-from date cannot be before join date");
  }

  await db
    .update(clientAllocations)
    .set({
      status: "ended",
      resignDate: endDate,
      endReason: reason,
      endNote: note,
      updatedAt: new Date(),
    })
    .where(eq(clientAllocations.id, id));

  let attendance: AllocationEndAttendanceResult;
  try {
    attendance = await applyAllocationEndAttendance({
      employeeId: existing.employeeId,
      endDate,
      reason,
      absentFrom: absentFromRaw,
      createdBy: input.createdBy ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attendance update failed";
    throw new AllocationError(message);
  }

  await db.insert(allocationEvents).values({
    id: randomUUID(),
    allocationId: id,
    eventType: reason === "transfer_out" ? "transfer_out" : reason,
    payload: {
      endDate,
      reason,
      note,
      absentFrom: attendance.absentFrom,
      attendance,
      previous: existing,
    },
    createdBy: input.createdBy ?? null,
  });

  const updated = await mapRow(id);
  if (!updated) throw new AllocationError("Could not end allocation");
  return { ...updated, attendance };
}

/** @deprecated Prefer endAllocation({ reason: "resign" }) */
export async function resignAllocation(
  id: string,
  resignDate: string,
  createdBy?: string | null,
): Promise<AllocationRecord> {
  const ended = await endAllocation(id, {
    endDate: resignDate,
    reason: "resign",
    createdBy,
  });
  const { attendance: _attendance, ...record } = ended;
  return record;
}

export async function changeAllocationRates(
  id: string,
  input: {
    staffSalary: string;
    billRate: string;
    currency?: string;
    designation?: string | null;
    createdBy?: string | null;
  },
): Promise<AllocationRecord> {
  const existing = await mapRow(id);
  if (!existing) throw new AllocationError("Allocation not found");
  if (existing.status !== "active") throw new AllocationError("Cannot change rates on an ended allocation");
  const staffSalary = money(input.staffSalary, "Staff monthly salary");
  const billRate = money(input.billRate, "Client monthly bill rate");
  const currency = (input.currency?.trim() || existing.currency).slice(0, 8);
  const designation =
    input.designation !== undefined ? input.designation?.trim() || null : existing.designation;

  await db
    .update(clientAllocations)
    .set({ staffSalary, billRate, currency, designation, updatedAt: new Date() })
    .where(eq(clientAllocations.id, id));

  await db.insert(allocationEvents).values({
    id: randomUUID(),
    allocationId: id,
    eventType: "rate_change",
    payload: {
      previous: {
        staffSalary: existing.staffSalary,
        billRate: existing.billRate,
        currency: existing.currency,
        designation: existing.designation,
      },
      next: { staffSalary, billRate, currency, designation },
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

function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Move a worker to another client in one step: end current allocation as transfer_out,
 * then open a new active allocation (staffing CRM transfer / redeploy).
 */
export async function transferAllocation(
  id: string,
  input: {
    endDate: unknown;
    note?: unknown;
    clientCompanyId: string;
    joinDate?: unknown;
    designation?: string | null;
    staffSalary?: string;
    billRate?: string;
    currency?: string;
    createdBy?: string | null;
  },
): Promise<{ ended: EndAllocationResult; created: AllocationRecord }> {
  const existing = await mapRow(id);
  if (!existing) throw new AllocationError("Allocation not found");
  if (existing.status !== "active") throw new AllocationError("Allocation is already ended");

  const endDate = dateOnly(input.endDate, "End date");
  const joinDate = input.joinDate == null || String(input.joinDate).trim() === ""
    ? nextDay(endDate)
    : dateOnly(input.joinDate, "Join date");
  if (joinDate <= endDate) {
    throw new AllocationError("New client start date must be after the last day on the current client");
  }
  if (input.clientCompanyId === existing.clientCompanyId) {
    throw new AllocationError("Pick a different client for the transfer");
  }

  const ended = await endAllocation(id, {
    endDate,
    reason: "transfer_out",
    note: input.note,
    createdBy: input.createdBy,
  });

  try {
    const created = await createAllocation({
      employeeId: existing.employeeId,
      clientCompanyId: input.clientCompanyId,
      joinDate,
      designation: input.designation !== undefined ? input.designation : existing.designation,
      staffSalary: input.staffSalary,
      billRate: input.billRate,
      currency: input.currency ?? existing.currency,
      createdBy: input.createdBy,
    });
    return { ended, created };
  } catch (reason) {
    throw new AllocationError(
      reason instanceof Error
        ? `Transferred out of ${existing.clientName}, but new placement failed: ${reason.message}`
        : "Transfer partially completed — new placement failed",
    );
  }
}

/** Place several bench workers onto one client (shared start date; per-person rates optional). */
export async function createAllocationsBatch(
  input: {
    clientCompanyId: string;
    joinDate: string;
    items: {
      employeeId: string;
      designation?: string | null;
      staffSalary?: string;
      billRate?: string;
      currency?: string;
    }[];
    createdBy?: string | null;
  },
): Promise<{ created: AllocationRecord[]; errors: { employeeId: string; error: string }[] }> {
  if (!input.items.length) throw new AllocationError("Select at least one employee");
  const created: AllocationRecord[] = [];
  const errors: { employeeId: string; error: string }[] = [];
  for (const item of input.items) {
    try {
      created.push(
        await createAllocation({
          employeeId: item.employeeId,
          clientCompanyId: input.clientCompanyId,
          joinDate: input.joinDate,
          designation: item.designation,
          staffSalary: item.staffSalary,
          billRate: item.billRate,
          currency: item.currency,
          createdBy: input.createdBy,
        }),
      );
    } catch (reason) {
      errors.push({
        employeeId: item.employeeId,
        error: reason instanceof Error ? reason.message : "Could not allocate",
      });
    }
  }
  if (!created.length) {
    throw new AllocationError(errors[0]?.error ?? "Could not allocate anyone");
  }
  return { created, errors };
}
