/** Display money as 00,000.00 (comma thousands, 2 decimals). */

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** `55589.35` → `55,589.35` */
export function formatAmount(value: string | number | null | undefined, empty = "—"): string {
  const n = toNumber(value);
  if (n == null) return empty;
  return moneyFormatter.format(n);
}

/** `55589.35`, `MVR` → `55,589.35 MVR` */
export function formatMoney(
  value: string | number | null | undefined,
  currency: string | null | undefined = "MVR",
  empty = "—",
): string {
  const amount = formatAmount(value, "");
  if (!amount) return empty;
  const code = currency?.trim();
  return code ? `${amount} ${code}` : amount;
}

/** Pair for dual rates: `5,580.00 / 7,710.00 MVR` */
export function formatMoneyPair(
  staff: string | number | null | undefined,
  bill: string | number | null | undefined,
  currency: string | null | undefined = "MVR",
  empty = "—",
): string {
  const a = formatAmount(staff, "");
  const b = formatAmount(bill, "");
  if (!a && !b) return empty;
  const pair = `${a || "—"} / ${b || "—"}`;
  const code = currency?.trim();
  return code ? `${pair} ${code}` : pair;
}
