import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
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
import { colors, initials, radius, space } from "../lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

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

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Banner({ message, error }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return (
    <View style={[styles.banner, error ? styles.bannerError : styles.bannerInfo]}>
      <Ionicons
        name={error ? "alert-circle" : "information-circle"}
        size={18}
        color={error ? colors.danger : colors.inkSoft}
      />
      <Text style={[styles.bannerText, error && { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.faint} style={styles.input} autoCapitalize="none" {...props} />
    </View>
  );
}

export function SearchField(props: TextInputProps) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        placeholderTextColor={colors.faint}
        style={styles.searchInput}
        autoCapitalize="none"
        returnKeyType="search"
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
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        variant === "ghost" && styles.buttonGhost,
        pressed && styles.buttonPressed,
        pending && styles.buttonDisabled,
      ]}
    >
      {pending ? (
        <ActivityIndicator color={variant === "ghost" ? colors.brand : "#fff"} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === "ghost" && styles.buttonLabelGhost,
            variant === "secondary" && styles.buttonLabelSecondary,
          ]}
        >
          {label}
        </Text>
      )}
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

export function Avatar({ name, tone = "brand" }: { name: string; tone?: "brand" | "accent" | "ink" }) {
  const bg =
    tone === "accent" ? "#f3e8d5" : tone === "ink" ? colors.bgSoft : colors.brandSoft;
  const fg = tone === "accent" ? "#8a6a3b" : tone === "ink" ? colors.inkSoft : colors.brand;
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: fg }]}>{initials(name)}</Text>
    </View>
  );
}

export function StatusPill({ label }: { label: string }) {
  const key = label.trim().toLowerCase();
  const tone =
    key.includes("active") || key.includes("locked") || key === "paid"
      ? "success"
      : key.includes("draft") || key.includes("pending")
        ? "warn"
        : key.includes("resign") || key.includes("terminat") || key.includes("inactive")
          ? "danger"
          : "neutral";
  return (
    <View
      style={[
        styles.pill,
        tone === "success" && styles.pillSuccess,
        tone === "warn" && styles.pillWarn,
        tone === "danger" && styles.pillDanger,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === "success" && { color: colors.success },
          tone === "warn" && { color: colors.warn },
          tone === "danger" && { color: colors.danger },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  status,
  onPress,
  avatarName,
  avatarTone = "brand",
  icon,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  status?: string | null;
  onPress?: () => void;
  avatarName?: string;
  avatarTone?: "brand" | "accent" | "ink";
  icon?: IconName;
}) {
  const body = (
    <View style={styles.listRow}>
      {icon ? (
        <View style={styles.iconBubble}>
          <Ionicons name={icon} size={18} color={colors.brand} />
        </View>
      ) : (
        <Avatar name={avatarName ?? title} tone={avatarTone} />
      )}
      <View style={styles.listBody}>
        <View style={styles.listTop}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {title}
          </Text>
          {status ? <StatusPill label={status} /> : null}
        </View>
        {subtitle ? (
          <Text style={styles.listSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={styles.listMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.listCard, pressed && styles.cardPressed]}>
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.card, styles.listCard]}>{body}</View>;
}

export function MetricTile({
  label,
  value,
  onPress,
  icon,
}: {
  label: string;
  value: number | string;
  onPress?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.metric, pressed && onPress && styles.cardPressed]}
    >
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        {icon ? (
          <View style={styles.metricIcon}>
            <Ionicons name={icon} size={14} color={colors.brand} />
          </View>
        ) : null}
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </Pressable>
  );
}

export function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value?.trim() ? value : "—"}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export function Empty({ title, body, icon = "folder-open-outline" }: { title: string; body: string; icon?: IconName }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.brand} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  muted: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  sectionLabel: {
    marginTop: space.sm,
    marginBottom: space.sm,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  banner: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bannerError: { backgroundColor: colors.dangerSoft },
  bannerInfo: { backgroundColor: colors.bgSoft },
  bannerText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 },
  field: { gap: 6, marginBottom: space.md },
  label: { fontSize: 13, fontWeight: "600", color: colors.inkSoft },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.ink,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    marginBottom: space.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    padding: 0,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  buttonSecondary: { backgroundColor: colors.bgSoft },
  buttonDanger: { backgroundColor: colors.danger },
  buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.lineStrong },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
  buttonLabelGhost: { color: colors.brand },
  buttonLabelSecondary: { color: colors.ink },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: space.md,
    shadowColor: "#1c1917",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  listCard: { paddingVertical: 14 },
  cardPressed: { opacity: 0.92 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "700" },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.bgSoft,
  },
  pillSuccess: { backgroundColor: colors.successSoft },
  pillWarn: { backgroundColor: colors.warnSoft },
  pillDanger: { backgroundColor: colors.dangerSoft },
  pillText: { fontSize: 11, fontWeight: "700", color: colors.inkSoft, textTransform: "capitalize" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  listBody: { flex: 1, minWidth: 0, gap: 2 },
  listTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  listTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink },
  listSubtitle: { fontSize: 13, color: colors.inkSoft },
  listMeta: { fontSize: 12, color: colors.muted },
  metric: {
    flexGrow: 1,
    flexBasis: "46%",
    maxWidth: "48.5%",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metricTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricLabel: { fontSize: 13, fontWeight: "600", color: colors.muted },
  metricIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { marginTop: 10, fontSize: 30, fontWeight: "700", color: colors.brand, letterSpacing: -0.8 },
  detailRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  detailLabel: { fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 4 },
  detailValue: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.bg },
  empty: { paddingVertical: 48, alignItems: "center", gap: 8, paddingHorizontal: 24 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
});
