import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  BriefcaseIcon,
  Building2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudDownloadIcon,
  FolderTreeIcon,
  IdCardIcon,
  LayoutGridIcon,
  LayoutListIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DesignationField } from "@/components/designation-field";
import { AreaField, SelectField, TextField } from "@/components/field";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { FormDialog } from "@/components/form-dialog";
import { QuickCreateMenu } from "@/components/quick-create";
import { Banner, Shell, WhenEditing } from "@/components/shell";
import { PageSkeleton, Spinner } from "@/components/ux";
import { XpatStatusBadge } from "@/components/xpat-status-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson, sendJson } from "@/lib/api";
import { formatDate, formatDateRange, formatDateTime } from "@/lib/dates";
import { formatMoneyPair } from "@/lib/money";
import { cn } from "@/lib/utils";
import "@/styles/jacms-surface.css";
import "./employees.css";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

type ExpiryFilter = "" | "expired" | "soon" | "missing";
type AllocationFilter = "" | "allocated" | "unallocated";
type XpatFilter = "" | "arrived" | "departed" | "pending" | "valid" | "invalid" | "missing";
type TriFilter = "" | "yes" | "no";
type ViewMode = "list" | "cards";

const VIEW_STORAGE_KEY = "jacms.employees.view";

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function daysUntil(expiresOn: string | null): number | null {
  if (!expiresOn) return null;
  const day = expiresOn.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const exp = new Date(`${day}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

function expiryTone(expiresOn: string | null): "" | "urgent" | "expired" {
  const days = daysUntil(expiresOn);
  if (days == null) return "";
  if (days < 0) return "expired";
  if (days <= 30) return "urgent";
  return "";
}

function ExpiryPill({ expiresOn }: { expiresOn: string | null }) {
  const days = daysUntil(expiresOn);
  if (days == null) return <span className="people-pill is-muted">No expiry</span>;
  if (days < 0) return <span className="people-pill is-danger">Expired {Math.abs(days)}d</span>;
  if (days <= 30) {
    return <span className="people-pill is-warn">{days === 0 ? "Expires today" : `${days}d left`}</span>;
  }
  return <span className="people-pill is-muted">{formatDate(expiresOn)}</span>;
}

type Company = { id: string; legalName: string };
type Option = { id: string; name: string; projectId?: string; siteId?: string };
type SlotOption = {
  id: string;
  quotaPoolId: string;
  slotNumber: number | null;
  status: string;
  employeeId: string | null;
};

type EmployeeListItem = {
  id: string;
  companyId: string;
  companyName: string;
  legalName: string;
  passportNumber: string | null;
  workPermitNumber: string | null;
  expiresOn: string | null;
  xpatStatus: string | null;
  xpatStateName: string | null;
  xpatSyncedAt: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  nationality: string | null;
  photoFileId: string | null;
  clientCompanyId: string | null;
  clientName: string | null;
  designation: string | null;
  projectName: string | null;
  siteName: string | null;
  quotaPoolName: string | null;
  slotNumber: number | null;
};

type EmployeeForm = {
  companyId: string;
  legalName: string;
  preferredName: string;
  workPermitNumber: string;
  passportNumber: string;
  passportIssueDate: string;
  passportExpiry: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  permanentAddress: string;
  emergencyContact: string;
  occupation: string;
  designation: string;
  employmentStatus: string;
  projectId: string;
  siteId: string;
  quotaPoolId: string;
  slotId: string;
  workSite: string;
  siteCode: string;
  salary: string;
  staffDayRate: string;
  billDayRate: string;
  benefits: string;
  paidVacation: string;
  workingHours: string;
  contractDuration: string;
  country: string;
  origin: string;
  issuedOn: string;
  expiresOn: string;
  feePaidUntil: string;
  medicalExpiry: string;
  insuranceExpiry: string;
  arrivalDate: string;
  workVisaNumber: string;
  workVisaExpiry: string;
  contractExpiry: string;
};

type XpatPreview = {
  workPermitNumber: string;
  passportNumber: string | null;
  legalName: string;
  occupation: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  xpatStatus: string | null;
  xpatStateName: string | null;
  employerName: string | null;
  photoUrl: string | null;
  existingEmployeeId: string | null;
  existingLegalName: string | null;
};

const blank: EmployeeForm = {
  companyId: "",
  legalName: "",
  preferredName: "",
  workPermitNumber: "",
  passportNumber: "",
  passportIssueDate: "",
  passportExpiry: "",
  nationality: "",
  dateOfBirth: "",
  gender: "",
  permanentAddress: "",
  emergencyContact: "",
  occupation: "",
  designation: "",
  employmentStatus: "",
  projectId: "",
  siteId: "",
  quotaPoolId: "",
  slotId: "",
  workSite: "",
  siteCode: "",
  salary: "",
  staffDayRate: "",
  billDayRate: "",
  benefits: "",
  paidVacation: "",
  workingHours: "",
  contractDuration: "",
  country: "",
  origin: "",
  issuedOn: "",
  expiresOn: "",
  feePaidUntil: "",
  medicalExpiry: "",
  insuranceExpiry: "",
  arrivalDate: "",
  workVisaNumber: "",
  workVisaExpiry: "",
  contractExpiry: "",
};

function fromRecord(record: Record<string, string | null | undefined>, companyId = ""): EmployeeForm {
  const text = (key: keyof EmployeeForm) => record[key] ?? "";
  return {
    companyId: record.companyId ?? companyId,
    legalName: text("legalName"),
    preferredName: text("preferredName"),
    workPermitNumber: text("workPermitNumber"),
    passportNumber: text("passportNumber"),
    passportIssueDate: text("passportIssueDate"),
    passportExpiry: text("passportExpiry"),
    nationality: text("nationality"),
    dateOfBirth: text("dateOfBirth"),
    gender: text("gender"),
    permanentAddress: text("permanentAddress"),
    emergencyContact: text("emergencyContact"),
    occupation: text("occupation"),
    designation: text("designation"),
    employmentStatus: text("employmentStatus"),
    projectId: text("projectId"),
    siteId: text("siteId"),
    quotaPoolId: text("quotaPoolId"),
    slotId: text("slotId"),
    workSite: text("workSite"),
    siteCode: text("siteCode"),
    salary: text("salary"),
    staffDayRate: text("staffDayRate"),
    billDayRate: text("billDayRate"),
    benefits: text("benefits"),
    paidVacation: text("paidVacation"),
    workingHours: text("workingHours"),
    contractDuration: text("contractDuration"),
    country: text("country"),
    origin: text("origin"),
    issuedOn: text("issuedOn"),
    expiresOn: text("expiresOn"),
    feePaidUntil: text("feePaidUntil"),
    medicalExpiry: text("medicalExpiry"),
    insuranceExpiry: text("insuranceExpiry"),
    arrivalDate: text("arrivalDate"),
    workVisaNumber: text("workVisaNumber"),
    workVisaExpiry: text("workVisaExpiry"),
    contractExpiry: text("contractExpiry"),
  };
}

function editIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("new") === "1") return "new";
  const edit = params.get("edit");
  return edit && /^[0-9a-f-]{36}$/i.test(edit) ? edit : null;
}

function setUrlEdit(id: string | null) {
  const url = new URL(window.location.href);
  url.pathname = "/employees";
  url.searchParams.delete("new");
  url.searchParams.delete("edit");
  if (id === "new") url.searchParams.set("new", "1");
  else if (id) url.searchParams.set("edit", id);
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export function EmployeeListPage() {
  const [rows, setRows] = useState<EmployeeListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageCount, setPageCount] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [expiry, setExpiry] = useState<ExpiryFilter>("");
  const [allocation, setAllocation] = useState<AllocationFilter>("");
  const [xpat, setXpat] = useState<XpatFilter>("");
  const [hasPhoto, setHasPhoto] = useState<TriFilter>("");
  const [hasWorkPermit, setHasWorkPermit] = useState<TriFilter>("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => readViewMode());
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [error, setError] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<string | null>(() => editIdFromUrl());
  useEffect(() => {
    const syncEditorFromUrl = () => setEditorId(editIdFromUrl());
    window.addEventListener("jacms:navigate", syncEditorFromUrl);
    return () => window.removeEventListener("jacms:navigate", syncEditorFromUrl);
  }, []);
  const [xpatOpen, setXpatOpen] = useState(false);
  const [xpatCompanyId, setXpatCompanyId] = useState("");
  const [xpatWp, setXpatWp] = useState("");
  const [xpatPassport, setXpatPassport] = useState("");
  const [xpatLastName, setXpatLastName] = useState("");
  const [xpatPreview, setXpatPreview] = useState<XpatPreview | null>(null);
  const [xpatPending, setXpatPending] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncAllPending, setSyncAllPending] = useState(false);

  const filterDeps = [debouncedQ, companyId, clientCompanyId, expiry, allocation, xpat, hasPhoto, hasWorkPermit] as const;

  const filtersActive = Boolean(
    debouncedQ.trim() || companyId || clientCompanyId || expiry || allocation || xpat || hasPhoto || hasWorkPermit,
  );

  const activeFilterCount = [
    debouncedQ.trim(),
    companyId,
    clientCompanyId,
    expiry,
    allocation,
    xpat,
    hasPhoto,
    hasWorkPermit,
  ].filter(Boolean).length;

  function buildParams(nextPage = page, nextPageSize = pageSize) {
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (companyId) params.set("companyId", companyId);
    if (clientCompanyId) params.set("clientCompanyId", clientCompanyId);
    if (expiry) params.set("expiry", expiry);
    if (allocation) params.set("allocation", allocation);
    if (xpat) params.set("xpat", xpat);
    if (hasPhoto === "yes") params.set("hasPhoto", "1");
    if (hasPhoto === "no") params.set("hasPhoto", "0");
    if (hasWorkPermit === "yes") params.set("hasWorkPermit", "1");
    if (hasWorkPermit === "no") params.set("hasWorkPermit", "0");
    return params;
  }

  function reload(nextPage = page, nextPageSize = pageSize) {
    return getJson<{
      employees: EmployeeListItem[];
      total: number;
      page: number;
      pageSize: number;
      pageCount: number;
    }>(`/api/v1/employees?${buildParams(nextPage, nextPageSize)}`)
      .then((data) => {
        setRows(data.employees);
        setTotal(data.total);
        setPage(data.page);
        setPageSize(data.pageSize);
        setPageCount(data.pageCount);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load employees"));
  }

  function setView(next: ViewMode) {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    setPage(1);
  }, filterDeps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson<{
      employees: EmployeeListItem[];
      total: number;
      page: number;
      pageSize: number;
      pageCount: number;
    }>(`/api/v1/employees?${buildParams(page, pageSize)}`)
      .then((data) => {
        if (cancelled) return;
        setRows(data.employees);
        setTotal(data.total);
        setPageCount(data.pageCount);
        if (data.page !== page) setPage(data.page);
        if (data.pageSize !== pageSize) setPageSize(data.pageSize);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load employees");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...filterDeps, page, pageSize]);

  useEffect(() => {
    getJson<{
      companies: Company[];
      preferences: { defaultCompanyId: string | null; selectedCompanyId: string | null };
    }>("/api/v1/companies?kind=employer")
      .then((data) => {
        setCompanies(data.companies);
        setXpatCompanyId(
          data.preferences.selectedCompanyId ?? data.preferences.defaultCompanyId ?? data.companies[0]?.id ?? "",
        );
      })
      .catch(() => undefined);
    getJson<{ clients?: Company[]; companies?: Company[] }>("/api/v1/clients")
      .then((data) => setClients(data.clients ?? data.companies ?? []))
      .catch(() => undefined);
  }, []);

  const rangeLabel = useMemo(() => {
    if (!total) return "0 employees";
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    return `${from}–${to} of ${total}`;
  }, [page, pageSize, total]);

  const employerLabel = companies.find((c) => c.id === companyId)?.legalName;
  const clientLabel = clients.find((c) => c.id === clientCompanyId)?.legalName;

  function clearFilters() {
    setQ("");
    setCompanyId("");
    setClientCompanyId("");
    setExpiry("");
    setAllocation("");
    setXpat("");
    setHasPhoto("");
    setHasWorkPermit("");
    setPage(1);
  }

  function openEditor(id: string | null) {
    setEditorId(id);
    setUrlEdit(id);
  }

  function openXpatFetch() {
    setXpatPreview(null);
    setXpatWp("");
    setXpatPassport("");
    setXpatLastName("");
    setXpatOpen(true);
  }

  async function previewXpat() {
    setXpatPending(true);
    setXpatPreview(null);
    try {
      const data = await sendJson<{ preview: XpatPreview }>("/api/v1/integrations/xpat/lookup", "POST", {
        workPermitNumber: xpatWp,
        passportNumber: xpatPassport,
        lastName: xpatLastName,
      });
      setXpatPreview(data.preview);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "XPAT lookup failed");
    } finally {
      setXpatPending(false);
    }
  }

  async function importXpat() {
    setXpatPending(true);
    try {
      const result = await sendJson<{ created: boolean; workPermit: { id: string } }>(
        "/api/v1/integrations/xpat/import",
        "POST",
        {
          companyId: xpatCompanyId,
          workPermitNumber: xpatWp,
          passportNumber: xpatPassport,
          lastName: xpatLastName,
        },
      );
      toast.success(result.created ? "Imported from XPAT" : "Updated from XPAT");
      setXpatOpen(false);
      reload();
      if (result.workPermit?.id) openEditor(result.workPermit.id);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "XPAT import failed");
    } finally {
      setXpatPending(false);
    }
  }

  async function refreshOne(row: EmployeeListItem, event?: MouseEvent) {
    event?.stopPropagation();
    setSyncingId(row.id);
    try {
      await sendJson(`/api/v1/employees/${row.id}/xpat-sync`, "POST", {
        passportNumber: row.passportNumber ?? "",
        lastName: row.passportNumber ? "" : row.legalName.split(/\s+/).pop() ?? "",
      });
      toast.success(`Synced ${row.legalName}`);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    setSyncAllPending(true);
    try {
      const summary = await sendJson<{ updated: number; failed: number; skipped: number }>(
        "/api/v1/integrations/xpat/sync-all",
        "POST",
        {},
      );
      toast.success(`XPAT sync: ${summary.updated} updated, ${summary.failed} failed, ${summary.skipped} skipped`);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Sync all failed");
    } finally {
      setSyncAllPending(false);
    }
  }

  return (
    <Shell
      title="JACMS · Employees"
      eyebrow="People"
      description="Interactive people directory — filter from the rail, browse cards or list, open anyone to edit."
      surface={false}
      actions={
        <WhenEditing>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  <CloudDownloadIcon />
                  XPAT
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openXpatFetch}>
                  <CloudDownloadIcon />
                  Fetch one from XPAT
                </DropdownMenuItem>
                <DropdownMenuItem disabled={syncAllPending} onClick={() => void syncAll()}>
                  <RefreshCwIcon />
                  Sync all from XPAT
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <QuickCreateMenu label="Add employee" />
          </div>
        </WhenEditing>
      }
    >
      <Banner message={error} error />

      <div className="jacms-surface jacms-people">
        {loading ? (
          <div className="nx-busy" aria-hidden>
            <span />
          </div>
        ) : null}

        <div className="nx-layout">
          <aside className="nx-rail">
            <p className="nx-label">Directory</p>
            <button
              type="button"
              className={cn("nx-nav", !filtersActive && "is-active")}
              onClick={clearFilters}
            >
              <span className="nx-glyph is-cool">
                <UsersIcon className="size-4" />
              </span>
              All people
              <span className="nx-nav-count">{total}</span>
            </button>

            <p className="nx-label">Scope</p>
            <div className="nx-panel">
              <label className="nx-field">
                Legal employer
                <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                  <option value="">All employers</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id} title={company.legalName}>
                      {company.legalName.length > 28 ? `${company.legalName.slice(0, 26)}…` : company.legalName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="nx-field">
                Client
                <select
                  value={clientCompanyId}
                  onChange={(event) => {
                    setClientCompanyId(event.target.value);
                    if (event.target.value) setAllocation("allocated");
                  }}
                >
                  <option value="">All clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id} title={client.legalName}>
                      {client.legalName.length > 28 ? `${client.legalName.slice(0, 26)}…` : client.legalName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="nx-label">Permit expiry</p>
            <div className="nx-chip-row">
              {(
                [
                  { id: "", label: "Any" },
                  { id: "soon", label: "≤30d" },
                  { id: "expired", label: "Expired" },
                  { id: "missing", label: "No date" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id || "all-expiry"}
                  type="button"
                  className={cn("nx-chip", expiry === item.id && "is-active")}
                  onClick={() => setExpiry(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <p className="nx-label">Allocation</p>
            <div className="nx-chip-row">
              {(
                [
                  { id: "", label: "Any" },
                  { id: "allocated", label: "Allocated" },
                  { id: "unallocated", label: "Unallocated" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id || "all-alloc"}
                  type="button"
                  className={cn("nx-chip", allocation === item.id && "is-active")}
                  onClick={() => {
                    setAllocation(item.id);
                    if (item.id === "unallocated") setClientCompanyId("");
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <p className="nx-label">XPAT</p>
            <div className="nx-chip-row">
              {(
                [
                  { id: "", label: "Any" },
                  { id: "arrived", label: "Arrived" },
                  { id: "departed", label: "Departed" },
                  { id: "pending", label: "Pending" },
                  { id: "valid", label: "Valid" },
                  { id: "invalid", label: "Invalid" },
                  { id: "missing", label: "Not synced" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id || "all-xpat"}
                  type="button"
                  className={cn("nx-chip", xpat === item.id && "is-active")}
                  onClick={() => setXpat(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <p className="nx-label">Extras</p>
            <div className="nx-panel">
              <label className="nx-field">
                Work permit
                <select value={hasWorkPermit} onChange={(event) => setHasWorkPermit(event.target.value as TriFilter)}>
                  <option value="">Any</option>
                  <option value="yes">Has WP#</option>
                  <option value="no">Missing WP#</option>
                </select>
              </label>
              <label className="nx-field">
                Photo
                <select value={hasPhoto} onChange={(event) => setHasPhoto(event.target.value as TriFilter)}>
                  <option value="">Any</option>
                  <option value="yes">Has photo</option>
                  <option value="no">No photo</option>
                </select>
              </label>
              <label className="nx-field">
                Per page
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPage(1);
                    setPageSize(Number(event.target.value));
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
              </label>
              {filtersActive ? (
                <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                  <XIcon />
                  Clear filters ({activeFilterCount})
                </Button>
              ) : null}
            </div>
          </aside>

          <section className="nx-main">
            {editorId !== null ? (
              <EmployeeEditorPanel
                id={editorId === "new" ? null : editorId}
                onClose={() => openEditor(null)}
                onSaved={() => {
                  openEditor(null);
                  void reload();
                }}
              />
            ) : (
              <>
            <div className="nx-toolbar">
              <div className="nx-search">
                <SearchIcon className="nx-search-icon" />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Search name, passport, WP#, designation, client…"
                  aria-label="Search employees"
                />
                {q ? (
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => setQ("")}
                    aria-label="Clear search"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="nx-seg" role="group" aria-label="View mode">
                <button type="button" className={cn(viewMode === "cards" && "is-active")} onClick={() => setView("cards")}>
                  <LayoutGridIcon className="size-3.5" />
                  Cards
                </button>
                <button type="button" className={cn(viewMode === "list" && "is-active")} onClick={() => setView("list")}>
                  <LayoutListIcon className="size-3.5" />
                  List
                </button>
              </div>
            </div>

            <div className="nx-meta">
              <span className="tabular-nums">{rangeLabel}</span>
              <div className="nx-chip-row">
                {employerLabel ? <span className="nx-stat"><Building2Icon className="size-3" />{employerLabel}</span> : null}
                {clientLabel ? <span className="nx-stat"><BriefcaseIcon className="size-3" />{clientLabel}</span> : null}
                {expiry ? <span className="nx-stat">Expiry · {expiry}</span> : null}
                {allocation ? <span className="nx-stat">{allocation}</span> : null}
                {xpat ? <span className="nx-stat">XPAT · {xpat}</span> : null}
              </div>
            </div>

            {loading && !rows ? <PageSkeleton cards={viewMode === "cards" ? 6 : 1} /> : null}

            {rows ? (
              rows.length ? (
                <>
                  {viewMode === "cards" ? (
                    <div className={cn("people-grid", loading && "opacity-60")}>
                      {rows.map((row) => {
                        const tone = expiryTone(row.expiresOn);
                        return (
                          <button
                            key={`card-${row.id}`}
                            type="button"
                            className={cn(
                              "people-card",
                              tone === "urgent" && "is-urgent",
                              tone === "expired" && "is-expired",
                            )}
                            onClick={() => openEditor(row.id)}
                          >
                            <WhenEditing>
                              <div className="people-card-actions">
                                <button
                                  type="button"
                                  title="Sync XPAT"
                                  disabled={syncingId === row.id || !row.workPermitNumber}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void refreshOne(row);
                                  }}
                                >
                                  <RefreshCwIcon className="size-3.5" />
                                </button>
                              </div>
                            </WhenEditing>

                            <div className="people-card-hero">
                              <div className="people-avatar-wrap">
                                <EmployeeAvatar
                                  name={row.legalName}
                                  photoFileId={row.photoFileId}
                                  size="passport-lg"
                                  shape="passport"
                                />
                              </div>
                              <div className="people-card-identity">
                                <p className="people-card-name">{row.legalName}</p>
                                <p className="people-card-role">
                                  {row.designation ?? row.occupation ?? "No designation"}
                                </p>
                                <div className="people-card-badges">
                                  <XpatStatusBadge status={row.xpatStatus} stateName={row.xpatStateName} />
                                </div>
                              </div>
                            </div>

                            <div className="people-card-body">
                              <div className="people-meta-pills">
                                <span className={cn("people-pill", !row.passportNumber && "is-muted")}>
                                  {row.passportNumber ? `PP ${row.passportNumber}` : "No passport"}
                                </span>
                                <span className={cn("people-pill", !row.workPermitNumber && "is-muted")}>
                                  {row.workPermitNumber ? `WP ${row.workPermitNumber}` : "No WP#"}
                                </span>
                                <ExpiryPill expiresOn={row.expiresOn} />
                              </div>
                            </div>

                            <div className="people-card-foot">
                              <div className="people-card-foot-copy">
                                <p>{row.companyName}</p>
                                <p>{row.clientName ? `Client · ${row.clientName}` : "Unallocated"}</p>
                              </div>
                              <span className="people-card-chevron" aria-hidden>
                                <ChevronRightIcon className="size-3.5" />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={cn("people-list", loading && "opacity-60")}>
                      {rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className="people-row"
                          onClick={() => openEditor(row.id)}
                        >
                          <EmployeeAvatar
                            name={row.legalName}
                            photoFileId={row.photoFileId}
                            size="passport"
                            shape="passport"
                          />
                          <div className="people-row-main">
                            <div className="people-row-top">
                              <p className="people-row-name">{row.legalName}</p>
                              <XpatStatusBadge status={row.xpatStatus} stateName={row.xpatStateName} />
                            </div>
                            <p className="people-row-sub">
                              {row.designation ?? row.occupation ?? "No designation"}
                              {" · "}
                              {row.clientName ?? "Unallocated"}
                            </p>
                            <div className="people-meta-pills mt-1 md:hidden">
                              <span className={cn("people-pill", !row.passportNumber && "is-muted")}>
                                {row.passportNumber ? `PP ${row.passportNumber}` : "No PP"}
                              </span>
                              <span className={cn("people-pill", !row.workPermitNumber && "is-muted")}>
                                {row.workPermitNumber ? `WP ${row.workPermitNumber}` : "No WP"}
                              </span>
                              <ExpiryPill expiresOn={row.expiresOn} />
                            </div>
                          </div>
                          <div className="people-row-meta">
                            <div className="people-meta-pills justify-end">
                              <span className={cn("people-pill", !row.passportNumber && "is-muted")}>
                                {row.passportNumber ? `PP ${row.passportNumber}` : "No PP"}
                              </span>
                              <span className={cn("people-pill", !row.workPermitNumber && "is-muted")}>
                                {row.workPermitNumber ? `WP ${row.workPermitNumber}` : "No WP"}
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <ExpiryPill expiresOn={row.expiresOn} />
                              <span className="truncate text-[11px] text-muted-foreground">{row.companyName}</span>
                            </div>
                          </div>
                          <div className="people-row-side">
                            <WhenEditing>
                              <button
                                type="button"
                                className="people-row-action"
                                title="Sync XPAT"
                                disabled={syncingId === row.id || !row.workPermitNumber}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void refreshOne(row);
                                }}
                              >
                                <RefreshCwIcon className="size-3.5" />
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="people-row-action"
                                    aria-label={`Actions for ${row.legalName}`}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <MoreHorizontalIcon className="size-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => openEditor(row.id)}>Open</DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={syncingId === row.id || !row.workPermitNumber}
                                    onClick={() => void refreshOne(row)}
                                  >
                                    <RefreshCwIcon />
                                    Sync from Xpat
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </WhenEditing>
                            <ChevronRightIcon className="people-row-chevron size-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="people-pager">
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {pageCount > 1 ? `Page ${page} of ${pageCount}` : rangeLabel}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page <= 1 || loading}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        <ChevronLeftIcon />
                        Previous
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page >= pageCount || loading}
                        onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                      >
                        Next
                        <ChevronRightIcon />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="nx-empty">
                  <div className="nx-empty-icon">
                    <UsersIcon className="size-6" />
                  </div>
                  <div>
                    <p className="font-medium">{filtersActive ? "No matches" : "No employees yet"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {filtersActive
                        ? "Clear filters or try another search."
                        : "Add an employee or fetch one from XPAT."}
                    </p>
                  </div>
                  {filtersActive ? (
                    <Button type="button" variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <WhenEditing>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={openXpatFetch}>
                          Fetch from XPAT
                        </Button>
                        <QuickCreateMenu label="Add employee" />
                      </div>
                    </WhenEditing>
                  )}
                </div>
              )
            ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      {editorId === null ? (
        <div className="nx-stats">
          <span className="nx-stat tabular-nums">{total} people</span>
          {activeFilterCount ? <span className="nx-stat">{activeFilterCount} filters on</span> : null}
          <span className="nx-stat">
            Page {page}/{Math.max(pageCount, 1)}
          </span>
        </div>
      ) : null}

      <FormDialog
        open={xpatOpen}
        onOpenChange={setXpatOpen}
        title="Fetch from XPAT"
        description="Uses the public egov XPAT verification page. Provide work permit number plus passport or last name."
        pending={xpatPending}
        submitLabel={xpatPreview ? (xpatPreview.existingEmployeeId ? "Update in JACMS" : "Import to JACMS") : "Preview"}
        onSubmit={xpatPreview ? importXpat : previewXpat}
        size="lg"
      >
        <SelectField id="xpatCompanyId" label="Legal employer" value={xpatCompanyId} onChange={setXpatCompanyId}>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.legalName}
            </option>
          ))}
        </SelectField>
        <TextField
          id="xpatWp"
          label="Work permit number"
          value={xpatWp}
          onChange={(value) => {
            setXpatWp(value);
            setXpatPreview(null);
          }}
        />
        <TextField
          id="xpatPassport"
          label="Passport number"
          value={xpatPassport}
          onChange={(value) => {
            setXpatPassport(value);
            setXpatPreview(null);
          }}
          hint="Preferred. Or use last name below."
        />
        <TextField
          id="xpatLastName"
          label="Last name"
          value={xpatLastName}
          onChange={(value) => {
            setXpatLastName(value);
            setXpatPreview(null);
          }}
          hint="Used when passport is blank."
        />
        {xpatPreview ? (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-3">
              {xpatPreview.photoUrl ? (
                <img src={xpatPreview.photoUrl} alt="" className="size-14 rounded-md object-cover" />
              ) : (
                <EmployeeAvatar name={xpatPreview.legalName} size="lg" />
              )}
              <div>
                <p className="font-medium">{xpatPreview.legalName}</p>
                <p className="font-mono text-xs text-muted-foreground">{xpatPreview.workPermitNumber}</p>
              </div>
            </div>
            <p>Passport: {xpatPreview.passportNumber ?? "—"}</p>
            <p>Occupation: {xpatPreview.occupation ?? "—"}</p>
            <p>Employer (XPAT): {xpatPreview.employerName ?? "—"}</p>
            <p>Issued / expiry: {formatDateRange(xpatPreview.issuedOn, xpatPreview.expiresOn)}</p>
            <p className="flex flex-wrap items-center gap-2">
              Status: <XpatStatusBadge status={xpatPreview.xpatStatus} stateName={xpatPreview.xpatStateName} />
            </p>
            <p className="text-muted-foreground">
              {xpatPreview.existingEmployeeId
                ? `Will update existing record (${xpatPreview.existingLegalName})`
                : "Will create a new employee record"}
            </p>
          </div>
        ) : null}
      </FormDialog>
    </Shell>
  );
}

type AllocationSummary = {
  id: string;
  employeeId: string;
  clientName: string;
  employerName: string;
  joinDate: string;
  resignDate: string | null;
  endReason: string | null;
  designation: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  status: string;
};

type XpatSnapshot = {
  companyName: string | null;
  xpatEmployerName: string | null;
  workPermitNumber: string | null;
  passportNumber: string | null;
  legalName: string | null;
  occupation: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  workSite: string | null;
  siteCode: string | null;
  xpatStatus: string | null;
  xpatStateName: string | null;
  xpatSyncedAt: string | null;
};

const blankXpat: XpatSnapshot = {
  companyName: null,
  xpatEmployerName: null,
  workPermitNumber: null,
  passportNumber: null,
  legalName: null,
  occupation: null,
  issuedOn: null,
  expiresOn: null,
  workSite: null,
  siteCode: null,
  xpatStatus: null,
  xpatStateName: null,
  xpatSyncedAt: null,
};

function xpatFromRecord(record: Record<string, string | null | undefined>): XpatSnapshot {
  return {
    companyName: record.companyName ?? null,
    xpatEmployerName: record.xpatEmployerName ?? null,
    workPermitNumber: record.workPermitNumber ?? null,
    passportNumber: record.passportNumber ?? null,
    legalName: record.legalName ?? null,
    occupation: record.occupation ?? null,
    issuedOn: record.issuedOn ?? null,
    expiresOn: record.expiresOn ?? null,
    workSite: record.workSite ?? null,
    siteCode: record.siteCode ?? null,
    xpatStatus: record.xpatStatus ?? null,
    xpatStateName: record.xpatStateName ?? null,
    xpatSyncedAt: record.xpatSyncedAt ?? null,
  };
}

type EditorCategory = "profile" | "passport" | "permit" | "placement" | "rates";

const EDITOR_CATEGORIES: {
  id: EditorCategory;
  label: string;
  hint: string;
  icon: typeof UserRoundIcon;
}[] = [
  { id: "profile", label: "Profile", hint: "Photo, name, contacts", icon: UserRoundIcon },
  { id: "passport", label: "Passport", hint: "Identity documents", icon: IdCardIcon },
  { id: "permit", label: "Work permit", hint: "Dates & compliance", icon: ShieldCheckIcon },
  { id: "placement", label: "Placement", hint: "Employer → slot", icon: FolderTreeIcon },
  { id: "rates", label: "Rates & client", hint: "Designation & pay", icon: WalletIcon },
];

function EmpCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="emp-editor-card">
      <header className="emp-editor-card-head">
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function EmployeeEditorPanel({
  id,
  onClose,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [quotaPools, setQuotaPools] = useState<Option[]>([]);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [allocations, setAllocations] = useState<AllocationSummary[]>([]);
  const [form, setForm] = useState<EmployeeForm>(blank);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [xpat, setXpat] = useState<XpatSnapshot>(blankXpat);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<EditorCategory>("profile");

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setCategory("profile");
    setPhotoFileId(null);
    setXpat(blankXpat);
    setAllocations([]);
    async function load() {
      try {
        if (id) {
          const [data, allocData] = await Promise.all([
            getJson<{
              employee: Record<string, string | null>;
              companies: Company[];
              projects: Option[];
              sites: Option[];
              quotaPools: Option[];
              slots: SlotOption[];
            }>(`/api/v1/employees/${id}`),
            getJson<{ allocations: AllocationSummary[] }>("/api/v1/allocations"),
          ]);
          if (cancelled) return;
          setCompanies(data.companies);
          setProjects(data.projects);
          setSites(data.sites);
          setQuotaPools(data.quotaPools);
          setSlots(data.slots ?? []);
          setForm(fromRecord(data.employee));
          setPhotoFileId(data.employee.photoFileId ?? null);
          setXpat(xpatFromRecord(data.employee));
          setAllocations(allocData.allocations.filter((row) => row.employeeId === id));
        } else {
          const data = await getJson<{
            companies: Company[];
            preferences: { selectedCompanyId: string | null; defaultCompanyId: string | null };
          }>("/api/v1/companies?kind=employer");
          if (cancelled) return;
          setCompanies(data.companies);
          const fromUrl = new URLSearchParams(window.location.search).get("companyId");
          const companyId =
            (fromUrl && data.companies.some((item) => item.id === fromUrl) ? fromUrl : null) ??
            data.preferences.selectedCompanyId ??
            data.preferences.defaultCompanyId ??
            data.companies[0]?.id ??
            "";
          setForm({ ...blank, companyId });
          if (companyId) {
            const options = await getJson<{
              projects: Option[];
              sites: Option[];
              quotaPools: Option[];
              slots: SlotOption[];
            }>(`/api/v1/employees/options?companyId=${companyId}`);
            if (cancelled) return;
            setProjects(options.projects);
            setSites(options.sites);
            setQuotaPools(options.quotaPools);
            setSlots(options.slots ?? []);
          }
        }
        if (!cancelled) setReady(true);
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Could not load employee");
        onClose();
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // intentionally only reload when employee id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filteredSites = useMemo(
    () => sites.filter((site) => !form.projectId || site.projectId === form.projectId),
    [sites, form.projectId],
  );
  const filteredPools = useMemo(
    () => quotaPools.filter((pool) => !form.siteId || pool.siteId === form.siteId),
    [quotaPools, form.siteId],
  );
  const filteredSlots = useMemo(
    () =>
      slots.filter(
        (slot) =>
          (!form.quotaPoolId || slot.quotaPoolId === form.quotaPoolId) &&
          (slot.status === "open" || slot.id === form.slotId || (id != null && slot.employeeId === id)),
      ),
    [slots, form.quotaPoolId, form.slotId, id],
  );
  const activeAllocation = useMemo(() => allocations.find((row) => row.status === "active") ?? null, [allocations]);
  const pastAllocations = useMemo(() => allocations.filter((row) => row.status !== "active"), [allocations]);

  async function onCompanyChange(companyId: string) {
    setForm((current) => ({ ...current, companyId, projectId: "", siteId: "", quotaPoolId: "", slotId: "" }));
    if (!companyId) {
      setProjects([]);
      setSites([]);
      setSlots([]);
      setQuotaPools([]);
      return;
    }
    const options = await getJson<{
      projects: Option[];
      sites: Option[];
      quotaPools: Option[];
      slots: SlotOption[];
    }>(`/api/v1/employees/options?companyId=${companyId}`);
    setProjects(options.projects);
    setSites(options.sites);
    setQuotaPools(options.quotaPools);
    setSlots(options.slots ?? []);
  }

  async function save() {
    setPending(true);
    try {
      await sendJson<{ id: string }>(
        id ? `/api/v1/employees/${id}` : "/api/v1/employees",
        id ? "PATCH" : "POST",
        form,
      );
      toast.success(id ? "Employee updated" : "Employee created");
      onSaved();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save employee");
    } finally {
      setPending(false);
    }
  }

  const categories = EDITOR_CATEGORIES;
  const activeCategory = categories.find((item) => item.id === category) ?? categories[0]!;

  return (
    <div className="emp-editor-inline" aria-describedby="emp-editor-desc">
      <form
        className="emp-editor-shell"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header className="emp-editor-top">
          <div className="emp-editor-top-main">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Back to directory">
              <ChevronLeftIcon />
              Back
            </Button>
            <EmployeeAvatar
              name={form.legalName || "Employee"}
              photoFileId={photoFileId}
              size="default"
              shape="rounded"
              preview
            />
            <div className="min-w-0">
              <h2 className="emp-editor-title">{id ? form.legalName || "Edit employee" : "Add employee"}</h2>
              <p id="emp-editor-desc" className="emp-editor-sub">
                {activeCategory.label} · {activeCategory.hint}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {id ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={`/loas/new?employeeId=${id}`}>Create LOA</a>
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              <XIcon />
              Close
            </Button>
          </div>
        </header>

          <div className="emp-editor-body">
            <nav className="emp-editor-nav" aria-label="Employee categories">
              {categories.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn("emp-editor-nav-btn", category === item.id && "is-active")}
                    onClick={() => setCategory(item.id)}
                  >
                    <span className="emp-editor-nav-icon">
                      <Icon className="size-4" />
                    </span>
                    <span className="emp-editor-nav-copy">
                      <strong>{item.label}</strong>
                      <span>{item.hint}</span>
                    </span>
                    <span className="md:hidden">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="emp-editor-main">
              {!ready ? (
                <div className="grid min-h-48 place-items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  Loading employee…
                </div>
              ) : (
                <div className="emp-editor-panel" key={category}>
                  {category === "profile" ? (
                    <>
                      <section className="emp-profile">
                        <div className="emp-profile-banner" aria-hidden />
                        <div className="emp-profile-body">
                          <div className="emp-profile-photo">
                            <EmployeeAvatar
                              name={xpat.legalName || form.legalName || "Employee"}
                              photoFileId={photoFileId}
                              size="passport-lg"
                              shape="passport"
                              preview
                            />
                          </div>
                          <div className="emp-profile-identity">
                            <h3 className="emp-profile-name">
                              {xpat.legalName || form.legalName || "Employee profile"}
                            </h3>
                            <p className="emp-profile-role">
                              {xpat.occupation || form.occupation || form.designation || "No occupation on file"}
                            </p>
                            <div className="emp-profile-badges">
                              <XpatStatusBadge status={xpat.xpatStatus} stateName={xpat.xpatStateName} />
                              {xpat.workPermitNumber || form.workPermitNumber ? (
                                <span className="emp-profile-pill is-mono">
                                  WP {xpat.workPermitNumber || form.workPermitNumber}
                                </span>
                              ) : (
                                <span className="emp-profile-pill is-soft">No WP#</span>
                              )}
                              {xpat.passportNumber || form.passportNumber ? (
                                <span className="emp-profile-pill is-mono">
                                  PP {xpat.passportNumber || form.passportNumber}
                                </span>
                              ) : null}
                              <span className="emp-profile-pill is-soft">
                                {xpat.xpatSyncedAt ? `Synced ${formatDateTime(xpat.xpatSyncedAt)}` : "Not synced"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {id ? (
                          <div className="emp-profile-facts">
                            <div className="emp-profile-fact">
                              <span>XPAT employer</span>
                              <strong title={xpat.xpatEmployerName ?? undefined}>{xpat.xpatEmployerName ?? "—"}</strong>
                            </div>
                            <div className="emp-profile-fact">
                              <span>Legal employer</span>
                              <strong title={xpat.companyName ?? undefined}>{xpat.companyName ?? "—"}</strong>
                            </div>
                            <div className="emp-profile-fact">
                              <span>Work site</span>
                              <strong
                                title={
                                  xpat.workSite || xpat.siteCode
                                    ? [xpat.workSite, xpat.siteCode].filter(Boolean).join(" · ")
                                    : undefined
                                }
                              >
                                {xpat.workSite || xpat.siteCode
                                  ? [xpat.workSite, xpat.siteCode].filter(Boolean).join(" · ")
                                  : "—"}
                              </strong>
                            </div>
                            <div className="emp-profile-fact">
                              <span>Permit issued</span>
                              <strong>{xpat.issuedOn ? formatDate(xpat.issuedOn) : "—"}</strong>
                            </div>
                            <div className="emp-profile-fact">
                              <span>Permit expiry</span>
                              <strong>{xpat.expiresOn ? formatDate(xpat.expiresOn) : "—"}</strong>
                            </div>
                            <div className="emp-profile-fact">
                              <span>Validity</span>
                              <strong>
                                {xpat.issuedOn || xpat.expiresOn
                                  ? formatDateRange(xpat.issuedOn, xpat.expiresOn)
                                  : "—"}
                              </strong>
                            </div>
                          </div>
                        ) : (
                          <p className="emp-profile-empty">
                            Save the employee, then sync from XPAT to fill this profile.
                          </p>
                        )}
                        {id && !xpat.xpatSyncedAt && !xpat.workPermitNumber ? (
                          <p className="emp-profile-empty" style={{ paddingTop: 0 }}>
                            No XPAT data yet — fetch from the directory list or sync with a work permit number.
                          </p>
                        ) : null}
                      </section>

                      <EmpCard title="Basic details" description="Name, role, and employment status.">
                        <div className="emp-editor-fields is-wide">
                          <TextField
                            id="legalName"
                            label="Full name"
                            value={form.legalName}
                            onChange={(value) => setForm((c) => ({ ...c, legalName: value }))}
                          />
                          <TextField
                            id="preferredName"
                            label="Preferred name"
                            value={form.preferredName}
                            onChange={(value) => setForm((c) => ({ ...c, preferredName: value }))}
                          />
                          <TextField
                            id="occupation"
                            label="Position"
                            value={form.occupation}
                            onChange={(value) => setForm((c) => ({ ...c, occupation: value }))}
                          />
                          <TextField
                            id="employmentStatus"
                            label="Employment status"
                            value={form.employmentStatus}
                            onChange={(value) => setForm((c) => ({ ...c, employmentStatus: value }))}
                          />
                        </div>
                      </EmpCard>

                      <EmpCard title="Contacts & terms" description="Address, emergency contact, and contract basics.">
                        <div className="emp-editor-fields">
                          <div className="emp-editor-span">
                            <AreaField
                              id="permanentAddress"
                              label="Permanent address"
                              value={form.permanentAddress}
                              onChange={(value) => setForm((c) => ({ ...c, permanentAddress: value }))}
                            />
                          </div>
                          <div className="emp-editor-span">
                            <AreaField
                              id="emergencyContact"
                              label="Emergency contact"
                              value={form.emergencyContact}
                              onChange={(value) => setForm((c) => ({ ...c, emergencyContact: value }))}
                            />
                          </div>
                          <TextField
                            id="benefits"
                            label="Benefits"
                            value={form.benefits}
                            onChange={(value) => setForm((c) => ({ ...c, benefits: value }))}
                          />
                          <TextField
                            id="paidVacation"
                            label="Paid vacation"
                            value={form.paidVacation}
                            onChange={(value) => setForm((c) => ({ ...c, paidVacation: value }))}
                          />
                          <TextField
                            id="workingHours"
                            label="Working hours"
                            value={form.workingHours}
                            onChange={(value) => setForm((c) => ({ ...c, workingHours: value }))}
                          />
                          <TextField
                            id="contractDuration"
                            label="Contract duration"
                            value={form.contractDuration}
                            onChange={(value) => setForm((c) => ({ ...c, contractDuration: value }))}
                          />
                        </div>
                      </EmpCard>

                      {id ? <EmployeeSelfServiceAccountCard employeeId={id} /> : null}
                    </>
                  ) : null}

                  {category === "passport" ? (
                    <EmpCard title="Passport & identity" description="Document details used across HR and XPAT.">
                      <div className="emp-editor-fields is-wide">
                        <TextField
                          id="passportNumber"
                          label="Passport number"
                          value={form.passportNumber}
                          onChange={(value) => setForm((c) => ({ ...c, passportNumber: value }))}
                        />
                        <TextField
                          id="nationality"
                          label="Nationality"
                          value={form.nationality}
                          onChange={(value) => setForm((c) => ({ ...c, nationality: value }))}
                        />
                        <TextField
                          id="dateOfBirth"
                          label="Date of birth"
                          type="date"
                          value={form.dateOfBirth}
                          onChange={(value) => setForm((c) => ({ ...c, dateOfBirth: value }))}
                        />
                        <TextField
                          id="gender"
                          label="Gender"
                          value={form.gender}
                          onChange={(value) => setForm((c) => ({ ...c, gender: value }))}
                        />
                        <TextField
                          id="passportIssueDate"
                          label="Passport issue date"
                          type="date"
                          value={form.passportIssueDate}
                          onChange={(value) => setForm((c) => ({ ...c, passportIssueDate: value }))}
                        />
                        <TextField
                          id="passportExpiry"
                          label="Passport expiry"
                          type="date"
                          value={form.passportExpiry}
                          onChange={(value) => setForm((c) => ({ ...c, passportExpiry: value }))}
                        />
                      </div>
                    </EmpCard>
                  ) : null}

                  {category === "permit" ? (
                    <>
                      <EmpCard title="Work permit" description="Primary permit number and validity window.">
                        <div className="emp-editor-fields is-wide">
                          <TextField
                            id="workPermitNumber"
                            label="Work permit number"
                            value={form.workPermitNumber}
                            onChange={(value) => setForm((c) => ({ ...c, workPermitNumber: value }))}
                            hint="Used for XPAT sync"
                          />
                          <TextField
                            id="issuedOn"
                            label="Work permit issued"
                            type="date"
                            value={form.issuedOn}
                            onChange={(value) => setForm((c) => ({ ...c, issuedOn: value }))}
                          />
                          <TextField
                            id="expiresOn"
                            label="Work permit expiry"
                            type="date"
                            value={form.expiresOn}
                            onChange={(value) => setForm((c) => ({ ...c, expiresOn: value }))}
                          />
                        </div>
                      </EmpCard>
                      <EmpCard title="Compliance dates" description="Visa, medical, insurance, and related fields.">
                        <div className="emp-editor-fields is-wide">
                          <TextField
                            id="feePaidUntil"
                            label="Fee paid until"
                            type="date"
                            value={form.feePaidUntil}
                            onChange={(value) => setForm((c) => ({ ...c, feePaidUntil: value }))}
                          />
                          <TextField
                            id="medicalExpiry"
                            label="Medical expiry"
                            type="date"
                            value={form.medicalExpiry}
                            onChange={(value) => setForm((c) => ({ ...c, medicalExpiry: value }))}
                          />
                          <TextField
                            id="insuranceExpiry"
                            label="Insurance expiry"
                            type="date"
                            value={form.insuranceExpiry}
                            onChange={(value) => setForm((c) => ({ ...c, insuranceExpiry: value }))}
                          />
                          <TextField
                            id="arrivalDate"
                            label="Arrival date"
                            type="date"
                            value={form.arrivalDate}
                            onChange={(value) => setForm((c) => ({ ...c, arrivalDate: value }))}
                          />
                          <TextField
                            id="workVisaNumber"
                            label="Work visa number"
                            value={form.workVisaNumber}
                            onChange={(value) => setForm((c) => ({ ...c, workVisaNumber: value }))}
                          />
                          <TextField
                            id="workVisaExpiry"
                            label="Work visa expiry"
                            type="date"
                            value={form.workVisaExpiry}
                            onChange={(value) => setForm((c) => ({ ...c, workVisaExpiry: value }))}
                          />
                          <TextField
                            id="contractExpiry"
                            label="Contract expiry"
                            type="date"
                            value={form.contractExpiry}
                            onChange={(value) => setForm((c) => ({ ...c, contractExpiry: value }))}
                          />
                          <TextField
                            id="country"
                            label="Country"
                            value={form.country}
                            onChange={(value) => setForm((c) => ({ ...c, country: value }))}
                          />
                          <TextField
                            id="origin"
                            label="Origin"
                            value={form.origin}
                            onChange={(value) => setForm((c) => ({ ...c, origin: value }))}
                          />
                        </div>
                      </EmpCard>
                    </>
                  ) : null}

                  {category === "placement" ? (
                    <EmpCard
                      title="Legal employer placement"
                      description="Employer → project → site → quota pool → slot."
                    >
                      <div className="emp-editor-fields is-wide">
                        <SelectField
                          id="companyId"
                          label="Legal employer"
                          value={form.companyId}
                          onChange={(value) => void onCompanyChange(value)}
                        >
                          <option value="">Select legal employer</option>
                          {companies.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.legalName}
                            </option>
                          ))}
                        </SelectField>
                        <TextField
                          id="salary"
                          label="Basic salary (docs)"
                          value={form.salary}
                          onChange={(value) => setForm((c) => ({ ...c, salary: value }))}
                          hint="Document field only — payroll uses Rates"
                        />
                        <SelectField
                          id="projectId"
                          label="Project"
                          value={form.projectId}
                          onChange={(value) =>
                            setForm((c) => ({ ...c, projectId: value, siteId: "", quotaPoolId: "", slotId: "" }))
                          }
                        >
                          <option value="">None</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </SelectField>
                        <SelectField
                          id="siteId"
                          label="Site"
                          value={form.siteId}
                          onChange={(value) =>
                            setForm((c) => ({ ...c, siteId: value, quotaPoolId: "", slotId: "" }))
                          }
                        >
                          <option value="">None</option>
                          {filteredSites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name}
                            </option>
                          ))}
                        </SelectField>
                        <SelectField
                          id="quotaPoolId"
                          label="Quota pool"
                          value={form.quotaPoolId}
                          onChange={(value) => setForm((c) => ({ ...c, quotaPoolId: value, slotId: "" }))}
                        >
                          <option value="">None</option>
                          {filteredPools.map((pool) => (
                            <option key={pool.id} value={pool.id}>
                              {pool.name}
                            </option>
                          ))}
                        </SelectField>
                        <SelectField
                          id="slotId"
                          label="Quota slot"
                          value={form.slotId}
                          onChange={(value) => setForm((c) => ({ ...c, slotId: value }))}
                        >
                          <option value="">Auto / none</option>
                          {filteredSlots.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              Slot {slot.slotNumber ?? "—"}
                              {slot.status === "open" ? "" : " (current)"}
                            </option>
                          ))}
                        </SelectField>
                        <TextField
                          id="siteCode"
                          label="Site ID"
                          value={form.siteCode}
                          onChange={(value) => setForm((c) => ({ ...c, siteCode: value }))}
                        />
                        <div className="emp-editor-span">
                          <TextField
                            id="workSite"
                            label="Work site (document text)"
                            value={form.workSite}
                            onChange={(value) => setForm((c) => ({ ...c, workSite: value }))}
                          />
                        </div>
                      </div>
                    </EmpCard>
                  ) : null}

                  {category === "rates" ? (
                    <>
                      <EmpCard
                        title="Designation & monthly rates"
                        description="Used for payroll (daily = monthly ÷ days in month)."
                      >
                        <div className="emp-editor-fields is-wide">
                          <DesignationField
                            id="designation"
                            value={form.designation}
                            onChange={(value) => setForm((c) => ({ ...c, designation: value }))}
                            hint="Pick from the office catalog"
                          />
                          <TextField
                            id="staffDayRate"
                            label="Staff monthly salary (MVR)"
                            value={form.staffDayRate}
                            onChange={(value) => setForm((c) => ({ ...c, staffDayRate: value }))}
                            hint="e.g. 5500"
                          />
                          <TextField
                            id="billDayRate"
                            label="Client monthly bill (MVR)"
                            value={form.billDayRate}
                            onChange={(value) => setForm((c) => ({ ...c, billDayRate: value }))}
                            hint="e.g. 6000"
                          />
                        </div>
                      </EmpCard>
                      <EmpCard title="Client allocation" description="Active assignment and past clients.">
                        {id ? (
                          <div className="grid gap-3">
                            {activeAllocation ? (
                              <div className="grid gap-1 rounded-xl border bg-muted/20 p-3 text-sm">
                                <p className="font-medium">Active client · {activeAllocation.clientName}</p>
                                <p className="text-xs text-muted-foreground">
                                  Started {formatDate(activeAllocation.joinDate)}
                                  {activeAllocation.designation ? ` · ${activeAllocation.designation}` : ""}
                                  {" · "}
                                  {formatMoneyPair(
                                    activeAllocation.staffSalary,
                                    activeAllocation.billRate,
                                    activeAllocation.currency,
                                  )}
                                  /mo
                                </p>
                                <div className="pt-1">
                                  <Button type="button" size="sm" variant="outline" asChild>
                                    <a href="/allocations">Manage on Allocations</a>
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="grid gap-1 rounded-xl border border-dashed bg-muted/15 p-3 text-sm">
                                <p className="font-medium">No active client allocation</p>
                                <p className="text-xs text-muted-foreground">
                                  Save rates here, then allocate this worker on Allocations.
                                </p>
                                <div className="pt-1">
                                  <Button type="button" size="sm" variant="outline" asChild>
                                    <a href="/allocations">Allocate to client</a>
                                  </Button>
                                </div>
                              </div>
                            )}
                            {pastAllocations.length ? (
                              <div>
                                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Past clients
                                </p>
                                <ul className="grid gap-1.5 text-xs text-muted-foreground">
                                  {pastAllocations.map((row) => (
                                    <li key={row.id}>
                                      {row.clientName} ·{" "}
                                      {row.resignDate
                                        ? formatDateRange(row.joinDate, row.resignDate)
                                        : formatDate(row.joinDate)}
                                      {row.endReason ? ` (${row.endReason})` : ""}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Create the employee first, then assign a client on Allocations.
                          </p>
                        )}
                      </EmpCard>
                    </>
                  ) : null}

                </div>
              )}
            </div>
          </div>

          <footer className="emp-editor-foot">
            <div className="emp-editor-foot-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!ready || categories.findIndex((item) => item.id === category) <= 0}
                onClick={() => {
                  const index = categories.findIndex((item) => item.id === category);
                  if (index > 0) setCategory(categories[index - 1]!.id);
                }}
              >
                <ChevronLeftIcon />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  !ready || categories.findIndex((item) => item.id === category) >= categories.length - 1
                }
                onClick={() => {
                  const index = categories.findIndex((item) => item.id === category);
                  if (index < categories.length - 1) setCategory(categories[index + 1]!.id);
                }}
              >
                Next
                <ChevronRightIcon />
              </Button>
            </div>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !ready}>
              {pending ? <Spinner /> : null}
              {id ? "Save changes" : "Create employee"}
            </Button>
          </footer>
        </form>
    </div>
  );
}

function EmployeeSelfServiceAccountCard({ employeeId }: { employeeId: string }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      await sendJson(`/api/v1/employees/${employeeId}/self-service-account`, "POST", { phone, password });
      setNotice("Self-service login saved. Employee must change password on first sign-in.");
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save login");
    } finally {
      setPending(false);
    }
  }

  return (
    <EmpCard
      title="Employee self-service login"
      description="Phone + admin-set password. Staff use the Employee tab on the sign-in page."
    >
      <Banner message={error} error />
      <Banner message={notice} />
      <div className="emp-editor-fields is-wide">
        <TextField id="essPhone" label="Phone number" value={phone} onChange={setPhone} />
        <TextField id="essPassword" label="Password (min 8)" type="password" value={password} onChange={setPassword} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={pending || !phone || password.length < 8} onClick={() => void save()}>
          {pending ? <Spinner /> : null}
          Save login
        </Button>
      </div>
    </EmpCard>
  );
}

/** Deep-link compatibility: /employees/:id and /employees/new open the list with a dialog. */
export function EmployeeFormPage({ id }: { id: string | null }) {
  useEffect(() => {
    const target = id ? `/employees?edit=${id}` : "/employees?new=1";
    window.history.replaceState({}, "", target);
    window.dispatchEvent(new Event("jacms:navigate"));
  }, [id]);
  return null;
}
