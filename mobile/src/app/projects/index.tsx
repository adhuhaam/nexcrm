import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { Banner, Empty, ListRow, Loading } from "../../components/ui";
import { getJson } from "../../lib/api";
import { colors, space } from "../../lib/theme";

type Project = { id: string; name?: string; title?: string; companyName?: string; status?: string | null };

export default function ProjectsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
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

  useLayoutEffect(() => {
    navigation.setOptions({ title: "Projects" });
  }, [navigation]);

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
            tintColor={colors.brand}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
        ListEmptyComponent={<Empty title="No projects" body="Projects will show here." icon="construct-outline" />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={item.name ?? item.title ?? "Project"}
            subtitle={item.companyName ?? "Company"}
            status={item.status}
            icon="construct-outline"
            onPress={() => router.push(`/projects/${item.id}` as never)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg, paddingTop: space.sm },
  list: { paddingBottom: 40 },
});
