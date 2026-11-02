import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SelectField, TextField, AreaField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing, useOffice } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";

type ExpenseCategory = "client_payment" | "investment" | "other";

type Expense = {
  id: string;
  expenseDate: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  clientCompanyId: string | null;
  clientName: string | null;
  counterparty: string | null;
  note: string | null;
};

type Totals = {
  client_payment: string;
  investment: string;
  other: string;
  all: string;
};

type Client = { id: string; legalName: string };

type Draft = {
  id: string | null;
  expenseDate: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  clientCompanyId: string;
  counterparty: string;
  note: string;
};

const categoryLabels: Record<ExpenseCategory, string> = {
  client_payment: "Client payment",
  investment: "Investment",
  other: "Other",
};

function emptyDraft(): Draft {
  return {
    id: null,
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "MVR",
    category: "other",
    clientCompanyId: "",
    counterparty: "",
    note: "",
  };
}

export function ExpensesPage() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <Shell
      title="NEXCRM · Expenses"
      eyebrow="Apps"
      description="Track money paid to clients, investments, and other organization outflows."
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
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q.trim()) params.set("q", q.trim());
    const text = params.toString();
    return text ? `?${text}` : "";
  }, [category, from, to, q]);

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
  }

  useEffect(() => {
    reload();
  }, [query, reloadKey]);

  useEffect(() => {
    getJson<{ clients: Client[] }>("/api/v1/clients")
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
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

  return (
    <>
      <Banner message={error} error />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>All</CardDescription>
            <CardTitle className="tabular-nums text-xl">{totals?.all ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Client payments</CardDescription>
            <CardTitle className="tabular-nums text-xl">{totals?.client_payment ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Investments</CardDescription>
            <CardTitle className="tabular-nums text-xl">{totals?.investment ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Other</CardDescription>
            <CardTitle className="tabular-nums text-xl">{totals?.other ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow by category, date range, or search.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField id="filter-category" label="Category" value={category} onChange={setCategory}>
            <option value="">All categories</option>
            <option value="client_payment">Client payment</option>
            <option value="investment">Investment</option>
            <option value="other">Other</option>
          </SelectField>
          <TextField id="filter-from" label="From" type="date" value={from} onChange={setFrom} />
          <TextField id="filter-to" label="To" type="date" value={to} onChange={setTo} />
          <TextField id="filter-q" label="Search" value={q} onChange={setQ} hint="Counterparty, note, or client" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
          <CardDescription>Linked client payments and free-text counterparties for investments and other.</CardDescription>
        </CardHeader>
        <CardContent>
          {!rows && !error ? <PageSkeleton cards={1} /> : null}
          {rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Paid to</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{row.expenseDate}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{categoryLabels[row.category]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.clientName ?? row.counterparty ?? "—"}</div>
                      {row.clientName && row.counterparty ? (
                        <div className="text-xs text-muted-foreground">{row.counterparty}</div>
                      ) : null}
                      {row.note ? <div className="text-xs text-muted-foreground">{row.note}</div> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {row.amount} {row.currency}
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
              description="Record a client payment, investment, or other outflow."
            />
          ) : null}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? "Edit expense" : "Add expense"}
        description="Client payments can optionally link to a client company."
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
          <option value="client_payment">Client payment</option>
          <option value="investment">Investment</option>
          <option value="other">Other</option>
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
        <TextField
          id="expense-counterparty"
          label={draft.category === "client_payment" ? "Payee note (optional)" : "Counterparty"}
          value={draft.counterparty}
          onChange={(value) => setDraft((current) => ({ ...current, counterparty: value }))}
          hint={
            draft.category === "investment"
              ? "Investment name or vehicle"
              : draft.category === "other"
                ? "Who or what was paid"
                : undefined
          }
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
