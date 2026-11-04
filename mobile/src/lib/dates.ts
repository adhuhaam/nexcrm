/** Office-wide display format: DD MMM YYYY (e.g. 04 Nov 2026). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fromParts(year: number, monthIndex: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  return `${pad2(day)} ${MONTHS[monthIndex]} ${year}`;
}

export function formatDate(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;

  if (typeof value === "string") {
    const isoDay = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDay) {
      const year = Number(isoDay[1]);
      const month = Number(isoDay[2]);
      const day = Number(isoDay[3]);
      return fromParts(year, month - 1, day) ?? value;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : empty;
  return fromParts(date.getFullYear(), date.getMonth(), date.getDate()) ?? empty;
}
