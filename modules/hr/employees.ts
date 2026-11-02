import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { companies, employees, employments, projects, quotaPools, sites } from "../../lib/schema.ts";

export class EmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeError";
  }
}

export type EmployeeInput = {
  companyId: string;
  legalName: string;
  preferredName: string | null;
  passportNumber: string | null;
  passportIssueDate: string | null;
  passportExpiry: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  permanentAddress: string | null;
  emergencyContact: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  projectId: string | null;
  siteId: string | null;
  quotaPoolId: string | null;
  workSite: string | null;
  siteCode: string | null;
  salary: string | null;
  benefits: string | null;
  paidVacation: string | null;
  workingHours: string | null;
  contractDuration: string | null;
  country: string | null;
  origin: string | null;
};

export type EmployeeRecord = EmployeeInput & {
  id: string;
  companyName: string;
  projectName: string | null;
  siteName: string | null;
  quotaPoolName: string | null;
  photoFileId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeListItem = {
  id: string;
  companyId: string;
  companyName: string;
  legalName: string;
  passportNumber: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  nationality: string | null;
  photoFileId: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function bounded(value: string | null, label: string, max: number): string | null {
  if (value && value.length > max) throw new EmployeeError(`${label} is too long`);
  return value;
}

function dateOrNull(value: unknown, label: string): string | null {
  const text = emptyToNull(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new EmployeeError(`${label} must be YYYY-MM-DD`);
  return text;
}

function uuidOrNull(value: unknown, label: string): string | null {
  const text = emptyToNull(value);
  if (!text) return null;
  if (!uuidPattern.test(text)) throw new EmployeeError(`${label} is not valid`);
  return text;
}

function normalizePassport(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, "").toUpperCase();
}

export function parseEmployeeInput(record: Record<string, unknown>): EmployeeInput {
  const companyId = emptyToNull(record.companyId);
  if (!companyId || !uuidPattern.test(companyId)) throw new EmployeeError("Company is required");
  const legalName = emptyToNull(record.legalName);
  if (!legalName) throw new EmployeeError("Full name is required");
  const salary = emptyToNull(record.salary);
  if (salary && !/^\d+(\.\d{1,2})?$/.test(salary)) throw new EmployeeError("Salary must be a number");
  return {
    companyId,
    legalName: bounded(legalName, "Full name", 200) ?? "",
    preferredName: bounded(emptyToNull(record.preferredName), "Preferred name", 200),
    passportNumber: bounded(emptyToNull(record.passportNumber), "Passport number", 80),
    passportIssueDate: dateOrNull(record.passportIssueDate, "Passport issue date"),
    passportExpiry: dateOrNull(record.passportExpiry, "Passport expiry"),
    nationality: bounded(emptyToNull(record.nationality), "Nationality", 100),
    dateOfBirth: dateOrNull(record.dateOfBirth, "Date of birth"),
    gender: bounded(emptyToNull(record.gender), "Gender", 40),
    permanentAddress: bounded(emptyToNull(record.permanentAddress), "Permanent address", 500),
    emergencyContact: bounded(emptyToNull(record.emergencyContact), "Emergency contact", 300),
    occupation: bounded(emptyToNull(record.occupation), "Position", 200),
    employmentStatus: bounded(emptyToNull(record.employmentStatus), "Employment status", 100),
    projectId: uuidOrNull(record.projectId, "Project"),
    siteId: uuidOrNull(record.siteId, "Site"),
    quotaPoolId: uuidOrNull(record.quotaPoolId, "Quota pool"),
    workSite: bounded(emptyToNull(record.workSite), "Work site", 200),
    siteCode: bounded(emptyToNull(record.siteCode), "Site ID", 80),
    salary,
    benefits: bounded(emptyToNull(record.benefits), "Benefits", 500),
    paidVacation: bounded(emptyToNull(record.paidVacation), "Paid vacation", 200),
    workingHours: bounded(emptyToNull(record.workingHours), "Working hours", 300),
    contractDuration: bounded(emptyToNull(record.contractDuration), "Contract duration", 200),
    country: bounded(emptyToNull(record.country), "Country", 100),
    origin: bounded(emptyToNull(record.origin), "Origin", 100),
  };
}

async function assertAssignments(input: EmployeeInput): Promise<void> {
  if (input.projectId) {
    const rows = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    const project = rows[0];
    if (!project || project.companyId !== input.companyId) throw new EmployeeError("Project does not belong to this company");
  }
  if (input.siteId) {
    if (!input.projectId) throw new EmployeeError("Choose a project before a site");
    const rows = await db.select().from(sites).where(eq(sites.id, input.siteId)).limit(1);
    const site = rows[0];
    if (!site || site.projectId !== input.projectId) throw new EmployeeError("Site does not belong to this project");
  }
  if (input.quotaPoolId) {
    if (!input.siteId) throw new EmployeeError("Choose a site before a quota pool");
    const rows = await db.select().from(quotaPools).where(eq(quotaPools.id, input.quotaPoolId)).limit(1);
    const poolRow = rows[0];
    if (!poolRow || poolRow.siteId !== input.siteId) throw new EmployeeError("Quota pool does not belong to this site");
  }
}

async function assertPassportUnique(companyId: string, passportNumber: string | null, excludeId?: string): Promise<void> {
  const normalized = normalizePassport(passportNumber);
  if (!normalized) return;
  const result = await pool.query<{ id: string }>(
    `select id from employees
     where company_id = $1
       and passport_number is not null
       and lower(regexp_replace(passport_number, '\\s+', '', 'g')) = lower($2)
       ${excludeId ? "and id <> $3" : ""}
     limit 1`,
    excludeId ? [companyId, normalized, excludeId] : [companyId, normalized],
  );
  if (result.rows[0]) throw new EmployeeError("An employee with this passport already exists for this company");
}

function mapListRow(row: {
  id: string;
  companyId: string;
  companyName: string;
  legalName: string;
  passportNumber: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  nationality: string | null;
  photoFileId: string | null;
}): EmployeeListItem {
  return row;
}

export async function listEmployees(filters?: { companyId?: string | null; q?: string | null }): Promise<EmployeeListItem[]> {
  const clauses = [];
  if (filters?.companyId && uuidPattern.test(filters.companyId)) {
    clauses.push(eq(employees.companyId, filters.companyId));
  }
  if (filters?.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    clauses.push(
      or(
        ilike(employees.legalName, q),
        ilike(employees.passportNumber, q),
        ilike(employees.occupation, q),
        ilike(employees.preferredName, q),
      )!,
    );
  }
  const rows = await db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      companyName: companies.legalName,
      legalName: employees.legalName,
      passportNumber: employees.passportNumber,
      occupation: employees.occupation,
      employmentStatus: employees.employmentStatus,
      nationality: employees.nationality,
      photoFileId: employees.photoFileId,
    })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(employees.legalName);
  return rows.map(mapListRow);
}

export async function getEmployee(id: string): Promise<EmployeeRecord | null> {
  const result = await pool.query<{
    id: string;
    company_id: string;
    company_name: string;
    legal_name: string;
    preferred_name: string | null;
    passport_number: string | null;
    passport_issue_date: string | null;
    passport_expiry: string | null;
    nationality: string | null;
    date_of_birth: string | null;
    gender: string | null;
    permanent_address: string | null;
    emergency_contact: string | null;
    occupation: string | null;
    employment_status: string | null;
    project_id: string | null;
    site_id: string | null;
    quota_pool_id: string | null;
    project_name: string | null;
    site_name: string | null;
    quota_pool_name: string | null;
    work_site: string | null;
    site_code: string | null;
    salary: string | null;
    benefits: string | null;
    paid_vacation: string | null;
    working_hours: string | null;
    contract_duration: string | null;
    country: string | null;
    origin: string | null;
    photo_file_id: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `select
      employees.id,
      employees.company_id,
      companies.legal_name as company_name,
      employees.legal_name,
      employees.preferred_name,
      employees.passport_number,
      employees.passport_issue_date::text,
      employees.passport_expiry::text,
      employees.nationality,
      employees.date_of_birth::text,
      employees.gender,
      employees.permanent_address,
      employees.emergency_contact,
      employees.occupation,
      employees.employment_status,
      employees.project_id,
      employees.site_id,
      employees.quota_pool_id,
      projects.name as project_name,
      sites.name as site_name,
      quota_pools.name as quota_pool_name,
      employees.work_site,
      employees.site_code,
      employees.salary::text,
      employees.benefits,
      employees.paid_vacation,
      employees.working_hours,
      employees.contract_duration,
      employees.country,
      employees.origin,
      employees.photo_file_id,
      employees.created_at::text,
      employees.updated_at::text
    from employees
    inner join companies on companies.id = employees.company_id
    left join projects on projects.id = employees.project_id
    left join sites on sites.id = employees.site_id
    left join quota_pools on quota_pools.id = employees.quota_pool_id
    where employees.id = $1
    limit 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    legalName: row.legal_name,
    preferredName: row.preferred_name,
    passportNumber: row.passport_number,
    passportIssueDate: row.passport_issue_date,
    passportExpiry: row.passport_expiry,
    nationality: row.nationality,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    permanentAddress: row.permanent_address,
    emergencyContact: row.emergency_contact,
    occupation: row.occupation,
    employmentStatus: row.employment_status,
    projectId: row.project_id,
    siteId: row.site_id,
    quotaPoolId: row.quota_pool_id,
    projectName: row.project_name,
    siteName: row.site_name,
    quotaPoolName: row.quota_pool_name,
    workSite: row.work_site,
    siteCode: row.site_code,
    salary: row.salary,
    benefits: row.benefits,
    paidVacation: row.paid_vacation,
    workingHours: row.working_hours,
    contractDuration: row.contract_duration,
    country: row.country,
    origin: row.origin,
    photoFileId: row.photo_file_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function setEmployeePhoto(employeeId: string, photoFileId: string | null): Promise<EmployeeRecord | null> {
  const existing = await getEmployee(employeeId);
  if (!existing) return null;
  if (photoFileId && !uuidPattern.test(photoFileId)) throw new EmployeeError("Photo file is not valid");
  await db
    .update(employees)
    .set({ photoFileId, updatedAt: new Date() })
    .where(eq(employees.id, employeeId));
  return getEmployee(employeeId);
}

export async function createEmployeeRecord(record: Record<string, unknown>): Promise<EmployeeRecord> {
  const input = parseEmployeeInput(record);
  const companyRows = await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1);
  if (!companyRows[0]) throw new EmployeeError("Company not found");
  if (companyRows[0].kind === "client") throw new EmployeeError("Employees must belong to a legal employer company");
  await assertAssignments(input);
  await assertPassportUnique(input.companyId, input.passportNumber);
  const id = crypto.randomUUID();
  await db.insert(employees).values({
    id,
    companyId: input.companyId,
    legalName: input.legalName,
    preferredName: input.preferredName,
    passportNumber: input.passportNumber,
    passportIssueDate: input.passportIssueDate,
    passportExpiry: input.passportExpiry,
    nationality: input.nationality,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender,
    permanentAddress: input.permanentAddress,
    emergencyContact: input.emergencyContact,
    occupation: input.occupation,
    employmentStatus: input.employmentStatus,
    projectId: input.projectId,
    siteId: input.siteId,
    quotaPoolId: input.quotaPoolId,
    workSite: input.workSite,
    siteCode: input.siteCode,
    salary: input.salary,
    benefits: input.benefits,
    paidVacation: input.paidVacation,
    workingHours: input.workingHours,
    contractDuration: input.contractDuration,
    country: input.country,
    origin: input.origin,
  });
  await db.insert(employments).values({
    id: crypto.randomUUID(),
    employeeId: id,
    employerCompanyId: input.companyId,
    joinDate: new Date().toISOString().slice(0, 10),
    status: "active",
  });
  const created = await getEmployee(id);
  if (!created) throw new EmployeeError("Could not save employee");
  return created;
}

export async function updateEmployee(id: string, record: Record<string, unknown>): Promise<EmployeeRecord | null> {
  const existing = await getEmployee(id);
  if (!existing) return null;
  const input = parseEmployeeInput({ ...record, companyId: record.companyId ?? existing.companyId });
  const companyRows = await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1);
  if (!companyRows[0]) throw new EmployeeError("Company not found");
  await assertAssignments(input);
  await assertPassportUnique(input.companyId, input.passportNumber, id);
  await db
    .update(employees)
    .set({
      companyId: input.companyId,
      legalName: input.legalName,
      preferredName: input.preferredName,
      passportNumber: input.passportNumber,
      passportIssueDate: input.passportIssueDate,
      passportExpiry: input.passportExpiry,
      nationality: input.nationality,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      permanentAddress: input.permanentAddress,
      emergencyContact: input.emergencyContact,
      occupation: input.occupation,
      employmentStatus: input.employmentStatus,
      projectId: input.projectId,
      siteId: input.siteId,
      quotaPoolId: input.quotaPoolId,
      workSite: input.workSite,
      siteCode: input.siteCode,
      salary: input.salary,
      benefits: input.benefits,
      paidVacation: input.paidVacation,
      workingHours: input.workingHours,
      contractDuration: input.contractDuration,
      country: input.country,
      origin: input.origin,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));
  return getEmployee(id);
}

/** Simple create used by Projects slot flows. */
export async function createEmployee(companyId: string, legalName: string): Promise<EmployeeListItem> {
  const created = await createEmployeeRecord({ companyId, legalName });
  return {
    id: created.id,
    companyId: created.companyId,
    companyName: created.companyName,
    legalName: created.legalName,
    passportNumber: created.passportNumber,
    occupation: created.occupation,
    employmentStatus: created.employmentStatus,
    nationality: created.nationality,
    photoFileId: created.photoFileId,
  };
}

export async function countEmployees(): Promise<number> {
  const rows = await db.select({ value: sql<number>`count(*)::int` }).from(employees);
  return rows[0]?.value ?? 0;
}

export async function listAssignmentOptions(companyId: string): Promise<{
  projects: { id: string; name: string }[];
  sites: { id: string; projectId: string; name: string }[];
  quotaPools: { id: string; siteId: string; name: string }[];
}> {
  if (!uuidPattern.test(companyId)) return { projects: [], sites: [], quotaPools: [] };
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.companyId, companyId))
    .orderBy(projects.name);
  const siteRows = await db
    .select({ id: sites.id, projectId: sites.projectId, name: sites.name })
    .from(sites)
    .innerJoin(projects, eq(projects.id, sites.projectId))
    .where(eq(projects.companyId, companyId))
    .orderBy(sites.name);
  const poolRows = await db
    .select({ id: quotaPools.id, siteId: quotaPools.siteId, name: quotaPools.name })
    .from(quotaPools)
    .innerJoin(sites, eq(sites.id, quotaPools.siteId))
    .innerJoin(projects, eq(projects.id, sites.projectId))
    .where(eq(projects.companyId, companyId))
    .orderBy(desc(quotaPools.createdAt));
  return { projects: projectRows, sites: siteRows, quotaPools: poolRows };
}
