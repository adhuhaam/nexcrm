import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { employerDashboard } from "../../lib/portal-api";
import { colors, radius, space } from "../../lib/theme";

export default function EmployerHomeScreen() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    void employerDashboard().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Legal employer portal</Text>
      <View style={styles.grid}>
        <Stat label="Employees" value={stats?.employeeCount} />
        <Stat label="Allocated" value={stats?.allocatedCount} />
        <Stat label="Invoices" value={stats?.lockedPayRunCount} />
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? "…"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  kicker: { fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase" },
  grid: { gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { color: colors.muted, fontSize: 13 },
  value: { fontSize: 28, fontWeight: "700", color: colors.ink, marginTop: 4 },
});
