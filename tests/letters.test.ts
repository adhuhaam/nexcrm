import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { pool, db } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { letters } from "../lib/schema.ts";
import { createCompany, updateCompany } from "../modules/companies/companies.ts";
import { createLetter, getLetter, LetterError } from "../modules/documents/letters.ts";
import { createEmployeeRecord, updateEmployee } from "../modules/hr/employees.ts";

await migrate(pool);

const company = await createCompany({
  legalName: `LOA Co ${crypto.randomUUID().slice(0, 8)}`,
  registrationNumber: "C-TEST-1",
  registeredAddress: "Male",
  country: "Maldives",
  businessActivity: "Construction",
  phone: "+960 1111111",
  email: "loa@example.com",
  documentPrefix: "TST",
  signatoryName: "Signatory One",
  signatoryTitle: "Managing Director",
});

const incomplete = await createCompany({
  legalName: `Incomplete ${crypto.randomUUID().slice(0, 8)}`,
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

const employee = await createEmployeeRecord({
  companyId: company.id,
  legalName: "Aisha Mohamed",
  passportNumber: `P${crypto.randomUUID().slice(0, 8)}`,
  nationality: "Bangladeshi",
  occupation: "Helper",
  salary: "4500.00",
  permanentAddress: "Dhaka",
  emergencyContact: "Brother +880",
});

await assert.rejects(
  () =>
    createLetter({
      companyId: incomplete.id,
      employeeId: null,
      letterDate: "2026-11-02",
      terms: {
        workSite: null,
        siteCode: null,
        basicSalary: null,
        benefits: null,
        paidVacation: null,
        workingHours: null,
        contractDuration: null,
        employmentStatus: null,
      },
    }),
  (error: unknown) => error instanceof LetterError && /Cannot issue LOA/.test(error.message),
);

const other = await createCompany({
  legalName: `Other ${crypto.randomUUID().slice(0, 8)}`,
  registrationNumber: "C-OTHER",
  registeredAddress: "Male",
  country: "Maldives",
  businessActivity: "Services",
  phone: "+960 2222222",
  email: "other@example.com",
  documentPrefix: "OTH",
  signatoryName: "Other Signatory",
  signatoryTitle: "Director",
});

await assert.rejects(
  () =>
    createLetter({
      companyId: other.id,
      employeeId: employee.id,
      letterDate: "2026-11-02",
      terms: {
        workSite: "Site A",
        siteCode: null,
        basicSalary: "4500",
        benefits: "Food",
        paidVacation: "30 days",
        workingHours: "8 hours",
        contractDuration: "2 years",
        employmentStatus: "Full time",
      },
    }),
  (error: unknown) => error instanceof LetterError && /does not belong/.test(error.message),
);

const letter = await createLetter({
  companyId: company.id,
  employeeId: employee.id,
  letterDate: "2026-11-02",
  terms: {
    workSite: "Male Site",
    siteCode: "MS-1",
    basicSalary: "4500.00",
    benefits: "Accommodation and food",
    paidVacation: "30 days",
    workingHours: "48 hours / week with Friday rest",
    contractDuration: "2 years",
    employmentStatus: "Full time",
  },
});

assert.match(letter.documentNumber, /^TST\/LOA\/2026\/\d{4}$/);
assert.equal(letter.snapshot.company.phone, "+960 1111111");
assert.equal(letter.snapshot.employee.legalName, "Aisha Mohamed");
assert.equal(letter.snapshot.terms.workSite, "Male Site");

await updateCompany(company.id, { ...company, phone: "+960 9999999", legalName: `${company.legalName} Updated` });
await updateEmployee(employee.id, { ...employee, legalName: "Aisha Changed" });

const frozen = await getLetter(letter.id);
assert.ok(frozen);
assert.equal(frozen.snapshot.company.phone, "+960 1111111");
assert.equal(frozen.snapshot.employee.legalName, "Aisha Mohamed");
assert.equal(frozen.snapshot.company.legalName.includes("Updated"), false);

const second = await createLetter({
  companyId: company.id,
  employeeId: employee.id,
  letterDate: "2026-11-02",
  terms: {
    workSite: "Male Site 2",
    siteCode: "MS-2",
    basicSalary: "5000.00",
    benefits: "Food",
    paidVacation: "30 days",
    workingHours: "48 hours",
    contractDuration: "1 year",
    employmentStatus: "Full time",
  },
});
assert.notEqual(second.documentNumber, letter.documentNumber);

await assert.rejects(
  () =>
    createEmployeeRecord({
      companyId: company.id,
      legalName: "Duplicate Passport",
      passportNumber: employee.passportNumber,
    }),
  (error: unknown) => error instanceof Error && /passport already exists/.test(error.message),
);

await db.delete(letters).where(eq(letters.companyId, company.id));
await db.delete(letters).where(eq(letters.companyId, other.id));
await pool.query(
  "delete from employments where employee_id in (select id from employees where company_id = any($1::uuid[]))",
  [[company.id, other.id, incomplete.id]],
);
await pool.query("delete from employees where company_id = any($1::uuid[])", [[company.id, other.id, incomplete.id]]);
await pool.query("delete from document_sequences where company_id = any($1::uuid[])", [[company.id, other.id, incomplete.id]]);
await pool.query("delete from companies where id = any($1::uuid[])", [[company.id, other.id, incomplete.id]]);

await pool.end();
console.log("letter checks passed");
