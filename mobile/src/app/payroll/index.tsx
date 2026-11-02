import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Banner, Card, Empty, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type PayRun = {
  id: string;
  clientName?: string;
  periodLabel?: string;
  status?: string | null;
  lockedAt?: string | null;
};

export default function PayrollScreen() {
  const [rows, setRows] = useState<PayRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ payRuns?: PayRun[]; runs?: PayRun[] }>("/api/v1/pay-runs");
      setRows(data.payRuns ?? data.runs ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load payroll");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!rows && !error) return <Loading />;

  return (
    <View style={styles.root}>
      <Banner message={error} error />
      <FlatList
        data={rows ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
        ListEmptyComponent={<Empty title="No pay runs" body="Payroll runs will show here." />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>{item.clientName ?? "Pay run"}</Text>
            <Muted>{[item.periodLabel, item.status].filter(Boolean).join(" · ") || "—"}</Muted>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ec", paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingBottom: 32 },
  name: { fontSize: 16, fontWeight: "600", color: "#1c1917", marginBottom: 4 },
});
