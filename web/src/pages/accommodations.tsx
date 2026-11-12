import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BedDoubleIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField, TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type House = {
  id: string;
  name: string;
  address: string | null;
  capacity: number;
  dailyRate: string;
  currency: string;
  status: "active" | "inactive";
  occupied: number;
};

type Stay = {
  id: string;
  accommodationId: string;
  accommodationName: string;
  employeeId: string;
  employeeName: string;
  checkIn: string;
  dailyRateSnapshot: string;
  currency: string;
};

type Charge = {
  stayId: string;
  employeeName: string;
  accommodationName: string;
  chargeableDays: number;
  dailyRate: string;
  amount: string;
  currency: string;
};

type Employee = { id: string; legalName: string };

export function AccommodationsPage() {
  const [houses, setHouses] = useState<House[] | null>(null);
  const [stays, setStays] = useState<Stay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState({
    id: null as string | null,
    name: "",
    address: "",
    capacity: "4",
    dailyRate: "50",
    currency: "MVR",
    status: "active",
  });
  const [stayDraft, setStayDraft] = useState({
    accommodationId: "",
    employeeId: "",
    checkIn: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  function reload() {
    Promise.all([
      getJson<{ accommodations: House[]; stays: Stay[] }>("/api/v1/accommodations"),
      getJson<{ employees: Employee[] }>("/api/v1/employees"),
    ])
      .then(([acc, emp]) => {
        setHouses(acc.accommodations);
        setStays(acc.stays);
        setEmployees(emp.employees);
        if (!stayDraft.accommodationId && acc.accommodations[0]) {
          setStayDraft((c) => ({ ...c, accommodationId: acc.accommodations[0].id }));
        }
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load accommodations"));
  }

  useEffect(() => {
    reload();
  }, []);

  async function saveHouse() {
    setPending(true);
    try {
      const body = {
        name: draft.name,
        address: draft.address,
        capacity: Number(draft.capacity),
        dailyRate: draft.dailyRate,
        currency: draft.currency,
        status: draft.status,
      };
      if (draft.id) await sendJson(`/api/v1/accommodations/${draft.id}`, "PATCH", body);
      else await sendJson("/api/v1/accommodations", "POST", body);
      toast.success(draft.id ? "Accommodation updated" : "Accommodation created");
      setOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function doCheckIn() {
    setPending(true);
    try {
      await sendJson(`/api/v1/accommodations/${stayDraft.accommodationId}/check-in`, "POST", stayDraft);
      toast.success("Checked in");
      setCheckInOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not check in");
    } finally {
      setPending(false);
    }
  }

  async function doCheckOut(stayId: string) {
    setPending(true);
    try {
      await sendJson(`/api/v1/accommodations/stays/${stayId}/check-out`, "POST", {
        checkOut: new Date().toISOString().slice(0, 10),
      });
      toast.success("Checked out");
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not check out");
    } finally {
      setPending(false);
    }
  }

  async function loadCharges() {
    try {
      const data = await getJson<{ charges: Charge[] }>(
        `/api/v1/accommodations/charges?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setCharges(data.charges);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not load charges");
    }
  }

  return (
    <Shell
      title="JACMS · Accommodations"
      eyebrow="Operations"
      description="Housing for staff. Charge preview covers days in-house with no active client allocation."
      actions={
        <WhenEditing>
          <>
            <Button type="button" variant="outline" onClick={() => setCheckInOpen(true)}>
              Check in
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDraft({ id: null, name: "", address: "", capacity: "4", dailyRate: "50", currency: "MVR", status: "active" });
                setOpen(true);
              }}
            >
              <PlusIcon />
              Add house
            </Button>
          </>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Houses</CardTitle>
            <CardDescription>Capacity and daily rate used when unallocated staff stay here.</CardDescription>
          </CardHeader>
          <CardContent>
            {!houses && !error ? <PageSkeleton cards={1} /> : null}
            {houses?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Occupancy</TableHead>
                    <TableHead>Daily rate</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {houses.map((house) => (
                    <TableRow key={house.id}>
                      <TableCell>
                        <div className="font-medium">{house.name}</div>
                        <div className="text-xs text-muted-foreground">{house.address ?? "—"}</div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {house.occupied}/{house.capacity}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatMoney(house.dailyRate, house.currency)}
                      </TableCell>
                      <TableCell>
                        <WhenEditing>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDraft({
                                id: house.id,
                                name: house.name,
                                address: house.address ?? "",
                                capacity: String(house.capacity),
                                dailyRate: house.dailyRate,
                                currency: house.currency,
                                status: house.status,
                              });
                              setOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        </WhenEditing>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            {houses && !houses.length ? (
              <ShellEmpty icon={<BedDoubleIcon className="size-8 opacity-60" />} title="No accommodations" description="Add a house to check staff in." />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current stays</CardTitle>
            <CardDescription>Who is in agency housing right now.</CardDescription>
          </CardHeader>
          <CardContent>
            {stays.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>House</TableHead>
                    <TableHead>Since</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stays.map((stay) => (
                    <TableRow key={stay.id}>
                      <TableCell className="font-medium">{stay.employeeName}</TableCell>
                      <TableCell>{stay.accommodationName}</TableCell>
                      <TableCell>{formatDate(stay.checkIn)}</TableCell>
                      <TableCell>
                        <WhenEditing>
                          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void doCheckOut(stay.id)}>
                            Check out
                          </Button>
                        </WhenEditing>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No active stays.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Unallocated housing charges</CardTitle>
          <CardDescription>Days in accommodation with no overlapping client allocation.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <TextField id="from" label="From" type="date" value={from} onChange={setFrom} />
            <TextField id="to" label="To" type="date" value={to} onChange={setTo} />
            <Button type="button" variant="outline" onClick={() => void loadCharges()}>
              Preview charges
            </Button>
          </div>
          {charges.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>House</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((row) => (
                  <TableRow key={row.stayId}>
                    <TableCell>{row.employeeName}</TableCell>
                    <TableCell>{row.accommodationName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.chargeableDays}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.amount, row.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Run a preview for the selected period.</p>
          )}
        </CardContent>
      </Card>

      <FormDialog open={open} onOpenChange={setOpen} title={draft.id ? "Edit accommodation" : "Add accommodation"} pending={pending} submitLabel="Save" onSubmit={saveHouse} size="md">
        <TextField id="name" label="Name" value={draft.name} onChange={(value) => setDraft((c) => ({ ...c, name: value }))} />
        <TextField id="address" label="Address" value={draft.address} onChange={(value) => setDraft((c) => ({ ...c, address: value }))} />
        <TextField id="capacity" label="Capacity" value={draft.capacity} onChange={(value) => setDraft((c) => ({ ...c, capacity: value }))} />
        <TextField id="dailyRate" label="Daily rate" value={draft.dailyRate} onChange={(value) => setDraft((c) => ({ ...c, dailyRate: value }))} />
        <TextField id="currency" label="Currency" value={draft.currency} onChange={(value) => setDraft((c) => ({ ...c, currency: value }))} />
        <SelectField id="status" label="Status" value={draft.status} onChange={(value) => setDraft((c) => ({ ...c, status: value }))}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
      </FormDialog>

      <FormDialog open={checkInOpen} onOpenChange={setCheckInOpen} title="Check in employee" pending={pending} submitLabel="Check in" onSubmit={doCheckIn} size="md">
        <SelectField id="accommodationId" label="House" value={stayDraft.accommodationId} onChange={(value) => setStayDraft((c) => ({ ...c, accommodationId: value }))}>
          {houses?.map((house) => (
            <option key={house.id} value={house.id}>
              {house.name} ({house.occupied}/{house.capacity})
            </option>
          ))}
        </SelectField>
        <SelectField id="employeeId" label="Employee" value={stayDraft.employeeId} onChange={(value) => setStayDraft((c) => ({ ...c, employeeId: value }))}>
          <option value="">Select employee</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.legalName}
            </option>
          ))}
        </SelectField>
        <TextField id="checkIn" label="Check-in date" type="date" value={stayDraft.checkIn} onChange={(value) => setStayDraft((c) => ({ ...c, checkIn: value }))} />
        <TextField id="notes" label="Notes" value={stayDraft.notes} onChange={(value) => setStayDraft((c) => ({ ...c, notes: value }))} />
      </FormDialog>
    </Shell>
  );
}
