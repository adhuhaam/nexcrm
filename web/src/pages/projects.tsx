import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  Building2Icon,
  ChevronRightIcon,
  FileTextIcon,
  LayersIcon,
  MapPinIcon,
  PlusIcon,
  SquareStackIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaField, SelectField, TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Loading, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson, postJson } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  companyName: string;
  siteCount: number;
  poolCount: number;
  slotCount: number;
  openSlotCount: number;
  employeeCount: number;
};
type Company = { id: string; legalName: string };
type Site = { id: string; name: string; siteType: string | null; address: string | null; state: string };
type Pool = {
  id: string;
  siteId: string;
  name: string;
  poolNumber: string | null;
  siteName: string;
  capacity: number;
  used: number;
  open: number;
};
type Slot = {
  id: string;
  slotNumber: number | null;
  status: string;
  occupation: string | null;
  employeeId: string | null;
  employeeName: string | null;
  poolId: string;
  poolName: string;
  siteId: string;
  siteName: string;
};

type ProjectTab = "sites" | "pools" | "slots" | "employees";

function projectTabFromUrl(): ProjectTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "pools" || tab === "slots" || tab === "employees") return tab;
  return "sites";
}

function focusFromUrl(key: "site" | "pool"): string {
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function writeProjectUrl(tab: ProjectTab, siteId: string, poolId: string) {
  const url = new URL(window.location.href);
  if (tab === "sites") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  if (siteId) url.searchParams.set("site", siteId);
  else url.searchParams.delete("site");
  if (poolId) url.searchParams.set("pool", poolId);
  else url.searchParams.delete("pool");
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}
type ProjectView = {
  project: Project;
  sites: Site[];
  pools: Pool[];
  slots: Slot[];
  documents: { id: string; title: string; notes: string | null }[];
  employees: { id: string; legalName: string }[];
};

const notices: Record<string, string> = {
  project: "Project created.",
  site: "Site added.",
  pool: "Quota pool added.",
  slot: "Quota slot occupied. This work permit holder is now working on the project.",
  document: "Project document saved.",
};

const errors: Record<string, string> = {
  "pool-full": "This quota pool has no open slot.",
  "duplicate-slot": "This employee already has a slot on this project.",
  "wrong-company": "That employee belongs to another company.",
  missing: "A required field is missing.",
};

function queryMessage(): { message: string | null; error: boolean } {
  const params = new URLSearchParams(window.location.search);
  const notice = params.get("notice");
  const error = params.get("error");
  if (error) return { message: errors[error] ?? "Request failed", error: true };
  if (notice) return { message: notices[notice] ?? null, error: false };
  return { message: null, error: false };
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPinIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[11px] leading-none">{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const banner = queryMessage();

  function reload() {
    return getJson<{ projects: Project[]; companies: Company[] }>("/api/v1/projects").then((data) => {
      setProjects(data.projects);
      setCompanies(data.companies);
      if (!companyId) setCompanyId(data.companies[0]?.id ?? "");
    });
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this page");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!projects) return null;
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [project.name, project.companyName].join(" ").toLowerCase().includes(needle),
    );
  }, [projects, debouncedQ]);

  async function createProject() {
    setPending(true);
    setError(null);
    try {
      await postJson("/projects", { companyId, name });
      setCreateOpen(false);
      setName("");
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="JACMS · Projects"
      eyebrow="Operations"
      description="Legal employer → project → site → pool → slot → employee. Open a project to manage placement."
      actions={
        <WhenEditing>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New project
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={banner.message} error={banner.error} />
      <Banner message={error} error />
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField value={q} onChange={setQ} placeholder="Search projects…" label="Search projects" />
          {filteredProjects ? (
            <p className="shrink-0 text-sm text-muted-foreground">
              {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        {!filteredProjects && !error ? <PageSkeleton cards={6} /> : null}

        {filteredProjects?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <a
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full hover:bg-muted/40">
                  <CardHeader className="gap-2 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{project.name}</CardTitle>
                      <BriefcaseIcon className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <CardDescription className="flex items-center gap-1.5">
                      <Building2Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{project.companyName}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <StatChip icon={MapPinIcon} label="Sites" value={project.siteCount ?? 0} />
                      <StatChip icon={LayersIcon} label="Pools" value={project.poolCount ?? 0} />
                      <StatChip icon={SquareStackIcon} label="Slots" value={project.slotCount ?? 0} />
                      <StatChip icon={UsersIcon} label="Employees" value={project.employeeCount ?? 0} />
                    </div>
                    <div>
                      {(project.openSlotCount ?? 0) > 0 ? (
                        <Badge variant="outline">{project.openSlotCount} open</Badge>
                      ) : project.slotCount > 0 ? (
                        <Badge variant="secondary">All slots filled</Badge>
                      ) : (
                        <Badge variant="outline">No slots yet</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        ) : null}

        {filteredProjects && !filteredProjects.length ? (
          <ShellEmpty
            icon={<BriefcaseIcon className="size-8 opacity-60" />}
            title={q.trim() ? "No matches" : "No projects yet"}
            description={
              q.trim()
                ? "Try another project or employer name."
                : "Create a project under a legal employer, then add sites, pools, and slots."
            }
            action={
              q.trim() ? (
                <Button type="button" variant="outline" onClick={() => setQ("")}>
                  Clear search
                </Button>
              ) : (
                <WhenEditing>
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    <PlusIcon />
                    New project
                  </Button>
                </WhenEditing>
              )
            }
          />
        ) : null}
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New project"
        description="Projects belong to a legal employer. Sites, pools, and slots are added on the project page."
        pending={pending}
        submitLabel="Create project"
        onSubmit={() => void createProject()}
        size="md"
      >
        <SelectField id="companyId" label="Legal employer" value={companyId} onChange={setCompanyId}>
          <option value="">Select legal employer</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.legalName}
            </option>
          ))}
        </SelectField>
        <TextField id="name" label="Project name" value={name} onChange={setName} />
      </FormDialog>
    </Shell>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<ProjectTab>(() => projectTabFromUrl());
  const [focusSiteId, setFocusSiteId] = useState(() => focusFromUrl("site"));
  const [focusPoolId, setFocusPoolId] = useState(() => focusFromUrl("pool"));
  const [siteOpen, setSiteOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteType, setSiteType] = useState("");
  const [address, setAddress] = useState("");
  const [poolSiteId, setPoolSiteId] = useState("");
  const [poolNumber, setPoolNumber] = useState("");
  const [poolName, setPoolName] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [slotId, setSlotId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const banner = queryMessage();

  function reload() {
    return getJson<ProjectView>(`/api/v1/projects/${id}`).then((data) => {
      setView(data);
      return data;
    });
  }

  useEffect(() => {
    let cancelled = false;
    reload().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this page");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    writeProjectUrl(tab, focusSiteId, focusPoolId);
  }, [tab, focusSiteId, focusPoolId]);

  const occupiedCount = view?.slots.filter((slot) => slot.status === "occupied").length ?? 0;
  const openCount = view?.slots.filter((slot) => slot.status === "open").length ?? 0;
  const placedEmployees = useMemo(
    () => (view?.slots ?? []).filter((slot) => slot.status === "occupied" && slot.employeeName),
    [view],
  );

  const siteStats = useMemo(() => {
    const map = new Map<string, { pools: number; slots: number; open: number; occupied: number }>();
    for (const site of view?.sites ?? []) map.set(site.id, { pools: 0, slots: 0, open: 0, occupied: 0 });
    for (const pool of view?.pools ?? []) {
      const row = map.get(pool.siteId);
      if (row) row.pools += 1;
    }
    for (const slot of view?.slots ?? []) {
      const row = map.get(slot.siteId);
      if (!row) continue;
      row.slots += 1;
      if (slot.status === "open") row.open += 1;
      if (slot.status === "occupied") row.occupied += 1;
    }
    return map;
  }, [view]);

  const filteredPools = useMemo(() => {
    const pools = view?.pools ?? [];
    if (!focusSiteId) return pools;
    return pools.filter((pool) => pool.siteId === focusSiteId);
  }, [view, focusSiteId]);

  const filteredSlots = useMemo(() => {
    let slots = view?.slots ?? [];
    if (focusPoolId) slots = slots.filter((slot) => slot.poolId === focusPoolId);
    else if (focusSiteId) slots = slots.filter((slot) => slot.siteId === focusSiteId);
    return slots;
  }, [view, focusSiteId, focusPoolId]);

  const filteredEmployees = useMemo(() => {
    let rows = placedEmployees;
    if (focusPoolId) rows = rows.filter((slot) => slot.poolId === focusPoolId);
    else if (focusSiteId) rows = rows.filter((slot) => slot.siteId === focusSiteId);
    return rows;
  }, [placedEmployees, focusSiteId, focusPoolId]);

  const focusSite = view?.sites.find((site) => site.id === focusSiteId) ?? null;
  const focusPool = view?.pools.find((pool) => pool.id === focusPoolId) ?? null;

  function go(nextTab: ProjectTab, siteId = focusSiteId, poolId = focusPoolId) {
    setFocusSiteId(siteId);
    setFocusPoolId(poolId);
    setTab(nextTab);
  }

  function clearFocus() {
    setFocusSiteId("");
    setFocusPoolId("");
  }

  async function send(action: string, body: Record<string, string>) {
    setPending(true);
    setError(null);
    try {
      await postJson(action, body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
      setPending(false);
    }
  }

  function openAddSite() {
    setSiteName("");
    setSiteType("");
    setAddress("");
    setSiteOpen(true);
  }

  function openAddPool(siteId?: string) {
    setPoolSiteId(siteId || focusSiteId || view?.sites[0]?.id || "");
    setPoolNumber("");
    setPoolName("");
    setCapacity("1");
    setPoolOpen(true);
  }

  function openOccupySlot(nextSlotId: string) {
    setSlotId(nextSlotId);
    setEmployeeId("");
    setEmployeeName("");
    setSlotOpen(true);
  }

  function openAddDoc() {
    setTitle("");
    setNotes("");
    setDocOpen(true);
  }

  function onTabChange(value: string) {
    const next: ProjectTab =
      value === "pools" || value === "slots" || value === "employees" ? value : "sites";
    setTab(next);
  }

  const poolSiteName = view?.sites.find((site) => site.id === poolSiteId)?.name ?? "";
  const activeSlot = view?.slots.find((slot) => slot.id === slotId);

  return (
    <Shell
      title={view ? `JACMS · ${view.project.name}` : "JACMS · Project"}
      eyebrow="Project"
      description="Site → pool → slot → employee. Use the tabs; filters stay linked across them."
      actions={
        <>
          <Button variant="outline" asChild>
            <a href="/projects">
              <ArrowLeftIcon />
              All projects
            </a>
          </Button>
          <WhenEditing>
            {tab === "sites" ? (
              <Button type="button" onClick={openAddSite}>
                <PlusIcon />
                Add site
              </Button>
            ) : null}
            {tab === "pools" ? (
              <Button type="button" onClick={() => openAddPool()} disabled={!view?.sites.length}>
                <PlusIcon />
                Add pool
              </Button>
            ) : null}
          </WhenEditing>
        </>
      }
    >
      <Banner message={banner.message} error={banner.error} />
      <Banner message={error} error />
      {!view && !error ? <Loading /> : null}

      {view ? (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{view.project.name}</CardTitle>
                  <Badge variant="secondary">Project</Badge>
                </div>
                <CardDescription className="flex items-center gap-1.5">
                  <Building2Icon className="size-3.5 shrink-0" />
                  {view.project.companyName}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                  <MapPinIcon className="size-3.5" />
                  {view.sites.length} sites
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                  <LayersIcon className="size-3.5" />
                  {view.pools.length} pools
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                  <SquareStackIcon className="size-3.5" />
                  {occupiedCount}/{view.slots.length} slots
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                  <UsersIcon className="size-3.5" />
                  {placedEmployees.length} employees
                </span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Site</span>
                <ChevronRightIcon className="size-3.5" />
                <span className="font-medium text-foreground">Pool</span>
                <ChevronRightIcon className="size-3.5" />
                <span className="font-medium text-foreground">Slot</span>
                <ChevronRightIcon className="size-3.5" />
                <span className="font-medium text-foreground">Employee</span>
              </div>
              {focusSite || focusPool ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Filtered by</span>
                  {focusSite ? (
                    <Badge variant="outline">
                      <MapPinIcon className="size-3" />
                      {focusSite.name}
                    </Badge>
                  ) : null}
                  {focusPool ? (
                    <Badge variant="outline">
                      <LayersIcon className="size-3" />
                      {focusPool.poolNumber ? `${focusPool.poolNumber} · ` : ""}
                      {focusPool.name}
                    </Badge>
                  ) : null}
                  <Button type="button" size="sm" variant="ghost" onClick={clearFocus}>
                    Clear
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Tabs value={tab} onValueChange={onTabChange} className="gap-4">
            <TabsList variant="line">
              <TabsTrigger value="sites">
                <MapPinIcon className="size-4" />
                Sites
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {view.sites.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="pools">
                <LayersIcon className="size-4" />
                Pools
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {filteredPools.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="slots">
                <SquareStackIcon className="size-4" />
                Slots
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {filteredSlots.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="employees">
                <UsersIcon className="size-4" />
                Employees
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {filteredEmployees.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sites" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Sites</CardTitle>
                  <CardDescription>Workplaces under this project. Open a site to see its pools, slots, and employees.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {!view.sites.length ? (
                    <ShellEmpty
                      icon={<MapPinIcon className="size-8 opacity-60" />}
                      title="No sites yet"
                      description="Add a site first, then create quota pools under it."
                      action={
                        <WhenEditing>
                          <Button type="button" onClick={openAddSite}>
                            <PlusIcon />
                            Add site
                          </Button>
                        </WhenEditing>
                      }
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {view.sites.map((site) => {
                        const stats = siteStats.get(site.id) ?? { pools: 0, slots: 0, open: 0, occupied: 0 };
                        return (
                          <div key={site.id} className="rounded-xl border p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="grid min-w-0 gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium">{site.name}</p>
                                  <Badge variant="outline">{site.siteType ?? "Site"}</Badge>
                                </div>
                                <p className="truncate text-sm text-muted-foreground">
                                  {site.address ?? "No address"}
                                </p>
                              </div>
                              <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-lg border bg-muted/20 px-2 py-2">
                                <p className="text-sm font-semibold tabular-nums">{stats.pools}</p>
                                <p className="text-[11px] text-muted-foreground">Pools</p>
                              </div>
                              <div className="rounded-lg border bg-muted/20 px-2 py-2">
                                <p className="text-sm font-semibold tabular-nums">{stats.slots}</p>
                                <p className="text-[11px] text-muted-foreground">Slots</p>
                              </div>
                              <div className="rounded-lg border bg-muted/20 px-2 py-2">
                                <p className="text-sm font-semibold tabular-nums">{stats.occupied}</p>
                                <p className="text-[11px] text-muted-foreground">Staff</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => go("pools", site.id, "")}>
                                View pools
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => go("slots", site.id, "")}>
                                View slots
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => go("employees", site.id, "")}>
                                View employees
                              </Button>
                              <WhenEditing>
                                <Button type="button" size="sm" onClick={() => openAddPool(site.id)}>
                                  <PlusIcon />
                                  Add pool
                                </Button>
                              </WhenEditing>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pools" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Quota pools</CardTitle>
                  <CardDescription>
                    Pools belong to a site and create slots. Capacity = number of employee places.
                    {focusSite ? ` Showing pools on ${focusSite.name}.` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {!view.sites.length ? (
                    <ShellEmpty
                      title="Add a site first"
                      description="Pools must sit under a site."
                      action={
                        <Button type="button" variant="outline" onClick={() => setTab("sites")}>
                          Go to sites
                        </Button>
                      }
                    />
                  ) : !filteredPools.length ? (
                    <ShellEmpty
                      icon={<LayersIcon className="size-8 opacity-60" />}
                      title={focusSiteId ? "No pools on this site" : "No pools yet"}
                      description="Add a quota pool to create open slots for employees."
                      action={
                        <WhenEditing>
                          <Button type="button" onClick={() => openAddPool(focusSiteId || undefined)}>
                            <PlusIcon />
                            Add pool
                          </Button>
                        </WhenEditing>
                      }
                    />
                  ) : (
                    <div className="grid gap-3">
                      {filteredPools.map((pool) => (
                        <div key={pool.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                          <div className="grid min-w-0 gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <LayersIcon className="size-4 text-muted-foreground" />
                              <p className="font-medium">
                                {pool.poolNumber ? `${pool.poolNumber} · ` : ""}
                                {pool.name}
                              </p>
                              <Badge variant={pool.open > 0 ? "outline" : "secondary"}>
                                {pool.open > 0 ? `${pool.open} open` : "Full"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Site{" "}
                              <button
                                type="button"
                                className="font-medium text-foreground underline-offset-2 hover:underline"
                                onClick={() => go("sites", pool.siteId, "")}
                              >
                                {pool.siteName}
                              </button>
                              {" · "}
                              {pool.used} occupied / {pool.capacity} capacity
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => go("slots", pool.siteId, pool.id)}
                            >
                              View slots
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => go("employees", pool.siteId, pool.id)}
                            >
                              View employees
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="slots" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Slots</CardTitle>
                  <CardDescription>
                    Each slot is one employee place in a pool.
                    {focusPool ? ` Filtered to ${focusPool.name}.` : focusSite ? ` Filtered to ${focusSite.name}.` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {!filteredSlots.length ? (
                    <ShellEmpty
                      icon={<SquareStackIcon className="size-8 opacity-60" />}
                      title="No slots here"
                      description={
                        view.pools.length
                          ? "Add a pool with capacity to create slots, or clear the filter."
                          : "Create a site and pool first — slots are generated with the pool."
                      }
                      action={
                        view.pools.length ? (
                          <Button type="button" variant="outline" onClick={() => setTab("pools")}>
                            Go to pools
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" onClick={() => setTab("sites")}>
                            Go to sites
                          </Button>
                        )
                      }
                    />
                  ) : (
                    <div className="overflow-hidden rounded-xl border">
                      <div className="divide-y">
                        {filteredSlots.map((slot) => {
                          const occupied = slot.status === "occupied";
                          return (
                            <div key={slot.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums">
                                  {slot.slotNumber ?? "—"}
                                </span>
                                <Badge variant={occupied ? "default" : "outline"}>
                                  {occupied ? "Occupied" : "Open"}
                                </Badge>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {occupied ? slot.employeeName ?? "Employee" : "Empty slot"}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    <button
                                      type="button"
                                      className="hover:underline"
                                      onClick={() => go("sites", slot.siteId, "")}
                                    >
                                      {slot.siteName}
                                    </button>
                                    {" → "}
                                    <button
                                      type="button"
                                      className="hover:underline"
                                      onClick={() => go("pools", slot.siteId, slot.poolId)}
                                    >
                                      {slot.poolName}
                                    </button>
                                    {occupied && slot.occupation ? ` · ${slot.occupation}` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {occupied ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => go("employees", slot.siteId, slot.poolId)}
                                  >
                                    View employee
                                  </Button>
                                ) : (
                                  <WhenEditing>
                                    <Button type="button" size="sm" variant="outline" onClick={() => openOccupySlot(slot.id)}>
                                      <UserPlusIcon />
                                      Assign employee
                                    </Button>
                                  </WhenEditing>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {openCount > 0 && !focusPoolId && !focusSiteId ? (
                    <p className="text-sm text-muted-foreground">{openCount} open slot{openCount === 1 ? "" : "s"} across this project.</p>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="employees" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Employees on this project</CardTitle>
                  <CardDescription>
                    Staff assigned to occupied slots. Each employee links back to their site, pool, and slot.
                    {focusPool ? ` Filtered to ${focusPool.name}.` : focusSite ? ` Filtered to ${focusSite.name}.` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {!filteredEmployees.length ? (
                    <ShellEmpty
                      icon={<UsersIcon className="size-8 opacity-60" />}
                      title="No employees placed"
                      description="Assign a work permit holder to an open slot on the Slots tab."
                      action={
                        <Button type="button" variant="outline" onClick={() => setTab("slots")}>
                          Go to slots
                        </Button>
                      }
                    />
                  ) : (
                    <div className="overflow-hidden rounded-xl border">
                      <div className="divide-y">
                        {filteredEmployees.map((slot) => (
                          <div key={slot.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{slot.employeeName}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {slot.occupation ?? "No occupation"}
                                {" · "}
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={() => go("sites", slot.siteId, "")}
                                >
                                  {slot.siteName}
                                </button>
                                {" → "}
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={() => go("pools", slot.siteId, slot.poolId)}
                                >
                                  {slot.poolName}
                                </button>
                                {" → "}
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={() => go("slots", slot.siteId, slot.poolId)}
                                >
                                  Slot {slot.slotNumber ?? "—"}
                                </button>
                              </p>
                            </div>
                            {slot.employeeId ? (
                              <Button type="button" size="sm" variant="outline" asChild>
                                <a href={`/employees?edit=${slot.employeeId}`}>Open record</a>
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileTextIcon className="size-4" />
                  Project documents
                </CardTitle>
                <CardDescription>Files for this project. Appointment letters are created in HR.</CardDescription>
              </div>
              <WhenEditing>
                <Button type="button" size="sm" variant="outline" onClick={openAddDoc}>
                  <PlusIcon />
                  Add document
                </Button>
              </WhenEditing>
            </CardHeader>
            <CardContent>
              {view.documents.length ? (
                <ul className="grid gap-2">
                  {view.documents.map((document) => (
                    <li key={document.id} className="rounded-lg border px-3 py-2">
                      <p className="text-sm font-medium">{document.title}</p>
                      {document.notes ? <p className="text-sm text-muted-foreground">{document.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No project documents yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <FormDialog
        open={siteOpen}
        onOpenChange={setSiteOpen}
        title="Add site"
        description="A site is a workplace under this project (address or vessel)."
        pending={pending}
        submitLabel="Add site"
        onSubmit={() => void send(`/projects/${id}/sites`, { name: siteName, siteType, address })}
        size="md"
      >
        <TextField id="siteName" label="Site name" value={siteName} onChange={setSiteName} />
        <SelectField id="siteType" label="Site type" value={siteType} onChange={setSiteType}>
          <option value="">Not recorded</option>
          <option value="Address">Address</option>
          <option value="Vessel">Vessel</option>
        </SelectField>
        <TextField id="address" label="Site address" value={address} onChange={setAddress} />
      </FormDialog>

      <FormDialog
        open={poolOpen}
        onOpenChange={setPoolOpen}
        title="Add quota pool"
        description={
          poolSiteName
            ? `Creates open slots under ${poolSiteName}. Capacity = number of slots.`
            : "Creates open slots under the selected site."
        }
        pending={pending}
        submitLabel="Add quota pool"
        onSubmit={() =>
          void send(`/projects/${id}/pools`, {
            siteId: poolSiteId,
            poolNumber,
            name: poolName,
            capacity,
          })
        }
        size="md"
      >
        <SelectField id="poolSiteId" label="Site" value={poolSiteId} onChange={setPoolSiteId}>
          {(view?.sites ?? []).map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </SelectField>
        <TextField id="poolName" label="Pool name" value={poolName} onChange={setPoolName} />
        <TextField id="poolNumber" label="Pool number" value={poolNumber} onChange={setPoolNumber} />
        <TextField
          id="capacity"
          label="Slots (capacity)"
          value={capacity}
          onChange={setCapacity}
          hint="Each slot can hold one employee"
        />
      </FormDialog>

      <FormDialog
        open={slotOpen}
        onOpenChange={setSlotOpen}
        title="Assign employee to slot"
        description={
          activeSlot
            ? `Slot ${activeSlot.slotNumber ?? ""} · ${activeSlot.poolName} · ${activeSlot.siteName}`
            : "Place a work permit holder in this open slot."
        }
        pending={pending}
        submitLabel="Assign employee"
        onSubmit={() =>
          void send(`/projects/${id}/slots`, {
            slotId,
            employeeId,
            employeeName,
          })
        }
        size="md"
      >
        <SelectField id="employeeId" label="Existing employee" value={employeeId} onChange={setEmployeeId}>
          <option value="">New work permit holder</option>
          {(view?.employees ?? []).map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.legalName}
            </option>
          ))}
        </SelectField>
        {!employeeId ? (
          <TextField
            id="employeeName"
            label="New employee name"
            value={employeeName}
            onChange={setEmployeeName}
            hint="Creates a new employee under this legal employer"
          />
        ) : null}
      </FormDialog>

      <FormDialog
        open={docOpen}
        onOpenChange={setDocOpen}
        title="Add project document"
        description="Notes or file references for this project."
        pending={pending}
        submitLabel="Save document"
        onSubmit={() => void send(`/projects/${id}/documents`, { title, notes })}
        size="md"
      >
        <TextField id="title" label="Title" value={title} onChange={setTitle} />
        <AreaField id="notes" label="Notes" value={notes} onChange={setNotes} />
      </FormDialog>
    </Shell>
  );
}
