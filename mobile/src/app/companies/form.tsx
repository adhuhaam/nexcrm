import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, SelectField } from "../../components/form";
import { Field, Loading } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";
import { blankCompany, companyPayload, type CompanyDraft } from "../../lib/company";

export default function CompanyFormScreen() {
  const router = useRouter();
  const { id, kind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const isNew = !id || id === "new";
  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isNew) {
        if (!cancelled) setDraft(blankCompany(kind === "client" ? "client" : "employer"));
        return;
      }
      try {
        const company = await getJson<CompanyDraft & { id: string }>(`/api/v1/companies/${id}`);
        if (cancelled) return;
        setDraft({
          id: company.id,
          kind: company.kind === "client" ? "client" : "employer",
          legalName: company.legalName ?? "",
          registrationNumber: company.registrationNumber ?? "",
          registeredAddress: company.registeredAddress ?? "",
          country: company.country ?? "",
          businessActivity: company.businessActivity ?? "",
          phone: company.phone ?? "",
          email: company.email ?? "",
          documentPrefix: company.documentPrefix ?? "",
          signatoryName: company.signatoryName ?? "",
          signatoryTitle: company.signatoryTitle ?? "",
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load company");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, kind]);

  if (!draft && !error) return <Loading />;
  if (!draft) {
    return <FormScreen error={error} onSubmit={() => router.back()} submitLabel="Go back">{null}</FormScreen>;
  }

  function set<K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const saved = await sendJson<{ id: string }>(
        draft!.id ? `/api/v1/companies/${draft!.id}` : "/api/v1/companies",
        draft!.id ? "PATCH" : "POST",
        companyPayload(draft!),
      );
      if (draft!.kind === "client") router.replace("/(tabs)/clients");
      else router.replace(`/companies/${saved.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save company");
      setPending(false);
    }
  }

  return (
    <FormScreen error={error} pending={pending} submitLabel={draft.id ? "Save changes" : "Create"} onSubmit={() => void save()}>
      <SelectField
        label="Kind"
        value={draft.kind}
        onChange={(value) => set("kind", value === "client" ? "client" : "employer")}
        options={[
          { value: "employer", label: "Employer" },
          { value: "client", label: "Client" },
        ]}
      />
      <Field label="Legal name" value={draft.legalName} onChangeText={(value) => set("legalName", value)} autoCapitalize="words" />
      <Field label="Registration number" value={draft.registrationNumber} onChangeText={(value) => set("registrationNumber", value)} />
      <Field label="Registered address" value={draft.registeredAddress} onChangeText={(value) => set("registeredAddress", value)} />
      <Field label="Country" value={draft.country} onChangeText={(value) => set("country", value)} />
      <Field label="Business activity" value={draft.businessActivity} onChangeText={(value) => set("businessActivity", value)} />
      <Field label="Phone" value={draft.phone} onChangeText={(value) => set("phone", value)} keyboardType="phone-pad" />
      <Field label="Email" value={draft.email} onChangeText={(value) => set("email", value)} keyboardType="email-address" />
      <Field label="Document prefix" value={draft.documentPrefix} onChangeText={(value) => set("documentPrefix", value)} />
      <Field label="Signatory name" value={draft.signatoryName} onChangeText={(value) => set("signatoryName", value)} />
      <Field label="Signatory title" value={draft.signatoryTitle} onChangeText={(value) => set("signatoryTitle", value)} />
    </FormScreen>
  );
}
