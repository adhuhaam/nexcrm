import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Banner, Card } from "../../components/ui";
import { essXpat } from "../../lib/ess-api";
import { colors, space } from "../../lib/theme";

export default function EssXpatScreen() {
  const [view, setView] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void essXpat()
      .then(setView)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Load failed"));
  }, []);

  const docs = (view?.documents ?? {}) as Record<string, string | null>;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Banner message={error} error />
      <Card>
        <Text style={styles.title}>Work permit</Text>
        <Text style={styles.body}>{docs.workPermitNumber ?? "—"}</Text>
        <Text style={styles.body}>Expires {docs.workPermitExpiresOn ?? "—"}</Text>
      </Card>
      <Card>
        <Text style={styles.title}>Passport</Text>
        <Text style={styles.body}>{docs.passportNumber ?? "—"}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  title: { fontWeight: "700", color: colors.ink },
  body: { color: colors.muted, marginTop: 4 },
});
