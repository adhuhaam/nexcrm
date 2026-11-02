import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner, Button, Field } from "../components/ui";
import { useAuth } from "../lib/auth";
import { BASE_URL } from "../lib/config";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brand}>NEXCRM</Text>
          <Text style={styles.desc}>Sign in over Tailscale to open the office workspace.</Text>
          <Banner message={error} error />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
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
          <Button label="Sign in" onPress={() => void submit()} pending={pending} />
          <Text style={styles.base}>{BASE_URL}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ec" },
  content: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    gap: 4,
  },
  brand: { fontSize: 30, fontWeight: "700", color: "#1f4b3a", letterSpacing: -0.5 },
  desc: { fontSize: 15, color: "#57534e", marginBottom: 12, lineHeight: 22 },
  base: { marginTop: 14, fontSize: 11, color: "#a8a29e", textAlign: "center" },
});
