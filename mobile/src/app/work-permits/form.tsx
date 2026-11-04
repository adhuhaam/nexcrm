import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, SelectField } from "../../components/form";
import { Field, Loading, SectionLabel } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";

type Company = { id: string; legalName: string };

type Draft = {
  companyId: string;
  legalName: string;
  workPermitNumber: string;
  nationality: string;
  country: string;
  gender: string;
  dateOfBirth: string;
  passportNumber: string;
  passportExpiry: string;
  occupation: string;
  issuedOn: string;
  expiresOn: string;
  feePaidUntil: string;
  medicalExpiry: string;
  insuranceExpiry: string;
  origin: string;
  salary: string;
  arrivalDate: string;
  workVisaNumber: string;
  workVisaExpiry: string;
  contractExpiry: string;
};

function emptyDraft(companyId = ""): Draft {
  return {
    companyId,
    legalName: "",
    workPermitNumber: "",
    nationality: "",
    country: "",
    gender: "",
    dateOfBirth: "",
    passportNumber: "",
    passportExpiry: "",
    occupation: "",
    issuedOn: "",
    expiresOn: "",
    feePaidUntil: "",
    medicalExpiry: "",
    insuranceExpiry: "",
    origin: "",
    salary: "",
    arrivalDate: "",
    workVisaNumber: "",
    workVisaExpiry: "",
    contractExpiry: "",
  };
}

export default function WorkPermitFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const companyData = await getJson<{
          companies: Company[];
          preferences?: { selectedCompanyId: string | null; defaultCompanyId: string | null };
        }>("/api/v1/companies?kind=employer");
        if (cancelled) return;
        setCompanies(companyData.companies);
        const companyId =
          companyData.preferences?.selectedCompanyId ??
          companyData.preferences?.defaultCompanyId ??
          companyData.companies[0]?.id ??
          "";
        if (isNew) {
          setDraft(emptyDraft(companyId));
          return;
        }
        const permit = await getJson<Draft & { id: string }>(`/api/v1/work-permits/${id}`);
        if (cancelled) return;
        const next = emptyDraft(permit.companyId || companyId);
        for (const key of Object.keys(next) as (keyof Draft)[]) {
          next[key] = (permit[key] as string | null | undefined) ?? "";
        }
        setDraft(next);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load work permit");
      }
    })();
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
      const body: Record<string, string> = {};
      for (const [key, value] of Object.entries(draft!)) body[key] = value ?? "";
      await sendJson(isNew ? "/work-permits" : `/work-permits/${id}`, "POST", body);
      router.replace("/work-permits");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save work permit");
      setPending(false);
    }
  }

  return (
    <FormScreen
      error={error}
      pending={pending}
      submitLabel={isNew ? "Create permit" : "Save changes"}
      onSubmit={() => void save()}
    >
      <SelectField
        label="Employer"
        value={draft.companyId}
        onChange={(value) => set("companyId", value)}
        options={companies.map((item) => ({ value: item.id, label: item.legalName }))}
      />
      <SectionLabel>Permit holder</SectionLabel>
      <Field label="Name" value={draft.legalName} onChangeText={(value) => set("legalName", value)} />
      <Field label="Work permit number" value={draft.workPermitNumber} onChangeText={(value) => set("workPermitNumber", value)} />
      <Field label="Occupation" value={draft.occupation} onChangeText={(value) => set("occupation", value)} />
      <Field label="Nationality" value={draft.nationality} onChangeText={(value) => set("nationality", value)} />
      <Field label="Passport number" value={draft.passportNumber} onChangeText={(value) => set("passportNumber", value)} />
      <Field label="Passport expiry" value={draft.passportExpiry} onChangeText={(value) => set("passportExpiry", value)} />
      <Field label="Issued on" value={draft.issuedOn} onChangeText={(value) => set("issuedOn", value)} />
      <Field label="Expires on" value={draft.expiresOn} onChangeText={(value) => set("expiresOn", value)} />
      <Field label="Salary" value={draft.salary} onChangeText={(value) => set("salary", value)} />
      <Field label="Arrival date" value={draft.arrivalDate} onChangeText={(value) => set("arrivalDate", value)} />
      <Field label="Work visa number" value={draft.workVisaNumber} onChangeText={(value) => set("workVisaNumber", value)} />
      <Field label="Work visa expiry" value={draft.workVisaExpiry} onChangeText={(value) => set("workVisaExpiry", value)} />
      <Field label="Contract expiry" value={draft.contractExpiry} onChangeText={(value) => set("contractExpiry", value)} />
    </FormScreen>
  );
}
