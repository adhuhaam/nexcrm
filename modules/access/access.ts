import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "../../lib/db.ts";
import {
  ACCESS_CATEGORIES,
  ALL_MODULE_KEYS,
  ACCESS_ONLY_MODULES,
  actionForRequest,
  aggregateFlags,
  emptyModulePermission,
  fullModulePermission,
  moduleForPath,
  normalizeModulePermission,
  permissionsFromFlags,
  type ModulePermission,
} from "./permissions.ts";

const scrypt = promisify(scryptCallback);
const sessionHours = 12;

export type RoleRecord = {
  id: string;
  slug: string;
  name: string;
  canPreview: boolean;
  canEdit: boolean;
  canDelete: boolean;
  systemRole: boolean;
  permissions: ModulePermission[];
};

export type OfficeUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: RoleRecord;
  /** null = unrestricted (system admin). Otherwise assigned restaurant client ids. */
  scopedClientIds: string[] | null;
};

const builtInRoles: Array<Omit<RoleRecord, "id" | "permissions"> & { accessModules?: "full" | "none" | "view" }> = [
  { slug: "system_admin", name: "System admin", canPreview: true, canEdit: true, canDelete: true, systemRole: true, accessModules: "full" },
  { slug: "company", name: "Company", canPreview: true, canEdit: true, canDelete: true, systemRole: true, accessModules: "none" },
  { slug: "manager", name: "Manager", canPreview: true, canEdit: true, canDelete: false, systemRole: true, accessModules: "none" },
  { slug: "hr_manager", name: "HR manager", canPreview: true, canEdit: true, canDelete: true, systemRole: true, accessModules: "none" },
  { slug: "hr_staff", name: "HR staff", canPreview: true, canEdit: true, canDelete: false, systemRole: true, accessModules: "none" },
  { slug: "client", name: "Client", canPreview: true, canEdit: false, canDelete: false, systemRole: true, accessModules: "none" },
  { slug: "vendor", name: "Vendor", canPreview: true, canEdit: false, canDelete: false, systemRole: true, accessModules: "none" },
  { slug: "agent", name: "Agent", canPreview: true, canEdit: true, canDelete: false, systemRole: true, accessModules: "none" },
  { slug: "investor_guest", name: "Investor guest", canPreview: true, canEdit: false, canDelete: false, systemRole: true, accessModules: "none" },
];

type RoleRow = {
  id: string;
  slug: string;
  name: string;
  can_preview: boolean;
  can_edit: boolean;
  can_delete: boolean;
  system_role: boolean;
};

type PermissionRow = {
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

function roleFrom(row: RoleRow, permissions: ModulePermission[]): RoleRecord {
  const flags = aggregateFlags(permissions);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    canPreview: row.slug === "system_admin" ? true : flags.canPreview || row.can_preview,
    canEdit: row.slug === "system_admin" ? true : flags.canEdit || row.can_edit,
    canDelete: row.slug === "system_admin" ? true : flags.canDelete || row.can_delete,
    systemRole: row.system_role,
    permissions: completePermissions(permissions, row.slug === "system_admin"),
  };
}

function completePermissions(permissions: ModulePermission[], fullAccess: boolean): ModulePermission[] {
  const byModule = new Map(permissions.map((item) => [item.module, item]));
  return ALL_MODULE_KEYS.map((module) => {
    if (fullAccess) return fullModulePermission(module);
    return byModule.get(module) ?? emptyModulePermission(module);
  });
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [method, salt, expected] = stored.split("$");
  if (method !== "scrypt" || !salt || !expected) return false;
  const derived = (await scrypt(password, salt, 32)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");
  return expectedBuffer.length === derived.length && timingSafeEqual(derived, expectedBuffer);
}

async function loadPermissionsForRoles(roleIds: string[]): Promise<Map<string, ModulePermission[]>> {
  const map = new Map<string, ModulePermission[]>();
  if (!roleIds.length) return map;
  const result = await pool.query<PermissionRow>(
    `select role_id, module, can_view, can_create, can_edit, can_delete
     from role_permissions where role_id = any($1::uuid[])`,
    [roleIds],
  );
  for (const row of result.rows) {
    const list = map.get(row.role_id) ?? [];
    list.push({
      module: row.module,
      canView: row.can_view,
      canCreate: row.can_create,
      canEdit: row.can_edit,
      canDelete: row.can_delete,
    });
    map.set(row.role_id, list);
  }
  return map;
}

async function replaceRolePermissions(roleId: string, permissions: ModulePermission[]): Promise<void> {
  const normalized = completePermissions(
    permissions
      .filter((item) => ALL_MODULE_KEYS.includes(item.module))
      .map(normalizeModulePermission),
    false,
  );
  await pool.query(`delete from role_permissions where role_id = $1`, [roleId]);
  for (const item of normalized) {
    await pool.query(
      `insert into role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
       values ($1, $2, $3, $4, $5, $6)`,
      [roleId, item.module, item.canView, item.canCreate, item.canEdit, item.canDelete],
    );
  }
}

export async function seedRoles(): Promise<void> {
  for (const role of builtInRoles) {
    await pool.query(
      `insert into roles (id, slug, name, can_preview, can_edit, can_delete, system_role)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, true)
       on conflict (slug) do nothing`,
      [role.slug, role.name, role.canPreview, role.canEdit, role.canDelete],
    );
  }
  await seedMissingRolePermissions();
}

/** Backfill module permissions for roles that have none yet. */
export async function seedMissingRolePermissions(): Promise<void> {
  const roles = await pool.query<RoleRow>(
    `select id, slug, name, can_preview, can_edit, can_delete, system_role from roles`,
  );
  for (const role of roles.rows) {
    const existing = await pool.query<{ count: string }>(
      `select count(*)::text as count from role_permissions where role_id = $1`,
      [role.id],
    );
    if (Number(existing.rows[0]?.count ?? 0) > 0) continue;
    const builtIn = builtInRoles.find((item) => item.slug === role.slug);
    const accessModules =
      role.slug === "system_admin" ? "full" : (builtIn?.accessModules ?? "none");
    const permissions = permissionsFromFlags(
      ALL_MODULE_KEYS,
      {
        canPreview: role.can_preview,
        canEdit: role.can_edit,
        canDelete: role.can_delete,
      },
      { accessModules },
    );
    await replaceRolePermissions(role.id, permissions);
  }
}

export async function listRoles(): Promise<RoleRecord[]> {
  await seedMissingRolePermissions();
  const result = await pool.query<RoleRow>(
    `select id, slug, name, can_preview, can_edit, can_delete, system_role
     from roles order by system_role desc, name`,
  );
  const permissions = await loadPermissionsForRoles(result.rows.map((row) => row.id));
  return result.rows.map((row) => roleFrom(row, permissions.get(row.id) ?? []));
}

export async function roleBySlug(slug: string): Promise<RoleRecord | null> {
  const result = await pool.query<RoleRow>(
    `select id, slug, name, can_preview, can_edit, can_delete, system_role from roles where slug = $1`,
    [slug],
  );
  const row = result.rows[0];
  if (!row) return null;
  const permissions = await loadPermissionsForRoles([row.id]);
  return roleFrom(row, permissions.get(row.id) ?? []);
}

export async function createRole(input: {
  name: string;
  canPreview?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  permissions?: ModulePermission[];
}): Promise<RoleRecord> {
  const name = input.name.trim();
  const slug = slugify(name);
  if (!name || !slug) throw new AccessError("Enter a role name.");
  if (builtInRoles.some((role) => role.slug === slug)) throw new AccessError("That role already exists.");

  const rawPermissions = input.permissions?.length
    ? input.permissions.map(normalizeModulePermission)
    : permissionsFromFlags(
        ALL_MODULE_KEYS,
        {
          canPreview: Boolean(input.canPreview),
          canEdit: Boolean(input.canEdit),
          canDelete: Boolean(input.canDelete),
        },
        { accessModules: "none" },
      );
  const permissions = rawPermissions.map((item) =>
    ACCESS_ONLY_MODULES.has(item.module) ? emptyModulePermission(item.module) : item,
  );
  const flags = aggregateFlags(permissions);

  try {
    const result = await pool.query<RoleRow>(
      `insert into roles (id, slug, name, can_preview, can_edit, can_delete, system_role)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, false)
       returning id, slug, name, can_preview, can_edit, can_delete, system_role`,
      [slug, name, flags.canPreview, flags.canEdit, flags.canDelete],
    );
    const row = result.rows[0];
    if (!row) throw new AccessError("The role could not be saved.");
    await replaceRolePermissions(row.id, permissions);
    return roleFrom(row, permissions);
  } catch (error) {
    if (isUnique(error)) throw new AccessError("That role already exists.");
    throw error;
  }
}

export async function updateRole(
  id: string,
  input: {
    name: string;
    canPreview?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    permissions?: ModulePermission[];
  },
): Promise<void> {
  const existing = await pool.query<RoleRow>(
    `select id, slug, name, can_preview, can_edit, can_delete, system_role from roles where id = $1`,
    [id],
  );
  const role = existing.rows[0];
  if (!role) throw new AccessError("That role was not found.");
  if (role.slug === "system_admin") {
    await pool.query(`update roles set name = $2 where id = $1`, [id, input.name.trim() || role.name]);
    await replaceRolePermissions(
      id,
      ALL_MODULE_KEYS.map((module) => fullModulePermission(module)),
    );
    return;
  }
  const name = input.name.trim();
  if (!name) throw new AccessError("Enter a role name.");

  const permissions = input.permissions?.length
    ? input.permissions.map(normalizeModulePermission)
    : permissionsFromFlags(
        ALL_MODULE_KEYS,
        {
          canPreview: Boolean(input.canPreview),
          canEdit: Boolean(input.canEdit),
          canDelete: Boolean(input.canDelete),
        },
        { accessModules: "none" },
      );
  // Custom roles never get Access & system modules unless explicitly set — strip accidental grants for non-admins.
  const safePermissions = permissions.map((item) =>
    ACCESS_ONLY_MODULES.has(item.module) && role.slug !== "system_admin"
      ? emptyModulePermission(item.module)
      : item,
  );
  const flags = aggregateFlags(safePermissions);
  await pool.query(
    `update roles set name = $2, can_preview = $3, can_edit = $4, can_delete = $5 where id = $1`,
    [id, name, flags.canPreview, flags.canEdit, flags.canDelete],
  );
  await replaceRolePermissions(id, safePermissions);
}

export async function deleteRole(id: string): Promise<void> {
  const existing = await pool.query<{ system_role: boolean; slug: string }>(
    `select system_role, slug from roles where id = $1`,
    [id],
  );
  const role = existing.rows[0];
  if (!role) throw new AccessError("That role was not found.");
  if (role.system_role) throw new AccessError("Built-in roles stay in the office.");
  const used = await pool.query<{ count: string }>(`select count(*) from users where role_id = $1`, [id]);
  if (Number(used.rows[0]?.count ?? 0) > 0) throw new AccessError("Move people off this role before deleting it.");
  await pool.query(`delete from roles where id = $1`, [id]);
}

async function attachScope(user: Omit<OfficeUser, "scopedClientIds">): Promise<OfficeUser> {
  if (user.role.slug === "system_admin") {
    return { ...user, scopedClientIds: null };
  }
  const { loadUserClientIds } = await import("./client-scope.ts");
  return { ...user, scopedClientIds: await loadUserClientIds(user.id) };
}

export async function listUsers(): Promise<OfficeUser[]> {
  const result = await pool.query<RoleRow & { user_id: string; user_name: string; email: string; active: boolean }>(
    `select users.id as user_id, users.name as user_name, users.email, users.active,
            roles.id, roles.slug, roles.name, roles.can_preview, roles.can_edit, roles.can_delete, roles.system_role
     from users join roles on roles.id = users.role_id
     order by users.name`,
  );
  const permissions = await loadPermissionsForRoles(result.rows.map((row) => row.id));
  const { listUserClientsMap } = await import("./client-scope.ts");
  const scopes = await listUserClientsMap(result.rows.map((row) => row.user_id));
  return result.rows.map((row) => {
    const base = {
      id: row.user_id,
      name: row.user_name,
      email: row.email,
      active: row.active,
      role: roleFrom(row, permissions.get(row.id) ?? []),
    };
    return {
      ...base,
      scopedClientIds: base.role.slug === "system_admin" ? null : (scopes.get(row.user_id) ?? []),
    };
  });
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  roleId: string;
  clientCompanyIds?: string[];
}): Promise<void> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email || input.password.length < 8) throw new AccessError("Name, email, and a password of at least 8 characters are required.");
  const passwordHash = await hashPassword(input.password);
  let userId = "";
  try {
    const inserted = await pool.query<{ id: string }>(
      `insert into users (id, role_id, name, email, password_hash)
       values (gen_random_uuid(), $1, $2, $3, $4)
       returning id`,
      [input.roleId, name, email, passwordHash],
    );
    userId = inserted.rows[0]?.id ?? "";
  } catch (error) {
    if (isUnique(error)) throw new AccessError("That email is already used.");
    throw error;
  }
  if (userId && input.clientCompanyIds?.length) {
    const { setUserClients } = await import("./client-scope.ts");
    try {
      await setUserClients(userId, input.clientCompanyIds);
    } catch (error) {
      throw new AccessError(error instanceof Error ? error.message : "Could not assign restaurant clients.");
    }
  }
}

export async function updateUser(
  id: string,
  input: { roleId: string; active: boolean; name?: string; password?: string; clientCompanyIds?: string[] },
): Promise<void> {
  const role = await pool.query<{ slug: string }>(`select slug from roles where id = $1`, [input.roleId]);
  if (!role.rows[0]) throw new AccessError("Choose a role.");
  const current = await pool.query<{ slug: string }>(
    `select roles.slug from users join roles on roles.id = users.role_id where users.id = $1`,
    [id],
  );
  if (!current.rows[0]) throw new AccessError("User not found.");
  const leavingAdmin = current.rows[0].slug === "system_admin" && (role.rows[0].slug !== "system_admin" || !input.active);
  if (leavingAdmin) {
    const others = await pool.query<{ count: string }>(
      `select count(*) from users join roles on roles.id = users.role_id
       where roles.slug = 'system_admin' and users.active = true and users.id <> $1`,
      [id],
    );
    if (Number(others.rows[0]?.count ?? 0) === 0) throw new AccessError("Keep at least one active system admin.");
  }
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new AccessError("Name is required.");
  if (input.password !== undefined && input.password !== "" && input.password.length < 8) {
    throw new AccessError("Password must be at least 8 characters.");
  }
  if (input.password) {
    const passwordHash = await hashPassword(input.password);
    await pool.query(`update users set role_id = $2, active = $3, name = coalesce($4, name), password_hash = $5 where id = $1`, [
      id,
      input.roleId,
      input.active,
      name ?? null,
      passwordHash,
    ]);
  } else {
    await pool.query(`update users set role_id = $2, active = $3, name = coalesce($4, name) where id = $1`, [
      id,
      input.roleId,
      input.active,
      name ?? null,
    ]);
  }
  if (input.clientCompanyIds !== undefined) {
    const { setUserClients } = await import("./client-scope.ts");
    try {
      await setUserClients(id, input.clientCompanyIds);
    } catch (error) {
      throw new AccessError(error instanceof Error ? error.message : "Could not assign restaurant clients.");
    }
  }
}

export async function openSession(email: string, password: string): Promise<{ token: string; user: OfficeUser } | null> {
  const result = await pool.query<RoleRow & { user_id: string; user_name: string; email: string; active: boolean; password_hash: string }>(
    `select users.id as user_id, users.name as user_name, users.email, users.active, users.password_hash,
            roles.id, roles.slug, roles.name, roles.can_preview, roles.can_edit, roles.can_delete, roles.system_role
     from users join roles on roles.id = users.role_id
     where lower(users.email) = lower($1)`,
    [email.trim()],
  );
  const row = result.rows[0];
  if (!row || !row.active || !(await verifyPassword(password, row.password_hash))) return null;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(
    `insert into sessions (id, user_id, token_hash, expires_at)
     values (gen_random_uuid(), $1, $2, now() + ($3 || ' hours')::interval)`,
    [row.user_id, tokenHash, String(sessionHours)],
  );
  const permissions = await loadPermissionsForRoles([row.id]);
  return {
    token,
    user: await attachScope({
      id: row.user_id,
      name: row.user_name,
      email: row.email,
      active: row.active,
      role: roleFrom(row, permissions.get(row.id) ?? []),
    }),
  };
}

export async function userForToken(token: string): Promise<OfficeUser | null> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query<RoleRow & { user_id: string; user_name: string; email: string; active: boolean }>(
    `select users.id as user_id, users.name as user_name, users.email, users.active,
            roles.id, roles.slug, roles.name, roles.can_preview, roles.can_edit, roles.can_delete, roles.system_role
     from sessions
     join users on users.id = sessions.user_id
     join roles on roles.id = users.role_id
     where sessions.token_hash = $1 and sessions.expires_at > now()`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row || !row.active) return null;
  const permissions = await loadPermissionsForRoles([row.id]);
  return attachScope({
    id: row.user_id,
    name: row.user_name,
    email: row.email,
    active: row.active,
    role: roleFrom(row, permissions.get(row.id) ?? []),
  });
}

export async function closeSession(token: string): Promise<void> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(`delete from sessions where token_hash = $1`, [tokenHash]);
}

function permissionAllows(role: RoleRecord, module: string, action: "view" | "create" | "edit" | "delete"): boolean {
  if (role.slug === "system_admin") return true;
  const entry = role.permissions.find((item) => item.module === module);
  if (!entry) return false;
  if (action === "view") return entry.canView;
  if (action === "create") return entry.canCreate;
  if (action === "edit") return entry.canEdit;
  return entry.canDelete;
}

export function authorize(method: string, path: string, user: OfficeUser): string | null {
  if (user.role.slug === "system_admin") return null;

  const module = moduleForPath(path);
  if (!module) {
    // Unknown routes: fall back to legacy global flags.
    const verb = method.toUpperCase();
    if (verb === "GET" || verb === "HEAD") return user.role.canPreview ? null : "Your role cannot preview records.";
    if (verb === "DELETE") return user.role.canDelete ? null : "Your role cannot delete records.";
    return user.role.canEdit ? null : "Your role cannot edit records.";
  }

  if (ACCESS_ONLY_MODULES.has(module) && user.role.slug !== "system_admin") {
    return "Only a system admin can manage access.";
  }

  const action = actionForRequest(method, path);
  if (permissionAllows(user.role, module, action)) return null;
  if (action === "view") return "Your role cannot preview this module.";
  if (action === "create") return "Your role cannot create in this module.";
  if (action === "delete") return "Your role cannot delete in this module.";
  return "Your role cannot edit this module.";
}

export function accessCatalog() {
  return { categories: ACCESS_CATEGORIES, actions: ["view", "create", "edit", "delete"] as const };
}

export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessError";
  }
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
