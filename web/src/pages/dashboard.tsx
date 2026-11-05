import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2Icon, FileTextIcon, HandshakeIcon, PlusIcon, UsersIcon } from "lucide-react";
import { QuickCreateMenu } from "@/components/quick-create";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { formatMoneyPair } from "@/lib/money";

type DashboardModel = {
  counts: { companies: number; employers?: number; clients?: number; employees: number; letters: number };
  headcount?: {
    clientCompanyId: string;
    clientName: string;
    activeCount: number;
    employerCount?: number;
    staffSalaryTotal: string;
    billRateTotal: string;
  }[];
  expiring?: {
    id: string;
    legalName: string;
    workPermitNumber: string | null;
    passportNumber: string | null;
    companyName: string;
    clientName: string | null;
    expiresOn: string;
    daysRemaining: number;
  }[];
  recentLetters: {
    id: string;
    documentNumber: string;
    letterDate: string;
    employeeName: string | null;
    companyName: string;
  }[];
};

function todayLabel(now = new Date()): string {
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday}, ${formatDate(now)}`;
}

export function DashboardPage() {
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const description = useMemo(() => `Here is how the office is looking for ${todayLabel()}.`, []);

  useEffect(() => {
    let cancelled = false;
    getJson<DashboardModel>("/api/v1/hr/dashboard")
      .then((data) => {
        if (!cancelled) setModel(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Shell
      title="NEXCRM · Dashboard"
      greet
      description={description}
      actions={
        <WhenEditing>
          <>
            <QuickCreateMenu variant="outline" label="Quick Create" />
            <Button asChild>
              <a href="/loas/new">
                <PlusIcon />
                New LOA
              </a>
            </Button>
          </>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      {!model && !error ? <PageSkeleton cards={4} /> : null}
      {model ? (
        <>
          <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              href="/companies"
              label="Employers"
              value={model.counts.employers ?? model.counts.companies}
              icon={<Building2Icon className="size-4" />}
              hint="Legal employer companies"
            />
            <Metric
              href="/clients"
              label="Clients"
              value={model.counts.clients ?? 0}
              icon={<HandshakeIcon className="size-4" />}
              hint="Client companies on file"
            />
            <Metric
              href="/employees"
              label="Employees"
              value={model.counts.employees}
              icon={<UsersIcon className="size-4" />}
              hint="Active workforce records"
            />
            <Metric
              href="/loas"
              label="LOAs"
              value={model.counts.letters}
              icon={<FileTextIcon className="size-4" />}
              hint="Archived appointment letters"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="grid gap-1">
                  <CardTitle>Expiring within 3 months</CardTitle>
                  <CardDescription>
                    Work permits due from today through the next three months
                    {model.expiring?.length ? ` · ${model.expiring.length} worker(s)` : ""}.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/employees">Employees</a>
                </Button>
              </CardHeader>
              <CardContent>
                {model.expiring?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Work permit</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {model.expiring.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => window.location.assign(`/employees?edit=${row.id}`)}
                        >
                          <TableCell>
                            <div className="font-medium">{row.legalName}</div>
                            <div className="text-xs text-muted-foreground">{row.companyName}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.workPermitNumber ?? "—"}</TableCell>
                          <TableCell className="text-xs">{row.clientName ?? "—"}</TableCell>
                          <TableCell>
                            <div className="text-sm">{formatDate(row.expiresOn)}</div>
                            <div
                              className={
                                row.daysRemaining <= 30
                                  ? "text-[11px] text-destructive"
                                  : "text-[11px] text-muted-foreground"
                              }
                            >
                              {row.daysRemaining === 0
                                ? "Expires today"
                                : row.daysRemaining === 1
                                  ? "1 day left"
                                  : `${row.daysRemaining} days left`}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <ShellEmpty
                    icon={<UsersIcon className="size-8 opacity-60" />}
                    title="No expiries in the next 3 months"
                    description="Workers with a work permit expiry date in this window will appear here."
                    action={
                      <Button variant="outline" asChild>
                        <a href="/employees">Open employees</a>
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="grid gap-1">
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>Latest LOAs saved to the archive.</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/loas">View all</a>
                </Button>
              </CardHeader>
              <CardContent>
                {model.recentLetters.length ? (
                  <ul className="grid gap-3">
                    {model.recentLetters.map((letter) => (
                      <li key={letter.id}>
                        <a
                          href={`/loas/${letter.id}`}
                          className="group grid gap-1 rounded-xl border px-3 py-3 hover:bg-muted/50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 font-medium group-hover:underline group-hover:underline-offset-4">
                              {letter.employeeName ?? "Unnamed employee"}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              {letter.documentNumber}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {letter.companyName}
                            {letter.letterDate ? ` · ${formatDate(letter.letterDate)}` : null}
                          </p>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ShellEmpty
                    icon={<FileTextIcon className="size-8 opacity-60" />}
                    title="No letters yet"
                    description="Create an appointment letter from a company and employee."
                    action={
                      <WhenEditing>
                        <Button asChild>
                          <a href="/loas/new">Create first LOA</a>
                        </Button>
                      </WhenEditing>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {model.headcount?.length ? (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="grid gap-1">
                  <CardTitle>Headcount by client</CardTitle>
                  <CardDescription>Active secondments — one client may mix several legal employers.</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/allocations">Allocations</a>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {model.headcount.map((row) => (
                    <a
                      key={row.clientCompanyId}
                      href="/allocations"
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-3 text-sm hover:bg-muted/50"
                    >
                      <span>
                        <span className="font-medium">{row.clientName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.activeCount} active
                          {row.employerCount && row.employerCount > 1 ? ` · ${row.employerCount} employers` : ""}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatMoneyPair(row.staffSalaryTotal, row.billRateTotal, "MVR")}
                      </span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </Shell>
  );
}

function Metric({
  href,
  label,
  value,
  icon,
  hint,
}: {
  href: string;
  label: string;
  value: number;
  icon: ReactNode;
  hint: string;
}) {
  return (
    <a href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              {icon}
            </div>
          </CardTitle>
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-3xl leading-none font-medium tracking-tight tabular-nums">{value}</div>
            <Badge>Open</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </a>
  );
}
