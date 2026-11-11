import { pool } from "../../lib/db.ts";
import { hashPassword, verifyPassword } from "../access/access.ts";
import { listAllocations } from "../hr/allocations.ts";
import { getEmployee } from "../hr/employees.ts";
import { normalizePhone } from "./accounts.ts";

export class EmployeeSelfError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "EmployeeSelfError";
    this.status = status;
  }
}

export type ExpiryWarning = {
  field: string;
  label: string;
  date: string;
  daysRemaining: number;
  level: "ok" | "warn" | "critical";
};

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const target = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function warningFor(field: string, label: string, date: string | null): ExpiryWarning | null {
  if (!date) return null;
  const days = daysUntil(date);
  if (days === null) return null;
  let level: ExpiryWarning["level"] = "ok";
  if (days < 0) level = "critical";
  else if (days <= 14) level = "critical";
  else if (days <= 45) level = "warn";
  return { field, label, date, daysRemaining: days, level };
}

function expiryWarnings(employee: Awaited<ReturnType<typeof getEmployee>>): ExpiryWarning[] {
  if (!employee) return [];
  return [
    warningFor("workPermit", "Work permit", employee.expiresOn),
    warningFor("passport", "Passport", employee.passportExpiry),
    warningFor("workVisa", "Work visa", employee.workVisaExpiry),
    warningFor("insurance", "Insurance", employee.insuranceExpiry),
    warningFor("medical", "Medical", employee.medicalExpiry),
    warningFor("contract", "Contract", employee.contractExpiry),
  ].filter((item): item is ExpiryWarning => Boolean(item));
}

function monthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new EmployeeSelfError("Month must be YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const end = last.toISOString().slice(0, 10);
  return { start, end };
}

export async function getDashboard(employeeId: string) {
  const employee = await getEmployee(employeeId);
  if (!employee) throw new EmployeeSelfError("Profile not found", 404);

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const { start, end } = monthBounds(month);

  const [attendance, salary, allocations] = await Promise.all([
    pool.query<{ status: string; count: string }>(
      `select status, count(*)::text as count
       from attendance_records
       where employee_id = $1 and attendance_date between $2::date and $3::date
       group by status`,
      [employeeId, start, end],
    ),
    pool.query<{ net_staff: string; period_start: string; period_end: string }>(
      `select pri.net_staff::text, pr.period_start::text, pr.period_end::text
       from pay_run_items pri
       join pay_runs pr on pr.id = pri.pay_run_id
       where pri.employee_id = $1 and pr.status = 'locked'
       order by pr.period_start desc
       limit 1`,
      [employeeId],
    ),
    listAllocations({ employeeId, status: "active" }),
  ]);

  const totals = { P: 0, AB: 0, OD: 0, unmarked: 0 };
  for (const row of attendance.rows) {
    if (row.status === "P" || row.status === "AB" || row.status === "OD") totals[row.status] = Number(row.count);
  }

  const dim = Number(end.slice(8, 10));
  const marked = totals.P + totals.AB + totals.OD;
  totals.unmarked = Math.max(0, dim - marked);

  const activeAllocation = allocations[0] ?? null;
  const warnings = expiryWarnings(employee).filter((w) => w.level !== "ok");

  return {
    xpat: {
      status: employee.xpatStatus,
      stateName: employee.xpatStateName,
      syncedAt: employee.xpatSyncedAt,
      workPermitNumber: employee.workPermitNumber,
      expiresOn: employee.expiresOn,
      warnings,
    },
    attendanceThisMonth: { month, ...totals, calendarDays: dim },
    lastSalary: salary.rows[0]
      ? {
          netStaff: salary.rows[0].net_staff,
          periodStart: salary.rows[0].period_start,
          periodEnd: salary.rows[0].period_end,
        }
      : null,
    currentClient: activeAllocation
      ? {
          clientName: activeAllocation.clientName,
          designation: activeAllocation.designation,
          workSite: employee.workSite,
          joinDate: activeAllocation.joinDate,
        }
      : null,
  };
}

export async function getAttendanceMonth(employeeId: string, month: string) {
  const { start, end } = monthBounds(month);
  const employee = await getEmployee(employeeId);
  if (!employee) throw new EmployeeSelfError("Profile not found", 404);

  const result = await pool.query<{ attendance_date: string; status: string }>(
    `select attendance_date::text, status
     from attendance_records
     where employee_id = $1 and attendance_date between $2::date and $3::date
     order by attendance_date`,
    [employeeId, start, end],
  );

  const byDay = new Map(result.rows.map((row) => [row.attendance_date, row.status]));
  const days: { date: string; status: string | null }[] = [];
  const dim = Number(end.slice(8, 10));
  for (let d = 1; d <= dim; d += 1) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    days.push({ date, status: byDay.get(date) ?? null });
  }

  return { month, days, employeeName: employee.legalName };
}

export async function listSalaryHistory(employeeId: string) {
  const result = await pool.query<{
    pay_run_id: string;
    period_start: string;
    period_end: string;
    net_staff: string;
    gross_staff: string;
    ot_staff: string;
    other_deduct_staff: string;
    lop_staff: string;
    staff_salary: string;
    currency: string;
    client_name: string;
  }>(
    `select pri.pay_run_id, pr.period_start::text, pr.period_end::text,
            pri.net_staff::text, pri.gross_staff::text, pri.ot_staff::text,
            pri.other_deduct_staff::text, pri.lop_staff::text, pri.staff_salary::text,
            pri.currency, c.legal_name as client_name
     from pay_run_items pri
     join pay_runs pr on pr.id = pri.pay_run_id
     join companies c on c.id = pr.client_company_id
     where pri.employee_id = $1 and pr.status = 'locked'
     order by pr.period_start desc`,
    [employeeId],
  );
  return result.rows.map((row) => ({
    payRunId: row.pay_run_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    clientName: row.client_name,
    currency: row.currency,
    basicSalary: row.staff_salary,
    grossStaff: row.gross_staff,
    otStaff: row.ot_staff,
    deductions: row.other_deduct_staff,
    lopStaff: row.lop_staff,
    netStaff: row.net_staff,
  }));
}

export async function getSalaryMonth(employeeId: string, month: string) {
  const { start } = monthBounds(month);
  const result = await pool.query<{ pay_run_id: string }>(
    `select pri.pay_run_id
     from pay_run_items pri
     join pay_runs pr on pr.id = pri.pay_run_id
     where pri.employee_id = $1 and pr.status = 'locked' and pr.period_start = $2::date
     limit 1`,
    [employeeId, start],
  );
  const payRunId = result.rows[0]?.pay_run_id;
  if (!payRunId) return null;
  const history = await listSalaryHistory(employeeId);
  return history.find((row) => row.payRunId === payRunId) ?? null;
}

export async function getPayslipLine(employeeId: string, payRunId: string) {
  const result = await pool.query<{
    id: string;
    employee_name: string;
    designation: string | null;
    staff_salary: string;
    gross_staff: string;
    ot_staff: string;
    other_deduct_staff: string;
    lop_staff: string;
    net_staff: string;
    currency: string;
    period_start: string;
    period_end: string;
    client_name: string;
    employer_name: string;
    paid_days: number;
    absent_days: number;
    off_days: number;
    snapshot: Record<string, unknown>;
  }>(
    `select pri.id, pri.employee_name, pri.designation,
            pri.staff_salary::text, pri.gross_staff::text, pri.ot_staff::text,
            pri.other_deduct_staff::text, pri.lop_staff::text, pri.net_staff::text,
            pri.currency, pr.period_start::text, pr.period_end::text,
            cli.legal_name as client_name, emp.legal_name as employer_name,
            pri.paid_days, pri.absent_days, pri.off_days, pri.snapshot
     from pay_run_items pri
     join pay_runs pr on pr.id = pri.pay_run_id
     join companies cli on cli.id = pr.client_company_id
     join companies emp on emp.id = pr.employer_company_id
     where pri.employee_id = $1 and pri.pay_run_id = $2 and pr.status = 'locked'`,
    [employeeId, payRunId],
  );
  const row = result.rows[0];
  if (!row) throw new EmployeeSelfError("Payslip not found for that period", 404);
  return {
    id: row.id,
    employeeName: row.employee_name,
    designation: row.designation,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    employerName: row.employer_name,
    clientName: row.client_name,
    currency: row.currency,
    basicSalary: row.staff_salary,
    allowancesGross: row.gross_staff,
    otPay: row.ot_staff,
    deductions: row.other_deduct_staff,
    lop: row.lop_staff,
    netPay: row.net_staff,
    paidDays: row.paid_days,
    absentDays: row.absent_days,
    offDays: row.off_days,
    snapshot: row.snapshot,
  };
}

export async function getXpatView(employeeId: string) {
  const employee = await getEmployee(employeeId);
  if (!employee) throw new EmployeeSelfError("Profile not found", 404);
  const allocations = await listAllocations({ employeeId });
  const active = allocations.find((row) => row.status === "active") ?? null;

  const clientContact = active
    ? await pool.query<{ phone: string | null; email: string | null; legal_name: string }>(
        `select phone, email, legal_name from companies where id = $1`,
        [active.clientCompanyId],
      )
    : { rows: [] as { phone: string | null; email: string | null; legal_name: string }[] };

  const supervisor = clientContact.rows[0] ?? null;

  return {
    documents: {
      workPermitNumber: employee.workPermitNumber,
      workPermitExpiresOn: employee.expiresOn,
      passportNumber: employee.passportNumber,
      passportExpiry: employee.passportExpiry,
      workVisaNumber: employee.workVisaNumber,
      workVisaExpiry: employee.workVisaExpiry,
      insuranceExpiry: employee.insuranceExpiry,
      medicalExpiry: employee.medicalExpiry,
      xpatStatus: employee.xpatStatus,
      xpatStateName: employee.xpatStateName,
      xpatSyncedAt: employee.xpatSyncedAt,
      photoFileId: employee.photoFileId,
      warnings: expiryWarnings(employee),
    },
    employment: {
      clientName: active?.clientName ?? null,
      workSite: employee.workSite,
      jobTitle: active?.designation ?? employee.designation,
      startDate: active?.joinDate ?? null,
      supervisorContact: supervisor
        ? {
            name: supervisor.legal_name,
            phone: supervisor.phone,
            email: supervisor.email,
          }
        : null,
      allocationHistory: allocations.map((row) => ({
        id: row.id,
        clientName: row.clientName,
        designation: row.designation,
        joinDate: row.joinDate,
        resignDate: row.resignDate,
        status: row.status,
      })),
    },
  };
}

export async function getProfile(userId: string, employeeId: string) {
  const user = await pool.query<{ phone: string | null; name: string; must_change_password: boolean }>(
    `select phone, name, must_change_password from users where id = $1 and employee_id = $2`,
    [userId, employeeId],
  );
  const row = user.rows[0];
  if (!row) throw new EmployeeSelfError("Account not found", 404);
  return {
    name: row.name,
    phone: row.phone,
    mustChangePassword: row.must_change_password,
  };
}

export async function updateProfilePhone(userId: string, employeeId: string, phone: string, phoneConfirm: string) {
  const normalized = normalizePhone(phone);
  const confirm = normalizePhone(phoneConfirm);
  if (normalized !== confirm) throw new EmployeeSelfError("Phone numbers do not match.");
  try {
    await pool.query(`update users set phone = $2 where id = $1 and employee_id = $3`, [userId, normalized, employeeId]);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      throw new EmployeeSelfError("That phone number is already used.");
    }
    throw error;
  }
  return { phone: normalized };
}

export async function changePassword(
  userId: string,
  employeeId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) throw new EmployeeSelfError("New password must be at least 8 characters.");
  const row = await pool.query<{ password_hash: string }>(
    `select password_hash from users where id = $1 and employee_id = $2`,
    [userId, employeeId],
  );
  const stored = row.rows[0]?.password_hash;
  if (!stored) throw new EmployeeSelfError("Account not found", 404);
  if (!(await verifyPassword(currentPassword, stored))) throw new EmployeeSelfError("Current password is incorrect.", 401);
  const passwordHash = await hashPassword(newPassword);
  await pool.query(`update users set password_hash = $2, must_change_password = false where id = $1`, [
    userId,
    passwordHash,
  ]);
}
