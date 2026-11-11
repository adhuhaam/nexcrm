import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { buildEmployeeFolderName, resolveFilesRoot } from "../modules/files/paths.ts";
import { ensureFileRoot, storeBuffer } from "../modules/files/storage.ts";
import { createEmployeeRecord } from "../modules/hr/employees.ts";
import { createCompany } from "../modules/companies/companies.ts";

await migrate(pool);

const stamp = Date.now();

const employer = await createCompany({
  legalName: `Files Test Employer ${stamp}`,
  kind: "employer",
  registrationNumber: null,
  registeredAddress: "Male",
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
  legalName: "Ali Hassan",
  passportNumber: "MV123456",
});
const noPassport = await createEmployeeRecord({
  companyId: employer.id,
  legalName: "No PP Worker",
  passportNumber: null,
});

const folder1 = buildEmployeeFolderName({
  id: employee.id,
  legalName: employee.legalName,
  passportNumber: employee.passportNumber,
});
assert.match(folder1, /^Ali_Hassan_MV123456_/);
assert.ok(folder1.endsWith(employee.id));

const folder2 = buildEmployeeFolderName({
  id: noPassport.id,
  legalName: noPassport.legalName,
  passportNumber: null,
});
assert.match(folder2, /_no-passport_/);

const root = await ensureFileRoot();
const stored = await storeBuffer({
  buffer: Buffer.from(`doc-${stamp}`),
  originalName: "passport.png",
  mimeType: "image/png",
  kind: "passport_scan",
  entityType: "employee",
  entityId: employee.id,
  employeeIdForPath: employee.id,
});
assert.ok(stored.storedPath.startsWith(`${folder1}/`));
await access(join(root, ...stored.storedPath.split("/")));

const renamed = buildEmployeeFolderName({
  id: employee.id,
  legalName: "Ali H. Renamed",
  passportNumber: "MV123456",
});
assert.ok(renamed.endsWith(employee.id));
assert.notEqual(renamed.split("_")[0], folder1.split("_")[0]);

console.log("files-storage.test.ts ok — root:", resolveFilesRoot());
await pool.end();
