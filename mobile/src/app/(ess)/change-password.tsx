import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Banner, Button, Field } from "../../components/ui";
import { sendJson } from "../../lib/api";
import { colors, space } from "../../lib/theme";
import { router } from "expo-router";

export default function EssChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await sendJson("/api/v1/ess/change-password", "POST", { currentPassword, newPassword });
      router.replace("/(ess)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change password");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Banner message={error} error />
      <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
      <Field label="New password (8+)" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <Button label="Continue" onPress={() => void submit()} pending={pending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, backgroundColor: colors.bg, flexGrow: 1 },
});
