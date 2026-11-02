import { desc, eq } from "drizzle-orm";
import { db } from "../../lib/db.ts";
import { documentSnapshots, type CompanySnapshot } from "../../lib/schema.ts";
import { getCompany, type CompanyRecord } from "../companies/companies.ts";

export type StoredSnapshot = {
  id: string;
  companyId: string;
  snapshot: CompanySnapshot;
  createdAt: Date;
};

function freeze(company: CompanyRecord): CompanySnapshot {
  return {
    companyId: company.id,
    legalName: company.legalName,
    registrationNumber: company.registrationNumber,
    registeredAddress: company.registeredAddress,
    country: company.country,
    businessActivity: company.businessActivity,
    phone: company.phone,
    email: company.email,
    documentPrefix: company.documentPrefix,
    signatoryName: company.signatoryName,
    signatoryTitle: company.signatoryTitle,
  };
}

export async function captureSnapshot(companyId: string): Promise<StoredSnapshot | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const rows = await db
    .insert(documentSnapshots)
    .values({
      id: crypto.randomUUID(),
      companyId: company.id,
      snapshot: freeze(company),
    })
    .returning();
  const row = rows[0];
  return {
    id: row.id,
    companyId: row.companyId,
    snapshot: row.snapshot,
    createdAt: row.createdAt,
  };
}

export async function listSnapshots(): Promise<StoredSnapshot[]> {
  const rows = await db.select().from(documentSnapshots).orderBy(desc(documentSnapshots.createdAt));
  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    snapshot: row.snapshot,
    createdAt: row.createdAt,
  }));
}

export async function getSnapshot(id: string): Promise<StoredSnapshot | null> {
  const rows = await db.select().from(documentSnapshots).where(eq(documentSnapshots.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    snapshot: row.snapshot,
    createdAt: row.createdAt,
  };
}
