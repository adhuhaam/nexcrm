import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, SelectField } from "../../components/form";
import { Field, Loading } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";

type Company = { id: string; legalName: string };

export default function PayrollFormScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<Company[]>([]);
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson<{ payRuns: unknown[]; clients: Company[] }>("/api/v1/pay-runs")
      .then((data) => {
        if (cancelled) return;
        setClients(data.clients);
        setClientCompanyId(data.clients[0]?.id ?? "");
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load clients");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready && !error) return <Loading />;

  async function save() {
    setPending(true);
    setError(null);
    try {
      const created = await sendJson<{ id: string }>("/api/v1/pay-runs", "POST", {
        clientCompanyId,
        periodStart,
        periodEnd,
      });
      router.replace(`/payroll/${created.id}` as never);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create pay run");
      setPending(false);
    }
  }

  return (
    <FormScreen error={error} pending={pending} submitLabel="Generate pay run" onSubmit={() => void save()}>
      <SelectField
        label="Client"
        value={clientCompanyId}
        onChange={setClientCompanyId}
        options={clients.map((item) => ({ value: item.id, label: item.legalName }))}
      />
      <Field label="Period start (YYYY-MM-DD)" value={periodStart} onChangeText={setPeriodStart} />
      <Field label="Period end (YYYY-MM-DD)" value={periodEnd} onChangeText={setPeriodEnd} />
    </FormScreen>
  );
}
