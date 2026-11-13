import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  ClipboardListIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  UsersIcon,
} from "lucide-react";
import { Banner } from "@/components/shell";
import { SubmitButton } from "@/components/ux";
import { TextField } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getJson, postJson, sendJson } from "@/lib/api";
import { clearSessionCache, loadOfficeSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type NavId = "dashboard" | "workers" | "recruitment" | "invoices" | "attendance";

const NAV: { id: NavId; label: string; href: string; icon: typeof LayoutDashboardIcon }[] = [
  { id: "dashboard", label: "Home", href: "/client", icon: LayoutDashboardIcon },
  { id: "workers", label: "Workers", href: "/client/workers", icon: UsersIcon },
  { id: "recruitment", label: "Recruitment", href: "/client/recruitment", icon: ClipboardListIcon },
  { id: "invoices", label: "Invoices", href: "/client/invoices", icon: FileTextIcon },
  { id: "attendance", label: "Attendance", href: "/client/attendance", icon: CalendarDaysIcon },
];

function PortalLayout({ active, title, children }: { active: NavId; title: string; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client portal</p>
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
        <ul className="mx-auto grid max-w-4xl grid-cols-5 gap-1 px-2 py-2">
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

export function ClientPortalGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadOfficeSession()
      .then((session) => {
        if (session.role?.slug !== "portal_client") {
          window.location.assign("/login");
          return;
        }
        if (session.mustChangePassword) {
          window.location.assign("/client/change-password");
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

export function ClientPortalChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    void sendJson("/api/v1/portal/client/change-password", "POST", { currentPassword, newPassword })
      .then(() => {
        clearSessionCache();
        window.location.assign("/client");
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
          <CardDescription>Required on first sign-in for the client portal.</CardDescription>
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

export function ClientPortalDashboardPage() {
  const [stats, setStats] = useState<{ activeWorkers: number; lockedInvoiceCount: number; recruitmentTotal: number } | null>(null);

  useEffect(() => {
    void getJson<typeof stats>("/api/v1/portal/client/dashboard").then(setStats);
  }, []);

  return (
    <PortalLayout active="dashboard" title="Overview">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active workers</CardDescription>
            <CardTitle className="text-3xl">{stats?.activeWorkers ?? "…"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invoices</CardDescription>
            <CardTitle className="text-3xl">{stats?.lockedInvoiceCount ?? "…"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Placement records</CardDescription>
            <CardTitle className="text-3xl">{stats?.recruitmentTotal ?? "…"}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </PortalLayout>
  );
}

export function ClientPortalWorkersPage() {
  const [items, setItems] = useState<
    { legalName: string; employerName: string; designation: string | null; joinDate: string; xpatStatus: string | null }[]
  >([]);

  useEffect(() => {
    void getJson<{ items: typeof items }>("/api/v1/portal/client/workers").then((data) => setItems(data.items));
  }, []);

  return (
    <PortalLayout active="workers" title="Assigned workers">
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Legal employer</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={`${row.legalName}-${row.joinDate}`}>
                  <TableCell className="font-medium">{row.legalName}</TableCell>
                  <TableCell>{row.employerName}</TableCell>
                  <TableCell>{row.designation ?? "—"}</TableCell>
                  <TableCell>{row.joinDate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalLayout>
  );
}

export function ClientPortalRecruitmentPage() {
  const [items, setItems] = useState<
    { workerName: string; employerName: string; status: string; loaStatus: string; loaNumber: string | null; joinDate: string }[]
  >([]);

  useEffect(() => {
    void getJson<{ items: typeof items }>("/api/v1/portal/client/recruitment").then((data) => setItems(data.items));
  }, []);

  return (
    <PortalLayout active="recruitment" title="Recruitment progress">
      <Card>
        <CardDescription className="px-6 pt-6">
          Allocations and LOA status for your site (read-only).
        </CardDescription>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Employer</TableHead>
                <TableHead>Allocation</TableHead>
                <TableHead>LOA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={`${row.workerName}-${row.joinDate}`}>
                  <TableCell>{row.workerName}</TableCell>
                  <TableCell>{row.employerName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.loaNumber ?? "—"} ({row.loaStatus})
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

export function ClientPortalInvoicesPage() {
  const [items, setItems] = useState<
    { employerName: string; periodStart: string; periodEnd: string; invoiceNumber: string | null; netBill: string | null }[]
  >([]);

  useEffect(() => {
    void getJson<{ items: typeof items }>("/api/v1/portal/client/invoices").then((data) => setItems(data.items));
  }, []);

  return (
    <PortalLayout active="invoices" title="Invoices">
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employer</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Net bill</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, index) => (
                <TableRow key={`${row.periodStart}-${index}`}>
                  <TableCell>{row.employerName}</TableCell>
                  <TableCell>
                    {row.periodStart} → {row.periodEnd}
                  </TableCell>
                  <TableCell>{row.invoiceNumber ?? "—"}</TableCell>
                  <TableCell>{row.netBill ?? "—"}</TableCell>
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

export function ClientPortalAttendancePage() {
  const [month, setMonth] = useState(monthNow());
  const [workers, setWorkers] = useState<{ legalName: string; days: { date: string; status: string }[] }[]>([]);

  useEffect(() => {
    void getJson<{ workers: typeof workers }>(`/api/v1/portal/client/attendance?month=${month}`).then((data) =>
      setWorkers(data.workers),
    );
  }, [month]);

  return (
    <PortalLayout active="attendance" title="Attendance">
      <div className="mb-4">
        <TextField id="month" label="Month (YYYY-MM)" value={month} onChange={setMonth} />
      </div>
      <div className="grid gap-4">
        {workers.map((row) => (
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
