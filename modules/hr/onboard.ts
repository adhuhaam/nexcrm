import { createEmployeeRecord, getEmployee, type EmployeeRecord } from "./employees.ts";
import { createAllocation, type AllocationRecord } from "./allocations.ts";
import { checkIn, type StayRecord } from "./accommodations.ts";
import { openSlot } from "../projects/projects.ts";
import { storeBuffer } from "../files/storage.ts";
import { extractPassportFields, type PassportProposed } from "./passport-ocr.ts";

export class OnboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardError";
  }
}

export type OnboardResult = {
  employee: EmployeeRecord;
  allocation: AllocationRecord | null;
  stay: StayRecord | null;
  slotId: string | null;
};

export async function scanPassportForOnboard(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  uploadedBy?: string | null;
}): Promise<{ proposed: PassportProposed; scanFileId: string; ocrFileId: string }> {
  const proposed = await extractPassportFields(input.buffer, input.mimeType);
  const scan = await storeBuffer({
    buffer: input.buffer,
    originalName: input.filename,
    mimeType: input.mimeType,
    kind: "passport_scan",
    uploadedBy: input.uploadedBy ?? null,
    entityType: "onboard",
    entityId: "00000000-0000-4000-8000-000000000000",
    label: "Passport scan (onboard)",
    employeeIdForPath: "onboard",
  });
  const ocr = await storeBuffer({
    buffer: Buffer.from(JSON.stringify({ proposed, sourceFileId: scan.id }, null, 2)),
    originalName: "passport-ocr.json",
    mimeType: "application/json",
    kind: "passport_ocr_json",
    uploadedBy: input.uploadedBy ?? null,
    entityType: "onboard",
    entityId: "00000000-0000-4000-8000-000000000000",
    label: "Passport OCR (onboard)",
    employeeIdForPath: "onboard",
  });
  return { proposed, scanFileId: scan.id, ocrFileId: ocr.id };
}

export async function onboardEmployee(input: {
  person: Record<string, unknown>;
  companyId: string;
  projectId?: string | null;
  siteId?: string | null;
  quotaPoolId?: string | null;
  slotId?: string | null;
  clientAllocation?: {
    clientCompanyId: string;
    joinDate: string;
    designation?: string | null;
    staffSalary: string;
    billRate: string;
    currency?: string;
  } | null;
  accommodationStay?: {
    accommodationId: string;
    checkIn: string;
    notes?: string | null;
  } | null;
  scanFileId?: string | null;
  createdBy?: string | null;
}): Promise<OnboardResult> {
  if (!input.person || typeof input.person !== "object") throw new OnboardError("Person fields are required");
  const employee = await createEmployeeRecord({
    ...input.person,
    companyId: input.companyId,
    projectId: input.projectId ?? null,
    siteId: input.siteId ?? null,
    quotaPoolId: input.quotaPoolId ?? null,
  });

  let slotId: string | null = null;
  if (input.projectId && input.quotaPoolId) {
    try {
      slotId = await openSlot(input.projectId, input.quotaPoolId, employee.id, input.slotId ?? undefined);
    } catch (error) {
      throw new OnboardError(error instanceof Error ? error.message : "Could not assign quota slot");
    }
  }

  if (input.scanFileId) {
    const { linkFile } = await import("../files/storage.ts");
    await linkFile(input.scanFileId, "employee", employee.id, "Passport scan");
  }

  let allocation: AllocationRecord | null = null;
  if (input.clientAllocation?.clientCompanyId) {
    allocation = await createAllocation({
      employeeId: employee.id,
      clientCompanyId: input.clientAllocation.clientCompanyId,
      joinDate: input.clientAllocation.joinDate,
      designation: input.clientAllocation.designation,
      staffSalary: input.clientAllocation.staffSalary,
      billRate: input.clientAllocation.billRate,
      currency: input.clientAllocation.currency,
      createdBy: input.createdBy,
    });
  }

  let stay: StayRecord | null = null;
  if (input.accommodationStay?.accommodationId) {
    stay = await checkIn({
      accommodationId: input.accommodationStay.accommodationId,
      employeeId: employee.id,
      checkIn: input.accommodationStay.checkIn,
      notes: input.accommodationStay.notes,
    });
  }

  const refreshed = await getEmployee(employee.id);
  return { employee: refreshed ?? employee, allocation, stay, slotId };
}
