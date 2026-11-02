import { createCompany, findCompanyByLegalName, type CompanyRecord } from "./companies.ts";
import type { CompanyInput } from "./validation.ts";

const westford: CompanyInput = {
  kind: "employer",
  legalName: "Westford Engineering Pvt Ltd",
  registrationNumber: null,
  registeredAddress: "Zabarujudhuge (1st), Mushtharee Magu, 20044, Kaafu, Malé",
  country: null,
  businessActivity: null,
  phone: "+960 9505398",
  email: "westfordmv@gmail.com",
  documentPrefix: null,
  signatoryName: null,
  signatoryTitle: null,
};

const nexstone: CompanyInput = {
  kind: "employer",
  legalName: "Nexstone",
  registrationNumber: null,
  registeredAddress: null,
  country: null,
  businessActivity: null,
  phone: null,
  email: null,
  documentPrefix: null,
  signatoryName: null,
  signatoryTitle: null,
};

async function ensureCompany(input: CompanyInput): Promise<CompanyRecord> {
  const existing = await findCompanyByLegalName(input.legalName);
  if (existing) return existing;
  return createCompany(input);
}

export async function seedCompanies(): Promise<{ westford: CompanyRecord; nexstone: CompanyRecord }> {
  return {
    westford: await ensureCompany(westford),
    nexstone: await ensureCompany(nexstone),
  };
}
