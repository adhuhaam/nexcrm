import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Banner, Card, Empty, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type Permit = {
  id: string;
  employeeName?: string;
  workPermitNumber?: string | null;
  expiresOn?: string | null;
  companyName?: string;
};

export default function WorkPermitsScreen() {
  const [rows, setRows] = useState<Permit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ workPermits?: Permit[]; permits?: Permit[] }>("/api/v1/work-permits");
      setRows(data.workPermits ?? data.permits ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load work permits");
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
        ListEmptyComponent={<Empty title="No permits" body="Work permits will show here." />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>{item.employeeName ?? item.workPermitNumber ?? "Permit"}</Text>
            <Muted>{[item.companyName, item.workPermitNumber, item.expiresOn].filter(Boolean).join(" · ") || "—"}</Muted>
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
