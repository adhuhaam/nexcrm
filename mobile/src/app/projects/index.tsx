import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Banner, Card, Empty, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type Project = { id: string; name?: string; title?: string; companyName?: string; status?: string | null };

export default function ProjectsScreen() {
  const [rows, setRows] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ projects: Project[] }>("/api/v1/projects");
      setRows(data.projects);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load projects");
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
        ListEmptyComponent={<Empty title="No projects" body="Projects will show here." />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>{item.name ?? item.title ?? "Project"}</Text>
            <Muted>{[item.companyName, item.status].filter(Boolean).join(" · ") || "—"}</Muted>
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
