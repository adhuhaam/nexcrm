import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Banner, Button, Field } from "../../components/ui";
import { sendJson } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { essProfile } from "../../lib/ess-api";
import { colors, space } from "../../lib/theme";
import { router } from "expo-router";

export default function EssProfileScreen() {
  const { signOut, session } = useAuth();
  const [phone, setPhone] = useState("");
  const [phoneConfirm, setPhoneConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void essProfile().then((payload) => {
      setPhone(payload.phone ?? "");
      setPhoneConfirm(payload.phone ?? "");
      if (payload.mustChangePassword) router.replace("/(ess)/change-password");
    });
  }, []);

  async function savePhone() {
    setError(null);
    try {
      await sendJson("/api/v1/ess/profile/phone", "POST", { phone, phoneConfirm });
      setNotice("Phone updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Update failed");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Banner message={error} error />
      <Banner message={notice} />
      <Text style={styles.name}>{session?.user.name ?? "Employee"}</Text>
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Confirm phone" value={phoneConfirm} onChangeText={setPhoneConfirm} keyboardType="phone-pad" />
      <Button label="Save phone" onPress={() => void savePhone()} />
      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  name: { fontSize: 18, fontWeight: "700", color: colors.ink },
});
