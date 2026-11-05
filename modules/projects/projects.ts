import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import { pool, db } from "../../lib/db.ts";
import {
  companies,
  employees,
  projectDocuments,
  projects,
  quotaPools,
  sites,
  slots,
} from "../../lib/schema.ts";

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

export type ProjectRecord = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  siteCount: number;
  poolCount: number;
  slotCount: number;
  openSlotCount: number;
  employeeCount: number;
};

export async function listProjects(): Promise<ProjectRecord[]> {
  const result = await pool.query<{
    id: string;
    company_id: string;
    company_name: string;
    name: string;
    site_count: string;
    pool_count: string;
    slot_count: string;
    open_slot_count: string;
    employee_count: string;
  }>(
    `select p.id, p.company_id, c.legal_name as company_name, p.name,
            coalesce(site_stats.site_count, 0)::text as site_count,
            coalesce(site_stats.pool_count, 0)::text as pool_count,
            coalesce(slot_stats.slot_count, 0)::text as slot_count,
            coalesce(slot_stats.open_slot_count, 0)::text as open_slot_count,
            coalesce(slot_stats.employee_count, 0)::text as employee_count
     from projects p
     join companies c on c.id = p.company_id
     left join lateral (
       select count(distinct s.id)::int as site_count,
              count(distinct qp.id)::int as pool_count
       from sites s
       left join quota_pools qp on qp.site_id = s.id
       where s.project_id = p.id
     ) site_stats on true
     left join lateral (
       select count(*)::int as slot_count,
              count(*) filter (where sl.status = 'open')::int as open_slot_count,
              count(*) filter (where sl.status = 'occupied' and sl.employee_id is not null)::int as employee_count
       from slots sl
       where sl.project_id = p.id
     ) slot_stats on true
     order by p.name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    name: row.name,
    siteCount: Number(row.site_count),
    poolCount: Number(row.pool_count),
    slotCount: Number(row.slot_count),
    openSlotCount: Number(row.open_slot_count),
    employeeCount: Number(row.employee_count),
  }));
}

export async function createProject(companyId: string, name: string): Promise<ProjectRecord> {
  const trimmed = name.trim();
  if (!trimmed) throw new ProjectError("Project name is required");
  const companyRows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const company = companyRows[0];
  if (!company) throw new ProjectError("Company not found");
  if (company.kind === "client") {
    throw new ProjectError("Projects belong to legal employers, not client companies");
  }
  const rows = await db
    .insert(projects)
    .values({ id: crypto.randomUUID(), companyId, name: trimmed })
    .returning();
  return {
    id: rows[0].id,
    companyId,
    companyName: company.legalName,
    name: rows[0].name,
    siteCount: 0,
    poolCount: 0,
    slotCount: 0,
    openSlotCount: 0,
    employeeCount: 0,
  };
}

export async function addSite(projectId: string, name: string, siteType?: string, address?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new ProjectError("Site name is required");
  const type = siteType?.trim() || null;
  if (type && type !== "Address" && type !== "Vessel") throw new ProjectError("Site type must be Address or Vessel");
  const siteAddress = address?.trim() || null;
  if (siteAddress && siteAddress.length > 500) throw new ProjectError("Site address is too long");
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project[0]) throw new ProjectError("Project not found");
  await db.insert(sites).values({ id: crypto.randomUUID(), projectId, name: trimmed, siteType: type, address: siteAddress });
}

export async function addQuotaPool(projectId: string, siteId: string, name: string, capacity: number, poolNumber?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new ProjectError("Quota pool name is required");
  if (!Number.isInteger(capacity) || capacity < 1) throw new ProjectError("Capacity must be a whole number of places");
  const number = poolNumber?.trim() || null;
  if (number && number.length > 80) throw new ProjectError("Quota pool number is too long");
  const siteRows = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  const site = siteRows[0];
  if (!site || site.projectId !== projectId) throw new ProjectError("Site not found on this project");
  const poolId = crypto.randomUUID();
  await inTransaction(async (client) => {
    await client.query(
      "insert into quota_pools (id, site_id, name, capacity, pool_number) values ($1, $2, $3, $4, $5)",
      [poolId, siteId, trimmed, capacity, number],
    );
    for (let slotNumber = 1; slotNumber <= capacity; slotNumber += 1) {
      await client.query(
        "insert into slots (id, project_id, quota_pool_id, slot_number, status) values ($1, $2, $3, $4, 'open')",
        [crypto.randomUUID(), projectId, poolId, slotNumber],
      );
    }
  });
}

export async function addProjectDocument(projectId: string, title: string, notes: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) throw new ProjectError("Document title is required");
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project[0]) throw new ProjectError("Project not found");
  await db.insert(projectDocuments).values({
    id: crypto.randomUUID(),
    projectId,
    title: trimmed,
    notes: notes.trim() || null,
  });
}

async function resolvePoolId(client: PoolClient, projectId: string, quotaPoolId: string, slotId?: string): Promise<string> {
  if (quotaPoolId) return quotaPoolId;
  if (!slotId) throw new ProjectError("Quota pool not found");
  const found = await client.query<{ quota_pool_id: string }>(
    "select quota_pool_id from slots where id = $1 and project_id = $2",
    [slotId, projectId],
  );
  if (!found.rowCount) throw new ProjectError("Quota slot not found");
  return found.rows[0].quota_pool_id;
}

async function allocateSlot(
  client: PoolClient,
  projectId: string,
  quotaPoolId: string,
  employeeId: string,
  slotId?: string,
): Promise<string> {
  quotaPoolId = await resolvePoolId(client, projectId, quotaPoolId, slotId);
  const project = await client.query<{ company_id: string }>("select company_id from projects where id = $1", [projectId]);
  if (!project.rowCount) throw new ProjectError("Project not found");
  const poolRow = await client.query<{ project_id: string }>(
    `select sites.project_id
     from quota_pools
     join sites on sites.id = quota_pools.site_id
     where quota_pools.id = $1
     for update`,
    [quotaPoolId],
  );
  if (!poolRow.rowCount) throw new ProjectError("Quota pool not found");
  if (poolRow.rows[0].project_id !== projectId) throw new ProjectError("That quota pool belongs to another project");
  const employee = await client.query<{ company_id: string; occupation: string | null }>(
    "select company_id, occupation from employees where id = $1",
    [employeeId],
  );
  if (!employee.rowCount) throw new ProjectError("Employee not found");
  if (employee.rows[0].company_id !== project.rows[0].company_id) {
    throw new ProjectError("That employee belongs to another company");
  }
  const open = slotId
    ? await client.query<{ id: string; status: string }>(
        "select id, status from slots where id = $1 and quota_pool_id = $2 and project_id = $3 for update",
        [slotId, quotaPoolId, projectId],
      )
    : await client.query<{ id: string; status: string }>(
        "select id, status from slots where quota_pool_id = $1 and status = 'open' order by slot_number for update limit 1",
        [quotaPoolId],
      );
  if (!open.rowCount || open.rows[0].status !== "open") throw new ProjectError("This quota pool has no open place");
  await client.query(
    "update slots set employee_id = $1, status = 'occupied', occupation = coalesce(occupation, $2) where id = $3",
    [employeeId, employee.rows[0].occupation, open.rows[0].id],
  );
  return open.rows[0].id;
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new ProjectError("This employee already has a slot on this project");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function openSlot(projectId: string, quotaPoolId: string, employeeId: string, slotId?: string): Promise<string> {
  return inTransaction((client) => allocateSlot(client, projectId, quotaPoolId, employeeId, slotId));
}

/** Free every slot currently held by this employee. */
export async function releaseEmployeeSlots(employeeId: string): Promise<void> {
  await pool.query(
    `update slots
     set employee_id = null, status = 'open', occupation = null
     where employee_id = $1`,
    [employeeId],
  );
}

/**
 * Keep slot occupancy aligned with employee placement:
 * employer → project → site → pool → slot → employee.
 */
export async function syncEmployeeSlot(input: {
  employeeId: string;
  projectId: string | null;
  quotaPoolId: string | null;
  slotId?: string | null;
}): Promise<string | null> {
  const { employeeId, projectId, quotaPoolId, slotId } = input;
  if (!projectId || !quotaPoolId) {
    await releaseEmployeeSlots(employeeId);
    return null;
  }
  const current = await pool.query<{ id: string }>(
    `select id from slots where employee_id = $1 and project_id = $2 limit 1`,
    [employeeId, projectId],
  );
  if (slotId && current.rows[0]?.id === slotId) return slotId;
  await releaseEmployeeSlots(employeeId);
  return openSlot(projectId, quotaPoolId, employeeId, slotId || undefined);
}

export async function openSlotForName(projectId: string, quotaPoolId: string, employeeName: string, slotId?: string): Promise<string> {
  const name = employeeName.trim();
  if (!name) throw new ProjectError("Employee name is required");
  if (name.length > 200) throw new ProjectError("Employee name is too long");
  return inTransaction(async (client) => {
    const project = await client.query<{ company_id: string }>("select company_id from projects where id = $1", [projectId]);
    if (!project.rowCount) throw new ProjectError("Project not found");
    quotaPoolId = await resolvePoolId(client, projectId, quotaPoolId, slotId);
    await client.query("select id from quota_pools where id = $1 for update", [quotaPoolId]);
    const open = slotId
      ? await client.query(
          "select id from slots where id = $1 and quota_pool_id = $2 and project_id = $3 and status = 'open' for update",
          [slotId, quotaPoolId, projectId],
        )
      : await client.query(
          "select id from slots where quota_pool_id = $1 and project_id = $2 and status = 'open' order by slot_number for update limit 1",
          [quotaPoolId, projectId],
        );
    if (!open.rowCount) throw new ProjectError("This quota pool has no open place");
    const employeeId = crypto.randomUUID();
    await client.query("insert into employees (id, company_id, legal_name) values ($1, $2, $3)", [
      employeeId,
      project.rows[0].company_id,
      name,
    ]);
    return allocateSlot(client, projectId, quotaPoolId, employeeId, slotId);
  });
}

export type ProjectView = {
  project: ProjectRecord;
  sites: { id: string; name: string; siteType: string | null; address: string | null; state: string }[];
  pools: { id: string; siteId: string; siteName: string; name: string; poolNumber: string | null; capacity: number; used: number; open: number }[];
  slots: {
    id: string;
    slotNumber: number | null;
    status: string;
    occupation: string | null;
    employeeId: string | null;
    employeeName: string | null;
    poolId: string;
    poolName: string;
    siteId: string;
    siteName: string;
  }[];
  documents: { id: string; title: string; notes: string | null }[];
  employees: { id: string; legalName: string }[];
};

export async function getProjectView(projectId: string): Promise<ProjectView | null> {
  const projectRows = await listProjects();
  const project = projectRows.find((item) => item.id === projectId);
  if (!project) return null;
  const siteRows = await db.select().from(sites).where(eq(sites.projectId, projectId)).orderBy(sites.name);
  const poolRows = await db
    .select({
      id: quotaPools.id,
      siteId: quotaPools.siteId,
      siteName: sites.name,
      name: quotaPools.name,
      poolNumber: quotaPools.poolNumber,
      capacity: quotaPools.capacity,
    })
    .from(quotaPools)
    .innerJoin(sites, eq(sites.id, quotaPools.siteId))
    .where(eq(sites.projectId, projectId))
    .orderBy(quotaPools.name);
  const slotRows = await db
    .select({
      id: slots.id,
      slotNumber: slots.slotNumber,
      status: slots.status,
      occupation: slots.occupation,
      employeeId: slots.employeeId,
      employeeOccupation: employees.occupation,
      employeeName: employees.legalName,
      poolName: quotaPools.name,
      siteId: sites.id,
      siteName: sites.name,
      poolId: slots.quotaPoolId,
    })
    .from(slots)
    .leftJoin(employees, eq(employees.id, slots.employeeId))
    .innerJoin(quotaPools, eq(quotaPools.id, slots.quotaPoolId))
    .innerJoin(sites, eq(sites.id, quotaPools.siteId))
    .where(eq(slots.projectId, projectId))
    .orderBy(quotaPools.name, slots.slotNumber);
  const usedByPool = new Map<string, number>();
  const openByPool = new Map<string, number>();
  for (const slot of slotRows) {
    if (slot.status === "occupied") usedByPool.set(slot.poolId, (usedByPool.get(slot.poolId) ?? 0) + 1);
    if (slot.status === "open") openByPool.set(slot.poolId, (openByPool.get(slot.poolId) ?? 0) + 1);
  }
  const documentRows = await db
    .select()
    .from(projectDocuments)
    .where(eq(projectDocuments.projectId, projectId))
    .orderBy(projectDocuments.createdAt);
  const employeeRows = await db.select().from(employees).where(eq(employees.companyId, project.companyId)).orderBy(employees.legalName);
  return {
    project,
    sites: siteRows.map((site) => ({
      id: site.id,
      name: site.name,
      siteType: site.siteType,
      address: site.address,
      state: site.state,
    })),
    pools: poolRows.map((poolRow) => ({
      ...poolRow,
      used: usedByPool.get(poolRow.id) ?? 0,
      open: openByPool.get(poolRow.id) ?? 0,
    })),
    slots: slotRows.map((slot) => ({
      id: slot.id,
      slotNumber: slot.slotNumber,
      status: slot.status,
      occupation: slot.occupation ?? slot.employeeOccupation,
      employeeId: slot.employeeId,
      employeeName: slot.employeeName,
      poolId: slot.poolId,
      poolName: slot.poolName,
      siteId: slot.siteId,
      siteName: slot.siteName,
    })),
    documents: documentRows.map((document) => ({ id: document.id, title: document.title, notes: document.notes })),
    employees: employeeRows.map((employee) => ({ id: employee.id, legalName: employee.legalName })),
  };
}
