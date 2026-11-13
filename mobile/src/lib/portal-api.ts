import { getJson } from "./api";

export function employerDashboard() {
  return getJson<Record<string, number>>("/api/v1/portal/employer/dashboard");
}

export function employerEmployees() {
  return getJson<{ items: Record<string, string | null>[] }>("/api/v1/portal/employer/employees");
}

export function employerInvoices() {
  return getJson<{ items: Record<string, string | null>[] }>("/api/v1/portal/employer/invoices");
}

export function clientDashboard() {
  return getJson<Record<string, number>>("/api/v1/portal/client/dashboard");
}

export function clientWorkers() {
  return getJson<{ items: Record<string, string | null>[] }>("/api/v1/portal/client/workers");
}

export function clientRecruitment() {
  return getJson<{ items: Record<string, string | null>[] }>("/api/v1/portal/client/recruitment");
}
