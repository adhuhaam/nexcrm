import { pool } from "../../lib/db.ts";
import type { OfficeUser } from "./access.ts";

/** null = unrestricted (system admin). Empty array = no clients assigned. */
export type ClientScope = string[] | null;

export async function loadUserClientIds(userId: string): Promise<string[]> {
  const result = await pool.query<{ client_company_id: string }>(
    `select client_company_id from user_clients where user_id = $1 order by client_company_id`,
    [userId],
  );
  return result.rows.map((row) => row.client_company_id);
}

export async function clientScopeForUser(user: OfficeUser): Promise<ClientScope> {
  if (user.role.slug === "system_admin") return null;
  return loadUserClientIds(user.id);
}

export function isClientAllowed(scope: ClientScope, clientId: string | null | undefined): boolean {
  if (scope === null) return true;
  if (!clientId) return false;
  return scope.includes(clientId);
}

export async function setUserClients(userId: string, clientCompanyIds: string[]): Promise<string[]> {
  const unique = [...new Set(clientCompanyIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length) {
    const check = await pool.query<{ id: string; kind: string }>(
      `select id, kind from companies where id = any($1::uuid[])`,
      [unique],
    );
    if (check.rows.length !== unique.length) throw new Error("One or more client companies were not found");
    for (const row of check.rows) {
      if (row.kind !== "client") throw new Error("Restaurant scope only accepts client companies");
    }
  }
  await pool.query(`delete from user_clients where user_id = $1`, [userId]);
  for (const clientId of unique) {
    await pool.query(`insert into user_clients (user_id, client_company_id) values ($1, $2)`, [userId, clientId]);
  }
  return unique;
}

export async function listUserClientsMap(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of userIds) map.set(id, []);
  if (!userIds.length) return map;
  const result = await pool.query<{ user_id: string; client_company_id: string }>(
    `select user_id, client_company_id from user_clients where user_id = any($1::uuid[])`,
    [userIds],
  );
  for (const row of result.rows) {
    const list = map.get(row.user_id) ?? [];
    list.push(row.client_company_id);
    map.set(row.user_id, list);
  }
  return map;
}
