import { pool } from "../../lib/db.ts";

export type FinanceBucket = {
  key: string;
  label: string;
  expenses: string;
  clientBill: string;
  staffPay: string;
  balanceOperationFund: string;
};

export type ExpenseMonthBucket = {
  key: string;
  label: string;
  total: string;
  client_payment: string;
  investment: string;
  other: string;
  work_permit: string;
  insurance: string;
  medical: string;
  deposit: string;
};

export type DashboardFinance = {
  currency: string;
  totals: {
    expenses: string;
    expensesThisMonth: string;
    clientBill: string;
    staffPay: string;
    balanceOperationFund: string;
    fundAfterExpenses: string;
  };
  expenseBreakdown: {
    client_payment: string;
    investment: string;
    other: string;
    work_permit: string;
    insurance: string;
    medical: string;
    deposit: string;
  };
  expensesMonthly: ExpenseMonthBucket[];
  monthly: FinanceBucket[];
  yearly: FinanceBucket[];
};

const FINANCE_CATEGORIES = [
  "client_payment",
  "investment",
  "other",
  "work_permit",
  "insurance",
  "medical",
  "deposit",
] as const;

type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "short", year: "numeric" });
}

type PeriodAgg = {
  expenses: number;
  clientBill: number;
  staffPay: number;
};

function emptyAgg(): PeriodAgg {
  return { expenses: 0, clientBill: 0, staffPay: 0 };
}

function emptyCategoryAgg(): Record<FinanceCategory, number> & { total: number } {
  return {
    total: 0,
    client_payment: 0,
    investment: 0,
    other: 0,
    work_permit: 0,
    insurance: 0,
    medical: 0,
    deposit: 0,
  };
}

function toBucket(key: string, label: string, agg: PeriodAgg): FinanceBucket {
  const balanceOperationFund = agg.clientBill - agg.staffPay;
  return {
    key,
    label,
    expenses: money(agg.expenses),
    clientBill: money(agg.clientBill),
    staffPay: money(agg.staffPay),
    balanceOperationFund: money(balanceOperationFund),
  };
}

function isFinanceCategory(value: string): value is FinanceCategory {
  return (FINANCE_CATEGORIES as readonly string[]).includes(value);
}

/** Payroll balance operation fund + expenses for dashboard comparison charts. */
export async function getDashboardFinance(): Promise<DashboardFinance> {
  const thisMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const [
    expenseMonths,
    payrollMonths,
    expenseYears,
    payrollYears,
    expenseCats,
    expenseAll,
    payrollAll,
    expenseMonthCats,
  ] = await Promise.all([
    pool.query<{ period: string; total: string }>(
      `select to_char(expense_date, 'YYYY-MM') as period, coalesce(sum(amount), 0)::text as total
       from expenses
       group by 1
       order by 1`,
    ),
    pool.query<{ period: string; client_bill: string; staff_pay: string }>(
      `select to_char(p.period_start, 'YYYY-MM') as period,
              coalesce(sum(i.net_bill), 0)::text as client_bill,
              coalesce(sum(i.net_staff), 0)::text as staff_pay
       from pay_runs p
       join pay_run_items i on i.pay_run_id = p.id
       group by 1
       order by 1`,
    ),
    pool.query<{ period: string; total: string }>(
      `select to_char(expense_date, 'YYYY') as period, coalesce(sum(amount), 0)::text as total
       from expenses
       group by 1
       order by 1`,
    ),
    pool.query<{ period: string; client_bill: string; staff_pay: string }>(
      `select to_char(p.period_start, 'YYYY') as period,
              coalesce(sum(i.net_bill), 0)::text as client_bill,
              coalesce(sum(i.net_staff), 0)::text as staff_pay
       from pay_runs p
       join pay_run_items i on i.pay_run_id = p.id
       group by 1
       order by 1`,
    ),
    pool.query<{ category: string; total: string }>(
      `select category, coalesce(sum(amount), 0)::text as total
       from expenses
       group by category`,
    ),
    pool.query<{ total: string }>(`select coalesce(sum(amount), 0)::text as total from expenses`),
    pool.query<{ client_bill: string; staff_pay: string }>(
      `select coalesce(sum(i.net_bill), 0)::text as client_bill,
              coalesce(sum(i.net_staff), 0)::text as staff_pay
       from pay_run_items i`,
    ),
    pool.query<{ period: string; category: string; total: string }>(
      `select to_char(expense_date, 'YYYY-MM') as period,
              category,
              coalesce(sum(amount), 0)::text as total
       from expenses
       group by 1, 2
       order by 1, 2`,
    ),
  ]);

  function merge(
    expenseRows: { period: string; total: string }[],
    payrollRows: { period: string; client_bill: string; staff_pay: string }[],
    labelOf: (key: string) => string,
  ): FinanceBucket[] {
    const map = new Map<string, PeriodAgg>();
    for (const row of expenseRows) {
      const current = map.get(row.period) ?? emptyAgg();
      current.expenses += Number(row.total);
      map.set(row.period, current);
    }
    for (const row of payrollRows) {
      const current = map.get(row.period) ?? emptyAgg();
      current.clientBill += Number(row.client_bill);
      current.staffPay += Number(row.staff_pay);
      map.set(row.period, current);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, agg]) => toBucket(key, labelOf(key), agg));
  }

  const monthly = merge(expenseMonths.rows, payrollMonths.rows, monthLabel);
  const yearly = merge(expenseYears.rows, payrollYears.rows, (key) => key);

  const expensesMonthlyMap = new Map<string, ReturnType<typeof emptyCategoryAgg>>();
  for (const row of expenseMonthCats.rows) {
    const current = expensesMonthlyMap.get(row.period) ?? emptyCategoryAgg();
    const amount = Number(row.total);
    current.total += amount;
    if (isFinanceCategory(row.category)) current[row.category] += amount;
    expensesMonthlyMap.set(row.period, current);
  }
  for (const bucket of monthly) {
    if (!expensesMonthlyMap.has(bucket.key)) {
      expensesMonthlyMap.set(bucket.key, emptyCategoryAgg());
    }
  }
  const expensesMonthly: ExpenseMonthBucket[] = [...expensesMonthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, agg]) => ({
      key,
      label: monthLabel(key),
      total: money(agg.total),
      client_payment: money(agg.client_payment),
      investment: money(agg.investment),
      other: money(agg.other),
      work_permit: money(agg.work_permit),
      insurance: money(agg.insurance),
      medical: money(agg.medical),
      deposit: money(agg.deposit),
    }));

  const expenses = Number(expenseAll.rows[0]?.total ?? 0);
  const expensesThisMonth = expensesMonthlyMap.get(thisMonthKey)?.total ?? 0;
  const clientBill = Number(payrollAll.rows[0]?.client_bill ?? 0);
  const staffPay = Number(payrollAll.rows[0]?.staff_pay ?? 0);
  const balanceOperationFund = clientBill - staffPay;

  const expenseBreakdown: DashboardFinance["expenseBreakdown"] = {
    client_payment: "0.00",
    investment: "0.00",
    other: "0.00",
    work_permit: "0.00",
    insurance: "0.00",
    medical: "0.00",
    deposit: "0.00",
  };
  for (const row of expenseCats.rows) {
    if (isFinanceCategory(row.category)) {
      expenseBreakdown[row.category] = money(Number(row.total));
    }
  }

  return {
    currency: "MVR",
    totals: {
      expenses: money(expenses),
      expensesThisMonth: money(expensesThisMonth),
      clientBill: money(clientBill),
      staffPay: money(staffPay),
      balanceOperationFund: money(balanceOperationFund),
      fundAfterExpenses: money(balanceOperationFund - expenses),
    },
    expenseBreakdown,
    expensesMonthly,
    monthly,
    yearly,
  };
}
