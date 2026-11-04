import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { HeaderEdit } from "../../components/form";
import { Avatar, Banner, Button, Card, DetailRow, Loading, StatusPill } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

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
    salary: string | null;
    workSite: string | null;
  };
  companies?: { id: string; legalName: string }[];
};

export default function EmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { canEdit } = usePermissions();
  const [payload, setPayload] = useState<EmployeePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
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
    }, [id]),
  );

  if (!payload && !error) return <Loading />;
  const employee = payload?.employee;
  const displayName = employee?.preferredName || employee?.legalName || "Employee";
  const companyName = employee
    ? payload?.companies?.find((c) => c.id === employee.companyId)?.legalName
    : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Employee",
          headerRight: canEdit
            ? () => <HeaderEdit onPress={() => router.push(`/employees/form?id=${id}`)} />
            : undefined,
        }}
      />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Banner message={error} error />
        {employee ? (
          <>
            <View style={styles.header}>
              <Avatar name={displayName} />
              <View style={styles.headerBody}>
                <Text style={styles.name}>{displayName}</Text>
                <Text style={styles.meta}>{companyName ?? "Company"}</Text>
                {employee.employmentStatus ? (
                  <View style={styles.pillWrap}>
                    <StatusPill label={employee.employmentStatus} />
                  </View>
                ) : null}
              </View>
            </View>
            <Card>
              <DetailRow label="Legal name" value={employee.legalName} />
              <DetailRow label="Occupation" value={employee.occupation} />
              <DetailRow label="Passport" value={employee.passportNumber} />
              <DetailRow label="Passport issue" value={employee.passportIssueDate} />
              <DetailRow label="Passport expiry" value={employee.passportExpiry} />
              <DetailRow label="Nationality" value={employee.nationality} />
              <DetailRow label="Date of birth" value={employee.dateOfBirth} />
              <DetailRow label="Gender" value={employee.gender} />
              <DetailRow label="Salary" value={employee.salary} />
              <DetailRow label="Work site" value={employee.workSite} />
              <DetailRow label="Address" value={employee.permanentAddress} />
              <DetailRow label="Emergency" value={employee.emergencyContact} />
            </Card>
            {canEdit ? (
              <Button label="Create LOA" onPress={() => router.push(`/loas/form?employeeId=${id}`)} />
            ) : null}
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
  pillWrap: { marginTop: 10, alignSelf: "flex-start" },
});
