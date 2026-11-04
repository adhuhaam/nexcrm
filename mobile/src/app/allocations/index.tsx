import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type Allocation = {
  id: string;
  employeeName?: string;
  clientName?: string;
  employerName?: string;
  staffSalary?: string;
  billRate?: string;
  status?: string | null;
};

export default function AllocationsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit } = usePermissions();
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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Allocations",
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/allocations/form")} /> : undefined,
    });
  }, [canEdit, navigation, router]);

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
        ListEmptyComponent={
          <Empty title="No allocations" body="Active placements will show here." icon="git-network-outline" />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={item.employeeName ?? "Employee"}
            subtitle={[item.clientName, item.employerName].filter(Boolean).join(" · ") || "—"}
            meta={[item.staffSalary && `staff ${item.staffSalary}`, item.billRate && `bill ${item.billRate}`]
              .filter(Boolean)
              .join(" · ")}
            status={item.status}
            avatarName={item.employeeName ?? "Employee"}
            onPress={() => router.push(`/allocations/${item.id}` as never)}
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
