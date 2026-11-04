import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Banner, Card, Empty, Loading, Muted, Subtitle, Title } from "../../components/ui";
import { getJson } from "../../lib/api";
import { formatDate } from "../../lib/dates";

type DashboardModel = {
  counts: { companies: number; employers?: number; clients?: number; employees: number; letters: number };
  recentLetters: {
    id: string;
    documentNumber: string;
    letterDate: string;
    employeeName: string | null;
    companyName: string;
  }[];
};

export default function DashboardScreen() {
  const router = useRouter();
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setModel(await getJson<DashboardModel>("/api/v1/hr/dashboard"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load dashboard");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!model && !error) return <Loading />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Title>Dashboard</Title>
      <Subtitle>People & documents on the tailnet</Subtitle>
      <View style={{ height: 12 }} />
      <Banner message={error} error />
      {model ? (
        <>
          <View style={styles.metrics}>
            <Metric
              label="Employers"
              value={model.counts.employers ?? model.counts.companies}
              onPress={() => router.push("/(tabs)/companies")}
            />
            <Metric label="Employees" value={model.counts.employees} onPress={() => router.push("/(tabs)/employees")} />
            <Metric label="LOAs" value={model.counts.letters} onPress={() => router.push("/loas")} />
          </View>
          <Text style={styles.section}>Recent LOAs</Text>
          {model.recentLetters.length === 0 ? (
            <Empty title="No letters yet" body="Create a LOA from the web or mobile editor." />
          ) : (
            model.recentLetters.map((letter) => (
              <Card key={letter.id} onPress={() => router.push(`/loas/${letter.id}`)}>
                <Text style={styles.cardTitle}>{letter.documentNumber}</Text>
                <Muted>{letter.employeeName ?? "—"} · {letter.companyName}</Muted>
                <Muted>{formatDate(letter.letterDate)}</Muted>
              </Card>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Metric({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <Muted>{label}</Muted>
      <Text style={styles.metricValue}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ec" },
  content: { padding: 16, paddingBottom: 40 },
  metrics: { gap: 0 },
  section: { marginTop: 8, marginBottom: 8, fontSize: 16, fontWeight: "700", color: "#1c1917" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1c1917", marginBottom: 4 },
  metricValue: { fontSize: 28, fontWeight: "700", color: "#1f4b3a", marginTop: 4 },
});
