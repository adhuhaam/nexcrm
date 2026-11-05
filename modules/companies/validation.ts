export type CompanyKind = "employer" | "client";

export type CompanyInput = {
  kind: CompanyKind;
  legalName: string;
  registrationNumber: string | null;
  tinNumber: string | null;
  registeredAddress: string | null;
  country: string | null;
  businessActivity: string | null;
  phone: string | null;
  email: string | null;
  documentPrefix: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
};

export class CompanyValidationError extends Error {
  readonly field: keyof CompanyInput;

  constructor(message: string, field: keyof CompanyInput) {
    super(message);
    this.name = "CompanyValidationError";
    this.field = field;
  }
}

function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function bounded(value: string | null, field: keyof CompanyInput, max: number): string | null {
  if (value && value.length > max) {
    throw new CompanyValidationError(`${field} is too long`, field);
  }
  return value;
}

export function parseCompanyInput(record: Record<string, unknown>): CompanyInput {
  const legalName = emptyToNull(record.legalName);
  if (!legalName) {
    throw new CompanyValidationError("Legal name is required", "legalName");
  }
  const kindRaw = emptyToNull(record.kind) ?? "employer";
  if (kindRaw !== "employer" && kindRaw !== "client") {
    throw new CompanyValidationError("Kind must be employer or client", "kind");
  }
  const email = bounded(emptyToNull(record.email), "email", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CompanyValidationError("Email is not valid", "email");
  }
  return {
    kind: kindRaw,
    legalName: bounded(legalName, "legalName", 200) ?? "",
    registrationNumber: bounded(emptyToNull(record.registrationNumber), "registrationNumber", 100),
    tinNumber: bounded(emptyToNull(record.tinNumber), "tinNumber", 80),
    registeredAddress: bounded(emptyToNull(record.registeredAddress), "registeredAddress", 500),
    country: bounded(emptyToNull(record.country), "country", 100),
    businessActivity: bounded(emptyToNull(record.businessActivity), "businessActivity", 200),
    phone: bounded(emptyToNull(record.phone), "phone", 50),
    email,
    documentPrefix: bounded(emptyToNull(record.documentPrefix), "documentPrefix", 20),
    signatoryName: bounded(emptyToNull(record.signatoryName), "signatoryName", 200),
    signatoryTitle: bounded(emptyToNull(record.signatoryTitle), "signatoryTitle", 200),
  };
}

export function issueBlockers(company: CompanyInput): string[] {
  if (company.kind === "client") return [];
  const blockers: string[] = [];
  if (!company.registrationNumber) blockers.push("Registration number is missing");
  if (!company.signatoryName) blockers.push("Authorized signatory is missing");
  if (!company.signatoryTitle) blockers.push("Signatory title is missing");
  return blockers;
}
