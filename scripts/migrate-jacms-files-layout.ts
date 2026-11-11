/**
 * Re-runnable migration: move on-disk files into JACMS-Files per-employee folders and update files.stored_path.
 *
 *   node --experimental-strip-types scripts/migrate-jacms-files-layout.ts
 *   node --experimental-strip-types scripts/migrate-jacms-files-layout.ts --dry-run
 *   node --experimental-strip-types scripts/migrate-jacms-files-layout.ts --legacy-root=/old/path
 */
import { access, copyFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join, normalize, sep } from "node:path";
import { loadEnv } from "../lib/env.ts";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import {
  buildEmployeeFolderName,
  employeeStorageFolder,
  ensureFilesRoot,
  isEmployeeUuid,
  resolveFilesRoot,
  resolveStorageFolder,
} from "../modules/files/paths.ts";

loadEnv();
await migrate(pool);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const legacyArg = args.find((a) => a.startsWith("--legacy-root="));
const legacyRoot = legacyArg?.split("=")[1]?.trim();

type FileRow = {
  id: string;
  stored_path: string;
  original_name: string;
  entity_type: string | null;
  entity_id: string | null;
};

function splitStoredPath(storedPath: string): { folder: string; year: string; filename: string } | null {
  const parts = storedPath.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  const filename = parts[parts.length - 1];
  const year = parts[parts.length - 2];
  const folder = parts.slice(0, -2).join("/");
  return { folder, year, filename };
}

function alreadyMigrated(folder: string): boolean {
  if (folder.startsWith("_")) return true;
  // name_passport_uuid pattern (uuid suffix)
  const segments = folder.split("_");
  const last = segments[segments.length - 1];
  return isEmployeeUuid(last);
}

async function resolveSourcePath(storedPath: string): Promise<string> {
  const root = resolveFilesRoot();
  const primary = join(root, ...storedPath.split("/"));
  try {
    await access(primary);
    return primary;
  } catch {
  }
  if (legacyRoot) {
    const legacy = join(legacyRoot, ...storedPath.split("/"));
    await access(legacy);
    return legacy;
  }
  throw new Error(`Missing on disk: ${storedPath}`);
}

async function targetFolderForRow(row: FileRow): Promise<string> {
  let employeeId: string | null = null;
  if (row.entity_type === "employee" && row.entity_id && isEmployeeUuid(row.entity_id)) {
    employeeId = row.entity_id;
  }
  if (!employeeId) {
    const parts = splitStoredPath(row.stored_path);
    if (parts && isEmployeeUuid(parts.folder)) employeeId = parts.folder;
  }
  if (employeeId) {
    const named = await employeeStorageFolder(employeeId);
    if (named) return named;
    return `_employees/${employeeId}`;
  }
  return resolveStorageFolder({
    entityType: row.entity_type ?? undefined,
    entityId: row.entity_id ?? undefined,
    employeeIdForPath: row.entity_type === "onboard" ? "onboard" : undefined,
  });
}

async function migrateOne(row: FileRow): Promise<"skipped" | "moved" | "missing"> {
  const parsed = splitStoredPath(row.stored_path);
  if (!parsed) return "skipped";
  if (alreadyMigrated(parsed.folder)) return "skipped";

  const targetFolder = await targetFolderForRow(row);
  const newRelative = [targetFolder, parsed.year, parsed.filename].join("/");
  if (newRelative === row.stored_path) return "skipped";

  let absoluteSource: string;
  try {
    absoluteSource = await resolveSourcePath(row.stored_path);
  } catch {
    console.warn(`WARN: no file on disk for ${row.id} (${row.stored_path})`);
    return "missing";
  }

  const root = await ensureFilesRoot();
  const absoluteTarget = normalize(join(root, ...newRelative.split("/")));
  if (!absoluteTarget.startsWith(normalize(root + sep)) && absoluteTarget !== normalize(root)) {
    throw new Error(`Unsafe target path for ${row.id}`);
  }

  if (dryRun) {
    console.log(`[dry-run] ${row.stored_path} -> ${newRelative}`);
    return "moved";
  }

  await mkdir(dirname(absoluteTarget), { recursive: true });
  try {
    await rename(absoluteSource, absoluteTarget);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      await copyFile(absoluteSource, absoluteTarget);
      await unlink(absoluteSource);
    } else if (code === "ENOENT") {
      return "missing";
    } else {
      throw error;
    }
  }

  await pool.query(`update files set stored_path = $2 where id = $1`, [row.id, newRelative]);
  return "moved";
}

async function renameEmployeeFolders(): Promise<number> {
  const root = await ensureFilesRoot();
  const employees = await pool.query<{
    id: string;
    legal_name: string;
    passport_number: string | null;
  }>(`select id, legal_name, passport_number from employees`);
  let renamed = 0;
  for (const emp of employees.rows) {
    const targetName = buildEmployeeFolderName({
      id: emp.id,
      legalName: emp.legal_name,
      passportNumber: emp.passport_number,
    });
    const legacyUuidDir = join(root, emp.id);
    const targetDir = join(root, targetName);
    try {
      const st = await stat(legacyUuidDir);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    if (normalize(legacyUuidDir) === normalize(targetDir)) continue;
    try {
      await stat(targetDir);
      console.warn(`WARN: both ${emp.id}/ and ${targetName}/ exist — merge manually if needed`);
      continue;
    } catch {
      /* target absent */
    }
    if (dryRun) {
      console.log(`[dry-run] rename folder ${emp.id} -> ${targetName}`);
    } else {
      await rename(legacyUuidDir, targetDir);
    }
    renamed += 1;
  }
  return renamed;
}

const q = await pool.query<FileRow>(
  `select f.id, f.stored_path, f.original_name,
          (select fl.entity_type from file_links fl where fl.file_id = f.id
             order by case when fl.entity_type = 'employee' then 0 else 1 end, fl.id
             limit 1) as entity_type,
          (select fl.entity_id::text from file_links fl where fl.file_id = f.id
             order by case when fl.entity_type = 'employee' then 0 else 1 end, fl.id
             limit 1) as entity_id
   from files f
   order by f.created_at`,
);

let moved = 0;
let skipped = 0;
let missing = 0;
for (const row of q.rows) {
  const result = await migrateOne(row);
  if (result === "moved") moved += 1;
  else if (result === "missing") missing += 1;
  else skipped += 1;
}

const folderRenames = await renameEmployeeFolders();

console.log(
  JSON.stringify(
    {
      dryRun,
      filesRoot: resolveFilesRoot(),
      moved,
      skipped,
      missing,
      employeeFoldersRenamed: folderRenames,
    },
    null,
    2,
  ),
);

await pool.end();
