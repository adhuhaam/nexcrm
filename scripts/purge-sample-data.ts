/**
 * Wipe operational / sample business data. Keeps users, roles, sessions,
 * migrations, company_preferences row, and system settings.
 * Resets designations to the standard catalog.
 */
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

loadEnv();

const keepDirs = new Set(["probe"]);

async function main(): Promise<void> {
  // Clear FKs that point at companies before truncating (avoids wiping preferences).
  await pool.query(`
    update company_preferences
    set default_company_id = null,
        selected_company_id = null,
        updated_at = now()
  `);

  await pool.query(`
    truncate table
      pay_run_items,
      pay_runs,
      payroll_period_deductions,
      ot_entries,
      ot_rates,
      attendance_records,
      allocation_events,
      client_allocations,
      client_designation_rates,
      accommodation_stays,
      accommodations,
      letters,
      file_links,
      files,
      document_snapshots,
      document_sequences,
      expenses,
      slots,
      quota_pools,
      sites,
      project_documents,
      projects,
      employments,
      employees,
      designations
    restart identity cascade
  `);

  // Truncate companies last without cascading into company_preferences.
  await pool.query(`truncate table companies restart identity`);

  await pool.query(`
    insert into company_preferences (scope_key)
    values ('local')
    on conflict (scope_key) do update
      set default_company_id = null,
          selected_company_id = null,
          updated_at = now()
  `);

  await pool.query(`
    insert into designations (id, name, sort_order, active)
    select gen_random_uuid(), seed.name, seed.sort_order, true
    from (
      values
        ('Labor', 10),
        ('Mason', 20),
        ('Steward', 30),
        ('Technician', 40)
    ) as seed(name, sort_order)
    where not exists (
      select 1 from designations d where lower(trim(d.name)) = lower(seed.name)
    )
  `);

  const fileRoot = process.env.FILE_ROOT?.trim();
  if (fileRoot) {
    const entries = await readdir(fileRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || keepDirs.has(entry.name)) continue;
      await rm(path.join(fileRoot, entry.name), { recursive: true, force: true });
    }
  }

  const counts = await pool.query(`
    select
      (select count(*)::int from companies) as companies,
      (select count(*)::int from employees) as employees,
      (select count(*)::int from pay_runs) as pay_runs,
      (select count(*)::int from letters) as letters,
      (select count(*)::int from files) as files,
      (select count(*)::int from designations) as designations,
      (select count(*)::int from company_preferences) as preferences,
      (select count(*)::int from users) as users
  `);
  console.log("purged sample data", counts.rows[0]);
  await pool.end();
}

await main();
