import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Banner, Button, Field } from "../../components/ui";
import { sendJson } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, space } from "../../lib/theme";

export default function EmployerChangePasswordScreen() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await sendJson("/api/v1/portal/employer/change-password", "POST", { currentPassword, newPassword });
      await refresh();
      router.replace("/(employer)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change password");
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>New password</Text>
      <Banner message={error} error />
      <Field label="Temporary password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
      <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <Button label={pending ? "Saving…" : "Continue"} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.lg, gap: space.md, backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink },
});
