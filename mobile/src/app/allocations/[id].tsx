import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FormScreen } from "../../components/form";
import { Banner, Button, Card, DetailRow, Field, Loading, StatusPill } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, radius, space } from "../../lib/theme";

type EndReason = "resign" | "terminate" | "lost" | "transfer_out";

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

const END_REASONS: { value: EndReason; label: string }[] = [
  { value: "resign", label: "Resign" },
  { value: "terminate", label: "Terminate" },
  { value: "lost", label: "Lost / absconded" },
  { value: "transfer_out", label: "Transfer out" },
];

export default function AllocationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { canEdit } = usePermissions();
  const [row, setRow] = useState<Allocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "rate" | "end">("view");
  const [staffSalary, setStaffSalary] = useState("");
  const [billRate, setBillRate] = useState("");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [endReason, setEndReason] = useState<EndReason>("resign");
  const [absentFrom, setAbsentFrom] = useState(new Date().toISOString().slice(0, 10));
  const [endNote, setEndNote] = useState("");
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

  if (mode === "end" && row) {
    return (
      <FormScreen
        error={error}
        pending={pending}
        submitLabel="Confirm end"
        onSubmit={() => {
          void (async () => {
            setPending(true);
            setError(null);
            try {
              await sendJson(`/api/v1/allocations/${id}/end`, "POST", {
                endDate,
                reason: endReason,
                note: endNote || null,
                absentFrom: endReason === "lost" ? absentFrom : null,
              });
              setMode("view");
              await load();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not end allocation");
            } finally {
              setPending(false);
            }
          })();
        }}
      >
        <Text style={styles.reasonLabel}>Reason</Text>
        <View style={styles.reasonRow}>
          {END_REASONS.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setEndReason(item.value)}
              style={[styles.reasonChip, endReason === item.value && styles.reasonChipOn]}
            >
              <Text style={[styles.reasonText, endReason === item.value && styles.reasonTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Last day (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} />
        {endReason === "lost" ? (
          <Field label="Absent from (YYYY-MM-DD)" value={absentFrom} onChangeText={setAbsentFrom} />
        ) : null}
        <Field label="Note" value={endNote} onChangeText={setEndNote} />
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
                  label="End placement"
                  variant="danger"
                  onPress={() => {
                    Alert.alert("End allocation?", "Choose resign, terminate, lost, or transfer out.", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Continue",
                        onPress: () => {
                          setEndDate(new Date().toISOString().slice(0, 10));
                          setAbsentFrom(new Date().toISOString().slice(0, 10));
                          setEndNote("");
                          setEndReason("resign");
                          setMode("end");
                        },
                      },
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
  reasonLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.md },
  reasonChip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasonChipOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  reasonText: { fontSize: 13, fontWeight: "600", color: colors.inkSoft },
  reasonTextOn: { color: colors.brandDeep },
});
