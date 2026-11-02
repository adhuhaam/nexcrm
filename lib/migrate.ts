import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const lockKey = 864201;

export async function migrate(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [lockKey]);
    await client.query(`create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )`);
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../db/migrations");
    const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
    for (const file of files) {
      const existing = await client.query("select 1 from schema_migrations where id = $1", [file]);
      if (existing.rowCount) continue;
      const sqlText = await readFile(join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sqlText);
        await client.query("insert into schema_migrations (id) values ($1)", [file]);
        await client.query("commit");
        applied.push(file);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [lockKey]).catch(() => undefined);
    client.release();
  }
  return applied;
}
