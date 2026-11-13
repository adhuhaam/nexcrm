import { hashPassword, verifyPassword } from "../access/access.ts";
import { pool } from "../../lib/db.ts";
import { PortalError } from "./errors.ts";

export function monthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new PortalError("Month must be YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const end = last.toISOString().slice(0, 10);
  return { start, end };
}

export async function changePortalPassword(
  userId: string,
  companyId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) throw new PortalError("New password must be at least 8 characters.");
  const row = await pool.query<{ password_hash: string; portal_company_id: string | null }>(
    `select password_hash, portal_company_id from users where id = $1`,
    [userId],
  );
  const user = row.rows[0];
  if (!user || user.portal_company_id !== companyId) throw new PortalError("Account not found.", 404);
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw new PortalError("Current password was not recognised.");
  }
  const passwordHash = await hashPassword(newPassword);
  await pool.query(`update users set password_hash = $2, must_change_password = false where id = $1`, [
    userId,
    passwordHash,
  ]);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function assertEmployeeBelongsToEmployer(employerId: string, employeeId: string): Promise<void> {
  if (!uuidPattern.test(employeeId)) throw new PortalError("Employee not found.", 404);
  const row = await pool.query<{ id: string }>(`select id from employees where id = $1 and company_id = $2`, [
    employeeId,
    employerId,
  ]);
  if (!row.rows[0]) throw new PortalError("Employee not found.", 404);
}

export async function assertWorkerAllocatedToClient(clientId: string, employeeId: string): Promise<void> {
  const row = await pool.query<{ id: string }>(
    `select id from client_allocations
     where client_company_id = $1 and employee_id = $2 and status = 'active'
     limit 1`,
    [clientId, employeeId],
  );
  if (!row.rows[0]) throw new PortalError("Worker not found.", 404);
}
