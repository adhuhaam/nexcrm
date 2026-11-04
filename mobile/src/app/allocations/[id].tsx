import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { FormScreen } from "../../components/form";
import { Banner, Button, Card, DetailRow, Field, Loading, StatusPill } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type Allocation = {
  id: string;
  employeeName: string;
  employerName: string;
  clientName: string;
  joinDate: string;
  resignDate: string | null;
  designation: string | null;
  staffSalary: string;
  billRate: string;
  currency: string;
  status: string;
};

export default function AllocationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { canEdit } = usePermissions();
  const [row, setRow] = useState<Allocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "rate" | "resign">("view");
  const [staffSalary, setStaffSalary] = useState("");
  const [billRate, setBillRate] = useState("");
  const [resignDate, setResignDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ allocation: Allocation }>(`/api/v1/allocations/${id}`);
      setRow(data.allocation);
      setStaffSalary(data.allocation.staffSalary);
      setBillRate(data.allocation.billRate);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load allocation");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!row && !error) return <Loading />;

  if (mode === "rate" && row) {
    return (
      <FormScreen
        error={error}
        pending={pending}
        submitLabel="Update rates"
        onSubmit={() => {
          void (async () => {
            setPending(true);
            setError(null);
            try {
              await sendJson(`/api/v1/allocations/${id}/rate-change`, "POST", {
                staffSalary,
                billRate,
                currency: row.currency || "MVR",
              });
              setMode("view");
              await load();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not update rates");
            } finally {
              setPending(false);
            }
          })();
        }}
      >
        <Field label="Staff salary" value={staffSalary} onChangeText={setStaffSalary} keyboardType="decimal-pad" />
        <Field label="Bill rate" value={billRate} onChangeText={setBillRate} keyboardType="decimal-pad" />
        <Button label="Cancel" variant="ghost" onPress={() => setMode("view")} />
      </FormScreen>
    );
  }

  if (mode === "resign" && row) {
    return (
      <FormScreen
        error={error}
        pending={pending}
        submitLabel="Confirm resign"
        onSubmit={() => {
          void (async () => {
            setPending(true);
            setError(null);
            try {
              await sendJson(`/api/v1/allocations/${id}/resign`, "POST", { resignDate });
              setMode("view");
              await load();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not resign allocation");
            } finally {
              setPending(false);
            }
          })();
        }}
      >
        <Field label="Resign date (YYYY-MM-DD)" value={resignDate} onChangeText={setResignDate} />
        <Button label="Cancel" variant="ghost" onPress={() => setMode("view")} />
      </FormScreen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Allocation" }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Banner message={error} error />
        {row ? (
          <>
            <View style={styles.header}>
              <Text style={styles.name}>{row.employeeName}</Text>
              <StatusPill label={row.status} />
            </View>
            <Card>
              <DetailRow label="Client" value={row.clientName} />
              <DetailRow label="Employer" value={row.employerName} />
              <DetailRow label="Join date" value={row.joinDate} />
              <DetailRow label="Resign date" value={row.resignDate} />
              <DetailRow label="Designation" value={row.designation} />
              <DetailRow label="Staff salary" value={`${row.staffSalary} ${row.currency}`} />
              <DetailRow label="Bill rate" value={`${row.billRate} ${row.currency}`} />
            </Card>
            {canEdit && row.status === "active" ? (
              <View style={styles.actions}>
                <Button label="Change rates" onPress={() => setMode("rate")} />
                <Button
                  label="Resign"
                  variant="danger"
                  onPress={() => {
                    Alert.alert("Resign allocation?", "This ends the placement.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Continue", onPress: () => setMode("resign") },
                    ]);
                  }}
                />
              </View>
            ) : null}
            <Button label="Back to list" variant="ghost" onPress={() => router.back()} />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: space.lg },
  name: { flex: 1, fontSize: 24, fontWeight: "700", color: colors.ink },
  actions: { gap: 10, marginBottom: 12 },
});
