import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner } from "../../components/ui";
import { essAttendance } from "../../lib/ess-api";
import { colors, space } from "../../lib/theme";

export default function EssAttendanceScreen() {
  const [days, setDays] = useState<{ date: string; status: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    void essAttendance(month)
      .then((payload) => setDays(payload.days))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Load failed"));
  }, [month]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Banner message={error} error />
      <Text style={styles.month}>{month}</Text>
      <View style={styles.grid}>
        {days.map((day) => (
          <View key={day.date} style={styles.cell}>
            <Text style={styles.day}>{day.date.slice(8, 10)}</Text>
            <Text style={styles.status}>{day.status ?? "—"}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg },
  month: { fontWeight: "700", marginBottom: space.md, color: colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cell: { width: "13%", minWidth: 40, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 4, alignItems: "center" },
  day: { fontSize: 12, fontWeight: "700", color: colors.ink },
  status: { fontSize: 10, color: colors.muted },
});
