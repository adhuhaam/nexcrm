import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { clientDashboard } from "../../lib/portal-api";
import { colors, radius, space } from "../../lib/theme";

export default function ClientHomeScreen() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    void clientDashboard().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Client portal</Text>
      <View style={styles.grid}>
        <Stat label="Active workers" value={stats?.activeWorkers} />
        <Stat label="Invoices" value={stats?.lockedInvoiceCount} />
        <Stat label="Placements" value={stats?.recruitmentTotal} />
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
