import { boolean, date, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export type CompanySnapshot = {
  companyId: string;
  legalName: string;
  registrationNumber: string | null;
  tinNumber: string | null;
  registeredAddress: string | null;
  country: string | null;
  businessActivity: string | null;
  phone: string | null;
  email: string | null;
  documentPrefix: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  letterheadFileId: string | null;
  sealFileId: string | null;
  signatureFileId: string | null;
};

export type LetterSnapshot = {
  company: CompanySnapshot;
  employee: {
    id: string | null;
    legalName: string;
    preferredName: string | null;
    passportNumber: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    permanentAddress: string | null;
    emergencyContact: string | null;
    occupation: string | null;
    employmentStatus: string | null;
  };
  terms: {
    workSite: string | null;
    siteCode: string | null;
    basicSalary: string | null;
    benefits: string | null;
    paidVacation: string | null;
    workingHours: string | null;
    contractDuration: string | null;
    employmentStatus: string | null;
  };
  documentNumber: string;
  letterDate: string;
  signatoryName: string | null;
  signatoryTitle: string | null;
  letterheadAddress: string | null;
  phone: string | null;
  email: string | null;
  letterheadFileId: string | null;
  sealFileId: string | null;
  signatureFileId: string | null;
};

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey(),
  kind: text("kind").notNull().default("employer"),
  legalName: text("legal_name").notNull(),
  registrationNumber: text("registration_number"),
  tinNumber: text("tin_number"),
  registeredAddress: text("registered_address"),
  country: text("country"),
  businessActivity: text("business_activity"),
  phone: text("phone"),
  email: text("email"),
  documentPrefix: text("document_prefix"),
  signatoryName: text("signatory_name"),
  signatoryTitle: text("signatory_title"),
  letterheadFileId: uuid("letterhead_file_id"),
  sealFileId: uuid("seal_file_id"),
  signatureFileId: uuid("signature_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyPreferences = pgTable("company_preferences", {
  scopeKey: text("scope_key").primaryKey(),
  defaultCompanyId: uuid("default_company_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  selectedCompanyId: uuid("selected_company_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentSnapshots = pgTable("document_snapshots", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").$type<CompanySnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  siteType: text("site_type"),
  address: text("address"),
  state: text("state").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotaPools = pgTable("quota_pools", {
  id: uuid("id").primaryKey(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  poolNumber: text("pool_number"),
  capacity: integer("capacity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  legalName: text("legal_name").notNull(),
  preferredName: text("preferred_name"),
  workPermitNumber: text("work_permit_number"),
  nationality: text("nationality"),
  country: text("country"),
  gender: text("gender"),
  dateOfBirth: date("date_of_birth"),
  passportNumber: text("passport_number"),
  passportIssueDate: date("passport_issue_date"),
  passportExpiry: date("passport_expiry"),
  permanentAddress: text("permanent_address"),
  emergencyContact: text("emergency_contact"),
  occupation: text("occupation"),
  designation: text("designation"),
  employmentStatus: text("employment_status"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  quotaPoolId: uuid("quota_pool_id").references(() => quotaPools.id, { onDelete: "set null" }),
  workSite: text("work_site"),
  siteCode: text("site_code"),
  benefits: text("benefits"),
  paidVacation: text("paid_vacation"),
  workingHours: text("working_hours"),
  contractDuration: text("contract_duration"),
  issuedOn: date("issued_on"),
  expiresOn: date("expires_on"),
  feePaidUntil: date("fee_paid_until"),
  medicalExpiry: date("medical_expiry"),
  insuranceExpiry: date("insurance_expiry"),
  origin: text("origin"),
  salary: numeric("salary", { precision: 12, scale: 2 }),
  staffDayRate: numeric("staff_day_rate", { precision: 12, scale: 2 }),
  billDayRate: numeric("bill_day_rate", { precision: 12, scale: 2 }),
  arrivalDate: date("arrival_date"),
  workVisaNumber: text("work_visa_number"),
  workVisaExpiry: date("work_visa_expiry"),
  contractExpiry: date("contract_expiry"),
  photoFileId: uuid("photo_file_id"),
  xpatSyncedAt: timestamp("xpat_synced_at", { withTimezone: true }),
  xpatStatus: text("xpat_status"),
  xpatStateName: text("xpat_state_name"),
  xpatEmployerName: text("xpat_employer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const slots = pgTable(
  "slots",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    quotaPoolId: uuid("quota_pool_id")
      .notNull()
      .references(() => quotaPools.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "restrict" }),
    slotNumber: integer("slot_number"),
    occupation: text("occupation"),
    status: text("status").notNull().default("open"),
    expiresOn: date("expires_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("slots_project_employee").on(table.projectId, table.employeeId)],
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  canPreview: boolean("can_preview").notNull(),
  canEdit: boolean("can_edit").notNull(),
  canDelete: boolean("can_delete").notNull(),
  systemRole: boolean("system_role").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    canView: boolean("can_view").notNull().default(false),
    canCreate: boolean("can_create").notNull().default(false),
    canEdit: boolean("can_edit").notNull().default(false),
    canDelete: boolean("can_delete").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.module] })],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
  portalCompanyId: uuid("portal_company_id").references(() => companies.id, { onDelete: "cascade" }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userClients = pgTable(
  "user_clients",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientCompanyId: uuid("client_company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientCompanyId] })],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectDocuments = pgTable("project_documents", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentSequences = pgTable(
  "document_sequences",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (table) => [primaryKey({ name: "document_sequences_pk", columns: [table.companyId, table.docType, table.year] })],
);

export const files = pgTable("files", {
  id: uuid("id").primaryKey(),
  originalName: text("original_name").notNull(),
  storedPath: text("stored_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  kind: text("kind").notNull(),
  sha256: text("sha256"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fileLinks = pgTable("file_links", {
  id: uuid("id").primaryKey(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employments = pgTable("employments", {
  id: uuid("id").primaryKey(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  employerCompanyId: uuid("employer_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  employeeNumber: text("employee_number"),
  joinDate: date("join_date"),
  endDate: date("end_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Office-wide job titles used by employees, client rates, and allocations. */
export const designations = pgTable("designations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientDesignationRates = pgTable("client_designation_rates", {
  id: uuid("id").primaryKey(),
  clientCompanyId: uuid("client_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  designation: text("designation").notNull(),
  staffMonthRate: numeric("staff_month_rate", { precision: 12, scale: 2 }).notNull(),
  billMonthRate: numeric("bill_month_rate", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("MVR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientAllocations = pgTable("client_allocations", {
  id: uuid("id").primaryKey(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  employerCompanyId: uuid("employer_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  clientCompanyId: uuid("client_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  joinDate: date("join_date").notNull(),
  resignDate: date("resign_date"),
  endReason: text("end_reason"),
  endNote: text("end_note"),
  designation: text("designation"),
  staffSalary: numeric("staff_salary", { precision: 12, scale: 2 }).notNull(),
  billRate: numeric("bill_rate", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("MVR"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const allocationEvents = pgTable("allocation_events", {
  id: uuid("id").primaryKey(),
  allocationId: uuid("allocation_id")
    .notNull()
    .references(() => clientAllocations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payRuns = pgTable("pay_runs", {
  id: uuid("id").primaryKey(),
  employerCompanyId: uuid("employer_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  clientCompanyId: uuid("client_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull().default("draft"),
  generationMode: text("generation_mode").notNull().default("employer_client"),
  invoiceNumber: text("invoice_number"),
  salarySheetNumber: text("salary_sheet_number"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceCounters = pgTable("invoice_counters", {
  id: text("id").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payRunItems = pgTable("pay_run_items", {
  id: uuid("id").primaryKey(),
  payRunId: uuid("pay_run_id")
    .notNull()
    .references(() => payRuns.id, { onDelete: "cascade" }),
  allocationId: uuid("allocation_id")
    .notNull()
    .references(() => clientAllocations.id, { onDelete: "restrict" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  employeeName: text("employee_name").notNull(),
  designation: text("designation"),
  staffSalary: numeric("staff_salary", { precision: 12, scale: 2 }).notNull(),
  billRate: numeric("bill_rate", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("MVR"),
  calendarDays: integer("calendar_days").notNull().default(0),
  paidDays: integer("paid_days").notNull().default(0),
  absentDays: integer("absent_days").notNull().default(0),
  offDays: integer("off_days").notNull().default(0),
  unmarkedDays: integer("unmarked_days").notNull().default(0),
  grossStaff: numeric("gross_staff", { precision: 12, scale: 2 }).notNull().default("0"),
  lopStaff: numeric("lop_staff", { precision: 12, scale: 2 }).notNull().default("0"),
  otStaff: numeric("ot_staff", { precision: 12, scale: 2 }).notNull().default("0"),
  otherDeductStaff: numeric("other_deduct_staff", { precision: 12, scale: 2 }).notNull().default("0"),
  netStaff: numeric("net_staff", { precision: 12, scale: 2 }).notNull().default("0"),
  grossBill: numeric("gross_bill", { precision: 12, scale: 2 }).notNull().default("0"),
  lopBill: numeric("lop_bill", { precision: 12, scale: 2 }).notNull().default("0"),
  otBill: numeric("ot_bill", { precision: 12, scale: 2 }).notNull().default("0"),
  otherDeductBill: numeric("other_deduct_bill", { precision: 12, scale: 2 }).notNull().default("0"),
  deductionNote: text("deduction_note"),
  netBill: numeric("net_bill", { precision: 12, scale: 2 }).notNull().default("0"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payrollPeriodDeductions = pgTable("payroll_period_deductions", {
  id: uuid("id").primaryKey(),
  clientCompanyId: uuid("client_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  staffAmount: numeric("staff_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  billAmount: numeric("bill_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  note: text("note"),
  breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letters = pgTable("letters", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  documentNumber: text("document_number").notNull(),
  letterDate: date("letter_date").notNull(),
  fingerprint: text("fingerprint").notNull(),
  snapshot: jsonb("snapshot").$type<LetterSnapshot>().notNull(),
  status: text("status").notNull().default("issued"),
  signedFileId: uuid("signed_file_id").references(() => files.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accommodations = pgTable("accommodations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  capacity: integer("capacity").notNull().default(1),
  dailyRate: numeric("daily_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("MVR"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accommodationStays = pgTable("accommodation_stays", {
  id: uuid("id").primaryKey(),
  accommodationId: uuid("accommodation_id")
    .notNull()
    .references(() => accommodations.id, { onDelete: "restrict" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  checkIn: date("check_in").notNull(),
  checkOut: date("check_out"),
  dailyRateSnapshot: numeric("daily_rate_snapshot", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("MVR"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey(),
  expenseDate: date("expense_date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("MVR"),
  category: text("category").notNull(),
  clientCompanyId: uuid("client_company_id").references(() => companies.id, { onDelete: "restrict" }),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  counterparty: text("counterparty"),
  note: text("note"),
  recurrenceKey: text("recurrence_key"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const financeFeeSettings = pgTable("finance_fee_settings", {
  id: uuid("id").primaryKey(),
  workPermitMonthly: numeric("work_permit_monthly", { precision: 12, scale: 2 }).notNull().default("350"),
  insuranceYearly: numeric("insurance_yearly", { precision: 12, scale: 2 }).notNull().default("800"),
  medicalYearly: numeric("medical_yearly", { precision: 12, scale: 2 }).notNull().default("500"),
  currency: text("currency").notNull().default("MVR"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wpDepositRates = pgTable("wp_deposit_rates", {
  id: uuid("id").primaryKey(),
  countryName: text("country_name").notNull(),
  isoCode: text("iso_code").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceRecords = pgTable("attendance_records", {
  id: uuid("id").primaryKey(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  attendanceDate: date("attendance_date").notNull(),
  status: text("status").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otRates = pgTable("ot_rates", {
  id: uuid("id").primaryKey(),
  scope: text("scope").notNull(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  clientCompanyId: uuid("client_company_id").references(() => companies.id, { onDelete: "cascade" }),
  hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("MVR"),
  label: text("label"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otEntries = pgTable("ot_entries", {
  id: uuid("id").primaryKey(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  workDate: date("work_date").notNull(),
  hours: numeric("hours", { precision: 8, scale: 2 }).notNull(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  clientCompanyId: uuid("client_company_id").references(() => companies.id, { onDelete: "set null" }),
  hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("MVR"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
