import { useEffect, useState, type ReactNode } from "react";
import { Building2Icon, FileTextIcon, PlusIcon, UsersIcon } from "lucide-react";
import { QuickCreateMenu } from "@/components/quick-create";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "@/lib/api";

type DashboardModel = {
  counts: { companies: number; employers?: number; clients?: number; employees: number; letters: number };
  headcount?: {
    clientCompanyId: string;
    clientName: string;
    activeCount: number;
    staffSalaryTotal: string;
    billRateTotal: string;
  }[];
  recentLetters: {
    id: string;
    documentNumber: string;
    letterDate: string;
    employeeName: string | null;
    companyName: string;
  }[];
};

export function DashboardPage() {
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      eyebrow="People & documents"
      description="Agency headcount by client, with employers, employees and letters."
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
      {!model && !error ? <PageSkeleton /> : null}
      {model ? (
        <>
          <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs sm:grid-cols-3">
            <Metric
              href="/companies"
              label="Employers"
              value={model.counts.employers ?? model.counts.companies}
              icon={<Building2Icon className="size-4" />}
              hint="Employer companies on file"
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

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="grid gap-1">
                <CardTitle>Headcount by client</CardTitle>
                <CardDescription>Active secondments with staff salary vs bill rate totals.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/clients">Clients</a>
              </Button>
            </CardHeader>
            <CardContent>
              {model.headcount?.length ? (
                <div className="grid gap-2">
                  {model.headcount.map((row) => (
                    <a
                      key={row.clientCompanyId}
                      href="/allocations"
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-3 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span>
                        <span className="font-medium">{row.clientName}</span>
                        <span className="text-muted-foreground"> · {row.activeCount} active</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Staff {row.staffSalaryTotal} · Bill {row.billRateTotal}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <ShellEmpty
                  title="No client allocations yet"
                  description="Allocate workers to a client to see headcount here."
                  action={
                    <WhenEditing>
                      <Button asChild>
                        <a href="/allocations">Allocate staff</a>
                      </Button>
                    </WhenEditing>
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="grid gap-1">
                <CardTitle>Recent letters</CardTitle>
                <CardDescription>Reopen a saved LOA to review or print it. Snapshots stay frozen after save.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/loas">View all</a>
              </Button>
            </CardHeader>
            <CardContent>
              {model.recentLetters.length ? (
                <div className="grid gap-2">
                  {model.recentLetters.map((letter) => (
                    <a
                      key={letter.id}
                      href={`/loas/${letter.id}`}
                      className="group flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-3 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="font-medium group-hover:underline group-hover:underline-offset-4">
                          {letter.employeeName ?? "Unnamed employee"}
                        </span>
                        <span className="text-muted-foreground"> · {letter.companyName}</span>
                      </span>
                      <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                        {letter.documentNumber}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <ShellEmpty
                  icon={<FileTextIcon className="size-8 opacity-60" />}
                  title="No letters yet"
                  description="Add a company and employee, then create an appointment letter from their saved details."
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
