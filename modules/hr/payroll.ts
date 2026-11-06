import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { clientAllocations, companies, payRunItems, payRuns } from "../../lib/schema.ts";
import { daysInMonth } from "./attendance.ts";

export class PayrollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollError";
  }
}

export type GenerationMode = "client_batch" | "employer_client";

export type PayRunItemRecord = {
  id: string;
  allocationId: string;
  employeeId: string;
  employeeName: string;
  designation: string | null;
  passportNumber: string | null;
  workPermitNumber: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  calendarDays: number;
  paidDays: number;
  absentDays: number;
  offDays: number;
  unmarkedDays: number;
  grossStaff: string;
  lopStaff: string;
  otStaff: string;
  otherDeductStaff: string;
  netStaff: string;
  grossBill: string;
  lopBill: string;
  otBill: string;
  otherDeductBill: string;
  deductionNote: string | null;
  netBill: string;
};

export type PayRunRecord = {
  id: string;
  employerCompanyId: string;
  employerName: string;
  clientCompanyId: string;
  clientName: string;
  clientTinNumber: string | null;
  clientAddress: string | null;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "locked";
  generationMode: GenerationMode;
  invoiceNumber: string | null;
  salarySheetNumber: string | null;
  lockedAt: string | null;
  createdAt: string;
  items: PayRunItemRecord[];
  totals: {
    staffSalary: string;
    billRate: string;
    netStaff: string;
    netBill: string;
    unmarkedDays: number;
  };
  warnings: string[];
};

function formatInvoiceNumber(serial: number): string {
  return `INV-${String(serial).padStart(6, "0")}`;
}

function formatSalarySheetNumber(serial: number): string {
  return `PAY-${String(serial).padStart(6, "0")}`;
}

async function ensurePayRunSerial(input: {
  payRunId: string;
  column: "invoice_number" | "salary_sheet_number";
  counterId: "tax_invoice" | "salary_sheet";
  format: (serial: number) => string;
}): Promise<string> {
  if (!uuidPattern.test(input.payRunId)) throw new PayrollError("Pay run not found");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ serial: string | null }>(
      `select ${input.column} as serial from pay_runs where id = $1 for update`,
      [input.payRunId],
    );
    const row = existing.rows[0];
    if (!row) throw new PayrollError("Pay run not found");
    if (row.serial) {
      await client.query("commit");
      return row.serial;
    }

    await client.query(
      `insert into invoice_counters (id, last_value, updated_at)
       values ($1, 0, now())
       on conflict (id) do nothing`,
      [input.counterId],
    );
    const counter = await client.query<{ last_value: number }>(
      `select last_value from invoice_counters where id = $1 for update`,
      [input.counterId],
    );
    const next = Number(counter.rows[0]?.last_value ?? 0) + 1;
    const serial = input.format(next);
    await client.query(
      `update invoice_counters set last_value = $1, updated_at = now() where id = $2`,
      [next, input.counterId],
    );
    await client.query(`update pay_runs set ${input.column} = $1 where id = $2`, [serial, input.payRunId]);
    await client.query("commit");
    return serial;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Assign the next agency-wide INV-###### once; later opens reuse the same number. */
export async function ensurePayRunInvoiceNumber(payRunId: string): Promise<string> {
  return ensurePayRunSerial({
    payRunId,
    column: "invoice_number",
    counterId: "tax_invoice",
    format: formatInvoiceNumber,
  });
}

/** Assign the next agency-wide PAY-###### once; later opens reuse the same number. */
export async function ensurePayRunSalarySheetNumber(payRunId: string): Promise<string> {
  return ensurePayRunSerial({
    payRunId,
    column: "salary_sheet_number",
    counterId: "salary_sheet",
    format: formatSalarySheetNumber,
  });
}

type AllocationRow = typeof clientAllocations.$inferSelect;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateOnly(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new PayrollError(`${label} must be YYYY-MM-DD`);
  return text;
}

function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function assertFullCalendarMonth(periodStart: string, periodEnd: string): { year: number; month: number; dim: number } {
  const year = Number(periodStart.slice(0, 4));
  const month = Number(periodStart.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new PayrollError("Period must be a calendar month");
  }
  const dim = daysInMonth(year, month);
  const expectedStart = `${year}-${pad2(month)}-01`;
  const expectedEnd = `${year}-${pad2(month)}-${pad2(dim)}`;
  if (periodStart !== expectedStart || periodEnd !== expectedEnd) {
    throw new PayrollError(`Period must be the full calendar month ${expectedStart} to ${expectedEnd}`);
  }
  return { year, month, dim };
}

function overlapsPeriod(row: AllocationRow, periodStart: string, periodEnd: string): boolean {
  const join = String(row.joinDate);
  const resign = row.resignDate ? String(row.resignDate) : null;
  if (join > periodEnd) return false;
  if (resign && resign < periodStart) return false;
  return true;
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

async function loadAttendanceMap(
  employeeIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, Map<string, string>>> {
  const map = new Map<string, Map<string, string>>();
  if (!employeeIds.length) return map;
  const result = await pool.query<{ employee_id: string; attendance_date: string; status: string }>(
    `select employee_id, attendance_date::text, status
     from attendance_records
     where attendance_date >= $1::date and attendance_date <= $2::date
       and employee_id = any($3::uuid[])`,
    [periodStart, periodEnd, employeeIds],
  );
  for (const row of result.rows) {
    if (!map.has(row.employee_id)) map.set(row.employee_id, new Map());
    map.get(row.employee_id)!.set(row.attendance_date, row.status);
  }
  return map;
}

async function loadDeductionsByEmployee(
  employeeIds: string[],
  clientCompanyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, { staff: number; bill: number; note: string | null; breakdown: Record<string, unknown> }>> {
  const map = new Map<string, { staff: number; bill: number; note: string | null; breakdown: Record<string, unknown> }>();
  if (!employeeIds.length) return map;
  const result = await pool.query<{
    employee_id: string;
    staff_amount: string;
    bill_amount: string;
    note: string | null;
    breakdown: Record<string, unknown> | null;
  }>(
    `select employee_id, staff_amount::text, bill_amount::text, note, breakdown
     from payroll_period_deductions
     where client_company_id = $1
       and period_start = $2::date and period_end = $3::date
       and employee_id = any($4::uuid[])`,
    [clientCompanyId, periodStart, periodEnd, employeeIds],
  );
  for (const row of result.rows) {
    map.set(row.employee_id, {
      staff: Number(row.staff_amount),
      bill: Number(row.bill_amount),
      note: row.note,
      breakdown: row.breakdown ?? {},
    });
  }
  return map;
}

/** Upsert boat/meal/other deductions for one employee in a pay period. */
export async function upsertPeriodDeduction(input: {
  clientCompanyId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  staffAmount: number | string;
  billAmount?: number | string;
  note?: string | null;
  breakdown?: Record<string, unknown>;
}): Promise<void> {
  const staff = money(Number(input.staffAmount));
  const bill = money(Number(input.billAmount ?? 0));
  const note =
    typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 1000) : null;
  const breakdown = input.breakdown ?? {};
  await pool.query(
    `insert into payroll_period_deductions (
       id, client_company_id, employee_id, period_start, period_end,
       staff_amount, bill_amount, note, breakdown, created_at, updated_at
     ) values (
       $1::uuid, $2::uuid, $3::uuid, $4::date, $5::date,
       $6::numeric, $7::numeric, $8, $9::jsonb, now(), now()
     )
     on conflict (client_company_id, employee_id, period_start, period_end)
     do update set
       staff_amount = excluded.staff_amount,
       bill_amount = excluded.bill_amount,
       note = excluded.note,
       breakdown = excluded.breakdown,
       updated_at = now()`,
    [
      randomUUID(),
      input.clientCompanyId,
      input.employeeId,
      input.periodStart,
      input.periodEnd,
      staff,
      bill,
      note,
      JSON.stringify(breakdown),
    ],
  );
}

async function loadOtByEmployee(
  employeeIds: string[],
  clientCompanyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, { staff: number; bill: number; ids: string[] }>> {
  const map = new Map<string, { staff: number; bill: number; ids: string[] }>();
  if (!employeeIds.length) return map;
  const result = await pool.query<{
    id: string;
    employee_id: string;
    amount: string;
    client_company_id: string | null;
  }>(
    `select id, employee_id, amount::text, client_company_id
     from ot_entries
     where work_date >= $1::date and work_date <= $2::date
       and employee_id = any($3::uuid[])`,
    [periodStart, periodEnd, employeeIds],
  );
  for (const row of result.rows) {
    const amount = Number(row.amount);
    const current = map.get(row.employee_id) ?? { staff: 0, bill: 0, ids: [] };
    current.staff += amount;
    current.ids.push(row.id);
    if (row.client_company_id === clientCompanyId) current.bill += amount;
    map.set(row.employee_id, current);
  }
  return map;
}

type ComputedLine = {
  allocation: AllocationRow;
  employeeName: string;
  calendarDays: number;
  paidDays: number;
  absentDays: number;
  offDays: number;
  unmarkedDays: number;
  dailyStaff: number;
  dailyBill: number;
  grossStaff: number;
  lopStaff: number;
  otStaff: number;
  otherDeductStaff: number;
  netStaff: number;
  grossBill: number;
  lopBill: number;
  otBill: number;
  otherDeductBill: number;
  deductionNote: string | null;
  deductionBreakdown: Record<string, unknown>;
  netBill: number;
  otEntryIds: string[];
};

function computeLine(input: {
  allocation: AllocationRow;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  dim: number;
  attendance: Map<string, string>;
  ot: { staff: number; bill: number; ids: string[] };
  deduction: { staff: number; bill: number; note: string | null; breakdown: Record<string, unknown> };
}): ComputedLine {
  // Allocation staff_salary / bill_rate are monthly rates.
  // Daily = monthly / daysInMonth (30 or 31 etc.). Full present month → full monthly.
  const monthlyStaff = Number(input.allocation.staffSalary);
  const monthlyBill = Number(input.allocation.billRate);
  const dailyStaff = monthlyStaff / input.dim;
  const dailyBill = monthlyBill / input.dim;

  const join = String(input.allocation.joinDate);
  const resign = input.allocation.resignDate ? String(input.allocation.resignDate) : null;
  // Inclusive window: joinDate … resignDate (end date is last payable day on client).
  const windowStart = join > input.periodStart ? join : input.periodStart;
  const windowEnd = resign && resign < input.periodEnd ? resign : input.periodEnd;

  let paidDays = 0;
  let absentDays = 0;
  let offDays = 0;
  let unmarkedDays = 0;
  let calendarDays = 0;

  if (windowEnd >= windowStart) {
    for (const day of eachDate(windowStart, windowEnd)) {
      calendarDays += 1;
      const status = input.attendance.get(day);
      if (status === "P") paidDays += 1;
      else if (status === "OD") {
        paidDays += 1;
        offDays += 1;
      } else if (status === "AB") absentDays += 1;
      else {
        unmarkedDays += 1;
        absentDays += 1;
      }
    }
  }

  const unpaidDays = absentDays;
  const grossStaff = Number(money((monthlyStaff * calendarDays) / input.dim));
  const lopStaff = Number(money((monthlyStaff * unpaidDays) / input.dim));
  const otStaff = input.ot.staff;
  const otherDeductStaff = Number(money(input.deduction.staff));
  const netStaff =
    Number(money((monthlyStaff * paidDays) / input.dim)) + otStaff - otherDeductStaff;

  const grossBill = Number(money((monthlyBill * calendarDays) / input.dim));
  const lopBill = Number(money((monthlyBill * unpaidDays) / input.dim));
  const otBill = input.ot.bill;
  const otherDeductBill = Number(money(input.deduction.bill));
  const netBill = Number(money((monthlyBill * paidDays) / input.dim)) + otBill - otherDeductBill;

  return {
    allocation: input.allocation,
    employeeName: input.employeeName,
    calendarDays,
    paidDays,
    absentDays,
    offDays,
    unmarkedDays,
    dailyStaff,
    dailyBill,
    grossStaff,
    lopStaff,
    otStaff,
    otherDeductStaff,
    netStaff,
    grossBill,
    lopBill,
    otBill,
    otherDeductBill,
    deductionNote: input.deduction.note,
    deductionBreakdown: input.deduction.breakdown,
    netBill,
    otEntryIds: input.ot.ids,
  };
}

async function computeItemsForScope(input: {
  allocations: AllocationRow[];
  clientCompanyId: string;
  periodStart: string;
  periodEnd: string;
  dim: number;
}): Promise<ComputedLine[]> {
  const employeeIds = [...new Set(input.allocations.map((row) => row.employeeId))];
  const [attendanceMap, otMap, deductionMap, names] = await Promise.all([
    loadAttendanceMap(employeeIds, input.periodStart, input.periodEnd),
    loadOtByEmployee(employeeIds, input.clientCompanyId, input.periodStart, input.periodEnd),
    loadDeductionsByEmployee(employeeIds, input.clientCompanyId, input.periodStart, input.periodEnd),
    pool.query<{ id: string; legal_name: string }>(`select id, legal_name from employees where id = any($1::uuid[])`, [
      employeeIds,
    ]),
  ]);
  const nameById = new Map(names.rows.map((row) => [row.id, row.legal_name]));

  return input.allocations.map((allocation) =>
    computeLine({
      allocation,
      employeeName: nameById.get(allocation.employeeId) ?? "Unknown",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dim: input.dim,
      attendance: attendanceMap.get(allocation.employeeId) ?? new Map(),
      ot: otMap.get(allocation.employeeId) ?? { staff: 0, bill: 0, ids: [] },
      deduction: deductionMap.get(allocation.employeeId) ?? {
        staff: 0,
        bill: 0,
        note: null,
        breakdown: {},
      },
    }),
  );
}

async function insertPayRunWithItems(input: {
  employerCompanyId: string;
  clientCompanyId: string;
  periodStart: string;
  periodEnd: string;
  generationMode: GenerationMode;
  createdBy: string | null;
  lines: ComputedLine[];
  dim: number;
}): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `select id from pay_runs
     where client_company_id = $1 and employer_company_id = $2
       and period_start = $3::date and period_end = $4::date
     limit 1`,
    [input.clientCompanyId, input.employerCompanyId, input.periodStart, input.periodEnd],
  );
  if (existing.rows[0]) {
    throw new PayrollError("A pay run already exists for this client, employer, and period");
  }

  const id = randomUUID();
  try {
    await db.insert(payRuns).values({
      id,
      employerCompanyId: input.employerCompanyId,
      clientCompanyId: input.clientCompanyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "draft",
      generationMode: input.generationMode,
      createdBy: input.createdBy,
    });
  } catch (error) {
    if (isUnique(error)) throw new PayrollError("A pay run already exists for this client, employer, and period");
    throw error;
  }

  for (const line of input.lines) {
    await db.insert(payRunItems).values({
      id: randomUUID(),
      payRunId: id,
      allocationId: line.allocation.id,
      employeeId: line.allocation.employeeId,
      employeeName: line.employeeName,
      designation: line.allocation.designation,
      staffSalary: money(Number(line.allocation.staffSalary)),
      billRate: money(Number(line.allocation.billRate)),
      currency: line.allocation.currency,
      calendarDays: line.calendarDays,
      paidDays: line.paidDays,
      absentDays: line.absentDays,
      offDays: line.offDays,
      unmarkedDays: line.unmarkedDays,
      grossStaff: money(line.grossStaff),
      lopStaff: money(line.lopStaff),
      otStaff: money(line.otStaff),
      otherDeductStaff: money(line.otherDeductStaff),
      netStaff: money(line.netStaff),
      grossBill: money(line.grossBill),
      lopBill: money(line.lopBill),
      otBill: money(line.otBill),
      otherDeductBill: money(line.otherDeductBill),
      deductionNote: line.deductionNote,
      netBill: money(line.netBill),
      snapshot: {
        formula: "calendar_month_rate_v1",
        daysInMonth: input.dim,
        dailyStaff: money(line.dailyStaff),
        dailyBill: money(line.dailyBill),
        allocationId: line.allocation.id,
        staffSalary: line.allocation.staffSalary,
        billRate: line.allocation.billRate,
        currency: line.allocation.currency,
        joinDate: line.allocation.joinDate,
        resignDate: line.allocation.resignDate,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        paidDays: line.paidDays,
        absentDays: line.absentDays,
        offDays: line.offDays,
        unmarkedDays: line.unmarkedDays,
        otEntryIds: line.otEntryIds,
        otherDeductStaff: money(line.otherDeductStaff),
        otherDeductBill: money(line.otherDeductBill),
        deductionNote: line.deductionNote,
        deductionBreakdown: line.deductionBreakdown,
      },
    });
  }

  return id;
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

async function loadPayRun(id: string): Promise<PayRunRecord | null> {
  const result = await pool.query<{
    id: string;
    employer_company_id: string;
    employer_name: string;
    client_company_id: string;
    client_name: string;
    client_tin_number: string | null;
    client_address: string | null;
    period_start: string;
    period_end: string;
    status: "draft" | "locked";
    generation_mode: GenerationMode;
    invoice_number: string | null;
    salary_sheet_number: string | null;
    locked_at: string | null;
    created_at: string;
  }>(
    `select p.id, p.employer_company_id, emp.legal_name as employer_name,
            p.client_company_id, cli.legal_name as client_name,
            cli.tin_number as client_tin_number,
            cli.registered_address as client_address,
            p.period_start::text, p.period_end::text, p.status,
            coalesce(p.generation_mode, 'employer_client') as generation_mode,
            p.invoice_number,
            p.salary_sheet_number,
            p.locked_at::text, p.created_at::text
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
    passport_number: string | null;
    work_permit_number: string | null;
    staff_salary: string;
    bill_rate: string;
    currency: string;
    calendar_days: number;
    paid_days: number;
    absent_days: number;
    off_days: number;
    unmarked_days: number;
    gross_staff: string;
    lop_staff: string;
    ot_staff: string;
    other_deduct_staff: string;
    net_staff: string;
    gross_bill: string;
    lop_bill: string;
    ot_bill: string;
    other_deduct_bill: string;
    deduction_note: string | null;
    net_bill: string;
  }>(
    `select i.id, i.allocation_id, i.employee_id, i.employee_name, i.designation,
            e.passport_number,
            e.work_permit_number,
            i.staff_salary::text, i.bill_rate::text, i.currency,
            coalesce(i.calendar_days, 0) as calendar_days,
            coalesce(i.paid_days, 0) as paid_days,
            coalesce(i.absent_days, 0) as absent_days,
            coalesce(i.off_days, 0) as off_days,
            coalesce(i.unmarked_days, 0) as unmarked_days,
            coalesce(i.gross_staff, i.staff_salary)::text as gross_staff,
            coalesce(i.lop_staff, 0)::text as lop_staff,
            coalesce(i.ot_staff, 0)::text as ot_staff,
            coalesce(i.other_deduct_staff, 0)::text as other_deduct_staff,
            coalesce(i.net_staff, i.staff_salary)::text as net_staff,
            coalesce(i.gross_bill, i.bill_rate)::text as gross_bill,
            coalesce(i.lop_bill, 0)::text as lop_bill,
            coalesce(i.ot_bill, 0)::text as ot_bill,
            coalesce(i.other_deduct_bill, 0)::text as other_deduct_bill,
            i.deduction_note,
            coalesce(i.net_bill, i.bill_rate)::text as net_bill
     from pay_run_items i
     left join employees e on e.id = i.employee_id
     where i.pay_run_id = $1
     order by i.employee_name`,
    [id],
  );

  let staff = 0;
  let bill = 0;
  let netStaff = 0;
  let netBill = 0;
  let unmarkedDays = 0;
  const mapped = items.rows.map((item) => {
    staff += Number(item.staff_salary);
    bill += Number(item.bill_rate);
    netStaff += Number(item.net_staff);
    netBill += Number(item.net_bill);
    unmarkedDays += Number(item.unmarked_days);
    return {
      id: item.id,
      allocationId: item.allocation_id,
      employeeId: item.employee_id,
      employeeName: item.employee_name,
      designation: item.designation,
      passportNumber: item.passport_number,
      workPermitNumber: item.work_permit_number,
      staffSalary: item.staff_salary,
      billRate: item.bill_rate,
      currency: item.currency,
      calendarDays: Number(item.calendar_days),
      paidDays: Number(item.paid_days),
      absentDays: Number(item.absent_days),
      offDays: Number(item.off_days),
      unmarkedDays: Number(item.unmarked_days),
      grossStaff: item.gross_staff,
      lopStaff: item.lop_staff,
      otStaff: item.ot_staff,
      otherDeductStaff: item.other_deduct_staff,
      netStaff: item.net_staff,
      grossBill: item.gross_bill,
      lopBill: item.lop_bill,
      otBill: item.ot_bill,
      otherDeductBill: item.other_deduct_bill,
      deductionNote: item.deduction_note,
      netBill: item.net_bill,
    };
  });

  const warnings: string[] = [];
  if (unmarkedDays > 0) {
    warnings.push(`${unmarkedDays} unmarked attendance day(s) treated as absent (AB) for LOP`);
  }

  return {
    id: row.id,
    employerCompanyId: row.employer_company_id,
    employerName: row.employer_name,
    clientCompanyId: row.client_company_id,
    clientName: row.client_name,
    clientTinNumber: row.client_tin_number,
    clientAddress: row.client_address,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    generationMode: row.generation_mode,
    invoiceNumber: row.invoice_number,
    salarySheetNumber: row.salary_sheet_number,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    items: mapped,
    totals: {
      staffSalary: money(staff),
      billRate: money(bill),
      netStaff: money(netStaff),
      netBill: money(netBill),
      unmarkedDays,
    },
    warnings,
  };
}

export type PayRunListRecord = Omit<PayRunRecord, "items" | "totals" | "warnings" | "clientTinNumber" | "clientAddress"> & {
  itemCount: number;
  netStaff: string;
  netBill: string;
  balance: string;
};

export async function listPayRuns(filters?: { clientIds?: string[] | null }): Promise<PayRunListRecord[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters?.clientIds) {
    if (!filters.clientIds.length) {
      return [];
    }
    params.push(filters.clientIds);
    where.push(`p.client_company_id = any($${params.length}::uuid[])`);
  }
  const result = await pool.query<{
    id: string;
    employer_company_id: string;
    employer_name: string;
    client_company_id: string;
    client_name: string;
    period_start: string;
    period_end: string;
    status: "draft" | "locked";
    generation_mode: GenerationMode;
    invoice_number: string | null;
    salary_sheet_number: string | null;
    locked_at: string | null;
    created_at: string;
    item_count: number;
    net_staff: string;
    net_bill: string;
  }>(
    `select p.id, p.employer_company_id, emp.legal_name as employer_name,
            p.client_company_id, cli.legal_name as client_name,
            p.period_start::text, p.period_end::text, p.status,
            coalesce(p.generation_mode, 'employer_client') as generation_mode,
            p.invoice_number,
            p.salary_sheet_number,
            p.locked_at::text, p.created_at::text,
            coalesce(agg.item_count, 0)::int as item_count,
            coalesce(agg.net_staff, 0)::text as net_staff,
            coalesce(agg.net_bill, 0)::text as net_bill
     from pay_runs p
     join companies emp on emp.id = p.employer_company_id
     join companies cli on cli.id = p.client_company_id
     left join lateral (
       select count(*)::int as item_count,
              coalesce(sum(i.net_staff), 0) as net_staff,
              coalesce(sum(i.net_bill), 0) as net_bill
       from pay_run_items i
       where i.pay_run_id = p.id
     ) agg on true
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by p.period_start desc, cli.legal_name, emp.legal_name`,
    params,
  );
  return result.rows.map((row) => {
    const netStaff = Number(row.net_staff);
    const netBill = Number(row.net_bill);
    return {
      id: row.id,
      employerCompanyId: row.employer_company_id,
      employerName: row.employer_name,
      clientCompanyId: row.client_company_id,
      clientName: row.client_name,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      generationMode: row.generation_mode,
      invoiceNumber: row.invoice_number,
      salarySheetNumber: row.salary_sheet_number,
      lockedAt: row.locked_at,
      createdAt: row.created_at,
      itemCount: Number(row.item_count),
      netStaff: money(netStaff),
      netBill: money(netBill),
      balance: money(netBill - netStaff),
    };
  });
}

export async function getPayRun(id: string): Promise<PayRunRecord | null> {
  if (!uuidPattern.test(id)) return null;
  return loadPayRun(id);
}

/** Load pay run and assign a durable INV-###### if it does not have one yet. */
export async function getPayRunForPaymentRequest(id: string): Promise<PayRunRecord | null> {
  if (!uuidPattern.test(id)) return null;
  const existing = await loadPayRun(id);
  if (!existing) return null;
  if (!existing.invoiceNumber) {
    await ensurePayRunInvoiceNumber(id);
    return loadPayRun(id);
  }
  return existing;
}

/** Load pay run and assign a durable PAY-###### if it does not have one yet. */
export async function getPayRunForSalarySheet(id: string): Promise<PayRunRecord | null> {
  if (!uuidPattern.test(id)) return null;
  const existing = await loadPayRun(id);
  if (!existing) return null;
  if (!existing.salarySheetNumber) {
    await ensurePayRunSalarySheetNumber(id);
    return loadPayRun(id);
  }
  return existing;
}

export async function listEmployersForClient(clientCompanyId: string): Promise<{ id: string; legalName: string }[]> {
  if (!uuidPattern.test(clientCompanyId)) return [];
  const result = await pool.query<{ id: string; legal_name: string }>(
    `select distinct emp.id, emp.legal_name
     from client_allocations a
     join companies emp on emp.id = a.employer_company_id
     where a.client_company_id = $1 and a.status = 'active'
     order by emp.legal_name`,
    [clientCompanyId],
  );
  return result.rows.map((row) => ({ id: row.id, legalName: row.legal_name }));
}

async function createOneEmployerRun(input: {
  clientCompanyId: string;
  employerCompanyId: string;
  periodStart: string;
  periodEnd: string;
  dim: number;
  generationMode: GenerationMode;
  createdBy: string | null;
  allocations: AllocationRow[];
}): Promise<PayRunRecord> {
  const scoped = input.allocations.filter(
    (row) => row.employerCompanyId === input.employerCompanyId && overlapsPeriod(row, input.periodStart, input.periodEnd),
  );
  if (!scoped.length) throw new PayrollError("No allocations overlap this period for the selected employer");

  const lines = await computeItemsForScope({
    allocations: scoped,
    clientCompanyId: input.clientCompanyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    dim: input.dim,
  });

  const id = await insertPayRunWithItems({
    employerCompanyId: input.employerCompanyId,
    clientCompanyId: input.clientCompanyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generationMode: input.generationMode,
    createdBy: input.createdBy,
    lines,
    dim: input.dim,
  });

  const created = await loadPayRun(id);
  if (!created) throw new PayrollError("Could not create pay run");
  return created;
}

/** Create pay run(s). Always returns `{ payRuns }` (one or many). */
export async function createPayRuns(input: {
  mode?: unknown;
  clientCompanyId: unknown;
  employerCompanyId?: unknown;
  periodStart: unknown;
  periodEnd: unknown;
  createdBy?: string | null;
}): Promise<{ payRuns: PayRunRecord[] }> {
  const modeRaw = typeof input.mode === "string" ? input.mode.trim() : "employer_client";
  const mode: GenerationMode =
    modeRaw === "client_batch" ? "client_batch" : modeRaw === "employer_client" ? "employer_client" : (() => {
      throw new PayrollError("Mode must be client_batch or employer_client");
    })();

  const clientCompanyId =
    typeof input.clientCompanyId === "string" && uuidPattern.test(input.clientCompanyId.trim())
      ? input.clientCompanyId.trim()
      : (() => {
          throw new PayrollError("Select a client company");
        })();
  const periodStart = dateOnly(input.periodStart, "Period start");
  const periodEnd = dateOnly(input.periodEnd, "Period end");
  const { dim } = assertFullCalendarMonth(periodStart, periodEnd);

  const client = await db.select().from(companies).where(eq(companies.id, clientCompanyId)).limit(1);
  if (!client[0] || client[0].kind !== "client") throw new PayrollError("Select a client company");

  // Include ended allocations that still overlap the month (mid-period resign/terminate/lost).
  const allocations = await db
    .select()
    .from(clientAllocations)
    .where(eq(clientAllocations.clientCompanyId, clientCompanyId));
  if (!allocations.length) throw new PayrollError("No allocations for this client");

  const inPeriod = allocations.filter((row) => overlapsPeriod(row, periodStart, periodEnd));
  if (!inPeriod.length) throw new PayrollError("No allocations overlap this period");

  if (mode === "employer_client") {
    const employerCompanyId =
      typeof input.employerCompanyId === "string" && uuidPattern.test(input.employerCompanyId.trim())
        ? input.employerCompanyId.trim()
        : (() => {
            throw new PayrollError("Select an employer company");
          })();
    const employer = await db.select().from(companies).where(eq(companies.id, employerCompanyId)).limit(1);
    if (!employer[0] || employer[0].kind !== "employer") throw new PayrollError("Select an employer company");

    const run = await createOneEmployerRun({
      clientCompanyId,
      employerCompanyId,
      periodStart,
      periodEnd,
      dim,
      generationMode: mode,
      createdBy: input.createdBy ?? null,
      allocations: inPeriod,
    });
    return { payRuns: [run] };
  }

  const employerIds = [...new Set(inPeriod.map((row) => row.employerCompanyId))];
  const payRunsOut: PayRunRecord[] = [];
  for (const employerCompanyId of employerIds) {
    payRunsOut.push(
      await createOneEmployerRun({
        clientCompanyId,
        employerCompanyId,
        periodStart,
        periodEnd,
        dim,
        generationMode: "client_batch",
        createdBy: input.createdBy ?? null,
        allocations: inPeriod,
      }),
    );
  }
  return { payRuns: payRunsOut };
}

/** @deprecated Prefer createPayRuns — kept for older call sites expecting a single run. */
export async function createPayRun(input: {
  clientCompanyId: string;
  employerCompanyId?: string | null;
  periodStart: string;
  periodEnd: string;
  createdBy?: string | null;
  mode?: GenerationMode;
}): Promise<PayRunRecord> {
  const mode = input.mode ?? (input.employerCompanyId ? "employer_client" : "client_batch");
  const result = await createPayRuns({
    mode,
    clientCompanyId: input.clientCompanyId,
    employerCompanyId: input.employerCompanyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    createdBy: input.createdBy,
  });
  if (mode === "client_batch" && result.payRuns.length > 1) {
    return result.payRuns[0];
  }
  const run = result.payRuns[0];
  if (!run) throw new PayrollError("Could not create pay run");
  return run;
}

export async function recalculatePayRun(id: string): Promise<PayRunRecord> {
  if (!uuidPattern.test(id)) throw new PayrollError("Pay run not found");
  const existing = await loadPayRun(id);
  if (!existing) throw new PayrollError("Pay run not found");
  if (existing.status === "locked") throw new PayrollError("Locked pay runs cannot be recalculated");

  const { dim } = assertFullCalendarMonth(existing.periodStart, existing.periodEnd);
  const allocations = await db
    .select()
    .from(clientAllocations)
    .where(
      and(
        eq(clientAllocations.clientCompanyId, existing.clientCompanyId),
        eq(clientAllocations.employerCompanyId, existing.employerCompanyId),
      ),
    );
  const inPeriod = allocations.filter((row) => overlapsPeriod(row, existing.periodStart, existing.periodEnd));
  if (!inPeriod.length) throw new PayrollError("No allocations overlap this period for the selected employer");

  const lines = await computeItemsForScope({
    allocations: inPeriod,
    clientCompanyId: existing.clientCompanyId,
    periodStart: existing.periodStart,
    periodEnd: existing.periodEnd,
    dim,
  });

  await db.delete(payRunItems).where(eq(payRunItems.payRunId, id));
  for (const line of lines) {
    await db.insert(payRunItems).values({
      id: randomUUID(),
      payRunId: id,
      allocationId: line.allocation.id,
      employeeId: line.allocation.employeeId,
      employeeName: line.employeeName,
      designation: line.allocation.designation,
      staffSalary: money(Number(line.allocation.staffSalary)),
      billRate: money(Number(line.allocation.billRate)),
      currency: line.allocation.currency,
      calendarDays: line.calendarDays,
      paidDays: line.paidDays,
      absentDays: line.absentDays,
      offDays: line.offDays,
      unmarkedDays: line.unmarkedDays,
      grossStaff: money(line.grossStaff),
      lopStaff: money(line.lopStaff),
      otStaff: money(line.otStaff),
      otherDeductStaff: money(line.otherDeductStaff),
      netStaff: money(line.netStaff),
      grossBill: money(line.grossBill),
      lopBill: money(line.lopBill),
      otBill: money(line.otBill),
      otherDeductBill: money(line.otherDeductBill),
      deductionNote: line.deductionNote,
      netBill: money(line.netBill),
      snapshot: {
        formula: "calendar_month_rate_v1",
        daysInMonth: dim,
        dailyStaff: money(line.dailyStaff),
        dailyBill: money(line.dailyBill),
        allocationId: line.allocation.id,
        staffSalary: line.allocation.staffSalary,
        billRate: line.allocation.billRate,
        currency: line.allocation.currency,
        joinDate: line.allocation.joinDate,
        resignDate: line.allocation.resignDate,
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        paidDays: line.paidDays,
        absentDays: line.absentDays,
        offDays: line.offDays,
        unmarkedDays: line.unmarkedDays,
        otEntryIds: line.otEntryIds,
        otherDeductStaff: money(line.otherDeductStaff),
        otherDeductBill: money(line.otherDeductBill),
        deductionNote: line.deductionNote,
        deductionBreakdown: line.deductionBreakdown,
      },
    });
  }

  const updated = await loadPayRun(id);
  if (!updated) throw new PayrollError("Could not recalculate pay run");
  return updated;
}

export async function deletePayRun(id: string): Promise<boolean> {
  if (!uuidPattern.test(id)) return false;
  const existing = await loadPayRun(id);
  if (!existing) return false;
  if (existing.status === "locked") throw new PayrollError("Locked pay runs cannot be deleted");
  await db.delete(payRuns).where(eq(payRuns.id, id));
  return true;
}

export async function lockPayRun(id: string): Promise<PayRunRecord> {
  const existing = await loadPayRun(id);
  if (!existing) throw new PayrollError("Pay run not found");
  if (existing.status === "locked") throw new PayrollError("Pay run is already locked");
  await db.update(payRuns).set({ status: "locked", lockedAt: new Date() }).where(eq(payRuns.id, id));
  const locked = await loadPayRun(id);
  if (!locked) throw new PayrollError("Could not lock pay run");
  return locked;
}
