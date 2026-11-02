import { eq } from "drizzle-orm";
import { db } from "../../lib/db.ts";
import { companyPreferences } from "../../lib/schema.ts";
import { getCompany } from "./companies.ts";

export const LOCAL_SCOPE = "local";

export type Preferences = {
  defaultCompanyId: string | null;
  selectedCompanyId: string | null;
};

export async function getPreferences(): Promise<Preferences> {
  const rows = await db
    .select()
    .from(companyPreferences)
    .where(eq(companyPreferences.scopeKey, LOCAL_SCOPE))
    .limit(1);
  const row = rows[0];
  if (!row) return { defaultCompanyId: null, selectedCompanyId: null };
  return {
    defaultCompanyId: row.defaultCompanyId,
    selectedCompanyId: row.selectedCompanyId,
  };
}

export function editorCompanyId(preferences: Preferences): string | null {
  return preferences.selectedCompanyId ?? preferences.defaultCompanyId;
}

async function setPreference(column: "defaultCompanyId" | "selectedCompanyId", companyId: string): Promise<Preferences> {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  await db
    .update(companyPreferences)
    .set({ [column]: companyId, updatedAt: new Date() })
    .where(eq(companyPreferences.scopeKey, LOCAL_SCOPE));
  return getPreferences();
}

export function setDefaultCompany(companyId: string): Promise<Preferences> {
  return setPreference("defaultCompanyId", companyId);
}

export function setSelectedCompany(companyId: string): Promise<Preferences> {
  return setPreference("selectedCompanyId", companyId);
}
