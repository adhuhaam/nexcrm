import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { seedRoles } from "../modules/access/access.ts";
import { upsertPortalAccount } from "../modules/portal/accounts.ts";
import { clientWorkers } from "../modules/portal/client.ts";
import { employerEmployees } from "../modules/portal/employer.ts";
await migrate(pool);
await seedRoles();

const employerA = randomUUID();
const employerB = randomUUID();
const clientA = randomUUID();
const clientB = randomUUID();

await pool.query(
  `insert into companies (id, kind, legal_name) values
   ($1, 'employer', 'Portal Employer A'),
   ($2, 'employer', 'Portal Employer B'),
   ($3, 'client', 'Portal Client A'),
   ($4, 'client', 'Portal Client B')`,
  [employerA, employerB, clientA, clientB],
);

const employeeA = randomUUID();
const employeeB = randomUUID();
await pool.query(
  `insert into employees (id, company_id, legal_name) values ($1, $2, 'Worker A'), ($3, $4, 'Worker B')`,
  [employeeA, employerA, employeeB, employerB],
);

await pool.query(
  `insert into client_allocations (id, employee_id, employer_company_id, client_company_id, join_date, staff_salary, bill_rate, status)
   values (gen_random_uuid(), $1, $2, $3, current_date, 1000, 1500, 'active')`,
  [employeeA, employerA, clientA],
);

const listA = await employerEmployees(employerA);
assert.equal(listA.items.length, 1);
assert.equal(listA.items[0]?.id, employeeA);

const listB = await employerEmployees(employerB);
assert.equal(listB.items.length, 1);
assert.equal(listB.items[0]?.id, employeeB);
assert.notEqual(listB.items[0]?.id, employeeA);

const workersA = await clientWorkers(clientA);
assert.equal(workersA.items.length, 1);
assert.equal(workersA.items[0]?.employeeId, employeeA);

const workersB = await clientWorkers(clientB);
assert.equal(workersB.items.length, 0);

await upsertPortalAccount({
  companyId: employerA,
  email: "employer-a@example.com",
  password: "portal-pass-1",
  name: "Employer A Login",
});

await assert.rejects(
  () =>
    upsertPortalAccount({
      companyId: clientA,
      email: "employer-a@example.com",
      password: "portal-pass-2",
      name: "Wrong link",
    }),
  (error: unknown) => error instanceof Error && /already used/i.test(error.message),
);

const crossEmployer = await employerEmployees(clientA);
assert.equal(crossEmployer.items.length, 0);

await pool.end();
console.log("portal-scope ok");
