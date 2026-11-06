import { randomUUID } from "node:crypto";
import { pool } from "../../lib/db.ts";
import { createExpense, ExpenseError, type ExpenseCategory, type ExpenseRecord } from "./expenses.ts";

export type FinanceFeeSettings = {
  id: string;
  workPermitMonthly: string;
  insuranceYearly: string;
  medicalYearly: string;
  currency: string;
  updatedAt: string;
};

export type DepositRate = {
  id: string;
  countryName: string;
  isoCode: string;
  amount: string;
  updatedAt: string;
};

export type FinanceSummary = {
  currency: string;
  fees: FinanceFeeSettings;
  monthlyUnitCost: string;
  activeEmployees: number;
  projectedMonthlyStaffCost: string;
  totals: Record<string, string>;
  byCategory: { category: string; total: string; count: number }[];
};

function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function employeeMonthlyUnitCost(fees: FinanceFeeSettings): number {
  return Number(fees.workPermitMonthly) + Number(fees.insuranceYearly) / 12 + Number(fees.medicalYearly) / 12;
}

export async function getFinanceFeeSettings(): Promise<FinanceFeeSettings> {
  const result = await pool.query<{
    id: string;
    work_permit_monthly: string;
    insurance_yearly: string;
    medical_yearly: string;
    currency: string;
    updated_at: string;
  }>(
    `select id, work_permit_monthly::text, insurance_yearly::text, medical_yearly::text, currency, updated_at::text
     from finance_fee_settings
     order by updated_at desc
     limit 1`,
  );
  let row = result.rows[0];
  if (!row) {
    const id = randomUUID();
    await pool.query(
      `insert into finance_fee_settings (id, work_permit_monthly, insurance_yearly, medical_yearly, currency)
       values ($1, 350, 800, 500, 'MVR')`,
      [id],
    );
    return {
      id,
      workPermitMonthly: "350.00",
      insuranceYearly: "800.00",
      medicalYearly: "500.00",
      currency: "MVR",
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    id: row.id,
    workPermitMonthly: money(Number(row.work_permit_monthly)),
    insuranceYearly: money(Number(row.insurance_yearly)),
    medicalYearly: money(Number(row.medical_yearly)),
    currency: row.currency,
    updatedAt: row.updated_at,
  };
}

export async function updateFinanceFeeSettings(input: {
  workPermitMonthly?: string | number;
  insuranceYearly?: string | number;
  medicalYearly?: string | number;
  currency?: string;
}): Promise<FinanceFeeSettings> {
  const current = await getFinanceFeeSettings();
  const wp = input.workPermitMonthly == null ? current.workPermitMonthly : money(Number(input.workPermitMonthly));
  const ins = input.insuranceYearly == null ? current.insuranceYearly : money(Number(input.insuranceYearly));
  const med = input.medicalYearly == null ? current.medicalYearly : money(Number(input.medicalYearly));
  if (![wp, ins, med].every((value) => Number(value) > 0)) {
    throw new ExpenseError("Fee amounts must be greater than 0");
  }
  const currency = (input.currency?.trim() || current.currency || "MVR").slice(0, 8);
  await pool.query(
    `update finance_fee_settings
     set work_permit_monthly = $2, insurance_yearly = $3, medical_yearly = $4, currency = $5, updated_at = now()
     where id = $1`,
    [current.id, wp, ins, med, currency],
  );
  return getFinanceFeeSettings();
}

export async function listDepositRates(q?: string | null): Promise<DepositRate[]> {
  const params: unknown[] = [];
  let where = "";
  if (q?.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    where = `where lower(country_name) like $1 or lower(iso_code) like $1`;
  }
  const result = await pool.query<{
    id: string;
    country_name: string;
    iso_code: string;
    amount: string;
    updated_at: string;
  }>(
    `select id, country_name, iso_code, amount::text, updated_at::text
     from wp_deposit_rates
     ${where}
     order by country_name`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    countryName: row.country_name,
    isoCode: row.iso_code,
    amount: money(Number(row.amount)),
    updatedAt: row.updated_at,
  }));
}

export async function upsertDepositRate(input: {
  id?: string | null;
  countryName: string;
  isoCode: string;
  amount: string | number;
}): Promise<DepositRate> {
  const countryName = input.countryName.trim();
  const isoCode = input.isoCode.trim().toUpperCase();
  const amount = money(Number(input.amount));
  if (!countryName || !isoCode) throw new ExpenseError("Country name and ISO code are required");
  if (Number(amount) <= 0) throw new ExpenseError("Deposit amount must be greater than 0");
  if (input.id) {
    await pool.query(
      `update wp_deposit_rates
       set country_name = $2, iso_code = $3, amount = $4, updated_at = now()
       where id = $1`,
      [input.id, countryName, isoCode, amount],
    );
    const rows = await listDepositRates(countryName);
    const found = rows.find((row) => row.id === input.id);
    if (!found) throw new ExpenseError("Deposit rate not found");
    return found;
  }
  const id = randomUUID();
  await pool.query(
    `insert into wp_deposit_rates (id, country_name, iso_code, amount)
     values ($1, $2, $3, $4)
     on conflict ((lower(country_name))) do update
       set iso_code = excluded.iso_code, amount = excluded.amount, updated_at = now()`,
    [id, countryName, isoCode, amount],
  );
  const match = (await listDepositRates(countryName)).find(
    (row) => row.countryName.toLowerCase() === countryName.toLowerCase(),
  );
  if (!match) throw new ExpenseError("Could not save deposit rate");
  return match;
}

export async function lookupDepositAmount(nationality: string | null | undefined): Promise<{
  amount: string;
  countryName: string;
  isoCode: string;
} | null> {
  const text = nationality?.trim();
  if (!text) return null;
  const result = await pool.query<{ country_name: string; iso_code: string; amount: string }>(
    `select country_name, iso_code, amount::text
     from wp_deposit_rates
     where lower(country_name) = lower($1)
        or upper(iso_code) = upper($1)
        or lower(country_name) like lower($1) || '%'
     order by
       case
         when lower(country_name) = lower($1) then 0
         when upper(iso_code) = upper($1) then 1
         else 2
       end,
       length(country_name)
     limit 1`,
    [text],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { amount: money(Number(row.amount)), countryName: row.country_name, isoCode: row.iso_code };
}

async function expenseExists(recurrenceKey: string): Promise<boolean> {
  const result = await pool.query(`select 1 from expenses where recurrence_key = $1 limit 1`, [recurrenceKey]);
  return Boolean(result.rows[0]);
}

export async function attachEmployeeFinanceOnCreate(input: {
  employeeId: string;
  employeeName: string;
  nationality: string | null;
  createdBy?: string | null;
  asOfDate?: string;
}): Promise<ExpenseRecord[]> {
  const fees = await getFinanceFeeSettings();
  const today = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const created: ExpenseRecord[] = [];

  const depositKey = `dep:${input.employeeId}`;
  if (!(await expenseExists(depositKey))) {
    const deposit = await lookupDepositAmount(input.nationality);
    if (deposit) {
      created.push(
        await createExpense(
          {
            expenseDate: today,
            amount: deposit.amount,
            currency: fees.currency,
            category: "deposit",
            employeeId: input.employeeId,
            counterparty: `WP deposit · ${deposit.countryName}`,
            note: `One-time work permit deposit (${deposit.isoCode}) per XPAT rates`,
            recurrenceKey: depositKey,
          },
          input.createdBy ?? null,
        ),
      );
    }
  }

  const insKey = `ins:${input.employeeId}:${year}`;
  if (!(await expenseExists(insKey))) {
    created.push(
      await createExpense(
        {
          expenseDate: today,
          amount: fees.insuranceYearly,
          currency: fees.currency,
          category: "insurance",
          employeeId: input.employeeId,
          counterparty: input.employeeName,
          note: `Annual insurance ${year}`,
          recurrenceKey: insKey,
        },
        input.createdBy ?? null,
      ),
    );
  }

  const medKey = `med:${input.employeeId}:${year}`;
  if (!(await expenseExists(medKey))) {
    created.push(
      await createExpense(
        {
          expenseDate: today,
          amount: fees.medicalYearly,
          currency: fees.currency,
          category: "medical",
          employeeId: input.employeeId,
          counterparty: input.employeeName,
          note: `Annual medical ${year}`,
          recurrenceKey: medKey,
        },
        input.createdBy ?? null,
      ),
    );
  }

  return created;
}

export async function postWorkPermitMonth(
  yearMonth: string,
  createdBy: string | null,
): Promise<{ created: number; skipped: number; yearMonth: string; amount: string }> {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new ExpenseError("Month must be YYYY-MM");
  const fees = await getFinanceFeeSettings();
  const expenseDate = `${yearMonth}-01`;
  const employees = await pool.query<{ id: string; legal_name: string }>(
    `select e.id, e.legal_name
     from employees e
     join employments emp on emp.employee_id = e.id and emp.status = 'active'
     order by e.legal_name`,
  );
  let created = 0;
  let skipped = 0;
  for (const row of employees.rows) {
    const key = `wp:${row.id}:${yearMonth}`;
    if (await expenseExists(key)) {
      skipped += 1;
      continue;
    }
    await createExpense(
      {
        expenseDate,
        amount: fees.workPermitMonthly,
        currency: fees.currency,
        category: "work_permit",
        employeeId: row.id,
        counterparty: row.legal_name,
        note: `Monthly work permit fee ${yearMonth}`,
        recurrenceKey: key,
      },
      createdBy,
    );
    created += 1;
  }
  return { created, skipped, yearMonth, amount: fees.workPermitMonthly };
}

export async function postAnnualFees(
  year: string | number,
  createdBy: string | null,
): Promise<{ insuranceCreated: number; medicalCreated: number; skipped: number; year: string }> {
  const yearText = String(year);
  if (!/^\d{4}$/.test(yearText)) throw new ExpenseError("Year must be YYYY");
  const fees = await getFinanceFeeSettings();
  const expenseDate = `${yearText}-01-01`;
  const employees = await pool.query<{ id: string; legal_name: string }>(
    `select e.id, e.legal_name
     from employees e
     join employments emp on emp.employee_id = e.id and emp.status = 'active'
     order by e.legal_name`,
  );
  let insuranceCreated = 0;
  let medicalCreated = 0;
  let skipped = 0;
  for (const row of employees.rows) {
    const insKey = `ins:${row.id}:${yearText}`;
    if (await expenseExists(insKey)) skipped += 1;
    else {
      await createExpense(
        {
          expenseDate,
          amount: fees.insuranceYearly,
          currency: fees.currency,
          category: "insurance",
          employeeId: row.id,
          counterparty: row.legal_name,
          note: `Annual insurance ${yearText}`,
          recurrenceKey: insKey,
        },
        createdBy,
      );
      insuranceCreated += 1;
    }
    const medKey = `med:${row.id}:${yearText}`;
    if (await expenseExists(medKey)) skipped += 1;
    else {
      await createExpense(
        {
          expenseDate,
          amount: fees.medicalYearly,
          currency: fees.currency,
          category: "medical",
          employeeId: row.id,
          counterparty: row.legal_name,
          note: `Annual medical ${yearText}`,
          recurrenceKey: medKey,
        },
        createdBy,
      );
      medicalCreated += 1;
    }
  }
  return { insuranceCreated, medicalCreated, skipped, year: yearText };
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const fees = await getFinanceFeeSettings();
  const unit = employeeMonthlyUnitCost(fees);
  const active = await pool.query<{ count: string }>(
    `select count(distinct e.id)::text as count
     from employees e
     join employments emp on emp.employee_id = e.id and emp.status = 'active'`,
  );
  const activeEmployees = Number(active.rows[0]?.count ?? 0);
  const totalsResult = await pool.query<{ category: string; total: string; count: string }>(
    `select category, coalesce(sum(amount), 0)::text as total, count(*)::text as count
     from expenses
     group by category
     order by category`,
  );
  const totals: Record<string, string> = {
    client_payment: "0.00",
    investment: "0.00",
    other: "0.00",
    work_permit: "0.00",
    insurance: "0.00",
    medical: "0.00",
    deposit: "0.00",
    all: "0.00",
  };
  let all = 0;
  const byCategory: FinanceSummary["byCategory"] = [];
  for (const row of totalsResult.rows) {
    const total = money(Number(row.total));
    totals[row.category] = total;
    all += Number(row.total);
    byCategory.push({ category: row.category, total, count: Number(row.count) });
  }
  totals.all = money(all);
  return {
    currency: fees.currency,
    fees,
    monthlyUnitCost: money(unit),
    activeEmployees,
    projectedMonthlyStaffCost: money(unit * activeEmployees),
    totals,
    byCategory,
  };
}

export type { ExpenseCategory };
