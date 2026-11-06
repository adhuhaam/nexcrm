/**
 * Import Manpower October 2026 attendance + OT (active + resigned).
 * Source: Downloads/(LEO)Manpower Oct-26 Attendance and OT.xlsx
 *
 * Creates/updates client "Manpower", employees under Unassigned legal employer,
 * allocations, attendance, OT entries, ends resigned allocations, then a draft pay run.
 */
import { createRequire } from "node:module";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { createCompany, findCompanyByLegalName } from "../modules/companies/companies.ts";
import { createEmployeeRecord } from "../modules/hr/employees.ts";
import { createAllocation, endAllocation } from "../modules/hr/allocations.ts";
import { saveEmployeeMonth } from "../modules/hr/attendance.ts";
import { upsertClientDesignationRate } from "../modules/hr/client-rates.ts";
import { createDesignation, listDesignations } from "../modules/hr/designations.ts";
import { createOtEntry } from "../modules/hr/ot.ts";
import { createPayRuns, upsertPeriodDeduction } from "../modules/hr/payroll.ts";

loadEnv();

const require = createRequire(import.meta.url);
const XLSX = require("/tmp/xlsxparse/node_modules/xlsx");

const FILE = "/home/server/Downloads/(LEO)Manpower Oct-26 Attendance and OT.xlsx";
const YEAR = 2026;
const MONTH = 10;
const DIM = 31;
const PERIOD_START = "2026-10-01";
const PERIOD_END = "2026-10-31";

type DayStatus = "P" | "AB";

type SheetEmployee = {
  empId: string;
  name: string;
  designation: string;
  staffMonth: string;
  billMonth: string;
  days: Record<string, DayStatus>;
  joinDate: string;
  resignDate: string | null;
  resigned: boolean;
  halfDays: number[];
};

type OtDay = { day: number; hours: number; rate: number };

type SheetDeduction = {
  empId: string;
  boat: number;
  meal: number;
  total: number;
  note: string;
};

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

function normalizeDesignation(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "Labor";
  const titled = text
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  const lower = titled.toLowerCase();
  if (lower === "labour" || lower === "labourer" || lower === "helper") return "Labor";
  if (lower === "meson") return "Mason";
  if (lower === "tiles mason") return "Tiles Mason";
  if (lower === "plumber-helper" || lower === "plumber helper") return "Plumber Helper";
  if (lower === "ac technician") return "AC Technician";
  return titled;
}

function mapDay(raw: unknown): DayStatus | "skip" {
  if (raw == null || raw === "") return "skip";
  if (typeof raw === "number") {
    if (raw > 0) return "P"; // 1 or 0.5 → present (half-day not modeled)
    return "skip";
  }
  const text = String(raw).trim().toUpperCase();
  if (!text) return "skip";
  if (text === "AB" || text === "A" || text === "ABSENT") return "AB";
  if (text === "1" || text === "0.5" || text === ".5") return "P";
  const n = Number(text);
  if (Number.isFinite(n) && n > 0) return "P";
  return "skip";
}

function empIdOf(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw)).padStart(6, "0");
  const text = String(raw ?? "").trim();
  if (/^\d+$/.test(text)) return text.padStart(6, "0");
  return text;
}

function parseAttendanceSheet(sheetName: string, resigned: boolean): SheetEmployee[] {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });

  const startRow = resigned ? 2 : 3;
  const staffCol = resigned ? 43 : 37;
  const billCol = resigned ? 46 : 40;
  const out: SheetEmployee[] = [];

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    if (!name) continue;
    const empId = empIdOf(row[0]);
    if (!empId || empId === "Emp ID") continue;

    const designation = normalizeDesignation(typeof row[3] === "string" ? row[3] : "Labor");
    const staffRaw = parseMoney(row[staffCol]);
    const billRaw = parseMoney(row[billCol]);
    if (staffRaw == null || billRaw == null) {
      throw new Error(`Missing rates for ${name} (${empId}) on ${sheetName}`);
    }

    const days: Record<string, DayStatus> = {};
    const halfDays: number[] = [];
    let firstMarked: number | null = null;
    let lastMarked: number | null = null;
    for (let day = 1; day <= DIM; day++) {
      const raw = row[5 + day - 1];
      if (raw === 0.5 || raw === "0.5" || raw === ".5") halfDays.push(day);
      const status = mapDay(raw);
      if (status === "skip") continue;
      days[String(day)] = status;
      if (firstMarked == null) firstMarked = day;
      lastMarked = day;
    }
    if (firstMarked == null || lastMarked == null) {
      throw new Error(`No attendance marked for ${name} (${empId}) on ${sheetName}`);
    }

    out.push({
      empId,
      name,
      designation,
      staffMonth: money(staffRaw),
      billMonth: money(billRaw),
      days,
      joinDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(firstMarked).padStart(2, "0")}`,
      resignDate: resigned
        ? `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(lastMarked).padStart(2, "0")}`
        : null,
      resigned,
      halfDays,
    });
  }
  return out;
}

function parseResignDeductions(): Map<string, SheetDeduction> {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Resign Attendance"], {
    header: 1,
    defval: null,
    raw: true,
  });
  const map = new Map<string, SheetDeduction>();
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    if (!name) continue;
    const empId = empIdOf(row[0]);
    const boat = parseMoney(row[39]) ?? 0;
    const meal = parseMoney(row[40]) ?? 0;
    const total = parseMoney(row[41]) ?? boat + meal;
    if (total <= 0 && boat <= 0 && meal <= 0) continue;
    const remark =
      typeof row[37] === "string" && row[37].trim()
        ? row[37].trim()
        : "Boat charges and meal deduction";
    map.set(empId, {
      empId,
      boat,
      meal,
      total: total > 0 ? total : boat + meal,
      note: remark,
    });
  }
  return map;
}

function parseOtSheet(sheetName: string): Map<string, OtDay[]> {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });
  const map = new Map<string, OtDay[]>();
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    if (!name) continue;
    const empId = empIdOf(row[0]);
    if (!empId) continue;
    const rate = parseMoney(row[37]) ?? 0;
    const days: OtDay[] = [];
    for (let day = 1; day <= DIM; day++) {
      const hours = parseMoney(row[5 + day - 1]);
      if (hours == null || hours <= 0) continue;
      days.push({ day, hours, rate });
    }
    if (days.length) map.set(empId, days);
  }
  return map;
}

async function ensureDesignation(name: string): Promise<void> {
  const existing = await listDesignations({ includeInactive: true });
  if (existing.some((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase())) return;
  await createDesignation({ name, sortOrder: 70 });
}

async function ensureCompany(kind: "employer" | "client", legalName: string, documentPrefix: string) {
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
    documentPrefix,
    signatoryName: null,
    signatoryTitle: null,
  });
}

async function findEmployeeByEmpHint(empId: string, legalName: string): Promise<{ id: string } | null> {
  const byPassport = await pool.query<{ id: string }>(
    `select id from employees where passport_number = $1 limit 1`,
    [`MP-${empId}`],
  );
  if (byPassport.rows[0]) return byPassport.rows[0];
  const byName = await pool.query<{ id: string }>(
    `select id from employees where lower(legal_name) = lower($1) limit 1`,
    [legalName],
  );
  return byName.rows[0] ?? null;
}

async function clearOtForMonth(employeeId: string, clientCompanyId: string): Promise<void> {
  await pool.query(
    `delete from ot_entries
     where employee_id = $1
       and work_date >= $2::date and work_date <= $3::date
       and client_company_id = $4`,
    [employeeId, PERIOD_START, PERIOD_END, clientCompanyId],
  );
}

async function main(): Promise<void> {
  const active = parseAttendanceSheet("Attendance", false);
  const resigned = parseAttendanceSheet("Resign Attendance", true);
  const people = [...active, ...resigned];
  const otActive = parseOtSheet("OT");
  const otResign = parseOtSheet("Resign OT");
  const otByEmp = new Map<string, OtDay[]>([...otActive, ...otResign]);
  const deductions = parseResignDeductions();

  console.log(`Parsed active ${active.length}, resigned ${resigned.length}, deductions ${deductions.size}`);
  console.log("Resigned employees:");
  for (const person of resigned) {
    const ded = deductions.get(person.empId);
    console.log(
      `  ${person.empId} ${person.name} · last day ${person.resignDate} · ${person.designation}` +
        (ded ? ` · deduct ${money(ded.total)} (boat ${money(ded.boat)} + meal ${money(ded.meal)})` : ""),
    );
  }

  const employer = await ensureCompany("employer", "Unassigned legal employer", "TBD");
  const client = await ensureCompany("client", "Manpower", "MP");
  console.log("legal employer", employer.id, employer.legalName);
  console.log("client", client.id, client.legalName);

  for (const person of people) await ensureDesignation(person.designation);

  const rateByDesignation = new Map<string, { staff: string; bill: string }>();
  for (const person of people) {
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

  let created = 0;
  let updated = 0;
  let otEntries = 0;
  const halfDayNote = people.flatMap((person) =>
    person.halfDays.map((day) => `${person.name} day ${day}`),
  );

  for (const person of people) {
    const existing = await findEmployeeByEmpHint(person.empId, person.name);
    let employeeId: string;

    if (existing) {
      employeeId = existing.id;
      await pool.query(
        `update employees set
           legal_name = $1,
           designation = $2,
           occupation = $2,
           staff_day_rate = $3,
           bill_day_rate = $4,
           salary = $3,
           work_site = $5,
           employment_status = $6,
           passport_number = coalesce(nullif(passport_number, ''), $7),
           updated_at = now()
         where id = $8`,
        [
          person.name,
          person.designation,
          person.staffMonth,
          person.billMonth,
          "Manpower",
          person.resigned ? "Resigned" : "Active",
          `MP-${person.empId}`,
          employeeId,
        ],
      );

      const alloc = await pool.query<{ id: string; status: string }>(
        `select id, status from client_allocations
         where employee_id = $1 and client_company_id = $2
         order by join_date desc limit 1`,
        [employeeId, client.id],
      );

      if (alloc.rows[0]?.status === "active") {
        await pool.query(
          `update client_allocations set
             designation = $1,
             staff_salary = $2,
             bill_rate = $3,
             join_date = least(join_date, $4::date),
             updated_at = now()
           where id = $5`,
          [person.designation, person.staffMonth, person.billMonth, person.joinDate, alloc.rows[0].id],
        );
        if (person.resigned && person.resignDate) {
          await endAllocation(alloc.rows[0].id, {
            endDate: person.resignDate,
            reason: "resign",
            note: `Manpower Oct-26 resign sheet · emp ${person.empId}`,
          });
        }
      } else if (!alloc.rows[0]) {
        const createdAlloc = await createAllocation({
          employeeId,
          clientCompanyId: client.id,
          joinDate: person.joinDate,
          designation: person.designation,
          staffSalary: person.staffMonth,
          billRate: person.billMonth,
          currency: "MVR",
        });
        if (person.resigned && person.resignDate) {
          await endAllocation(createdAlloc.id, {
            endDate: person.resignDate,
            reason: "resign",
            note: `Manpower Oct-26 resign sheet · emp ${person.empId}`,
          });
        }
      } else if (person.resigned && person.resignDate) {
        await pool.query(
          `update client_allocations set
             designation = $1,
             staff_salary = $2,
             bill_rate = $3,
             join_date = least(join_date, $4::date),
             resign_date = $5::date,
             end_reason = 'resign',
             end_note = $6,
             status = 'ended',
             updated_at = now()
           where id = $7`,
          [
            person.designation,
            person.staffMonth,
            person.billMonth,
            person.joinDate,
            person.resignDate,
            `Manpower Oct-26 resign sheet · emp ${person.empId}`,
            alloc.rows[0].id,
          ],
        );
      }
      updated += 1;
      console.log(
        `updated ${person.empId} ${person.name}${person.resigned ? ` · RESIGNED ${person.resignDate}` : ""}`,
      );
    } else {
      const employee = await createEmployeeRecord({
        companyId: employer.id,
        legalName: person.name,
        preferredName: null,
        passportNumber: `MP-${person.empId}`,
        passportIssueDate: null,
        passportExpiry: null,
        nationality: "BD",
        dateOfBirth: null,
        gender: null,
        permanentAddress: null,
        emergencyContact: null,
        occupation: person.designation,
        designation: person.designation,
        employmentStatus: person.resigned ? "Resigned" : "Active",
        projectId: null,
        siteId: null,
        quotaPoolId: null,
        workSite: "Manpower",
        siteCode: person.empId,
        salary: person.staffMonth,
        staffDayRate: person.staffMonth,
        billDayRate: person.billMonth,
        benefits: null,
        paidVacation: null,
        workingHours: null,
        contractDuration: null,
        country: "MV",
        origin: "Manpower / LEO hire · Oct 2026 import",
      });
      employeeId = employee.id;
      const createdAlloc = await createAllocation({
        employeeId,
        clientCompanyId: client.id,
        joinDate: person.joinDate,
        designation: person.designation,
        staffSalary: person.staffMonth,
        billRate: person.billMonth,
        currency: "MVR",
      });
      if (person.resigned && person.resignDate) {
        await endAllocation(createdAlloc.id, {
          endDate: person.resignDate,
          reason: "resign",
          note: `Manpower Oct-26 resign sheet · emp ${person.empId}`,
        });
      }
      created += 1;
      console.log(
        `created ${person.empId} ${person.name}${person.resigned ? ` · RESIGNED ${person.resignDate}` : ""}`,
      );
    }

    const daysForSave: Record<string, string> = {};
    for (const [day, status] of Object.entries(person.days)) daysForSave[day] = status;
    await saveEmployeeMonth({
      employeeId,
      year: YEAR,
      month: MONTH,
      days: daysForSave,
      createdBy: null,
    });

    await clearOtForMonth(employeeId, client.id);
    const otDays = otByEmp.get(person.empId) ?? [];
    for (const ot of otDays) {
      if (!ot.rate || ot.rate <= 0 || ot.hours <= 0) continue;
      await createOtEntry(
        {
          employeeId,
          workDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(ot.day).padStart(2, "0")}`,
          hours: money(ot.hours),
          hourlyRate: money(ot.rate),
          currency: "MVR",
          clientCompanyId: client.id,
          companyId: employer.id,
          note: `Manpower Oct-26 OT sheet · emp ${person.empId}`,
        },
        null,
      );
      otEntries += 1;
    }

    const ded = deductions.get(person.empId);
    if (ded && ded.total > 0) {
      await upsertPeriodDeduction({
        clientCompanyId: client.id,
        employeeId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        staffAmount: ded.total,
        billAmount: 0,
        note: ded.note,
        breakdown: {
          boat: money(ded.boat),
          meal: money(ded.meal),
          source: "Manpower Resign Attendance",
          empId: person.empId,
        },
      });
      console.log(`  deduction ${person.empId}: ${money(ded.total)} MVR`);
    }
  }

  const existingRun = await pool.query<{ id: string; status: string }>(
    `select id, status from pay_runs
     where client_company_id = $1
       and period_start = $2::date and period_end = $3::date`,
    [client.id, PERIOD_START, PERIOD_END],
  );
  for (const run of existingRun.rows) {
    if (run.status === "draft") {
      await pool.query(`delete from pay_run_items where pay_run_id = $1`, [run.id]);
      await pool.query(`delete from pay_runs where id = $1`, [run.id]);
      console.log(`removed draft pay run ${run.id}`);
    } else {
      throw new Error(`Locked pay run already exists for Manpower Oct 2026 (${run.id})`);
    }
  }

  const batch = await createPayRuns({
    mode: "client_batch",
    clientCompanyId: client.id,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });

  console.log(`\nEmployees created ${created}, updated ${updated}`);
  console.log(`OT entries written ${otEntries}`);
  if (halfDayNote.length) {
    console.log(`Half-days stored as full Present (P): ${halfDayNote.length}`);
    for (const note of halfDayNote.slice(0, 20)) console.log(`  ${note}`);
    if (halfDayNote.length > 20) console.log(`  … +${halfDayNote.length - 20} more`);
  }
  console.log(`Pay runs: ${batch.payRuns.length}`);
  for (const run of batch.payRuns) {
    console.log(
      `  ${run.employerName} × ${run.clientName} · items ${run.items.length} · net staff ${run.totals.netStaff} · net bill ${run.totals.netBill}`,
    );
  }
  console.log("\nRESIGNED (ended allocations):");
  for (const person of resigned) {
    console.log(`  ${person.empId}  ${person.name}  last day ${person.resignDate}  ${person.designation}`);
  }

  await pool.end();
}

await main();
