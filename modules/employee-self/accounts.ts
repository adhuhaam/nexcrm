import { pool } from "../../lib/db.ts";
import { normalizePhone, PhoneError } from "../../lib/phone.ts";
import { AccessError, hashPassword, roleBySlug } from "../access/access.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { normalizePhone };

function internalEmail(employeeId: string): string {
  return `ess+${employeeId}@employee.jacms.internal`;
}

export async function upsertEmployeeSelfServiceAccount(input: {
  employeeId: string;
  phone: string;
  password: string;
  name?: string;
}): Promise<{ userId: string; phone: string }> {
  if (!uuidPattern.test(input.employeeId)) throw new AccessError("Employee not found.");
  if (input.password.length < 8) throw new AccessError("Password must be at least 8 characters.");
  let phone: string;
  try {
    phone = normalizePhone(input.phone);
  } catch (error) {
    throw new AccessError(error instanceof PhoneError ? error.message : "Enter a phone number.");
  }

  const employee = await pool.query<{ id: string; legal_name: string }>(
    `select id, legal_name from employees where id = $1`,
    [input.employeeId],
  );
  const row = employee.rows[0];
  if (!row) throw new AccessError("Employee not found.");

  const role = await roleBySlug("employee_self_service");
  if (!role) throw new AccessError("Employee self-service role is missing. Run migrations.");

  const name = (input.name?.trim() || row.legal_name).slice(0, 120);
  const passwordHash = await hashPassword(input.password);
  const email = internalEmail(input.employeeId);

  const existing = await pool.query<{ id: string }>(`select id from users where employee_id = $1`, [input.employeeId]);
  if (existing.rows[0]) {
    try {
      await pool.query(
        `update users set phone = $2, password_hash = $3, must_change_password = true, active = true, name = $4
         where id = $1`,
        [existing.rows[0].id, phone, passwordHash, name],
      );
    } catch (error) {
      if (isUnique(error)) throw new AccessError("That phone number is already used.");
      throw error;
    }
    return { userId: existing.rows[0].id, phone };
  }

  try {
    const inserted = await pool.query<{ id: string }>(
      `insert into users (id, role_id, name, email, password_hash, phone, employee_id, must_change_password, active)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, true)
       returning id`,
      [role.id, name, email, passwordHash, phone, input.employeeId],
    );
    const userId = inserted.rows[0]?.id;
    if (!userId) throw new AccessError("Could not create self-service account.");
    return { userId, phone };
  } catch (error) {
    if (isUnique(error)) throw new AccessError("That phone number is already used.");
    throw error;
  }
}

export async function employeeIdForUser(userId: string): Promise<string | null> {
  const result = await pool.query<{ employee_id: string | null }>(`select employee_id from users where id = $1`, [userId]);
  return result.rows[0]?.employee_id ?? null;
}

function isUnique(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}
