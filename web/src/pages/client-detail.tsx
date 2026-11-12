import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  BadgePercentIcon,
  Building2Icon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DesignationField } from "@/components/designation-field";
import { AreaField, TextField } from "@/components/field";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson, sendJson } from "@/lib/api";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatAmount, formatMoneyPair } from "@/lib/money";

type Client = {
  id: string;
  kind: string;
  legalName: string;
  registrationNumber: string | null;
  tinNumber: string | null;
  registeredAddress: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
};

type DesignationRate = {
  id: string;
  designation: string;
  staffMonthRate: string;
  billMonthRate: string;
  currency: string;
};

type ClientStaff = {
  id: string;
  employeeId: string;
  employeeName: string;
  employerName: string;
  designation: string | null;
  joinDate: string;
  resignDate: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  status: "active" | "ended";
};

type TabId = "employees" | "details" | "rates";

function tabFromUrl(): TabId {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "details" || tab === "rates") return tab;
  return "employees";
}

function setTabInUrl(tab: TabId) {
  const url = new URL(window.location.href);
  if (tab === "employees") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export function ClientDetailPage({ id }: { id: string }) {
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<TabId>(() => tabFromUrl());
  const [rates, setRates] = useState<DesignationRate[]>([]);
  const [staff, setStaff] = useState<ClientStaff[] | null>(null);
  const [staffQ, setStaffQ] = useState("");
  const debouncedStaffQ = useDebouncedValue(staffQ);
  const [draft, setDraft] = useState({
    legalName: "",
    registrationNumber: "",
    tinNumber: "",
    registeredAddress: "",
    country: "",
    phone: "",
    email: "",
  });
  const [rateDesignation, setRateDesignation] = useState("");
  const [rateStaff, setRateStaff] = useState("");
  const [rateBill, setRateBill] = useState("");

  function reloadClient() {
    getJson<Client>(`/api/v1/companies/${id}`)
      .then((data) => {
        if (data.kind !== "client") {
          window.location.replace(`/companies/${id}`);
          return;
        }
        setClient(data);
        setDraft({
          legalName: data.legalName ?? "",
          registrationNumber: data.registrationNumber ?? "",
          tinNumber: data.tinNumber ?? "",
          registeredAddress: data.registeredAddress ?? "",
          country: data.country ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
        });
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load client"));
  }

  function reloadRates() {
    getJson<{ rates: DesignationRate[] }>(`/api/v1/clients/${id}/rates`)
      .then((data) => setRates(data.rates))
      .catch(() => setRates([]));
  }

  function reloadStaff() {
    getJson<{ allocations: ClientStaff[] }>(`/api/v1/allocations?clientCompanyId=${encodeURIComponent(id)}`)
      .then((data) => setStaff(data.allocations))
      .catch(() => setStaff([]));
  }

  useEffect(() => {
    reloadClient();
    reloadRates();
    reloadStaff();
  }, [id]);

  const activeStaff = useMemo(() => (staff ?? []).filter((row) => row.status === "active"), [staff]);
  const employerLabels = useMemo(
    () => [...new Set(activeStaff.map((row) => row.employerName).filter(Boolean))],
    [activeStaff],
  );

  const filteredStaff = useMemo(() => {
    if (!staff) return null;
    const needle = debouncedStaffQ.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter((row) =>
      [row.employeeName, row.employerName, row.designation, row.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [staff, debouncedStaffQ]);

  async function saveDetails() {
    setPending(true);
    try {
      await sendJson(`/api/v1/companies/${id}`, "PATCH", {
        kind: "client",
        ...draft,
      });
      toast.success("Client details saved");
      reloadClient();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save client");
    } finally {
      setPending(false);
    }
  }

  async function saveRate() {
    setPending(true);
    try {
      await sendJson(`/api/v1/clients/${id}/rates`, "POST", {
        designation: rateDesignation,
        staffMonthRate: rateStaff,
        billMonthRate: rateBill,
        currency: "MVR",
      });
      toast.success("Designation rate saved");
      setRateDesignation("");
      setRateStaff("");
      setRateBill("");
      reloadRates();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save rate");
    } finally {
      setPending(false);
    }
  }

  async function removeRate(rateId: string) {
    setPending(true);
    try {
      await sendJson(`/api/v1/clients/${id}/rates/${rateId}`, "DELETE", {});
      toast.success("Rate removed");
      reloadRates();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not delete rate");
    } finally {
      setPending(false);
    }
  }

  function onTabChange(value: string) {
    const next: TabId = value === "details" || value === "rates" ? value : "employees";
    setTab(next);
    setTabInUrl(next);
  }

  return (
    <Shell
      title={client ? `JACMS · ${client.legalName}` : "JACMS · Client"}
      eyebrow="Client"
      description="Placements, billing rates, and client company details."
      actions={
        <>
          <Button variant="outline" asChild>
            <a href="/clients">
              <ArrowLeftIcon />
              All clients
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/allocations">Assign employees</a>
          </Button>
        </>
      }
    >
      <Banner message={error} error />
      {!client && !error ? <PageSkeleton /> : null}
      {client ? (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{client.legalName}</CardTitle>
                  <Badge variant="secondary">Client</Badge>
                </div>
                <CardDescription>
                  {client.registrationNumber ?? "No registration"}
                  {client.tinNumber ? ` · TIN ${client.tinNumber}` : ""} · {client.country ?? "No country"}
                </CardDescription>
              </div>
              <Badge variant="outline">
                <UsersIcon className="size-3.5" />
                {activeStaff.length} active
                {employerLabels.length
                  ? ` · ${employerLabels.length} employer${employerLabels.length === 1 ? "" : "s"}`
                  : ""}
              </Badge>
            </CardHeader>
          </Card>

          <Tabs value={tab} onValueChange={onTabChange} className="gap-4">
            <TabsList variant="line">
              <TabsTrigger value="employees">
                <UsersIcon className="size-4" />
                Employees
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {activeStaff.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="details">
                <Building2Icon className="size-4" />
                Client details
              </TabsTrigger>
              <TabsTrigger value="rates">
                <BadgePercentIcon className="size-4" />
                Monthly rates
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {rates.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="employees" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Allocated employees</CardTitle>
                  <CardDescription>
                    Staff assigned to this client from any legal employer. Manage placements on Allocations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <SearchField
                        value={staffQ}
                        onChange={setStaffQ}
                        placeholder="Search employee, employer, designation…"
                        label="Search allocated staff"
                      />
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/allocations">
                        <PlusIcon />
                        Manage allocations
                      </a>
                    </Button>
                  </div>
                  {!filteredStaff ? <PageSkeleton cards={1} /> : null}
                  {filteredStaff && !filteredStaff.length ? (
                    <ShellEmpty
                      title={staffQ.trim() ? "No matches" : "No allocated employees"}
                      description={
                        staffQ.trim()
                          ? "Try another name or employer."
                          : "Allocate staff to this client from Allocations, then bill them in Payroll."
                      }
                      action={
                        staffQ.trim() ? (
                          <Button type="button" variant="outline" onClick={() => setStaffQ("")}>
                            Clear search
                          </Button>
                        ) : (
                          <Button variant="outline" asChild>
                            <a href="/allocations">Open allocations</a>
                          </Button>
                        )
                      }
                    />
                  ) : null}
                  {filteredStaff?.length ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Legal employer</TableHead>
                            <TableHead>Designation</TableHead>
                            <TableHead>Staff / Client</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredStaff.map((row) => (
                            <TableRow
                              key={row.id}
                              className="cursor-pointer"
                              onClick={() => window.location.assign(`/employees?edit=${row.employeeId}`)}
                            >
                              <TableCell className="font-medium">{row.employeeName}</TableCell>
                              <TableCell>{row.employerName}</TableCell>
                              <TableCell>{row.designation ?? "—"}</TableCell>
                              <TableCell className="tabular-nums text-sm whitespace-nowrap">
                                {formatMoneyPair(row.staffSalary, row.billRate, row.currency)}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {row.resignDate
                                  ? formatDateRange(row.joinDate, row.resignDate)
                                  : formatDate(row.joinDate)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={row.status === "active" ? "default" : "secondary"}>
                                  {row.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Client details</CardTitle>
                  <CardDescription>Company record used for billing and placements.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="legalName"
                    label="Legal name"
                    value={draft.legalName}
                    onChange={(value) => setDraft((c) => ({ ...c, legalName: value }))}
                  />
                  <TextField
                    id="registrationNumber"
                    label="Registration number"
                    value={draft.registrationNumber}
                    onChange={(value) => setDraft((c) => ({ ...c, registrationNumber: value }))}
                  />
                  <TextField
                    id="tinNumber"
                    label="TIN number"
                    value={draft.tinNumber}
                    onChange={(value) => setDraft((c) => ({ ...c, tinNumber: value }))}
                  />
                  <TextField
                    id="country"
                    label="Country"
                    value={draft.country}
                    onChange={(value) => setDraft((c) => ({ ...c, country: value }))}
                  />
                  <div className="sm:col-span-2">
                    <AreaField
                      id="registeredAddress"
                      label="Address"
                      value={draft.registeredAddress}
                      onChange={(value) => setDraft((c) => ({ ...c, registeredAddress: value }))}
                    />
                  </div>
                  <TextField
                    id="phone"
                    label="Phone"
                    value={draft.phone}
                    onChange={(value) => setDraft((c) => ({ ...c, phone: value }))}
                  />
                  <TextField
                    id="email"
                    label="Email"
                    value={draft.email}
                    onChange={(value) => setDraft((c) => ({ ...c, email: value }))}
                  />
                  <div className="sm:col-span-2 flex justify-end">
                    <WhenEditing>
                      <Button type="button" disabled={pending} onClick={() => void saveDetails()}>
                        Save client details
                      </Button>
                    </WhenEditing>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rates" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly rates by designation</CardTitle>
                  <CardDescription>
                    Staff = paid to worker · Client = billed to this company. Payroll = monthly ÷ days-in-month × present days.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <WhenEditing>
                    <div className="grid gap-3 rounded-xl border bg-muted/15 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <DesignationField
                        id="rateDesignation"
                        value={rateDesignation}
                        onChange={setRateDesignation}
                        allowEmpty
                        emptyLabel="Select designation"
                        hint="From Designations catalog"
                      />
                      <TextField
                        id="rateStaff"
                        label="Staff / month"
                        value={rateStaff}
                        onChange={setRateStaff}
                        hint="e.g. 5500"
                      />
                      <TextField
                        id="rateBill"
                        label="Client / month"
                        value={rateBill}
                        onChange={setRateBill}
                        hint="e.g. 6000"
                      />
                      <div className="flex items-end">
                        <Button type="button" className="w-full" disabled={pending} onClick={() => void saveRate()}>
                          <PlusIcon className="size-4" />
                          Save rate
                        </Button>
                      </div>
                    </div>
                  </WhenEditing>

                  {rates.length ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Designation</TableHead>
                            <TableHead>Staff</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead className="w-10"> </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rates.map((rate) => (
                            <TableRow key={rate.id}>
                              <TableCell className="font-medium">{rate.designation}</TableCell>
                              <TableCell className="tabular-nums text-sm">{formatAmount(rate.staffMonthRate)}</TableCell>
                              <TableCell className="tabular-nums text-sm">{formatAmount(rate.billMonthRate)}</TableCell>
                              <TableCell>
                                <WhenEditing>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => void removeRate(rate.id)}
                                  >
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
                      title="No designation rates yet"
                      description="Add Labor / Mason / etc. monthly staff and client rates for payroll and billing."
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </Shell>
  );
}
