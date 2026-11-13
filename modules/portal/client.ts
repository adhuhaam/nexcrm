import { pool } from "../../lib/db.ts";
import { monthBounds } from "./shared.ts";

export async function clientDashboard(clientId: string) {
  const [workers, invoices, recruitment] = await Promise.all([
    pool.query<{ count: string }>(
      `select count(*)::text as count from client_allocations where client_company_id = $1 and status = 'active'`,
      [clientId],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from pay_runs where client_company_id = $1 and status = 'locked'`,
      [clientId],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from client_allocations where client_company_id = $1`,
      [clientId],
    ),
  ]);
  return {
    activeWorkers: Number(workers.rows[0]?.count ?? 0),
    lockedInvoiceCount: Number(invoices.rows[0]?.count ?? 0),
    recruitmentTotal: Number(recruitment.rows[0]?.count ?? 0),
  };
}

export async function clientWorkers(clientId: string) {
  const result = await pool.query<{
    allocation_id: string;
    employee_id: string;
    legal_name: string;
    designation: string | null;
    employer_name: string;
    join_date: string;
    status: string;
    work_permit_number: string | null;
    xpat_status: string | null;
  }>(
    `select ca.id as allocation_id, e.id as employee_id, e.legal_name, ca.designation,
            emp.legal_name as employer_name, ca.join_date::text, ca.status,
            e.work_permit_number, e.xpat_status
     from client_allocations ca
     join employees e on e.id = ca.employee_id
     join companies emp on emp.id = ca.employer_company_id
     where ca.client_company_id = $1 and ca.status = 'active'
     order by e.legal_name`,
    [clientId],
  );
  return {
    items: result.rows.map((row) => ({
      allocationId: row.allocation_id,
      employeeId: row.employee_id,
      legalName: row.legal_name,
      designation: row.designation,
      employerName: row.employer_name,
      joinDate: row.join_date,
      status: row.status,
      workPermitNumber: row.work_permit_number,
      xpatStatus: row.xpat_status,
    })),
  };
}

export async function clientRecruitment(clientId: string) {
  const allocations = await pool.query<{
    id: string;
    legal_name: string;
    employer_name: string;
    designation: string | null;
    join_date: string;
    resign_date: string | null;
    status: string;
    letter_status: string | null;
    document_number: string | null;
  }>(
    `select ca.id, e.legal_name, emp.legal_name as employer_name, ca.designation,
            ca.join_date::text, ca.resign_date::text, ca.status,
            coalesce(l.status, 'none') as letter_status,
            l.document_number
     from client_allocations ca
     join employees e on e.id = ca.employee_id
     join companies emp on emp.id = ca.employer_company_id
     left join lateral (
       select status, document_number from letters
       where employee_id = e.id
       order by created_at desc
       limit 1
     ) l on true
     where ca.client_company_id = $1
     order by ca.join_date desc
     limit 100`,
    [clientId],
  );
  return {
    items: allocations.rows.map((row) => ({
      allocationId: row.id,
      workerName: row.legal_name,
      employerName: row.employer_name,
      designation: row.designation,
      joinDate: row.join_date,
      resignDate: row.resign_date,
      status: row.status,
      loaStatus: row.letter_status,
      loaNumber: row.document_number,
    })),
  };
}

export async function clientInvoices(clientId: string) {
  const result = await pool.query<{
    id: string;
    employer_name: string;
    period_start: string;
    period_end: string;
    status: string;
    invoice_number: string | null;
    net_bill: string | null;
  }>(
    `select pr.id, emp.legal_name as employer_name, pr.period_start::text, pr.period_end::text,
            pr.status, pr.invoice_number, coalesce(sum(pri.net_bill), 0)::text as net_bill
     from pay_runs pr
     join companies emp on emp.id = pr.employer_company_id
     left join pay_run_items pri on pri.pay_run_id = pr.id
     where pr.client_company_id = $1
     group by pr.id, emp.legal_name, pr.period_start, pr.period_end, pr.status, pr.invoice_number
     order by pr.period_start desc`,
    [clientId],
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      employerName: row.employer_name,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      invoiceNumber: row.invoice_number,
      netBill: row.net_bill,
    })),
  };
}

export async function clientPayments(clientId: string) {
  const result = await pool.query<{
    id: string;
    amount: string;
    currency: string;
    counterparty: string | null;
    note: string | null;
    expense_date: string;
  }>(
    `select id, amount::text, currency, counterparty, note, expense_date::text
     from expenses
     where client_company_id = $1 and category = 'client_payment'
     order by expense_date desc
     limit 200`,
    [clientId],
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      counterparty: row.counterparty,
      note: row.note,
      recordedOn: row.expense_date,
    })),
  };
}

export async function clientAttendanceMonth(clientId: string, month: string) {
  const { start, end } = monthBounds(month);
  const result = await pool.query<{
    employee_id: string;
    legal_name: string;
    attendance_date: string;
    status: string;
  }>(
    `select e.id as employee_id, e.legal_name, ar.attendance_date::text, ar.status
     from attendance_records ar
     join employees e on e.id = ar.employee_id
     join client_allocations ca on ca.employee_id = e.id and ca.client_company_id = $1 and ca.status = 'active'
     where ar.attendance_date between $2::date and $3::date
     order by e.legal_name, ar.attendance_date`,
    [clientId, start, end],
  );
  const byEmployee = new Map<string, { legalName: string; days: { date: string; status: string }[] }>();
  for (const row of result.rows) {
    let bucket = byEmployee.get(row.employee_id);
    if (!bucket) {
      bucket = { legalName: row.legal_name, days: [] };
      byEmployee.set(row.employee_id, bucket);
    }
    bucket.days.push({ date: row.attendance_date, status: row.status });
  }
  return {
    month,
    workers: [...byEmployee.entries()].map(([id, value]) => ({ employeeId: id, ...value })),
  };
}
