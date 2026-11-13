import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createUser, roleBySlug, seedRoles } from "../modules/access/access.ts";

loadEnv();

async function main(): Promise<void> {
  await migrate(pool);
  await seedRoles();
  const existing = await pool.query(`select 1 from users limit 1`);
  if (existing.rows.length > 0) {
    console.error("Users already exist — use Settings → People or remove users before create-admin.");
    process.exit(1);
  }
  const adminRole = await roleBySlug("system_admin");
  if (!adminRole) throw new Error("system_admin role missing — run migrations first.");

  const name = process.env.JACMS_ADMIN_NAME?.trim() ?? "";
  const email = process.env.JACMS_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  let password = process.env.JACMS_ADMIN_PASSWORD?.trim() ?? "";

  if ((!name || !email || !password) && !process.stdin.isTTY) {
    throw new Error("Set JACMS_ADMIN_NAME, JACMS_ADMIN_EMAIL, and JACMS_ADMIN_PASSWORD for non-interactive install.");
  }

  const rl = process.stdin.isTTY ? createInterface({ input, output }) : null;
  try {
    const adminName =
      name || (rl ? (await rl.question("Admin name: ")).trim() : "");
    const adminEmail =
      email || (rl ? (await rl.question("Admin email: ")).trim().toLowerCase() : "");
    if (!password) {
      if (!rl) throw new Error("JACMS_ADMIN_PASSWORD is required.");
      password = (await rl.question("Admin password (min 8 chars): ")).trim();
      const confirm = (await rl.question("Confirm password: ")).trim();
      if (password !== confirm) throw new Error("Passwords do not match.");
    }
    if (!adminName || !adminEmail || password.length < 8) {
      throw new Error("Name, email, and password (≥8 characters) are required.");
    }
    await createUser({ name: adminName, email: adminEmail, password, roleId: adminRole.id });
    console.log(`Admin created: ${adminEmail}`);
  } finally {
    rl?.close();
    await pool.end();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
