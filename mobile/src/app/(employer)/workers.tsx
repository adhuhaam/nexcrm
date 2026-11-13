import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { employerEmployees } from "../../lib/portal-api";
import { colors, radius, space } from "../../lib/theme";

type Row = Record<string, string | null>;

export default function EmployerWorkersScreen() {
  const [items, setItems] = useState<Row[]>([]);

  useEffect(() => {
    void employerEmployees()
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]));
  }, []);

  return (
    <FlatList
      data={items}
      keyExtractor={(row) => String(row.id)}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.legalName}</Text>
          <Text style={styles.meta}>XPAT: {item.xpatStatus ?? "—"}</Text>
          <Text style={styles.meta}>Client: {item.clientName ?? "—"}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: { fontWeight: "700", color: colors.ink },
  meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
