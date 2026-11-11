import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "../../lib/db.ts";

/** `FILES_DIR` preferred; `FILE_ROOT` kept for backward compatibility. */
export function resolveFilesRoot(): string {
  const configured = process.env.FILES_DIR?.trim() || process.env.FILE_ROOT?.trim();
  if (configured) return configured;
  return join(process.cwd(), "data", "jacms-files");
}

export async function ensureFilesRoot(): Promise<string> {
  const root = resolveFilesRoot();
  await mkdir(root, { recursive: true });
  return root;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEmployeeUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

/** Safe single path segment for GNOME-visible employee folders. */
export function sanitizePathSegment(value: string, maxLen = 48): string {
  const trimmed = value.trim();
  const slug = trimmed
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-+]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  return (slug || "unknown").slice(0, maxLen);
}

/** `<name>_<passport-or-no-passport>_<employee-id>` — stable when name/passport change. */
export function buildEmployeeFolderName(input: {
  id: string;
  legalName: string;
  passportNumber: string | null;
}): string {
  const name = sanitizePathSegment(input.legalName.replace(/\s+/g, "_"), 40);
  const passportRaw = input.passportNumber?.trim();
  const passport = passportRaw
    ? sanitizePathSegment(passportRaw.replace(/\s+/g, ""), 32)
    : "no-passport";
  return `${name}_${passport}_${input.id}`;
}

export async function employeeStorageFolder(employeeId: string): Promise<string | null> {
  if (!isEmployeeUuid(employeeId)) return null;
  const result = await pool.query<{
    id: string;
    legal_name: string;
    passport_number: string | null;
  }>(
    `select id, legal_name, passport_number from employees where id = $1 limit 1`,
    [employeeId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return buildEmployeeFolderName({
    id: row.id,
    legalName: row.legal_name,
    passportNumber: row.passport_number,
  });
}

export type StorageFolderHint = {
  employeeIdForPath?: string | null;
  entityType?: string;
  entityId?: string;
};

export async function resolveStorageFolder(hint: StorageFolderHint): Promise<string> {
  if (hint.employeeIdForPath === "onboard") return "_onboard";
  const employeeId =
    (hint.employeeIdForPath && isEmployeeUuid(hint.employeeIdForPath) ? hint.employeeIdForPath : null) ??
    (hint.entityType === "employee" && hint.entityId && isEmployeeUuid(hint.entityId) ? hint.entityId : null);
  if (employeeId) {
    const folder = await employeeStorageFolder(employeeId);
    if (folder) return folder;
    return `_employees/${employeeId}`;
  }
  if (hint.entityType === "company" && hint.entityId) return `_companies/${hint.entityId}`;
  if (hint.entityType === "project" && hint.entityId) return `_projects/${hint.entityId}`;
  if (hint.entityType === "onboard") return "_onboard";
  return "_shared";
}

export async function assertFilesRootWritable(): Promise<string> {
  const root = resolveFilesRoot();
  await access(root, 6 /* R_OK | W_OK */);
  return root;
}
