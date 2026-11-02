import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeftIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField, TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";

type Allocation = {
  id: string;
  employeeId: string;
  employeeName: string;
  employerName: string;
  clientCompanyId: string;
  clientName: string;
  joinDate: string;
  resignDate: string | null;
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
  staffSalaryTotal: string;
  billRateTotal: string;
};

type Employee = { id: string; legalName: string; companyName: string };
type Company = { id: string; legalName: string };

export function AllocationsPage() {
  const [allocations, setAllocations] = useState<Allocation[] | null>(null);
  const [headcount, setHeadcount] = useState<Headcount[]>([]);
  const [clients, setClients] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [active, setActive] = useState<Allocation | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [designation, setDesignation] = useState("");
  const [staffSalary, setStaffSalary] = useState("");
  const [billRate, setBillRate] = useState("");
  const [resignDate, setResignDate] = useState(new Date().toISOString().slice(0, 10));

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

  async function resign() {
    if (!active) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/allocations/${active.id}/resign`, "POST", { resignDate });
      toast.success("Allocation ended");
      setResignOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not resign");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="NEXCRM · Allocations"
      eyebrow="Operations"
      description="Second staff to a client with separate staff salary and bill rate. Actions open in dialogs."
      actions={
        <WhenEditing>
          <Button type="button" onClick={() => setAllocateOpen(true)}>
            <PlusIcon />
            Allocate
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      {headcount.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {headcount.map((row) => (
            <Card key={row.clientCompanyId}>
              <CardHeader className="pb-2">
                <CardDescription>{row.clientName}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{row.activeCount}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Staff {row.staffSalaryTotal} · Bill {row.billRateTotal}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Allocation history</CardTitle>
          <CardDescription>Active and ended secondments. Resign records an end date without deleting history.</CardDescription>
        </CardHeader>
        <CardContent>
          {!allocations && !error ? <PageSkeleton cards={1} /> : null}
          {allocations?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Staff / Bill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{row.designation ?? row.employerName}</div>
                    </TableCell>
                    <TableCell>{row.clientName}</TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {row.staffSalary} / {row.billRate} {row.currency}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.joinDate}
                        {row.resignDate ? ` → ${row.resignDate}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.status === "active" ? (
                        <WhenEditing>
                          <div className="flex flex-wrap gap-1">
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
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActive(row);
                                setResignDate(new Date().toISOString().slice(0, 10));
                                setResignOpen(true);
                              }}
                            >
                              Resign
                            </Button>
                          </div>
                        </WhenEditing>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {allocations && !allocations.length ? (
            <ShellEmpty
              icon={<ArrowRightLeftIcon className="size-8 opacity-60" />}
              title="No allocations yet"
              description="Allocate an employee to a client with join date, staff salary and bill rate."
              action={
                <WhenEditing>
                  <Button type="button" onClick={() => setAllocateOpen(true)}>
                    Allocate
                  </Button>
                </WhenEditing>
              }
            />
          ) : null}
        </CardContent>
      </Card>

      <FormDialog
        open={allocateOpen}
        onOpenChange={setAllocateOpen}
        title="Allocate to client"
        description="Commits an immutable join event with dual rates."
        pending={pending}
        submitLabel="Allocate"
        onSubmit={allocate}
        size="md"
      >
        <SelectField id="employeeId" label="Employee" value={employeeId} onChange={setEmployeeId}>
          <option value="">Select employee</option>
          {employees.map((item) => (
            <option key={item.id} value={item.id}>
              {item.legalName} · {item.companyName}
            </option>
          ))}
        </SelectField>
        <SelectField id="clientCompanyId" label="Client" value={clientCompanyId} onChange={setClientCompanyId}>
          <option value="">Select client</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.legalName}
            </option>
          ))}
        </SelectField>
        <TextField id="joinDate" label="Join date" type="date" value={joinDate} onChange={setJoinDate} />
        <TextField id="designation" label="Designation" value={designation} onChange={setDesignation} />
        <TextField id="staffSalary" label="Staff salary" value={staffSalary} onChange={setStaffSalary} hint="What the agency pays" />
        <TextField id="billRate" label="Bill rate" value={billRate} onChange={setBillRate} hint="What the client is charged" />
      </FormDialog>

      <FormDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        title="Change rates"
        description={active ? `${active.employeeName} · ${active.clientName}` : undefined}
        pending={pending}
        submitLabel="Save rates"
        onSubmit={changeRates}
        size="md"
      >
        <TextField id="rateStaff" label="Staff salary" value={staffSalary} onChange={setStaffSalary} />
        <TextField id="rateBill" label="Bill rate" value={billRate} onChange={setBillRate} />
      </FormDialog>

      <FormDialog
        open={resignOpen}
        onOpenChange={setResignOpen}
        title="Resign allocation"
        description={active ? `End secondment for ${active.employeeName} without deleting history.` : undefined}
        pending={pending}
        submitLabel="Resign"
        onSubmit={resign}
        size="md"
      >
        <TextField id="resignDate" label="Resign date" type="date" value={resignDate} onChange={setResignDate} />
      </FormDialog>
    </Shell>
  );
}
