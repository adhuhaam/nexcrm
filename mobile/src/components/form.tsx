import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radius, space } from "../lib/theme";
import { Banner, Button } from "./ui";

export type SelectOption = { value: string; label: string };

export function FormScreen({
  children,
  error,
  pending,
  submitLabel = "Save",
  onSubmit,
  secondaryLabel,
  onSecondary,
}: {
  children: ReactNode;
  error: string | null;
  pending?: boolean;
  submitLabel?: string;
  onSubmit: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Banner message={error} error />
        {children}
        <View style={{ height: 12 }} />
        <Button label={submitLabel} onPress={onSubmit} pending={pending} />
        {secondaryLabel && onSecondary ? (
          <View style={{ marginTop: 10 }}>
            <Button label={secondaryLabel} variant="danger" onPress={onSecondary} pending={pending} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.select} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value || "__empty"}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item.value === value && styles.optionActive]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.value === value ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No options</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function HeaderAdd({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.headerBtn}>
      <Ionicons name="add" size={24} color={colors.brand} />
    </Pressable>
  );
}

export function HeaderEdit({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.headerBtn}>
      <Text style={styles.headerEdit}>Edit</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 48 },
  field: { gap: 6, marginBottom: space.md },
  label: { fontSize: 13, fontWeight: "600", color: colors.inkSoft },
  select: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectText: { flex: 1, fontSize: 16, color: colors.ink },
  placeholder: { color: colors.faint },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28,25,23,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "70%",
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 12 },
  option: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionActive: { backgroundColor: colors.brandSoft, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  optionText: { flex: 1, fontSize: 16, color: colors.ink },
  empty: { paddingVertical: 24, textAlign: "center", color: colors.muted },
  headerBtn: { marginRight: 8, padding: 4 },
  headerEdit: { color: colors.brand, fontWeight: "700", fontSize: 16 },
});
