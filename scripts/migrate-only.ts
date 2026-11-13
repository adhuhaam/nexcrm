import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { seedRoles } from "../modules/access/access.ts";

loadEnv();
const applied = await migrate(pool);
await seedRoles();
console.log(applied.length ? `Migrations applied: ${applied.join(", ")}` : "Migrations up to date.");
await pool.end();
