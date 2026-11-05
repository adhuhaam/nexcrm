/**
 * Import LEO October 2026 attendance sheet → Ayada Maldives client + payroll.
 * Source: Downloads/2026 - 10 - LEO.xlsx
 */
import { createRequire } from "node:module";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { createCompany, findCompanyByLegalName } from "../modules/companies/companies.ts";
import { createEmployeeRecord } from "../modules/hr/employees.ts";
import { createAllocation } from "../modules/hr/allocations.ts";
import { saveEmployeeMonth } from "../modules/hr/attendance.ts";
import { upsertClientDesignationRate } from "../modules/hr/client-rates.ts";
import { createDesignation, listDesignations } from "../modules/hr/designations.ts";
import { createPayRuns } from "../modules/hr/payroll.ts";

loadEnv();

const require = createRequire(import.meta.url);
// Reuse the xlsx package installed under /tmp/xlsxparse for this one-off import.
const XLSX = require("/tmp/xlsxparse/node_modules/xlsx");

const FILE = "/home/server/Downloads/2026 - 10 - LEO.xlsx";
const YEAR = 2026;
const MONTH = 10;
const DIM = 31;

type SheetEmployee = {
  name: string;
  department: string;
  position: string;
  staffMonth: string;
  billMonth: string;
  days: Record<string, "P" | "OD" | "">;
  joinDate: string;
};

function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

function parseSheet(): SheetEmployee[] {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets.ATTENDANCE, {
    header: 1,
    defval: null,
    raw: true,
  });

  const out: SheetEmployee[] = [];
  for (let i = 7; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    if (!name) continue;
    const department = typeof row[2] === "string" ? row[2].trim() : "";
    const position = typeof row[4] === "string" ? row[4].trim() : "Labor";
    const staffDay = Number(row[39]);
    const clientDay = Number(row[41]);
    if (!Number.isFinite(staffDay) || !Number.isFinite(clientDay)) {
      throw new Error(`Missing rates for ${name}`);
    }
    // Sheet day rates × days-in-month = monthly (matches their Total salary columns).
    const staffMonth = money(staffDay * DIM);
    const billMonth = money(clientDay * DIM);

    const days: Record<string, "P" | "OD" | ""> = {};
    let firstMarked: number | null = null;
    for (let day = 1; day <= DIM; day++) {
      const raw = row[4 + day];
      const text = typeof raw === "string" ? raw.trim().toUpperCase() : "";
      let status: "P" | "OD" | "" = "";
      if (text === "P") status = "P";
      else if (text === "DO" || text === "OD") status = "OD";
      else if (text === "AB" || text === "A") status = "" as ""; // treat blank-like; sheet has no AB
      days[String(day)] = status;
      if (status && firstMarked == null) firstMarked = day;
    }
    if (firstMarked == null) throw new Error(`No attendance marked for ${name}`);

    out.push({
      name,
      department,
      position,
      staffMonth,
      billMonth,
      days,
      joinDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(firstMarked).padStart(2, "0")}`,
    });
  }
  return out;
}

async function ensureDesignation(name: string): Promise<void> {
  const existing = await listDesignations({ includeInactive: true });
  if (existing.some((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase())) return;
  await createDesignation({ name, sortOrder: 60 });
}

async function ensureCompany(kind: "employer" | "client", legalName: string) {
  const found = await findCompanyByLegalName(legalName);
  if (found) {
    if (found.kind !== kind) throw new Error(`${legalName} exists as ${found.kind}, expected ${kind}`);
    return found;
  }
  return createCompany({
    kind,
    legalName,
    registrationNumber: null,
    tinNumber: null,
    registeredAddress: null,
    country: "MV",
    businessActivity: null,
    phone: null,
    email: null,
    documentPrefix: kind === "employer" ? "TBD" : "AYADA",
    signatoryName: null,
    signatoryTitle: null,
  });
}

async function main(): Promise<void> {
  const sheet = parseSheet();
  console.log(`Parsed ${sheet.length} employees from sheet`);

  // LEO on the sheet is the *agency*, not the legal / WP employer.
  // Place staff under a placeholder until real legal employers are assigned.
  const employer = await ensureCompany("employer", "Unassigned legal employer");
  const client = await ensureCompany("client", "Ayada Maldives");
  console.log("legal employer (placeholder)", employer.id, employer.legalName);
  console.log("client", client.id, client.legalName);

  for (const person of sheet) {
    await ensureDesignation(person.position);
  }

  // Client designation monthly rates from sheet (full-month totals).
  const rateByDesignation = new Map<string, { staff: string; bill: string }>();
  for (const person of sheet) {
    // Prefer full-month workers for the card (Jafir is mid-month but same rates).
    if (!rateByDesignation.has(person.position)) {
      rateByDesignation.set(person.position, { staff: person.staffMonth, bill: person.billMonth });
    }
  }
  for (const [designation, rates] of rateByDesignation) {
    await upsertClientDesignationRate({
      clientCompanyId: client.id,
      designation,
      staffMonthRate: rates.staff,
      billMonthRate: rates.bill,
      currency: "MVR",
    });
    console.log(`rate ${designation}: staff ${rates.staff} / bill ${rates.bill}`);
  }

  const created: { name: string; id: string; joinDate: string; staffMonth: string; billMonth: string }[] = [];

  for (const person of sheet) {
    const passport = `LEO-OCT26-${person.name.replace(/\s+/g, "").slice(0, 20).toUpperCase()}`;
    const employee = await createEmployeeRecord({
      companyId: employer.id,
      legalName: person.name,
      preferredName: null,
      passportNumber: passport,
      passportIssueDate: null,
      passportExpiry: null,
      nationality: "BD",
      dateOfBirth: null,
      gender: null,
      permanentAddress: null,
      emergencyContact: null,
      occupation: person.position,
      designation: person.position,
      employmentStatus: "Active",
      projectId: null,
      siteId: null,
      quotaPoolId: null,
      workSite: "Ayada Maldives",
      siteCode: null,
      salary: person.staffMonth,
      staffDayRate: person.staffMonth,
      billDayRate: person.billMonth,
      benefits: null,
      paidVacation: null,
      workingHours: null,
      contractDuration: null,
      country: "MV",
      origin: person.department || null,
    });

    await createAllocation({
      employeeId: employee.id,
      clientCompanyId: client.id,
      joinDate: person.joinDate,
      designation: person.position,
      staffSalary: person.staffMonth,
      billRate: person.billMonth,
      currency: "MVR",
    });

    // Only mark days on/after join; blank before join stays unmarked (outside payable window).
    const daysForSave: Record<string, string> = {};
    const joinDay = Number(person.joinDate.slice(8, 10));
    for (let day = 1; day <= DIM; day++) {
      if (day < joinDay) continue;
      const status = person.days[String(day)];
      if (status) daysForSave[String(day)] = status;
    }

    await saveEmployeeMonth({
      employeeId: employee.id,
      year: YEAR,
      month: MONTH,
      days: daysForSave,
      createdBy: null,
    });

    created.push({
      name: person.name,
      id: employee.id,
      joinDate: person.joinDate,
      staffMonth: person.staffMonth,
      billMonth: person.billMonth,
    });
    console.log(`imported ${person.name} · ${person.position} · join ${person.joinDate}`);
  }

  const batch = await createPayRuns({
    mode: "client_batch",
    clientCompanyId: client.id,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
  });

  console.log("\nPay runs:", batch.payRuns.length);
  for (const run of batch.payRuns) {
    console.log(
      `  ${run.employerName} × ${run.clientName} · ${run.periodStart} → ${run.periodEnd} · ${run.status}`,
    );
    console.log(
      `  totals net staff ${run.totals.netStaff} · net bill ${run.totals.netBill}`,
    );
    for (const item of run.items) {
      console.log(
        `    ${item.employeeName}: paid ${item.paidDays} · staff ${item.netStaff} · bill ${item.netBill}`,
      );
    }
  }

  // Sheet footer totals for sanity: staff 41760, client ~55589.35
  const staffTotal = batch.payRuns.reduce((s, r) => s + Number(r.totals.netStaff), 0);
  const billTotal = batch.payRuns.reduce((s, r) => s + Number(r.totals.netBill), 0);
  console.log(`\nCompare sheet footer staff 41760 / bill 55589.35`);
  console.log(`System totals staff ${staffTotal.toFixed(2)} / bill ${billTotal.toFixed(2)}`);
  console.log(`Employees imported: ${created.length}`);

  await pool.end();
}

await main();
