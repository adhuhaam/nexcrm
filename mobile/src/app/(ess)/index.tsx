import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner, Card } from "../../components/ui";
import { essDashboard } from "../../lib/ess-api";
import { colors, space } from "../../lib/theme";

export default function EssHomeScreen() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void essDashboard()
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Load failed"));
  }, []);

  const attendance = (data?.attendanceThisMonth ?? {}) as Record<string, number>;
  const lastSalary = data?.lastSalary as { netStaff: string } | null;
  const client = data?.currentClient as { clientName: string } | null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Banner message={error} error />
      <Card>
        <Text style={styles.title}>This month</Text>
        <Text style={styles.body}>
          P {attendance.P ?? 0} · AB {attendance.AB ?? 0} · OD {attendance.OD ?? 0}
        </Text>
      </Card>
      <Card>
        <Text style={styles.title}>Last net salary</Text>
        <Text style={styles.body}>{lastSalary?.netStaff ?? "—"}</Text>
      </Card>
      <Card>
        <Text style={styles.title}>Current client</Text>
        <Text style={styles.body}>{client?.clientName ?? "Not allocated"}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  title: { fontWeight: "700", color: colors.ink, marginBottom: 4 },
  body: { color: colors.muted },
});
