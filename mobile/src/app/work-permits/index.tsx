import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type Permit = {
  id: string;
  legalName?: string;
  employeeName?: string;
  workPermitNumber?: string | null;
  expiresOn?: string | null;
  companyName?: string;
};

export default function WorkPermitsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit } = usePermissions();
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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Work permits",
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/work-permits/form")} /> : undefined,
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
        ListEmptyComponent={<Empty title="No permits" body="Work permits will show here." icon="id-card-outline" />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={item.legalName ?? item.employeeName ?? item.workPermitNumber ?? "Permit"}
            subtitle={item.companyName ?? "Company"}
            meta={[item.workPermitNumber, item.expiresOn && `expires ${item.expiresOn}`].filter(Boolean).join(" · ")}
            avatarName={item.legalName ?? item.employeeName ?? "Permit"}
            avatarTone="ink"
            onPress={() => router.push(`/work-permits/form?id=${item.id}`)}
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
