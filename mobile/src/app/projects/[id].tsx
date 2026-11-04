import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Banner, Card, DetailRow, ListRow, Loading, SectionLabel } from "../../components/ui";
import { getJson } from "../../lib/api";
import { colors, space } from "../../lib/theme";

type ProjectView = {
  project?: {
    id: string;
    name: string;
    companyName?: string;
    status?: string | null;
    description?: string | null;
  };
  sites?: { id: string; name: string; poolCount?: number }[];
  files?: { id: string; originalName?: string; name?: string }[];
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getJson<ProjectView>(`/api/v1/projects/${id}`)
        .then((data) => {
          if (!cancelled) setView(data);
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load project");
        });
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  if (!view && !error) return <Loading />;
  const project = view?.project;

  return (
    <>
      <Stack.Screen options={{ title: "Project" }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Banner message={error} error />
        {project ? (
          <>
            <Text style={styles.name}>{project.name}</Text>
            <Text style={styles.meta}>{project.companyName ?? "Company"}</Text>
            <Card>
              <DetailRow label="Status" value={project.status} />
              <DetailRow label="Description" value={project.description} />
            </Card>
            <SectionLabel>Sites</SectionLabel>
            {(view?.sites ?? []).length === 0 ? (
              <Text style={styles.empty}>No sites on this project.</Text>
            ) : (
              (view?.sites ?? []).map((site) => (
                <ListRow
                  key={site.id}
                  title={site.name}
                  meta={typeof site.poolCount === "number" ? `${site.poolCount} pools` : null}
                  icon="location-outline"
                />
              ))
            )}
            <SectionLabel>Files</SectionLabel>
            {(view?.files ?? []).length === 0 ? (
              <Text style={styles.empty}>No project files.</Text>
            ) : (
              (view?.files ?? []).map((file) => (
                <ListRow
                  key={file.id}
                  title={file.originalName ?? file.name ?? "File"}
                  icon="document-outline"
                />
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 40 },
  name: { fontSize: 24, fontWeight: "700", color: colors.ink },
  meta: { marginTop: 4, marginBottom: space.lg, fontSize: 14, color: colors.muted },
  empty: { color: colors.muted, marginBottom: space.md },
});
