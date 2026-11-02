import assert from "node:assert/strict";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createCompany } from "../modules/companies/companies.ts";
import { createEmployee } from "../modules/hr/employees.ts";
import {
  addQuotaPool,
  addSite,
  createProject,
  getProjectView,
  openSlot,
  openSlotForName,
  ProjectError,
} from "../modules/projects/projects.ts";

await migrate(pool);

const company = await createCompany({
  legalName: `Project Co ${crypto.randomUUID()}`,
  registrationNumber: null,
  registeredAddress: null,
  country: null,
  businessActivity: null,
  phone: null,
  email: null,
  documentPrefix: null,
  signatoryName: null,
  signatoryTitle: null,
});
const other = await createCompany({
  legalName: `Other Co ${crypto.randomUUID()}`,
  registrationNumber: null,
  registeredAddress: null,
  country: null,
  businessActivity: null,
  phone: null,
  email: null,
  documentPrefix: null,
  signatoryName: null,
  signatoryTitle: null,
});
const project = await createProject(company.id, "Harbour works");
await addSite(project.id, "Malé site");
const view = await getProjectView(project.id);
assert.ok(view);
const site = view.sites[0];
await addQuotaPool(project.id, site.id, "Internal pool", 1);
const withPool = await getProjectView(project.id);
assert.ok(withPool);
assert.equal(withPool.slots.length, 1);
assert.equal(withPool.slots[0].status, "open");
const poolId = withPool.pools[0].id;
const first = await createEmployee(company.id, "Aisha");
const second = await createEmployee(company.id, "Hassan");
const outsider = await createEmployee(other.id, "Outsider");

await openSlot(project.id, poolId, first.id);
await assert.rejects(() => openSlot(project.id, poolId, second.id), /no open place/);
await assert.rejects(() => openSlot(project.id, poolId, outsider.id), /another company/);
await assert.rejects(() => openSlotForName(project.id, poolId, "Unplaced"), /no open place/);
const leftover = await pool.query<{ n: number }>("select count(*)::int as n from employees where legal_name = $1", ["Unplaced"]);
assert.equal(leftover.rows[0].n, 0);

const parallelProject = await createProject(company.id, "Parallel works");
await addSite(parallelProject.id, "Hulhumalé site");
const parallelView = await getProjectView(parallelProject.id);
assert.ok(parallelView);
await addQuotaPool(parallelProject.id, parallelView.sites[0].id, "Race pool", 1);
const raceView = await getProjectView(parallelProject.id);
assert.ok(raceView);
const racePool = raceView.pools[0].id;
const left = await createEmployee(company.id, "Left");
const right = await createEmployee(company.id, "Right");
const raced = await Promise.allSettled([
  openSlot(parallelProject.id, racePool, left.id),
  openSlot(parallelProject.id, racePool, right.id),
]);
assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
const failed = raced.find((result) => result.status === "rejected");
assert.ok(failed && failed.status === "rejected");
assert.match(failed.reason instanceof ProjectError ? failed.reason.message : "", /no open place/);

const filled = await getProjectView(project.id);
assert.equal(filled?.slots.length, 1);
assert.equal(filled?.slots[0].employeeName, "Aisha");
assert.equal(filled?.pools[0].used, 1);

await pool.query("delete from projects where id = any($1::uuid[])", [[project.id, parallelProject.id]]);
await pool.query("delete from employees where company_id = any($1::uuid[])", [[company.id, other.id]]);
await pool.query("delete from companies where id = any($1::uuid[])", [[company.id, other.id]]);

await pool.end();
console.log("project checks passed");
