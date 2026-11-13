import { pool } from "../../lib/db.ts";
import { listEntityFiles } from "../files/storage.ts";
import { PortalError } from "./errors.ts";
import { assertEmployeeBelongsToEmployer, monthBounds } from "./shared.ts";

export async function employerDashboard(employerId: string) {
  const [employees, activeAllocations, openInvoices] = await Promise.all([
    pool.query<{ count: string }>(`select count(*)::text as count from employees where company_id = $1`, [employerId]),
    pool.query<{ count: string }>(
      `select count(distinct ca.employee_id)::text as count
       from client_allocations ca
       where ca.employer_company_id = $1 and ca.status = 'active'`,
      [employerId],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from pay_runs where employer_company_id = $1 and status = 'locked'`,
      [employerId],
    ),
  ]);
  return {
    employeeCount: Number(employees.rows[0]?.count ?? 0),
    allocatedCount: Number(activeAllocations.rows[0]?.count ?? 0),
    lockedPayRunCount: Number(openInvoices.rows[0]?.count ?? 0),
  };
}

export async function employerEmployees(employerId: string) {
  const result = await pool.query<{
    id: string;
    legal_name: string;
    designation: string | null;
    work_permit_number: string | null;
    xpat_status: string | null;
    xpat_state_name: string | null;
    expires_on: string | null;
    client_name: string | null;
    allocation_status: string | null;
  }>(
    `select e.id, e.legal_name, e.designation, e.work_permit_number,
            e.xpat_status, e.xpat_state_name, e.expires_on::text,
            c.legal_name as client_name, ca.status as allocation_status
     from employees e
     left join client_allocations ca on ca.employee_id = e.id and ca.status = 'active'
     left join companies c on c.id = ca.client_company_id
     where e.company_id = $1
     order by e.legal_name`,
    [employerId],
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      designation: row.designation,
      workPermitNumber: row.work_permit_number,
      xpatStatus: row.xpat_status,
      xpatStateName: row.xpat_state_name,
      workPermitExpiresOn: row.expires_on,
      clientName: row.client_name,
      allocationStatus: row.allocation_status,
    })),
  };
}

export async function employerQuota(employerId: string) {
  const pools = await pool.query<{
    id: string;
    name: string;
    pool_number: string | null;
    capacity: number;
    project_name: string;
    site_name: string;
    filled: string;
  }>(
    `select qp.id, qp.name, qp.pool_number, qp.capacity,
            p.name as project_name, s.name as site_name,
            count(sl.id) filter (where sl.employee_id is not null)::text as filled
     from quota_pools qp
     join sites s on s.id = qp.site_id
     join projects p on p.id = s.project_id
     left join slots sl on sl.quota_pool_id = qp.id
     where p.company_id = $1
     group by qp.id, qp.name, qp.pool_number, qp.capacity, p.name, s.name
     order by p.name, s.name, qp.name`,
    [employerId],
  );
  const permits = await pool.query<{
    id: string;
    legal_name: string;
    work_permit_number: string | null;
    expires_on: string | null;
    work_visa_expiry: string | null;
    medical_expiry: string | null;
    insurance_expiry: string | null;
  }>(
    `select id, legal_name, work_permit_number, expires_on::text, work_visa_expiry::text,
            medical_expiry::text, insurance_expiry::text
     from employees
     where company_id = $1 and work_permit_number is not null
     order by expires_on nulls last, legal_name`,
    [employerId],
  );
  return {
    pools: pools.rows.map((row) => ({
      id: row.id,
      name: row.name,
      poolNumber: row.pool_number,
      capacity: row.capacity,
      filled: Number(row.filled),
      projectName: row.project_name,
      siteName: row.site_name,
    })),
    workPermits: permits.rows.map((row) => ({
      employeeId: row.id,
      legalName: row.legal_name,
      workPermitNumber: row.work_permit_number,
      expiresOn: row.expires_on,
      workVisaExpiry: row.work_visa_expiry,
      medicalExpiry: row.medical_expiry,
      insuranceExpiry: row.insurance_expiry,
    })),
  };
}

export async function employerInvoices(employerId: string) {
  const result = await pool.query<{
    id: string;
    client_name: string;
    period_start: string;
    period_end: string;
    status: string;
    invoice_number: string | null;
    salary_sheet_number: string | null;
    net_bill: string | null;
  }>(
    `select pr.id, c.legal_name as client_name, pr.period_start::text, pr.period_end::text,
            pr.status, pr.invoice_number, pr.salary_sheet_number,
            coalesce(sum(pri.net_bill), 0)::text as net_bill
     from pay_runs pr
     join companies c on c.id = pr.client_company_id
     left join pay_run_items pri on pri.pay_run_id = pr.id
     where pr.employer_company_id = $1
     group by pr.id, c.legal_name, pr.period_start, pr.period_end, pr.status, pr.invoice_number, pr.salary_sheet_number
     order by pr.period_start desc`,
    [employerId],
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      invoiceNumber: row.invoice_number,
      salarySheetNumber: row.salary_sheet_number,
      netBill: row.net_bill,
    })),
  };
}

export async function employerPayments(employerId: string) {
  const result = await pool.query<{
    id: string;
    amount: string;
    currency: string;
    counterparty: string | null;
    note: string | null;
    expense_date: string;
    client_name: string | null;
  }>(
    `select e.id, e.amount::text, e.currency, e.counterparty, e.note, e.expense_date::text,
            c.legal_name as client_name
     from expenses e
     left join companies c on c.id = e.client_company_id
     where e.category = 'client_payment'
       and e.client_company_id in (
         select distinct client_company_id from pay_runs where employer_company_id = $1
       )
     order by e.expense_date desc
     limit 200`,
    [employerId],
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      counterparty: row.counterparty,
      note: row.note,
      recordedOn: row.expense_date,
      clientName: row.client_name,
    })),
  };
}

export async function employerEmployeeDocuments(employerId: string, employeeId: string) {
  await assertEmployeeBelongsToEmployer(employerId, employeeId);
  const files = await listEntityFiles("employee", employeeId);
  const employee = await pool.query<{
    work_visa_expiry: string | null;
    medical_expiry: string | null;
    insurance_expiry: string | null;
    passport_expiry: string | null;
  }>(
    `select work_visa_expiry::text, medical_expiry::text, insurance_expiry::text, passport_expiry::text
     from employees where id = $1`,
    [employeeId],
  );
  const row = employee.rows[0];
  if (!row) throw new PortalError("Employee not found.", 404);
  return {
    employeeId,
    visaExpiry: row.work_visa_expiry,
    medicalExpiry: row.medical_expiry,
    insuranceExpiry: row.insurance_expiry,
    passportExpiry: row.passport_expiry,
    files: files.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      kind: file.kind,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      label: file.label,
      createdAt: file.createdAt.toISOString(),
    })),
  };
}

export async function employerPayrollMonth(employerId: string, month: string) {
  const { start, end } = monthBounds(month);
  const result = await pool.query<{
    employee_id: string;
    employee_name: string;
    client_name: string;
    net_staff: string;
    period_start: string;
    period_end: string;
    pay_run_id: string;
  }>(
    `select pri.employee_id, pri.employee_name, c.legal_name as client_name,
            pri.net_staff::text, pr.period_start::text, pr.period_end::text, pr.id as pay_run_id
     from pay_run_items pri
     join pay_runs pr on pr.id = pri.pay_run_id
     join client_allocations ca on ca.id = pri.allocation_id
     join companies c on c.id = ca.client_company_id
     where pr.employer_company_id = $1
       and pr.period_start <= $3::date and pr.period_end >= $2::date
       and pr.status = 'locked'
     order by pri.employee_name`,
    [employerId, start, end],
  );
  return { month, items: result.rows };
}

export async function employerAttendanceMonth(employerId: string, month: string) {
  const { start, end } = monthBounds(month);
  const result = await pool.query<{
    employee_id: string;
    legal_name: string;
    attendance_date: string;
    status: string;
    client_name: string | null;
  }>(
    `select e.id as employee_id, e.legal_name, ar.attendance_date::text, ar.status, c.legal_name as client_name
     from attendance_records ar
     join employees e on e.id = ar.employee_id
     left join client_allocations ca on ca.employee_id = e.id and ca.status = 'active'
     left join companies c on c.id = ca.client_company_id
     where e.company_id = $1 and ar.attendance_date between $2::date and $3::date
     order by e.legal_name, ar.attendance_date`,
    [employerId, start, end],
  );
  const byEmployee = new Map<string, { legalName: string; clientName: string | null; days: { date: string; status: string }[] }>();
  for (const row of result.rows) {
    let bucket = byEmployee.get(row.employee_id);
    if (!bucket) {
      bucket = { legalName: row.legal_name, clientName: row.client_name, days: [] };
      byEmployee.set(row.employee_id, bucket);
    }
    bucket.days.push({ date: row.attendance_date, status: row.status });
  }
  return {
    month,
    employees: [...byEmployee.entries()].map(([id, value]) => ({ employeeId: id, ...value })),
  };
}
