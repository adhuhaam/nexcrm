import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, SelectField } from "../../components/form";
import { Field, Loading } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";

type Client = { id: string; legalName: string };
type ExpenseCategory = "client_payment" | "investment" | "other";

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

export default function ExpenseFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { canDelete } = usePermissions();
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const clientData = await getJson<{ clients: Client[] }>("/api/v1/clients");
        if (cancelled) return;
        setClients(clientData.clients);
        if (!id) {
          setDraft(emptyDraft());
          return;
        }
        const expense = await getJson<{
          id: string;
          expenseDate: string;
          amount: string;
          currency: string;
          category: ExpenseCategory;
          clientCompanyId: string | null;
          counterparty: string | null;
          note: string | null;
        }>(`/api/v1/expenses/${id}`);
        if (cancelled) return;
        setDraft({
          id: expense.id,
          expenseDate: expense.expenseDate,
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category,
          clientCompanyId: expense.clientCompanyId ?? "",
          counterparty: expense.counterparty ?? "",
          note: expense.note ?? "",
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load expense");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!draft && !error) return <Loading />;
  if (!draft) {
    return <FormScreen error={error} onSubmit={() => router.back()} submitLabel="Go back">{null}</FormScreen>;
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const body = {
        expenseDate: draft!.expenseDate,
        amount: draft!.amount,
        currency: draft!.currency,
        category: draft!.category,
        clientCompanyId: draft!.clientCompanyId || null,
        counterparty: draft!.counterparty,
        note: draft!.note,
      };
      if (draft!.id) await sendJson(`/api/v1/expenses/${draft!.id}`, "PATCH", body);
      else await sendJson("/api/v1/expenses", "POST", body);
      router.replace("/expenses" as never);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save expense");
      setPending(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setPending(true);
    setError(null);
    try {
      await sendJson(`/api/v1/expenses/${draft.id}`, "DELETE");
      router.replace("/expenses" as never);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete expense");
      setPending(false);
    }
  }

  return (
    <FormScreen
      error={error}
      pending={pending}
      submitLabel={draft.id ? "Save changes" : "Add expense"}
      onSubmit={() => void save()}
      secondaryLabel={draft.id && canDelete ? "Delete expense" : undefined}
      onSecondary={draft.id && canDelete ? () => void remove() : undefined}
    >
      <Field label="Date (YYYY-MM-DD)" value={draft.expenseDate} onChangeText={(value) => set("expenseDate", value)} />
      <Field label="Amount" value={draft.amount} onChangeText={(value) => set("amount", value)} keyboardType="decimal-pad" />
      <Field label="Currency" value={draft.currency} onChangeText={(value) => set("currency", value)} />
      <SelectField
        label="Category"
        value={draft.category}
        onChange={(value) => set("category", value as ExpenseCategory)}
        options={[
          { value: "client_payment", label: "Client payment" },
          { value: "investment", label: "Investment" },
          { value: "other", label: "Other" },
        ]}
      />
      <SelectField
        label="Client"
        value={draft.clientCompanyId}
        onChange={(value) => set("clientCompanyId", value)}
        options={[{ value: "", label: "None" }, ...clients.map((item) => ({ value: item.id, label: item.legalName }))]}
      />
      <Field label="Counterparty" value={draft.counterparty} onChangeText={(value) => set("counterparty", value)} />
      <Field label="Note" value={draft.note} onChangeText={(value) => set("note", value)} />
    </FormScreen>
  );
}
