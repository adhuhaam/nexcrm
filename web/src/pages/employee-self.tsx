import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { XpatStatusBadge } from "@/components/xpat-status-badge";
import { Banner } from "@/components/shell";
import { SubmitButton } from "@/components/ux";
import { TextField } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson, postJson, sendJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { clearSessionCache, loadOfficeSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type NavId = "dashboard" | "attendance" | "salary" | "xpat" | "profile";

const NAV: { id: NavId; label: string; href: string; icon: typeof LayoutDashboardIcon }[] = [
  { id: "dashboard", label: "Dashboard", href: "/ess", icon: LayoutDashboardIcon },
  { id: "attendance", label: "Attendance", href: "/ess/attendance", icon: CalendarDaysIcon },
  { id: "salary", label: "Salary", href: "/ess/salary", icon: WalletIcon },
  { id: "xpat", label: "Xpat", href: "/ess/xpat", icon: IdCardIcon },
  { id: "profile", label: "Profile", href: "/ess/profile", icon: UserRoundIcon },
];

function EssLayout({ active, children }: { active: NavId; children: ReactNode }) {
  return (
    <div className="ess-app min-h-svh bg-background text-foreground">
      <header className="ess-topbar border-b px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employee portal</p>
            <h1 className="text-lg font-semibold">JACMS self-service</h1>
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
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24">{children}</main>
      <nav className="ess-tabbar fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
        <ul className="mx-auto grid max-w-3xl grid-cols-5 gap-1 px-2 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = item.id === active;
            return (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium",
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

function WarningList({ warnings }: { warnings: { label: string; date: string; daysRemaining: number; level: string }[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-2">
      {warnings.map((item) => (
        <li key={`${item.label}-${item.date}`} className="flex items-center justify-between gap-2 text-sm">
          <span>
            {item.label} · {formatDate(item.date)}
          </span>
          <Badge variant={item.level === "critical" ? "destructive" : "secondary"}>
            {item.daysRemaining < 0 ? "Expired" : `${item.daysRemaining}d`}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

type EssDashboard = {
  xpat: {
    status: string | null;
    stateName: string | null;
    workPermitNumber: string | null;
    warnings: { label: string; date: string; daysRemaining: number; level: string }[];
  };
  attendanceThisMonth: { month: string; P: number; AB: number; OD: number; unmarked: number };
  lastSalary: { netStaff: string; periodStart: string; periodEnd: string } | null;
  currentClient: { clientName: string; designation: string | null; workSite: string | null } | null;
};

export function EmployeeSelfDashboardPage() {
  const [data, setData] = useState<EssDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getJson<EssDashboard>("/api/v1/ess/dashboard")
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <EssLayout active="dashboard">
      <Banner message={error} error />
      {!data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>XPAT status</CardTitle>
              <CardDescription>Work permit compliance from your HR record</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <XpatStatusBadge status={data.xpat.status} stateName={data.xpat.stateName} />
                {data.xpat.workPermitNumber ? (
                  <span className="text-sm text-muted-foreground">WP {data.xpat.workPermitNumber}</span>
                ) : null}
              </div>
              <WarningList warnings={data.xpat.warnings ?? []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>This month&apos;s attendance</CardTitle>
              <CardDescription>{data.attendanceThisMonth.month}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Present" value={data.attendanceThisMonth.P} />
              <Stat label="Absent" value={data.attendanceThisMonth.AB} />
              <Stat label="Off day" value={data.attendanceThisMonth.OD} />
              <Stat label="Unmarked" value={data.attendanceThisMonth.unmarked} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Last net salary</CardTitle>
            </CardHeader>
            <CardContent>
              {data.lastSalary ? (
                <p className="text-2xl font-semibold tabular-nums">
                  {data.lastSalary.netStaff}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({formatDate(data.lastSalary.periodStart)} – {formatDate(data.lastSalary.periodEnd)})
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No locked payslip yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Current client</CardTitle>
            </CardHeader>
            <CardContent>
              {data.currentClient ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{data.currentClient.clientName}</p>
                  <p className="text-muted-foreground">{data.currentClient.designation ?? "—"}</p>
                  <p className="text-muted-foreground">{data.currentClient.workSite ?? "—"}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not allocated to a client right now.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </EssLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function EmployeeSelfAttendancePage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [days, setDays] = useState<{ date: string; status: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getJson<{ days: { date: string; status: string | null }[] }>(`/api/v1/ess/attendance?month=${month}`)
      .then((payload) => {
        if (!cancelled) setDays(payload.days);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load attendance");
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  function shift(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <EssLayout active="attendance">
      <Banner message={error} error />
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeftIcon className="size-4" />
        </Button>
        <p className="font-medium">{month}</p>
        <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {days.map((day) => (
          <div
            key={day.date}
            className={cn(
              "rounded-md border p-2",
              day.status === "P" && "border-emerald-500/40 bg-emerald-500/10",
              day.status === "AB" && "border-destructive/40 bg-destructive/10",
              day.status === "OD" && "border-sky-500/40 bg-sky-500/10",
              !day.status && "text-muted-foreground",
            )}
          >
            <div className="font-medium">{Number(day.date.slice(8, 10))}</div>
            <div>{day.status ?? "—"}</div>
          </div>
        ))}
      </div>
    </EssLayout>
  );
}

export function EmployeeSelfSalaryPage() {
  const [items, setItems] = useState<
    {
      payRunId: string;
      periodStart: string;
      periodEnd: string;
      netStaff: string;
      currency: string;
      basicSalary: string;
      otStaff: string;
      deductions: string;
    }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getJson<{ items: typeof items }>("/api/v1/ess/salary/history")
      .then((payload) => setItems(payload.items))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load salary"));
  }, []);

  return (
    <EssLayout active="salary">
      <Banner message={error} error />
      <div className="space-y-3">
        {items.map((row) => (
          <Card key={row.payRunId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {formatDate(row.periodStart)} – {formatDate(row.periodEnd)}
              </CardTitle>
              <CardDescription>
                Basic {row.basicSalary} · OT {row.otStaff} · Deductions {row.deductions}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <p className="text-xl font-semibold tabular-nums">
                {row.netStaff} {row.currency}
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href={`/ess/salary/${row.payRunId}/payslip`} target="_blank" rel="noreferrer">
                  Payslip PDF
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
        {!items.length ? <p className="text-sm text-muted-foreground">No locked payslips yet.</p> : null}
      </div>
    </EssLayout>
  );
}

export function EmployeeSelfPayslipPage({ payRunId }: { payRunId: string }) {
  const [line, setLine] = useState<Record<string, string | number | null> | null>(null);

  useEffect(() => {
    void getJson<Record<string, string | number | null>>(`/api/v1/ess/salary/${payRunId}/payslip`).then((payload) =>
      setLine(payload),
    );
    document.title = "Payslip · JACMS";
  }, [payRunId]);

  useEffect(() => {
    if (!line) return;
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [line]);

  if (!line) return <p className="p-6 text-sm">Loading payslip…</p>;

  return (
    <div className="payslip-print min-h-svh bg-white p-8 text-black">
      <header className="mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">Payslip</h1>
        <p>
          {line.employeeName as string} · {formatDate(String(line.periodStart))} –{" "}
          {formatDate(String(line.periodEnd))}
        </p>
      </header>
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td>Basic salary</td>
            <td className="text-right tabular-nums">{String(line.basicSalary)}</td>
          </tr>
          <tr>
            <td>OT pay</td>
            <td className="text-right tabular-nums">{String(line.otPay)}</td>
          </tr>
          <tr>
            <td>LOP</td>
            <td className="text-right tabular-nums">{String(line.lop)}</td>
          </tr>
          <tr>
            <td>Other deductions</td>
            <td className="text-right tabular-nums">{String(line.deductions)}</td>
          </tr>
          <tr className="border-t font-semibold">
            <td>Net pay</td>
            <td className="text-right tabular-nums">
              {String(line.netPay)} {String(line.currency)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-8 text-xs text-neutral-500">Use your browser Print → Save as PDF.</p>
    </div>
  );
}

export function EmployeeSelfXpatPage() {
  const [view, setView] = useState<{
    documents: Record<string, unknown>;
    employment: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getJson<{ documents: Record<string, unknown>; employment: Record<string, unknown> }>("/api/v1/ess/xpat")
      .then((payload) => setView(payload))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load XPAT"));
  }, []);

  const docs = view?.documents as Record<string, string | null> | undefined;

  return (
    <EssLayout active="xpat">
      <Banner message={error} error />
      {docs ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {docs.photoFileId ? <EmployeeAvatar photoFileId={docs.photoFileId} name="You" size="lg" /> : null}
              <Row label="Work permit" value={docs.workPermitNumber} />
              <Row label="Permit expiry" value={docs.workPermitExpiresOn} date />
              <Row label="Passport" value={docs.passportNumber} />
              <Row label="Passport expiry" value={docs.passportExpiry} date />
              <Row label="Visa" value={docs.workVisaNumber} />
              <Row label="Visa expiry" value={docs.workVisaExpiry} date />
              <Row label="Insurance expiry" value={docs.insuranceExpiry} date />
              <Row label="Medical expiry" value={docs.medicalExpiry} date />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Employment</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Client" value={(view?.employment as { clientName?: string }).clientName ?? null} />
              <Row label="Work site" value={docs.workSite ?? null} />
              <Row label="Job title" value={(view?.employment as { jobTitle?: string }).jobTitle ?? null} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </EssLayout>
  );
}

function Row({ label, value, date }: { label: string; value: string | null | undefined; date?: boolean }) {
  const text = value ? (date ? formatDate(value) : value) : "—";
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      {text}
    </p>
  );
}

export function EmployeeSelfProfilePage() {
  const [phone, setPhone] = useState("");
  const [phoneConfirm, setPhoneConfirm] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getJson<{ phone: string | null }>("/api/v1/ess/profile").then((payload) => {
      setPhone(payload.phone ?? "");
      setPhoneConfirm(payload.phone ?? "");
    });
  }, []);

  function savePhone(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    void sendJson("/api/v1/ess/profile/phone", "POST", { phone, phoneConfirm })
      .then(() => setNotice("Phone updated."))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Update failed"))
      .finally(() => setPending(false));
  }

  function savePassword(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    void sendJson("/api/v1/ess/profile/password", "POST", { currentPassword, newPassword })
      .then(() => {
        setNotice("Password updated.");
        clearSessionCache();
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Update failed"))
      .finally(() => setPending(false));
  }

  return (
    <EssLayout active="profile">
      <Banner message={error} error />
      <Banner message={notice} />
      <div className="grid gap-6">
        <form className="space-y-3" onSubmit={savePhone}>
          <h2 className="text-lg font-semibold">Phone number</h2>
          <TextField id="phone" label="Phone" value={phone} onChange={setPhone} />
          <TextField id="phoneConfirm" label="Confirm phone" value={phoneConfirm} onChange={setPhoneConfirm} />
          <SubmitButton pending={pending}>Save phone</SubmitButton>
        </form>
        <form className="space-y-3" onSubmit={savePassword}>
          <h2 className="text-lg font-semibold">Password</h2>
          <TextField
            id="currentPassword"
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <TextField id="newPassword" label="New password (min 8)" type="password" value={newPassword} onChange={setNewPassword} />
          <SubmitButton pending={pending}>Change password</SubmitButton>
        </form>
      </div>
    </EssLayout>
  );
}

export function EmployeeSelfChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void loadOfficeSession().then((session) => {
      if (session.role?.slug !== "employee_self_service") window.location.assign("/");
      else if (!session.mustChangePassword) window.location.assign("/ess");
    });
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    void sendJson("/api/v1/ess/change-password", "POST", { currentPassword, newPassword })
      .then(() => window.location.assign("/ess"))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not change password"))
      .finally(() => setPending(false));
  }

  return (
    <main className="nx-login">
      <div className="nx-login-card">
        <div className="nx-login-head">
          <h1>Set a new password</h1>
          <p>Your admin gave you a temporary password. Choose a new one (8+ characters).</p>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <Banner message={error} error />
          <TextField
            id="currentPassword"
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <TextField id="newPassword" label="New password" type="password" value={newPassword} onChange={setNewPassword} />
          <SubmitButton pending={pending} className="w-full">
            Continue to portal
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}

export function EmployeeSelfGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    void loadOfficeSession().then((session) => {
      if (!session.user) window.location.assign("/login");
      else if (session.role?.slug !== "employee_self_service") window.location.assign("/");
      else if (session.mustChangePassword) window.location.assign("/ess/change-password");
      else setOk(true);
    });
  }, []);
  return ok ? children : <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
}
