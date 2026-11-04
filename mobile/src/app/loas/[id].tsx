import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner, Card, DetailRow, Loading, SectionLabel } from "../../components/ui";
import { getJson } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { colors, space } from "../../lib/theme";

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
          <Text style={styles.name}>{letter.documentNumber}</Text>
          <Text style={styles.meta}>Dated {formatDate(letter.letterDate)}</Text>
          <Card>
            <DetailRow label="Employer (snapshot)" value={snapshot.company.legalName} />
            <DetailRow label="Employee (snapshot)" value={snapshot.employee.legalName} />
            <DetailRow label="Passport" value={snapshot.employee.passportNumber} />
            <DetailRow label="Nationality" value={snapshot.employee.nationality} />
          </Card>
          {snapshot.terms ? (
            <View>
              <SectionLabel>Terms</SectionLabel>
              <Card>
                {Object.entries(snapshot.terms).map(([key, value]) => (
                  <DetailRow key={key} label={key} value={value} />
                ))}
              </Card>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 40 },
  name: { fontSize: 24, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 },
  meta: { marginTop: 4, marginBottom: space.lg, fontSize: 14, color: colors.muted },
});
