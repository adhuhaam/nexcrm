import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, sep } from "node:path";
import type { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { eq } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { fileLinks, files } from "../../lib/schema.ts";
import { loadEnv } from "../../lib/env.ts";

loadEnv();

export type FileKind =
  | "passport_scan"
  | "passport_ocr_json"
  | "loa_signed"
  | "employee_doc"
  | "employee_photo"
  | "company_letterhead"
  | "company_seal"
  | "company_signature"
  | "other";

export type StoredFile = {
  id: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  kind: FileKind;
  sha256: string | null;
  uploadedBy: string | null;
  createdAt: Date;
};

export class FileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileError";
  }
}

const maxBytes = 20 * 1024 * 1024;
const allowedMime = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "application/json",
  "text/plain",
]);

function fileRoot(): string {
  const root = process.env.FILE_ROOT;
  if (!root) throw new FileError("FILE_ROOT is not configured");
  return root;
}

export async function ensureFileRoot(): Promise<string> {
  const root = fileRoot();
  await mkdir(root, { recursive: true });
  return root;
}

function safeName(name: string): string {
  const base = basename(name).replace(/[^\w.\-()+ ]+/g, "_").trim() || "file";
  return base.slice(0, 120);
}

function absolutePath(storedPath: string): string {
  const root = fileRoot();
  const full = normalize(join(root, storedPath));
  if (full !== root && !full.startsWith(`${root}${sep}`)) throw new FileError("Invalid file path");
  return full;
}

export async function storeBuffer(input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  kind: FileKind;
  uploadedBy?: string | null;
  entityType?: string;
  entityId?: string;
  label?: string | null;
  employeeIdForPath?: string | null;
}): Promise<StoredFile> {
  if (input.buffer.length === 0) throw new FileError("Empty file");
  if (input.buffer.length > maxBytes) throw new FileError("File is too large (max 20 MB)");
  const mime = input.mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  if (!allowedMime.has(mime) && input.kind !== "other" && input.kind !== "passport_ocr_json") {
    throw new FileError(`File type not allowed: ${mime}`);
  }

  const root = await ensureFileRoot();
  const id = randomUUID();
  const year = String(new Date().getFullYear());
  const folder = input.employeeIdForPath || input.entityId || "shared";
  const relative = join(folder, year, `${id}-${safeName(input.originalName)}`);
  const absolute = join(root, relative);
  await mkdir(dirname(absolute), { recursive: true });
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  await writeFile(absolute, input.buffer);

  const rows = await db
    .insert(files)
    .values({
      id,
      originalName: safeName(input.originalName),
      storedPath: relative.split(sep).join("/"),
      mimeType: mime,
      sizeBytes: input.buffer.length,
      kind: input.kind,
      sha256,
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning();
  const row = rows[0];

  if (input.entityType && input.entityId) {
    await db.insert(fileLinks).values({
      id: randomUUID(),
      fileId: id,
      entityType: input.entityType,
      entityId: input.entityId,
      label: input.label ?? null,
    });
  }

  return {
    id: row.id,
    originalName: row.originalName,
    storedPath: row.storedPath,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    kind: row.kind as FileKind,
    sha256: row.sha256,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

export async function getFile(id: string): Promise<StoredFile | null> {
  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    originalName: row.originalName,
    storedPath: row.storedPath,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    kind: row.kind as FileKind,
    sha256: row.sha256,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

export async function openFileStream(id: string): Promise<{ file: StoredFile; stream: Readable; absolute: string }> {
  const file = await getFile(id);
  if (!file) throw new FileError("File not found");
  const absolute = absolutePath(file.storedPath);
  await access(absolute);
  return { file, stream: createReadStream(absolute), absolute };
}

export async function listEntityFiles(entityType: string, entityId: string): Promise<(StoredFile & { label: string | null; linkId: string })[]> {
  const q = await pool.query<{
    link_id: string;
    label: string | null;
    id: string;
    original_name: string;
    stored_path: string;
    mime_type: string;
    size_bytes: number;
    kind: string;
    sha256: string | null;
    uploaded_by: string | null;
    created_at: Date;
  }>(
    `select file_links.id as link_id, file_links.label,
            files.id, files.original_name, files.stored_path, files.mime_type, files.size_bytes,
            files.kind, files.sha256, files.uploaded_by, files.created_at
     from file_links
     inner join files on files.id = file_links.file_id
     where file_links.entity_type = $1 and file_links.entity_id = $2
       and files.kind <> 'employee_photo'
     order by files.created_at desc`,
    [entityType, entityId],
  );
  return q.rows.map((row) => ({
    linkId: row.link_id,
    label: row.label,
    id: row.id,
    originalName: row.original_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    kind: row.kind as FileKind,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }));
}

export type DriveFile = StoredFile & {
  label: string | null;
  linkId: string;
  entityType: string;
  entityId: string;
  entityName: string;
};

/** Flat drive index for the Documents file manager (excludes profile photos). */
export async function listDriveFiles(limit = 2000): Promise<DriveFile[]> {
  const q = await pool.query<{
    link_id: string;
    label: string | null;
    entity_type: string;
    entity_id: string;
    entity_name: string | null;
    id: string;
    original_name: string;
    stored_path: string;
    mime_type: string;
    size_bytes: number;
    kind: string;
    sha256: string | null;
    uploaded_by: string | null;
    created_at: Date;
  }>(
    `select file_links.id as link_id,
            file_links.label,
            file_links.entity_type,
            file_links.entity_id,
            coalesce(employees.legal_name, companies.legal_name, projects.name, file_links.entity_id::text) as entity_name,
            files.id, files.original_name, files.stored_path, files.mime_type, files.size_bytes,
            files.kind, files.sha256, files.uploaded_by, files.created_at
     from file_links
     inner join files on files.id = file_links.file_id
     left join employees on file_links.entity_type = 'employee' and employees.id = file_links.entity_id
     left join companies on file_links.entity_type = 'company' and companies.id = file_links.entity_id
     left join projects on file_links.entity_type = 'project' and projects.id = file_links.entity_id
     where files.kind <> 'employee_photo'
     order by files.created_at desc
     limit $1`,
    [Math.min(Math.max(limit, 1), 5000)],
  );
  return q.rows.map((row) => ({
    linkId: row.link_id,
    label: row.label,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name ?? row.entity_id,
    id: row.id,
    originalName: row.original_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    kind: row.kind as FileKind,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }));
}

export async function linkFile(fileId: string, entityType: string, entityId: string, label?: string | null): Promise<void> {
  await db.insert(fileLinks).values({
    id: randomUUID(),
    fileId,
    entityType,
    entityId,
    label: label ?? null,
  });
}

export async function readMultipart(
  request: IncomingMessage,
): Promise<{ fields: Record<string, string>; file: { filename: string; mimeType: string; buffer: Buffer } | null }> {
  const contentType = request.headers["content-type"] ?? "";
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) throw new FileError("Multipart boundary missing");
  const boundary = match[1] || match[2];
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes + 64_000) throw new FileError("Upload is too large");
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks);
  const parts = splitMultipart(body, boundary);
  const fields: Record<string, string> = {};
  let file: { filename: string; mimeType: string; buffer: Buffer } | null = null;
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = part.subarray(0, headerEnd).toString("utf8");
    let content = part.subarray(headerEnd + 4);
    if (content.subarray(-2).toString() === "\r\n") content = content.subarray(0, content.length - 2);
    const nameMatch = /name="([^"]+)"/i.exec(header);
    const filenameMatch = /filename="([^"]*)"/i.exec(header);
    const name = nameMatch?.[1];
    if (!name) continue;
    if (filenameMatch) {
      const mimeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
      file = {
        filename: filenameMatch[1] || "upload.bin",
        mimeType: mimeMatch?.[1]?.trim() || "application/octet-stream",
        buffer: content,
      };
    } else {
      fields[name] = content.toString("utf8");
    }
  }
  return { fields, file };
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const delim = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = body.indexOf(delim);
  while (start !== -1) {
    start += delim.length;
    if (body[start] === 45 && body[start + 1] === 45) break;
    if (body[start] === 13 && body[start + 1] === 10) start += 2;
    const end = body.indexOf(delim, start);
    if (end === -1) break;
    parts.push(body.subarray(start, end - 2));
    start = end;
  }
  return parts;
}
