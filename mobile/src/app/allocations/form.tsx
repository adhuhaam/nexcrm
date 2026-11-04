import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, SelectField } from "../../components/form";
import { Field, Loading } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";

type Company = { id: string; legalName: string };
type Employee = { id: string; legalName: string; companyName: string };

export default function AllocationFormScreen() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Company[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [designation, setDesignation] = useState("");
  const [staffSalary, setStaffSalary] = useState("");
  const [billRate, setBillRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson<{ allocations: unknown[]; clients: Company[] }>("/api/v1/allocations"),
      getJson<{ employees: Employee[] }>("/api/v1/employees"),
    ])
      .then(([alloc, emp]) => {
        if (cancelled) return;
        setClients(alloc.clients);
        setEmployees(emp.employees);
        setClientCompanyId(alloc.clients[0]?.id ?? "");
        setEmployeeId(emp.employees[0]?.id ?? "");
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load form");
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
      const created = await sendJson<{ id: string }>("/api/v1/allocations", "POST", {
        employeeId,
        clientCompanyId,
        joinDate,
        designation,
        staffSalary,
        billRate,
        currency: "MVR",
      });
      router.replace(`/allocations/${created.id}` as never);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create allocation");
      setPending(false);
    }
  }

  return (
    <FormScreen error={error} pending={pending} submitLabel="Allocate staff" onSubmit={() => void save()}>
      <SelectField
        label="Employee"
        value={employeeId}
        onChange={setEmployeeId}
        options={employees.map((item) => ({
          value: item.id,
          label: `${item.legalName} · ${item.companyName}`,
        }))}
      />
      <SelectField
        label="Client"
        value={clientCompanyId}
        onChange={setClientCompanyId}
        options={clients.map((item) => ({ value: item.id, label: item.legalName }))}
      />
      <Field label="Join date (YYYY-MM-DD)" value={joinDate} onChangeText={setJoinDate} />
      <Field label="Designation" value={designation} onChangeText={setDesignation} />
      <Field label="Staff salary" value={staffSalary} onChangeText={setStaffSalary} keyboardType="decimal-pad" />
      <Field label="Bill rate" value={billRate} onChangeText={setBillRate} keyboardType="decimal-pad" />
    </FormScreen>
  );
}
