import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeftIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DesignationField } from "@/components/designation-field";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { AreaField, SelectField, TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatMoneyPair } from "@/lib/money";
import "./allocations.css";

type EndReason = "resign" | "terminate" | "lost" | "transfer_out";

type Allocation = {
  id: string;
  employeeId: string;
  employeeName: string;
  employerName: string;
  clientCompanyId: string;
  clientName: string;
  joinDate: string;
  resignDate: string | null;
  endReason: EndReason | null;
  endNote: string | null;
  designation: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  status: "active" | "ended";
};

type Headcount = {
  clientCompanyId: string;
  clientName: string;
  activeCount: number;
  employerCount: number;
  staffSalaryTotal: string;
  billRateTotal: string;
};

type Employee = { id: string; legalName: string; companyName: string };
type Company = { id: string; legalName: string };

function reasonLabel(reason: EndReason | null): string {
  if (reason === "resign") return "Resigned";
  if (reason === "terminate") return "Terminated";
  if (reason === "lost") return "Lost";
  if (reason === "transfer_out") return "Transferred";
  return "Ended";
}

function attendanceHint(reason: EndReason): string {
  if (reason === "lost") {
    return "Marks AB from the absent-from date through the end date, and clears attendance after the end date.";
  }
  if (reason === "terminate") {
    return "Ends on the last day (inclusive for payroll). Clears attendance after the end date.";
  }
  if (reason === "transfer_out") {
    return "Ends secondment at this client. Clears attendance after the end date so a new allocation can start cleanly.";
  }
  return "Last working day is paid if marked P/OD. Clears attendance after the end date for clean LOP.";
}

function nextIsoDay(iso: string): string {
  const stamp = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(stamp)) return iso;
  return new Date(stamp + 86_400_000).toISOString().slice(0, 10);
}

function marginLabel(staff: string, bill: string): string {
  const s = Number(staff);
  const b = Number(bill);
  if (!Number.isFinite(s) || !Number.isFinite(b)) return "—";
  const delta = b - s;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function AllocationsPage() {
  const [allocations, setAllocations] = useState<Allocation[] | null>(null);
  const [headcount, setHeadcount] = useState<Headcount[]>([]);
  const [clients, setClients] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [active, setActive] = useState<Allocation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [designation, setDesignation] = useState("");
  const [staffSalary, setStaffSalary] = useState("");
  const [billRate, setBillRate] = useState("");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [endReason, setEndReason] = useState<EndReason>("resign");
  const [endNote, setEndNote] = useState("");
  const [absentFrom, setAbsentFrom] = useState(new Date().toISOString().slice(0, 10));
  const [transferClientId, setTransferClientId] = useState("");
  const [transferJoinDate, setTransferJoinDate] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const activeRows = useMemo(
    () => (allocations ?? []).filter((row) => row.status === "active"),
    [allocations],
  );
  const endedRows = useMemo(
    () => (allocations ?? []).filter((row) => row.status === "ended"),
    [allocations],
  );
  const boardColumns = useMemo(() => {
    const byClient = new Map<string, { clientId: string; clientName: string; rows: Allocation[] }>();
    for (const row of activeRows) {
      if (filterClientId && row.clientCompanyId !== filterClientId) continue;
      const bucket = byClient.get(row.clientCompanyId) ?? {
        clientId: row.clientCompanyId,
        clientName: row.clientName,
        rows: [],
      };
      bucket.rows.push(row);
      byClient.set(row.clientCompanyId, bucket);
    }
    return [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [activeRows, filterClientId]);

  const stats = useMemo(() => {
    const active = activeRows.length;
    const clientsOnSite = new Set(activeRows.map((row) => row.clientCompanyId)).size;
    const employers = new Set(activeRows.map((row) => row.employerName)).size;
    return { active, clientsOnSite, employers, ended: endedRows.length };
  }, [activeRows, endedRows]);

  function reload() {
    Promise.all([
      getJson<{ allocations: Allocation[]; clients: Company[]; headcount: Headcount[] }>("/api/v1/allocations"),
      getJson<{ employees: Employee[] }>("/api/v1/employees"),
    ])
      .then(([alloc, emp]) => {
        setAllocations(alloc.allocations);
        setClients(alloc.clients);
        setHeadcount(alloc.headcount);
        setEmployees(emp.employees);
        if (!clientCompanyId && alloc.clients[0]) setClientCompanyId(alloc.clients[0].id);
        if (!employeeId && emp.employees[0]) setEmployeeId(emp.employees[0].id);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load allocations"));
  }

  useEffect(() => {
    reload();
  }, []);

  function openEnd(row: Allocation, reason: EndReason) {
    const today = new Date().toISOString().slice(0, 10);
    setActive(row);
    setSelectedId(row.id);
    setEndReason(reason);
    setEndDate(today);
    setAbsentFrom(today);
    setEndNote("");
    setEndOpen(true);
  }

  function openTransfer(row: Allocation) {
    const today = new Date().toISOString().slice(0, 10);
    setActive(row);
    setSelectedId(row.id);
    setEndDate(today);
    setTransferJoinDate(nextIsoDay(today));
    setTransferClientId(clients.find((c) => c.id !== row.clientCompanyId)?.id ?? "");
    setTransferNote("");
    setStaffSalary(row.staffSalary);
    setBillRate(row.billRate);
    setDesignation(row.designation ?? "");
    setTransferOpen(true);
  }

  async function allocate() {
    setPending(true);
    try {
      await sendJson("/api/v1/allocations", "POST", {
        employeeId,
        clientCompanyId,
        joinDate,
        designation,
        staffSalary,
        billRate,
        currency: "MVR",
      });
      toast.success("Allocation committed");
      setAllocateOpen(false);
      setStaffSalary("");
      setBillRate("");
      setDesignation("");
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not allocate");
    } finally {
      setPending(false);
    }
  }

  async function changeRates() {
    if (!active) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/allocations/${active.id}/rate-change`, "POST", {
        staffSalary,
        billRate,
        currency: active.currency,
      });
      toast.success("Rates updated");
      setRateOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not change rates");
    } finally {
      setPending(false);
    }
  }

  async function submitEnd() {
    if (!active) return;
    setPending(true);
    try {
      const result = await sendJson<{
        attendance: { clearedAfterEnd: number; markedAbsent: number };
      }>(`/api/v1/allocations/${active.id}/end`, "POST", {
        endDate,
        reason: endReason,
        note: endNote || null,
        absentFrom: endReason === "lost" ? absentFrom : null,
      });
      const { clearedAfterEnd, markedAbsent } = result.attendance;
      toast.success(
        `${reasonLabel(endReason)} · cleared ${clearedAfterEnd} day(s) after end` +
          (markedAbsent ? ` · marked ${markedAbsent} AB` : ""),
      );
      setEndOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not end allocation");
    } finally {
      setPending(false);
    }
  }

  async function submitTransfer() {
    if (!active) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/allocations/${active.id}/transfer`, "POST", {
        endDate,
        joinDate: transferJoinDate,
        clientCompanyId: transferClientId,
        note: transferNote || null,
        designation,
        staffSalary,
        billRate,
        currency: active.currency,
      });
      toast.success("Transferred to new client");
      setTransferOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not transfer");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="NEXCRM · Allocations"
      eyebrow="Operations"
      description="Staffing board by client. Dual monthly rates, end actions, and one-step transfer between clients."
      actions={
        <WhenEditing>
          <Button type="button" onClick={() => setAllocateOpen(true)}>
            <PlusIcon />
            Allocate
          </Button>
        </WhenEditing>
      }
    >
      <div className="nexcrm-alloc grid gap-4">
        <Banner message={error} error />

        <div className="alloc-toolbar">
          <div className="alloc-stats">
            <div className="alloc-stat">
              <strong>{stats.active}</strong>
              <span>On site</span>
            </div>
            <div className="alloc-stat">
              <strong>{stats.clientsOnSite}</strong>
              <span>Clients</span>
            </div>
            <div className="alloc-stat">
              <strong>{stats.employers}</strong>
              <span>Employers</span>
            </div>
            <div className="alloc-stat">
              <strong>{stats.ended}</strong>
              <span>Ended</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={filterClientId}
              onChange={(event) => setFilterClientId(event.target.value)}
              aria-label="Filter by client"
            >
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.legalName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!allocations && !error ? <PageSkeleton cards={2} /> : null}

        {allocations && !activeRows.length ? (
          <ShellEmpty
            icon={<ArrowRightLeftIcon className="size-8 opacity-60" />}
            title="No active placements"
            description="Allocate an employee to a client with start date and monthly staff/client rates."
            action={
              <WhenEditing>
                <Button type="button" onClick={() => setAllocateOpen(true)}>
                  Allocate
                </Button>
              </WhenEditing>
            }
          />
        ) : null}

        {boardColumns.length ? (
          <div className={`alloc-board${boardColumns.length >= 3 ? " is-wide" : ""}`}>
            {boardColumns.map((column) => {
              const summary = headcount.find((row) => row.clientCompanyId === column.clientId);
              return (
                <section key={column.clientId} className="alloc-column is-active">
                  <div className="alloc-column-head">
                    <div>
                      <h3>{column.clientName}</h3>
                      <p>
                        {column.rows.length} active
                        {summary
                          ? ` · ${summary.employerCount} employer${summary.employerCount === 1 ? "" : "s"} · ${formatMoneyPair(summary.staffSalaryTotal, summary.billRateTotal, "MVR")}`
                          : null}
                      </p>
                    </div>
                    <Badge variant="secondary">{column.rows.length}</Badge>
                  </div>
                  {column.rows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`alloc-person${selectedId === row.id ? " is-selected" : ""}`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <EmployeeAvatar name={row.employeeName} size="sm" />
                      <span>
                        <strong>{row.employeeName}</strong>
                        <em>
                          {row.designation ?? "—"} · {row.employerName}
                        </em>
                        <em>{formatDate(row.joinDate)} · {formatMoneyPair(row.staffSalary, row.billRate, row.currency)}/mo</em>
                      </span>
                      <span className="alloc-margin" title="Bill − staff">
                        {marginLabel(row.staffSalary, row.billRate)}
                      </span>
                    </button>
                  ))}
                  {selectedId && column.rows.some((row) => row.id === selectedId) ? (
                    <WhenEditing>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(() => {
                          const row = column.rows.find((item) => item.id === selectedId)!;
                          return (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActive(row);
                                  setStaffSalary(row.staffSalary);
                                  setBillRate(row.billRate);
                                  setRateOpen(true);
                                }}
                              >
                                Rates
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => openTransfer(row)}>
                                Transfer
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => openEnd(row, "resign")}>
                                Resign
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => openEnd(row, "terminate")}>
                                Terminate
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => openEnd(row, "lost")}>
                                Lost
                              </Button>
                            </>
                          );
                        })()}
                      </div>
                    </WhenEditing>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}

        {endedRows.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Ended placements</CardTitle>
              <CardDescription>History stays for payroll and audit — mid-month leavers keep days through the end date.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employerName}</div>
                      </TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.resignDate ? formatDateRange(row.joinDate, row.resignDate) : formatDate(row.joinDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{reasonLabel(row.endReason)}</Badge>
                        {row.endNote ? <div className="mt-1 text-xs text-muted-foreground">{row.endNote}</div> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <FormDialog
        open={allocateOpen}
        onOpenChange={setAllocateOpen}
        title="Allocate to client"
        description="Pick any legal employer’s worker, then the client. Same client can host staff from several employers."
        pending={pending}
        submitLabel="Allocate"
        onSubmit={allocate}
        size="md"
      >
        <SelectField
          id="employeeId"
          label="Employee"
          value={employeeId}
          onChange={(value) => {
            setEmployeeId(value);
            if (!value) return;
            void getJson<{
              employee: {
                designation: string | null;
                staffDayRate: string | null;
                billDayRate: string | null;
              };
            }>(`/api/v1/employees/${value}`)
              .then((data) => {
                setDesignation(data.employee.designation ?? "");
                setStaffSalary(data.employee.staffDayRate ?? "");
                setBillRate(data.employee.billDayRate ?? "");
              })
              .catch(() => {
                /* keep manual rates */
              });
          }}
        >
          <option value="">Select employee</option>
          {employees.map((item) => (
            <option key={item.id} value={item.id}>
              {item.legalName} · {item.companyName}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="clientCompanyId"
          label="Client"
          value={clientCompanyId}
          onChange={(value) => {
            setClientCompanyId(value);
            if (!value || !designation.trim()) return;
            void getJson<{ rates: { designation: string; staffMonthRate: string; billMonthRate: string }[] }>(
              `/api/v1/clients/${value}/rates`,
            )
              .then((data) => {
                const match = data.rates.find(
                  (rate) => rate.designation.trim().toLowerCase() === designation.trim().toLowerCase(),
                );
                if (match) {
                  setStaffSalary(match.staffMonthRate);
                  setBillRate(match.billMonthRate);
                }
              })
              .catch(() => undefined);
          }}
        >
          <option value="">Select client</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.legalName}
            </option>
          ))}
        </SelectField>
        <TextField id="joinDate" label="Start date on client" type="date" value={joinDate} onChange={setJoinDate} hint="First day included in payroll" />
        <DesignationField
          id="designation"
          value={designation}
          onChange={(value) => {
            setDesignation(value);
            if (!clientCompanyId || !value.trim()) return;
            void getJson<{ rates: { designation: string; staffMonthRate: string; billMonthRate: string }[] }>(
              `/api/v1/clients/${clientCompanyId}/rates`,
            )
              .then((data) => {
                const match = data.rates.find((rate) => rate.designation.trim().toLowerCase() === value.trim().toLowerCase());
                if (match) {
                  setStaffSalary(match.staffMonthRate);
                  setBillRate(match.billMonthRate);
                }
              })
              .catch(() => undefined);
          }}
          hint="Prefills monthly rates from the client’s designation card when available"
        />
        <TextField
          id="staffSalary"
          label="Staff monthly salary (MVR)"
          value={staffSalary}
          onChange={setStaffSalary}
          hint="Payroll: monthly ÷ days-in-month × present/OD days"
        />
        <TextField
          id="billRate"
          label="Client monthly bill (MVR)"
          value={billRate}
          onChange={setBillRate}
          hint="Full month present = full monthly bill"
        />
      </FormDialog>

      <FormDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        title="Change monthly rates"
        description={active ? `${active.employeeName} · ${active.clientName}` : undefined}
        pending={pending}
        submitLabel="Save rates"
        onSubmit={changeRates}
        size="md"
      >
        <TextField id="rateStaff" label="Staff monthly salary (MVR)" value={staffSalary} onChange={setStaffSalary} />
        <TextField id="rateBill" label="Client monthly bill (MVR)" value={billRate} onChange={setBillRate} />
      </FormDialog>

      <FormDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        title="Transfer to another client"
        description={active ? `${active.employeeName} · from ${active.clientName}` : undefined}
        pending={pending}
        submitLabel="Transfer"
        onSubmit={submitTransfer}
        size="md"
      >
        <SelectField id="transferClient" label="New client" value={transferClientId} onChange={setTransferClientId}>
          <option value="">Select client</option>
          {clients
            .filter((client) => client.id !== active?.clientCompanyId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.legalName}
              </option>
            ))}
        </SelectField>
        <TextField
          id="transferEnd"
          label="Last day on current client"
          type="date"
          value={endDate}
          onChange={(value) => {
            setEndDate(value);
            setTransferJoinDate(nextIsoDay(value));
          }}
        />
        <TextField
          id="transferJoin"
          label="Start on new client"
          type="date"
          value={transferJoinDate}
          onChange={setTransferJoinDate}
          hint="Must be after the last day on the current client"
        />
        <DesignationField id="transferDesignation" value={designation} onChange={setDesignation} />
        <TextField id="transferStaff" label="Staff monthly salary (MVR)" value={staffSalary} onChange={setStaffSalary} />
        <TextField id="transferBill" label="Client monthly bill (MVR)" value={billRate} onChange={setBillRate} />
        <AreaField id="transferNote" label="Note" value={transferNote} onChange={setTransferNote} />
      </FormDialog>

      <FormDialog
        open={endOpen}
        onOpenChange={setEndOpen}
        title={`${reasonLabel(endReason)} · end allocation`}
        description={active ? `${active.employeeName} · ${active.clientName}` : undefined}
        pending={pending}
        submitLabel="Confirm end"
        onSubmit={submitEnd}
        size="md"
      >
        <SelectField id="endReason" label="Reason" value={endReason} onChange={(value) => setEndReason(value as EndReason)}>
          <option value="resign">Resign</option>
          <option value="terminate">Terminate</option>
          <option value="lost">Lost / absconded</option>
          <option value="transfer_out">Transfer out (end only)</option>
        </SelectField>
        <p className="text-sm text-muted-foreground">{attendanceHint(endReason)}</p>
        <TextField
          id="endDate"
          label="Last day on client"
          type="date"
          value={endDate}
          onChange={setEndDate}
          hint="Inclusive for payroll LOP"
        />
        {endReason === "lost" ? (
          <TextField
            id="absentFrom"
            label="Absent / missing from"
            type="date"
            value={absentFrom}
            onChange={setAbsentFrom}
            hint="Days from this date through last day are marked AB"
          />
        ) : null}
        <AreaField id="endNote" label="Reason note" value={endNote} onChange={setEndNote} />
      </FormDialog>
    </Shell>
  );
}
