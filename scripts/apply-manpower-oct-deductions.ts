/**
 * Apply Manpower Oct-26 resign boat/meal deductions and refresh the draft pay run.
 */
import { createRequire } from "node:module";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createPayRuns, upsertPeriodDeduction } from "../modules/hr/payroll.ts";

loadEnv();
await migrate(pool);

const require = createRequire(import.meta.url);
const XLSX = require("/tmp/xlsxparse/node_modules/xlsx");

const FILE = "/home/server/Downloads/(LEO)Manpower Oct-26 Attendance and OT.xlsx";
const PERIOD_START = "2026-10-01";
const PERIOD_END = "2026-10-31";

function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function empIdOf(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw)).padStart(6, "0");
  const text = String(raw ?? "").trim();
  if (/^\d+$/.test(text)) return text.padStart(6, "0");
  return text;
}

async function main(): Promise<void> {
  const clientRow = await pool.query<{ id: string }>(
    `select id from companies where kind = 'client' and legal_name = 'Manpower' limit 1`,
  );
  const clientId = clientRow.rows[0]?.id;
  if (!clientId) throw new Error("Manpower client not found");

  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Resign Attendance"], {
    header: 1,
    defval: null,
    raw: true,
  });

  let applied = 0;
  let totalStaff = 0;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    if (!name) continue;
    const empId = empIdOf(row[0]);
    const boat = parseMoney(row[39]) ?? 0;
    const meal = parseMoney(row[40]) ?? 0;
    const total = parseMoney(row[41]) ?? boat + meal;
    if (total <= 0) continue;
    const note =
      typeof row[37] === "string" && row[37].trim()
        ? row[37].trim()
        : "Boat charges and meal deduction";

    const emp = await pool.query<{ id: string; legal_name: string }>(
      `select id, legal_name from employees
       where passport_number = $1 or site_code = $2 or lower(legal_name) = lower($3)
       order by case when passport_number = $1 then 0 else 1 end
       limit 1`,
      [`MP-${empId}`, empId, name],
    );
    const employee = emp.rows[0];
    if (!employee) throw new Error(`Employee not found for ${empId} ${name}`);

    await upsertPeriodDeduction({
      clientCompanyId: clientId,
      employeeId: employee.id,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      staffAmount: total,
      billAmount: 0,
      note,
      breakdown: {
        boat: money(boat),
        meal: money(meal),
        source: "Manpower Resign Attendance",
        empId,
      },
    });
    applied += 1;
    totalStaff += total;
    console.log(`${empId} ${employee.legal_name}: boat ${money(boat)} + meal ${money(meal)} = ${money(total)}`);
  }

  const existing = await pool.query<{ id: string; status: string }>(
    `select id, status from pay_runs
     where client_company_id = $1 and period_start = $2::date and period_end = $3::date`,
    [clientId, PERIOD_START, PERIOD_END],
  );
  for (const run of existing.rows) {
    if (run.status !== "draft") throw new Error(`Locked pay run ${run.id} — cannot refresh`);
    await pool.query(`delete from pay_run_items where pay_run_id = $1`, [run.id]);
    await pool.query(`delete from pay_runs where id = $1`, [run.id]);
    console.log(`removed draft ${run.id}`);
  }

  const batch = await createPayRuns({
    mode: "client_batch",
    clientCompanyId: clientId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });

  console.log(`\nApplied ${applied} deduction rows · total staff deductions ${money(totalStaff)} MVR`);
  for (const run of batch.payRuns) {
    const withDed = run.items.filter((item) => Number(item.otherDeductStaff) > 0);
    console.log(
      `${run.employerName} × ${run.clientName} · items ${run.items.length} · with deductions ${withDed.length} · net staff ${run.totals.netStaff}`,
    );
    for (const item of withDed) {
      console.log(
        `  ${item.employeeName}: deduct ${item.otherDeductStaff} · net ${item.netStaff} · ${item.deductionNote ?? ""}`,
      );
    }
  }

  await pool.end();
}

await main();
