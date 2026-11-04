import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type PayRun = {
  id: string;
  clientName?: string;
  employerName?: string;
  periodStart?: string;
  periodEnd?: string;
  status?: string | null;
};

export default function PayrollScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit } = usePermissions();
  const [rows, setRows] = useState<PayRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ payRuns?: PayRun[]; runs?: PayRun[] }>("/api/v1/pay-runs");
      setRows(data.payRuns ?? data.runs ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load payroll");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/payroll/form")} /> : undefined,
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
        ListEmptyComponent={<Empty title="No pay runs" body="Payroll runs will show here." icon="card-outline" />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const period = [item.periodStart, item.periodEnd].filter(Boolean).join(" → ") || null;
          return (
            <ListRow
              title={item.clientName ?? "Pay run"}
              subtitle={item.employerName ?? "Employer"}
              meta={period}
              status={item.status}
              icon="card-outline"
              onPress={() => router.push(`/payroll/${item.id}` as never)}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg, paddingTop: space.sm },
  list: { paddingBottom: 40 },
});
