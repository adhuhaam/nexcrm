import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Banner, Card, Empty, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type Company = {
  id: string;
  legalName: string;
  registrationNumber: string | null;
  kind?: string | null;
  employeeCount?: number;
};

export default function CompaniesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ companies: Company[] }>("/api/v1/companies?kind=employer");
      setRows(data.companies);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load companies");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered =
    rows?.filter((row) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return row.legalName.toLowerCase().includes(needle) || (row.registrationNumber ?? "").toLowerCase().includes(needle);
    }) ?? null;

  if (!rows && !error) return <Loading />;

  return (
    <View style={styles.root}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search employers"
        placeholderTextColor="#8a8580"
        style={styles.search}
      />
      <Banner message={error} error />
      <FlatList
        data={filtered ?? []}
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
        ListEmptyComponent={<Empty title="No companies" body="Employer companies from NEXCRM will show here." />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/companies/${item.id}`)}>
            <Text style={styles.name}>{item.legalName}</Text>
            <Muted>{item.registrationNumber ?? "No registration number"}</Muted>
            {typeof item.employeeCount === "number" ? <Muted>{`${item.employeeCount} employees`}</Muted> : null}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ec", paddingHorizontal: 16, paddingTop: 8 },
  search: {
    borderWidth: 1,
    borderColor: "#d6d3d1",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 16,
    color: "#1c1917",
  },
  list: { paddingBottom: 32 },
  name: { fontSize: 16, fontWeight: "600", color: "#1c1917", marginBottom: 4 },
});
