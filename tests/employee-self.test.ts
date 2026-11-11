import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { seedRoles, hashPassword, openSession } from "../modules/access/access.ts";
import { upsertEmployeeSelfServiceAccount } from "../modules/employee-self/accounts.ts";
import { getDashboard, changePassword } from "../modules/employee-self/service.ts";

await migrate(pool);
await seedRoles();

const companyId = randomUUID();
await pool.query(
  `insert into companies (id, kind, legal_name) values ($1, 'employer', 'Test Employer')`,
  [companyId],
);

const employeeId = randomUUID();
await pool.query(
  `insert into employees (id, company_id, legal_name) values ($1, $2, 'Self Service Worker')`,
  [employeeId, companyId],
);

const phone = "9607771234";
const tempPassword = "temp-pass-8";
await upsertEmployeeSelfServiceAccount({ employeeId, phone, password: tempPassword });

const opened = await openSession(phone, tempPassword);
assert.ok(opened?.user.employeeId === employeeId);
assert.equal(opened?.user.mustChangePassword, true);

const dashboard = await getDashboard(employeeId);
assert.equal(dashboard.attendanceThisMonth.month.length, 7);

await changePassword(opened!.user.id, employeeId, tempPassword, "new-pass-9");
const reopened = await openSession(phone, "new-pass-9");
assert.ok(reopened);
assert.equal(reopened?.user.mustChangePassword, false);

await pool.end();
console.log("employee-self ok");
