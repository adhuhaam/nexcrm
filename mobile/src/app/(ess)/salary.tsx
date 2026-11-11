import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Banner, Card } from "../../components/ui";
import { essSalaryHistory } from "../../lib/ess-api";
import { colors, space } from "../../lib/theme";

export default function EssSalaryScreen() {
  const [items, setItems] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void essSalaryHistory()
      .then((payload) => setItems(payload.items))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Load failed"));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Banner message={error} error />
      {items.map((row) => (
        <Card key={row.payRunId}>
          <Text style={styles.title}>
            {row.periodStart} – {row.periodEnd}
          </Text>
          <Text style={styles.body}>
            Net {row.netStaff} {row.currency}
          </Text>
        </Card>
      ))}
      {!items.length ? <Text style={styles.body}>No locked payslips yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  title: { fontWeight: "700", color: colors.ink },
  body: { color: colors.muted, marginTop: 4 },
});
