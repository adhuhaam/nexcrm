import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "../../lib/db.ts";

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
};

export type OfficeUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: RoleRecord;
};

const builtInRoles: Array<Omit<RoleRecord, "id">> = [
  { slug: "system_admin", name: "System admin", canPreview: true, canEdit: true, canDelete: true, systemRole: true },
  { slug: "company", name: "Company", canPreview: true, canEdit: true, canDelete: true, systemRole: true },
  { slug: "manager", name: "Manager", canPreview: true, canEdit: true, canDelete: false, systemRole: true },
  { slug: "hr_manager", name: "HR manager", canPreview: true, canEdit: true, canDelete: true, systemRole: true },
  { slug: "hr_staff", name: "HR staff", canPreview: true, canEdit: true, canDelete: false, systemRole: true },
  { slug: "client", name: "Client", canPreview: true, canEdit: false, canDelete: false, systemRole: true },
  { slug: "vendor", name: "Vendor", canPreview: true, canEdit: false, canDelete: false, systemRole: true },
  { slug: "agent", name: "Agent", canPreview: true, canEdit: true, canDelete: false, systemRole: true },
  { slug: "investor_guest", name: "Investor guest", canPreview: true, canEdit: false, canDelete: false, systemRole: true },
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

function roleFrom(row: RoleRow): RoleRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    canPreview: row.can_preview,
    canEdit: row.can_edit,
    canDelete: row.can_delete,
    systemRole: row.system_role,
  };
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
  return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived);
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
}

export async function listRoles(): Promise<RoleRecord[]> {
  const result = await pool.query<RoleRow>(
    `select id, slug, name, can_preview, can_edit, can_delete, system_role
     from roles order by system_role desc, name`,
  );
  return result.rows.map(roleFrom);
}

export async function roleBySlug(slug: string): Promise<RoleRecord | null> {
  const result = await pool.query<RoleRow>(
    `select id, slug, name, can_preview, can_edit, can_delete, system_role from roles where slug = $1`,
    [slug],
  );
  const row = result.rows[0];
  return row ? roleFrom(row) : null;
}

export async function createRole(input: {
  name: string;
  canPreview: boolean;
  canEdit: boolean;
  canDelete: boolean;
}): Promise<RoleRecord> {
  const name = input.name.trim();
  const slug = slugify(name);
  if (!name || !slug) throw new AccessError("Enter a role name.");
  if (builtInRoles.some((role) => role.slug === slug)) throw new AccessError("That role already exists.");
  const flags = normalizeFlags(input);
  try {
    const result = await pool.query<RoleRow>(
      `insert into roles (id, slug, name, can_preview, can_edit, can_delete, system_role)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, false)
       returning id, slug, name, can_preview, can_edit, can_delete, system_role`,
      [slug, name, flags.canPreview, flags.canEdit, flags.canDelete],
    );
    const row = result.rows[0];
    if (!row) throw new AccessError("The role could not be saved.");
    return roleFrom(row);
  } catch (error) {
    if (isUnique(error)) throw new AccessError("That role already exists.");
    throw error;
  }
}

export async function updateRole(
  id: string,
  input: { name: string; canPreview: boolean; canEdit: boolean; canDelete: boolean },
): Promise<void> {
  const existing = await pool.query<RoleRow>(
    `select id, slug, name, can_preview, can_edit, can_delete, system_role from roles where id = $1`,
    [id],
  );
  const role = existing.rows[0];
  if (!role) throw new AccessError("That role was not found.");
  if (role.slug === "system_admin") {
    await pool.query(`update roles set name = $2 where id = $1`, [id, input.name.trim() || role.name]);
    return;
  }
  const name = input.name.trim();
  if (!name) throw new AccessError("Enter a role name.");
  const flags = normalizeFlags(input);
  await pool.query(
    `update roles set name = $2, can_preview = $3, can_edit = $4, can_delete = $5 where id = $1`,
    [id, name, flags.canPreview, flags.canEdit, flags.canDelete],
  );
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

export async function listUsers(): Promise<OfficeUser[]> {
  const result = await pool.query<RoleRow & { user_id: string; user_name: string; email: string; active: boolean }>(
    `select users.id as user_id, users.name as user_name, users.email, users.active,
            roles.id, roles.slug, roles.name, roles.can_preview, roles.can_edit, roles.can_delete, roles.system_role
     from users join roles on roles.id = users.role_id
     order by users.name`,
  );
  return result.rows.map((row) => ({
    id: row.user_id,
    name: row.user_name,
    email: row.email,
    active: row.active,
    role: roleFrom(row),
  }));
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  roleId: string;
}): Promise<void> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email || input.password.length < 8) throw new AccessError("Name, email, and a password of at least 8 characters are required.");
  const passwordHash = await hashPassword(input.password);
  try {
    await pool.query(
      `insert into users (id, role_id, name, email, password_hash) values (gen_random_uuid(), $1, $2, $3, $4)`,
      [input.roleId, name, email, passwordHash],
    );
  } catch (error) {
    if (isUnique(error)) throw new AccessError("That email is already used.");
    throw error;
  }
}

export async function updateUser(
  id: string,
  input: { roleId: string; active: boolean; name?: string; password?: string },
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
    return;
  }
  await pool.query(`update users set role_id = $2, active = $3, name = coalesce($4, name) where id = $1`, [
    id,
    input.roleId,
    input.active,
    name ?? null,
  ]);
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
  return {
    token,
    user: { id: row.user_id, name: row.user_name, email: row.email, active: row.active, role: roleFrom(row) },
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
  return { id: row.user_id, name: row.user_name, email: row.email, active: row.active, role: roleFrom(row) };
}

export async function closeSession(token: string): Promise<void> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(`delete from sessions where token_hash = $1`, [tokenHash]);
}

export function authorize(method: string, path: string, user: OfficeUser): string | null {
  if (
    path.startsWith("/admin") ||
    path.startsWith("/users") ||
    path.startsWith("/settings") ||
    path.startsWith("/api/v1/admin")
  ) {
    return user.role.slug === "system_admin" ? null : "Only a system admin can manage access.";
  }
  if (user.role.slug === "system_admin") return null;
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return user.role.canPreview ? null : "Your role cannot preview records.";
  if (verb === "DELETE") return user.role.canDelete ? null : "Your role cannot delete records.";
  if (user.role.canDelete) return null;
  return user.role.canEdit ? null : "Your role cannot edit records.";
}

export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessError";
  }
}

function normalizeFlags(input: { canPreview: boolean; canEdit: boolean; canDelete: boolean }) {
  const canDelete = input.canDelete;
  const canEdit = input.canEdit || canDelete;
  const canPreview = input.canPreview || canEdit;
  return { canPreview, canEdit, canDelete };
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
