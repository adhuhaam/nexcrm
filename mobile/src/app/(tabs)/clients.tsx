import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading } from "../../components/ui";
import { getJson } from "../../lib/api";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type Client = {
  id: string;
  legalName: string;
  registrationNumber: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};

export default function ClientsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit } = usePermissions();
  const [rows, setRows] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<{ clients?: Client[]; companies?: Client[] }>("/api/v1/clients");
      setRows(data.clients ?? data.companies ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load clients");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/clients/form")} /> : undefined,
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
          <Empty title="No clients" body="Client companies will show here." icon="briefcase-outline" />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={item.legalName}
            subtitle={item.registrationNumber ?? "No registration number"}
            meta={[item.country, item.phone].filter(Boolean).join(" · ") || null}
            avatarName={item.legalName}
            avatarTone="accent"
            onPress={() => router.push(`/clients/form?id=${item.id}`)}
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
