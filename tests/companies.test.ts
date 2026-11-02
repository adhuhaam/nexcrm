import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { pool, db } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { companies, documentSnapshots } from "../lib/schema.ts";
import { createCompany, getCompany, updateCompany } from "../modules/companies/companies.ts";
import { getPreferences, setDefaultCompany, setSelectedCompany } from "../modules/companies/preferences.ts";
import { seedCompanies } from "../modules/companies/seed.ts";
import { issueBlockers } from "../modules/companies/validation.ts";
import { captureSnapshot, getSnapshot } from "../modules/documents/snapshots.ts";

await migrate(pool);
const seeded = await seedCompanies();
const seededAgain = await seedCompanies();
assert.equal(seededAgain.westford.id, seeded.westford.id);
assert.equal(seededAgain.nexstone.id, seeded.nexstone.id);
assert.notEqual(seeded.westford.id, seeded.nexstone.id);

assert.equal(seeded.westford.legalName, "Westford Engineering Pvt Ltd");
assert.equal(seeded.westford.phone, "+960 9505398");
assert.equal(seeded.westford.email, "westfordmv@gmail.com");
assert.equal(seeded.westford.registeredAddress, "Zabarujudhuge (1st), Mushtharee Magu, 20044, Kaafu, Malé");
assert.equal(seeded.westford.registrationNumber, null);
assert.equal(seeded.westford.signatoryName, null);
assert.equal(seeded.westford.signatoryTitle, null);
assert.ok(issueBlockers(seeded.westford).length >= 3);

const originalPhone = seeded.westford.phone;
await updateCompany(seeded.westford.id, { ...seeded.westford, phone: "+960 0000000" });
const preserved = await seedCompanies();
assert.equal(preserved.westford.phone, "+960 0000000");
await updateCompany(seeded.westford.id, { ...seeded.westford, phone: originalPhone });

const before = await getPreferences();
const selectedBefore = before.selectedCompanyId;
await setDefaultCompany(seeded.westford.id);
const afterDefault = await getPreferences();
assert.equal(afterDefault.defaultCompanyId, seeded.westford.id);
assert.equal(afterDefault.selectedCompanyId, selectedBefore);

await setSelectedCompany(seeded.nexstone.id);
await setDefaultCompany(seeded.westford.id);
const afterSwitch = await getPreferences();
assert.equal(afterSwitch.selectedCompanyId, seeded.nexstone.id);
assert.equal(afterSwitch.defaultCompanyId, seeded.westford.id);

const snapshot = await captureSnapshot(seeded.nexstone.id);
assert.ok(snapshot);
await updateCompany(seeded.nexstone.id, { ...seeded.nexstone, phone: "+960 1111111" });
const frozen = await getSnapshot(snapshot.id);
assert.equal(frozen?.snapshot.phone, null);
assert.equal(frozen?.snapshot.legalName, "Nexstone");
const live = await getCompany(seeded.nexstone.id);
assert.equal(live?.phone, "+960 1111111");
await updateCompany(seeded.nexstone.id, { ...seeded.nexstone, phone: null });

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

await pool.end();
console.log("company checks passed");
