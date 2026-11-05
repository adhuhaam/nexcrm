import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  CopyIcon,
  LockIcon,
  PlusIcon,
  SaveIcon,
  TimerIcon,
  Trash2Icon,
  UnlockIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaField, SelectField, TextField } from "@/components/field";
import { FormDialog, FormDialogWide } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson, sendJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type AttendanceStatus = "P" | "AB" | "OD";
type DayValue = "" | "P" | "AB" | "OD";

type Attendance = {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string | null;
};

type Totals = { P: number; AB: number; OD: number; all: number };

function statusLabel(status: AttendanceStatus): string {
  if (status === "P") return "P · Present";
  if (status === "AB") return "AB · Absent";
  return "OD · Off day";
}

type EmployeeOption = {
  id: string;
  legalName: string;
  companyId: string;
  companyName: string;
};

type Company = { id: string; legalName: string };
type Project = { id: string; name: string; companyId?: string };

type AllocationLink = {
  employeeId: string;
  employerCompanyId: string;
  clientCompanyId: string;
  clientName: string;
  joinDate: string;
  resignDate: string | null;
};

type MonthRow = {
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  days: Record<string, DayValue>;
  present: number;
  absent: number;
  offDay: number;
};

type OtRate = {
  id: string;
  scope: "company" | "project" | "client";
  companyId: string | null;
  companyName: string | null;
  projectId: string | null;
  projectName: string | null;
  clientCompanyId: string | null;
  clientName: string | null;
  hourlyRate: string;
  currency: string;
  label: string | null;
};

type OtEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  hours: string;
  companyName: string | null;
  projectName: string | null;
  clientName: string | null;
  hourlyRate: string;
  currency: string;
  amount: string;
  note: string | null;
};

type Draft = {
  id: string | null;
  employeeId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function emptyDraft(): Draft {
  return { id: null, employeeId: "", attendanceDate: today(), status: "P", note: "" };
}

function targetLabel(rate: OtRate): string {
  if (rate.scope === "client") return rate.clientName ?? "Client";
  if (rate.scope === "project") return rate.projectName ?? "Project";
  return rate.companyName ?? "Company";
}

function monthTitle(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function weekdayShort(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day).toLocaleString(undefined, { weekday: "narrow" });
}

/** Maldives weekend: Friday + Saturday. */
function isWeekend(year: number, month: number, day: number): boolean {
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 5 || weekday === 6;
}

function cycleDay(value: DayValue): DayValue {
  if (value === "") return "P";
  if (value === "P") return "AB";
  if (value === "AB") return "OD";
  return "";
}

function dayCellLabel(value: DayValue): string {
  if (value === "P") return "P";
  if (value === "AB") return "AB";
  if (value === "OD") return "OD";
  return "·";
}

function monthBoundsIso(year: number, month: number): { from: string; to: string } {
  const dim = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(dim).padStart(2, "0")}`,
  };
}

function allocationOverlapsMonth(row: AllocationLink, year: number, month: number): boolean {
  const { from, to } = monthBoundsIso(year, month);
  if (row.joinDate > to) return false;
  if (row.resignDate && row.resignDate < from) return false;
  return true;
}

const MONTH_SHEET_PREFS_KEY = "nexcrm.attendance.monthSheet";

type MonthSheetPrefs = {
  year: number;
  month: number;
  companyId: string;
  clientId: string;
  q: string;
  locked: boolean;
  tab: string;
};

function readStoredMonthPrefs(): Partial<MonthSheetPrefs> {
  try {
    const raw = localStorage.getItem(MONTH_SHEET_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<MonthSheetPrefs>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readInitialMonthPrefs(): MonthSheetPrefs {
  const now = currentYearMonth();
  const stored = readStoredMonthPrefs();
  const url = new URLSearchParams(window.location.search);
  const year = Number(url.get("year") || stored.year || now.year);
  const month = Number(url.get("month") || stored.month || now.month);
  const lockedRaw = url.get("lock") ?? (stored.locked ? "1" : "0");
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : now.year,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.month,
    companyId: url.get("employer") || stored.companyId || "",
    clientId: url.get("client") || stored.clientId || "",
    q: url.get("q") || stored.q || "",
    locked: lockedRaw === "1" || lockedRaw === "true",
    tab: url.get("tab") || stored.tab || "month",
  };
}

function syncMonthSheetLocation(prefs: MonthSheetPrefs): void {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", prefs.tab);
  url.searchParams.set("year", String(prefs.year));
  url.searchParams.set("month", String(prefs.month));
  if (prefs.companyId) url.searchParams.set("employer", prefs.companyId);
  else url.searchParams.delete("employer");
  if (prefs.clientId) url.searchParams.set("client", prefs.clientId);
  else url.searchParams.delete("client");
  if (prefs.q.trim()) url.searchParams.set("q", prefs.q.trim());
  else url.searchParams.delete("q");
  if (prefs.locked) url.searchParams.set("lock", "1");
  else url.searchParams.delete("lock");
  const next = `${url.pathname}${url.search}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) window.history.replaceState({}, "", next);
  try {
    localStorage.setItem(MONTH_SHEET_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

export function AttendancePage() {
  const prefs = readInitialMonthPrefs();
  const [tab, setTab] = useState(prefs.tab);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<AllocationLink[]>([]);

  // Month sheet
  const [year, setYear] = useState(prefs.year);
  const [month, setMonth] = useState(prefs.month);
  const [monthCompanyId, setMonthCompanyId] = useState(prefs.companyId);
  const [monthClientId, setMonthClientId] = useState(prefs.clientId);
  const [monthQ, setMonthQ] = useState(prefs.q);
  const [filtersLocked, setFiltersLocked] = useState(prefs.locked);
  const debouncedMonthQ = useDebouncedValue(monthQ);
  const [monthRows, setMonthRows] = useState<MonthRow[] | null>(null);
  const monthRowsRef = useRef<MonthRow[] | null>(null);
  const draftDaysRef = useRef<Record<string, Record<string, DayValue>>>({});
  const [daysInMonth, setDaysInMonth] = useState(31);
  const [draftDays, setDraftDays] = useState<Record<string, Record<string, DayValue>>>({});
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);
  monthRowsRef.current = monthRows;
  draftDaysRef.current = draftDays;
  const [fillDay, setFillDay] = useState("1");
  const [fillStatus, setFillStatus] = useState<AttendanceStatus>("P");
  const [bulkOpen, setBulkOpen] = useState(false);

  // Log
  const [records, setRecords] = useState<Attendance[] | null>(null);
  const [totals, setTotals] = useState<Totals>({ P: 0, AB: 0, OD: 0, all: 0 });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"" | AttendanceStatus>("");
  const [companyId, setCompanyId] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  // OT
  const [otRates, setOtRates] = useState<OtRate[]>([]);
  const [otEntries, setOtEntries] = useState<OtEntry[]>([]);
  const [otTotals, setOtTotals] = useState({ totalHours: "0.00", totalAmount: "0.00" });
  const [rateOpen, setRateOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState({
    scope: "company" as "company" | "project" | "client",
    companyId: "",
    projectId: "",
    clientCompanyId: "",
    hourlyRate: "",
    currency: "MVR",
    label: "",
  });
  const [entryDraft, setEntryDraft] = useState({
    employeeId: "",
    workDate: today(),
    hours: "",
    companyId: "",
    projectId: "",
    clientCompanyId: "",
    hourlyRate: "",
    note: "",
  });
  const [resolvedPreview, setResolvedPreview] = useState<{ hourlyRate: string; currency: string; source: string } | null>(
    null,
  );

  useEffect(() => {
    getJson<{ employees: EmployeeOption[] }>("/api/v1/employees")
      .then((data) => setEmployees(data.employees))
      .catch(() => undefined);
    getJson<{ companies: Company[] }>("/api/v1/companies?kind=employer")
      .then((data) => setCompanies(data.companies))
      .catch(() => undefined);
    getJson<{ companies?: Company[]; clients?: Company[] }>("/api/v1/clients")
      .then((data) => setClients(data.clients ?? data.companies ?? []))
      .catch(() => undefined);
    getJson<{ projects: Project[] }>("/api/v1/projects")
      .then((data) => setProjects(data.projects))
      .catch(() => undefined);
    getJson<{
      allocations: Array<{
        employeeId: string;
        employerCompanyId: string;
        clientCompanyId: string;
        clientName: string;
        joinDate: string;
        resignDate: string | null;
      }>;
    }>("/api/v1/allocations")
      .then((data) =>
        setAllocations(
          data.allocations.map((row) => ({
            employeeId: row.employeeId,
            employerCompanyId: row.employerCompanyId,
            clientCompanyId: row.clientCompanyId,
            clientName: row.clientName,
            joinDate: row.joinDate,
            resignDate: row.resignDate,
          })),
        ),
      )
      .catch(() => undefined);
  }, []);

  function reloadMonth() {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (monthCompanyId) params.set("companyId", monthCompanyId);
    if (monthClientId) params.set("clientCompanyId", monthClientId);
    if (debouncedMonthQ.trim()) params.set("q", debouncedMonthQ.trim());
    getJson<{ year: number; month: number; daysInMonth: number; rows: MonthRow[] }>(
      `/api/v1/attendance/month?${params}`,
    )
      .then((data) => {
        const prevById = new Map((monthRowsRef.current ?? []).map((row) => [row.employeeId, row]));
        const currentDrafts = draftDaysRef.current;
        const nextDrafts: Record<string, Record<string, DayValue>> = {};
        for (const row of data.rows) {
          const prev = prevById.get(row.employeeId);
          const draft = currentDrafts[row.employeeId];
          let keepDraft = false;
          if (prev && draft) {
            for (let day = 1; day <= data.daysInMonth; day++) {
              const key = String(day);
              if ((draft[key] ?? "") !== (prev.days[key] ?? "")) {
                keepDraft = true;
                break;
              }
            }
          }
          nextDrafts[row.employeeId] = keepDraft && draft ? { ...draft } : { ...row.days };
        }
        setDaysInMonth(data.daysInMonth);
        setMonthRows(data.rows);
        setDraftDays(nextDrafts);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load month sheet"));
  }

  function reloadLog() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);
    if (companyId) params.set("companyId", companyId);
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    const query = params.toString() ? `?${params}` : "";
    getJson<{ records: Attendance[]; totals: Totals }>(`/api/v1/attendance${query}`)
      .then((data) => {
        setRecords(data.records);
        setTotals(data.totals);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load attendance"));
  }

  function reloadOt() {
    getJson<{ rates: OtRate[] }>("/api/v1/ot/rates")
      .then((data) => setOtRates(data.rates))
      .catch(() => undefined);
    getJson<{ entries: OtEntry[]; totalHours: string; totalAmount: string }>("/api/v1/ot/entries")
      .then((data) => {
        setOtEntries(data.entries);
        setOtTotals({ totalHours: data.totalHours, totalAmount: data.totalAmount });
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load OT"));
  }

  useEffect(() => {
    syncMonthSheetLocation({
      year,
      month,
      companyId: monthCompanyId,
      clientId: monthClientId,
      q: debouncedMonthQ,
      locked: filtersLocked,
      tab,
    });
  }, [year, month, monthCompanyId, monthClientId, debouncedMonthQ, filtersLocked, tab]);

  useEffect(() => {
    if (tab === "month") reloadMonth();
  }, [tab, year, month, monthCompanyId, monthClientId, debouncedMonthQ]);

  useEffect(() => {
    if (tab === "log") reloadLog();
  }, [tab, from, to, status, companyId, debouncedQ]);

  useEffect(() => {
    if (tab === "ot") reloadOt();
  }, [tab]);

  useEffect(() => {
    if (!entryOpen) return;
    const employee = employees.find((item) => item.id === entryDraft.employeeId);
    const company = entryDraft.companyId || employee?.companyId || "";
    const params = new URLSearchParams();
    if (company) params.set("companyId", company);
    if (entryDraft.projectId) params.set("projectId", entryDraft.projectId);
    if (entryDraft.clientCompanyId) params.set("clientCompanyId", entryDraft.clientCompanyId);
    getJson<{ hourlyRate: string; currency: string; source: string }>(`/api/v1/ot/resolve?${params}`)
      .then(setResolvedPreview)
      .catch(() => setResolvedPreview(null));
  }, [entryOpen, entryDraft.employeeId, entryDraft.companyId, entryDraft.projectId, entryDraft.clientCompanyId, employees]);

  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear();
    const start = Math.min(nowY - 8, year - 2);
    const end = Math.max(nowY + 2, year + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [year]);

  function setDay(employeeId: string, day: number, value: DayValue) {
    setDraftDays((current) => ({
      ...current,
      [employeeId]: { ...(current[employeeId] ?? {}), [String(day)]: value },
    }));
  }

  function rowDirty(row: MonthRow): boolean {
    const draft = draftDays[row.employeeId] ?? {};
    for (const day of dayNumbers) {
      const key = String(day);
      if ((draft[key] ?? "") !== (row.days[key] ?? "")) return true;
    }
    return false;
  }

  const linkedEmployeeIds = useMemo(() => {
    if (!monthClientId && !monthCompanyId) return null;
    const ids = new Set<string>();
    for (const row of allocations) {
      if (monthClientId && row.clientCompanyId !== monthClientId) continue;
      if (monthCompanyId && row.employerCompanyId !== monthCompanyId) continue;
      if (!allocationOverlapsMonth(row, year, month)) continue;
      ids.add(row.employeeId);
    }
    return ids;
  }, [allocations, monthClientId, monthCompanyId, year, month]);

  const clientNamesByEmployee = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of allocations) {
      if (monthClientId && row.clientCompanyId !== monthClientId) continue;
      if (monthCompanyId && row.employerCompanyId !== monthCompanyId) continue;
      if (!allocationOverlapsMonth(row, year, month)) continue;
      const name = row.clientName?.trim();
      if (!name) continue;
      const existing = map.get(row.employeeId) ?? [];
      if (!existing.includes(name)) existing.push(name);
      map.set(row.employeeId, existing);
    }
    return map;
  }, [allocations, monthClientId, monthCompanyId, year, month]);

  const visibleMonthRows = useMemo(() => {
    if (!monthRows) return null;
    if (!linkedEmployeeIds) return monthRows;
    return monthRows.filter((row) => linkedEmployeeIds.has(row.employeeId));
  }, [monthRows, linkedEmployeeIds]);

  const monthSheetStats = useMemo(() => {
    if (!visibleMonthRows) return null;
    let present = 0;
    let absent = 0;
    let offDay = 0;
    let dirty = 0;
    for (const row of visibleMonthRows) {
      const days = draftDays[row.employeeId] ?? row.days;
      let changed = false;
      for (const day of dayNumbers) {
        const key = String(day);
        const value = days[key] ?? "";
        if (value === "P") present += 1;
        else if (value === "AB") absent += 1;
        else if (value === "OD") offDay += 1;
        if (value !== (row.days[key] ?? "")) changed = true;
      }
      if (changed) dirty += 1;
    }
    return { employees: visibleMonthRows.length, present, absent, offDay, dirty };
  }, [visibleMonthRows, draftDays, dayNumbers]);

  function monthHasUnsaved(): boolean {
    if (!visibleMonthRows?.length) return false;
    for (const row of visibleMonthRows) {
      const draft = draftDays[row.employeeId] ?? {};
      for (const day of dayNumbers) {
        const key = String(day);
        if ((draft[key] ?? "") !== (row.days[key] ?? "")) return true;
      }
    }
    return false;
  }

  function confirmLeaveUnsaved(): boolean {
    if (!monthHasUnsaved()) return true;
    return window.confirm("You have unsaved attendance marks. Change filters and discard those edits?");
  }

  function changePeriod(nextYear: number, nextMonth: number) {
    if (filtersLocked) {
      toast.message("Filters are locked", { description: "Unlock to change month or year." });
      return;
    }
    if (nextYear === year && nextMonth === month) return;
    if (!confirmLeaveUnsaved()) return;
    setYear(nextYear);
    setMonth(nextMonth);
  }

  function changeMonthCompany(value: string) {
    if (filtersLocked) {
      toast.message("Filters are locked", { description: "Unlock to change employer." });
      return;
    }
    if (value === monthCompanyId) return;
    if (!confirmLeaveUnsaved()) return;
    setMonthCompanyId(value);
  }

  function changeMonthClient(value: string) {
    if (filtersLocked) {
      toast.message("Filters are locked", { description: "Unlock to change client." });
      return;
    }
    if (value === monthClientId) return;
    if (!confirmLeaveUnsaved()) return;
    setMonthClientId(value);
  }

  function changeMonthSearch(value: string) {
    if (filtersLocked) return;
    setMonthQ(value);
  }

  function goThisMonth() {
    const now = currentYearMonth();
    changePeriod(now.year, now.month);
  }

  function toggleFiltersLocked() {
    setFiltersLocked((current) => {
      const next = !current;
      toast.success(next ? "Filters locked for this session" : "Filters unlocked");
      return next;
    });
  }

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    const nextYear = date.getFullYear();
    if (nextYear < 2000 || nextYear > 2100) return;
    changePeriod(nextYear, date.getMonth() + 1);
  }

  function applyLocalDays(mutator: (days: Record<string, DayValue>, employeeId: string) => Record<string, DayValue>) {
    if (!visibleMonthRows?.length) return;
    setDraftDays((current) => {
      const next = { ...current };
      for (const row of visibleMonthRows) {
        const base = { ...(next[row.employeeId] ?? row.days) };
        next[row.employeeId] = mutator(base, row.employeeId);
      }
      return next;
    });
  }

  function fillColumn() {
    const day = Number(fillDay);
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth) {
      toast.error("Pick a valid day");
      return;
    }
    applyLocalDays((days) => ({ ...days, [String(day)]: fillStatus }));
    toast.success(`Filled day ${day} as ${fillStatus}`);
  }

  async function fillColumnAndSave() {
    const day = Number(fillDay);
    if (!visibleMonthRows?.length) return;
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth) {
      toast.error("Pick a valid day");
      return;
    }
    const attendanceDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setPending(true);
    try {
      await sendJson("/api/v1/attendance/day", "POST", {
        attendanceDate,
        status: fillStatus,
        employeeIds: visibleMonthRows.map((row) => row.employeeId),
      });
      toast.success(`Saved day ${day} as ${fillStatus} for ${visibleMonthRows.length} employees`);
      reloadMonth();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not fill day");
    } finally {
      setPending(false);
    }
  }

  function fillWeekendsOd() {
    applyLocalDays((days) => {
      const next = { ...days };
      for (let day = 1; day <= daysInMonth; day++) {
        if (isWeekend(year, month, day)) next[String(day)] = "OD";
      }
      return next;
    });
    toast.success("Fri–Sat marked OD (unsaved)");
  }

  function fillBlanks(status: AttendanceStatus) {
    applyLocalDays((days) => {
      const next = { ...days };
      for (let day = 1; day <= daysInMonth; day++) {
        const key = String(day);
        if (!(next[key] ?? "")) next[key] = status;
      }
      return next;
    });
    toast.success(`Blank days filled as ${status} (unsaved)`);
  }

  async function copyPreviousMonth() {
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }
    if (prevYear < 2000) {
      toast.error("No previous month in range");
      return;
    }
    setPending(true);
    try {
      const params = new URLSearchParams({ year: String(prevYear), month: String(prevMonth) });
      if (monthCompanyId) params.set("companyId", monthCompanyId);
      if (monthClientId) params.set("clientCompanyId", monthClientId);
      if (debouncedMonthQ.trim()) params.set("q", debouncedMonthQ.trim());
      const data = await getJson<{ daysInMonth: number; rows: MonthRow[] }>(`/api/v1/attendance/month?${params}`);
      const byEmployee = new Map(data.rows.map((row) => [row.employeeId, row.days]));
      applyLocalDays((days, employeeId) => {
        const prev = byEmployee.get(employeeId);
        if (!prev) return days;
        const next = { ...days };
        for (let day = 1; day <= daysInMonth; day++) {
          const key = String(day);
          if (prev[key] !== undefined) next[key] = prev[key] ?? "";
        }
        return next;
      });
      toast.success(`Copied pattern from ${prevYear}-${String(prevMonth).padStart(2, "0")} (unsaved)`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not copy previous month");
    } finally {
      setPending(false);
    }
  }

  async function saveRow(row: MonthRow) {
    setSavingEmployeeId(row.employeeId);
    setPending(true);
    try {
      const saved = await sendJson<MonthRow>("/api/v1/attendance/month/employee", "POST", {
        employeeId: row.employeeId,
        year,
        month,
        days: draftDays[row.employeeId] ?? row.days,
      });
      setMonthRows((current) => (current ? current.map((item) => (item.employeeId === saved.employeeId ? saved : item)) : [saved]));
      setDraftDays((current) => ({ ...current, [saved.employeeId]: { ...saved.days } }));
      toast.success(`Saved ${saved.employeeName}`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save row");
    } finally {
      setPending(false);
      setSavingEmployeeId(null);
    }
  }

  async function saveAllDirty() {
    if (!visibleMonthRows?.length) return;
    const dirty = visibleMonthRows.filter((row) => rowDirty(row));
    if (!dirty.length) {
      toast.message("Nothing to save");
      return;
    }
    setPending(true);
    try {
      const result = await sendJson<{ saved: number; rows: MonthRow[] }>("/api/v1/attendance/month/bulk", "POST", {
        year,
        month,
        employees: dirty.map((row) => ({
          employeeId: row.employeeId,
          days: draftDays[row.employeeId] ?? row.days,
        })),
      });
      const byId = new Map(result.rows.map((row) => [row.employeeId, row]));
      setMonthRows((current) =>
        current ? current.map((item) => byId.get(item.employeeId) ?? item) : result.rows,
      );
      setDraftDays((current) => {
        const next = { ...current };
        for (const row of result.rows) next[row.employeeId] = { ...row.days };
        return next;
      });
      toast.success(`Saved ${result.saved} employees`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save month");
    } finally {
      setPending(false);
    }
  }

  async function saveOne() {
    if (!draft.employeeId) {
      toast.error("Select an employee");
      return;
    }
    setPending(true);
    try {
      if (draft.id) {
        await sendJson(`/api/v1/attendance/${draft.id}`, "PATCH", draft);
        toast.success("Attendance updated");
      } else {
        await sendJson("/api/v1/attendance", "POST", draft);
        toast.success(
          draft.status === "P" ? "Marked present" : draft.status === "AB" ? "Marked absent" : "Marked off day",
        );
      }
      setOpen(false);
      reloadLog();
      if (tab === "month") reloadMonth();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this attendance record?")) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/attendance/${id}`, "DELETE");
      toast.success("Deleted");
      reloadLog();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not delete");
    } finally {
      setPending(false);
    }
  }

  async function saveRate() {
    setPending(true);
    try {
      await sendJson("/api/v1/ot/rates", "POST", {
        scope: rateDraft.scope,
        companyId: rateDraft.companyId || null,
        projectId: rateDraft.projectId || null,
        clientCompanyId: rateDraft.clientCompanyId || null,
        hourlyRate: rateDraft.hourlyRate,
        currency: rateDraft.currency,
        label: rateDraft.label,
      });
      toast.success("OT rate saved");
      setRateOpen(false);
      reloadOt();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save rate");
    } finally {
      setPending(false);
    }
  }

  async function saveOtEntry() {
    setPending(true);
    try {
      const employee = employees.find((item) => item.id === entryDraft.employeeId);
      await sendJson("/api/v1/ot/entries", "POST", {
        employeeId: entryDraft.employeeId,
        workDate: entryDraft.workDate,
        hours: entryDraft.hours,
        companyId: entryDraft.companyId || employee?.companyId || null,
        projectId: entryDraft.projectId || null,
        clientCompanyId: entryDraft.clientCompanyId || null,
        hourlyRate: entryDraft.hourlyRate || undefined,
        note: entryDraft.note,
      });
      toast.success("OT entry saved");
      setEntryOpen(false);
      reloadOt();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save OT");
    } finally {
      setPending(false);
    }
  }

  async function removeRate(id: string) {
    if (!window.confirm("Deactivate this OT rate?")) return;
    await sendJson(`/api/v1/ot/rates/${id}`, "DELETE");
    toast.success("Rate removed");
    reloadOt();
  }

  async function removeOt(id: string) {
    if (!window.confirm("Delete this OT entry?")) return;
    await sendJson(`/api/v1/ot/entries/${id}`, "DELETE");
    toast.success("OT deleted");
    reloadOt();
  }

  return (
    <Shell
      title="NEXCRM · Attendance"
      eyebrow="Operations"
      description="Monthly P / AB / OD sheet per employee, attendance log, and overtime with adjustable rates."
      actions={
        <WhenEditing>
          <>
            {tab === "ot" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setRateOpen(true)}>
                  <TimerIcon />
                  Set OT rate
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setEntryDraft({
                      employeeId: "",
                      workDate: today(),
                      hours: "",
                      companyId: "",
                      projectId: "",
                      clientCompanyId: "",
                      hourlyRate: "",
                      note: "",
                    });
                    setEntryOpen(true);
                  }}
                >
                  <PlusIcon />
                  Add OT
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  setDraft(emptyDraft());
                  setOpen(true);
                }}
              >
                <PlusIcon />
                Quick record
              </Button>
            )}
          </>
        </WhenEditing>
      }
    >
      <Banner message={error} error />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList variant="line">
          <TabsTrigger value="month">
            <CalendarCheckIcon className="size-4" />
            Month sheet
          </TabsTrigger>
          <TabsTrigger value="log">
            <ClipboardListIcon className="size-4" />
            Log
          </TabsTrigger>
          <TabsTrigger value="ot">
            <TimerIcon className="size-4" />
            Overtime
          </TabsTrigger>
        </TabsList>

        <TabsContent value="month" className="mt-0 grid gap-4 outline-none">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Monthly attendance</CardTitle>
                <CardDescription>
                  Click a day to cycle · → P → AB → OD. Employer and client filters show only staff linked on that placement for the month.
                </CardDescription>
              </div>
              <WhenEditing>
                <Button
                  type="button"
                  disabled={pending || !(monthSheetStats?.dirty)}
                  onClick={() => void saveAllDirty()}
                >
                  <SaveIcon />
                  {monthSheetStats?.dirty ? `Save all (${monthSheetStats.dirty})` : "Save all"}
                </Button>
              </WhenEditing>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-3 sm:p-4",
                  filtersLocked ? "border-primary/30 bg-primary/[0.04]" : "bg-muted/15",
                )}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous month"
                      disabled={filtersLocked}
                      onClick={() => shiftMonth(-1)}
                    >
                      <ChevronLeftIcon />
                    </Button>
                    <div className="min-w-[10.5rem] text-center">
                      <p className="text-base font-semibold tracking-tight sm:text-lg">{monthTitle(year, month)}</p>
                      <p className="text-[11px] text-muted-foreground">{daysInMonth} days</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Next month"
                      disabled={filtersLocked}
                      onClick={() => shiftMonth(1)}
                    >
                      <ChevronRightIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={filtersLocked} onClick={goThisMonth}>
                      This month
                    </Button>
                    <div className="flex items-end gap-2">
                      <SelectField
                        id="year"
                        label="Jump year"
                        value={String(year)}
                        disabled={filtersLocked}
                        onChange={(value) => changePeriod(Number(value) || year, month)}
                      >
                        {yearOptions.map((y) => (
                          <option key={y} value={String(y)}>
                            {y}
                          </option>
                        ))}
                      </SelectField>
                      <SelectField
                        id="month"
                        label="Jump month"
                        value={String(month)}
                        disabled={filtersLocked}
                        onChange={(value) => changePeriod(year, Number(value))}
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>
                            {new Date(2000, i, 1).toLocaleString(undefined, { month: "short" })}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end lg:max-w-3xl lg:justify-end">
                    <div className="sm:min-w-[10rem] sm:flex-1">
                      <SelectField
                        id="monthCompany"
                        label="Employer"
                        value={monthCompanyId}
                        disabled={filtersLocked}
                        onChange={changeMonthCompany}
                      >
                        <option value="">All employers</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.legalName}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="sm:min-w-[10rem] sm:flex-1">
                      <SelectField
                        id="monthClient"
                        label="Client"
                        value={monthClientId}
                        disabled={filtersLocked}
                        onChange={changeMonthClient}
                      >
                        <option value="">All clients</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.legalName}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="min-w-[12rem] flex-1">
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Search</label>
                      <SearchField
                        value={monthQ}
                        onChange={changeMonthSearch}
                        placeholder="Filter employees…"
                        label="Filter employees"
                        disabled={filtersLocked}
                      />
                    </div>
                    <div className="sm:pb-0.5">
                      <Button
                        type="button"
                        variant={filtersLocked ? "default" : "outline"}
                        onClick={toggleFiltersLocked}
                        title={filtersLocked ? "Unlock filters" : "Lock filters while marking attendance"}
                      >
                        {filtersLocked ? <LockIcon /> : <UnlockIcon />}
                        {filtersLocked ? "Locked" : "Lock filters"}
                      </Button>
                    </div>
                  </div>
                </div>

                {filtersLocked ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-background/70 px-3 py-2 text-xs">
                    <LockIcon className="size-3.5 text-primary" />
                    <span className="font-medium text-foreground">Workspace locked</span>
                    <span className="text-muted-foreground">
                      {monthTitle(year, month)}
                      {monthClientId
                        ? ` · ${clients.find((item) => item.id === monthClientId)?.legalName ?? "Client"}`
                        : ""}
                      {monthCompanyId
                        ? ` · ${companies.find((item) => item.id === monthCompanyId)?.legalName ?? "Employer"}`
                        : ""}
                      {monthQ.trim() ? ` · “${monthQ.trim()}”` : ""}
                    </span>
                    <span className="text-muted-foreground">· filters stay while you mark & save</span>
                  </div>
                ) : null}

                {monthSheetStats ? (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <Badge variant="outline">{monthSheetStats.employees} staff</Badge>
                    <Badge className="border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                      P {monthSheetStats.present}
                    </Badge>
                    <Badge className="border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300">
                      AB {monthSheetStats.absent}
                    </Badge>
                    <Badge className="border-transparent bg-sky-500/15 text-sky-800 dark:text-sky-300">
                      OD {monthSheetStats.offDay}
                    </Badge>
                    {monthSheetStats.dirty ? (
                      <Badge variant="secondary">{monthSheetStats.dirty} unsaved</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">All changes saved</span>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-sm bg-emerald-500/70" /> Present
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-sm bg-amber-500/70" /> Absent
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-sm bg-sky-500/70" /> Off day
                      </span>
                      <span className="hidden sm:inline">Click cell to cycle</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <WhenEditing>
                <div className="rounded-xl border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
                    onClick={() => setBulkOpen((open) => !open)}
                    aria-expanded={bulkOpen}
                  >
                    <span>Bulk tools</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {bulkOpen ? "Hide" : "Fill day, weekends, blanks…"}
                    </span>
                  </button>
                  {bulkOpen ? (
                    <div className="grid gap-3 border-t bg-muted/15 p-3 sm:grid-cols-[auto_1fr]">
                      <div className="flex flex-wrap items-end gap-2">
                        <SelectField id="fillDay" label="Day" value={fillDay} onChange={setFillDay}>
                          {dayNumbers.map((day) => (
                            <option key={day} value={String(day)}>
                              {day}
                            </option>
                          ))}
                        </SelectField>
                        <SelectField
                          id="fillStatus"
                          label="Status"
                          value={fillStatus}
                          onChange={(value) => setFillStatus(value as AttendanceStatus)}
                        >
                          <option value="P">P · Present</option>
                          <option value="AB">AB · Absent</option>
                          <option value="OD">OD · Off day</option>
                        </SelectField>
                        <Button type="button" variant="outline" disabled={pending} onClick={fillColumn}>
                          Fill day
                        </Button>
                        <Button type="button" disabled={pending} onClick={() => void fillColumnAndSave()}>
                          Fill & save
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-end gap-2 sm:justify-end">
                        <Button type="button" variant="outline" disabled={pending} onClick={fillWeekendsOd}>
                          Fri–Sat → OD
                        </Button>
                        <Button type="button" variant="outline" disabled={pending} onClick={() => fillBlanks("P")}>
                          Blanks → P
                        </Button>
                        <Button type="button" variant="outline" disabled={pending} onClick={() => fillBlanks("AB")}>
                          Blanks → AB
                        </Button>
                        <Button type="button" variant="outline" disabled={pending} onClick={() => void copyPreviousMonth()}>
                          <CopyIcon />
                          Copy prev month
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </WhenEditing>

              {!visibleMonthRows ? <PageSkeleton cards={1} /> : null}
              {visibleMonthRows && !visibleMonthRows.length ? (
                <ShellEmpty
                  title={monthClientId || monthCompanyId || monthQ.trim() ? "No matching employees" : "No employees"}
                  description={
                    monthClientId || monthCompanyId || monthQ.trim()
                      ? "No staff linked to this client/employer for the selected month."
                      : "Add employees first, then mark their days here."
                  }
                  action={
                    monthClientId || monthCompanyId || monthQ.trim() ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (filtersLocked) {
                            setFiltersLocked(false);
                          }
                          if (!confirmLeaveUnsaved()) return;
                          setMonthClientId("");
                          setMonthCompanyId("");
                          setMonthQ("");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              ) : null}
              {visibleMonthRows && visibleMonthRows.length ? (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-max min-w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="sticky left-0 z-20 bg-muted/95 px-3 py-2 text-left font-medium shadow-[1px_0_0_0_hsl(var(--border))]">
                          Employee
                        </th>
                        {dayNumbers.map((day) => {
                          const weekend = isWeekend(year, month, day);
                          return (
                            <th
                              key={day}
                              className={cn(
                                "px-0.5 py-1.5 text-center font-medium tabular-nums",
                                weekend && "bg-foreground/12 text-muted-foreground dark:bg-foreground/18",
                              )}
                            >
                              <div className="leading-none">{day}</div>
                              <div className="mt-0.5 text-[9px] font-normal uppercase opacity-70">
                                {weekdayShort(year, month, day)}
                              </div>
                            </th>
                          );
                        })}
                        <th className="px-2 py-2 text-center font-medium text-emerald-700 dark:text-emerald-400">P</th>
                        <th className="px-2 py-2 text-center font-medium text-amber-700 dark:text-amber-400">AB</th>
                        <th className="px-2 py-2 text-center font-medium text-sky-700 dark:text-sky-400">OD</th>
                        <th
                          className="px-2 py-2 text-center font-medium"
                          title="Total paid / worked days (P + OD)"
                        >
                          Total
                        </th>
                        <th className="sticky right-0 z-20 bg-muted/95 px-3 py-2 text-right font-medium shadow-[-1px_0_0_0_hsl(var(--border))]">
                          {" "}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMonthRows.map((row) => {
                        const dirty = rowDirty(row);
                        const days = draftDays[row.employeeId] ?? row.days;
                        const presentCount = Object.values(days).filter((v) => v === "P").length;
                        const absentCount = Object.values(days).filter((v) => v === "AB").length;
                        const offCount = Object.values(days).filter((v) => v === "OD").length;
                        return (
                          <tr
                            key={row.employeeId}
                            className={cn("border-b hover:bg-muted/20", dirty && "bg-amber-500/[0.04]")}
                          >
                            <td
                              className={cn(
                                "sticky left-0 z-10 bg-background px-3 py-1.5 shadow-[1px_0_0_0_hsl(var(--border))]",
                                dirty && "bg-amber-50 dark:bg-amber-950/40",
                              )}
                            >
                              <div className="min-w-[10rem]">
                                <p className="flex items-center gap-1.5 text-sm font-medium">
                                  {row.employeeName}
                                  {dirty ? (
                                    <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Unsaved changes" />
                                  ) : null}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{row.companyName}</p>
                                {clientNamesByEmployee.get(row.employeeId)?.length ? (
                                  <p className="text-[10px] text-muted-foreground">
                                    {clientNamesByEmployee.get(row.employeeId)!.join(", ")}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            {dayNumbers.map((day) => {
                              const key = String(day);
                              const value = days[key] ?? "";
                              const weekend = isWeekend(year, month, day);
                              return (
                                <td
                                  key={day}
                                  className={cn(
                                    "px-0.5 py-1",
                                    weekend && "bg-foreground/[0.08] dark:bg-foreground/14",
                                  )}
                                >
                                  <button
                                    type="button"
                                    aria-label={`${row.employeeName} day ${day}: ${value || "blank"}. Click to change.`}
                                    title="Click to cycle · → P → AB → OD"
                                    className={cn(
                                      "flex h-8 w-10 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums",
                                      "hover:ring-2 hover:ring-ring/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                      !value && "border-border/70 bg-background text-muted-foreground",
                                      value === "P" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                                      value === "AB" && "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-300",
                                      value === "OD" && "border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-300",
                                    )}
                                    onClick={() => setDay(row.employeeId, day, cycleDay(value))}
                                  >
                                    {dayCellLabel(value)}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-2 text-center tabular-nums text-emerald-700 dark:text-emerald-400">
                              {presentCount}
                            </td>
                            <td className="px-2 text-center tabular-nums text-amber-700 dark:text-amber-400">
                              {absentCount}
                            </td>
                            <td className="px-2 text-center tabular-nums text-sky-700 dark:text-sky-400">
                              {offCount}
                            </td>
                            <td
                              className="px-2 text-center font-semibold tabular-nums"
                              title="Paid / worked days (P + OD)"
                            >
                              {presentCount + offCount}
                            </td>
                            <td
                              className={cn(
                                "sticky right-0 z-10 bg-background px-2 py-1 text-right shadow-[-1px_0_0_0_hsl(var(--border))]",
                                dirty && "bg-amber-50 dark:bg-amber-950/40",
                              )}
                            >
                              <WhenEditing>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant={dirty ? "default" : "outline"}
                                  disabled={!dirty || pending || savingEmployeeId === row.employeeId}
                                  aria-label={`Save ${row.employeeName}`}
                                  title="Save"
                                  onClick={() => void saveRow(row)}
                                >
                                  <SaveIcon className="size-3.5" />
                                </Button>
                              </WhenEditing>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-0 grid gap-4 outline-none">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Present (P)</CardDescription>
                <CardTitle className="tabular-nums text-emerald-700 dark:text-emerald-400">{totals.P}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Absent (AB)</CardDescription>
                <CardTitle className="tabular-nums text-amber-700 dark:text-amber-400">{totals.AB}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Off day (OD)</CardDescription>
                <CardTitle className="tabular-nums text-sky-700 dark:text-sky-400">{totals.OD}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Rows in view</CardDescription>
                <CardTitle className="tabular-nums">{totals.all}</CardTitle>
              </CardHeader>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Attendance log</CardTitle>
              <CardDescription>Flat list of saved day records.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <TextField id="from" label="From" type="date" value={from} onChange={setFrom} />
                <TextField id="to" label="To" type="date" value={to} onChange={setTo} />
                <SelectField id="statusFilter" label="Status" value={status} onChange={(value) => setStatus(value as "" | AttendanceStatus)}>
                  <option value="">All</option>
                  <option value="P">Present (P)</option>
                  <option value="AB">Absent (AB)</option>
                  <option value="OD">Off day (OD)</option>
                </SelectField>
                <SelectField id="companyFilter" label="Employer" value={companyId} onChange={setCompanyId}>
                  <option value="">All employers</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.legalName}
                    </option>
                  ))}
                </SelectField>
                <div className="lg:self-end">
                  <SearchField value={q} onChange={setQ} placeholder="Search…" label="Search attendance" />
                </div>
              </div>
              {!records ? <PageSkeleton cards={1} /> : null}
              {records?.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="w-28"> </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap">{formatDate(row.attendanceDate)}</TableCell>
                          <TableCell className="font-medium">{row.employeeName}</TableCell>
                          <TableCell>{row.companyName}</TableCell>
                          <TableCell>
                            <Badge variant={row.status === "P" ? "default" : "secondary"}>
                              {statusLabel(row.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[14rem] truncate text-muted-foreground">{row.note ?? "—"}</TableCell>
                          <TableCell>
                            <WhenEditing>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setDraft({
                                      id: row.id,
                                      employeeId: row.employeeId,
                                      attendanceDate: row.attendanceDate,
                                      status: row.status,
                                      note: row.note ?? "",
                                    });
                                    setOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => void remove(row.id)}>
                                  <Trash2Icon className="size-4" />
                                </Button>
                              </div>
                            </WhenEditing>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : records ? (
                <ShellEmpty title="No attendance rows" description="Use the month sheet or quick record to add P / AB / OD." />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ot" className="mt-0 grid gap-4 outline-none">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>OT hours (listed)</CardDescription>
                <CardTitle className="tabular-nums">{otTotals.totalHours}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>OT amount (listed)</CardDescription>
                <CardTitle className="tabular-nums">{otTotals.totalAmount}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>OT rates</CardTitle>
              <CardDescription>
                Adjustable hourly rates. Resolution order when logging OT: <strong>client</strong> →{" "}
                <strong>project</strong> → <strong>employer company</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {otRates.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scope</TableHead>
                        <TableHead>Applies to</TableHead>
                        <TableHead>Rate / hr</TableHead>
                        <TableHead>Label</TableHead>
                        <TableHead className="w-20"> </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {otRates.map((rate) => (
                        <TableRow key={rate.id}>
                          <TableCell>
                            <Badge variant="outline">{rate.scope}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{targetLabel(rate)}</TableCell>
                          <TableCell className="tabular-nums">
                            {formatMoney(rate.hourlyRate, rate.currency)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{rate.label ?? "—"}</TableCell>
                          <TableCell>
                            <WhenEditing>
                              <Button type="button" size="sm" variant="ghost" onClick={() => void removeRate(rate.id)}>
                                <Trash2Icon className="size-4" />
                              </Button>
                            </WhenEditing>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <ShellEmpty
                  title="No OT rates yet"
                  description="Add company, project, or client hourly rates so OT can calculate automatically."
                  action={
                    <WhenEditing>
                      <Button type="button" onClick={() => setRateOpen(true)}>
                        Set OT rate
                      </Button>
                    </WhenEditing>
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>OT entries</CardTitle>
              <CardDescription>Hours × resolved (or overridden) rate = amount snapshot.</CardDescription>
            </CardHeader>
            <CardContent>
              {otEntries.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Context</TableHead>
                        <TableHead className="w-16"> </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {otEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">{formatDate(entry.workDate)}</TableCell>
                          <TableCell className="font-medium">{entry.employeeName}</TableCell>
                          <TableCell className="tabular-nums">{entry.hours}</TableCell>
                          <TableCell className="tabular-nums">
                            {formatMoney(entry.hourlyRate, entry.currency)}
                          </TableCell>
                          <TableCell className="tabular-nums font-medium">
                            {formatMoney(entry.amount, entry.currency)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[entry.clientName, entry.projectName, entry.companyName].filter(Boolean).join(" · ") || "—"}
                          </TableCell>
                          <TableCell>
                            <WhenEditing>
                              <Button type="button" size="sm" variant="ghost" onClick={() => void removeOt(entry.id)}>
                                <Trash2Icon className="size-4" />
                              </Button>
                            </WhenEditing>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <ShellEmpty title="No OT entries" description="Log overtime hours against an employee and rate context." />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? "Edit attendance" : "Quick attendance"}
        description="Single day P / AB / OD record."
        pending={pending}
        submitLabel="Save"
        onSubmit={saveOne}
        size="md"
      >
        <SelectField id="employeeId" label="Employee" value={draft.employeeId} onChange={(value) => setDraft((c) => ({ ...c, employeeId: value }))}>
          <option value="">Select employee</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.legalName} · {employee.companyName}
            </option>
          ))}
        </SelectField>
        <TextField id="attendanceDate" label="Date" type="date" value={draft.attendanceDate} onChange={(value) => setDraft((c) => ({ ...c, attendanceDate: value }))} />
        <SelectField id="status" label="Status" value={draft.status} onChange={(value) => setDraft((c) => ({ ...c, status: value as AttendanceStatus }))}>
          <option value="P">Present (P)</option>
          <option value="AB">Absent (AB)</option>
          <option value="OD">Off day (OD)</option>
        </SelectField>
        <FormDialogWide>
          <AreaField id="note" label="Note" value={draft.note} onChange={(value) => setDraft((c) => ({ ...c, note: value }))} />
        </FormDialogWide>
      </FormDialog>

      <FormDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        title="Set OT rate"
        description="Rates can differ by employer company, project, or client. Client overrides project, project overrides company."
        pending={pending}
        submitLabel="Save rate"
        onSubmit={saveRate}
        size="md"
      >
        <SelectField
          id="rateScope"
          label="Scope"
          value={rateDraft.scope}
          onChange={(value) => setRateDraft((c) => ({ ...c, scope: value as "company" | "project" | "client" }))}
        >
          <option value="company">Employer company</option>
          <option value="project">Project</option>
          <option value="client">Client</option>
        </SelectField>
        {rateDraft.scope === "company" ? (
          <SelectField id="rateCompany" label="Company" value={rateDraft.companyId} onChange={(value) => setRateDraft((c) => ({ ...c, companyId: value }))}>
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.legalName}
              </option>
            ))}
          </SelectField>
        ) : null}
        {rateDraft.scope === "project" ? (
          <SelectField id="rateProject" label="Project" value={rateDraft.projectId} onChange={(value) => setRateDraft((c) => ({ ...c, projectId: value }))}>
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        {rateDraft.scope === "client" ? (
          <SelectField
            id="rateClient"
            label="Client"
            value={rateDraft.clientCompanyId}
            onChange={(value) => setRateDraft((c) => ({ ...c, clientCompanyId: value }))}
          >
            <option value="">Select client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.legalName}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField id="hourlyRate" label="Hourly rate" value={rateDraft.hourlyRate} onChange={(value) => setRateDraft((c) => ({ ...c, hourlyRate: value }))} />
        <TextField id="currency" label="Currency" value={rateDraft.currency} onChange={(value) => setRateDraft((c) => ({ ...c, currency: value }))} />
        <TextField id="rateLabel" label="Label (optional)" value={rateDraft.label} onChange={(value) => setRateDraft((c) => ({ ...c, label: value }))} />
      </FormDialog>

      <FormDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        title="Add overtime"
        description="Pick employee and optional project/client context. Rate resolves automatically unless you override."
        pending={pending}
        submitLabel="Save OT"
        onSubmit={saveOtEntry}
        size="lg"
      >
        <SelectField
          id="otEmployee"
          label="Employee"
          value={entryDraft.employeeId}
          onChange={(value) => {
            const employee = employees.find((item) => item.id === value);
            setEntryDraft((c) => ({ ...c, employeeId: value, companyId: employee?.companyId ?? c.companyId }));
          }}
        >
          <option value="">Select employee</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.legalName} · {employee.companyName}
            </option>
          ))}
        </SelectField>
        <TextField id="otDate" label="Date" type="date" value={entryDraft.workDate} onChange={(value) => setEntryDraft((c) => ({ ...c, workDate: value }))} />
        <TextField id="otHours" label="Hours" value={entryDraft.hours} onChange={(value) => setEntryDraft((c) => ({ ...c, hours: value }))} />
        <SelectField id="otCompany" label="Employer (optional)" value={entryDraft.companyId} onChange={(value) => setEntryDraft((c) => ({ ...c, companyId: value }))}>
          <option value="">From employee</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.legalName}
            </option>
          ))}
        </SelectField>
        <SelectField id="otProject" label="Project (optional)" value={entryDraft.projectId} onChange={(value) => setEntryDraft((c) => ({ ...c, projectId: value }))}>
          <option value="">None</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="otClient"
          label="Client (optional)"
          value={entryDraft.clientCompanyId}
          onChange={(value) => setEntryDraft((c) => ({ ...c, clientCompanyId: value }))}
        >
          <option value="">None</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.legalName}
            </option>
          ))}
        </SelectField>
        <FormDialogWide>
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {resolvedPreview && resolvedPreview.source !== "none" ? (
              <p>
                Resolved rate:{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(resolvedPreview.hourlyRate, resolvedPreview.currency)}/hr
                </span>{" "}
                via {resolvedPreview.source}
              </p>
            ) : (
              <p>No matching rate yet — set one, or type an override rate below.</p>
            )}
          </div>
        </FormDialogWide>
        <TextField
          id="otRateOverride"
          label="Rate override (optional)"
          value={entryDraft.hourlyRate}
          onChange={(value) => setEntryDraft((c) => ({ ...c, hourlyRate: value }))}
        />
        <FormDialogWide>
          <AreaField id="otNote" label="Note" value={entryDraft.note} onChange={(value) => setEntryDraft((c) => ({ ...c, note: value }))} />
        </FormDialogWide>
      </FormDialog>
    </Shell>
  );
}
