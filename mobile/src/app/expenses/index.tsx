import { useCallback, useLayoutEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading } from "../../components/ui";
import { getJson, sendJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type Expense = {
  id: string;
  expenseDate: string;
  amount: string;
  currency: string;
  category: string;
  clientName: string | null;
  counterparty: string | null;
  note: string | null;
};

const categoryLabels: Record<string, string> = {
  client_payment: "Client payment",
  investment: "Investment",
  other: "Other",
};

export default function ExpensesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit, canDelete } = usePermissions();
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ expenses: Expense[] }>("/api/v1/expenses");
      setRows(data.expenses);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load expenses");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Expenses",
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/expenses/form")} /> : undefined,
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
          <Empty title="No expenses" body="Organization outflows will show here." icon="receipt-outline" />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={`${item.amount} ${item.currency}`}
            subtitle={item.clientName ?? item.counterparty ?? categoryLabels[item.category] ?? item.category}
            meta={[item.expenseDate, item.note].filter(Boolean).join(" · ")}
            status={categoryLabels[item.category] ?? item.category}
            icon="receipt-outline"
            onPress={() => {
              if (canEdit) router.push(`/expenses/form?id=${item.id}`);
              else if (canDelete) {
                Alert.alert("Expense", `${item.amount} ${item.currency}`, [
                  { text: "Close", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      void sendJson(`/api/v1/expenses/${item.id}`, "DELETE")
                        .then(() => load())
                        .catch((reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : "Could not delete"),
                        );
                    },
                  },
                ]);
              }
            }}
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
