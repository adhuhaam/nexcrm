import { pool } from "../../lib/db.ts";

export class WorkPermitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkPermitError";
  }
}

export type WorkPermitInput = {
  companyId: string;
  legalName: string;
  workPermitNumber: string | null;
  nationality: string | null;
  country: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  occupation: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  feePaidUntil: string | null;
  medicalExpiry: string | null;
  insuranceExpiry: string | null;
  origin: string | null;
  salary: string | null;
  arrivalDate: string | null;
  workVisaNumber: string | null;
  workVisaExpiry: string | null;
  contractExpiry: string | null;
};

export type WorkPermitRecord = WorkPermitInput & {
  id: string;
  companyName: string;
  photoFileId: string | null;
  xpatSyncedAt: string | null;
  xpatStatus: string | null;
  xpatStateName: string | null;
  workSite: string | null;
  siteCode: string | null;
  quotaPoolNumber: string | null;
  quotaPoolName: string | null;
  linkedSites: string | null;
  linkedSlot: string | null;
  linkedSlotExpiry: string | null;
};

const columns = `
  employees.id,
  employees.company_id,
  companies.legal_name as company_name,
  employees.legal_name,
  employees.work_permit_number,
  employees.nationality,
  employees.country,
  employees.gender,
  employees.date_of_birth::text,
  employees.passport_number,
  employees.passport_expiry::text,
  employees.occupation,
  employees.issued_on::text,
  employees.expires_on::text,
  employees.fee_paid_until::text,
  employees.medical_expiry::text,
  employees.insurance_expiry::text,
  employees.origin,
  employees.salary::text,
  employees.arrival_date::text,
  employees.work_visa_number,
  employees.work_visa_expiry::text,
  employees.contract_expiry::text,
  employees.photo_file_id,
  employees.xpat_synced_at::text,
  employees.xpat_status,
  employees.xpat_state_name,
  employees.work_site,
  employees.site_code,
  string_agg(distinct quota_pools.pool_number, ', ') as quota_pool_number,
  string_agg(distinct quota_pools.name, ', ') as quota_pool_name,
  string_agg(distinct sites.name, ', ') as linked_sites,
  string_agg(distinct slots.slot_number::text, ', ') as linked_slot,
  min(slots.expires_on)::text as linked_slot_expiry
`;

type WorkPermitRow = {
  id: string;
  company_id: string;
  company_name: string;
  legal_name: string;
  work_permit_number: string | null;
  nationality: string | null;
  country: string | null;
  gender: string | null;
  date_of_birth: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  occupation: string | null;
  issued_on: string | null;
  expires_on: string | null;
  fee_paid_until: string | null;
  medical_expiry: string | null;
  insurance_expiry: string | null;
  origin: string | null;
  salary: string | null;
  arrival_date: string | null;
  work_visa_number: string | null;
  work_visa_expiry: string | null;
  contract_expiry: string | null;
  photo_file_id: string | null;
  xpat_synced_at: string | null;
  xpat_status: string | null;
  xpat_state_name: string | null;
  work_site: string | null;
  site_code: string | null;
  quota_pool_number: string | null;
  quota_pool_name: string | null;
  linked_sites: string | null;
  linked_slot: string | null;
  linked_slot_expiry: string | null;
};

function fromRow(row: WorkPermitRow): WorkPermitRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    legalName: row.legal_name,
    workPermitNumber: row.work_permit_number,
    nationality: row.nationality,
    country: row.country,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    passportNumber: row.passport_number,
    passportExpiry: row.passport_expiry,
    occupation: row.occupation,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    feePaidUntil: row.fee_paid_until,
    medicalExpiry: row.medical_expiry,
    insuranceExpiry: row.insurance_expiry,
    origin: row.origin,
    salary: row.salary,
    arrivalDate: row.arrival_date,
    workVisaNumber: row.work_visa_number,
    workVisaExpiry: row.work_visa_expiry,
    contractExpiry: row.contract_expiry,
    photoFileId: row.photo_file_id,
    xpatSyncedAt: row.xpat_synced_at,
    xpatStatus: row.xpat_status,
    xpatStateName: row.xpat_state_name,
    workSite: row.work_site,
    siteCode: row.site_code,
    quotaPoolNumber: row.quota_pool_number,
    quotaPoolName: row.quota_pool_name,
    linkedSites: row.linked_sites,
    linkedSlot: row.linked_slot,
    linkedSlotExpiry: row.linked_slot_expiry,
  };
}

const fromClause = `
  from employees
  join companies on companies.id = employees.company_id
  left join slots on slots.employee_id = employees.id and slots.status = 'occupied'
  left join quota_pools on quota_pools.id = slots.quota_pool_id
  left join sites on sites.id = quota_pools.site_id
`;

export async function listWorkPermits(): Promise<WorkPermitRecord[]> {
  const result = await pool.query<WorkPermitRow>(
    `select ${columns} ${fromClause} group by employees.id, companies.legal_name order by employees.legal_name`,
  );
  return result.rows.map(fromRow);
}

export async function getWorkPermit(id: string): Promise<WorkPermitRecord | null> {
  const result = await pool.query<WorkPermitRow>(
    `select ${columns} ${fromClause} where employees.id = $1 group by employees.id, companies.legal_name`,
    [id],
  );
  return result.rows[0] ? fromRow(result.rows[0]) : null;
}

function text(value: string | null | undefined, label: string, max: number): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new WorkPermitError(`${label} is too long`);
  return trimmed;
}

function optionalDate(value: string | null | undefined, label: string): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new WorkPermitError(`${label} must be a date`);
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new WorkPermitError(`${label} must be a date`);
  }
  return trimmed;
}

function optionalSalary(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(trimmed)) throw new WorkPermitError("Salary must be a number");
  return trimmed;
}

export function parseWorkPermit(record: Record<string, string | undefined>): WorkPermitInput {
  const legalName = (record.legalName ?? "").trim();
  if (!legalName) throw new WorkPermitError("Work permit holder name is required");
  if (legalName.length > 200) throw new WorkPermitError("Work permit holder name is too long");
  const companyId = (record.companyId ?? "").trim();
  if (!companyId) throw new WorkPermitError("Company is required");
  return {
    companyId,
    legalName,
    workPermitNumber: text(record.workPermitNumber, "Work permit number", 80),
    nationality: text(record.nationality, "Nationality", 80),
    country: text(record.country, "Country", 80),
    gender: text(record.gender, "Gender", 40),
    dateOfBirth: optionalDate(record.dateOfBirth, "Date of birth"),
    passportNumber: text(record.passportNumber, "Passport number", 40),
    passportExpiry: optionalDate(record.passportExpiry, "Passport expiry"),
    occupation: text(record.occupation, "Occupation", 120),
    issuedOn: optionalDate(record.issuedOn, "Work permit issued date"),
    expiresOn: optionalDate(record.expiresOn, "Work permit expiry date"),
    feePaidUntil: optionalDate(record.feePaidUntil, "Work permit fee last paid up to date"),
    medicalExpiry: optionalDate(record.medicalExpiry, "Medical expiry"),
    insuranceExpiry: optionalDate(record.insuranceExpiry, "Insurance expiry"),
    origin: text(record.origin, "Origin", 80),
    salary: optionalSalary(record.salary),
    arrivalDate: optionalDate(record.arrivalDate, "Arrival date"),
    workVisaNumber: text(record.workVisaNumber, "Work visa number", 80),
    workVisaExpiry: optionalDate(record.workVisaExpiry, "Work visa expiry date"),
    contractExpiry: optionalDate(record.contractExpiry, "Work permit contract expiry"),
  };
}

export async function saveWorkPermit(input: WorkPermitInput, id?: string): Promise<string> {
  const company = await pool.query("select id from companies where id = $1", [input.companyId]);
  if (!company.rowCount) throw new WorkPermitError("Company not found");
  const values = [
    input.companyId,
    input.legalName,
    input.workPermitNumber,
    input.nationality,
    input.country,
    input.gender,
    input.dateOfBirth,
    input.passportNumber,
    input.passportExpiry,
    input.occupation,
    input.issuedOn,
    input.expiresOn,
    input.feePaidUntil,
    input.medicalExpiry,
    input.insuranceExpiry,
    input.origin,
    input.salary,
    input.arrivalDate,
    input.workVisaNumber,
    input.workVisaExpiry,
    input.contractExpiry,
  ];
  try {
    if (id) {
      const updated = await pool.query(
        `update employees set
          company_id = $1, legal_name = $2, work_permit_number = $3, nationality = $4, country = $5, gender = $6,
          date_of_birth = $7, passport_number = $8, passport_expiry = $9, occupation = $10, issued_on = $11,
          expires_on = $12, fee_paid_until = $13, medical_expiry = $14, insurance_expiry = $15, origin = $16,
          salary = $17, arrival_date = $18, work_visa_number = $19, work_visa_expiry = $20, contract_expiry = $21
         where id = $22`,
        [...values, id],
      );
      if (!updated.rowCount) throw new WorkPermitError("Work permit not found");
      return id;
    }
    const created = crypto.randomUUID();
    await pool.query(
      `insert into employees (
        id, company_id, legal_name, work_permit_number, nationality, country, gender, date_of_birth,
        passport_number, passport_expiry, occupation, issued_on, expires_on, fee_paid_until, medical_expiry,
        insurance_expiry, origin, salary, arrival_date, work_visa_number, work_visa_expiry, contract_expiry
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )`,
      [created, ...values],
    );
    return created;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new WorkPermitError("That work permit number is already recorded");
    }
    throw error;
  }
}
