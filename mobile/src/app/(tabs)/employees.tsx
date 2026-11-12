import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading, SearchField } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type Employee = {
  id: string;
  legalName: string;
  preferredName?: string | null;
  passportNumber: string | null;
  companyName: string;
  occupation: string | null;
  employmentStatus: string | null;
};

export default function EmployeesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit } = usePermissions();
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/employees/form")} /> : undefined,
    });
  }, [canEdit, navigation, router]);

  if (!rows && !error) return <Loading />;

  return (
    <View style={styles.root}>
      <SearchField
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void load(q)}
        placeholder="Search name or passport"
      />
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
              void load(q).finally(() => setRefreshing(false));
            }}
          />
        }
        ListEmptyComponent={
          <Empty title="No employees" body="People records from JACMS will show here." icon="people-outline" />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={item.preferredName || item.legalName}
            subtitle={item.companyName}
            meta={[item.occupation, item.passportNumber].filter(Boolean).join(" · ") || "—"}
            status={item.employmentStatus}
            avatarName={item.preferredName || item.legalName}
            onPress={() => router.push(`/employees/${item.id}`)}
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
