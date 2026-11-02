import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Banner, Card, Empty, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type Allocation = {
  id: string;
  employeeName?: string;
  clientName?: string;
  employerName?: string;
  staffRate?: string | null;
  billRate?: string | null;
  status?: string | null;
};

export default function AllocationsScreen() {
  const [rows, setRows] = useState<Allocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ allocations: Allocation[] }>("/api/v1/allocations");
      setRows(data.allocations);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load allocations");
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
        ListEmptyComponent={<Empty title="No allocations" body="Active placements will show here." />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>{item.employeeName ?? "Employee"}</Text>
            <Muted>{[item.clientName, item.employerName].filter(Boolean).join(" · ") || "—"}</Muted>
            <Muted>
              {[item.status, item.staffRate && `staff ${item.staffRate}`, item.billRate && `bill ${item.billRate}`]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Muted>
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
