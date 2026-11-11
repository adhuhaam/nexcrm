import { getJson } from "./api";

export async function essDashboard() {
  return getJson<Record<string, unknown>>("/api/v1/ess/dashboard");
}

export async function essAttendance(month: string) {
  return getJson<{ days: { date: string; status: string | null }[] }>(`/api/v1/ess/attendance?month=${month}`);
}

export async function essSalaryHistory() {
  return getJson<{ items: Record<string, string>[] }>("/api/v1/ess/salary/history");
}

export async function essXpat() {
  return getJson<Record<string, unknown>>("/api/v1/ess/xpat");
}

export async function essProfile() {
  return getJson<{ phone: string | null; mustChangePassword: boolean }>("/api/v1/ess/profile");
}
