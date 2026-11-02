import assert from "node:assert/strict";
import { pool } from "../lib/db.ts";
import { checkHealth } from "../lib/health.ts";

const report = await checkHealth();
assert.equal(report.ok, true);
assert.equal(report.postgres, "ok");
assert.equal(report.files, "ok");
assert.equal(report.displayTimeZone, "Indian/Maldives");
await pool.end();
console.log("health check passed");
