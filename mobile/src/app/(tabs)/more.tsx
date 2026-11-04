import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar, Button, ListRow, SectionLabel, Subtitle, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { colors, radius, space } from "../../lib/theme";

const links: {
  href: string;
  title: string;
  body: string;
  icon:
    | "document-text-outline"
    | "git-network-outline"
    | "construct-outline"
    | "id-card-outline"
    | "receipt-outline";
}[] = [
  { href: "/loas", title: "LOAs", body: "Create and archive appointment letters", icon: "document-text-outline" },
  { href: "/allocations", title: "Allocations", body: "Staff placements, resign, rate changes", icon: "git-network-outline" },
  { href: "/projects", title: "Projects", body: "Sites and project files", icon: "construct-outline" },
  { href: "/work-permits", title: "Work permits", body: "Permit register create/edit", icon: "id-card-outline" },
  { href: "/expenses", title: "Expenses", body: "Outflows, clients, investments", icon: "receipt-outline" },
];

export default function MoreScreen() {
  const router = useRouter();
  const { session, apiBase, signOut } = useAuth();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Title>More</Title>
      <Subtitle>Operations tools and account controls.</Subtitle>

      <View style={styles.profile}>
        <Avatar name={session?.user.name ?? "Office"} />
        <View style={styles.profileBody}>
          <Text style={styles.profileName}>{session?.user.name ?? "Office"}</Text>
          <Text style={styles.profileMeta}>{session?.user.email ?? ""}</Text>
          <Text style={styles.profileRole}>{session?.role.name ?? "Role"}</Text>
        </View>
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.serverLabel}>Connected API</Text>
        <Text style={styles.serverValue}>{apiBase ?? "—"}</Text>
      </View>

      <SectionLabel>Workspace</SectionLabel>
      {links.map((link) => (
        <ListRow
          key={link.href}
          title={link.title}
          subtitle={link.body}
          icon={link.icon}
          onPress={() => router.push(link.href as never)}
        />
      ))}

      <View style={{ height: space.sm }} />
      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
      <Text style={styles.base}>Sign out keeps the API URL so you can reconnect faster.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 48 },
  profile: {
    marginTop: space.lg,
    marginBottom: space.md,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  profileBody: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 17, fontWeight: "700", color: colors.ink },
  profileMeta: { marginTop: 2, fontSize: 13, color: colors.muted },
  profileRole: {
    marginTop: 8,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  serverCard: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
  },
  serverLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.brand,
    marginBottom: 6,
  },
  serverValue: { fontSize: 13, color: colors.brandDeep, lineHeight: 18 },
  base: { marginTop: 16, fontSize: 11, color: colors.faint, textAlign: "center" },
});
