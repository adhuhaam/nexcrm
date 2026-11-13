import { pool } from "../../lib/db.ts";
import { seedRoles } from "./access.ts";

/** Seeds built-in roles only. First admin is created via `npm run create-admin` (install.sh prompts). */
export async function seedAccess(): Promise<void> {
  await seedRoles();
  const existing = await pool.query(`select 1 from users limit 1`);
  if (existing.rows.length > 0) return;
  if (process.env.JACMS_AUTO_SEED_ADMIN === "1") {
    const { bootstrapLegacyAdmin } = await import("./bootstrap-legacy-admin.ts");
    await bootstrapLegacyAdmin();
  }
}
