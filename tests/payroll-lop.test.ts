import assert from "node:assert/strict";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createCompany, listCompanies } from "../modules/companies/companies.ts";
import { createEmployeeRecord } from "../modules/hr/employees.ts";
import { createAllocation } from "../modules/hr/allocations.ts";
import { saveEmployeeMonth } from "../modules/hr/attendance.ts";
import {
  createPayRuns,
  deletePayRun,
  lockPayRun,
  recalculatePayRun,
} from "../modules/hr/payroll.ts";

loadEnv();
await migrate(pool);

const stamp = Date.now();

async function makeEmployee(companyId: string, name: string, passport: string, rates?: { staff: string; bill: string; designation?: string }) {
  return createEmployeeRecord({
    companyId,
    legalName: name,
    preferredName: null,
    passportNumber: passport,
    passportIssueDate: null,
    passportExpiry: null,
    nationality: "BD",
    dateOfBirth: "1990-01-01",
    gender: "M",
    permanentAddress: null,
    emergencyContact: null,
    occupation: "Technician",
    designation: rates?.designation ?? "Technician",
    employmentStatus: "Active",
    projectId: null,
    siteId: null,
    quotaPoolId: null,
    workSite: null,
    siteCode: null,
    salary: null,
    staffDayRate: rates?.staff ?? "5500.00",
    billDayRate: rates?.bill ?? "6000.00",
    benefits: null,
    paidVacation: null,
    workingHours: null,
    contractDuration: null,
    country: null,
    origin: null,
  });
}

function fillMonth(status: "P" | "AB" | "OD", daysInMonth: number, override: Record<string, "P" | "AB" | "OD" | ""> = {}) {
  const days: Record<string, string> = {};
  for (let d = 1; d <= daysInMonth; d++) days[String(d)] = override[String(d)] ?? status;
  return days;
}

function money(n: number): string {
  return n.toFixed(2);
}

const employerA =
  (await listCompanies("employer"))[0] ??
  (await createCompany({
    kind: "employer",
    legalName: `LOP Employer A ${stamp}`,
    registrationNumber: "LOP-A",
    registeredAddress: "Male",
    country: "MV",
    businessActivity: null,
    phone: null,
    email: null,
    documentPrefix: "LOPA",
    signatoryName: "Signatory",
    signatoryTitle: "Director",
  }));

const employerB = await createCompany({
  kind: "employer",
  legalName: `LOP Employer B ${stamp}`,
  registrationNumber: "LOP-B",
  registeredAddress: "Male",
  country: "MV",
  businessActivity: null,
  phone: null,
  email: null,
  documentPrefix: "LOPB",
  signatoryName: "Signatory",
  signatoryTitle: "Director",
});

const client = await createCompany({
  kind: "client",
  legalName: `LOP Client ${stamp}`,
  registrationNumber: null,
  registeredAddress: null,
  country: "MV",
  businessActivity: null,
  phone: null,
  email: null,
  documentPrefix: null,
  signatoryName: null,
  signatoryTitle: null,
});

const workerA = await makeEmployee(employerA.id, `Worker A ${stamp}`, `PA${stamp}`, {
  staff: "5500.00",
  bill: "6000.00",
  designation: "Labor",
});
const workerB = await makeEmployee(employerB.id, `Worker B ${stamp}`, `PB${stamp}`, {
  staff: "5500.00",
  bill: "5800.00",
  designation: "Steward",
});

await createAllocation({
  employeeId: workerA.id,
  clientCompanyId: client.id,
  joinDate: "2026-01-01",
});

await createAllocation({
  employeeId: workerB.id,
  clientCompanyId: client.id,
  joinDate: "2026-01-01",
});

// Full month present → net = full monthly (5500 / 31 * 31)
await saveEmployeeMonth({
  employeeId: workerA.id,
  year: 2026,
  month: 1,
  days: fillMonth("P", 31),
  createdBy: null,
});
await saveEmployeeMonth({
  employeeId: workerB.id,
  year: 2026,
  month: 1,
  days: fillMonth("P", 31),
  createdBy: null,
});

const batch = await createPayRuns({
  mode: "client_batch",
  clientCompanyId: client.id,
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
});
assert.equal(batch.payRuns.length, 2);
const runA = batch.payRuns.find((r) => r.employerCompanyId === employerA.id);
assert.ok(runA);
assert.equal(runA!.items[0].paidDays, 31);
assert.equal(runA!.items[0].netStaff, "5500.00");
assert.equal(runA!.items[0].netBill, "6000.00");
assert.equal(runA!.items[0].staffSalary, "5500.00");

await assert.rejects(
  () =>
    createPayRuns({
      mode: "employer_client",
      clientCompanyId: client.id,
      employerCompanyId: employerA.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    }),
  /already exists/,
);

// One AB → 30 paid days → 5500 * 30 / 31
await deletePayRun(runA!.id);
await saveEmployeeMonth({
  employeeId: workerA.id,
  year: 2026,
  month: 1,
  days: fillMonth("P", 31, { "15": "AB" }),
  createdBy: null,
});
const single = await createPayRuns({
  mode: "employer_client",
  clientCompanyId: client.id,
  employerCompanyId: employerA.id,
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
});
assert.equal(single.payRuns.length, 1);
const abRun = single.payRuns[0];
assert.equal(abRun.items[0].paidDays, 30);
assert.equal(abRun.items[0].absentDays, 1);
assert.equal(abRun.items[0].netStaff, money((5500 * 30) / 31));

await saveEmployeeMonth({
  employeeId: workerA.id,
  year: 2026,
  month: 1,
  days: fillMonth("P", 31, { "10": "OD", "20": "" }),
  createdBy: null,
});
const recalced = await recalculatePayRun(abRun.id);
assert.equal(recalced.items[0].offDays, 1);
assert.equal(recalced.items[0].unmarkedDays, 1);
assert.equal(recalced.items[0].paidDays, 30); // 29 P + 1 OD
assert.ok(recalced.warnings.length >= 1);

// Mid-month join — only days from join through month end (Feb 28 → dim 28)
const midWorker = await makeEmployee(employerA.id, `Mid ${stamp}`, `PM${stamp}`, {
  staff: "5500.00",
  bill: "6000.00",
  designation: "Helper",
});
await createAllocation({
  employeeId: midWorker.id,
  clientCompanyId: client.id,
  joinDate: "2026-02-15",
});
await saveEmployeeMonth({
  employeeId: midWorker.id,
  year: 2026,
  month: 2,
  days: fillMonth("P", 28),
  createdBy: null,
});
const feb = await createPayRuns({
  mode: "employer_client",
  clientCompanyId: client.id,
  employerCompanyId: employerA.id,
  periodStart: "2026-02-01",
  periodEnd: "2026-02-28",
});
const midItem = feb.payRuns[0].items.find((i) => i.employeeId === midWorker.id);
assert.ok(midItem);
assert.equal(midItem!.calendarDays, 14); // 15–28 Feb
assert.equal(midItem!.paidDays, 14);
assert.equal(midItem!.netStaff, money((5500 * 14) / 28));

const locked = await lockPayRun(feb.payRuns[0].id);
assert.equal(locked.status, "locked");
await assert.rejects(() => recalculatePayRun(feb.payRuns[0].id), /Locked/);
await assert.rejects(() => deletePayRun(feb.payRuns[0].id), /Locked/);

await assert.rejects(
  () =>
    createPayRuns({
      mode: "client_batch",
      clientCompanyId: client.id,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-15",
    }),
  /full calendar month/,
);

console.log("payroll-lop.test.ts ok");
await pool.end();
