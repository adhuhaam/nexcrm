import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarPlusIcon, PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SelectField, TextField, AreaField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing, useOffice } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type ExpenseCategory =
  | "client_payment"
  | "investment"
  | "other"
  | "work_permit"
  | "insurance"
  | "medical"
  | "deposit";

type Expense = {
  id: string;
  expenseDate: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  clientCompanyId: string | null;
  clientName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  counterparty: string | null;
  note: string | null;
  recurrenceKey: string | null;
};

type Totals = {
  client_payment: string;
  investment: string;
  other: string;
  work_permit: string;
  insurance: string;
  medical: string;
  deposit: string;
  all: string;
};

type FinanceSummary = {
  currency: string;
  monthlyUnitCost: string;
  activeEmployees: number;
  projectedMonthlyStaffCost: string;
  totals: Totals;
  fees: {
    workPermitMonthly: string;
    insuranceYearly: string;
    medicalYearly: string;
  };
};

type Client = { id: string; legalName: string };
type EmployeeOption = { id: string; legalName: string };

type Draft = {
  id: string | null;
  expenseDate: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  clientCompanyId: string;
  employeeId: string;
  counterparty: string;
  note: string;
};

const categoryLabels: Record<ExpenseCategory, string> = {
  client_payment: "Client payment",
  investment: "Investment",
  other: "Other",
  work_permit: "Work permit",
  insurance: "Insurance",
  medical: "Medical",
  deposit: "Deposit",
};

function emptyDraft(): Draft {
  return {
    id: null,
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "MVR",
    category: "other",
    clientCompanyId: "",
    employeeId: "",
    counterparty: "",
    note: "",
  };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function ExpensesPage() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <Shell
      title="JACMS · Finance"
      eyebrow="Apps · Expenses"
      description="Employee cost ledger — work permit, insurance, medical, deposits — plus client payments and investments."
      actions={
        <WhenEditing>
          <Button
            type="button"
            onClick={() => {
              setDraft(emptyDraft());
              setOpen(true);
            }}
          >
            <PlusIcon />
            Add expense
          </Button>
        </WhenEditing>
      }
    >
      <ExpensesBody
        open={open}
        setOpen={setOpen}
        draft={draft}
        setDraft={setDraft}
        pending={pending}
        setPending={setPending}
        reloadKey={reloadKey}
        bumpReload={() => setReloadKey((value) => value + 1)}
      />
    </Shell>
  );
}

function ExpensesBody({
  open,
  setOpen,
  draft,
  setDraft,
  pending,
  setPending,
  reloadKey,
  bumpReload,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  draft: Draft;
  setDraft: (draft: Draft | ((current: Draft) => Draft)) => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
  reloadKey: number;
  bumpReload: () => void;
}) {
  const office = useOffice();
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [postMonth, setPostMonth] = useState(currentMonth());

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (employeeId) params.set("employeeId", employeeId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q.trim()) params.set("q", q.trim());
    const text = params.toString();
    return text ? `?${text}` : "";
  }, [category, employeeId, from, to, q]);

  function reload() {
    getJson<{ expenses: Expense[]; totals: Totals }>(`/api/v1/expenses${query}`)
      .then((data) => {
        setRows(data.expenses);
        setTotals(data.totals);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Could not load expenses");
        setRows([]);
        setTotals(null);
      });
    getJson<FinanceSummary>("/api/v1/expenses/finance-summary")
      .then(setSummary)
      .catch(() => setSummary(null));
  }

  useEffect(() => {
    reload();
  }, [query, reloadKey]);

  useEffect(() => {
    getJson<{ clients: Client[] }>("/api/v1/clients")
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
    getJson<{ employees: EmployeeOption[] }>("/api/v1/employees")
      .then((data) => setEmployees(data.employees.map((row) => ({ id: row.id, legalName: row.legalName }))))
      .catch(() => setEmployees([]));
  }, []);

  async function save() {
    setPending(true);
    try {
      const body = {
        expenseDate: draft.expenseDate,
        amount: draft.amount,
        currency: draft.currency,
        category: draft.category,
        clientCompanyId: draft.category === "client_payment" ? draft.clientCompanyId || null : null,
        employeeId: draft.employeeId || null,
        counterparty: draft.counterparty || null,
        note: draft.note || null,
      };
      if (draft.id) await sendJson(`/api/v1/expenses/${draft.id}`, "PATCH", body);
      else await sendJson("/api/v1/expenses", "POST", body);
      toast.success(draft.id ? "Expense updated" : "Expense recorded");
      setOpen(false);
      bumpReload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save expense");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!office.role?.canDelete) return;
    if (!window.confirm("Delete this expense?")) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/expenses/${id}`, "DELETE");
      toast.success("Expense deleted");
      bumpReload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not delete");
    } finally {
      setPending(false);
    }
  }

  async function runPostMonth() {
    setPending(true);
    try {
      const result = await sendJson<{ created: number; skipped: number; yearMonth: string; amount: string }>(
        "/api/v1/expenses/post-month",
        "POST",
        { yearMonth: postMonth },
      );
      toast.success(
        `Posted ${result.created} work permit rows for ${result.yearMonth} (${result.skipped} already existed)`,
      );
      bumpReload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not post month");
    } finally {
      setPending(false);
    }
  }

  async function runPostAnnual() {
    setPending(true);
    try {
      const year = postMonth.slice(0, 4);
      const result = await sendJson<{
        insuranceCreated: number;
        medicalCreated: number;
        skipped: number;
        year: string;
      }>("/api/v1/expenses/post-annual", "POST", { year });
      toast.success(
        `Annual ${result.year}: +${result.insuranceCreated} insurance, +${result.medicalCreated} medical (${result.skipped} skipped)`,
      );
      bumpReload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not post annual fees");
    } finally {
      setPending(false);
    }
  }

  const currency = summary?.currency ?? "MVR";
  const displayTotals = summary?.totals ?? totals;

  return (
    <>
      <Banner message={error} error />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {(
          [
            ["Work permit", displayTotals?.work_permit],
            ["Insurance", displayTotals?.insurance],
            ["Medical", displayTotals?.medical],
            ["Deposits", displayTotals?.deposit],
            ["Other", displayTotals?.other],
            ["All time", displayTotals?.all],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="tabular-nums text-lg">
                {value != null ? formatMoney(value, currency) : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Staff cost posting</CardTitle>
            <CardDescription>
              {summary
                ? `${summary.activeEmployees} active · ${formatMoney(summary.monthlyUnitCost, currency)}/employee/mo · projected ${formatMoney(summary.projectedMonthlyStaffCost, currency)}`
                : "Post monthly work permits and backfill annual insurance/medical."}
            </CardDescription>
          </div>
          <WhenEditing>
            <div className="flex flex-wrap items-end gap-2">
              <TextField
                id="post-month"
                label="Month"
                type="month"
                value={postMonth}
                onChange={setPostMonth}
              />
              <Button type="button" disabled={pending} onClick={() => void runPostMonth()}>
                <CalendarPlusIcon />
                Post this month (WP)
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void runPostAnnual()}>
                Post annual fees
              </Button>
            </div>
          </WhenEditing>
        </CardHeader>
        {summary ? (
          <CardContent className="text-sm text-muted-foreground">
            Rates: WP {formatMoney(summary.fees.workPermitMonthly, currency)}/mo · Insurance{" "}
            {formatMoney(summary.fees.insuranceYearly, currency)}/yr · Medical{" "}
            {formatMoney(summary.fees.medicalYearly, currency)}/yr. Edit in Settings → Finance.
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow by category, employee, date range, or search.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField id="filter-category" label="Category" value={category} onChange={setCategory}>
            <option value="">All categories</option>
            {(Object.keys(categoryLabels) as ExpenseCategory[]).map((key) => (
              <option key={key} value={key}>
                {categoryLabels[key]}
              </option>
            ))}
          </SelectField>
          <SelectField id="filter-employee" label="Employee" value={employeeId} onChange={setEmployeeId}>
            <option value="">All employees</option>
            {employees.map((row) => (
              <option key={row.id} value={row.id}>
                {row.legalName}
              </option>
            ))}
          </SelectField>
          <TextField id="filter-from" label="From" type="date" value={from} onChange={setFrom} />
          <TextField id="filter-to" label="To" type="date" value={to} onChange={setTo} />
          <TextField id="filter-q" label="Search" value={q} onChange={setQ} hint="Note, counterparty, employee" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>Date, category, employee, amount, and recurrence notes.</CardDescription>
        </CardHeader>
        <CardContent>
          {!rows && !error ? <PageSkeleton cards={1} /> : null}
          {rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(row.expenseDate)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{categoryLabels[row.category]}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.employeeName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.clientName ?? row.counterparty ?? "—"}</div>
                      {row.note ? <div className="text-xs text-muted-foreground">{row.note}</div> : null}
                      {row.recurrenceKey ? (
                        <div className="text-xs text-muted-foreground font-mono">{row.recurrenceKey}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {formatMoney(row.amount, row.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <WhenEditing>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDraft({
                                id: row.id,
                                expenseDate: row.expenseDate,
                                amount: row.amount,
                                currency: row.currency,
                                category: row.category,
                                clientCompanyId: row.clientCompanyId ?? "",
                                employeeId: row.employeeId ?? "",
                                counterparty: row.counterparty ?? "",
                                note: row.note ?? "",
                              });
                              setOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        </WhenEditing>
                        {office.role?.canDelete ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={pending}
                            aria-label="Delete expense"
                            onClick={() => void remove(row.id)}
                          >
                            <Trash2Icon />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {rows && !rows.length ? (
            <ShellEmpty
              icon={<ReceiptIcon className="size-8 opacity-60" />}
              title="No expenses yet"
              description="Post work permits for the month, or record a client payment / investment."
            />
          ) : null}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? "Edit expense" : "Add expense"}
        description="Client payments can link to a client. Staff fees can link to an employee."
        pending={pending}
        submitLabel={draft.id ? "Save changes" : "Record expense"}
        onSubmit={save}
      >
        <TextField
          id="expense-date"
          label="Date"
          type="date"
          value={draft.expenseDate}
          onChange={(value) => setDraft((current) => ({ ...current, expenseDate: value }))}
        />
        <TextField
          id="expense-amount"
          label="Amount"
          value={draft.amount}
          onChange={(value) => setDraft((current) => ({ ...current, amount: value }))}
        />
        <TextField
          id="expense-currency"
          label="Currency"
          value={draft.currency}
          onChange={(value) => setDraft((current) => ({ ...current, currency: value }))}
        />
        <SelectField
          id="expense-category"
          label="Category"
          value={draft.category}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              category: value as ExpenseCategory,
              clientCompanyId: value === "client_payment" ? current.clientCompanyId : "",
            }))
          }
        >
          {(Object.keys(categoryLabels) as ExpenseCategory[]).map((key) => (
            <option key={key} value={key}>
              {categoryLabels[key]}
            </option>
          ))}
        </SelectField>
        {draft.category === "client_payment" ? (
          <SelectField
            id="expense-client"
            label="Client (optional)"
            value={draft.clientCompanyId}
            onChange={(value) => setDraft((current) => ({ ...current, clientCompanyId: value }))}
          >
            <option value="">No linked client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.legalName}
              </option>
            ))}
          </SelectField>
        ) : null}
        <SelectField
          id="expense-employee"
          label="Employee (optional)"
          value={draft.employeeId}
          onChange={(value) => setDraft((current) => ({ ...current, employeeId: value }))}
        >
          <option value="">No linked employee</option>
          {employees.map((row) => (
            <option key={row.id} value={row.id}>
              {row.legalName}
            </option>
          ))}
        </SelectField>
        <TextField
          id="expense-counterparty"
          label={draft.category === "client_payment" ? "Payee note (optional)" : "Counterparty"}
          value={draft.counterparty}
          onChange={(value) => setDraft((current) => ({ ...current, counterparty: value }))}
        />
        <div className="sm:col-span-2">
          <AreaField
            id="expense-note"
            label="Note"
            value={draft.note}
            onChange={(value) => setDraft((current) => ({ ...current, note: value }))}
          />
        </div>
      </FormDialog>
    </>
  );
}
