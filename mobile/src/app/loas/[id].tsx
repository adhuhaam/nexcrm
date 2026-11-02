import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Banner, Card, Loading, Muted } from "../../components/ui";
import { getJson } from "../../lib/api";

type LetterDetail = {
  id: string;
  documentNumber: string;
  letterDate: string;
  snapshot: {
    company: { legalName: string };
    employee: { legalName: string; passportNumber: string | null; nationality: string | null };
    terms?: Record<string, string | null>;
  };
};

export default function LoaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [letter, setLetter] = useState<LetterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<LetterDetail>(`/api/v1/letters/${id}`)
      .then((data) => {
        if (!cancelled) setLetter(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load LOA");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!letter && !error) return <Loading />;
  const snapshot = letter?.snapshot;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Banner message={error} error />
      {letter && snapshot ? (
        <>
          <Card>
            <Text style={styles.name}>{letter.documentNumber}</Text>
            <Muted>Letter date</Muted>
            <Text style={styles.value}>{letter.letterDate}</Text>
            <Muted>Employer (snapshot)</Muted>
            <Text style={styles.value}>{snapshot.company.legalName}</Text>
            <Muted>Employee (snapshot)</Muted>
            <Text style={styles.value}>{snapshot.employee.legalName}</Text>
            <Muted>Passport</Muted>
            <Text style={styles.value}>{snapshot.employee.passportNumber || "—"}</Text>
            <Muted>Nationality</Muted>
            <Text style={styles.value}>{snapshot.employee.nationality || "—"}</Text>
          </Card>
          {snapshot.terms ? (
            <Card>
              <Text style={styles.section}>Terms</Text>
              {Object.entries(snapshot.terms).map(([key, value]) => (
                <Text key={key} style={styles.term}>
                  {key}: {value || "—"}
                </Text>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ec" },
  content: { padding: 16 },
  name: { fontSize: 20, fontWeight: "700", color: "#1c1917", marginBottom: 12 },
  section: { fontSize: 16, fontWeight: "700", color: "#1c1917", marginBottom: 8 },
  value: { fontSize: 15, color: "#1c1917", marginBottom: 10 },
  term: { fontSize: 14, color: "#44403c", marginBottom: 6 },
});
