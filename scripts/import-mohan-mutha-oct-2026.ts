/**
 * Import Mohan Mutha October 2026 attendance (UCC + Biyadhoo sheets).
 * Source: Downloads/oct (mohan mutha).xlsx
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
const XLSX = require("/tmp/xlsxparse/node_modules/xlsx");

const FILE = "/home/server/Downloads/oct (mohan mutha).xlsx";
const YEAR = 2026;
const MONTH = 10;
const DIM = 31;

type SheetEmployee = {
  name: string;
  designation: string;
  project: string;
  staffMonth: string;
  billMonth: string;
  days: Record<string, "P" | "OD">;
  joinDate: string;
};

function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

function normalizeDesignation(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "Labor";
  const titled = text
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  // Helper and Labor are the same role in this agency.
  if (titled.toLowerCase() === "helper" || titled.toLowerCase() === "labour") return "Labor";
  return titled;
}

function mapStatus(raw: unknown): "P" | "OD" | "skip" {
  const text = raw == null ? "" : String(raw).trim().toUpperCase();
  if (!text || text === "NJ" || text === "N/J" || text === "N\\J") return "skip";
  if (text === "P") return "P";
  if (text === "FRI" || text === "DO" || text === "OD" || text === "WO") return "OD";
  if (text === "AB" || text === "A" || text === "ABSENT") return "skip"; // leave unmarked unless we want AB
  return "skip";
}

function parseSheet(
  sheetName: string,
  project: string,
  dayStartCol: number,
  nameCol: number,
  desCol: number,
  billCol: number,
  staffCol: number,
): SheetEmployee[] {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });

  const out: SheetEmployee[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = typeof row[nameCol] === "string" ? row[nameCol].trim() : "";
    if (!name) continue;
    const designation = normalizeDesignation(typeof row[desCol] === "string" ? row[desCol] : "Labor");
    const billRaw = Number(row[billCol]);
    const staffRaw = Number(row[staffCol]);
    if (!Number.isFinite(billRaw) || !Number.isFinite(staffRaw)) {
      throw new Error(`Missing rates for ${name} on ${sheetName}`);
    }

    const days: Record<string, "P" | "OD"> = {};
    let firstMarked: number | null = null;
    for (let day = 1; day <= DIM; day++) {
      const status = mapStatus(row[dayStartCol + day - 1]);
      if (status === "skip") continue;
      days[String(day)] = status;
      if (firstMarked == null) firstMarked = day;
    }
    if (firstMarked == null) throw new Error(`No attendance marked for ${name} on ${sheetName}`);

    out.push({
      name,
      designation,
      project,
      staffMonth: money(staffRaw),
      billMonth: money(billRaw),
      days,
      joinDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(firstMarked).padStart(2, "0")}`,
    });
  }
  return out;
}

async function ensureDesignation(name: string): Promise<void> {
  const existing = await listDesignations({ includeInactive: true });
  if (existing.some((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase())) return;
  await createDesignation({ name, sortOrder: 80 });
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
    documentPrefix: kind === "employer" ? "TBD" : "MM",
    signatoryName: null,
    signatoryTitle: null,
  });
}

async function findEmployeeByName(legalName: string): Promise<{ id: string } | null> {
  const result = await pool.query<{ id: string }>(
    `select id from employees where lower(legal_name) = lower($1) limit 1`,
    [legalName],
  );
  return result.rows[0] ?? null;
}

async function main(): Promise<void> {
  const sheet = [
    ...parseSheet("ucc", "UCC Project", 4, 1, 2, 3, 41),
    ...parseSheet("biyadhoo", "Biyadhoo Project", 5, 1, 2, 4, 43),
  ];
  console.log(`Parsed ${sheet.length} employees from Mohan Mutha October sheet`);

  const employer = await ensureCompany("employer", "Unassigned legal employer");
  const client = await ensureCompany("client", "Mohan Mutha");
  console.log("legal employer", employer.id, employer.legalName);
  console.log("client", client.id, client.legalName);

  for (const person of sheet) await ensureDesignation(person.designation);

  const rateByDesignation = new Map<string, { staff: string; bill: string }>();
  for (const person of sheet) {
    if (!rateByDesignation.has(person.designation)) {
      rateByDesignation.set(person.designation, { staff: person.staffMonth, bill: person.billMonth });
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

  let imported = 0;
  let updated = 0;

  for (const person of sheet) {
    const existing = await findEmployeeByName(person.name);
    let employeeId: string;

    if (existing) {
      employeeId = existing.id;
      await pool.query(
        `update employees set
           designation = $1,
           occupation = $1,
           staff_day_rate = $2,
           bill_day_rate = $3,
           salary = $2,
           work_site = $4,
           updated_at = now()
         where id = $5`,
        [person.designation, person.staffMonth, person.billMonth, person.project, employeeId],
      );
      const active = await pool.query<{ id: string }>(
        `select id from client_allocations where employee_id = $1 and status = 'active' limit 1`,
        [employeeId],
      );
      if (active.rows[0]) {
        await pool.query(
          `update client_allocations set
             client_company_id = $1,
             designation = $2,
             staff_salary = $3,
             bill_rate = $4,
             join_date = least(join_date, $5::date),
             updated_at = now()
           where id = $6`,
          [client.id, person.designation, person.staffMonth, person.billMonth, person.joinDate, active.rows[0].id],
        );
      } else {
        await createAllocation({
          employeeId,
          clientCompanyId: client.id,
          joinDate: person.joinDate,
          designation: person.designation,
          staffSalary: person.staffMonth,
          billRate: person.billMonth,
          currency: "MVR",
        });
      }
      updated += 1;
      console.log(`updated ${person.name} · ${person.project} · ${person.designation}`);
    } else {
      const passport = `MM-OCT26-${person.name.replace(/\s+/g, "").slice(0, 18).toUpperCase()}`;
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
        occupation: person.designation,
        designation: person.designation,
        employmentStatus: "Active",
        projectId: null,
        siteId: null,
        quotaPoolId: null,
        workSite: person.project,
        siteCode: null,
        salary: person.staffMonth,
        staffDayRate: person.staffMonth,
        billDayRate: person.billMonth,
        benefits: null,
        paidVacation: null,
        workingHours: null,
        contractDuration: null,
        country: "MV",
        origin: "Mohan Mutha / LEO hire",
      });
      employeeId = employee.id;
      await createAllocation({
        employeeId,
        clientCompanyId: client.id,
        joinDate: person.joinDate,
        designation: person.designation,
        staffSalary: person.staffMonth,
        billRate: person.billMonth,
        currency: "MVR",
      });
      imported += 1;
      console.log(`created ${person.name} · ${person.project} · join ${person.joinDate}`);
    }

    const daysForSave: Record<string, string> = {};
    for (const [day, status] of Object.entries(person.days)) {
      daysForSave[day] = status;
    }
    await saveEmployeeMonth({
      employeeId,
      year: YEAR,
      month: MONTH,
      days: daysForSave,
      createdBy: null,
    });
  }

  const batch = await createPayRuns({
    mode: "client_batch",
    clientCompanyId: client.id,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
  });

  console.log(`\nEmployees created ${imported}, updated ${updated}`);
  console.log(`Pay runs: ${batch.payRuns.length}`);
  for (const run of batch.payRuns) {
    console.log(
      `  ${run.employerName} × ${run.clientName} · items ${run.items.length} · net staff ${run.totals.netStaff} · net bill ${run.totals.netBill}`,
    );
    for (const item of run.items) {
      console.log(
        `    ${item.employeeName}: paid ${item.paidDays} · staff ${item.netStaff} · bill ${item.netBill}`,
      );
    }
  }

  await pool.end();
}

await main();
