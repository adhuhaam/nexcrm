import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading, SearchField } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type Company = {
  id: string;
  legalName: string;
  registrationNumber: string | null;
  kind?: string | null;
  employeeCount?: number;
};

export default function CompaniesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit } = usePermissions();
  const [rows, setRows] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ companies: Company[] }>("/api/v1/companies?kind=employer&counts=1");
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/companies/form?kind=employer")} /> : undefined,
    });
  }, [canEdit, navigation, router]);

  const filtered =
    rows?.filter((row) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return row.legalName.toLowerCase().includes(needle) || (row.registrationNumber ?? "").toLowerCase().includes(needle);
    }) ?? null;

  if (!rows && !error) return <Loading />;

  return (
    <View style={styles.root}>
      <SearchField value={q} onChangeText={setQ} placeholder="Search employers" />
      <Banner message={error} error />
      <FlatList
        data={filtered ?? []}
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
          <Empty title="No companies" body="Employer companies from NEXCRM will show here." icon="business-outline" />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={item.legalName}
            subtitle={item.registrationNumber ?? "No registration number"}
            meta={typeof item.employeeCount === "number" ? `${item.employeeCount} employees` : null}
            avatarName={item.legalName}
            avatarTone="ink"
            onPress={() => router.push(`/companies/${item.id}`)}
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
