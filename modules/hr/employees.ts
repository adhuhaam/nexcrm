import { and, desc, eq, sql } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { clientAllocations, companies, employees, employments, projects, quotaPools, sites, slots } from "../../lib/schema.ts";
import { syncEmployeeSlot } from "../projects/projects.ts";
import { changeAllocationRates } from "./allocations.ts";

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
  workPermitNumber: string | null;
  passportNumber: string | null;
  passportIssueDate: string | null;
  passportExpiry: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  permanentAddress: string | null;
  emergencyContact: string | null;
  occupation: string | null;
  designation: string | null;
  employmentStatus: string | null;
  projectId: string | null;
  siteId: string | null;
  quotaPoolId: string | null;
  workSite: string | null;
  siteCode: string | null;
  salary: string | null;
  staffDayRate: string | null;
  billDayRate: string | null;
  benefits: string | null;
  paidVacation: string | null;
  workingHours: string | null;
  contractDuration: string | null;
  country: string | null;
  origin: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  feePaidUntil: string | null;
  medicalExpiry: string | null;
  insuranceExpiry: string | null;
  arrivalDate: string | null;
  workVisaNumber: string | null;
  workVisaExpiry: string | null;
  contractExpiry: string | null;
};

export type EmployeeRecord = EmployeeInput & {
  id: string;
  companyName: string;
  projectName: string | null;
  siteName: string | null;
  quotaPoolName: string | null;
  slotId: string | null;
  slotNumber: number | null;
  photoFileId: string | null;
  xpatStatus: string | null;
  xpatStateName: string | null;
  xpatEmployerName: string | null;
  xpatSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeListItem = {
  id: string;
  companyId: string;
  companyName: string;
  legalName: string;
  passportNumber: string | null;
  workPermitNumber: string | null;
  expiresOn: string | null;
  xpatStatus: string | null;
  xpatStateName: string | null;
  xpatSyncedAt: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  nationality: string | null;
  photoFileId: string | null;
  clientCompanyId: string | null;
  clientName: string | null;
  designation: string | null;
  projectName: string | null;
  siteName: string | null;
  quotaPoolName: string | null;
  slotNumber: number | null;
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
  const staffDayRate = emptyToNull(record.staffDayRate);
  if (staffDayRate && !/^\d+(\.\d{1,2})?$/.test(staffDayRate)) {
    throw new EmployeeError("Staff monthly salary must be a number");
  }
  const billDayRate = emptyToNull(record.billDayRate);
  if (billDayRate && !/^\d+(\.\d{1,2})?$/.test(billDayRate)) {
    throw new EmployeeError("Client monthly bill rate must be a number");
  }
  return {
    companyId,
    legalName: bounded(legalName, "Full name", 200) ?? "",
    preferredName: bounded(emptyToNull(record.preferredName), "Preferred name", 200),
    workPermitNumber: bounded(
      normalizePassport(emptyToNull(record.workPermitNumber)),
      "Work permit number",
      80,
    ),
    passportNumber: bounded(emptyToNull(record.passportNumber), "Passport number", 80),
    passportIssueDate: dateOrNull(record.passportIssueDate, "Passport issue date"),
    passportExpiry: dateOrNull(record.passportExpiry, "Passport expiry"),
    nationality: bounded(emptyToNull(record.nationality), "Nationality", 100),
    dateOfBirth: dateOrNull(record.dateOfBirth, "Date of birth"),
    gender: bounded(emptyToNull(record.gender), "Gender", 40),
    permanentAddress: bounded(emptyToNull(record.permanentAddress), "Permanent address", 500),
    emergencyContact: bounded(emptyToNull(record.emergencyContact), "Emergency contact", 300),
    occupation: bounded(emptyToNull(record.occupation), "Position", 200),
    designation: bounded(emptyToNull(record.designation), "Designation", 200),
    employmentStatus: bounded(emptyToNull(record.employmentStatus), "Employment status", 100),
    projectId: uuidOrNull(record.projectId, "Project"),
    siteId: uuidOrNull(record.siteId, "Site"),
    quotaPoolId: uuidOrNull(record.quotaPoolId, "Quota pool"),
    workSite: bounded(emptyToNull(record.workSite), "Work site", 200),
    siteCode: bounded(emptyToNull(record.siteCode), "Site ID", 80),
    salary,
    staffDayRate,
    billDayRate,
    benefits: bounded(emptyToNull(record.benefits), "Benefits", 500),
    paidVacation: bounded(emptyToNull(record.paidVacation), "Paid vacation", 200),
    workingHours: bounded(emptyToNull(record.workingHours), "Working hours", 300),
    contractDuration: bounded(emptyToNull(record.contractDuration), "Contract duration", 200),
    country: bounded(emptyToNull(record.country), "Country", 100),
    origin: bounded(emptyToNull(record.origin), "Origin", 100),
    issuedOn: dateOrNull(record.issuedOn, "Work permit issued date"),
    expiresOn: dateOrNull(record.expiresOn, "Work permit expiry date"),
    feePaidUntil: dateOrNull(record.feePaidUntil, "Fee paid until"),
    medicalExpiry: dateOrNull(record.medicalExpiry, "Medical expiry"),
    insuranceExpiry: dateOrNull(record.insuranceExpiry, "Insurance expiry"),
    arrivalDate: dateOrNull(record.arrivalDate, "Arrival date"),
    workVisaNumber: bounded(emptyToNull(record.workVisaNumber), "Work visa number", 80),
    workVisaExpiry: dateOrNull(record.workVisaExpiry, "Work visa expiry"),
    contractExpiry: dateOrNull(record.contractExpiry, "Contract expiry"),
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

export type ExpiringEmployee = {
  id: string;
  legalName: string;
  workPermitNumber: string | null;
  passportNumber: string | null;
  companyName: string;
  clientName: string | null;
  expiresOn: string;
  daysRemaining: number;
};

/** Work permits with expiry from today through today + withinMonths (inclusive). */
export async function listExpiringWorkPermits(withinMonths = 3): Promise<ExpiringEmployee[]> {
  const months = Math.max(1, Math.min(24, Math.floor(withinMonths)));
  const result = await pool.query<{
    id: string;
    legal_name: string;
    work_permit_number: string | null;
    passport_number: string | null;
    company_name: string;
    client_name: string | null;
    expires_on: string;
    days_remaining: string;
  }>(
    `select employees.id,
            employees.legal_name,
            employees.work_permit_number,
            employees.passport_number,
            companies.legal_name as company_name,
            cli.legal_name as client_name,
            employees.expires_on::text,
            (employees.expires_on - current_date)::text as days_remaining
     from employees
     inner join companies on companies.id = employees.company_id
     left join client_allocations a
       on a.employee_id = employees.id and a.status = 'active'
     left join companies cli on cli.id = a.client_company_id
     where employees.expires_on is not null
       and employees.expires_on >= current_date
       and employees.expires_on <= (current_date + ($1::text || ' months')::interval)::date
     order by employees.expires_on asc, employees.legal_name asc
     limit 200`,
    [String(months)],
  );
  return result.rows.map((row) => ({
    id: row.id,
    legalName: row.legal_name,
    workPermitNumber: row.work_permit_number,
    passportNumber: row.passport_number,
    companyName: row.company_name,
    clientName: row.client_name,
    expiresOn: row.expires_on,
    daysRemaining: Number(row.days_remaining),
  }));
}

export type EmployeeListResult = {
  employees: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listEmployees(filters?: {
  companyId?: string | null;
  clientCompanyId?: string | null;
  q?: string | null;
  expiry?: "expired" | "soon" | "missing" | null;
  allocation?: "allocated" | "unallocated" | null;
  xpat?: "arrived" | "departed" | "pending" | "valid" | "invalid" | "missing" | null;
  hasPhoto?: boolean | null;
  hasWorkPermit?: boolean | null;
  page?: number | null;
  pageSize?: number | null;
}): Promise<EmployeeListResult> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters?.companyId && uuidPattern.test(filters.companyId)) {
    params.push(filters.companyId);
    where.push(`employees.company_id = $${params.length}`);
  }
  if (filters?.clientCompanyId && uuidPattern.test(filters.clientCompanyId)) {
    params.push(filters.clientCompanyId);
    where.push(`a.client_company_id = $${params.length}`);
  }
  if (filters?.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const i = params.length;
    where.push(
      `(employees.legal_name ilike $${i}
        or coalesce(employees.passport_number, '') ilike $${i}
        or coalesce(employees.work_permit_number, '') ilike $${i}
        or coalesce(employees.occupation, '') ilike $${i}
        or coalesce(employees.designation, '') ilike $${i}
        or coalesce(employees.preferred_name, '') ilike $${i}
        or coalesce(employees.nationality, '') ilike $${i}
        or coalesce(cli.legal_name, '') ilike $${i}
        or coalesce(employees.xpat_status, '') ilike $${i}
        or coalesce(employees.xpat_state_name, '') ilike $${i})`,
    );
  }
  if (filters?.expiry === "expired") {
    where.push(`employees.expires_on is not null and employees.expires_on < current_date`);
  } else if (filters?.expiry === "soon") {
    where.push(
      `employees.expires_on is not null and employees.expires_on >= current_date and employees.expires_on <= current_date + 30`,
    );
  } else if (filters?.expiry === "missing") {
    where.push(`employees.expires_on is null`);
  }
  if (filters?.allocation === "allocated") {
    where.push(`a.client_company_id is not null`);
  } else if (filters?.allocation === "unallocated") {
    where.push(`a.client_company_id is null`);
  }
  if (filters?.xpat === "arrived") {
    where.push(`(coalesce(employees.xpat_state_name, '') ilike '%arriv%' or coalesce(employees.xpat_status, '') ilike '%arriv%')`);
  } else if (filters?.xpat === "departed") {
    where.push(
      `(coalesce(employees.xpat_state_name, '') ~* 'depart|exit' or coalesce(employees.xpat_status, '') ~* 'depart|exit')`,
    );
  } else if (filters?.xpat === "pending") {
    where.push(
      `(coalesce(employees.xpat_state_name, '') ~* 'pend|process|apply|await|draft' or coalesce(employees.xpat_status, '') ~* 'pend|process|apply|await|draft')`,
    );
  } else if (filters?.xpat === "valid") {
    where.push(
      `(employees.xpat_status = 'valid' or coalesce(employees.xpat_state_name, '') ~* 'issued|active|valid|approv')`,
    );
  } else if (filters?.xpat === "invalid") {
    where.push(
      `(employees.xpat_status = 'invalid' or coalesce(employees.xpat_state_name, '') ~* 'expir|cancel|reject|revok|invalid|denied')`,
    );
  } else if (filters?.xpat === "missing") {
    where.push(`employees.xpat_status is null and employees.xpat_state_name is null`);
  }
  if (filters?.hasPhoto === true) {
    where.push(`employees.photo_file_id is not null`);
  } else if (filters?.hasPhoto === false) {
    where.push(`employees.photo_file_id is null`);
  }
  if (filters?.hasWorkPermit === true) {
    where.push(`coalesce(employees.work_permit_number, '') <> ''`);
  } else if (filters?.hasWorkPermit === false) {
    where.push(`coalesce(employees.work_permit_number, '') = ''`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const fromSql = `from employees
     inner join companies on companies.id = employees.company_id
     left join client_allocations a
       on a.employee_id = employees.id and a.status = 'active'
     left join companies cli on cli.id = a.client_company_id
     left join projects on projects.id = employees.project_id
     left join sites on sites.id = employees.site_id
     left join quota_pools on quota_pools.id = employees.quota_pool_id
     left join slots sl on sl.employee_id = employees.id
     ${whereSql}`;

  const countResult = await pool.query<{ total: string }>(
    `select count(distinct employees.id)::text as total ${fromSql}`,
    params,
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const requestedSize = filters?.pageSize == null ? null : Number(filters.pageSize);
  const pageSize =
    requestedSize == null || !Number.isFinite(requestedSize) || requestedSize <= 0
      ? Math.max(total, 1)
      : Math.min(Math.max(Math.trunc(requestedSize), 1), 200);
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const requestedPage = filters?.page == null ? 1 : Number(filters.page);
  const page =
    !Number.isFinite(requestedPage) || requestedPage < 1
      ? 1
      : Math.min(Math.trunc(requestedPage), pageCount);
  const offset = (page - 1) * pageSize;

  const dataParams = [...params, pageSize, offset];
  const result = await pool.query<{
    id: string;
    company_id: string;
    company_name: string;
    legal_name: string;
    passport_number: string | null;
    work_permit_number: string | null;
    expires_on: string | null;
    xpat_status: string | null;
    xpat_state_name: string | null;
    xpat_synced_at: string | null;
    occupation: string | null;
    employment_status: string | null;
    nationality: string | null;
    photo_file_id: string | null;
    client_company_id: string | null;
    client_name: string | null;
    designation: string | null;
    project_name: string | null;
    site_name: string | null;
    quota_pool_name: string | null;
    slot_number: number | null;
  }>(
    `select employees.id,
            employees.company_id,
            companies.legal_name as company_name,
            employees.legal_name,
            employees.passport_number,
            employees.work_permit_number,
            employees.expires_on::text,
            employees.xpat_status,
            employees.xpat_state_name,
            employees.xpat_synced_at::text,
            employees.occupation,
            employees.employment_status,
            employees.nationality,
            employees.photo_file_id,
            a.client_company_id,
            cli.legal_name as client_name,
            coalesce(a.designation, employees.designation) as designation,
            projects.name as project_name,
            sites.name as site_name,
            quota_pools.name as quota_pool_name,
            sl.slot_number
     ${fromSql}
     order by employees.legal_name
     limit $${params.length + 1} offset $${params.length + 2}`,
    dataParams,
  );
  return {
    employees: result.rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      companyName: row.company_name,
      legalName: row.legal_name,
      passportNumber: row.passport_number,
      workPermitNumber: row.work_permit_number,
      expiresOn: row.expires_on,
      xpatStatus: row.xpat_status,
      xpatStateName: row.xpat_state_name,
      xpatSyncedAt: row.xpat_synced_at,
      occupation: row.occupation,
      employmentStatus: row.employment_status,
      nationality: row.nationality,
      photoFileId: row.photo_file_id,
      clientCompanyId: row.client_company_id,
      clientName: row.client_name,
      designation: row.designation,
      projectName: row.project_name,
      siteName: row.site_name,
      quotaPoolName: row.quota_pool_name,
      slotNumber: row.slot_number,
    })),
    total,
    page,
    pageSize,
    pageCount,
  };
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
    designation: string | null;
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
    staff_day_rate: string | null;
    bill_day_rate: string | null;
    benefits: string | null;
    paid_vacation: string | null;
    working_hours: string | null;
    contract_duration: string | null;
    country: string | null;
    origin: string | null;
    photo_file_id: string | null;
    work_permit_number: string | null;
    issued_on: string | null;
    expires_on: string | null;
    fee_paid_until: string | null;
    medical_expiry: string | null;
    insurance_expiry: string | null;
    arrival_date: string | null;
    work_visa_number: string | null;
    work_visa_expiry: string | null;
    contract_expiry: string | null;
    xpat_status: string | null;
    xpat_state_name: string | null;
    xpat_employer_name: string | null;
    xpat_synced_at: string | null;
    slot_id: string | null;
    slot_number: number | null;
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
      employees.designation,
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
      employees.staff_day_rate::text,
      employees.bill_day_rate::text,
      employees.benefits,
      employees.paid_vacation,
      employees.working_hours,
      employees.contract_duration,
      employees.country,
      employees.origin,
      employees.photo_file_id,
      employees.work_permit_number,
      employees.issued_on::text,
      employees.expires_on::text,
      employees.fee_paid_until::text,
      employees.medical_expiry::text,
      employees.insurance_expiry::text,
      employees.arrival_date::text,
      employees.work_visa_number,
      employees.work_visa_expiry::text,
      employees.contract_expiry::text,
      employees.xpat_status,
      employees.xpat_state_name,
      employees.xpat_employer_name,
      employees.xpat_synced_at::text,
      sl.id as slot_id,
      sl.slot_number,
      employees.created_at::text,
      employees.updated_at::text
    from employees
    inner join companies on companies.id = employees.company_id
    left join projects on projects.id = employees.project_id
    left join sites on sites.id = employees.site_id
    left join quota_pools on quota_pools.id = employees.quota_pool_id
    left join slots sl on sl.employee_id = employees.id
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
    designation: row.designation,
    employmentStatus: row.employment_status,
    projectId: row.project_id,
    siteId: row.site_id,
    quotaPoolId: row.quota_pool_id,
    projectName: row.project_name,
    siteName: row.site_name,
    quotaPoolName: row.quota_pool_name,
    slotId: row.slot_id,
    slotNumber: row.slot_number,
    workSite: row.work_site,
    siteCode: row.site_code,
    salary: row.salary,
    staffDayRate: row.staff_day_rate,
    billDayRate: row.bill_day_rate,
    benefits: row.benefits,
    paidVacation: row.paid_vacation,
    workingHours: row.working_hours,
    contractDuration: row.contract_duration,
    country: row.country,
    origin: row.origin,
    photoFileId: row.photo_file_id,
    workPermitNumber: row.work_permit_number,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    feePaidUntil: row.fee_paid_until,
    medicalExpiry: row.medical_expiry,
    insuranceExpiry: row.insurance_expiry,
    arrivalDate: row.arrival_date,
    workVisaNumber: row.work_visa_number,
    workVisaExpiry: row.work_visa_expiry,
    contractExpiry: row.contract_expiry,
    xpatStatus: row.xpat_status,
    xpatStateName: row.xpat_state_name,
    xpatEmployerName: row.xpat_employer_name,
    xpatSyncedAt: row.xpat_synced_at,
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
    workPermitNumber: input.workPermitNumber,
    passportNumber: input.passportNumber,
    passportIssueDate: input.passportIssueDate,
    passportExpiry: input.passportExpiry,
    nationality: input.nationality,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender,
    permanentAddress: input.permanentAddress,
    emergencyContact: input.emergencyContact,
    occupation: input.occupation,
    designation: input.designation,
    employmentStatus: input.employmentStatus,
    projectId: input.projectId,
    siteId: input.siteId,
    quotaPoolId: input.quotaPoolId,
    workSite: input.workSite,
    siteCode: input.siteCode,
    salary: input.salary,
    staffDayRate: input.staffDayRate,
    billDayRate: input.billDayRate,
    benefits: input.benefits,
    paidVacation: input.paidVacation,
    workingHours: input.workingHours,
    contractDuration: input.contractDuration,
    country: input.country,
    origin: input.origin,
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn,
    feePaidUntil: input.feePaidUntil,
    medicalExpiry: input.medicalExpiry,
    insuranceExpiry: input.insuranceExpiry,
    arrivalDate: input.arrivalDate,
    workVisaNumber: input.workVisaNumber,
    workVisaExpiry: input.workVisaExpiry,
    contractExpiry: input.contractExpiry,
  });
  await db.insert(employments).values({
    id: crypto.randomUUID(),
    employeeId: id,
    employerCompanyId: input.companyId,
    joinDate: new Date().toISOString().slice(0, 10),
    status: "active",
  });
  const slotId = uuidOrNull(record.slotId, "Slot");
  try {
    await syncEmployeeSlot({
      employeeId: id,
      projectId: input.projectId,
      quotaPoolId: input.quotaPoolId,
      slotId,
    });
  } catch (reason) {
    throw new EmployeeError(reason instanceof Error ? reason.message : "Could not assign quota slot");
  }
  const created = await getEmployee(id);
  if (!created) throw new EmployeeError("Could not save employee");
  try {
    const { attachEmployeeFinanceOnCreate } = await import("../expenses/finance.ts");
    await attachEmployeeFinanceOnCreate({
      employeeId: created.id,
      employeeName: created.legalName,
      nationality: created.nationality,
    });
  } catch (reason) {
    console.error(
      reason instanceof Error ? reason.message : "Could not attach employee finance expenses",
    );
  }
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
      workPermitNumber: input.workPermitNumber,
      passportNumber: input.passportNumber,
      passportIssueDate: input.passportIssueDate,
      passportExpiry: input.passportExpiry,
      nationality: input.nationality,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      permanentAddress: input.permanentAddress,
      emergencyContact: input.emergencyContact,
      occupation: input.occupation,
      designation: input.designation,
      employmentStatus: input.employmentStatus,
      projectId: input.projectId,
      siteId: input.siteId,
      quotaPoolId: input.quotaPoolId,
      workSite: input.workSite,
      siteCode: input.siteCode,
      salary: input.salary,
      staffDayRate: input.staffDayRate,
      billDayRate: input.billDayRate,
      benefits: input.benefits,
      paidVacation: input.paidVacation,
      workingHours: input.workingHours,
      contractDuration: input.contractDuration,
      country: input.country,
      origin: input.origin,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      feePaidUntil: input.feePaidUntil,
      medicalExpiry: input.medicalExpiry,
      insuranceExpiry: input.insuranceExpiry,
      arrivalDate: input.arrivalDate,
      workVisaNumber: input.workVisaNumber,
      workVisaExpiry: input.workVisaExpiry,
      contractExpiry: input.contractExpiry,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));

  // Keep active client allocation rates/designation aligned with the employee card.
  if (input.staffDayRate && input.billDayRate) {
    const active = await db
      .select()
      .from(clientAllocations)
      .where(and(eq(clientAllocations.employeeId, id), eq(clientAllocations.status, "active")))
      .limit(1);
    if (active[0]) {
      await changeAllocationRates(active[0].id, {
        staffSalary: input.staffDayRate,
        billRate: input.billDayRate,
        designation: input.designation,
      });
    }
  } else if (input.designation) {
    const active = await db
      .select()
      .from(clientAllocations)
      .where(and(eq(clientAllocations.employeeId, id), eq(clientAllocations.status, "active")))
      .limit(1);
    if (active[0] && (active[0].designation ?? null) !== input.designation) {
      await db
        .update(clientAllocations)
        .set({ designation: input.designation, updatedAt: new Date() })
        .where(eq(clientAllocations.id, active[0].id));
    }
  }

  const slotId = uuidOrNull(record.slotId, "Slot");
  try {
    await syncEmployeeSlot({
      employeeId: id,
      projectId: input.projectId,
      quotaPoolId: input.quotaPoolId,
      slotId,
    });
  } catch (reason) {
    throw new EmployeeError(reason instanceof Error ? reason.message : "Could not assign quota slot");
  }

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
    workPermitNumber: null,
    expiresOn: null,
    xpatStatus: null,
    xpatStateName: null,
    xpatSyncedAt: null,
    occupation: created.occupation,
    employmentStatus: created.employmentStatus,
    nationality: created.nationality,
    photoFileId: created.photoFileId,
    clientCompanyId: null,
    clientName: null,
    designation: created.designation,
    projectName: created.projectName,
    siteName: created.siteName,
    quotaPoolName: created.quotaPoolName,
    slotNumber: created.slotNumber,
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
  slots: { id: string; quotaPoolId: string; slotNumber: number | null; status: string; employeeId: string | null }[];
}> {
  if (!uuidPattern.test(companyId)) return { projects: [], sites: [], quotaPools: [], slots: [] };
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
  const slotRows = await db
    .select({
      id: slots.id,
      quotaPoolId: slots.quotaPoolId,
      slotNumber: slots.slotNumber,
      status: slots.status,
      employeeId: slots.employeeId,
    })
    .from(slots)
    .innerJoin(projects, eq(projects.id, slots.projectId))
    .where(eq(projects.companyId, companyId))
    .orderBy(slots.slotNumber);
  return { projects: projectRows, sites: siteRows, quotaPools: poolRows, slots: slotRows };
}
