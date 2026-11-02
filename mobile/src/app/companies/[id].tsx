import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Banner, Card, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type CompanyDetail = {
  id: string;
  legalName: string;
  registrationNumber: string | null;
  registeredAddress: string | null;
  country: string | null;
  businessActivity: string | null;
  phone: string | null;
  email: string | null;
  documentPrefix: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  employeeCount?: number;
};

export default function CompanyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<CompanyDetail>(`/api/v1/companies/${id}`)
      .then((data) => {
        if (!cancelled) setCompany(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load company");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!company && !error) return <Loading />;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Banner message={error} error />
      {company ? (
        <Card>
          <Text style={styles.name}>{company.legalName}</Text>
          <Row label="Registration" value={company.registrationNumber} />
          <Row label="Address" value={company.registeredAddress} />
          <Row label="Country" value={company.country} />
          <Row label="Activity" value={company.businessActivity} />
          <Row label="Phone" value={company.phone} />
          <Row label="Email" value={company.email} />
          <Row label="Doc prefix" value={company.documentPrefix} />
          <Row
            label="Signatory"
            value={[company.signatoryName, company.signatoryTitle].filter(Boolean).join(" · ") || null}
          />
          <Row label="Employees" value={typeof company.employeeCount === "number" ? String(company.employeeCount) : null} />
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
