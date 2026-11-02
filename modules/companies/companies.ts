import { eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { companies } from "../../lib/schema.ts";
import { parseCompanyInput, type CompanyInput, type CompanyKind } from "./validation.ts";

export type CompanyRecord = CompanyInput & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyListItem = CompanyRecord & {
  projectCount: number;
  siteCount: number;
  poolCount: number;
  employeeCount: number;
};

export type CompanyDetail = CompanyRecord & {
  projectCount: number;
  siteCount: number;
  poolCount: number;
  employeeCount: number;
  projects: { id: string; name: string; siteCount: number; poolCount: number }[];
  employees: {
    id: string;
    legalName: string;
    passportNumber: string | null;
    occupation: string | null;
    employmentStatus: string | null;
    photoFileId: string | null;
  }[];
};

function rowToCompany(row: typeof companies.$inferSelect): CompanyRecord {
  return {
    id: row.id,
    kind: (row.kind === "client" ? "client" : "employer") as CompanyKind,
    legalName: row.legalName,
    registrationNumber: row.registrationNumber,
    registeredAddress: row.registeredAddress,
    country: row.country,
    businessActivity: row.businessActivity,
    phone: row.phone,
    email: row.email,
    documentPrefix: row.documentPrefix,
    signatoryName: row.signatoryName,
    signatoryTitle: row.signatoryTitle,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCompanies(kind?: CompanyKind | null): Promise<CompanyRecord[]> {
  const rows = kind
    ? await db.select().from(companies).where(eq(companies.kind, kind)).orderBy(companies.legalName)
    : await db.select().from(companies).orderBy(companies.legalName);
  return rows.map(rowToCompany);
}

export async function listCompaniesWithCounts(filters?: {
  kind?: CompanyKind | null;
  q?: string | null;
}): Promise<CompanyListItem[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters?.kind === "employer" || filters?.kind === "client") {
    params.push(filters.kind);
    where.push(`c.kind = $${params.length}`);
  }
  if (filters?.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const i = params.length;
    where.push(
      `(c.legal_name ilike $${i} or coalesce(c.registration_number, '') ilike $${i} or coalesce(c.email, '') ilike $${i})`,
    );
  }
  const result = await pool.query<{
    id: string;
    kind: string;
    legal_name: string;
    registration_number: string | null;
    registered_address: string | null;
    country: string | null;
    business_activity: string | null;
    phone: string | null;
    email: string | null;
    document_prefix: string | null;
    signatory_name: string | null;
    signatory_title: string | null;
    created_at: Date;
    updated_at: Date;
    project_count: string;
    site_count: string;
    pool_count: string;
    employee_count: string;
  }>(
    `select c.*,
            (select count(*)::text from projects p where p.company_id = c.id) as project_count,
            (select count(*)::text from sites s
              inner join projects p on p.id = s.project_id where p.company_id = c.id) as site_count,
            (select count(*)::text from quota_pools qp
              inner join sites s on s.id = qp.site_id
              inner join projects p on p.id = s.project_id where p.company_id = c.id) as pool_count,
            (select count(*)::text from employees e where e.company_id = c.id) as employee_count
     from companies c
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by c.legal_name`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: (row.kind === "client" ? "client" : "employer") as CompanyKind,
    legalName: row.legal_name,
    registrationNumber: row.registration_number,
    registeredAddress: row.registered_address,
    country: row.country,
    businessActivity: row.business_activity,
    phone: row.phone,
    email: row.email,
    documentPrefix: row.document_prefix,
    signatoryName: row.signatory_name,
    signatoryTitle: row.signatory_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectCount: Number(row.project_count),
    siteCount: Number(row.site_count),
    poolCount: Number(row.pool_count),
    employeeCount: Number(row.employee_count),
  }));
}

export async function getCompany(id: string): Promise<CompanyRecord | null> {
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return rows[0] ? rowToCompany(rows[0]) : null;
}

export async function getCompanyDetail(id: string): Promise<CompanyDetail | null> {
  const company = await getCompany(id);
  if (!company) return null;
  const counts = await listCompaniesWithCounts();
  const listed = counts.find((item) => item.id === id);
  const projectsResult = await pool.query<{
    id: string;
    name: string;
    site_count: string;
    pool_count: string;
  }>(
    `select p.id, p.name,
            (select count(*)::text from sites s where s.project_id = p.id) as site_count,
            (select count(*)::text from quota_pools qp
              inner join sites s on s.id = qp.site_id where s.project_id = p.id) as pool_count
     from projects p
     where p.company_id = $1
     order by p.name`,
    [id],
  );
  const employeesResult = await pool.query<{
    id: string;
    legal_name: string;
    passport_number: string | null;
    occupation: string | null;
    employment_status: string | null;
    photo_file_id: string | null;
  }>(
    `select id, legal_name, passport_number, occupation, employment_status, photo_file_id
     from employees where company_id = $1 order by legal_name limit 200`,
    [id],
  );
  return {
    ...company,
    projectCount: listed?.projectCount ?? 0,
    siteCount: listed?.siteCount ?? 0,
    poolCount: listed?.poolCount ?? 0,
    employeeCount: listed?.employeeCount ?? 0,
    projects: projectsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      siteCount: Number(row.site_count),
      poolCount: Number(row.pool_count),
    })),
    employees: employeesResult.rows.map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      passportNumber: row.passport_number,
      occupation: row.occupation,
      employmentStatus: row.employment_status,
      photoFileId: row.photo_file_id,
    })),
  };
}

export async function createCompany(input: CompanyInput | Record<string, unknown>): Promise<CompanyRecord> {
  const parsed = parseCompanyInput(input as Record<string, unknown>);
  const rows = await db
    .insert(companies)
    .values({ id: crypto.randomUUID(), ...parsed })
    .returning();
  return rowToCompany(rows[0]);
}

export async function updateCompany(id: string, input: CompanyInput | Record<string, unknown>): Promise<CompanyRecord | null> {
  const parsed = parseCompanyInput(input as Record<string, unknown>);
  const rows = await db
    .update(companies)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning();
  return rows[0] ? rowToCompany(rows[0]) : null;
}

export async function findCompanyByLegalName(legalName: string): Promise<CompanyRecord | null> {
  const rows = await db.select().from(companies).where(eq(companies.legalName, legalName)).limit(1);
  return rows[0] ? rowToCompany(rows[0]) : null;
}
