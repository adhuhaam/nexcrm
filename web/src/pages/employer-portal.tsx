import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  BriefcaseIcon,
  CalendarDaysIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { Banner } from "@/components/shell";
import { SubmitButton } from "@/components/ux";
import { TextField } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { XpatStatusBadge } from "@/components/xpat-status-badge";
import { getJson, postJson, sendJson } from "@/lib/api";
import { clearSessionCache, loadOfficeSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type NavId = "dashboard" | "employees" | "quota" | "invoices" | "payroll" | "attendance";

const NAV: { id: NavId; label: string; href: string; icon: typeof LayoutDashboardIcon }[] = [
  { id: "dashboard", label: "Home", href: "/employer", icon: LayoutDashboardIcon },
  { id: "employees", label: "Staff", href: "/employer/employees", icon: UsersIcon },
  { id: "quota", label: "Quota", href: "/employer/quota", icon: BriefcaseIcon },
  { id: "invoices", label: "Invoices", href: "/employer/invoices", icon: FileTextIcon },
  { id: "payroll", label: "Payroll", href: "/employer/payroll", icon: WalletIcon },
  { id: "attendance", label: "Attendance", href: "/employer/attendance", icon: CalendarDaysIcon },
];

function PortalLayout({ active, title, children }: { active: NavId; title: string; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Legal employer portal</p>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void postJson("/logout", {}).then(() => {
                clearSessionCache();
                window.location.assign("/login");
              });
            }}
          >
            <LogOutIcon className="size-4" />
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 pb-24">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
        <ul className="mx-auto grid max-w-4xl grid-cols-6 gap-1 px-2 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = item.id === active;
            return (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium",
                    on ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function EmployerPortalGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadOfficeSession()
      .then((session) => {
        if (session.role?.slug !== "legal_employer") {
          window.location.assign("/login");
          return;
        }
        if (session.mustChangePassword) {
          window.location.assign("/employer/change-password");
          return;
        }
        setReady(true);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load session"));
  }, []);

  if (error) return <div className="p-8 text-center text-sm text-destructive">{error}</div>;
  if (!ready) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  return <>{children}</>;
}

export function EmployerPortalChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    void sendJson("/api/v1/portal/employer/change-password", "POST", { currentPassword, newPassword })
      .then(() => {
        clearSessionCache();
        window.location.assign("/employer");
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Password change failed");
        setPending(false);
      });
  }

  return (
    <div className="grid min-h-svh place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>Required on first sign-in for the employer portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={submit}>
            <Banner message={error} error />
            <TextField id="current" label="Temporary password" type="password" value={currentPassword} onChange={setCurrentPassword} />
            <TextField id="new" label="New password" type="password" value={newPassword} onChange={setNewPassword} />
            <SubmitButton pending={pending}>Continue to portal</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function EmployerPortalDashboardPage() {
  const [stats, setStats] = useState<{ employeeCount: number; allocatedCount: number; lockedPayRunCount: number } | null>(null);

  useEffect(() => {
    void getJson<typeof stats>("/api/v1/portal/employer/dashboard").then(setStats);
  }, []);

  return (
    <PortalLayout active="dashboard" title="Overview">
      <DashboardStatsGrid stats={stats} />
    </PortalLayout>
  );
}

function DashboardStatsGrid({ stats }: { stats: { employeeCount: number; allocatedCount: number; lockedPayRunCount: number } | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Employees</CardDescription>
          <CardTitle className="text-3xl">{stats?.employeeCount ?? "…"}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Allocated to clients</CardDescription>
          <CardTitle className="text-3xl">{stats?.allocatedCount ?? "…"}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Locked payroll / invoices</CardDescription>
          <CardTitle className="text-3xl">{stats?.lockedPayRunCount ?? "…"}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

export function EmployerPortalEmployeesPage() {
  const [items, setItems] = useState<
    {
      id: string;
      legalName: string;
      xpatStatus: string | null;
      xpatStateName: string | null;
      clientName: string | null;
      workPermitNumber: string | null;
    }[]
  >([]);

  useEffect(() => {
    void getJson<{ items: typeof items }>("/api/v1/portal/employer/employees").then((data) => setItems(data.items));
  }, []);

  return (
    <PortalLayout active="employees" title="Employees">
      <Card>
        <CardHeader>
          <CardTitle>Your workforce</CardTitle>
          <CardDescription>Read-only list with XPAT status and current client placement.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>XPAT</TableHead>
                <TableHead>Work permit</TableHead>
                <TableHead>Client</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.legalName}</TableCell>
                  <TableCell>
                    <XpatStatusBadge status={row.xpatStatus} stateName={row.xpatStateName} />
                  </TableCell>
                  <TableCell>{row.workPermitNumber ?? "—"}</TableCell>
                  <TableCell>{row.clientName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalLayout>
  );
}

export function EmployerPortalQuotaPage() {
  const [pools, setPools] = useState<
    { name: string; projectName: string; siteName: string; capacity: number; filled: number }[]
  >([]);
  const [permits, setPermits] = useState<{ legalName: string; workPermitNumber: string | null; expiresOn: string | null }[]>([]);

  useEffect(() => {
    void getJson<{ pools: typeof pools; workPermits: typeof permits }>("/api/v1/portal/employer/quota").then((data) => {
      setPools(data.pools);
      setPermits(data.workPermits);
    });
  }, []);

  return (
    <PortalLayout active="quota" title="Quota & work permits">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Quota pools</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead>Project / site</TableHead>
                  <TableHead>Fill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pools.map((row) => (
                  <TableRow key={`${row.projectName}-${row.name}`}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      {row.projectName} · {row.siteName}
                    </TableCell>
                    <TableCell>
                      {row.filled}/{row.capacity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Work permits</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Permit</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permits.map((row) => (
                  <TableRow key={row.legalName}>
                    <TableCell>{row.legalName}</TableCell>
                    <TableCell>{row.workPermitNumber ?? "—"}</TableCell>
                    <TableCell>{row.expiresOn ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}

export function EmployerPortalInvoicesPage() {
  const [items, setItems] = useState<
    { clientName: string; periodStart: string; periodEnd: string; invoiceNumber: string | null; netBill: string | null; status: string }[]
  >([]);

  useEffect(() => {
    void getJson<{ items: typeof items }>("/api/v1/portal/employer/invoices").then((data) => setItems(data.items));
    void getJson<{ items: { amount: string; recordedOn: string }[] }>("/api/v1/portal/employer/payments").then(() => {});
  }, []);

  return (
    <PortalLayout active="invoices" title="Invoices & payments">
      <Card>
        <CardHeader>
          <CardTitle>Client billing</CardTitle>
          <CardDescription>Locked pay runs and invoice numbers (read-only).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Net bill</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, index) => (
                <TableRow key={`${row.periodStart}-${index}`}>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell>
                    {row.periodStart} → {row.periodEnd}
                  </TableCell>
                  <TableCell>{row.invoiceNumber ?? "—"}</TableCell>
                  <TableCell>{row.netBill ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalLayout>
  );
}

function monthNow(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function EmployerPortalPayrollPage() {
  const [month, setMonth] = useState(monthNow());
  const [items, setItems] = useState<{ employee_name: string; client_name: string; net_staff: string }[]>([]);

  useEffect(() => {
    void getJson<{ items: typeof items }>(`/api/v1/portal/employer/payroll?month=${month}`).then((data) => setItems(data.items));
  }, [month]);

  return (
    <PortalLayout active="payroll" title="Payroll">
      <div className="mb-4">
        <TextField id="month" label="Month (YYYY-MM)" value={month} onChange={setMonth} />
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Net staff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, index) => (
                <TableRow key={`${row.employee_name}-${index}`}>
                  <TableCell>{row.employee_name}</TableCell>
                  <TableCell>{row.client_name}</TableCell>
                  <TableCell>{row.net_staff}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalLayout>
  );
}

export function EmployerPortalAttendancePage() {
  const [month, setMonth] = useState(monthNow());
  const [employees, setEmployees] = useState<{ legalName: string; days: { date: string; status: string }[] }[]>([]);

  useEffect(() => {
    void getJson<{ employees: typeof employees }>(`/api/v1/portal/employer/attendance?month=${month}`).then((data) =>
      setEmployees(data.employees),
    );
  }, [month]);

  return (
    <PortalLayout active="attendance" title="Attendance">
      <div className="mb-4">
        <TextField id="month" label="Month (YYYY-MM)" value={month} onChange={setMonth} />
      </div>
      <div className="grid gap-4">
        {employees.map((row) => (
          <Card key={row.legalName}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{row.legalName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1 text-xs">
              {row.days.map((day) => (
                <span key={day.date} className="rounded border px-2 py-1">
                  {day.date.slice(-2)}:{day.status}
                </span>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </PortalLayout>
  );
}
