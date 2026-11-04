import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen } from "../../components/form";
import { Field, Loading } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";

type Draft = {
  id: string | null;
  legalName: string;
  registrationNumber: string;
  country: string;
  phone: string;
  email: string;
};

const blank: Draft = {
  id: null,
  legalName: "",
  registrationNumber: "",
  country: "",
  phone: "",
  email: "",
};

export default function ClientFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const [draft, setDraft] = useState<Draft | null>(isNew ? blank : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getJson<{
      id: string;
      legalName: string;
      registrationNumber: string | null;
      country: string | null;
      phone: string | null;
      email: string | null;
    }>(`/api/v1/companies/${id}`)
      .then((client) => {
        if (cancelled) return;
        setDraft({
          id: client.id,
          legalName: client.legalName ?? "",
          registrationNumber: client.registrationNumber ?? "",
          country: client.country ?? "",
          phone: client.phone ?? "",
          email: client.email ?? "",
        });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load client");
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

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
        kind: "client",
        legalName: draft!.legalName,
        registrationNumber: draft!.registrationNumber,
        country: draft!.country,
        phone: draft!.phone,
        email: draft!.email,
      };
      if (draft!.id) await sendJson(`/api/v1/companies/${draft!.id}`, "PATCH", body);
      else await sendJson("/api/v1/clients", "POST", body);
      router.replace("/(tabs)/clients");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save client");
      setPending(false);
    }
  }

  return (
    <FormScreen error={error} pending={pending} submitLabel={draft.id ? "Save changes" : "Create client"} onSubmit={() => void save()}>
      <Field label="Legal name" value={draft.legalName} onChangeText={(value) => set("legalName", value)} autoCapitalize="words" />
      <Field label="Registration number" value={draft.registrationNumber} onChangeText={(value) => set("registrationNumber", value)} />
      <Field label="Country" value={draft.country} onChangeText={(value) => set("country", value)} />
      <Field label="Phone" value={draft.phone} onChangeText={(value) => set("phone", value)} keyboardType="phone-pad" />
      <Field label="Email" value={draft.email} onChangeText={(value) => set("email", value)} keyboardType="email-address" />
    </FormScreen>
  );
}
