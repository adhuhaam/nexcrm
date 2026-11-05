import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { pool, db } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { companies, documentSnapshots } from "../lib/schema.ts";
import { createCompany, getCompany, updateCompany } from "../modules/companies/companies.ts";
import { getPreferences, setDefaultCompany, setSelectedCompany } from "../modules/companies/preferences.ts";
import { issueBlockers } from "../modules/companies/validation.ts";
import { captureSnapshot, getSnapshot } from "../modules/documents/snapshots.ts";

await migrate(pool);

const stamp = crypto.randomUUID().slice(0, 8);

const westford = await createCompany({
  kind: "employer",
  legalName: `Test Employer ${stamp}`,
  registrationNumber: null,
  registeredAddress: "Male",
  country: "MV",
  businessActivity: null,
  phone: "+960 9505398",
  email: "test@example.com",
  documentPrefix: null,
  signatoryName: null,
  signatoryTitle: null,
});

const nexstone = await createCompany({
  kind: "employer",
  legalName: `Test Client Co ${stamp}`,
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

assert.notEqual(westford.id, nexstone.id);
assert.ok(issueBlockers(westford).length >= 1);

const originalPhone = westford.phone;
await updateCompany(westford.id, { ...westford, phone: "+960 0000000" });
const reloaded = await getCompany(westford.id);
assert.equal(reloaded?.phone, "+960 0000000");
await updateCompany(westford.id, { ...westford, phone: originalPhone });

await setSelectedCompany(nexstone.id);
await setDefaultCompany(westford.id);
const afterSwitch = await getPreferences();
assert.equal(afterSwitch.selectedCompanyId, nexstone.id);
assert.equal(afterSwitch.defaultCompanyId, westford.id);

const snapshot = await captureSnapshot(nexstone.id);
assert.ok(snapshot);
await updateCompany(nexstone.id, { ...nexstone, phone: "+960 1111111" });
const frozen = await getSnapshot(snapshot.id);
assert.equal(frozen?.snapshot.phone, null);
assert.equal(frozen?.snapshot.legalName, nexstone.legalName);
const live = await getCompany(nexstone.id);
assert.equal(live?.phone, "+960 1111111");
await updateCompany(nexstone.id, { ...nexstone, phone: null });

const temporary = await createCompany({
  legalName: `Temporary ${crypto.randomUUID()}`,
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
const temporarySnapshot = await captureSnapshot(temporary.id);
assert.ok(temporarySnapshot);
await assert.rejects(() => db.delete(companies).where(eq(companies.id, temporary.id)));
await db.delete(documentSnapshots).where(eq(documentSnapshots.id, temporarySnapshot.id));
await db.delete(companies).where(eq(companies.id, temporary.id));

await assert.rejects(() =>
  createCompany({
    legalName: " ",
    registrationNumber: null,
    registeredAddress: null,
    country: null,
    businessActivity: null,
    phone: null,
    email: null,
    documentPrefix: null,
    signatoryName: null,
    signatoryTitle: null,
  }),
);

// Clean companies created by this test so they do not pollute the office DB.
await db.delete(documentSnapshots).where(eq(documentSnapshots.id, snapshot.id));
await db.delete(companies).where(eq(companies.id, westford.id));
await db.delete(companies).where(eq(companies.id, nexstone.id));

await pool.end();
console.log("company checks passed");
