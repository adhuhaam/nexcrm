import { useCallback, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { HeaderAdd } from "../../components/form";
import { Banner, Empty, ListRow, Loading, SearchField } from "../../components/ui";
import { getJson } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { usePermissions } from "../../lib/permissions";
import { colors, space } from "../../lib/theme";

type LetterRow = {
  id: string;
  documentNumber: string;
  letterDate: string;
  employeeName: string | null;
  companyName: string;
  createdAt: string;
};

export default function LoaListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { canEdit } = usePermissions();
  const [rows, setRows] = useState<LetterRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (query = "") => {
    try {
      setError(null);
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      const data = await getJson<{ letters: LetterRow[] }>(`/api/v1/letters${suffix}`);
      setRows(data.letters);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load LOAs");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load("");
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "LOAs",
      headerRight: canEdit ? () => <HeaderAdd onPress={() => router.push("/loas/form")} /> : undefined,
    });
  }, [canEdit, navigation, router]);

  if (!rows && !error) return <Loading />;

  return (
    <View style={styles.root}>
      <SearchField
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void load(q)}
        placeholder="Search name, passport, or doc #"
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
        ListEmptyComponent={<Empty title="No LOAs" body="Archived letters will show here." icon="document-text-outline" />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={item.documentNumber}
            subtitle={`${item.employeeName ?? "—"} · ${item.companyName}`}
            meta={formatDate(item.letterDate)}
            avatarName={item.employeeName ?? item.companyName}
            avatarTone="accent"
            onPress={() => router.push(`/loas/${item.id}`)}
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
