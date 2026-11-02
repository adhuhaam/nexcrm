import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Banner({ message, error }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return (
    <View style={[styles.banner, error ? styles.bannerError : styles.bannerInfo]}>
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#8a8580"
        style={styles.input}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  pending,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  pending?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        pressed && styles.buttonPressed,
        pending && styles.buttonDisabled,
      ]}
    >
      {pending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={styles.card}>{children}</View>;
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#1f4b3a" />
    </View>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f1ec",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1c1917",
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    color: "#57534e",
  },
  muted: {
    fontSize: 14,
    color: "#78716c",
    lineHeight: 20,
  },
  banner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  bannerError: { backgroundColor: "#fee2e2" },
  bannerInfo: { backgroundColor: "#e7e5e4" },
  bannerText: { color: "#1c1917", fontSize: 14 },
  field: { gap: 6, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#44403c" },
  input: {
    borderWidth: 1,
    borderColor: "#d6d3d1",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1c1917",
  },
  button: {
    backgroundColor: "#1f4b3a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonSecondary: { backgroundColor: "#44403c" },
  buttonDanger: { backgroundColor: "#9f1239" },
  buttonPressed: { opacity: 0.88 },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.92 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { paddingVertical: 40, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: "#1c1917" },
});
