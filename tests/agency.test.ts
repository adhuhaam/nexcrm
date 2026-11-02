import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createCompany, listCompanies } from "../modules/companies/companies.ts";
import { createEmployeeRecord } from "../modules/hr/employees.ts";
import {
  changeAllocationRates,
  createAllocation,
  headcountByClient,
  resignAllocation,
} from "../modules/hr/allocations.ts";
import { createPayRun, lockPayRun } from "../modules/hr/payroll.ts";
import { ensureFileRoot, listEntityFiles, storeBuffer } from "../modules/files/storage.ts";

loadEnv();
await migrate(pool);
await ensureFileRoot();

const stamp = Date.now();
const employer =
  (await listCompanies("employer"))[0] ??
  (await createCompany({
    kind: "employer",
    legalName: `Agency Employer ${stamp}`,
    registrationNumber: "REG-1",
    registeredAddress: "Male",
    country: "MV",
    businessActivity: null,
    phone: null,
    email: null,
    documentPrefix: "TST",
    signatoryName: "Signatory",
    signatoryTitle: "Director",
  }));

const client = await createCompany({
  kind: "client",
  legalName: `Client Co ${stamp}`,
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
  legalName: `Worker ${stamp}`,
  preferredName: null,
  passportNumber: `P${stamp}`,
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
  salary: "5000",
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
  joinDate: "2026-01-01",
  designation: "Site technician",
  staffSalary: "5000.00",
  billRate: "7500.00",
  currency: "MVR",
});
assert.equal(allocation.status, "active");
assert.equal(allocation.staffSalary, "5000.00");
assert.equal(allocation.billRate, "7500.00");

const rated = await changeAllocationRates(allocation.id, {
  staffSalary: "5200.00",
  billRate: "7800.00",
});
assert.equal(rated.staffSalary, "5200.00");
assert.equal(rated.billRate, "7800.00");

const headcount = await headcountByClient();
assert.ok(headcount.some((row) => row.clientCompanyId === client.id && row.activeCount >= 1));

const payRun = await createPayRun({
  clientCompanyId: client.id,
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
});
assert.equal(payRun.status, "draft");
assert.ok(payRun.items.length >= 1);
assert.equal(payRun.items[0].staffSalary, "5200.00");
assert.equal(payRun.items[0].billRate, "7800.00");

const locked = await lockPayRun(payRun.id);
assert.equal(locked.status, "locked");
await assert.rejects(() => lockPayRun(payRun.id), /already locked/);

const ended = await resignAllocation(allocation.id, "2026-02-01");
assert.equal(ended.status, "ended");
assert.equal(ended.resignDate, "2026-02-01");

const root = await ensureFileRoot();
const sample = Buffer.from(`passport-scan-${stamp}`);
const stored = await storeBuffer({
  buffer: sample,
  originalName: "passport.png",
  mimeType: "image/png",
  kind: "passport_scan",
  entityType: "employee",
  entityId: employee.id,
  label: "Passport scan",
  employeeIdForPath: employee.id,
});
assert.ok(stored.id);
const linked = await listEntityFiles("employee", employee.id);
assert.ok(linked.some((file) => file.id === stored.id));
await mkdir(join(root, "probe"), { recursive: true });
await writeFile(join(root, "probe", "ok.txt"), "ok");

console.log("agency.test.ts ok");
await pool.end();
