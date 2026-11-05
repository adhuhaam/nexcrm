import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { letters, type LetterSnapshot } from "../../lib/schema.ts";
import { getCompany } from "../companies/companies.ts";
import { issueBlockers } from "../companies/validation.ts";
import { getEmployee } from "../hr/employees.ts";

export class LetterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LetterError";
  }
}

export type LetterTerms = {
  workSite: string | null;
  siteCode: string | null;
  basicSalary: string | null;
  benefits: string | null;
  paidVacation: string | null;
  workingHours: string | null;
  contractDuration: string | null;
  employmentStatus: string | null;
};

export type LetterCreateInput = {
  companyId: string;
  employeeId: string | null;
  letterDate: string;
  documentNumber?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  letterheadAddress?: string | null;
  phone?: string | null;
  email?: string | null;
  employeeOverride?: {
    legalName?: string | null;
    preferredName?: string | null;
    passportNumber?: string | null;
    nationality?: string | null;
    dateOfBirth?: string | null;
    gender?: string | null;
    permanentAddress?: string | null;
    emergencyContact?: string | null;
    occupation?: string | null;
    employmentStatus?: string | null;
  };
  terms: LetterTerms;
  createdBy?: string | null;
};

export type LetterRecord = {
  id: string;
  companyId: string;
  employeeId: string | null;
  documentNumber: string;
  letterDate: string;
  fingerprint: string;
  snapshot: LetterSnapshot;
  status: "issued" | "signed_archived";
  signedFileId: string | null;
  createdAt: string;
  employeeName: string | null;
  companyName: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requireDate(value: unknown, label: string): string {
  const text = emptyToNull(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new LetterError(`${label} must be YYYY-MM-DD`);
  return text;
}

function fingerprintOf(snapshot: LetterSnapshot): string {
  const payload = JSON.stringify(snapshot);
  return createHash("sha256").update(payload).digest("hex");
}

async function nextDocumentNumber(companyId: string, prefix: string | null, letterDate: string): Promise<string> {
  const year = Number(letterDate.slice(0, 4));
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ last_value: number }>(
      `select last_value from document_sequences
       where company_id = $1 and doc_type = 'LOA' and year = $2
       for update`,
      [companyId, year],
    );
    let next = 1;
    if (existing.rows[0]) {
      next = existing.rows[0].last_value + 1;
      await client.query(
        `update document_sequences set last_value = $1
         where company_id = $2 and doc_type = 'LOA' and year = $3`,
        [next, companyId, year],
      );
    } else {
      await client.query(
        `insert into document_sequences (company_id, doc_type, year, last_value)
         values ($1, 'LOA', $2, $3)`,
        [companyId, year, next],
      );
    }
    await client.query("commit");
    const stem = (prefix?.trim() || "NEX").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) || "NEX";
    return `${stem}/LOA/${year}/${String(next).padStart(4, "0")}`;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function freezeCompany(company: NonNullable<Awaited<ReturnType<typeof getCompany>>>): LetterSnapshot["company"] {
  return {
    companyId: company.id,
    legalName: company.legalName,
    registrationNumber: company.registrationNumber,
    tinNumber: company.tinNumber,
    registeredAddress: company.registeredAddress,
    country: company.country,
    businessActivity: company.businessActivity,
    phone: company.phone,
    email: company.email,
    documentPrefix: company.documentPrefix,
    signatoryName: company.signatoryName,
    signatoryTitle: company.signatoryTitle,
    letterheadFileId: company.letterheadFileId,
    sealFileId: company.sealFileId,
    signatureFileId: company.signatureFileId,
  };
}

export async function createLetter(input: LetterCreateInput): Promise<LetterRecord> {
  if (!uuidPattern.test(input.companyId)) throw new LetterError("Company is required");
  const company = await getCompany(input.companyId);
  if (!company) throw new LetterError("Company not found");
  const blockers = issueBlockers(company);
  if (blockers.length) throw new LetterError(`Cannot issue LOA: ${blockers.join("; ")}`);

  let employee = input.employeeId ? await getEmployee(input.employeeId) : null;
  if (input.employeeId && !employee) throw new LetterError("Employee not found");
  if (employee && employee.companyId !== input.companyId) {
    throw new LetterError("Employee does not belong to this company");
  }

  const letterDate = requireDate(input.letterDate, "Letter date");
  const override = input.employeeOverride ?? {};
  const legalName = emptyToNull(override.legalName) ?? employee?.legalName ?? null;
  if (!legalName) throw new LetterError("Employee name is required");

  const documentNumber =
    emptyToNull(input.documentNumber) ?? (await nextDocumentNumber(company.id, company.documentPrefix, letterDate));

  const snapshot: LetterSnapshot = {
    company: freezeCompany(company),
    employee: {
      id: employee?.id ?? null,
      legalName,
      preferredName: emptyToNull(override.preferredName) ?? employee?.preferredName ?? null,
      passportNumber: emptyToNull(override.passportNumber) ?? employee?.passportNumber ?? null,
      nationality: emptyToNull(override.nationality) ?? employee?.nationality ?? null,
      dateOfBirth: emptyToNull(override.dateOfBirth) ?? employee?.dateOfBirth ?? null,
      gender: emptyToNull(override.gender) ?? employee?.gender ?? null,
      permanentAddress: emptyToNull(override.permanentAddress) ?? employee?.permanentAddress ?? null,
      emergencyContact: emptyToNull(override.emergencyContact) ?? employee?.emergencyContact ?? null,
      occupation: emptyToNull(override.occupation) ?? employee?.occupation ?? null,
      employmentStatus: emptyToNull(override.employmentStatus) ?? employee?.employmentStatus ?? input.terms.employmentStatus,
    },
    terms: {
      workSite: emptyToNull(input.terms.workSite) ?? employee?.workSite ?? null,
      siteCode: emptyToNull(input.terms.siteCode) ?? employee?.siteCode ?? null,
      basicSalary: emptyToNull(input.terms.basicSalary) ?? employee?.salary ?? null,
      benefits: emptyToNull(input.terms.benefits) ?? employee?.benefits ?? null,
      paidVacation: emptyToNull(input.terms.paidVacation) ?? employee?.paidVacation ?? null,
      workingHours: emptyToNull(input.terms.workingHours) ?? employee?.workingHours ?? null,
      contractDuration: emptyToNull(input.terms.contractDuration) ?? employee?.contractDuration ?? null,
      employmentStatus: emptyToNull(input.terms.employmentStatus) ?? employee?.employmentStatus ?? null,
    },
    documentNumber,
    letterDate,
    signatoryName: emptyToNull(input.signatoryName) ?? company.signatoryName,
    signatoryTitle: emptyToNull(input.signatoryTitle) ?? company.signatoryTitle,
    letterheadAddress: emptyToNull(input.letterheadAddress) ?? company.registeredAddress,
    phone: emptyToNull(input.phone) ?? company.phone,
    email: emptyToNull(input.email) ?? company.email,
    letterheadFileId: company.letterheadFileId,
    sealFileId: company.sealFileId,
    signatureFileId: company.signatureFileId,
  };

  const fingerprint = fingerprintOf(snapshot);
  const duplicate = await pool.query<{ id: string }>(
    `select id from letters where company_id = $1 and fingerprint = $2 limit 1`,
    [company.id, fingerprint],
  );
  if (duplicate.rows[0]) {
    const existing = await getLetter(duplicate.rows[0].id);
    if (existing) return existing;
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(letters).values({
      id,
      companyId: company.id,
      employeeId: employee?.id ?? null,
      documentNumber,
      letterDate,
      fingerprint,
      snapshot,
      createdBy: input.createdBy && uuidPattern.test(input.createdBy) ? input.createdBy : null,
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new LetterError("Document number already exists for this company");
    }
    throw error;
  }

  const created = await getLetter(id);
  if (!created) throw new LetterError("Could not save letter");
  return created;
}

export async function getLetter(id: string): Promise<LetterRecord | null> {
  const result = await pool.query<{
    id: string;
    company_id: string;
    employee_id: string | null;
    document_number: string;
    letter_date: string;
    fingerprint: string;
    snapshot: LetterSnapshot;
    status: "issued" | "signed_archived";
    signed_file_id: string | null;
    created_at: string;
    employee_name: string | null;
    company_name: string;
  }>(
    `select
      letters.id,
      letters.company_id,
      letters.employee_id,
      letters.document_number,
      letters.letter_date::text,
      letters.fingerprint,
      letters.snapshot,
      coalesce(letters.status, 'issued') as status,
      letters.signed_file_id,
      letters.created_at::text,
      coalesce(employees.legal_name, letters.snapshot->'employee'->>'legalName') as employee_name,
      companies.legal_name as company_name
    from letters
    inner join companies on companies.id = letters.company_id
    left join employees on employees.id = letters.employee_id
    where letters.id = $1
    limit 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    documentNumber: row.document_number,
    letterDate: row.letter_date,
    fingerprint: row.fingerprint,
    snapshot: row.snapshot,
    status: row.status === "signed_archived" ? "signed_archived" : "issued",
    signedFileId: row.signed_file_id,
    createdAt: row.created_at,
    employeeName: row.employee_name,
    companyName: row.company_name,
  };
}

export async function listLetters(filters?: { companyId?: string | null; q?: string | null }): Promise<LetterRecord[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters?.companyId && uuidPattern.test(filters.companyId)) {
    params.push(filters.companyId);
    where.push(`letters.company_id = $${params.length}`);
  }
  if (filters?.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const i = params.length;
    where.push(
      `(letters.document_number ilike $${i}
        or coalesce(employees.legal_name, letters.snapshot->'employee'->>'legalName') ilike $${i}
        or letters.snapshot->'employee'->>'passportNumber' ilike $${i})`,
    );
  }
  const result = await pool.query<{
    id: string;
    company_id: string;
    employee_id: string | null;
    document_number: string;
    letter_date: string;
    fingerprint: string;
    snapshot: LetterSnapshot;
    status: "issued" | "signed_archived";
    signed_file_id: string | null;
    created_at: string;
    employee_name: string | null;
    company_name: string;
  }>(
    `select
      letters.id,
      letters.company_id,
      letters.employee_id,
      letters.document_number,
      letters.letter_date::text,
      letters.fingerprint,
      letters.snapshot,
      coalesce(letters.status, 'issued') as status,
      letters.signed_file_id,
      letters.created_at::text,
      coalesce(employees.legal_name, letters.snapshot->'employee'->>'legalName') as employee_name,
      companies.legal_name as company_name
    from letters
    inner join companies on companies.id = letters.company_id
    left join employees on employees.id = letters.employee_id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by letters.created_at desc
    limit 200`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    documentNumber: row.document_number,
    letterDate: row.letter_date,
    fingerprint: row.fingerprint,
    snapshot: row.snapshot,
    status: row.status === "signed_archived" ? "signed_archived" : "issued",
    signedFileId: row.signed_file_id,
    createdAt: row.created_at,
    employeeName: row.employee_name,
    companyName: row.company_name,
  }));
}

export async function countLetters(): Promise<number> {
  const rows = await db.select({ value: sql<number>`count(*)::int` }).from(letters);
  return rows[0]?.value ?? 0;
}

export async function recentLetters(limit = 5): Promise<LetterRecord[]> {
  const all = await listLetters();
  return all.slice(0, limit);
}

export async function previewDocumentNumber(companyId: string): Promise<string> {
  const company = await getCompany(companyId);
  if (!company) throw new LetterError("Company not found");
  const year = new Date().getFullYear();
  const result = await pool.query<{ last_value: number }>(
    `select last_value from document_sequences
     where company_id = $1 and doc_type = 'LOA' and year = $2`,
    [companyId, year],
  );
  const next = (result.rows[0]?.last_value ?? 0) + 1;
  const stem = (company.documentPrefix?.trim() || "NEX").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) || "NEX";
  return `${stem}/LOA/${year}/${String(next).padStart(4, "0")}`;
}

export { fingerprintOf };
