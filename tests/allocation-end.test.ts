import assert from "node:assert/strict";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createCompany, listCompanies } from "../modules/companies/companies.ts";
import { createEmployeeRecord } from "../modules/hr/employees.ts";
import { createAllocation, endAllocation } from "../modules/hr/allocations.ts";
import { getMonthSheet, saveEmployeeMonth } from "../modules/hr/attendance.ts";
import { createPayRuns } from "../modules/hr/payroll.ts";

loadEnv();
await migrate(pool);

const stamp = Date.now();

const employer =
  (await listCompanies("employer"))[0] ??
  (await createCompany({
    kind: "employer",
    legalName: `End Emp ${stamp}`,
    registrationNumber: "END-E",
    registeredAddress: "Male",
    country: "MV",
    businessActivity: null,
    phone: null,
    email: null,
    documentPrefix: "END",
    signatoryName: "Signatory",
    signatoryTitle: "Director",
  }));

const client = await createCompany({
  kind: "client",
  legalName: `End Client ${stamp}`,
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

const employee = await createEmployeeRecord({
  companyId: employer.id,
  legalName: `End Worker ${stamp}`,
  preferredName: null,
  passportNumber: `E${stamp}`,
  passportIssueDate: null,
  passportExpiry: null,
  nationality: "BD",
  dateOfBirth: "1990-01-01",
  gender: "M",
  permanentAddress: null,
  emergencyContact: null,
  occupation: "Technician",
  employmentStatus: "Active",
  projectId: null,
  siteId: null,
  quotaPoolId: null,
  workSite: null,
  siteCode: null,
  salary: "3100",
  benefits: null,
  paidVacation: null,
  workingHours: null,
  contractDuration: null,
  country: null,
  origin: null,
});

const allocation = await createAllocation({
  employeeId: employee.id,
  clientCompanyId: client.id,
  joinDate: "2026-03-01",
  designation: "Tech",
  staffSalary: "3100.00",
  billRate: "6200.00",
  currency: "MVR",
});

const days: Record<string, string> = {};
for (let d = 1; d <= 31; d++) days[String(d)] = "P";
await saveEmployeeMonth({ employeeId: employee.id, year: 2026, month: 3, days, createdBy: null });

const ended = await endAllocation(allocation.id, {
  endDate: "2026-03-15",
  reason: "terminate",
  note: "Client request",
});
assert.equal(ended.status, "ended");
assert.equal(ended.endReason, "terminate");
assert.equal(ended.resignDate, "2026-03-15");
assert.ok(ended.attendance.clearedAfterEnd >= 16); // 16–31 cleared

const sheet = await getMonthSheet({ year: 2026, month: 3, companyId: employer.id, q: employee.legalName });
const row = sheet.rows.find((r) => r.employeeId === employee.id);
assert.ok(row);
assert.equal(row!.days["15"], "P");
assert.equal(row!.days["16"], "");
assert.equal(row!.days["31"], "");

// Mid-period ended allocation still appears in March payroll
const pay = await createPayRuns({
  mode: "employer_client",
  clientCompanyId: client.id,
  employerCompanyId: employer.id,
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
});
const item = pay.payRuns[0].items.find((i) => i.employeeId === employee.id);
assert.ok(item);
assert.equal(item!.calendarDays, 15);
assert.equal(item!.paidDays, 15);

// Lost marks AB range
const employee2 = await createEmployeeRecord({
  companyId: employer.id,
  legalName: `Lost Worker ${stamp}`,
  preferredName: null,
  passportNumber: `L${stamp}`,
  passportIssueDate: null,
  passportExpiry: null,
  nationality: "BD",
  dateOfBirth: "1991-01-01",
  gender: "M",
  permanentAddress: null,
  emergencyContact: null,
  occupation: "Technician",
  employmentStatus: "Active",
  projectId: null,
  siteId: null,
  quotaPoolId: null,
  workSite: null,
  siteCode: null,
  salary: "3100",
  benefits: null,
  paidVacation: null,
  workingHours: null,
  contractDuration: null,
  country: null,
  origin: null,
});
const alloc2 = await createAllocation({
  employeeId: employee2.id,
  clientCompanyId: client.id,
  joinDate: "2026-04-01",
  designation: "Tech",
  staffSalary: "3100.00",
  billRate: "6200.00",
});
const april: Record<string, string> = {};
for (let d = 1; d <= 30; d++) april[String(d)] = "P";
await saveEmployeeMonth({ employeeId: employee2.id, year: 2026, month: 4, days: april, createdBy: null });

const lost = await endAllocation(alloc2.id, {
  endDate: "2026-04-20",
  reason: "lost",
  absentFrom: "2026-04-10",
  note: "Absconded",
});
assert.equal(lost.endReason, "lost");
assert.ok(lost.attendance.markedAbsent >= 11);
assert.ok(lost.attendance.clearedAfterEnd >= 10);

const aprilSheet = await getMonthSheet({ year: 2026, month: 4, companyId: employer.id, q: employee2.legalName });
const lostRow = aprilSheet.rows.find((r) => r.employeeId === employee2.id);
assert.ok(lostRow);
assert.equal(lostRow!.days["9"], "P");
assert.equal(lostRow!.days["10"], "AB");
assert.equal(lostRow!.days["20"], "AB");
assert.equal(lostRow!.days["21"], "");

console.log("allocation-end.test.ts ok");
await pool.end();
