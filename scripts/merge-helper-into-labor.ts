/**
 * Helper and Labor are the same designation — keep Labor only.
 */
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";

loadEnv();

const client = await pool.connect();
try {
  await client.query("begin");

  const helpers = await client.query<{
    id: string;
    client_company_id: string;
  }>(
    `select id, client_company_id
     from client_designation_rates
     where lower(trim(designation)) in ('helper', 'labour')`,
  );

  for (const row of helpers.rows) {
    const labor = await client.query(
      `select id from client_designation_rates
       where client_company_id = $1 and lower(trim(designation)) = 'labor'
       limit 1`,
      [row.client_company_id],
    );
    if (labor.rows[0]) {
      await client.query(`delete from client_designation_rates where id = $1`, [row.id]);
      console.log("dropped duplicate Helper rate", row.client_company_id);
    } else {
      await client.query(
        `update client_designation_rates set designation = 'Labor', updated_at = now() where id = $1`,
        [row.id],
      );
      console.log("renamed rate Helper → Labor", row.id);
    }
  }

  const emp = await client.query(
    `update employees
     set designation = 'Labor',
         occupation = case
           when lower(trim(coalesce(occupation, ''))) in ('helper', 'labour') then 'Labor'
           else occupation
         end,
         updated_at = now()
     where lower(trim(coalesce(designation, ''))) in ('helper', 'labour')
     returning legal_name`,
  );
  console.log("employees renamed", emp.rowCount, emp.rows.map((r) => r.legal_name).slice(0, 8));

  const alloc = await client.query(
    `update client_allocations
     set designation = 'Labor', updated_at = now()
     where lower(trim(coalesce(designation, ''))) in ('helper', 'labour')`,
  );
  console.log("allocations renamed", alloc.rowCount);

  const items = await client.query(
    `update pay_run_items
     set designation = 'Labor'
     where lower(trim(coalesce(designation, ''))) in ('helper', 'labour')`,
  );
  console.log("pay items renamed", items.rowCount);

  const des = await client.query(
    `update designations
     set active = false, updated_at = now()
     where lower(trim(name)) in ('helper', 'labour')
     returning id, name`,
  );
  console.log("designations deactivated", des.rows);

  const labor = await client.query<{ id: string }>(
    `select id from designations where lower(trim(name)) = 'labor' limit 1`,
  );
  if (!labor.rows[0]) {
    await client.query(
      `insert into designations (id, name, sort_order, active)
       values (gen_random_uuid(), 'Labor', 10, true)`,
    );
    console.log("created Labor designation");
  } else {
    await client.query(`update designations set active = true, name = 'Labor' where id = $1`, [
      labor.rows[0].id,
    ]);
  }

  await client.query("commit");
  console.log("done — Helper merged into Labor");
} catch (reason) {
  await client.query("rollback");
  throw reason;
} finally {
  client.release();
  await pool.end();
}
