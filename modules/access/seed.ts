import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { pool } from "../../lib/db.ts";
import { createUser, roleBySlug, seedRoles } from "./access.ts";

const passwordFile = new URL("../../.admin-password", import.meta.url);

export async function seedAccess(): Promise<void> {
  await seedRoles();
  const existing = await pool.query(`select 1 from users limit 1`);
  if (existing.rows.length > 0) return;
  const admin = await roleBySlug("system_admin");
  if (!admin) throw new Error("System admin role is missing");
  const password = randomBytes(18).toString("base64url");
  await createUser({
    name: "System admin",
    email: "admin@jacms.local",
    password,
    roleId: admin.id,
  });
  await writeFile(passwordFile, `Login: admin@jacms.local\nPassword: ${password}\n`, { mode: 0o600 });
  await chmod(passwordFile, 0o600);
}
