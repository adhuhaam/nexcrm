import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Banner,
  Empty,
  ListRow,
  Loading,
  MetricTile,
  Muted,
  SectionLabel,
  Subtitle,
  Title,
} from "../../components/ui";
import { getJson } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatDate } from "../../lib/dates";
import { colors, space } from "../../lib/theme";

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
  const { session } = useAuth();
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

  const firstName = session?.user.name?.split(/\s+/)[0] ?? "there";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.brand}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={styles.kicker}>Office</Text>
      <Title>Hello, {firstName}</Title>
      <Subtitle>People, clients, and payroll on the tailnet.</Subtitle>
      <View style={{ height: space.lg }} />
      <Banner message={error} error />
      {model ? (
        <>
          <View style={styles.metrics}>
            <MetricTile
              label="Employers"
              value={model.counts.employers ?? model.counts.companies}
              icon="business-outline"
              onPress={() => router.push("/(tabs)/companies")}
            />
            <MetricTile
              label="Employees"
              value={model.counts.employees}
              icon="people-outline"
              onPress={() => router.push("/(tabs)/employees")}
            />
            <MetricTile
              label="Clients"
              value={model.counts.clients ?? 0}
              icon="briefcase-outline"
              onPress={() => router.push("/(tabs)/clients")}
            />
            <MetricTile
              label="LOAs"
              value={model.counts.letters}
              icon="document-text-outline"
              onPress={() => router.push("/loas")}
            />
          </View>

          <ListRow
            title="Payroll"
            subtitle="Open pay runs by client"
            icon="card-outline"
            onPress={() => router.push("/(tabs)/payroll")}
          />

          <SectionLabel>Recent LOAs</SectionLabel>
          {model.recentLetters.length === 0 ? (
            <Empty title="No letters yet" body="Create a LOA from the web office when ready." icon="document-outline" />
          ) : (
            model.recentLetters.map((letter) => (
              <ListRow
                key={letter.id}
                title={letter.documentNumber}
                subtitle={`${letter.employeeName ?? "—"} · ${letter.companyName}`}
                meta={formatDate(letter.letterDate)}
                avatarName={letter.employeeName ?? letter.companyName}
                avatarTone="accent"
                onPress={() => router.push(`/loas/${letter.id}`)}
              />
            ))
          )}
        </>
      ) : (
        <Muted>Pull to refresh once Tailscale is connected.</Muted>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 48 },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.brand,
    marginBottom: 6,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: space.md,
  },
});
