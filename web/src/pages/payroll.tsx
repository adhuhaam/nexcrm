import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LockIcon, PlusIcon, PrinterIcon, RefreshCwIcon, Trash2Icon, WalletIcon } from "lucide-react";
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
import { AGENCY_NAME } from "@/lib/tax-invoice";

type GenerationMode = "client_batch" | "employer_client";

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
  netStaff: string;
  lopBill: string;
  otBill: string;
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

function openClientPaymentRequest(run: { id: string }) {
  window.location.assign(`/payroll/${run.id}/payment-request`);
}

function openSalarySheet(run: { id: string }) {
  window.location.assign(`/payroll/${run.id}/salary-sheet`);
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
  const [q, setQ] = useState("");

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
    return payRuns.filter((row) => {
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
  }, [payRuns, filterClientId, filterEmployerId, filterYear, filterMonth, q]);

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
      <Card>
        <CardHeader>
          <CardTitle>Pay runs</CardTitle>
          <CardDescription>
            Nets use paid days (P + OD) × daily rate + OT. Unmarked days count as AB.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search client, legal employer, status…"
            label="Search pay runs"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField id="filterClient" label="Filter client" value={filterClientId} onChange={setFilterClientId}>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Legal employer</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => void openRun(row.id)}>
                    <TableCell className="font-medium">{row.clientName}</TableCell>
                    <TableCell>{row.employerName}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatDateRange(row.periodStart, row.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{modeLabel(row.generationMode)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "locked" ? "secondary" : "default"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openSalarySheet(row)}
                        >
                          <PrinterIcon />
                          Salary sheet
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openClientPaymentRequest(row)}
                        >
                          <PrinterIcon />
                          Client payment request
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {filteredRuns && !filteredRuns.length ? (
            <ShellEmpty
              icon={<WalletIcon className="size-8 opacity-60" />}
              title={q.trim() || filterClientId || filterEmployerId || filterYear || filterMonth ? "No matching pay runs" : "No pay runs yet"}
              description={
                q.trim() || filterClientId || filterEmployerId || filterYear || filterMonth
                  ? "Try a different search or clear the filters."
                  : "Mark attendance for the month, then generate a draft from client allocations."
              }
              action={
                q.trim() || filterClientId || filterEmployerId || filterYear || filterMonth ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQ("");
                      setFilterClientId("");
                      setFilterEmployerId("");
                      setFilterYear("");
                      setFilterMonth("");
                    }}
                  >
                    Clear search
                  </Button>
                ) : (
                  <WhenEditing>
                    <Button type="button" onClick={() => setCreateOpen(true)}>
                      Generate pay run
                    </Button>
                  </WhenEditing>
                )
              }
            />
          ) : null}
        </CardContent>
      </Card>

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
                        <TableHead>Net staff</TableHead>
                        <TableHead>Net bill</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.items.map((item) => (
                        <TableRow key={item.id}>
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
                  const paidDays = selected.items.reduce((n, item) => n + item.paidDays, 0);
                  const absentDays = selected.items.reduce((n, item) => n + item.absentDays, 0);
                  return (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Staff pay summary
                        </p>
                        <dl className="mt-2 grid gap-1.5 text-sm">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Monthly rates (sum)</dt>
                            <dd className="tabular-nums font-medium">
                              {formatMoney(selected.totals.staffSalary, currency)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">LOP deductions</dt>
                            <dd className="tabular-nums">{formatMoney(staffLop, currency)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Overtime</dt>
                            <dd className="tabular-nums">{formatMoney(staffOt, currency)}</dd>
                          </div>
                          <div className="flex justify-between gap-3 border-t pt-1.5">
                            <dt className="font-medium">Net payable to staff</dt>
                            <dd className="tabular-nums text-base font-semibold tracking-tight">
                              {formatMoney(selected.totals.netStaff, currency)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Client bill summary
                        </p>
                        <dl className="mt-2 grid gap-1.5 text-sm">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Monthly rates (sum)</dt>
                            <dd className="tabular-nums font-medium">
                              {formatMoney(selected.totals.billRate, currency)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">LOP deductions</dt>
                            <dd className="tabular-nums">{formatMoney(billLop, currency)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Overtime bill</dt>
                            <dd className="tabular-nums">{formatMoney(billOt, currency)}</dd>
                          </div>
                          <div className="flex justify-between gap-3 border-t pt-1.5">
                            <dt className="font-medium">Net amount due from client</dt>
                            <dd className="tabular-nums text-base font-semibold tracking-tight">
                              {formatMoney(selected.totals.netBill, currency)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground sm:col-span-2">
                        {selected.items.length} worker(s) · {paidDays} paid day(s) · {absentDays} absent ·{" "}
                        {selected.totals.unmarkedDays} unmarked · formula monthly ÷ days-in-month × present/OD
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
