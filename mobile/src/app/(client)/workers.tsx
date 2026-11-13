import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { clientWorkers } from "../../lib/portal-api";
import { colors, radius, space } from "../../lib/theme";

export default function ClientWorkersScreen() {
  const [items, setItems] = useState<Record<string, string | null>[]>([]);

  useEffect(() => {
    void clientWorkers()
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]));
  }, []);

  return (
    <FlatList
      data={items}
      keyExtractor={(_, index) => String(index)}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.legalName}</Text>
          <Text style={styles.meta}>Employer: {item.employerName}</Text>
          <Text style={styles.meta}>Since {item.joinDate}</Text>
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
