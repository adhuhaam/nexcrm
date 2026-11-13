import { pool } from "../../lib/db.ts";
import { AccessError, hashPassword, roleBySlug } from "../access/access.ts";
import { PORTAL_CLIENT_ROLE, PORTAL_EMPLOYER_ROLE } from "./scope.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PortalAccountKind = "employer" | "client";

export type PortalAccountRow = {
  userId: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  roleSlug: string;
  createdAt: string;
};

export async function listPortalAccountsForCompany(companyId: string): Promise<PortalAccountRow[]> {
  if (!uuidPattern.test(companyId)) return [];
  const result = await pool.query<{
    id: string;
    name: string;
    email: string;
    active: boolean;
    must_change_password: boolean;
    slug: string;
    created_at: string;
  }>(
    `select users.id, users.name, users.email, users.active, users.must_change_password,
            roles.slug, users.created_at::text
     from users
     join roles on roles.id = users.role_id
     where users.portal_company_id = $1
       and roles.slug in ($2, $3)
     order by users.created_at`,
    [companyId, PORTAL_EMPLOYER_ROLE, PORTAL_CLIENT_ROLE],
  );
  return result.rows.map((row) => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    active: row.active,
    mustChangePassword: row.must_change_password,
    roleSlug: row.slug,
    createdAt: row.created_at,
  }));
}

export async function upsertPortalAccount(input: {
  companyId: string;
  email: string;
  password: string;
  name: string;
}): Promise<{ userId: string; email: string; roleSlug: string }> {
  if (!uuidPattern.test(input.companyId)) throw new AccessError("Company not found.");
  if (input.password.length < 8) throw new AccessError("Password must be at least 8 characters.");
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new AccessError("Enter a valid email for portal sign-in.");

  const company = await pool.query<{ id: string; kind: string; legal_name: string }>(
    `select id, kind, legal_name from companies where id = $1`,
    [input.companyId],
  );
  const row = company.rows[0];
  if (!row) throw new AccessError("Company not found.");

  let roleSlug: string;
  let kind: PortalAccountKind;
  if (row.kind === "employer") {
    roleSlug = PORTAL_EMPLOYER_ROLE;
    kind = "employer";
  } else if (row.kind === "client") {
    roleSlug = PORTAL_CLIENT_ROLE;
    kind = "client";
  } else {
    throw new AccessError("Portal logins are only for legal employers or client companies.");
  }

  const role = await roleBySlug(roleSlug);
  if (!role) throw new AccessError("Portal roles are missing. Run migrations.");

  const name = (input.name.trim() || row.legal_name).slice(0, 120);
  const passwordHash = await hashPassword(input.password);

  const existing = await pool.query<{ id: string; portal_company_id: string | null }>(
    `select id, portal_company_id from users where lower(email) = lower($1)`,
    [email],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].portal_company_id !== input.companyId) {
      throw new AccessError("That email is already used by another account.");
    }
    await pool.query(
      `update users set role_id = $2, password_hash = $3, must_change_password = true, active = true,
              name = $4, portal_company_id = $5
       where id = $1`,
      [existing.rows[0].id, role.id, passwordHash, name, input.companyId],
    );
    return { userId: existing.rows[0].id, email, roleSlug };
  }

  try {
    const inserted = await pool.query<{ id: string }>(
      `insert into users (id, role_id, name, email, password_hash, portal_company_id, must_change_password, active)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, true, true)
       returning id`,
      [role.id, name, email, passwordHash, input.companyId],
    );
    const userId = inserted.rows[0]?.id;
    if (!userId) throw new AccessError("Could not create portal account.");
    void kind;
    return { userId, email, roleSlug };
  } catch (error) {
    if (isUnique(error)) throw new AccessError("That email is already used.");
    throw error;
  }
}

export async function setPortalAccountActive(userId: string, active: boolean): Promise<void> {
  if (!uuidPattern.test(userId)) throw new AccessError("Account not found.");
  const row = await pool.query<{ portal_company_id: string | null }>(
    `select portal_company_id from users join roles on roles.id = users.role_id
     where users.id = $1 and roles.slug in ($2, $3)`,
    [userId, PORTAL_EMPLOYER_ROLE, PORTAL_CLIENT_ROLE],
  );
  if (!row.rows[0]?.portal_company_id) throw new AccessError("Not a company portal account.");
  await pool.query(`update users set active = $2 where id = $1`, [userId, active]);
}

export async function resetPortalAccountPassword(userId: string, password: string): Promise<void> {
  if (!uuidPattern.test(userId)) throw new AccessError("Account not found.");
  if (password.length < 8) throw new AccessError("Password must be at least 8 characters.");
  const row = await pool.query<{ portal_company_id: string | null }>(
    `select portal_company_id from users join roles on roles.id = users.role_id
     where users.id = $1 and roles.slug in ($2, $3)`,
    [userId, PORTAL_EMPLOYER_ROLE, PORTAL_CLIENT_ROLE],
  );
  if (!row.rows[0]?.portal_company_id) throw new AccessError("Not a company portal account.");
  const passwordHash = await hashPassword(password);
  await pool.query(`update users set password_hash = $2, must_change_password = true where id = $1`, [userId, passwordHash]);
}

function isUnique(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}
