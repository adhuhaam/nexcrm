import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, SelectField } from "../../components/form";
import { Field, Loading, SectionLabel } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";

type Option = { id: string; name: string; projectId?: string; siteId?: string };
type Company = { id: string; legalName: string };

type EmployeeForm = {
  companyId: string;
  legalName: string;
  preferredName: string;
  passportNumber: string;
  passportIssueDate: string;
  passportExpiry: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  permanentAddress: string;
  emergencyContact: string;
  occupation: string;
  employmentStatus: string;
  projectId: string;
  siteId: string;
  quotaPoolId: string;
  workSite: string;
  siteCode: string;
  salary: string;
  benefits: string;
  paidVacation: string;
  workingHours: string;
  contractDuration: string;
  country: string;
  origin: string;
};

const blank: EmployeeForm = {
  companyId: "",
  legalName: "",
  preferredName: "",
  passportNumber: "",
  passportIssueDate: "",
  passportExpiry: "",
  nationality: "",
  dateOfBirth: "",
  gender: "",
  permanentAddress: "",
  emergencyContact: "",
  occupation: "",
  employmentStatus: "active",
  projectId: "",
  siteId: "",
  quotaPoolId: "",
  workSite: "",
  siteCode: "",
  salary: "",
  benefits: "",
  paidVacation: "",
  workingHours: "",
  contractDuration: "",
  country: "",
  origin: "",
};

function fromRecord(record: Record<string, string | null | undefined>): EmployeeForm {
  const text = (key: keyof EmployeeForm) => record[key] ?? "";
  return {
    companyId: record.companyId ?? "",
    legalName: text("legalName"),
    preferredName: text("preferredName"),
    passportNumber: text("passportNumber"),
    passportIssueDate: text("passportIssueDate"),
    passportExpiry: text("passportExpiry"),
    nationality: text("nationality"),
    dateOfBirth: text("dateOfBirth"),
    gender: text("gender"),
    permanentAddress: text("permanentAddress"),
    emergencyContact: text("emergencyContact"),
    occupation: text("occupation"),
    employmentStatus: text("employmentStatus") || "active",
    projectId: text("projectId"),
    siteId: text("siteId"),
    quotaPoolId: text("quotaPoolId"),
    workSite: text("workSite"),
    siteCode: text("siteCode"),
    salary: text("salary"),
    benefits: text("benefits"),
    paidVacation: text("paidVacation"),
    workingHours: text("workingHours"),
    contractDuration: text("contractDuration"),
    country: text("country"),
    origin: text("origin"),
  };
}

export default function EmployeeFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id || id === "new";
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [quotaPools, setQuotaPools] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!isNew && id) {
          const data = await getJson<{
            employee: Record<string, string | null>;
            companies: Company[];
            projects: Option[];
            sites: Option[];
            quotaPools: Option[];
          }>(`/api/v1/employees/${id}`);
          if (cancelled) return;
          setCompanies(data.companies);
          setProjects(data.projects);
          setSites(data.sites);
          setQuotaPools(data.quotaPools);
          setForm(fromRecord(data.employee));
        } else {
          const data = await getJson<{
            companies: Company[];
            preferences?: { selectedCompanyId: string | null; defaultCompanyId: string | null };
          }>("/api/v1/companies?kind=employer");
          if (cancelled) return;
          setCompanies(data.companies);
          const companyId =
            data.preferences?.selectedCompanyId ??
            data.preferences?.defaultCompanyId ??
            data.companies[0]?.id ??
            "";
          setForm({ ...blank, companyId });
          if (companyId) {
            const options = await getJson<{ projects: Option[]; sites: Option[]; quotaPools: Option[] }>(
              `/api/v1/employees/options?companyId=${companyId}`,
            );
            if (cancelled) return;
            setProjects(options.projects);
            setSites(options.sites);
            setQuotaPools(options.quotaPools);
          }
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load employee form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  async function onCompanyChange(companyId: string) {
    setForm((current) => (current ? { ...current, companyId, projectId: "", siteId: "", quotaPoolId: "" } : current));
    if (!companyId) {
      setProjects([]);
      setSites([]);
      setQuotaPools([]);
      return;
    }
    const options = await getJson<{ projects: Option[]; sites: Option[]; quotaPools: Option[] }>(
      `/api/v1/employees/options?companyId=${companyId}`,
    );
    setProjects(options.projects);
    setSites(options.sites);
    setQuotaPools(options.quotaPools);
  }

  if (!form && !error) return <Loading />;
  if (!form) {
    return <FormScreen error={error} onSubmit={() => router.back()} submitLabel="Go back">{null}</FormScreen>;
  }

  function set<K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const saved = await sendJson<{ id?: string; employee?: { id: string } }>(
        isNew ? "/api/v1/employees" : `/api/v1/employees/${id}`,
        isNew ? "POST" : "PATCH",
        form as unknown as Record<string, unknown>,
      );
      const nextId = saved.id ?? saved.employee?.id ?? id;
      router.replace(`/employees/${nextId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save employee");
      setPending(false);
    }
  }

  const filteredSites = sites.filter((site) => !form.projectId || site.projectId === form.projectId);
  const filteredPools = quotaPools.filter((pool) => !form.siteId || pool.siteId === form.siteId);

  return (
    <FormScreen
      error={error}
      pending={pending}
      submitLabel={isNew ? "Create employee" : "Save changes"}
      onSubmit={() => void save()}
    >
      <SectionLabel>Assignment</SectionLabel>
      <SelectField
        label="Employer"
        value={form.companyId}
        onChange={(value) => void onCompanyChange(value)}
        options={companies.map((item) => ({ value: item.id, label: item.legalName }))}
      />
      <SelectField
        label="Project"
        value={form.projectId}
        onChange={(value) => set("projectId", value)}
        options={[{ value: "", label: "None" }, ...projects.map((item) => ({ value: item.id, label: item.name }))]}
      />
      <SelectField
        label="Site"
        value={form.siteId}
        onChange={(value) => set("siteId", value)}
        options={[{ value: "", label: "None" }, ...filteredSites.map((item) => ({ value: item.id, label: item.name }))]}
      />
      <SelectField
        label="Quota pool"
        value={form.quotaPoolId}
        onChange={(value) => set("quotaPoolId", value)}
        options={[{ value: "", label: "None" }, ...filteredPools.map((item) => ({ value: item.id, label: item.name }))]}
      />

      <SectionLabel>Identity</SectionLabel>
      <Field label="Legal name" value={form.legalName} onChangeText={(value) => set("legalName", value)} autoCapitalize="words" />
      <Field label="Preferred name" value={form.preferredName} onChangeText={(value) => set("preferredName", value)} />
      <Field label="Passport number" value={form.passportNumber} onChangeText={(value) => set("passportNumber", value)} />
      <Field label="Passport issue (YYYY-MM-DD)" value={form.passportIssueDate} onChangeText={(value) => set("passportIssueDate", value)} />
      <Field label="Passport expiry (YYYY-MM-DD)" value={form.passportExpiry} onChangeText={(value) => set("passportExpiry", value)} />
      <Field label="Nationality" value={form.nationality} onChangeText={(value) => set("nationality", value)} />
      <Field label="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={(value) => set("dateOfBirth", value)} />
      <Field label="Gender" value={form.gender} onChangeText={(value) => set("gender", value)} />
      <Field label="Permanent address" value={form.permanentAddress} onChangeText={(value) => set("permanentAddress", value)} />
      <Field label="Emergency contact" value={form.emergencyContact} onChangeText={(value) => set("emergencyContact", value)} />

      <SectionLabel>Employment</SectionLabel>
      <Field label="Occupation" value={form.occupation} onChangeText={(value) => set("occupation", value)} />
      <Field label="Status" value={form.employmentStatus} onChangeText={(value) => set("employmentStatus", value)} />
      <Field label="Work site" value={form.workSite} onChangeText={(value) => set("workSite", value)} />
      <Field label="Site code" value={form.siteCode} onChangeText={(value) => set("siteCode", value)} />
      <Field label="Salary" value={form.salary} onChangeText={(value) => set("salary", value)} keyboardType="decimal-pad" />
      <Field label="Benefits" value={form.benefits} onChangeText={(value) => set("benefits", value)} />
      <Field label="Paid vacation" value={form.paidVacation} onChangeText={(value) => set("paidVacation", value)} />
      <Field label="Working hours" value={form.workingHours} onChangeText={(value) => set("workingHours", value)} />
      <Field label="Contract duration" value={form.contractDuration} onChangeText={(value) => set("contractDuration", value)} />
      <Field label="Country" value={form.country} onChangeText={(value) => set("country", value)} />
      <Field label="Origin" value={form.origin} onChangeText={(value) => set("origin", value)} />
    </FormScreen>
  );
}
