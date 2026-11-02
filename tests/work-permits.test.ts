import assert from "node:assert/strict";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createCompany } from "../modules/companies/companies.ts";
import { getWorkPermit, parseWorkPermit, saveWorkPermit } from "../modules/hr/work-permits.ts";

await migrate(pool);

const company = await createCompany({
  legalName: `Permit Co ${crypto.randomUUID()}`,
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
const number = `WP-${crypto.randomUUID()}`;
const input = parseWorkPermit({
  companyId: company.id,
  legalName: "Permit Holder",
  workPermitNumber: number,
  nationality: "Bangladesh",
  passportNumber: "P123",
  occupation: "Electrician",
  issuedOn: "2026-01-01",
  expiresOn: "2027-01-01",
  salary: "450",
});
const id = await saveWorkPermit(input);
const saved = await getWorkPermit(id);
assert.equal(saved?.legalName, "Permit Holder");
assert.equal(saved?.nationality, "Bangladesh");
assert.equal(saved?.occupation, "Electrician");
assert.equal(saved?.issuedOn, "2026-01-01");
assert.equal(saved?.expiresOn, "2027-01-01");
assert.equal(Number(saved?.salary), 450);
assert.equal(saved?.linkedSlot, null);
await assert.rejects(() => saveWorkPermit({ ...input, legalName: "Other holder" }), /already recorded/);
await assert.rejects(async () => parseWorkPermit({ companyId: company.id, legalName: "Permit Holder", issuedOn: "not-a-date" }), /must be a date/);

await pool.query("delete from employees where id = $1", [id]);
await pool.query("delete from companies where id = $1", [company.id]);
await pool.end();
console.log("work permit checks passed");
