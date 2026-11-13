import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { Shell } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePath } from "@/hooks/use-path";
import { installSpaNavigation } from "@/lib/spa-nav";
import { LoginPage } from "@/pages/login";
import {
  EmployeeSelfAttendancePage,
  EmployeeSelfChangePasswordPage,
  EmployeeSelfDashboardPage,
  EmployeeSelfGate,
  EmployeeSelfPayslipPage,
  EmployeeSelfProfilePage,
  EmployeeSelfSalaryPage,
  EmployeeSelfXpatPage,
} from "@/pages/employee-self";
import {
  ClientPortalAttendancePage,
  ClientPortalChangePasswordPage,
  ClientPortalDashboardPage,
  ClientPortalGate,
  ClientPortalInvoicesPage,
  ClientPortalRecruitmentPage,
  ClientPortalWorkersPage,
} from "@/pages/client-portal";
import {
  EmployerPortalAttendancePage,
  EmployerPortalChangePasswordPage,
  EmployerPortalDashboardPage,
  EmployerPortalEmployeesPage,
  EmployerPortalGate,
  EmployerPortalInvoicesPage,
  EmployerPortalPayrollPage,
  EmployerPortalQuotaPage,
} from "@/pages/employer-portal";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Soft-routed pages load on demand so the first paint stays small.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyNamed(loader: () => Promise<Record<string, ComponentType<any>>>, exportName: string) {
  return lazy(() => loader().then((mod) => ({ default: mod[exportName]! })));
}

const DashboardPage = lazyNamed(() => import("@/pages/dashboard"), "DashboardPage");
const CompaniesPage = lazyNamed(() => import("@/pages/companies"), "CompaniesPage");
const CompanyDetailPage = lazyNamed(() => import("@/pages/company-detail"), "CompanyDetailPage");
const ClientsPage = lazyNamed(() => import("@/pages/clients"), "ClientsPage");
const ClientDetailPage = lazyNamed(() => import("@/pages/client-detail"), "ClientDetailPage");
const DesignationsPage = lazyNamed(() => import("@/pages/designations"), "DesignationsPage");
const AccommodationsPage = lazyNamed(() => import("@/pages/accommodations"), "AccommodationsPage");
const AllocationsPage = lazyNamed(() => import("@/pages/allocations"), "AllocationsPage");
const AttendancePage = lazyNamed(() => import("@/pages/attendance"), "AttendancePage");
const PayrollPage = lazyNamed(() => import("@/pages/payroll"), "PayrollPage");
const PayrollPaymentRequestPage = lazyNamed(
  () => import("@/pages/payroll-payment-request"),
  "PayrollPaymentRequestPage",
);
const PayrollSalarySheetPage = lazyNamed(() => import("@/pages/payroll-salary-sheet"), "PayrollSalarySheetPage");
const PayrollPayslipsPage = lazyNamed(() => import("@/pages/payroll-payslips"), "PayrollPayslipsPage");
const DocumentsPage = lazyNamed(() => import("@/pages/documents"), "DocumentsPage");
const EmployeeListPage = lazyNamed(() => import("@/pages/employees"), "EmployeeListPage");
const EmployeeFormPage = lazyNamed(() => import("@/pages/employees"), "EmployeeFormPage");
const EmployeeOnboardPage = lazyNamed(() => import("@/pages/employee-onboard"), "EmployeeOnboardPage");
const LoaListPage = lazyNamed(() => import("@/pages/loas"), "LoaListPage");
const LoaEditorPage = lazyNamed(() => import("@/pages/loa-editor"), "LoaEditorPage");
const WorkPermitList = lazyNamed(() => import("@/pages/work-permits"), "WorkPermitList");
const WorkPermitForm = lazyNamed(() => import("@/pages/work-permits"), "WorkPermitForm");
const ProjectList = lazyNamed(() => import("@/pages/projects"), "ProjectList");
const ProjectDetail = lazyNamed(() => import("@/pages/projects"), "ProjectDetail");
const ExpensesPage = lazyNamed(() => import("@/pages/expenses"), "ExpensesPage");
const AccessPage = lazyNamed(() => import("@/pages/access"), "AccessPage");

function RouteFallback() {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <PageSkeleton cards={2} />
    </div>
  );
}

export default function App() {
  const path = usePath();

  useEffect(() => installSpaNavigation(), []);

  return <Suspense fallback={<RouteFallback />}>{routeFor(path)}</Suspense>;
}

function routeFor(path: string): ReactNode {
  if (path === "/login") return <LoginPage />;
  if (path === "/ess/change-password") return <EmployeeSelfChangePasswordPage />;
  if (path.startsWith("/ess/salary/") && path.endsWith("/payslip")) {
    const id = path.slice("/ess/salary/".length, -"/payslip".length);
    return uuid.test(id) ? <EmployeeSelfPayslipPage payRunId={id} /> : <Missing />;
  }
  if (path === "/ess" || path === "/ess/")
    return (
      <EmployeeSelfGate>
        <EmployeeSelfDashboardPage />
      </EmployeeSelfGate>
    );
  if (path === "/ess/attendance")
    return (
      <EmployeeSelfGate>
        <EmployeeSelfAttendancePage />
      </EmployeeSelfGate>
    );
  if (path === "/ess/salary")
    return (
      <EmployeeSelfGate>
        <EmployeeSelfSalaryPage />
      </EmployeeSelfGate>
    );
  if (path === "/ess/xpat")
    return (
      <EmployeeSelfGate>
        <EmployeeSelfXpatPage />
      </EmployeeSelfGate>
    );
  if (path === "/ess/profile")
    return (
      <EmployeeSelfGate>
        <EmployeeSelfProfilePage />
      </EmployeeSelfGate>
    );
  if (path === "/employer/change-password") return <EmployerPortalChangePasswordPage />;
  if (path === "/employer" || path === "/employer/")
    return (
      <EmployerPortalGate>
        <EmployerPortalDashboardPage />
      </EmployerPortalGate>
    );
  if (path === "/employer/employees")
    return (
      <EmployerPortalGate>
        <EmployerPortalEmployeesPage />
      </EmployerPortalGate>
    );
  if (path === "/employer/quota")
    return (
      <EmployerPortalGate>
        <EmployerPortalQuotaPage />
      </EmployerPortalGate>
    );
  if (path === "/employer/invoices")
    return (
      <EmployerPortalGate>
        <EmployerPortalInvoicesPage />
      </EmployerPortalGate>
    );
  if (path === "/employer/payroll")
    return (
      <EmployerPortalGate>
        <EmployerPortalPayrollPage />
      </EmployerPortalGate>
    );
  if (path === "/employer/attendance")
    return (
      <EmployerPortalGate>
        <EmployerPortalAttendancePage />
      </EmployerPortalGate>
    );
  if (path === "/client/change-password") return <ClientPortalChangePasswordPage />;
  if (path === "/client" || path === "/client/")
    return (
      <ClientPortalGate>
        <ClientPortalDashboardPage />
      </ClientPortalGate>
    );
  if (path === "/client/workers")
    return (
      <ClientPortalGate>
        <ClientPortalWorkersPage />
      </ClientPortalGate>
    );
  if (path === "/client/recruitment")
    return (
      <ClientPortalGate>
        <ClientPortalRecruitmentPage />
      </ClientPortalGate>
    );
  if (path === "/client/invoices")
    return (
      <ClientPortalGate>
        <ClientPortalInvoicesPage />
      </ClientPortalGate>
    );
  if (path === "/client/attendance")
    return (
      <ClientPortalGate>
        <ClientPortalAttendancePage />
      </ClientPortalGate>
    );
  if (path === "/users" || path === "/admin" || path === "/settings" || path.startsWith("/settings/")) {
    return <AccessPage />;
  }
  if (path === "/") return <DashboardPage />;
  if (path === "/companies") return <CompaniesPage />;
  if (path.startsWith("/companies/")) {
    const id = path.slice("/companies/".length);
    return uuid.test(id) ? <CompanyDetailPage id={id} /> : <Missing />;
  }
  if (path === "/clients") return <ClientsPage />;
  if (path.startsWith("/clients/")) {
    const id = path.slice("/clients/".length);
    return uuid.test(id) ? <ClientDetailPage id={id} /> : <Missing />;
  }
  if (path === "/designations") return <DesignationsPage />;
  if (path === "/accommodations") return <AccommodationsPage />;
  if (path === "/allocations") return <AllocationsPage />;
  if (path === "/attendance") return <AttendancePage />;
  if (path.startsWith("/payroll/") && path.endsWith("/payment-request")) {
    const id = path.slice("/payroll/".length, -"/payment-request".length).replace(/\/$/, "");
    return uuid.test(id) ? <PayrollPaymentRequestPage payRunId={id} /> : <Missing />;
  }
  if (path.startsWith("/payroll/") && path.endsWith("/salary-sheet")) {
    const id = path.slice("/payroll/".length, -"/salary-sheet".length).replace(/\/$/, "");
    return uuid.test(id) ? <PayrollSalarySheetPage payRunId={id} /> : <Missing />;
  }
  if (path.startsWith("/payroll/") && path.endsWith("/payslips")) {
    const id = path.slice("/payroll/".length, -"/payslips".length).replace(/\/$/, "");
    return uuid.test(id) ? <PayrollPayslipsPage payRunId={id} /> : <Missing />;
  }
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
  if (path === "/apps/expenses") return <ExpensesPage />;
  return <Missing />;
}

function Missing() {
  return (
    <Shell
      title="JACMS · Not found"
      description="That page is not in this office. Use search or head back to the dashboard."
      actions={
        <Button asChild>
          <a href="/">Back to dashboard</a>
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>404</CardTitle>
          <CardDescription>The route you opened is not registered.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/employees">Employees</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/loas">LOAs</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/apps/expenses">Finance</a>
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}
