import { useEffect, useState } from "react";
import {
  ActivityIcon,
  DatabaseIcon,
  FolderOpenIcon,
  HardDriveIcon,
  HeartPulseIcon,
  RefreshCwIcon,
  ServerIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Banner, Loading, useOffice } from "@/components/shell";
import { getJson } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";

type HealthStatus = "ok" | "degraded" | "down";

type SystemHealth = {
  checkedAt: string;
  overall: HealthStatus;
  app: {
    name: string;
    node: string;
    pid: number;
    uptimeSec: number;
    env: string;
    displayTimeZone: string;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
  };
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    uptimeSec: number;
    cpuCount: number;
    loadAverage: [number, number, number];
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    };
  };
  disk: {
    path: string;
    totalBytes: number | null;
    usedBytes: number | null;
    availableBytes: number | null;
    usedPercent: number | null;
    status: HealthStatus;
    error: string | null;
  };
  database: {
    status: HealthStatus;
    latencyMs: number | null;
    version: string | null;
    pool: { total: number; idle: number; waiting: number };
    error: string | null;
  };
  files: {
    status: HealthStatus;
    root: string | null;
    error: string | null;
  };
  checks: { name: string; status: HealthStatus; detail: string }[];
};

const POLL_MS = 2500;

function statusVariant(status: HealthStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ok") return "default";
  if (status === "degraded") return "secondary";
  return "destructive";
}

function statusLabel(status: HealthStatus): string {
  if (status === "ok") return "Healthy";
  if (status === "degraded") return "Degraded";
  return "Down";
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function Meter({ value }: { value: number | null }) {
  const width = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${width}%` }} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function HealthPanel() {
  const office = useOffice();
  const [model, setModel] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [fetching, setFetching] = useState(false);

  async function reload(silent = false) {
    if (!silent) setFetching(true);
    try {
      const data = await getJson<SystemHealth>("/api/v1/admin/health");
      setModel(data);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load health");
    } finally {
      if (!silent) setFetching(false);
    }
  }

  useEffect(() => {
    if (office.role?.slug !== "system_admin") return;
    void reload();
  }, [office.role?.slug]);

  useEffect(() => {
    if (office.role?.slug !== "system_admin" || !live) return;
    const timer = window.setInterval(() => {
      void reload(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [office.role?.slug, live]);

  if (office.role?.slug !== "system_admin") {
    return <Banner message="Only a system admin can view server health." error />;
  }
  if (!model && !error) return <Loading />;

  return (
    <>
      <Banner message={error} error />
      {model ? (
        <div className="grid gap-4">
          <Card className="overflow-hidden border-border shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 bg-primary/[0.04]">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <HeartPulseIcon className="size-5" />
                </span>
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                    Overall
                    <Badge variant={statusVariant(model.overall)}>{statusLabel(model.overall)}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Checked {formatDateTime(model.checkedAt)} · auto-refresh {live ? "on" : "paused"}
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setLive((value) => !value)}>
                  {live ? "Pause" : "Resume"} live
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={fetching} onClick={() => void reload()}>
                  <RefreshCwIcon className={fetching ? "opacity-50" : undefined} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {model.checks.map((check) => (
                <div key={check.name} className="rounded-2xl border border-border bg-card p-3.5 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{check.name}</span>
                    <Badge variant={statusVariant(check.status)}>{statusLabel(check.status)}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ServerIcon className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Host</CardTitle>
                    <CardDescription>
                      {model.host.hostname} · {model.host.platform} {model.host.release} · {model.host.arch}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Stat label="Uptime" value={formatDuration(model.host.uptimeSec)} />
                  <Stat
                    label="Load average"
                    value={model.host.loadAverage.map((n) => n.toFixed(2)).join(" / ")}
                    hint={`${model.host.cpuCount} CPU cores`}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-medium tabular-nums">
                      {formatBytes(model.host.memory.usedBytes)} / {formatBytes(model.host.memory.totalBytes)} (
                      {model.host.memory.usedPercent}%)
                    </span>
                  </div>
                  <Meter value={model.host.memory.usedPercent} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <HardDriveIcon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      Disk
                      <Badge variant={statusVariant(model.disk.status)}>{statusLabel(model.disk.status)}</Badge>
                    </CardTitle>
                    <CardDescription className="break-all">{model.disk.path}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Stat label="Used" value={formatBytes(model.disk.usedBytes)} />
                  <Stat label="Available" value={formatBytes(model.disk.availableBytes)} />
                  <Stat label="Total" value={formatBytes(model.disk.totalBytes)} />
                </div>
                <Meter value={model.disk.usedPercent} />
                {model.disk.error ? <p className="text-xs text-destructive">{model.disk.error}</p> : null}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <DatabaseIcon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      Database
                      <Badge variant={statusVariant(model.database.status)}>
                        {statusLabel(model.database.status)}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{model.database.version ?? "Postgres"}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                <Stat
                  label="Latency"
                  value={model.database.latencyMs != null ? `${model.database.latencyMs} ms` : "—"}
                />
                <Stat
                  label="Pool"
                  value={`${model.database.pool.total} total`}
                  hint={`${model.database.pool.idle} idle · ${model.database.pool.waiting} waiting`}
                />
                {model.database.error ? (
                  <p className="sm:col-span-2 text-xs text-destructive">{model.database.error}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FolderOpenIcon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      File storage
                      <Badge variant={statusVariant(model.files.status)}>{statusLabel(model.files.status)}</Badge>
                    </CardTitle>
                    <CardDescription className="break-all">{model.files.root ?? "FILE_ROOT"}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Stat
                  label="Status"
                  value={statusLabel(model.files.status)}
                  hint={model.files.error ?? "Writable file vault"}
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm xl:col-span-2">
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ActivityIcon className="size-5" />
                  </span>
                  <div>
                    <CardTitle>App process</CardTitle>
                    <CardDescription>
                      {model.app.name} · Node {model.app.node} · pid {model.app.pid}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Process uptime" value={formatDuration(model.app.uptimeSec)} />
                <Stat label="Environment" value={model.app.env} hint={model.app.displayTimeZone} />
                <Stat label="RSS" value={formatBytes(model.app.memory.rssBytes)} />
                <Stat
                  label="Heap"
                  value={formatBytes(model.app.memory.heapUsedBytes)}
                  hint={`of ${formatBytes(model.app.memory.heapTotalBytes)}`}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
