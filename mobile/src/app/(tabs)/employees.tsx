import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Banner, Card, Empty, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type Employee = {
  id: string;
  legalName: string;
  preferredName: string | null;
  passportNumber: string | null;
  companyName: string;
  occupation: string | null;
  employmentStatus: string | null;
};

export default function EmployeesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Employee[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (query = q) => {
    try {
      setError(null);
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      const data = await getJson<{ employees: Employee[] }>(`/api/v1/employees${suffix}`);
      setRows(data.employees);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load employees");
    }
  }, [q]);

  useFocusEffect(
    useCallback(() => {
      void load("");
    }, [load]),
  );

  if (!rows && !error) return <Loading />;

  return (
    <View style={styles.root}>
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void load(q)}
        placeholder="Search name or passport"
        placeholderTextColor="#8a8580"
        style={styles.search}
        returnKeyType="search"
      />
      <Banner message={error} error />
      <FlatList
        data={rows ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(q).finally(() => setRefreshing(false));
            }}
          />
        }
        ListEmptyComponent={<Empty title="No employees" body="People records from NEXCRM will show here." />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/employees/${item.id}`)}>
            <Text style={styles.name}>{item.preferredName || item.legalName}</Text>
            <Muted>{item.companyName}</Muted>
            <Muted>
              {[item.occupation, item.passportNumber, item.employmentStatus].filter(Boolean).join(" · ") || "—"}
            </Muted>
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
