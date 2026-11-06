import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownWideNarrowIcon,
  DownloadIcon,
  LockIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  ScaleIcon,
  Trash2Icon,
  UsersIcon,
  Building2Icon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";
import { formatDateRange } from "@/lib/dates";
import { formatAmount, formatMoney, formatMoneyPair } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AGENCY_NAME } from "@/lib/tax-invoice";
import "./payroll.css";

type GenerationMode = "client_batch" | "employer_client";
type StatusFilter = "all" | "draft" | "locked";
type SortKey = "period" | "client" | "bill" | "staff" | "balance";

type PayRunListItem = {
  id: string;
  clientName: string;
  employerName: string;
  employerCompanyId: string;
  clientCompanyId: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "locked";
  generationMode: GenerationMode;
  itemCount?: number;
  netStaff?: string;
  netBill?: string;
  balance?: string;
};

type PayRunItem = {
  id: string;
  employeeName: string;
  designation: string | null;
  passportNumber?: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  calendarDays: number;
  paidDays: number;
  absentDays: number;
  offDays: number;
  unmarkedDays: number;
  lopStaff: string;
  otStaff: string;
  otherDeductStaff?: string;
  netStaff: string;
  lopBill: string;
  otBill: string;
  otherDeductBill?: string;
  deductionNote?: string | null;
  netBill: string;
}; // otBill used by client payment export

type PayRunDetail = PayRunListItem & {
  clientTinNumber?: string | null;
  clientAddress?: string | null;
  items: PayRunItem[];
  totals: {
    staffSalary: string;
    billRate: string;
    netStaff: string;
    netBill: string;
    unmarkedDays: number;
  };
  warnings: string[];
};

type Company = { id: string; legalName: string };

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const dim = daysInMonth(year, month);
  const mm = String(month).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(dim).padStart(2, "0")}`,
  };
}

function modeLabel(mode: GenerationMode): string {
  return mode === "client_batch" ? "Client batch" : "Legal employer × client";
}

function sumField(items: PayRunItem[], key: keyof PayRunItem): number {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function n(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function openClientPaymentRequest(run: { id: string }) {
  window.location.assign(`/payroll/${run.id}/payment-request`);
}

function openSalarySheet(run: { id: string }) {
  window.location.assign(`/payroll/${run.id}/salary-sheet`);
}

function openPayslips(run: { id: string }) {
  window.location.assign(`/payroll/${run.id}/payslips`);
}

function periodLabel(periodStart: string): string {
  const match = periodStart.match(/^(\d{4})-(\d{2})/);
  if (!match) return periodStart;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Smoothly tween a money total for KPI liveliness. */
function useAnimatedNumber(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const frame = useRef(0);
  const from = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = target - origin;
    cancelAnimationFrame(frame.current);

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + delta * eased;
      setValue(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else from.current = target;
    }

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs]);

  return value;
}

function useLiveClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function AnimatedMoney({
  value,
  currency = "MVR",
  className,
}: {
  value: number;
  currency?: string;
  className?: string;
}) {
  const animated = useAnimatedNumber(value);
  return <strong className={cn("payroll-kpi-value payroll-money", className)}>{formatMoney(animated, currency)}</strong>;
}

export function PayrollPage() {
  const now = new Date();
  const [payRuns, setPayRuns] = useState<PayRunListItem[] | null>(null);
  const [clients, setClients] = useState<Company[]>([]);
  const [employers, setEmployers] = useState<Company[]>([]);
  const [clientEmployers, setClientEmployers] = useState<Company[]>([]);
  const [selected, setSelected] = useState<PayRunDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [mode, setMode] = useState<GenerationMode>("client_batch");
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [employerCompanyId, setEmployerCompanyId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [filterClientId, setFilterClientId] = useState("");
  const [filterEmployerId, setFilterEmployerId] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("period");
  const [q, setQ] = useState("");
  const [highlightClientId, setHighlightClientId] = useState<string | null>(null);

  const period = useMemo(() => monthBounds(year, month), [year, month]);

  function reload() {
    getJson<{ payRuns: PayRunListItem[]; clients: Company[]; employers: Company[] }>("/api/v1/pay-runs")
      .then((data) => {
        setPayRuns(data.payRuns);
        setClients(data.clients);
        setEmployers(data.employers ?? []);
        if (!clientCompanyId && data.clients[0]) setClientCompanyId(data.clients[0].id);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load pay runs"));
  }

  function clearFilters() {
    setQ("");
    setFilterClientId("");
    setFilterEmployerId("");
    setFilterYear("");
    setFilterMonth("");
    setStatusFilter("all");
    setHighlightClientId(null);
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!clientCompanyId) {
      setClientEmployers([]);
      return;
    }
    getJson<{ employers: Company[] }>(`/api/v1/pay-runs/employers-for-client?clientCompanyId=${clientCompanyId}`)
      .then((data) => {
        setClientEmployers(data.employers);
        if (data.employers.length && !data.employers.some((item) => item.id === employerCompanyId)) {
          setEmployerCompanyId(data.employers[0].id);
        }
      })
      .catch(() => setClientEmployers([]));
  }, [clientCompanyId]);

  const filteredRuns = useMemo(() => {
    if (!payRuns) return null;
    const needle = q.trim().toLowerCase();
    const rows = payRuns.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (filterClientId && row.clientCompanyId !== filterClientId) return false;
      if (filterEmployerId && row.employerCompanyId !== filterEmployerId) return false;
      if (filterYear && !row.periodStart.startsWith(filterYear)) return false;
      if (filterMonth) {
        const mm = String(Number(filterMonth)).padStart(2, "0");
        if (row.periodStart.slice(5, 7) !== mm) return false;
      }
      if (!needle) return true;
      const haystack = [
        row.clientName,
        row.employerName,
        row.status,
        modeLabel(row.generationMode),
        row.generationMode,
        row.periodStart,
        row.periodEnd,
        formatDateRange(row.periodStart, row.periodEnd),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortKey === "client") return a.clientName.localeCompare(b.clientName);
      if (sortKey === "bill") return n(b.netBill) - n(a.netBill);
      if (sortKey === "staff") return n(b.netStaff) - n(a.netStaff);
      if (sortKey === "balance") return n(b.balance) - n(a.balance);
      return b.periodStart.localeCompare(a.periodStart) || a.clientName.localeCompare(b.clientName);
    });
    return sorted;
  }, [payRuns, filterClientId, filterEmployerId, filterYear, filterMonth, q, statusFilter, sortKey]);

  const clientTotals = useMemo(() => {
    if (!filteredRuns?.length) return [];
    const map = new Map<
      string,
      {
        clientCompanyId: string;
        clientName: string;
        runs: number;
        workers: number;
        netBill: number;
        netStaff: number;
        balance: number;
        draft: number;
        locked: number;
      }
    >();
    for (const row of filteredRuns) {
      const current = map.get(row.clientCompanyId) ?? {
        clientCompanyId: row.clientCompanyId,
        clientName: row.clientName,
        runs: 0,
        workers: 0,
        netBill: 0,
        netStaff: 0,
        balance: 0,
        draft: 0,
        locked: 0,
      };
      current.runs += 1;
      current.workers += row.itemCount ?? 0;
      current.netBill += n(row.netBill);
      current.netStaff += n(row.netStaff);
      current.balance += n(row.balance ?? n(row.netBill) - n(row.netStaff));
      if (row.status === "draft") current.draft += 1;
      else current.locked += 1;
      map.set(row.clientCompanyId, current);
    }
    return [...map.values()].sort((a, b) => b.balance - a.balance || b.netBill - a.netBill);
  }, [filteredRuns]);

  const grandTotals = useMemo(() => {
    const base = { runs: 0, workers: 0, netBill: 0, netStaff: 0, balance: 0, draft: 0, locked: 0 };
    for (const row of clientTotals) {
      base.runs += row.runs;
      base.workers += row.workers;
      base.netBill += row.netBill;
      base.netStaff += row.netStaff;
      base.balance += row.balance;
      base.draft += row.draft;
      base.locked += row.locked;
    }
    return base;
  }, [clientTotals]);

  const filtersActive =
    Boolean(q.trim() || filterClientId || filterEmployerId || filterYear || filterMonth) || statusFilter !== "all";

  async function createRun() {
    if (!clientCompanyId) {
      toast.error("Select a client");
      return;
    }
    if (mode === "employer_client" && !employerCompanyId) {
      toast.error("Select a legal employer");
      return;
    }
    setPending(true);
    try {
      const created = await sendJson<{ payRuns: PayRunDetail[] }>("/api/v1/pay-runs", "POST", {
        mode,
        clientCompanyId,
        employerCompanyId: mode === "employer_client" ? employerCompanyId : undefined,
        periodStart: period.start,
        periodEnd: period.end,
      });
      const count = created.payRuns.length;
      toast.success(count === 1 ? "Pay run generated" : `${count} pay runs generated (one per employer)`);
      setCreateOpen(false);
      if (created.payRuns[0]) {
        setSelected(created.payRuns[0]);
        setDetailOpen(true);
      }
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not create pay run");
    } finally {
      setPending(false);
    }
  }

  async function openRun(id: string) {
    try {
      const run = await getJson<PayRunDetail>(`/api/v1/pay-runs/${id}`);
      setSelected(run);
      setDetailOpen(true);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not open pay run");
    }
  }

  async function lockRun(id: string) {
    setPending(true);
    try {
      const locked = await sendJson<PayRunDetail>(`/api/v1/pay-runs/${id}/lock`, "POST", {});
      toast.success("Pay run locked");
      setSelected(locked);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not lock pay run");
    } finally {
      setPending(false);
    }
  }

  async function recalculateRun(id: string) {
    setPending(true);
    try {
      const updated = await sendJson<PayRunDetail>(`/api/v1/pay-runs/${id}/recalculate`, "POST", {});
      toast.success("Pay run recalculated from attendance");
      setSelected(updated);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not recalculate");
    } finally {
      setPending(false);
    }
  }

  async function deleteRun(id: string) {
    if (!window.confirm("Delete this draft pay run?")) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/pay-runs/${id}`, "DELETE");
      toast.success("Draft deleted");
      setDetailOpen(false);
      setSelected(null);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not delete");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="NEXCRM · Payroll"
      eyebrow="Operations"
      description="Agency payroll from attendance. You are the agency — legal employers (WP holders) own the workers; clients are billed. Client batch = one draft per legal employer."
      actions={
        <WhenEditing>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            Generate pay run
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />

      <PayrollLiveBoard
        grandTotals={grandTotals}
        sortKey={sortKey}
        setSortKey={setSortKey}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        filteredRuns={filteredRuns}
        clientTotals={clientTotals}
        error={error}
        filterClientId={filterClientId}
        setFilterClientId={setFilterClientId}
        highlightClientId={highlightClientId}
        setHighlightClientId={setHighlightClientId}
        filtersActive={filtersActive}
        clearFilters={clearFilters}
        q={q}
        setQ={setQ}
        filterEmployerId={filterEmployerId}
        setFilterEmployerId={setFilterEmployerId}
        filterYear={filterYear}
        setFilterYear={setFilterYear}
        filterMonth={filterMonth}
        setFilterMonth={setFilterMonth}
        clients={clients}
        employers={employers}
        now={now}
        selectedId={selected?.id}
        openRun={openRun}
        createOpen={() => setCreateOpen(true)}
      />

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Generate pay run"
        description="Period must be a full calendar month. LOP uses attendance (P/OD paid, AB and unmarked unpaid)."
        pending={pending}
        submitLabel="Generate draft"
        onSubmit={createRun}
        size="md"
      >
        <SelectField
          id="mode"
          label="Generation mode"
          value={mode}
          onChange={(value) => setMode(value as GenerationMode)}
        >
          <option value="client_batch">Primary — Client batch (one run per legal employer)</option>
          <option value="employer_client">Secondary — Legal employer × client (single run)</option>
        </SelectField>
        <SelectField id="clientCompanyId" label="Client" value={clientCompanyId} onChange={setClientCompanyId}>
          <option value="">Select client</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.legalName}
            </option>
          ))}
        </SelectField>
        {mode === "employer_client" ? (
          <SelectField
            id="employerCompanyId"
            label="Legal employer"
            value={employerCompanyId}
            onChange={setEmployerCompanyId}
          >
            <option value="">Select legal employer</option>
            {(clientEmployers.length ? clientEmployers : employers).map((item) => (
              <option key={item.id} value={item.id}>
                {item.legalName}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="text-sm text-muted-foreground">
            {clientEmployers.length
              ? `Will create ${clientEmployers.length} draft(s) for legal employers on this client: ${clientEmployers.map((e) => e.legalName).join(", ")}.`
              : "Legal employers come from allocations on this client — not the agency."}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <SelectField id="payYear" label="Year" value={String(year)} onChange={(value) => setYear(Number(value) || year)}>
            {Array.from({ length: 101 }, (_, i) => 2000 + i).map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </SelectField>
          <SelectField id="payMonth" label="Month" value={String(month)} onChange={(value) => setMonth(Number(value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Period {period.start} → {period.end} ({daysInMonth(year, month)} calendar days)
        </p>
      </FormDialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex max-h-[min(90vh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          {selected ? (
            <>
              <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12">
                <DialogTitle>
                  {selected.clientName} · {formatDateRange(selected.periodStart, selected.periodEnd)}
                </DialogTitle>
                <DialogDescription>
                  Legal employer {selected.employerName} · Agency {AGENCY_NAME} · {modeLabel(selected.generationMode)}.
                  Totals use net staff / net bill after LOP + OT.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {selected.warnings?.length ? (
                  <Banner message={selected.warnings.join(" ")} tone="warning" />
                ) : null}
                {selected.totals.unmarkedDays > 0 ? (
                  <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
                    {selected.totals.unmarkedDays} unmarked day(s) treated as absent for LOP.
                  </p>
                ) : null}
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>P/OD</TableHead>
                        <TableHead>AB</TableHead>
                        <TableHead>·</TableHead>
                        <TableHead>LOP staff</TableHead>
                        <TableHead>OT</TableHead>
                        <TableHead>Other ded.</TableHead>
                        <TableHead>Net staff</TableHead>
                        <TableHead>Net bill</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.items.map((item) => (
                        <TableRow key={item.id} className="payroll-detail-row">
                          <TableCell>
                            <div className="font-medium">{item.employeeName}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.designation ?? "—"} · {formatMoneyPair(item.staffSalary, item.billRate, item.currency)}
                              /mo
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">{item.paidDays}</TableCell>
                          <TableCell className="tabular-nums">{item.absentDays}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{item.unmarkedDays}</TableCell>
                          <TableCell className="tabular-nums">{formatAmount(item.lopStaff)}</TableCell>
                          <TableCell className="tabular-nums">{formatAmount(item.otStaff)}</TableCell>
                          <TableCell className="tabular-nums">
                            <div>{formatAmount(item.otherDeductStaff ?? 0)}</div>
                            {item.deductionNote ? (
                              <div className="max-w-[10rem] truncate text-[10px] text-muted-foreground" title={item.deductionNote}>
                                {item.deductionNote}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular-nums font-medium">{formatAmount(item.netStaff)}</TableCell>
                          <TableCell className="tabular-nums font-medium">{formatAmount(item.netBill)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {(() => {
                  const currency = selected.items[0]?.currency ?? "MVR";
                  const staffLop = sumField(selected.items, "lopStaff");
                  const billLop = sumField(selected.items, "lopBill");
                  const staffOt = sumField(selected.items, "otStaff");
                  const billOt = sumField(selected.items, "otBill");
                  const staffOther = selected.items.reduce((sum, item) => sum + Number(item.otherDeductStaff || 0), 0);
                  const paidDays = selected.items.reduce((sum, item) => sum + item.paidDays, 0);
                  const absentDays = selected.items.reduce((sum, item) => sum + item.absentDays, 0);
                  const balanceOperationFund = n(selected.totals.netBill) - n(selected.totals.netStaff);
                  return (
                    <div className="payroll-detail-grid mt-4">
                      <div className="payroll-detail-card is-staff">
                        <h3>Staff pay</h3>
                        <dl>
                          <div className="row">
                            <dt>Monthly rates</dt>
                            <dd>{formatMoney(selected.totals.staffSalary, currency)}</dd>
                          </div>
                          <div className="row">
                            <dt>LOP</dt>
                            <dd>{formatMoney(staffLop, currency)}</dd>
                          </div>
                          <div className="row">
                            <dt>Overtime</dt>
                            <dd>{formatMoney(staffOt, currency)}</dd>
                          </div>
                          <div className="row">
                            <dt>Other deductions</dt>
                            <dd>{formatMoney(staffOther, currency)}</dd>
                          </div>
                          <div className="row is-total">
                            <dt>Net to staff</dt>
                            <dd>{formatMoney(selected.totals.netStaff, currency)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="payroll-detail-card is-client">
                        <h3>Client bill</h3>
                        <dl>
                          <div className="row">
                            <dt>Monthly rates</dt>
                            <dd>{formatMoney(selected.totals.billRate, currency)}</dd>
                          </div>
                          <div className="row">
                            <dt>LOP</dt>
                            <dd>{formatMoney(billLop, currency)}</dd>
                          </div>
                          <div className="row">
                            <dt>Overtime bill</dt>
                            <dd>{formatMoney(billOt, currency)}</dd>
                          </div>
                          <div className="row is-total">
                            <dt>Net from client</dt>
                            <dd>{formatMoney(selected.totals.netBill, currency)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className={cn("payroll-detail-card is-balance", balanceOperationFund < 0 && "is-negative")}>
                        <h3>Balance operation fund</h3>
                        <dl>
                          <div className="row">
                            <dt>Client bill</dt>
                            <dd>{formatMoney(selected.totals.netBill, currency)}</dd>
                          </div>
                          <div className="row">
                            <dt>Staff pay</dt>
                            <dd>{formatMoney(selected.totals.netStaff, currency)}</dd>
                          </div>
                          <div className="row is-total">
                            <dt>Balance operation fund</dt>
                            <dd>{formatMoney(balanceOperationFund, currency)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="payroll-empty-hint rounded-xl border border-dashed sm:col-span-2 lg:col-span-3">
                        {selected.items.length} worker(s) · {paidDays} paid day(s) · {absentDays} absent ·{" "}
                        {selected.totals.unmarkedDays} unmarked · monthly ÷ days-in-month × present/OD
                      </div>
                    </div>
                  );
                })()}
              </div>
              <DialogFooter className="mx-0 mb-0 flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => openSalarySheet(selected)}>
                  <PrinterIcon />
                  Salary sheet
                </Button>
                <Button type="button" variant="outline" onClick={() => openPayslips(selected)}>
                  <DownloadIcon />
                  Download all payslips
                </Button>
                <Button type="button" variant="outline" onClick={() => openClientPaymentRequest(selected)}>
                  <PrinterIcon />
                  Client payment request
                </Button>
                <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
                  Close
                </Button>
                {selected.status === "draft" ? (
                  <WhenEditing>
                    <>
                      <Button type="button" variant="outline" disabled={pending} onClick={() => void recalculateRun(selected.id)}>
                        <RefreshCwIcon />
                        Recalculate
                      </Button>
                      <Button type="button" variant="outline" disabled={pending} onClick={() => void deleteRun(selected.id)}>
                        <Trash2Icon />
                        Delete draft
                      </Button>
                      <Button type="button" disabled={pending} onClick={() => void lockRun(selected.id)}>
                        <LockIcon />
                        Lock pay run
                      </Button>
                    </>
                  </WhenEditing>
                ) : (
                  <Badge variant="secondary">Locked</Badge>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function PayrollLiveBoard(props: {
  grandTotals: {
    runs: number;
    workers: number;
    netBill: number;
    netStaff: number;
    balance: number;
    draft: number;
    locked: number;
  };
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  filteredRuns: PayRunListItem[] | null;
  clientTotals: {
    clientCompanyId: string;
    clientName: string;
    runs: number;
    workers: number;
    netBill: number;
    netStaff: number;
    balance: number;
    draft: number;
    locked: number;
  }[];
  error: string | null;
  filterClientId: string;
  setFilterClientId: (value: string | ((current: string) => string)) => void;
  highlightClientId: string | null;
  setHighlightClientId: (value: string | null) => void;
  filtersActive: boolean;
  clearFilters: () => void;
  q: string;
  setQ: (value: string) => void;
  filterEmployerId: string;
  setFilterEmployerId: (value: string) => void;
  filterYear: string;
  setFilterYear: (value: string) => void;
  filterMonth: string;
  setFilterMonth: (value: string) => void;
  clients: Company[];
  employers: Company[];
  now: Date;
  selectedId?: string;
  openRun: (id: string) => Promise<void>;
  createOpen: () => void;
}) {
  const {
    grandTotals,
    sortKey,
    setSortKey,
    statusFilter,
    setStatusFilter,
    filteredRuns,
    clientTotals,
    error,
    filterClientId,
    setFilterClientId,
    highlightClientId,
    setHighlightClientId,
    filtersActive,
    clearFilters,
    q,
    setQ,
    filterEmployerId,
    setFilterEmployerId,
    filterYear,
    setFilterYear,
    filterMonth,
    setFilterMonth,
    clients,
    employers,
    now,
    selectedId,
    openRun,
    createOpen,
  } = props;
  const liveClock = useLiveClock(1000);
  const [pulseTick, setPulseTick] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => setPulseTick((value) => value + 1), 4000);
    return () => window.clearInterval(timer);
  }, []);

  return (
      <div className="payroll-board is-live" data-pulse={pulseTick}>
        <div className="payroll-livebar">
          <span className="payroll-live-dot" aria-hidden />
          <span className="payroll-live-label">Live board</span>
          <span className="payroll-live-clock tabular-nums">
            {liveClock.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span className="payroll-live-meta">
            Totals update as you filter · {grandTotals.runs} run(s) in view
          </span>
        </div>

        <div className="payroll-kpi-grid">
          <button
            type="button"
            className={cn("payroll-kpi is-client payroll-rise", sortKey === "bill" && "is-sorted")}
            style={{ animationDelay: "40ms" }}
            onClick={() => setSortKey("bill")}
            title="Sort pay runs by client bill"
          >
            <span className="payroll-kpi-label">
              <Building2Icon className="size-3.5" /> Client bill
            </span>
            <AnimatedMoney value={grandTotals.netBill} />
            <span className="payroll-kpi-meta">
              <span className="payroll-kpi-chip">{grandTotals.runs} runs</span>
              <span>{grandTotals.workers} worker lines</span>
            </span>
          </button>
          <button
            type="button"
            className={cn("payroll-kpi is-staff payroll-rise", sortKey === "staff" && "is-sorted")}
            style={{ animationDelay: "120ms" }}
            onClick={() => setSortKey("staff")}
            title="Sort pay runs by staff pay"
          >
            <span className="payroll-kpi-label">
              <UsersIcon className="size-3.5" /> Staff pay
            </span>
            <AnimatedMoney value={grandTotals.netStaff} />
            <span className="payroll-kpi-meta">
              <span className="payroll-kpi-chip">{grandTotals.draft} draft</span>
              <span>{grandTotals.locked} locked</span>
            </span>
          </button>
          <button
            type="button"
            className={cn(
              "payroll-kpi is-balance payroll-rise",
              grandTotals.balance < 0 && "is-negative",
              sortKey === "balance" && "is-sorted",
            )}
            style={{ animationDelay: "200ms" }}
            onClick={() => setSortKey("balance")}
            title="Balance operation fund = client bill − staff pay"
          >
            <span className="payroll-kpi-label">
              <ScaleIcon className="size-3.5" /> Balance operation fund
            </span>
            <AnimatedMoney value={grandTotals.balance} />
            <span className="payroll-kpi-meta">
              <span className="payroll-kpi-chip">BOF</span>
              <span>
                {grandTotals.netBill > 0
                  ? `${Math.round((grandTotals.balance / grandTotals.netBill) * 100)}% of bill`
                  : "bill − staff"}
              </span>
            </span>
          </button>
        </div>

        <div className="payroll-panel payroll-rise" style={{ animationDelay: "260ms" }}>
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Totals by client</CardTitle>
                <CardDescription>
                  Client bill vs staff pay, plus balance operation fund. Click a row to filter.
                </CardDescription>
              </div>
              <div className="payroll-toolbar">
                {(["all", "draft", "locked"] as const).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    className={cn("payroll-status-chip", statusFilter === status && "is-active")}
                    variant={statusFilter === status ? "default" : "outline"}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === "all" ? "All" : status === "draft" ? "Drafts" : "Locked"}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!filteredRuns && !error ? (
                <div className="p-4">
                  <PageSkeleton cards={1} />
                </div>
              ) : null}
              {filteredRuns && clientTotals.length ? (
                <div className="payroll-table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Share</TableHead>
                        <TableHead className="text-right">Runs</TableHead>
                        <TableHead className="payroll-col-client text-right">Client bill</TableHead>
                        <TableHead className="payroll-col-staff text-right">Staff pay</TableHead>
                        <TableHead className="payroll-col-balance text-right">Balance operation fund</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientTotals.map((row, index) => {
                        const active =
                          filterClientId === row.clientCompanyId || highlightClientId === row.clientCompanyId;
                        const mix = Math.max(row.netBill, row.netStaff, 1);
                        const billPct = Math.min(100, (row.netBill / mix) * 100);
                        const staffPct = Math.min(100, (row.netStaff / mix) * 100);
                        return (
                          <TableRow
                            key={row.clientCompanyId}
                            className={cn("payroll-total-row payroll-rise cursor-pointer", active && "is-active")}
                            style={{ animationDelay: `${Math.min(index, 12) * 35 + 80}ms` }}
                            onClick={() => {
                              setFilterClientId((current) =>
                                current === row.clientCompanyId ? "" : row.clientCompanyId,
                              );
                              setHighlightClientId(row.clientCompanyId);
                            }}
                            onMouseEnter={() => setHighlightClientId(row.clientCompanyId)}
                            onMouseLeave={() => setHighlightClientId(null)}
                          >
                            <TableCell>
                              <div className="font-medium">{row.clientName}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.workers} workers · {row.draft} draft · {row.locked} locked
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="payroll-share" aria-hidden>
                                <div className="payroll-share-track">
                                  <span className="is-client" style={{ width: `${billPct}%` }} />
                                </div>
                                <div className="payroll-share-track">
                                  <span className="is-staff" style={{ width: `${staffPct}%` }} />
                                </div>
                                <div className="payroll-share-legend">
                                  <span>Bill</span>
                                  <span>Staff</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right payroll-money">{row.runs}</TableCell>
                            <TableCell className="payroll-col-client text-right payroll-money font-medium">
                              {formatAmount(row.netBill)}
                            </TableCell>
                            <TableCell className="payroll-col-staff text-right payroll-money font-medium">
                              {formatAmount(row.netStaff)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "payroll-col-balance text-right payroll-money font-semibold",
                                row.balance < 0 && "is-negative",
                              )}
                            >
                              {formatAmount(row.balance)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="payroll-total-footer">
                        <TableCell className="font-semibold">All filtered</TableCell>
                        <TableCell>
                          <div className="payroll-share" aria-hidden>
                            <div className="payroll-share-track">
                              <span
                                className="is-client"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (grandTotals.netBill / Math.max(grandTotals.netBill, grandTotals.netStaff, 1)) *
                                      100,
                                  )}%`,
                                }}
                              />
                            </div>
                            <div className="payroll-share-track">
                              <span
                                className="is-staff"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (grandTotals.netStaff / Math.max(grandTotals.netBill, grandTotals.netStaff, 1)) *
                                      100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right payroll-money font-semibold">{grandTotals.runs}</TableCell>
                        <TableCell className="payroll-col-client text-right payroll-money font-semibold">
                          {formatAmount(grandTotals.netBill)}
                        </TableCell>
                        <TableCell className="payroll-col-staff text-right payroll-money font-semibold">
                          {formatAmount(grandTotals.netStaff)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "payroll-col-balance text-right payroll-money font-semibold",
                            grandTotals.balance < 0 && "is-negative",
                          )}
                        >
                          {formatAmount(grandTotals.balance)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : filteredRuns ? (
                <div className="payroll-empty-hint">No totals for the current filters.</div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="payroll-panel payroll-rise" style={{ animationDelay: "320ms" }}>
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Pay runs</CardTitle>
                <CardDescription>
                  Paid days × daily rate + OT − other deductions. Click a row to open the run.
                </CardDescription>
              </div>
              <div className="payroll-toolbar">
                <ArrowDownWideNarrowIcon className="size-4 text-muted-foreground" />
                <SelectField
                  id="sortPayRuns"
                  label="Sort"
                  value={sortKey}
                  onChange={(value) => setSortKey(value as SortKey)}
                >
                  <option value="period">Period</option>
                  <option value="client">Client</option>
                  <option value="bill">Client bill</option>
                  <option value="staff">Staff pay</option>
                  <option value="balance">Balance operation fund</option>
                </SelectField>
                {filtersActive ? (
                  <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SearchField
                value={q}
                onChange={setQ}
                placeholder="Search client, legal employer, status…"
                label="Search pay runs"
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  id="filterClient"
                  label="Filter client"
                  value={filterClientId}
                  onChange={(value) => {
                    setFilterClientId(value);
                    setHighlightClientId(value || null);
                  }}
                >
                  <option value="">All clients</option>
                  {clients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legalName}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="filterEmployer"
                  label="Filter legal employer"
                  value={filterEmployerId}
                  onChange={setFilterEmployerId}
                >
                  <option value="">All legal employers</option>
                  {employers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legalName}
                    </option>
                  ))}
                </SelectField>
                <SelectField id="filterYear" label="Filter year" value={filterYear} onChange={setFilterYear}>
                  <option value="">Any year</option>
                  {Array.from({ length: 12 }, (_, i) => now.getFullYear() - 5 + i).map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </SelectField>
                <SelectField id="filterMonth" label="Filter month" value={filterMonth} onChange={setFilterMonth}>
                  <option value="">Any month</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
                    </option>
                  ))}
                </SelectField>
              </div>

              {!filteredRuns && !error ? <PageSkeleton cards={1} /> : null}
              {filteredRuns?.length ? (
                <div className="payroll-table-wrap rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client / employer</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="payroll-col-client text-right">Client</TableHead>
                        <TableHead className="payroll-col-staff text-right">Staff</TableHead>
                        <TableHead className="payroll-col-balance text-right">Balance</TableHead>
                        <TableHead className="text-right">Documents</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRuns.map((row, index) => {
                        const balance = n(row.balance ?? n(row.netBill) - n(row.netStaff));
                        const active = highlightClientId === row.clientCompanyId || selectedId === row.id;
                        return (
                          <TableRow
                            key={row.id}
                            className={cn("payroll-run-row payroll-rise cursor-pointer", active && "is-active")}
                            style={{ animationDelay: `${Math.min(index, 16) * 28 + 60}ms` }}
                            onClick={() => void openRun(row.id)}
                            onMouseEnter={() => setHighlightClientId(row.clientCompanyId)}
                            onMouseLeave={() => setHighlightClientId(null)}
                          >
                            <TableCell>
                              <div className="font-medium">{row.clientName}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.employerName} · {row.itemCount ?? 0} worker(s)
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="font-medium">{periodLabel(row.periodStart)}</div>
                              <div className="payroll-money text-xs text-muted-foreground">
                                {formatDateRange(row.periodStart, row.periodEnd)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={row.status === "locked" ? "secondary" : "default"}>{row.status}</Badge>
                                <Badge variant="outline">{modeLabel(row.generationMode)}</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="payroll-col-client text-right payroll-money font-medium">
                              {formatAmount(row.netBill ?? 0)}
                            </TableCell>
                            <TableCell className="payroll-col-staff text-right payroll-money font-medium">
                              {formatAmount(row.netStaff ?? 0)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "payroll-col-balance text-right payroll-money font-semibold",
                                balance < 0 && "is-negative",
                              )}
                            >
                              {formatAmount(balance)}
                            </TableCell>
                            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                              <div className="payroll-run-actions flex flex-wrap justify-end gap-1.5">
                                <Button type="button" variant="outline" size="sm" onClick={() => openSalarySheet(row)}>
                                  <PrinterIcon />
                                  Sheet
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => openPayslips(row)}>
                                  <DownloadIcon />
                                  Payslips
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openClientPaymentRequest(row)}
                                >
                                  <PrinterIcon />
                                  Invoice
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            {filteredRuns && !filteredRuns.length ? (
              <ShellEmpty
                icon={<WalletIcon className="size-8 opacity-60" />}
                title={filtersActive ? "No matching pay runs" : "No pay runs yet"}
                description={
                  filtersActive
                    ? "Try a different search or clear the filters."
                    : "Mark attendance for the month, then generate a draft from client allocations."
                }
                action={
                  filtersActive ? (
                    <Button type="button" variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <WhenEditing>
                      <Button type="button" onClick={createOpen}>
                        Generate pay run
                      </Button>
                    </WhenEditing>
                  )
                }
              />
            ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
