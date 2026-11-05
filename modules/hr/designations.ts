import { randomUUID } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "../../lib/db.ts";
import { designations } from "../../lib/schema.ts";

export class DesignationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignationError";
  }
}

export type Designation = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRow(row: typeof designations.$inferSelect): Designation {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function nameOf(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new DesignationError("Designation name is required");
  if (text.length > 200) throw new DesignationError("Designation name is too long");
  // Helper / Labour are the same role as Labor in this agency.
  if (/^(helper|labour)$/i.test(text)) return "Labor";
  return text;
}

async function assertUniqueName(name: string, exceptId?: string): Promise<void> {
  const rows = await db
    .select({ id: designations.id })
    .from(designations)
    .where(
      exceptId
        ? and(sql`lower(trim(${designations.name})) = lower(${name})`, ne(designations.id, exceptId))
        : sql`lower(trim(${designations.name})) = lower(${name})`,
    )
    .limit(1);
  if (rows[0]) throw new DesignationError("That designation already exists");
}

export async function listDesignations(opts?: { includeInactive?: boolean }): Promise<Designation[]> {
  const rows = opts?.includeInactive
    ? await db
        .select()
        .from(designations)
        .orderBy(asc(designations.sortOrder), asc(designations.name))
    : await db
        .select()
        .from(designations)
        .where(eq(designations.active, true))
        .orderBy(asc(designations.sortOrder), asc(designations.name));
  return rows.map(mapRow);
}

export async function createDesignation(input: {
  name: unknown;
  sortOrder?: unknown;
}): Promise<Designation> {
  const name = nameOf(input.name);
  await assertUniqueName(name);
  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.trunc(input.sortOrder)
      : typeof input.sortOrder === "string" && /^\d+$/.test(input.sortOrder.trim())
        ? Number(input.sortOrder.trim())
        : 0;

  const rows = await db
    .insert(designations)
    .values({
      id: randomUUID(),
      name,
      sortOrder,
      active: true,
    })
    .returning();
  return mapRow(rows[0]);
}

export async function updateDesignation(
  id: string,
  input: { name?: unknown; sortOrder?: unknown; active?: unknown },
): Promise<Designation> {
  if (!uuidPattern.test(id)) throw new DesignationError("Designation not found");
  const existing = await db.select().from(designations).where(eq(designations.id, id)).limit(1);
  if (!existing[0]) throw new DesignationError("Designation not found");

  const patch: Partial<typeof designations.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = nameOf(input.name);
    await assertUniqueName(name, id);
    patch.name = name;
  }
  if (input.sortOrder !== undefined) {
    const sortOrder =
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.trunc(input.sortOrder)
        : typeof input.sortOrder === "string" && /^-?\d+$/.test(input.sortOrder.trim())
          ? Number(input.sortOrder.trim())
          : null;
    if (sortOrder === null) throw new DesignationError("Sort order must be a number");
    patch.sortOrder = sortOrder;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") throw new DesignationError("Active must be true or false");
    patch.active = input.active;
  }

  const rows = await db.update(designations).set(patch).where(eq(designations.id, id)).returning();
  return mapRow(rows[0]);
}

export async function deactivateDesignation(id: string): Promise<boolean> {
  if (!uuidPattern.test(id)) return false;
  const rows = await db
    .update(designations)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(designations.id, id))
    .returning();
  return Boolean(rows[0]);
}
