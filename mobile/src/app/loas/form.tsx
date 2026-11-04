import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, SelectField } from "../../components/form";
import { Field, Loading, SectionLabel } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";

type Company = {
  id: string;
  legalName: string;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  registeredAddress?: string | null;
  phone?: string | null;
  email?: string | null;
};
type EmployeeOption = { id: string; legalName: string };

type LoaState = {
  companyId: string;
  employeeId: string;
  documentNumber: string;
  letterDate: string;
  signatoryName: string;
  signatoryTitle: string;
  letterheadAddress: string;
  phone: string;
  email: string;
  legalName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  permanentAddress: string;
  emergencyContact: string;
  occupation: string;
  workSite: string;
  siteCode: string;
  basicSalary: string;
  benefits: string;
  paidVacation: string;
  workingHours: string;
  contractDuration: string;
  employmentStatus: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const text = (value: string | null | undefined) => value ?? "";

export default function LoaFormScreen() {
  const router = useRouter();
  const { employeeId: presetEmployeeId, companyId: presetCompanyId } = useLocalSearchParams<{
    employeeId?: string;
    companyId?: string;
  }>();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [state, setState] = useState<LoaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const query = new URLSearchParams();
        if (presetEmployeeId) query.set("employeeId", presetEmployeeId);
        if (presetCompanyId) query.set("companyId", presetCompanyId);
        const context = await getJson<{
          companies: Company[];
          company: Company | null;
          employees: EmployeeOption[];
          employee: Record<string, string | null> | null;
          documentNumber: string | null;
        }>(`/api/v1/hr/editor-context?${query.toString()}`);
        if (cancelled) return;
        setCompanies(context.companies);
        setEmployees(context.employees);
        const employee = context.employee;
        setState({
          companyId: context.company?.id ?? "",
          employeeId: employee?.id ?? "",
          documentNumber: context.documentNumber ?? "",
          letterDate: today(),
          signatoryName: text(context.company?.signatoryName),
          signatoryTitle: text(context.company?.signatoryTitle),
          letterheadAddress: text(context.company?.registeredAddress),
          phone: text(context.company?.phone),
          email: text(context.company?.email),
          legalName: text(employee?.legalName),
          passportNumber: text(employee?.passportNumber),
          nationality: text(employee?.nationality),
          dateOfBirth: text(employee?.dateOfBirth),
          permanentAddress: text(employee?.permanentAddress),
          emergencyContact: text(employee?.emergencyContact),
          occupation: text(employee?.occupation),
          workSite: text(employee?.workSite),
          siteCode: text(employee?.siteCode),
          basicSalary: text(employee?.salary),
          benefits: text(employee?.benefits),
          paidVacation: text(employee?.paidVacation),
          workingHours: text(employee?.workingHours),
          contractDuration: text(employee?.contractDuration),
          employmentStatus: text(employee?.employmentStatus),
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open LOA form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presetCompanyId, presetEmployeeId]);

  async function changeCompany(companyId: string) {
    if (!state) return;
    const context = await getJson<{
      companies: Company[];
      company: Company | null;
      employees: EmployeeOption[];
      documentNumber: string | null;
    }>(`/api/v1/hr/editor-context?companyId=${companyId}`);
    setCompanies(context.companies);
    setEmployees(context.employees);
    setState({
      ...state,
      companyId,
      employeeId: "",
      documentNumber: context.documentNumber ?? "",
      signatoryName: text(context.company?.signatoryName),
      signatoryTitle: text(context.company?.signatoryTitle),
      letterheadAddress: text(context.company?.registeredAddress),
      phone: text(context.company?.phone),
      email: text(context.company?.email),
      legalName: "",
      passportNumber: "",
      nationality: "",
      dateOfBirth: "",
      permanentAddress: "",
      emergencyContact: "",
      occupation: "",
      workSite: "",
      siteCode: "",
      basicSalary: "",
      benefits: "",
      paidVacation: "",
      workingHours: "",
      contractDuration: "",
      employmentStatus: "",
    });
  }

  async function changeEmployee(employeeId: string) {
    if (!state) return;
    if (!employeeId) {
      setState({ ...state, employeeId: "", legalName: "" });
      return;
    }
    const data = await getJson<{ employee: Record<string, string | null> }>(`/api/v1/employees/${employeeId}`);
    const employee = data.employee;
    setState({
      ...state,
      employeeId,
      legalName: text(employee.legalName),
      passportNumber: text(employee.passportNumber),
      nationality: text(employee.nationality),
      dateOfBirth: text(employee.dateOfBirth),
      permanentAddress: text(employee.permanentAddress),
      emergencyContact: text(employee.emergencyContact),
      occupation: text(employee.occupation),
      workSite: text(employee.workSite),
      siteCode: text(employee.siteCode),
      basicSalary: text(employee.salary),
      benefits: text(employee.benefits),
      paidVacation: text(employee.paidVacation),
      workingHours: text(employee.workingHours),
      contractDuration: text(employee.contractDuration),
      employmentStatus: text(employee.employmentStatus),
    });
  }

  if (!state && !error) return <Loading />;
  if (!state) {
    return <FormScreen error={error} onSubmit={() => router.back()} submitLabel="Go back">{null}</FormScreen>;
  }

  function set<K extends keyof LoaState>(key: K, value: LoaState[K]) {
    setState((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const saved = await sendJson<{ id: string }>("/api/v1/letters", "POST", { ...state });
      router.replace(`/loas/${saved.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save LOA");
      setPending(false);
    }
  }

  return (
    <FormScreen error={error} pending={pending} submitLabel="Save LOA" onSubmit={() => void save()}>
      <SectionLabel>Letter</SectionLabel>
      <SelectField
        label="Employer"
        value={state.companyId}
        onChange={(value) => void changeCompany(value)}
        options={companies.map((item) => ({ value: item.id, label: item.legalName }))}
      />
      <SelectField
        label="Employee"
        value={state.employeeId}
        onChange={(value) => void changeEmployee(value)}
        options={employees.map((item) => ({ value: item.id, label: item.legalName }))}
      />
      <Field label="Document number" value={state.documentNumber} onChangeText={(value) => set("documentNumber", value)} />
      <Field label="Letter date (YYYY-MM-DD)" value={state.letterDate} onChangeText={(value) => set("letterDate", value)} />

      <SectionLabel>Terms</SectionLabel>
      <Field label="Occupation" value={state.occupation} onChangeText={(value) => set("occupation", value)} />
      <Field label="Basic salary" value={state.basicSalary} onChangeText={(value) => set("basicSalary", value)} />
      <Field label="Benefits" value={state.benefits} onChangeText={(value) => set("benefits", value)} />
      <Field label="Paid vacation" value={state.paidVacation} onChangeText={(value) => set("paidVacation", value)} />
      <Field label="Working hours" value={state.workingHours} onChangeText={(value) => set("workingHours", value)} />
      <Field label="Contract duration" value={state.contractDuration} onChangeText={(value) => set("contractDuration", value)} />
      <Field label="Work site" value={state.workSite} onChangeText={(value) => set("workSite", value)} />
      <Field label="Employment status" value={state.employmentStatus} onChangeText={(value) => set("employmentStatus", value)} />

      <SectionLabel>Snapshot identity</SectionLabel>
      <Field label="Legal name" value={state.legalName} onChangeText={(value) => set("legalName", value)} />
      <Field label="Passport" value={state.passportNumber} onChangeText={(value) => set("passportNumber", value)} />
      <Field label="Nationality" value={state.nationality} onChangeText={(value) => set("nationality", value)} />
      <Field label="Signatory name" value={state.signatoryName} onChangeText={(value) => set("signatoryName", value)} />
      <Field label="Signatory title" value={state.signatoryTitle} onChangeText={(value) => set("signatoryTitle", value)} />
    </FormScreen>
  );
}
