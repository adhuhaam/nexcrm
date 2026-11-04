export const colors = {
  bg: "#f3efe7",
  bgSoft: "#ebe4d8",
  surface: "#fffcf7",
  surfaceRaised: "#ffffff",
  ink: "#1c1917",
  inkSoft: "#44403c",
  muted: "#78716c",
  faint: "#a8a29e",
  line: "#e7e0d4",
  lineStrong: "#d6d0c4",
  brand: "#1f4b3a",
  brandSoft: "#e6efe9",
  brandDeep: "#16382b",
  accent: "#c4a574",
  danger: "#9f1239",
  dangerSoft: "#fde8ee",
  success: "#166534",
  successSoft: "#e8f5ec",
  warn: "#92400e",
  warnSoft: "#fef3c7",
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
