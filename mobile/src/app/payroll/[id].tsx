import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner, Button, Card, DetailRow, ListRow, Loading, StatusPill } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type PayItem = {
  id: string;
  employeeName?: string;
  staffSalary?: string;
  billRate?: string;
};

type PayRunDetail = {
  id: string;
  clientName?: string;
  employerName?: string;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
  lockedAt?: string | null;
  items?: PayItem[];
  totals?: { staffSalary?: string; billRate?: string };
};

export default function PayrollDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canEdit } = usePermissions();
  const [run, setRun] = useState<PayRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRun(await getJson<PayRunDetail>(`/api/v1/pay-runs/${id}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load pay run");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!run && !error) return <Loading />;

  async function lock() {
    setPending(true);
    setError(null);
    try {
      setRun(await sendJson<PayRunDetail>(`/api/v1/pay-runs/${id}/lock`, "POST", {}));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not lock pay run");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Pay run" }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Banner message={error} error />
        {run ? (
          <>
            <View style={styles.header}>
              <Text style={styles.name}>{run.clientName ?? "Pay run"}</Text>
              {run.status ? <StatusPill label={run.status} /> : null}
            </View>
            <Card>
              <DetailRow label="Employer" value={run.employerName} />
              <DetailRow label="Period" value={[run.periodStart, run.periodEnd].filter(Boolean).join(" → ")} />
              <DetailRow label="Locked at" value={run.lockedAt} />
              <DetailRow label="Staff total" value={run.totals?.staffSalary} />
              <DetailRow label="Bill total" value={run.totals?.billRate} />
            </Card>
            <Text style={styles.section}>Lines</Text>
            {(run.items ?? []).map((item) => (
              <ListRow
                key={item.id}
                title={item.employeeName ?? "Employee"}
                meta={[item.staffSalary && `staff ${item.staffSalary}`, item.billRate && `bill ${item.billRate}`]
                  .filter(Boolean)
                  .join(" · ")}
                avatarName={item.employeeName ?? "E"}
              />
            ))}
            {canEdit && run.status !== "locked" ? (
              <Button label="Lock pay run" onPress={() => void lock()} pending={pending} />
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
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: space.lg },
  name: { flex: 1, fontSize: 24, fontWeight: "700", color: colors.ink },
  section: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
});
