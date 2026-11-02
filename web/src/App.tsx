import { AdminPage } from "@/pages/admin";
import { AllocationsPage } from "@/pages/allocations";
import { ClientsPage } from "@/pages/clients";
import { CompaniesPage } from "@/pages/companies";
import { CompanyDetailPage } from "@/pages/company-detail";
import { DashboardPage } from "@/pages/dashboard";
import { DocumentsPage } from "@/pages/documents";
import { EmployeeFormPage, EmployeeListPage } from "@/pages/employees";
import { EmployeeOnboardPage } from "@/pages/employee-onboard";
import { AccommodationsPage } from "@/pages/accommodations";
import { LoaEditorPage } from "@/pages/loa-editor";
import { LoaListPage } from "@/pages/loas";
import { LoginPage } from "@/pages/login";
import { PayrollPage } from "@/pages/payroll";
import { ProjectDetail, ProjectList } from "@/pages/projects";
import { SettingsPage } from "@/pages/settings";
import { UsersPage } from "@/pages/users";
import { WorkPermitForm, WorkPermitList } from "@/pages/work-permits";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function App() {
  const path = window.location.pathname;
  if (path === "/login") return <LoginPage />;
  if (path === "/users") return <UsersPage />;
  if (path === "/admin") return <AdminPage />;
  if (path === "/settings") return <SettingsPage />;
  if (path === "/") return <DashboardPage />;
  if (path === "/companies") return <CompaniesPage />;
  if (path.startsWith("/companies/")) {
    const id = path.slice("/companies/".length);
    return uuid.test(id) ? <CompanyDetailPage id={id} /> : <Missing />;
  }
  if (path === "/clients") return <ClientsPage />;
  if (path === "/accommodations") return <AccommodationsPage />;
  if (path === "/allocations") return <AllocationsPage />;
  if (path === "/payroll") return <PayrollPage />;
  if (path === "/documents") return <DocumentsPage />;
  if (path === "/employees") return <EmployeeListPage />;
  if (path === "/employees/onboard") return <EmployeeOnboardPage />;
  if (path === "/employees/new") return <EmployeeFormPage id={null} />;
  if (path.startsWith("/employees/")) {
    const id = path.slice("/employees/".length);
    return uuid.test(id) ? <EmployeeFormPage id={id} /> : <Missing />;
  }
  if (path === "/loas") return <LoaListPage />;
  if (path === "/loas/new") return <LoaEditorPage id={null} />;
  if (path.startsWith("/loas/")) {
    const id = path.slice("/loas/".length);
    return uuid.test(id) ? <LoaEditorPage id={id} /> : <Missing />;
  }
  if (path === "/work-permits") return <WorkPermitList />;
  if (path === "/work-permits/new") return <WorkPermitForm id={null} />;
  if (path.startsWith("/work-permits/")) {
    const id = path.slice("/work-permits/".length);
    return uuid.test(id) ? <WorkPermitForm id={id} /> : <Missing />;
  }
  if (path === "/projects") return <ProjectList />;
  if (path.startsWith("/projects/")) {
    const id = path.slice("/projects/".length);
    return uuid.test(id) ? <ProjectDetail id={id} /> : <Missing />;
  }
  return <Missing />;
}

function Missing() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        <a className="underline underline-offset-4" href="/">
          Back to dashboard
        </a>
      </p>
    </main>
  );
}
