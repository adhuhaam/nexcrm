import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { cpus, freemem, hostname, loadavg, platform, release, totalmem, uptime as hostUptime } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { db, pool } from "./db.ts";

const execFileAsync = promisify(execFile);

export type HealthReport = {
  ok: true;
  postgres: "ok";
  files: "ok";
  displayTimeZone: string;
};

export type HealthStatus = "ok" | "degraded" | "down";

export type SystemHealthReport = {
  checkedAt: string;
  overall: HealthStatus;
  app: {
    name: string;
    node: string;
    pid: number;
    uptimeSec: number;
    env: string;
    displayTimeZone: string;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
    cpu: {
      userMicros: number;
      systemMicros: number;
    };
  };
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    uptimeSec: number;
    cpuCount: number;
    loadAverage: [number, number, number];
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    };
  };
  disk: {
    path: string;
    totalBytes: number | null;
    usedBytes: number | null;
    availableBytes: number | null;
    usedPercent: number | null;
    status: HealthStatus;
    error: string | null;
  };
  database: {
    status: HealthStatus;
    latencyMs: number | null;
    version: string | null;
    pool: {
      total: number;
      idle: number;
      waiting: number;
    };
    error: string | null;
  };
  files: {
    status: HealthStatus;
    root: string | null;
    error: string | null;
  };
  checks: { name: string; status: HealthStatus; detail: string }[];
};

export async function checkHealth(): Promise<HealthReport> {
  const fileRoot = process.env.FILE_ROOT;
  const { resolveOfficeSettings } = await import("../modules/settings/settings.ts");
  const office = await resolveOfficeSettings();
  const displayTimeZone = office.timeZone || process.env.DISPLAY_TIME_ZONE || "Indian/Maldives";
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

async function readDiskUsage(path: string): Promise<{
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
}> {
  const { stdout } = await execFileAsync("df", ["-kP", path], { timeout: 3000 });
  const lines = stdout.trim().split("\n");
  const data = lines[lines.length - 1];
  if (!data) throw new Error("df returned no rows");
  const parts = data.trim().split(/\s+/);
  // Filesystem 1024-blocks Used Available Capacity Mounted
  const totalKb = Number(parts[1]);
  const usedKb = Number(parts[2]);
  const availKb = Number(parts[3]);
  const pctRaw = parts[4]?.replace("%", "");
  if (![totalKb, usedKb, availKb].every((n) => Number.isFinite(n))) {
    throw new Error("Could not parse df output");
  }
  return {
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    availableBytes: availKb * 1024,
    usedPercent: Number(pctRaw) || Math.round((usedKb / Math.max(totalKb, 1)) * 100),
  };
}

async function readLoadFallback(): Promise<[number, number, number] | null> {
  try {
    const text = await readFile("/proc/loadavg", "utf8");
    const [a, b, c] = text.trim().split(/\s+/).map(Number);
    if ([a, b, c].every((n) => Number.isFinite(n))) return [a, b, c];
  } catch {
    /* ignore */
  }
  return null;
}

function worst(...statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  return "ok";
}

export async function getSystemHealth(): Promise<SystemHealthReport> {
  const checkedAt = new Date().toISOString();
  const { resolveOfficeSettings } = await import("../modules/settings/settings.ts");
  const office = await resolveOfficeSettings();
  const displayTimeZone = office.timeZone || process.env.DISPLAY_TIME_ZONE || "Indian/Maldives";
  const fileRoot = process.env.FILE_ROOT ?? null;
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const loads = loadavg() as [number, number, number];
  const fallbackLoads = Number.isFinite(loads[0]) ? loads : ((await readLoadFallback()) ?? [0, 0, 0]);
  const totalBytes = totalmem();
  const freeBytes = freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
  const cpuCount = Math.max(cpus().length, 1);

  let database: SystemHealthReport["database"] = {
    status: "down",
    latencyMs: null,
    version: null,
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
    error: null,
  };
  const dbStarted = performance.now();
  try {
    const result = await pool.query<{ v: string }>("select version() as v");
    database = {
      status: "ok",
      latencyMs: Math.round((performance.now() - dbStarted) * 10) / 10,
      version: result.rows[0]?.v?.split(" on ")[0] ?? result.rows[0]?.v ?? null,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      error: null,
    };
    if ((database.latencyMs ?? 0) > 200) database.status = "degraded";
  } catch (error) {
    database.error = error instanceof Error ? error.message : "Database check failed";
    database.status = "down";
  }

  let files: SystemHealthReport["files"] = {
    status: fileRoot ? "ok" : "degraded",
    root: fileRoot,
    error: fileRoot ? null : "FILE_ROOT is not set",
  };
  if (fileRoot) {
    try {
      await access(fileRoot, constants.R_OK | constants.W_OK);
    } catch (error) {
      files = {
        status: "down",
        root: fileRoot,
        error: error instanceof Error ? error.message : "File root not writable",
      };
    }
  }

  let disk: SystemHealthReport["disk"] = {
    path: fileRoot || "/",
    totalBytes: null,
    usedBytes: null,
    availableBytes: null,
    usedPercent: null,
    status: "degraded",
    error: null,
  };
  try {
    const usage = await readDiskUsage(disk.path);
    disk = {
      path: disk.path,
      ...usage,
      status: usage.usedPercent >= 95 ? "down" : usage.usedPercent >= 85 ? "degraded" : "ok",
      error: null,
    };
  } catch (error) {
    disk.error = error instanceof Error ? error.message : "Disk check failed";
    disk.status = "degraded";
  }

  const memStatus: HealthStatus = usedPercent >= 95 ? "down" : usedPercent >= 85 ? "degraded" : "ok";
  const loadStatus: HealthStatus =
    fallbackLoads[0] >= cpuCount * 2 ? "down" : fallbackLoads[0] >= cpuCount * 1.25 ? "degraded" : "ok";

  const checks: SystemHealthReport["checks"] = [
    {
      name: "Database",
      status: database.status,
      detail:
        database.status === "ok"
          ? `Responding in ${database.latencyMs} ms · pool ${database.pool.total} total / ${database.pool.idle} idle`
          : database.error ?? "Unavailable",
    },
    {
      name: "File storage",
      status: files.status,
      detail: files.status === "ok" ? `Writable at ${files.root}` : files.error ?? "Unavailable",
    },
    {
      name: "Disk",
      status: disk.status,
      detail:
        disk.usedPercent != null
          ? `${disk.usedPercent}% used on ${disk.path}`
          : disk.error ?? "Unavailable",
    },
    {
      name: "Host memory",
      status: memStatus,
      detail: `${usedPercent}% used`,
    },
    {
      name: "CPU load",
      status: loadStatus,
      detail: `load ${fallbackLoads[0].toFixed(2)} / ${cpuCount} cores`,
    },
  ];

  const overall = worst(...checks.map((item) => item.status));

  return {
    checkedAt,
    overall,
    app: {
      name: "nexcrm",
      node: process.version,
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      env: process.env.NODE_ENV ?? "development",
      displayTimeZone,
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        externalBytes: mem.external,
      },
      cpu: {
        userMicros: cpu.user,
        systemMicros: cpu.system,
      },
    },
    host: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      arch: process.arch,
      uptimeSec: Math.floor(hostUptime()),
      cpuCount,
      loadAverage: fallbackLoads,
      memory: {
        totalBytes,
        freeBytes,
        usedBytes,
        usedPercent,
      },
    },
    disk,
    database,
    files,
    checks,
  };
}
