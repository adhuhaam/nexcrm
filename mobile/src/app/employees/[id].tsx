import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Banner, Card, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type EmployeePayload = {
  employee: {
    id: string;
    legalName: string;
    preferredName: string | null;
    passportNumber: string | null;
    passportIssueDate: string | null;
    passportExpiry: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    permanentAddress: string | null;
    emergencyContact: string | null;
    occupation: string | null;
    employmentStatus: string | null;
    companyId: string;
  };
  companies?: { id: string; legalName: string }[];
};

export default function EmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [payload, setPayload] = useState<EmployeePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<EmployeePayload>(`/api/v1/employees/${id}`)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load employee");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!payload && !error) return <Loading />;
  const employee = payload?.employee;
  const companyName = employee
    ? payload?.companies?.find((c) => c.id === employee.companyId)?.legalName
    : null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Banner message={error} error />
      {employee ? (
        <Card>
          <Text style={styles.name}>{employee.preferredName || employee.legalName}</Text>
          <Row label="Legal name" value={employee.legalName} />
          <Row label="Company" value={companyName} />
          <Row label="Occupation" value={employee.occupation} />
          <Row label="Status" value={employee.employmentStatus} />
          <Row label="Passport" value={employee.passportNumber} />
          <Row label="Passport issue" value={employee.passportIssueDate} />
          <Row label="Passport expiry" value={employee.passportExpiry} />
          <Row label="Nationality" value={employee.nationality} />
          <Row label="Date of birth" value={employee.dateOfBirth} />
          <Row label="Gender" value={employee.gender} />
          <Row label="Address" value={employee.permanentAddress} />
          <Row label="Emergency" value={employee.emergencyContact} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <Muted>{label}</Muted>
      <Text style={styles.value}>{value || "—"}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ec" },
  content: { padding: 16 },
  name: { fontSize: 20, fontWeight: "700", color: "#1c1917", marginBottom: 12 },
  value: { fontSize: 15, color: "#1c1917", marginBottom: 10 },
});
