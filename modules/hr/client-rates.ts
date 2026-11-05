import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../lib/db.ts";
import { clientDesignationRates, companies } from "../../lib/schema.ts";

export class ClientRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientRateError";
  }
}

export type ClientDesignationRate = {
  id: string;
  clientCompanyId: string;
  designation: string;
  staffMonthRate: string;
  billMonthRate: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money(value: unknown, label: string): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new ClientRateError(`${label} must be a number`);
  return Number(text).toFixed(2);
}

function designationOf(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ClientRateError("Designation is required");
  if (text.length > 200) throw new ClientRateError("Designation is too long");
  if (/^(helper|labour)$/i.test(text)) return "Labor";
  return text;
}

function mapRow(row: typeof clientDesignationRates.$inferSelect): ClientDesignationRate {
  return {
    id: row.id,
    clientCompanyId: row.clientCompanyId,
    designation: row.designation,
    staffMonthRate: String(row.staffMonthRate),
    billMonthRate: String(row.billMonthRate),
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertClient(clientCompanyId: string): Promise<void> {
  if (!uuidPattern.test(clientCompanyId)) throw new ClientRateError("Client is required");
  const rows = await db.select().from(companies).where(eq(companies.id, clientCompanyId)).limit(1);
  if (!rows[0] || rows[0].kind !== "client") throw new ClientRateError("Select a client company");
}

export async function listClientDesignationRates(clientCompanyId: string): Promise<ClientDesignationRate[]> {
  await assertClient(clientCompanyId);
  const rows = await db
    .select()
    .from(clientDesignationRates)
    .where(eq(clientDesignationRates.clientCompanyId, clientCompanyId))
    .orderBy(asc(clientDesignationRates.designation));
  return rows.map(mapRow);
}

export async function findClientDesignationRate(
  clientCompanyId: string,
  designation: string,
): Promise<ClientDesignationRate | null> {
  if (!uuidPattern.test(clientCompanyId) || !designation.trim()) return null;
  const rows = await db
    .select()
    .from(clientDesignationRates)
    .where(
      and(
        eq(clientDesignationRates.clientCompanyId, clientCompanyId),
        sql`lower(trim(${clientDesignationRates.designation})) = lower(trim(${designation}))`,
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertClientDesignationRate(input: {
  clientCompanyId: string;
  designation: unknown;
  staffMonthRate?: unknown;
  billMonthRate?: unknown;
  /** @deprecated accept old day-rate keys from earlier UI */
  staffDayRate?: unknown;
  billDayRate?: unknown;
  currency?: unknown;
}): Promise<ClientDesignationRate> {
  await assertClient(input.clientCompanyId);
  const designation = designationOf(input.designation);
  const staffMonthRate = money(input.staffMonthRate ?? input.staffDayRate, "Staff monthly salary");
  const billMonthRate = money(input.billMonthRate ?? input.billDayRate, "Client monthly bill rate");
  const currency =
    typeof input.currency === "string" && input.currency.trim() ? input.currency.trim().slice(0, 8) : "MVR";

  const existing = await findClientDesignationRate(input.clientCompanyId, designation);
  if (existing) {
    const rows = await db
      .update(clientDesignationRates)
      .set({ staffMonthRate, billMonthRate, currency, designation, updatedAt: new Date() })
      .where(eq(clientDesignationRates.id, existing.id))
      .returning();
    return mapRow(rows[0]);
  }

  const rows = await db
    .insert(clientDesignationRates)
    .values({
      id: randomUUID(),
      clientCompanyId: input.clientCompanyId,
      designation,
      staffMonthRate,
      billMonthRate,
      currency,
    })
    .returning();
  return mapRow(rows[0]);
}

export async function deleteClientDesignationRate(id: string): Promise<boolean> {
  if (!uuidPattern.test(id)) return false;
  const rows = await db.delete(clientDesignationRates).where(eq(clientDesignationRates.id, id)).returning();
  return Boolean(rows[0]);
}
