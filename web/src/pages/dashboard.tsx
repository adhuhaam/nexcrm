import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BriefcaseIcon,
  Building2Icon,
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";
import { QuickCreateMenu } from "@/components/quick-create";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { formatAmount, formatMoney, formatMoneyPair } from "@/lib/money";
import { cn } from "@/lib/utils";
import "@/styles/admin.css";
import "./dashboard-finance.css";

type FinanceBucket = {
  key: string;
  label: string;
  expenses: string;
  clientBill: string;
  staffPay: string;
  balanceOperationFund: string;
};

type ExpenseMonthBucket = {
  key: string;
  label: string;
  total: string;
  client_payment: string;
  investment: string;
  other: string;
  work_permit: string;
  insurance: string;
  medical: string;
  deposit: string;
};

type DashboardFinance = {
  currency: string;
  totals: {
    expenses: string;
    expensesThisMonth: string;
    clientBill: string;
    staffPay: string;
    balanceOperationFund: string;
    fundAfterExpenses: string;
  };
  expenseBreakdown: {
    client_payment: string;
    investment: string;
    other: string;
    work_permit: string;
    insurance: string;
    medical: string;
    deposit: string;
  };
  expensesMonthly: ExpenseMonthBucket[];
  monthly: FinanceBucket[];
  yearly: FinanceBucket[];
};

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
  finance?: DashboardFinance;
};

type ChartRange = "all" | "monthly" | "yearly";
type Lens = "all" | "people" | "finance" | "risk";
type SeriesKey = "expenses" | "bill" | "staff" | "fund";
type KpiTone = "employers" | "clients" | "employees" | "loas" | "onsite" | "expiring";

function todayLabel(now = new Date()): string {
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday}, ${formatDate(now)}`;
}

function lensForTone(tone: KpiTone): Lens {
  if (tone === "expiring") return "risk";
  return "people";
}

function n(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useAnimatedNumber(target: number, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const frame = useRef(0);
  const from = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = target - origin;
    cancelAnimationFrame(frame.current);

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(origin + delta * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else from.current = target;
    }

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs]);

  return value;
}

function sparkFromValue(value: number, seed = 1): number[] {
  const base = Math.max(1, value);
  return Array.from({ length: 7 }, (_, index) => {
    const wave = 0.55 + ((Math.sin((index + seed) * 1.15) + 1) / 2) * 0.45;
    return Math.max(1, Math.round(base * wave * (0.35 + index * 0.08)));
  });
}

export function DashboardPage() {
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>("monthly");
  const [lens, setLens] = useState<Lens>("all");
  const [activeTone, setActiveTone] = useState<KpiTone | null>(null);
  const [hotClientId, setHotClientId] = useState<string | null>(null);
  const [seriesOn, setSeriesOn] = useState<Record<SeriesKey, boolean>>({
    expenses: true,
    bill: true,
    staff: true,
    fund: true,
  });
  const [clock, setClock] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const description = useMemo(() => `Here is how the office is looking for ${todayLabel()}.`, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    getJson<DashboardModel>("/api/v1/hr/dashboard")
      .then((data) => {
        if (!cancelled) {
          setModel(data);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load dashboard");
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const finance = model?.finance;
  const currency = finance?.currency ?? "MVR";
  const onSite = model?.headcount?.reduce((sum, row) => sum + row.activeCount, 0) ?? 0;
  const expiringCount = model?.expiring?.length ?? 0;
  const headcountMax = Math.max(...(model?.headcount?.map((row) => row.activeCount) ?? [1]), 1);

  const insights = useMemo(() => {
    if (!model) return [];
    const items: { id: string; label: string; lens: Lens; tone?: "risk" | "ok" }[] = [];
    if (expiringCount > 0) {
      items.push({
        id: "expiring",
        label: `${expiringCount} WP expiring ≤ 3 mo`,
        lens: "risk",
        tone: "risk",
      });
    }
    if (onSite > 0) items.push({ id: "onsite", label: `${onSite} on site`, lens: "people" });
    if (finance) {
      const bof = n(finance.totals.balanceOperationFund);
      items.push({
        id: "bof",
        label: bof >= 0 ? `BOF ${formatMoney(bof, currency)}` : `BOF short ${formatMoney(bof, currency)}`,
        lens: "finance",
        tone: bof >= 0 ? "ok" : "risk",
      });
      if (n(finance.totals.expensesThisMonth) > 0) {
        items.push({
          id: "exp-month",
          label: `Expenses this month ${formatMoney(finance.totals.expensesThisMonth, currency)}`,
          lens: "finance",
        });
      }
    }
    if (model.counts.letters === 0) items.push({ id: "loas", label: "No LOAs yet", lens: "people" });
    return items.slice(0, 4);
  }, [model, finance, expiringCount, onSite, currency]);

  function focusLens(next: Lens, tone?: KpiTone | null) {
    setLens((current) => {
      if (tone) return next;
      return current === next ? "all" : next;
    });
    setActiveTone((current) => {
      if (!tone) return null;
      return current === tone ? null : tone;
    });
    if (next === "all") return;
    const target =
      next === "finance"
        ? document.getElementById("dash-finance")
        : next === "risk"
          ? document.getElementById("dash-risk")
          : document.getElementById("dash-people");
    target?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function toggleSeries(key: SeriesKey) {
    setSeriesOn((current) => {
      const next = { ...current, [key]: !current[key] };
      if (!next.expenses && !next.bill && !next.staff && !next.fund) return current;
      return next;
    });
  }

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
          <div className="dash-smart">
            <span className="dash-smart-live">
              <span className="dash-smart-dot" aria-hidden />
              Live
            </span>
            <span className="dash-smart-clock tabular-nums">
              {clock.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <div className="dash-smart-insights">
              {insights.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "dash-smart-chip",
                    item.tone === "risk" && "is-risk",
                    item.tone === "ok" && "is-ok",
                    lens === item.lens && "is-on",
                  )}
                  onClick={() => focusLens(item.lens)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="dash-smart-actions">
              {(
                [
                  ["all", "All"],
                  ["people", "People"],
                  ["finance", "Finance"],
                  ["risk", "Risk"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={lens === key ? "default" : "outline"}
                  onClick={() => focusLens(key)}
                >
                  {label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={refreshing}
                onClick={() => setReloadKey((value) => value + 1)}
              >
                <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="nx-kpi-grid">
            <Metric
              href="/companies"
              tone="employers"
              active={activeTone === "employers"}
              icon={<Building2Icon className="size-3.5" />}
              label="Employers"
              value={model.counts.employers ?? model.counts.companies}
              meta="Legal employers"
              spark={sparkFromValue(model.counts.employers ?? model.counts.companies, 1)}
              onFocus={() => focusLens(lensForTone("employers"), "employers")}
            />
            <Metric
              href="/clients"
              tone="clients"
              active={activeTone === "clients"}
              icon={<BriefcaseIcon className="size-3.5" />}
              label="Clients"
              value={model.counts.clients ?? 0}
              meta="Client companies"
              spark={sparkFromValue(model.counts.clients ?? 0, 2)}
              onFocus={() => focusLens(lensForTone("clients"), "clients")}
            />
            <Metric
              href="/employees"
              tone="employees"
              active={activeTone === "employees"}
              icon={<UsersIcon className="size-3.5" />}
              label="Employees"
              value={model.counts.employees}
              meta="Workforce records"
              spark={sparkFromValue(model.counts.employees, 3)}
              onFocus={() => focusLens(lensForTone("employees"), "employees")}
            />
            <Metric
              href="/loas"
              tone="loas"
              active={activeTone === "loas"}
              icon={<FileTextIcon className="size-3.5" />}
              label="LOAs"
              value={model.counts.letters}
              meta="Archived letters"
              spark={sparkFromValue(model.counts.letters, 4)}
              onFocus={() => focusLens(lensForTone("loas"), "loas")}
            />
            <Metric
              href="/allocations"
              tone="onsite"
              active={activeTone === "onsite"}
              icon={<UsersIcon className="size-3.5" />}
              label="On site"
              value={onSite}
              meta="Active placements"
              spark={sparkFromValue(onSite, 5)}
              onFocus={() => focusLens(lensForTone("onsite"), "onsite")}
            />
            <Metric
              href="/employees"
              tone="expiring"
              active={activeTone === "expiring"}
              icon={<TriangleAlertIcon className="size-3.5" />}
              label="Expiring"
              value={expiringCount}
              meta="WP ≤ 3 months"
              spark={sparkFromValue(Math.max(expiringCount, 1), 6)}
              onFocus={() => focusLens(lensForTone("expiring"), "expiring")}
            />
          </div>

          {model.headcount?.length || finance ? (
            <div
              id="dash-people"
              className={cn(
                "dash-overview dash-section",
                lens !== "all" && lens !== "people" && "is-dim",
                lens === "people" && "is-focus",
              )}
            >
              {model.headcount?.length ? (
                <div className="dash-overview-card">
                  <div className="dash-overview-head">
                    <div className="min-w-0">
                      <h3>Headcount mix</h3>
                      <p>Tap to highlight · Allocations for full board</p>
                    </div>
                    <a className="dash-overview-link" href="/allocations">
                      Open
                    </a>
                  </div>
                  <div className="dash-hc-bars">
                    {[...model.headcount]
                      .sort((a, b) => b.activeCount - a.activeCount)
                      .slice(0, 5)
                      .map((row) => {
                        const share = headcountMax > 0 ? Math.round((row.activeCount / onSite) * 100) : 0;
                        return (
                          <button
                            key={row.clientCompanyId}
                            type="button"
                            className={cn("dash-hc-row", hotClientId === row.clientCompanyId && "is-hot")}
                            title={`${row.clientName} · ${row.activeCount} on site`}
                            onClick={() => {
                              setHotClientId((current) =>
                                current === row.clientCompanyId ? null : row.clientCompanyId,
                              );
                              focusLens("people", "onsite");
                            }}
                            onDoubleClick={() => window.location.assign("/allocations")}
                          >
                            <span className="dash-hc-name">{row.clientName}</span>
                            <div className="dash-hc-track" aria-hidden>
                              <i style={{ width: `${Math.max(6, (row.activeCount / headcountMax) * 100)}%` }} />
                            </div>
                            <span className="dash-hc-meta">
                              <strong>{row.activeCount}</strong>
                              <em>{share}%</em>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : null}
              {finance ? (
                <div className="dash-overview-card">
                  <div className="dash-overview-head">
                    <div className="min-w-0">
                      <h3>Finance snapshot</h3>
                      <p>All-time bill / staff / expenses / BOF</p>
                    </div>
                    <a className="dash-overview-link" href="/payroll">
                      Open
                    </a>
                  </div>
                  <AllTimeCompare
                    finance={finance}
                    currency={currency}
                    compact
                    seriesOn={seriesOn}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {finance ? (
            <section
              id="dash-finance"
              className={cn(
                "dash-finance dash-section",
                lens !== "all" && lens !== "finance" && "is-dim",
                lens === "finance" && "is-focus",
              )}
            >
              <div className="dash-finance-kpis">
                <FinanceKpi
                  href="/apps/expenses"
                  tone="expenses"
                  label="Expenses"
                  value={finance.totals.expenses}
                  currency={currency}
                  meta={`This month ${formatMoney(finance.totals.expensesThisMonth, currency)}`}
                />
                <FinanceKpi
                  href="/payroll"
                  tone="bill"
                  label="Client bill"
                  value={finance.totals.clientBill}
                  currency={currency}
                  meta="Payroll billings"
                />
                <FinanceKpi
                  href="/payroll"
                  tone="staff"
                  label="Staff pay"
                  value={finance.totals.staffPay}
                  currency={currency}
                  meta="Payroll staff net"
                />
                <FinanceKpi
                  href="/payroll"
                  tone="fund"
                  label="Balance operation fund"
                  value={finance.totals.balanceOperationFund}
                  currency={currency}
                  meta="Client bill − staff pay"
                  negative={n(finance.totals.balanceOperationFund) < 0}
                />
                <FinanceKpi
                  href="/apps/expenses"
                  tone="after"
                  label="Fund after expenses"
                  value={finance.totals.fundAfterExpenses}
                  currency={currency}
                  meta="BOF − expenses"
                  negative={n(finance.totals.fundAfterExpenses) < 0}
                />
              </div>

              <div className="dash-finance-panel">
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                    <div className="grid gap-1">
                      <CardTitle>Expenses vs balance operation fund</CardTitle>
                      <CardDescription>
                        Compare expenses, payroll billings, staff pay, and balance operation fund across time.
                      </CardDescription>
                    </div>
                    <div className="grid gap-2 justify-items-end">
                      <div className="dash-range">
                        {(
                          [
                            ["all", "All time"],
                            ["monthly", "Monthly"],
                            ["yearly", "Yearly"],
                          ] as const
                        ).map(([key, label]) => (
                          <Button
                            key={key}
                            type="button"
                            size="sm"
                            variant={chartRange === key ? "default" : "outline"}
                            onClick={() => setChartRange(key)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      <div className="dash-series">
                        {(
                          [
                            ["expenses", "Expenses"],
                            ["bill", "Bill"],
                            ["staff", "Staff"],
                            ["fund", "BOF"],
                          ] as const
                        ).map(([key, label]) => (
                          <Button
                            key={key}
                            type="button"
                            size="sm"
                            variant={seriesOn[key] ? "default" : "outline"}
                            className={cn(!seriesOn[key] && "is-off")}
                            onClick={() => toggleSeries(key)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-5 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      {chartRange === "all" ? (
                        <AllTimeCompare finance={finance} currency={currency} seriesOn={seriesOn} />
                      ) : (
                        <GroupedBars
                          rows={
                            chartRange === "monthly"
                              ? finance.monthly.slice(-18)
                              : finance.yearly
                          }
                          currency={currency}
                          seriesOn={seriesOn}
                          emptyLabel={
                            chartRange === "monthly"
                              ? "No monthly payroll or expense data yet."
                              : "No yearly payroll or expense data yet."
                          }
                        />
                      )}
                    </div>
                    <div className="lg:col-span-2 grid gap-4">
                      <p className="dash-compare-note">
                        Balance operation fund is client bill minus staff pay from pay runs. Fund after expenses
                        subtracts organization outflows from the expenses app.
                      </p>
                      <div>
                        <p className="text-sm font-semibold">Expense mix (all time)</p>
                        <ExpenseMixBars
                          currency={currency}
                          client={n(finance.expenseBreakdown.client_payment)}
                          investment={n(finance.expenseBreakdown.investment)}
                          other={n(finance.expenseBreakdown.other)}
                          workPermit={n(finance.expenseBreakdown.work_permit)}
                          insurance={n(finance.expenseBreakdown.insurance)}
                          medical={n(finance.expenseBreakdown.medical)}
                          deposit={n(finance.expenseBreakdown.deposit)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a href="/apps/expenses">Open finance</a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href="/payroll">Open payroll</a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="dash-finance-panel">
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                    <div className="grid gap-1">
                      <CardTitle>Expenses per month</CardTitle>
                      <CardDescription>
                        Monthly outflows from the expenses app, with category split.
                        {finance.totals.expensesThisMonth
                          ? ` This month: ${formatMoney(finance.totals.expensesThisMonth, currency)}.`
                          : null}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/apps/expenses">Add expense</a>
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <ExpenseMonthBars rows={finance.expensesMonthly.slice(-18)} currency={currency} />
                    <ExpensesMonthTable rows={[...finance.expensesMonthly].reverse()} currency={currency} />
                  </CardContent>
                </Card>
              </div>
            </section>
          ) : null}

          <div
            id="dash-risk"
            className={cn(
              "grid gap-4 lg:grid-cols-5 dash-section",
              lens !== "all" && lens !== "risk" && lens !== "people" && "is-dim",
              lens === "risk" && "is-focus",
            )}
          >
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

function FinanceKpi({
  href,
  tone,
  label,
  value,
  currency,
  meta,
  negative,
}: {
  href: string;
  tone: "expenses" | "bill" | "staff" | "fund" | "after";
  label: string;
  value: string;
  currency: string;
  meta: string;
  negative?: boolean;
}) {
  const animated = useAnimatedNumber(n(value));
  const chip =
    tone === "expenses" ? "Outflow" : tone === "bill" ? "Bill" : tone === "staff" ? "Staff" : tone === "fund" ? "BOF" : "Net";
  return (
    <a href={href} className={cn("dash-finance-kpi", `is-${tone}`, negative && "is-negative")}>
      <div className="dash-finance-kpi-top">
        <p className="dash-finance-kpi-label">{label}</p>
        <span className="dash-finance-kpi-chip">{chip}</span>
      </div>
      <p className="dash-finance-kpi-value">{formatMoney(animated, currency)}</p>
      <p className="dash-finance-kpi-meta">{meta}</p>
    </a>
  );
}

function AllTimeCompare({
  finance,
  currency,
  compact = false,
  seriesOn = { expenses: true, bill: true, staff: true, fund: true },
}: {
  finance: DashboardFinance;
  currency: string;
  compact?: boolean;
  seriesOn?: Record<SeriesKey, boolean>;
}) {
  const rows = [
    { key: "expenses" as const, label: "Expenses", value: n(finance.totals.expenses), tone: "expenses" as const },
    { key: "bill" as const, label: "Client bill", value: n(finance.totals.clientBill), tone: "bill" as const },
    { key: "staff" as const, label: "Staff pay", value: n(finance.totals.staffPay), tone: "staff" as const },
    {
      key: "fund" as const,
      label: compact ? "BOF" : "Balance operation fund",
      value: n(finance.totals.balanceOperationFund),
      tone: "fund" as const,
    },
  ].filter((row) => seriesOn[row.key]);
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <div className="dash-alltime">
      {rows.map((row) => (
        <div key={row.key} className="dash-alltime-row">
          <div className="dash-alltime-head">
            <span>{row.label}</span>
            <strong>{formatMoney(row.value, currency)}</strong>
          </div>
          <div className="dash-alltime-track">
            <span
              className={cn(`is-${row.tone}`, row.value < 0 && "is-negative")}
              style={{ width: `${Math.max(4, (Math.abs(row.value) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      {!compact ? (
        <p className="dash-compare-note">
          Fund after expenses:{" "}
          <strong className="text-foreground">{formatMoney(finance.totals.fundAfterExpenses, currency)}</strong>
        </p>
      ) : (
        <p className="dash-compare-note">
          After expenses <strong className="text-foreground">{formatMoney(finance.totals.fundAfterExpenses, currency)}</strong>
        </p>
      )}
    </div>
  );
}

function GroupedBars({
  rows,
  currency,
  emptyLabel,
  seriesOn,
}: {
  rows: FinanceBucket[];
  currency: string;
  emptyLabel: string;
  seriesOn: Record<SeriesKey, boolean>;
}) {
  const [hotKey, setHotKey] = useState<string | null>(null);

  if (!rows.length) {
    return <p className="dash-compare-note">{emptyLabel}</p>;
  }

  const series = (
    [
      { key: "expenses" as const, label: "Expenses", color: "var(--df-expenses)", pick: (row: FinanceBucket) => n(row.expenses) },
      { key: "bill" as const, label: "Client bill", color: "var(--df-bill)", pick: (row: FinanceBucket) => n(row.clientBill) },
      { key: "staff" as const, label: "Staff pay", color: "var(--df-staff)", pick: (row: FinanceBucket) => n(row.staffPay) },
      {
        key: "fund" as const,
        label: "Balance operation fund",
        color: "var(--df-fund)",
        pick: (row: FinanceBucket) => n(row.balanceOperationFund),
      },
    ] as const
  ).filter((item) => seriesOn[item.key]);

  const values = rows.flatMap((row) => series.map((item) => item.pick(row)));
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  const barWidth = 11;
  const clusterWidth = series.length * barWidth + 10;
  const width = Math.max(560, rows.length * (clusterWidth + 30) + 64);
  const height = 280;
  const padL = 52;
  const padR = 12;
  const padT = 18;
  const padB = 40;
  const chartH = height - padT - padB;
  const chartW = width - padL - padR;
  const hotRow = hotKey ? rows.find((row) => row.key === hotKey) : null;

  return (
    <div className="dash-chart">
      <div className="dash-chart-legend">
        {series.map((item) => (
          <span key={item.key}>
            <i className={cn("dash-chart-swatch", `is-${item.key}`)} />
            {item.label}
          </span>
        ))}
      </div>
      {hotRow ? (
        <div className="dash-chart-tip" aria-live="polite">
          <strong>{hotRow.label}</strong>
          {series.map((item) => (
            <div key={item.key} className="dash-chart-tip-row">
              <span>{item.label}</span>
              <b>{formatMoney(item.pick(hotRow), currency)}</b>
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-compare-note">Hover a period to inspect expenses, bill, staff, and BOF.</p>
      )}
      <div className="dash-chart-frame">
        <svg
          className="dash-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Comparison chart in ${currency}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = padT + chartH * (1 - fraction);
            const label = formatAmount(max * fraction);
            return (
              <g key={fraction}>
                <line className="dash-chart-grid" x1={padL} x2={width - padR} y1={y} y2={y} />
                <text className="dash-chart-axis" x={padL - 8} y={y + 3} textAnchor="end">
                  {label}
                </text>
              </g>
            );
          })}
          {rows.map((row, index) => {
            const clusterX = padL + (index + 0.5) * (chartW / rows.length) - clusterWidth / 2;
            return (
              <g
                key={row.key}
                onMouseEnter={() => setHotKey(row.key)}
                onMouseLeave={() => setHotKey(null)}
                style={{ cursor: "pointer" }}
              >
                {series.map((item, seriesIndex) => {
                  const value = item.pick(row);
                  const barH = (Math.abs(value) / max) * (chartH * 0.92);
                  const x = clusterX + seriesIndex * (barWidth + 2);
                  const y = padT + chartH - barH;
                  return (
                    <rect
                      key={item.key}
                      className={cn("dash-chart-bar", hotKey === row.key && "is-hot")}
                      style={{ animationDelay: `${index * 45 + seriesIndex * 20}ms` }}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(2, barH)}
                      rx={2.5}
                      fill={value < 0 && item.key === "fund" ? "var(--df-fund-neg)" : item.color}
                    >
                      <title>
                        {row.label} · {item.label}: {formatMoney(value, currency)}
                      </title>
                    </rect>
                  );
                })}
                <text
                  className="dash-chart-axis"
                  x={clusterX + clusterWidth / 2}
                  y={height - 14}
                  textAnchor="middle"
                >
                  {row.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ExpenseMixBars({
  currency,
  client,
  investment,
  other,
  workPermit,
  insurance,
  medical,
  deposit,
}: {
  currency: string;
  client: number;
  investment: number;
  other: number;
  workPermit: number;
  insurance: number;
  medical: number;
  deposit: number;
}) {
  const rows = [
    { key: "wp", label: "Work permit", value: workPermit, tone: "bill" as const },
    { key: "insurance", label: "Insurance", value: insurance, tone: "staff" as const },
    { key: "medical", label: "Medical", value: medical, tone: "expenses" as const },
    { key: "deposit", label: "Deposits", value: deposit, tone: "bill" as const },
    { key: "client", label: "Client payments", value: client, tone: "bill" as const },
    { key: "investment", label: "Investments", value: investment, tone: "staff" as const },
    { key: "other", label: "Other", value: other, tone: "expenses" as const },
  ];
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="dash-expense-mix">
      {rows.map((row) => (
        <div key={row.key} className="dash-alltime-row">
          <div className="dash-expense-mix-row">
            <span>{row.label}</span>
            <span>{formatMoney(row.value, currency)}</span>
          </div>
          <div className="dash-alltime-track">
            <span className={`is-${row.tone}`} style={{ width: `${Math.max(row.value > 0 ? 4 : 0, (row.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpenseMonthBars({ rows, currency }: { rows: ExpenseMonthBucket[]; currency: string }) {
  if (!rows.length) {
    return <p className="dash-compare-note">No expense months yet — record outflows in Expenses.</p>;
  }
  const max = Math.max(...rows.map((row) => n(row.total)), 1);
  return (
    <div className="dash-expense-months" aria-label="Expenses per month">
      {rows.map((row) => (
        <div key={row.key} className="dash-expense-month">
          <div className="dash-expense-month-bar-wrap">
            <span
              className="dash-expense-month-bar"
              style={{ height: `${Math.max(n(row.total) > 0 ? 8 : 2, (n(row.total) / max) * 100)}%` }}
              title={`${row.label}: ${formatMoney(row.total, currency)}`}
            />
          </div>
          <span className="dash-expense-month-label">{row.label}</span>
          <span className="dash-expense-month-value">{formatMoney(row.total, currency)}</span>
        </div>
      ))}
    </div>
  );
}

function ExpensesMonthTable({ rows, currency }: { rows: ExpenseMonthBucket[]; currency: string }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">WP</TableHead>
            <TableHead className="text-right">Insurance</TableHead>
            <TableHead className="text-right">Medical</TableHead>
            <TableHead className="text-right">Deposit</TableHead>
            <TableHead className="text-right">Client</TableHead>
            <TableHead className="text-right">Invest</TableHead>
            <TableHead className="text-right">Other</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key} className={n(row.total) <= 0 ? "opacity-60" : undefined}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {formatMoney(row.total, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.work_permit, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.insurance, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.medical, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.deposit, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.client_payment, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.investment, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.other, currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="nx-kpi-spark" aria-hidden>
      {values.map((value, index) => (
        <span key={`${index}-${value}`} style={{ height: `${Math.max(18, (value / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function Metric({
  href,
  tone,
  active,
  icon,
  label,
  value,
  meta,
  spark,
  onFocus,
}: {
  href: string;
  tone: KpiTone;
  active?: boolean;
  icon: ReactNode;
  label: string;
  value: number;
  meta: string;
  spark: number[];
  onFocus: () => void;
}) {
  const animated = useAnimatedNumber(value);
  return (
    <button
      type="button"
      className={cn("nx-kpi group", `is-${tone}`, active && "is-active")}
      onClick={onFocus}
    >
      <div className="nx-kpi-top">
        <p className="nx-kpi-label">{label}</p>
        <span className="nx-kpi-icon">{icon}</span>
      </div>
      <p className="nx-kpi-value">{Math.round(animated).toLocaleString()}</p>
      <p className="nx-kpi-meta">{meta}</p>
      <a
        href={href}
        className="nx-kpi-goto"
        onClick={(event) => event.stopPropagation()}
      >
        Open
      </a>
      <Spark values={spark} />
    </button>
  );
}
