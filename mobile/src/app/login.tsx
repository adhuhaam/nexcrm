import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner, Button, Field } from "../components/ui";
import { useAuth } from "../lib/auth";
import { DEFAULT_API_HINT, loadApiBase } from "../lib/config";
import { colors, radius, space } from "../lib/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_HINT);
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"office" | "employee">("office");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void loadApiBase().then((stored) => {
      if (stored) setApiUrl(stored);
    });
  }, []);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await signIn(apiUrl, email.trim(), password, mode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.hero}>
        <View style={styles.heroOrb} />
        <View style={styles.heroOrbSecondary} />
        <Text style={styles.brandMark}>NEX</Text>
        <Text style={styles.brand}>JACMS</Text>
        <Text style={styles.heroCopy}>Standalone office app. Connect any reachable JACMS API, then sign in.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect & sign in</Text>
          <Text style={styles.desc}>
            The app only opens after the API URL responds and your email/password are accepted.
          </Text>
          <Banner message={error} error />
          <Field
            label="API URL"
            value={apiUrl}
            onChangeText={setApiUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            placeholder={DEFAULT_API_HINT}
          />
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 8 }}>
            <Button label="Office" variant={mode === "office" ? "primary" : "ghost"} onPress={() => setMode("office")} />
            <Button label="Employee" variant={mode === "employee" ? "primary" : "ghost"} onPress={() => setMode("employee")} />
          </View>
          <Field
            label={mode === "employee" ? "Phone" : "Email"}
            value={email}
            onChangeText={setEmail}
            keyboardType={mode === "employee" ? "phone-pad" : "email-address"}
            autoComplete={mode === "employee" ? "tel" : "email"}
            textContentType="username"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
          />
          <Button label="Connect" onPress={() => void submit()} pending={pending} />
          <Text style={styles.base}>http(s)://host — trailing slash optional</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    backgroundColor: colors.brand,
    paddingHorizontal: space.xl,
    paddingTop: Platform.OS === "web" ? 48 : 64,
    paddingBottom: 40,
    overflow: "hidden",
  },
  heroOrb: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -40,
    right: -30,
  },
  heroOrbSecondary: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(196,165,116,0.18)",
    bottom: 10,
    left: -20,
  },
  brandMark: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    color: "rgba(255,255,255,0.65)",
    marginBottom: 8,
  },
  brand: {
    fontSize: 40,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -1,
  },
  heroCopy: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(255,255,255,0.82)",
    maxWidth: 340,
  },
  content: { padding: space.lg, marginTop: -24, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    padding: space.xl,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: "#1c1917",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  cardTitle: { fontSize: 22, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  desc: { fontSize: 15, color: colors.muted, marginBottom: 16, lineHeight: 22 },
  base: { marginTop: 16, fontSize: 11, color: colors.faint, textAlign: "center", lineHeight: 16 },
});
