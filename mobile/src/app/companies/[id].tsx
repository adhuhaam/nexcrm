import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { HeaderEdit } from "../../components/form";
import { Avatar, Banner, Card, DetailRow, Loading } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type CompanyDetail = {
  id: string;
  legalName: string;
  kind?: string;
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
  const router = useRouter();
  const { canEdit } = usePermissions();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
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
    }, [id]),
  );

  if (!company && !error) return <Loading />;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Company",
          headerRight: canEdit
            ? () => <HeaderEdit onPress={() => router.push(`/companies/form?id=${id}`)} />
            : undefined,
        }}
      />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Banner message={error} error />
        {company ? (
          <>
            <View style={styles.header}>
              <Avatar name={company.legalName} tone="ink" />
              <View style={styles.headerBody}>
                <Text style={styles.name}>{company.legalName}</Text>
                <Text style={styles.meta}>
                  {[company.kind, typeof company.employeeCount === "number" ? `${company.employeeCount} employees` : null]
                    .filter(Boolean)
                    .join(" · ") || "Company"}
                </Text>
              </View>
            </View>
            <Card>
              <DetailRow label="Registration" value={company.registrationNumber} />
              <DetailRow label="Address" value={company.registeredAddress} />
              <DetailRow label="Country" value={company.country} />
              <DetailRow label="Activity" value={company.businessActivity} />
              <DetailRow label="Phone" value={company.phone} />
              <DetailRow label="Email" value={company.email} />
              <DetailRow label="Doc prefix" value={company.documentPrefix} />
              <DetailRow
                label="Signatory"
                value={[company.signatoryName, company.signatoryTitle].filter(Boolean).join(" · ") || null}
              />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 40 },
  header: { flexDirection: "row", gap: 14, alignItems: "center", marginBottom: space.lg },
  headerBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 24, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 },
  meta: { marginTop: 4, fontSize: 14, color: colors.muted },
});
