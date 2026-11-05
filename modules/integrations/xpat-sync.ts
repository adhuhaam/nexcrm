import { pool } from "../../lib/db.ts";
import { storeBuffer } from "../files/storage.ts";
import { setEmployeePhoto } from "../hr/employees.ts";
import { getWorkPermit, type WorkPermitRecord } from "../hr/work-permits.ts";
import { fetchPublicImage, resolveXpatLookup, XpatError, type XpatNormalized } from "./xpat.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class XpatSyncError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "XpatSyncError";
    this.status = status;
  }
}

export type XpatLookupPreview = XpatNormalized & {
  existingEmployeeId: string | null;
  existingLegalName: string | null;
};

export type XpatImportResult = {
  created: boolean;
  employeeId: string;
  workPermit: WorkPermitRecord;
  preview: XpatNormalized;
};

async function findByWorkPermitNumber(workPermitNumber: string): Promise<{ id: string; legalName: string } | null> {
  const result = await pool.query<{ id: string; legal_name: string }>(
    `select id, legal_name from employees where lower(work_permit_number) = lower($1) limit 1`,
    [workPermitNumber.trim()],
  );
  const row = result.rows[0];
  return row ? { id: row.id, legalName: row.legal_name } : null;
}

export async function previewXpatLookup(input: {
  workPermitNumber: string;
  passportNumber?: string | null;
  lastName?: string | null;
}): Promise<XpatLookupPreview> {
  const preview = await resolveXpatLookup(input);
  const existing = await findByWorkPermitNumber(preview.workPermitNumber);
  return {
    ...preview,
    existingEmployeeId: existing?.id ?? null,
    existingLegalName: existing?.legalName ?? null,
  };
}

async function applyPhoto(employeeId: string, photoUrl: string | null, uploadedBy: string | null): Promise<void> {
  if (!photoUrl) return;
  const image = await fetchPublicImage(photoUrl);
  if (!image) return;
  // Store for the employee avatar only — do not link into the Documents vault.
  const stored = await storeBuffer({
    buffer: image.buffer,
    originalName: `xpat-photo-${employeeId}.jpg`,
    mimeType: image.mimeType.startsWith("image/") ? image.mimeType : "image/jpeg",
    kind: "employee_photo",
    uploadedBy,
    employeeIdForPath: employeeId,
  });
  await setEmployeePhoto(employeeId, stored.id);
}

async function upsertFromNormalized(input: {
  companyId: string;
  preview: XpatNormalized;
  uploadedBy?: string | null;
}): Promise<XpatImportResult> {
  if (!uuidPattern.test(input.companyId)) throw new XpatSyncError("Company is required");
  const company = await pool.query(`select id from companies where id = $1`, [input.companyId]);
  if (!company.rowCount) throw new XpatSyncError("Company not found");

  const existing = await findByWorkPermitNumber(input.preview.workPermitNumber);
  const values = [
    input.companyId,
    input.preview.legalName,
    input.preview.workPermitNumber,
    input.preview.passportNumber,
    input.preview.occupation,
    input.preview.issuedOn,
    input.preview.expiresOn,
    input.preview.workSite,
    input.preview.workSiteCode,
    input.preview.xpatStatus,
    input.preview.xpatStateName,
    input.preview.employerName,
  ];

  let employeeId: string;
  let created = false;
  try {
    if (existing) {
      employeeId = existing.id;
      await pool.query(
        `update employees set
          company_id = $1,
          legal_name = $2,
          work_permit_number = $3,
          passport_number = coalesce($4, passport_number),
          occupation = coalesce($5, occupation),
          issued_on = coalesce($6::date, issued_on),
          expires_on = coalesce($7::date, expires_on),
          work_site = coalesce($8, work_site),
          site_code = coalesce($9, site_code),
          xpat_status = $10,
          xpat_state_name = $11,
          xpat_employer_name = coalesce($12, xpat_employer_name),
          xpat_synced_at = now(),
          updated_at = now()
         where id = $13`,
        [...values, employeeId],
      );
    } else {
      created = true;
      employeeId = crypto.randomUUID();
      await pool.query(
        `insert into employees (
          id, company_id, legal_name, work_permit_number, passport_number, occupation,
          issued_on, expires_on, work_site, site_code, xpat_status, xpat_state_name, xpat_employer_name, xpat_synced_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, $13, now(), now()
        )`,
        [employeeId, ...values],
      );
    }
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new XpatSyncError("That work permit or passport is already recorded");
    }
    throw error;
  }

  await applyPhoto(employeeId, input.preview.photoUrl, input.uploadedBy ?? null);
  const workPermit = await getWorkPermit(employeeId);
  if (!workPermit) throw new XpatSyncError("Imported work permit could not be loaded", 500);
  return { created, employeeId, workPermit, preview: input.preview };
}

export async function importFromXpat(input: {
  companyId: string;
  workPermitNumber: string;
  passportNumber?: string | null;
  lastName?: string | null;
  uploadedBy?: string | null;
}): Promise<XpatImportResult> {
  const preview = await resolveXpatLookup(input);
  return upsertFromNormalized({ companyId: input.companyId, preview, uploadedBy: input.uploadedBy });
}

export async function syncEmployeeFromXpat(input: {
  employeeId: string;
  passportNumber?: string | null;
  lastName?: string | null;
  uploadedBy?: string | null;
}): Promise<XpatImportResult> {
  if (!uuidPattern.test(input.employeeId)) throw new XpatSyncError("Employee not found", 404);
  const current = await getWorkPermit(input.employeeId);
  if (!current) throw new XpatSyncError("Employee not found", 404);
  if (!current.workPermitNumber) throw new XpatSyncError("Employee has no work permit number");

  const passport = (input.passportNumber ?? current.passportNumber ?? "").trim();
  const lastName =
    (input.lastName ?? "").trim() ||
    (!passport ? (current.legalName.split(/\s+/).pop() ?? "") : "");
  if (!passport && !lastName) throw new XpatSyncError("Provide a passport number or last name to sync");

  const preview = await resolveXpatLookup({
    workPermitNumber: current.workPermitNumber,
    passportNumber: passport || null,
    lastName: passport ? null : lastName,
  });

  if (
    preview.workPermitNumber.toLowerCase() !== current.workPermitNumber.toLowerCase() &&
    (await findByWorkPermitNumber(preview.workPermitNumber))?.id !== current.id
  ) {
    throw new XpatSyncError("Xpat returned a different work permit number than this employee");
  }

  return upsertFromNormalized({
    companyId: current.companyId,
    preview: { ...preview, workPermitNumber: current.workPermitNumber },
    uploadedBy: input.uploadedBy,
  });
}

export async function syncAllFromXpat(uploadedBy?: string | null): Promise<{
  updated: number;
  failed: number;
  skipped: number;
  errors: { employeeId: string; legalName: string; error: string }[];
}> {
  const result = await pool.query<{ id: string; legal_name: string; work_permit_number: string; passport_number: string | null }>(
    `select id, legal_name, work_permit_number, passport_number
     from employees
     where work_permit_number is not null and btrim(work_permit_number) <> ''
     order by legal_name`,
  );

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { employeeId: string; legalName: string; error: string }[] = [];

  for (const row of result.rows) {
    const passport = row.passport_number?.trim() || "";
    const lastName = row.legal_name.split(/\s+/).pop() ?? "";
    if (!passport && !lastName) {
      skipped += 1;
      continue;
    }
    try {
      await syncEmployeeFromXpat({
        employeeId: row.id,
        passportNumber: passport || null,
        lastName: passport ? null : lastName,
        uploadedBy,
      });
      updated += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof XpatError || error instanceof XpatSyncError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Sync failed";
      errors.push({ employeeId: row.id, legalName: row.legal_name, error: message });
    }
  }

  return { updated, failed, skipped, errors };
}
