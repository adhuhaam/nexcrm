import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { loadEnv } from "./env.ts";
import * as schema from "./schema.ts";

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });
