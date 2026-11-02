import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Muted, Subtitle, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { BASE_URL } from "../../lib/config";

const links: { href: string; title: string; body: string }[] = [
  { href: "/loas", title: "LOAs", body: "Letter of appointment archive" },
  { href: "/clients", title: "Clients", body: "Client companies" },
  { href: "/allocations", title: "Allocations", body: "Staff placements and rates" },
  { href: "/payroll", title: "Payroll", body: "Pay runs by client" },
  { href: "/projects", title: "Projects", body: "Sites and project files" },
  { href: "/work-permits", title: "Work permits", body: "Permit register" },
];

export default function MoreScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Title>More</Title>
      <Subtitle>{session?.user.name ?? "Office"} · {session?.role.name ?? ""}</Subtitle>
      <View style={{ height: 12 }} />
      {links.map((link) => (
        <Card key={link.href} onPress={() => router.push(link.href as never)}>
          <Text style={styles.name}>{link.title}</Text>
          <Muted>{link.body}</Muted>
        </Card>
      ))}
      <View style={{ height: 8 }} />
      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
      <Text style={styles.base}>{BASE_URL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ec" },
  content: { padding: 16, paddingBottom: 40 },
  name: { fontSize: 16, fontWeight: "600", color: "#1c1917", marginBottom: 4 },
  base: { marginTop: 16, fontSize: 11, color: "#a8a29e", textAlign: "center" },
});
