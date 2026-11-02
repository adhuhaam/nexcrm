import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "./db.ts";

export type HealthReport = {
  ok: true;
  postgres: "ok";
  files: "ok";
  displayTimeZone: string;
};

export async function checkHealth(): Promise<HealthReport> {
  const fileRoot = process.env.FILE_ROOT;
  const displayTimeZone = process.env.DISPLAY_TIME_ZONE ?? "Indian/Maldives";
  if (!fileRoot) throw new Error("FILE_ROOT is not set");

  const result = await db.execute(sql`select 1 as ok`);
  const rows = "rows" in result ? result.rows : result;
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Postgres connectivity check failed");
  }

  await access(fileRoot, constants.R_OK | constants.W_OK);

  return {
    ok: true,
    postgres: "ok",
    files: "ok",
    displayTimeZone,
  };
}
