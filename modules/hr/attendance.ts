import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { attendanceRecords, employees } from "../../lib/schema.ts";

export class AttendanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceError";
  }
}

export type AttendanceStatus = "P" | "AB" | "OD";

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceTotals = {
  P: number;
  AB: number;
  OD: number;
  all: number;
};

export type AttendanceListResult = {
  records: AttendanceRecord[];
  totals: AttendanceTotals;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  company_id: string;
  company_name: string;
  attendance_date: string;
  status: AttendanceStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const statuses = new Set<AttendanceStatus>(["P", "AB", "OD"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateOnly(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AttendanceError(`${label} must be YYYY-MM-DD`);
  return text;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function statusOf(value: unknown): AttendanceStatus {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (text === "PRESENT") return "P";
  if (text === "ABSENT") return "AB";
  if (text === "OFF" || text === "OFFDAY" || text === "OFF_DAY") return "OD";
  if (!statuses.has(text as AttendanceStatus)) {
    throw new AttendanceError("Status must be P (present), AB (absent), or OD (off day)");
  }
  return text as AttendanceStatus;
}

function uuidOf(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(text)) throw new AttendanceError(`${label} is required`);
  return text;
}

function mapRow(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    companyId: row.company_id,
    companyName: row.company_name,
    attendanceDate: row.attendance_date,
    status: row.status,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getMapped(id: string): Promise<AttendanceRecord | null> {
  const result = await pool.query<AttendanceRow>(
    `select
      attendance_records.id,
      attendance_records.employee_id,
      employees.legal_name as employee_name,
      employees.company_id,
      companies.legal_name as company_name,
      attendance_records.attendance_date::text,
      attendance_records.status,
      attendance_records.note,
      attendance_records.created_by,
      attendance_records.created_at::text,
      attendance_records.updated_at::text
    from attendance_records
    inner join employees on employees.id = attendance_records.employee_id
    inner join companies on companies.id = employees.company_id
    where attendance_records.id = $1
    limit 1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function listAttendance(filters?: {
  from?: string | null;
  to?: string | null;
  status?: string | null;
  employeeId?: string | null;
  companyId?: string | null;
  q?: string | null;
}): Promise<AttendanceListResult> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replace("?", `$${params.length}`));
  };

  if (filters?.from) add("attendance_records.attendance_date >= ?", dateOnly(filters.from, "From date"));
  if (filters?.to) add("attendance_records.attendance_date <= ?", dateOnly(filters.to, "To date"));
  if (filters?.status) add("attendance_records.status = ?", statusOf(filters.status));
  if (filters?.employeeId && uuidPattern.test(filters.employeeId)) add("attendance_records.employee_id = ?", filters.employeeId);
  if (filters?.companyId && uuidPattern.test(filters.companyId)) add("employees.company_id = ?", filters.companyId);
  if (filters?.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    params.push(q);
    const a = params.length;
    params.push(q);
    const b = params.length;
    params.push(q);
    const c = params.length;
    clauses.push(
      `(employees.legal_name ilike $${a} or companies.legal_name ilike $${b} or coalesce(attendance_records.note, '') ilike $${c})`,
    );
  }

  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const result = await pool.query<AttendanceRow>(
    `select
      attendance_records.id,
      attendance_records.employee_id,
      employees.legal_name as employee_name,
      employees.company_id,
      companies.legal_name as company_name,
      attendance_records.attendance_date::text,
      attendance_records.status,
      attendance_records.note,
      attendance_records.created_by,
      attendance_records.created_at::text,
      attendance_records.updated_at::text
    from attendance_records
    inner join employees on employees.id = attendance_records.employee_id
    inner join companies on companies.id = employees.company_id
    ${where}
    order by attendance_records.attendance_date desc, employees.legal_name
    limit 500`,
    params,
  );

  const totals: AttendanceTotals = { P: 0, AB: 0, OD: 0, all: 0 };
  for (const row of result.rows) {
    totals[row.status] += 1;
    totals.all += 1;
  }
  return { records: result.rows.map(mapRow), totals };
}

export async function getAttendance(id: string): Promise<AttendanceRecord | null> {
  if (!uuidPattern.test(id)) return null;
  return getMapped(id);
}

export async function createAttendance(
  input: Record<string, unknown>,
  createdBy: string | null,
): Promise<AttendanceRecord> {
  const employeeId = uuidOf(input.employeeId, "Employee");
  const attendanceDate = dateOnly(input.attendanceDate, "Date");
  const status = statusOf(input.status);
  const note = optionalText(input.note);

  const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee[0]) throw new AttendanceError("Employee not found");

  const id = randomUUID();
  try {
    await db.insert(attendanceRecords).values({
      id,
      employeeId,
      attendanceDate,
      status,
      note,
      createdBy,
    });
  } catch (error) {
    if (isUnique(error)) throw new AttendanceError("Attendance for this employee and date already exists — edit that row instead");
    throw error;
  }
  const created = await getMapped(id);
  if (!created) throw new AttendanceError("Could not save attendance");
  return created;
}

export async function updateAttendance(id: string, input: Record<string, unknown>): Promise<AttendanceRecord | null> {
  if (!uuidPattern.test(id)) return null;
  const existing = await getMapped(id);
  if (!existing) return null;

  const employeeId = input.employeeId === undefined ? existing.employeeId : uuidOf(input.employeeId, "Employee");
  const attendanceDate =
    input.attendanceDate === undefined ? existing.attendanceDate : dateOnly(input.attendanceDate, "Date");
  const status = input.status === undefined ? existing.status : statusOf(input.status);
  const note = input.note === undefined ? existing.note : optionalText(input.note);

  const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee[0]) throw new AttendanceError("Employee not found");

  try {
    await db
      .update(attendanceRecords)
      .set({ employeeId, attendanceDate, status, note, updatedAt: new Date() })
      .where(eq(attendanceRecords.id, id));
  } catch (error) {
    if (isUnique(error)) throw new AttendanceError("Attendance for this employee and date already exists");
    throw error;
  }
  return getMapped(id);
}

export async function deleteAttendance(id: string): Promise<boolean> {
  if (!uuidPattern.test(id)) return false;
  const result = await db.delete(attendanceRecords).where(eq(attendanceRecords.id, id)).returning({ id: attendanceRecords.id });
  return Boolean(result[0]);
}

/** Upsert many employees for one date (manual day sheet). */
export async function upsertAttendanceDay(input: {
  attendanceDate: unknown;
  status: unknown;
  employeeIds: unknown;
  note?: unknown;
  createdBy: string | null;
}): Promise<{ saved: number; records: AttendanceRecord[] }> {
  const attendanceDate = dateOnly(input.attendanceDate, "Date");
  const status = statusOf(input.status);
  const note = optionalText(input.note);
  if (!Array.isArray(input.employeeIds) || input.employeeIds.length === 0) {
    throw new AttendanceError("Select at least one employee");
  }
  const employeeIds = [...new Set(input.employeeIds.map((value) => uuidOf(value, "Employee")))];
  if (employeeIds.length > 200) throw new AttendanceError("Too many employees in one save");

  const savedIds: string[] = [];
  for (const employeeId of employeeIds) {
    const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!employee[0]) throw new AttendanceError("Employee not found");

    const existing = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.attendanceDate, attendanceDate)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(attendanceRecords)
        .set({ status, note, updatedAt: new Date() })
        .where(eq(attendanceRecords.id, existing[0].id));
      savedIds.push(existing[0].id);
    } else {
      const id = randomUUID();
      await db.insert(attendanceRecords).values({
        id,
        employeeId,
        attendanceDate,
        status,
        note,
        createdBy: input.createdBy,
      });
      savedIds.push(id);
    }
  }

  const records: AttendanceRecord[] = [];
  for (const id of savedIds) {
    const row = await getMapped(id);
    if (row) records.push(row);
  }
  return { saved: records.length, records };
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export type MonthDayStatus = AttendanceStatus | "";

export type MonthSheetRow = {
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  days: Record<string, MonthDayStatus>;
  present: number;
  absent: number;
  offDay: number;
};

export type MonthSheetResult = {
  year: number;
  month: number;
  daysInMonth: number;
  rows: MonthSheetRow[];
};

export async function getMonthSheet(input: {
  year: number;
  month: number;
  companyId?: string | null;
  clientCompanyId?: string | null;
  q?: string | null;
}): Promise<MonthSheetResult> {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AttendanceError("Year is invalid");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AttendanceError("Month is invalid");
  const dim = daysInMonth(year, month);
  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(dim)}`;

  const empClauses: string[] = [];
  const empParams: unknown[] = [];
  const employerId = input.companyId && uuidPattern.test(input.companyId) ? input.companyId : null;
  const clientId =
    input.clientCompanyId && uuidPattern.test(input.clientCompanyId) ? input.clientCompanyId : null;

  // Employer / client filters use the allocation link for the selected month
  // (same employer × client placement), not only employees.company_id.
  if (employerId || clientId) {
    empParams.push(from);
    const fromIdx = empParams.length;
    empParams.push(to);
    const toIdx = empParams.length;
    const allocParts = [
      "a.employee_id = employees.id",
      `a.join_date <= $${toIdx}::date`,
      `(a.resign_date is null or a.resign_date >= $${fromIdx}::date)`,
    ];
    if (employerId) {
      empParams.push(employerId);
      allocParts.push(`a.employer_company_id = $${empParams.length}`);
    }
    if (clientId) {
      empParams.push(clientId);
      allocParts.push(`a.client_company_id = $${empParams.length}`);
    }
    empClauses.push(`exists (select 1 from client_allocations a where ${allocParts.join(" and ")})`);
  }
  if (input.q?.trim()) {
    empParams.push(`%${input.q.trim()}%`);
    empClauses.push(`employees.legal_name ilike $${empParams.length}`);
  }
  const empWhere = empClauses.length ? `where ${empClauses.join(" and ")}` : "";
  const empResult = await pool.query<{
    id: string;
    legal_name: string;
    company_id: string;
    company_name: string;
  }>(
    `select employees.id, employees.legal_name, employees.company_id, companies.legal_name as company_name
     from employees
     inner join companies on companies.id = employees.company_id
     ${empWhere}
     order by employees.legal_name
     limit 2000`,
    empParams,
  );

  const attResult = await pool.query<{
    employee_id: string;
    attendance_date: string;
    status: AttendanceStatus;
  }>(
    `select employee_id, attendance_date::text, status
     from attendance_records
     where attendance_date >= $1 and attendance_date <= $2`,
    [from, to],
  );

  const byEmployee = new Map<string, Map<number, AttendanceStatus>>();
  for (const row of attResult.rows) {
    const day = Number(row.attendance_date.slice(8, 10));
    if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, new Map());
    byEmployee.get(row.employee_id)!.set(day, row.status);
  }

  const rows: MonthSheetRow[] = empResult.rows.map((emp) => {
    const map = byEmployee.get(emp.id) ?? new Map();
    const days: Record<string, MonthDayStatus> = {};
    let present = 0;
    let absent = 0;
    let offDay = 0;
    for (let day = 1; day <= dim; day++) {
      const status = map.get(day) ?? "";
      days[String(day)] = status;
      if (status === "P") present += 1;
      if (status === "AB") absent += 1;
      if (status === "OD") offDay += 1;
    }
    return {
      employeeId: emp.id,
      employeeName: emp.legal_name,
      companyId: emp.company_id,
      companyName: emp.company_name,
      days,
      present,
      absent,
      offDay,
    };
  });

  return { year, month, daysInMonth: dim, rows };
}

export async function saveEmployeeMonth(input: {
  employeeId: unknown;
  year: unknown;
  month: unknown;
  days: unknown;
  createdBy: string | null;
}): Promise<MonthSheetRow> {
  const employeeId = uuidOf(input.employeeId, "Employee");
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AttendanceError("Year is invalid");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AttendanceError("Month is invalid");
  const dim = daysInMonth(year, month);
  if (!input.days || typeof input.days !== "object" || Array.isArray(input.days)) {
    throw new AttendanceError("Days map is required");
  }
  const daysMap = input.days as Record<string, unknown>;

  const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee[0]) throw new AttendanceError("Employee not found");

  for (let day = 1; day <= dim; day++) {
    const key = String(day);
    const raw = daysMap[key];
    const attendanceDate = `${year}-${pad2(month)}-${pad2(day)}`;
    const existing = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.attendanceDate, attendanceDate)))
      .limit(1);

    const blank = raw === undefined || raw === null || String(raw).trim() === "";
    if (blank) {
      if (existing[0]) {
        await db.delete(attendanceRecords).where(eq(attendanceRecords.id, existing[0].id));
      }
      continue;
    }
    const status = statusOf(raw);
    if (existing[0]) {
      await db
        .update(attendanceRecords)
        .set({ status, updatedAt: new Date() })
        .where(eq(attendanceRecords.id, existing[0].id));
    } else {
      await db.insert(attendanceRecords).values({
        id: randomUUID(),
        employeeId,
        attendanceDate,
        status,
        note: null,
        createdBy: input.createdBy,
      });
    }
  }

  const sheet = await getMonthSheet({ year, month, companyId: employee[0].companyId });
  const row = sheet.rows.find((item) => item.employeeId === employeeId);
  if (!row) throw new AttendanceError("Could not reload month row");
  return row;
}

export async function saveEmployeeMonthBulk(input: {
  year: unknown;
  month: unknown;
  employees: unknown;
  createdBy: string | null;
}): Promise<{ saved: number; rows: MonthSheetRow[] }> {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AttendanceError("Year is invalid");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AttendanceError("Month is invalid");
  if (!Array.isArray(input.employees) || input.employees.length === 0) {
    throw new AttendanceError("Select at least one employee month to save");
  }
  if (input.employees.length > 200) throw new AttendanceError("Too many employees in one save (max 200)");

  const rows: MonthSheetRow[] = [];
  for (const entry of input.employees) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AttendanceError("Each employee entry must be an object");
    }
    const item = entry as Record<string, unknown>;
    rows.push(
      await saveEmployeeMonth({
        employeeId: item.employeeId,
        year,
        month,
        days: item.days,
        createdBy: input.createdBy,
      }),
    );
  }
  return { saved: rows.length, rows };
}

export type PeriodSummaryRow = {
  employeeId: string;
  employeeName: string;
  employerCompanyId: string;
  employerName: string;
  clientCompanyId: string;
  allocationId: string;
  joinDate: string;
  resignDate: string | null;
  present: number;
  absent: number;
  offDay: number;
  unmarked: number;
  calendarDays: number;
};

export type PeriodSummaryResult = {
  from: string;
  to: string;
  rows: PeriodSummaryRow[];
  totals: { present: number; absent: number; offDay: number; unmarked: number; employees: number };
};

/** Per-allocation attendance counts for a pay period (client ± employer). */
export async function getPeriodSummary(input: {
  clientCompanyId: unknown;
  employerCompanyId?: unknown;
  from: unknown;
  to: unknown;
}): Promise<PeriodSummaryResult> {
  const clientCompanyId = uuidOf(input.clientCompanyId, "Client");
  const from = dateOnly(input.from, "From date");
  const to = dateOnly(input.to, "To date");
  if (to < from) throw new AttendanceError("To date must be on or after from date");
  const employerCompanyId =
    input.employerCompanyId && String(input.employerCompanyId).trim()
      ? uuidOf(input.employerCompanyId, "Employer")
      : null;

  const params: unknown[] = [clientCompanyId, from, to];
  let employerClause = "";
  if (employerCompanyId) {
    params.push(employerCompanyId);
    employerClause = `and a.employer_company_id = $${params.length}`;
  }

  const allocResult = await pool.query<{
    allocation_id: string;
    employee_id: string;
    employee_name: string;
    employer_company_id: string;
    employer_name: string;
    client_company_id: string;
    join_date: string;
    resign_date: string | null;
  }>(
    `select a.id as allocation_id, a.employee_id, e.legal_name as employee_name,
            a.employer_company_id, emp.legal_name as employer_name,
            a.client_company_id, a.join_date::text, a.resign_date::text
     from client_allocations a
     join employees e on e.id = a.employee_id
     join companies emp on emp.id = a.employer_company_id
     where a.client_company_id = $1
       and a.join_date <= $3::date
       and (a.resign_date is null or a.resign_date >= $2::date)
       ${employerClause}
     order by e.legal_name`,
    params,
  );

  const attResult = await pool.query<{
    employee_id: string;
    attendance_date: string;
    status: AttendanceStatus;
  }>(
    `select employee_id, attendance_date::text, status
     from attendance_records
     where attendance_date >= $1::date and attendance_date <= $2::date`,
    [from, to],
  );

  const byEmployee = new Map<string, Map<string, AttendanceStatus>>();
  for (const row of attResult.rows) {
    if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, new Map());
    byEmployee.get(row.employee_id)!.set(row.attendance_date, row.status);
  }

  const rows: PeriodSummaryRow[] = [];
  const totals = { present: 0, absent: 0, offDay: 0, unmarked: 0, employees: 0 };

  for (const alloc of allocResult.rows) {
    const windowStart = alloc.join_date > from ? alloc.join_date : from;
    const windowEnd =
      alloc.resign_date && alloc.resign_date < to ? alloc.resign_date : to;
    if (windowEnd < windowStart) continue;

    const map = byEmployee.get(alloc.employee_id) ?? new Map();
    let present = 0;
    let absent = 0;
    let offDay = 0;
    let unmarked = 0;
    let calendarDays = 0;

    const cursor = new Date(`${windowStart}T00:00:00Z`);
    const end = new Date(`${windowEnd}T00:00:00Z`);
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      calendarDays += 1;
      const status = map.get(iso);
      if (status === "P") present += 1;
      else if (status === "AB") absent += 1;
      else if (status === "OD") offDay += 1;
      else unmarked += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    totals.present += present;
    totals.absent += absent;
    totals.offDay += offDay;
    totals.unmarked += unmarked;
    totals.employees += 1;

    rows.push({
      employeeId: alloc.employee_id,
      employeeName: alloc.employee_name,
      employerCompanyId: alloc.employer_company_id,
      employerName: alloc.employer_name,
      clientCompanyId: alloc.client_company_id,
      allocationId: alloc.allocation_id,
      joinDate: alloc.join_date,
      resignDate: alloc.resign_date,
      present,
      absent,
      offDay,
      unmarked,
      calendarDays,
    });
  }

  return { from, to, rows, totals };
}

export type AllocationEndReason = "resign" | "terminate" | "lost" | "transfer_out";

export type AllocationEndAttendanceResult = {
  clearedAfterEnd: number;
  markedAbsent: number;
  reason: AllocationEndReason;
  endDate: string;
  absentFrom: string | null;
};

function eachIsoDate(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Attendance side-effects when ending a client allocation:
 * - Always clear days after endDate (no pay / no presence after last day).
 * - lost: mark AB from absentFrom..endDate (overwrite).
 * - resign / terminate / transfer_out: leave historical days; only clear after end.
 */
export async function applyAllocationEndAttendance(input: {
  employeeId: string;
  endDate: string;
  reason: AllocationEndReason;
  absentFrom?: string | null;
  createdBy?: string | null;
}): Promise<AllocationEndAttendanceResult> {
  const employeeId = uuidOf(input.employeeId, "Employee");
  const endDate = dateOnly(input.endDate, "End date");
  const reason = input.reason;
  if (!["resign", "terminate", "lost", "transfer_out"].includes(reason)) {
    throw new AttendanceError("Invalid end reason");
  }

  const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee[0]) throw new AttendanceError("Employee not found");

  const clearResult = await pool.query(
    `delete from attendance_records
     where employee_id = $1 and attendance_date > $2::date`,
    [employeeId, endDate],
  );
  const clearedAfterEnd = clearResult.rowCount ?? 0;

  let markedAbsent = 0;
  let absentFrom: string | null = null;

  if (reason === "lost") {
    absentFrom = input.absentFrom ? dateOnly(input.absentFrom, "Absent from") : endDate;
    if (absentFrom > endDate) throw new AttendanceError("Absent-from date cannot be after end date");
    for (const attendanceDate of eachIsoDate(absentFrom, endDate)) {
      const existing = await db
        .select()
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.attendanceDate, attendanceDate)))
        .limit(1);
      if (existing[0]) {
        if (existing[0].status !== "AB") {
          await db
            .update(attendanceRecords)
            .set({ status: "AB", note: "Auto: lost / absconded", updatedAt: new Date() })
            .where(eq(attendanceRecords.id, existing[0].id));
          markedAbsent += 1;
        }
      } else {
        await db.insert(attendanceRecords).values({
          id: randomUUID(),
          employeeId,
          attendanceDate,
          status: "AB",
          note: "Auto: lost / absconded",
          createdBy: input.createdBy ?? null,
        });
        markedAbsent += 1;
      }
    }
  }

  return { clearedAfterEnd, markedAbsent, reason, endDate, absentFrom };
}
