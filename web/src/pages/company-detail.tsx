import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownAZIcon, ArrowLeftIcon, ArrowUpAZIcon, BriefcaseIcon, PlusIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextField } from "@/components/field";
import { FormDialog, FormDialogWide } from "@/components/form-dialog";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { QuickCreateMenu } from "@/components/quick-create";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CompanyBrandingPanel } from "@/components/company-branding";
import { PortalAccountsPanel } from "@/components/portal-accounts-panel";
import { getJson, sendJson } from "@/lib/api";

type Detail = {
  id: string;
  kind: "employer" | "client";
  legalName: string;
  registrationNumber: string | null;
  tinNumber: string | null;
  registeredAddress: string | null;
  country: string | null;
  businessActivity: string | null;
  phone: string | null;
  email: string | null;
  documentPrefix: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  letterheadFileId: string | null;
  sealFileId: string | null;
  signatureFileId: string | null;
  projectCount: number;
  siteCount: number;
  poolCount: number;
  employeeCount: number;
  projects: { id: string; name: string; siteCount: number; poolCount: number }[];
  employees: {
    id: string;
    legalName: string;
    passportNumber: string | null;
    occupation: string | null;
    employmentStatus: string | null;
    photoFileId: string | null;
  }[];
};

type WorkspaceTab = "employees" | "projects";
type SortDir = "asc" | "desc";

function tabFromUrl(): WorkspaceTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "projects" ? "projects" : "employees";
}

function setTabInUrl(tab: WorkspaceTab) {
  const url = new URL(window.location.href);
  if (tab === "employees") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function matchesQuery(haystack: Array<string | null | undefined>, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return haystack.some((part) => (part ?? "").toLowerCase().includes(needle));
}

export function CompanyDetailPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<WorkspaceTab>(() => tabFromUrl());
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [employeeSort, setEmployeeSort] = useState<SortDir>("asc");
  const [projectSort, setProjectSort] = useState<SortDir>("asc");
  const debouncedEmployeeQuery = useDebouncedValue(employeeQuery);
  const debouncedProjectQuery = useDebouncedValue(projectQuery);

  function reload() {
    getJson<Detail>(`/api/v1/companies/${id}`)
      .then((data) => {
        if (data.kind === "client") {
          window.location.replace(`/clients/${id}`);
          return;
        }
        setDetail(data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load company"));
  }

  useEffect(() => {
    reload();
  }, [id]);

  useEffect(() => {
    if (detail?.kind === "client" && tab === "projects") {
      setTab("employees");
      setTabInUrl("employees");
    }
  }, [detail?.kind, tab]);

  const filteredEmployees = useMemo(() => {
    if (!detail) return [];
    const rows = detail.employees.filter((employee) =>
      matchesQuery(
        [employee.legalName, employee.passportNumber, employee.occupation, employee.employmentStatus],
        debouncedEmployeeQuery.trim(),
      ),
    );
    rows.sort((a, b) => {
      const cmp = a.legalName.localeCompare(b.legalName, undefined, { sensitivity: "base" });
      return employeeSort === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [detail, debouncedEmployeeQuery, employeeSort]);

  const filteredProjects = useMemo(() => {
    if (!detail) return [];
    const rows = detail.projects.filter((project) => matchesQuery([project.name], debouncedProjectQuery.trim()));
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return projectSort === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [detail, debouncedProjectQuery, projectSort]);

  function openEdit() {
    if (!detail) return;
    setDraft({
      kind: detail.kind,
      legalName: detail.legalName,
      registrationNumber: detail.registrationNumber ?? "",
      tinNumber: detail.tinNumber ?? "",
      registeredAddress: detail.registeredAddress ?? "",
      country: detail.country ?? "",
      businessActivity: detail.businessActivity ?? "",
      phone: detail.phone ?? "",
      email: detail.email ?? "",
      documentPrefix: detail.documentPrefix ?? "",
      signatoryName: detail.signatoryName ?? "",
      signatoryTitle: detail.signatoryTitle ?? "",
      letterheadFileId: detail.letterheadFileId ?? "",
      sealFileId: detail.sealFileId ?? "",
      signatureFileId: detail.signatureFileId ?? "",
    });
    setOpen(true);
  }

  async function save() {
    setPending(true);
    try {
      await sendJson(`/api/v1/companies/${id}`, "PATCH", draft);
      toast.success("Company updated");
      setOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  function onTabChange(value: string) {
    const next = value === "projects" ? "projects" : "employees";
    setTab(next);
    setTabInUrl(next);
  }

  return (
    <Shell
      title={detail ? `JACMS · ${detail.legalName}` : "JACMS · Company"}
      eyebrow="Company workspace"
      description={
        detail?.kind === "client"
          ? "Client for billing and staff placements. Assign workers from Allocations."
          : "Legal employer workspace — projects, sites, pools, LOA branding, and employees."
      }
      actions={
        <>
          <Button variant="outline" asChild>
            <a href={detail?.kind === "client" ? "/clients" : "/companies"}>
              <ArrowLeftIcon />
              {detail?.kind === "client" ? "All clients" : "Legal employers"}
            </a>
          </Button>
          {detail?.kind === "employer" ? (
            <WhenEditing>
              <QuickCreateMenu companyId={id} label="Quick Create" />
            </WhenEditing>
          ) : null}
        </>
      }
    >
      <Banner message={error} error />
      {!detail && !error ? <PageSkeleton /> : null}
      {detail ? (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{detail.legalName}</CardTitle>
                  <Badge variant={detail.kind === "employer" ? "default" : "secondary"}>
                    {detail.kind === "employer" ? "Legal employer" : "Client"}
                  </Badge>
                </div>
                <CardDescription>
                  {detail.registrationNumber ?? "No registration"}
                  {detail.tinNumber ? ` · TIN ${detail.tinNumber}` : ""} · {detail.country ?? "No country"}
                </CardDescription>
              </div>
              <WhenEditing>
                <Button type="button" variant="outline" onClick={openEdit}>
                  Edit company
                </Button>
              </WhenEditing>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p>TIN: {detail.tinNumber ?? "—"}</p>
              <p>Address: {detail.registeredAddress ?? "—"}</p>
              <p>Phone / email: {detail.phone ?? "—"} · {detail.email ?? "—"}</p>
              {detail.kind === "employer" ? (
                <>
                  <p>
                    Signatory: {detail.signatoryName ?? "—"} ({detail.signatoryTitle ?? "—"})
                  </p>
                  <p>Prefix: {detail.documentPrefix ?? "—"}</p>
                  <p className="sm:col-span-2 text-muted-foreground">
                    {detail.projectCount} projects · {detail.siteCount} sites · {detail.poolCount} pools ·{" "}
                    {detail.employeeCount} employees
                  </p>
                </>
              ) : (
                <p className="sm:col-span-2 text-muted-foreground">
                  {detail.employeeCount} placed worker{detail.employeeCount === 1 ? "" : "s"} · bill via Payroll
                </p>
              )}
              {detail.kind === "employer" ? (
                <div className="sm:col-span-2 grid gap-2 border-t pt-3">
                  <p className="text-sm font-medium">Document branding</p>
                  <p className="text-xs text-muted-foreground">Letterhead, stamp/seal and signature for LOAs and other letters.</p>
                  <WhenEditing>
                    <CompanyBrandingPanel
                      companyId={detail.id}
                      branding={{
                        letterheadFileId: detail.letterheadFileId,
                        sealFileId: detail.sealFileId,
                        signatureFileId: detail.signatureFileId,
                      }}
                      onChange={(next) => setDetail((current) => (current ? { ...current, ...next } : current))}
                    />
                  </WhenEditing>
                  {!detail.letterheadFileId && !detail.sealFileId && !detail.signatureFileId ? (
                    <p className="text-xs text-muted-foreground">No branding files uploaded yet.</p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {detail.kind === "employer" ? (
            <WhenEditing>
              <PortalAccountsPanel companyId={detail.id} />
            </WhenEditing>
          ) : null}

          <Card>
            <CardHeader className="pb-0">
              <CardTitle>{detail.kind === "client" ? "Placed workers" : "Workspace"}</CardTitle>
              <CardDescription>
                {detail.kind === "client"
                  ? "Workers currently allocated to this client for billing."
                  : "Search and browse employees or projects for this legal employer."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={detail.kind === "client" ? "employees" : tab} onValueChange={onTabChange} className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {detail.kind === "employer" ? (
                    <TabsList variant="line">
                      <TabsTrigger value="employees">
                        Employees
                        <Badge variant="secondary" className="ml-1.5 tabular-nums">
                          {detail.employeeCount}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="projects">
                        Projects
                        <Badge variant="secondary" className="ml-1.5 tabular-nums">
                          {detail.projectCount}
                        </Badge>
                      </TabsTrigger>
                    </TabsList>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {detail.employeeCount} active placement{detail.employeeCount === 1 ? "" : "s"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {detail.kind === "employer" ? (
                      <>
                        <WhenEditing>
                          <QuickCreateMenu companyId={id} size="sm" label="Add employee" />
                        </WhenEditing>
                        <Button variant="outline" size="sm" asChild>
                          <a href="/projects">
                            <PlusIcon />
                            Manage projects
                          </a>
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" asChild>
                        <a href="/allocations">
                          <PlusIcon />
                          Manage allocations
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                <TabsContent value="employees" className="mt-0 grid gap-3 outline-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <SearchField
                        value={employeeQuery}
                        onChange={setEmployeeQuery}
                        placeholder="Search name, passport, position…"
                        label="Search employees"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEmployeeSort((d) => (d === "asc" ? "desc" : "asc"))}
                        aria-label={employeeSort === "asc" ? "Sort Z to A" : "Sort A to Z"}
                      >
                        {employeeSort === "asc" ? <ArrowDownAZIcon className="size-4" /> : <ArrowUpAZIcon className="size-4" />}
                        Name
                      </Button>
                      {employeeQuery ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEmployeeQuery("")}>
                          <XIcon className="size-4" />
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <p>
                      {debouncedEmployeeQuery.trim()
                        ? `Showing ${filteredEmployees.length} of ${detail.employees.length}`
                        : `${detail.employees.length} ${detail.kind === "client" ? "placed worker" : "employee"}${detail.employees.length === 1 ? "" : "s"}`}
                    </p>
                    <p className="hidden sm:block">Click a row to open the employee record</p>
                  </div>
                  {detail.employees.length === 0 ? (
                    <ShellEmpty
                      title={detail.kind === "client" ? "No placed workers" : "No employees"}
                      description={
                        detail.kind === "client"
                          ? "Allocate staff to this client from Allocations, then bill them in Payroll."
                          : "Use Quick Create for passport OCR onboard, or add the worker manually."
                      }
                      action={
                        detail.kind === "employer" ? (
                          <WhenEditing>
                            <QuickCreateMenu companyId={id} label="Add employee" />
                          </WhenEditing>
                        ) : (
                          <Button variant="outline" asChild>
                            <a href="/allocations">Open allocations</a>
                          </Button>
                        )
                      }
                    />
                  ) : filteredEmployees.length === 0 ? (
                    <ShellEmpty
                      title="No matches"
                      description={`Nothing matched “${debouncedEmployeeQuery.trim()}”. Try another name, passport or position.`}
                      action={
                        <Button type="button" variant="outline" size="sm" onClick={() => setEmployeeQuery("")}>
                          Clear search
                        </Button>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"> </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Passport</TableHead>
                            <TableHead>Position</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredEmployees.map((employee) => (
                            <TableRow
                              key={employee.id}
                              className="cursor-pointer"
                              onClick={() => window.location.assign(`/employees?edit=${employee.id}`)}
                            >
                              <TableCell className="w-12 pr-0">
                                <EmployeeAvatar
                                  name={employee.legalName}
                                  photoFileId={employee.photoFileId}
                                  size="default"
                                  shape="rounded"
                                  preview
                                />
                              </TableCell>
                              <TableCell className="font-medium">{employee.legalName}</TableCell>
                              <TableCell className="font-mono text-xs">{employee.passportNumber ?? "—"}</TableCell>
                              <TableCell>{employee.occupation ?? "—"}</TableCell>
                              <TableCell>
                                {employee.employmentStatus ? (
                                  <Badge variant="outline">{employee.employmentStatus}</Badge>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {detail.kind === "employer" ? (
                  <TabsContent value="projects" className="mt-0 grid gap-3 outline-none">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <SearchField
                          value={projectQuery}
                          onChange={setProjectQuery}
                          placeholder="Search projects…"
                          label="Search projects"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setProjectSort((d) => (d === "asc" ? "desc" : "asc"))}
                          aria-label={projectSort === "asc" ? "Sort Z to A" : "Sort A to Z"}
                        >
                          {projectSort === "asc" ? <ArrowDownAZIcon className="size-4" /> : <ArrowUpAZIcon className="size-4" />}
                          Name
                        </Button>
                        {projectQuery ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setProjectQuery("")}>
                            <XIcon className="size-4" />
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <p>
                        {debouncedProjectQuery.trim()
                          ? `Showing ${filteredProjects.length} of ${detail.projects.length}`
                          : `${detail.projects.length} project${detail.projects.length === 1 ? "" : "s"}`}
                        {detail.projects.length
                          ? ` · ${detail.siteCount} sites · ${detail.poolCount} pools`
                          : null}
                      </p>
                    </div>
                    {detail.projects.length === 0 ? (
                      <ShellEmpty
                        title="No projects"
                        description="Create projects from the Projects page for this employer."
                        action={
                          <Button variant="outline" size="sm" asChild>
                            <a href="/projects">Open projects</a>
                          </Button>
                        }
                      />
                    ) : filteredProjects.length === 0 ? (
                      <ShellEmpty
                        title="No matches"
                        description={`Nothing matched “${debouncedProjectQuery.trim()}”.`}
                        action={
                          <Button type="button" variant="outline" size="sm" onClick={() => setProjectQuery("")}>
                            Clear search
                          </Button>
                        }
                      />
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
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
                              </CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="rounded-lg border bg-muted/20 px-2.5 py-2">
                                    <p className="text-[11px] text-muted-foreground">Sites</p>
                                    <p className="text-sm font-semibold tabular-nums">{project.siteCount}</p>
                                  </div>
                                  <div className="rounded-lg border bg-muted/20 px-2.5 py-2">
                                    <p className="text-[11px] text-muted-foreground">Pools</p>
                                    <p className="text-sm font-semibold tabular-nums">{project.poolCount}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </a>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                ) : null}
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : null}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit company"
        pending={pending}
        submitLabel="Save changes"
        onSubmit={save}
        size="xl"
      >
        <TextField id="legalName" label="Legal name" value={draft.legalName ?? ""} onChange={(value) => setDraft((c) => ({ ...c, legalName: value }))} />
        <TextField
          id="registrationNumber"
          label="Registration number"
          value={draft.registrationNumber ?? ""}
          onChange={(value) => setDraft((c) => ({ ...c, registrationNumber: value }))}
        />
        <TextField
          id="tinNumber"
          label="TIN number"
          value={draft.tinNumber ?? ""}
          onChange={(value) => setDraft((c) => ({ ...c, tinNumber: value }))}
        />
        <FormDialogWide>
          <TextField
            id="registeredAddress"
            label="Address"
            value={draft.registeredAddress ?? ""}
            onChange={(value) => setDraft((c) => ({ ...c, registeredAddress: value }))}
          />
        </FormDialogWide>
        <TextField id="country" label="Country" value={draft.country ?? ""} onChange={(value) => setDraft((c) => ({ ...c, country: value }))} />
        <TextField id="phone" label="Phone" value={draft.phone ?? ""} onChange={(value) => setDraft((c) => ({ ...c, phone: value }))} />
        <TextField id="email" label="Email" value={draft.email ?? ""} onChange={(value) => setDraft((c) => ({ ...c, email: value }))} />
        {draft.kind === "employer" ? (
          <>
            <TextField
              id="documentPrefix"
              label="Document prefix"
              value={draft.documentPrefix ?? ""}
              onChange={(value) => setDraft((c) => ({ ...c, documentPrefix: value }))}
            />
            <TextField
              id="signatoryName"
              label="Signatory"
              value={draft.signatoryName ?? ""}
              onChange={(value) => setDraft((c) => ({ ...c, signatoryName: value }))}
            />
            <TextField
              id="signatoryTitle"
              label="Signatory title"
              value={draft.signatoryTitle ?? ""}
              onChange={(value) => setDraft((c) => ({ ...c, signatoryTitle: value }))}
            />
          </>
        ) : null}
        {draft.kind === "employer" ? (
          <FormDialogWide>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Document branding</p>
              <CompanyBrandingPanel
                companyId={id}
                branding={{
                  letterheadFileId: draft.letterheadFileId || null,
                  sealFileId: draft.sealFileId || null,
                  signatureFileId: draft.signatureFileId || null,
                }}
                onChange={(next) =>
                  setDraft((c) => ({
                    ...c,
                    letterheadFileId: next.letterheadFileId ?? "",
                    sealFileId: next.sealFileId ?? "",
                    signatureFileId: next.signatureFileId ?? "",
                  }))
                }
                disabled={pending}
              />
            </div>
          </FormDialogWide>
        ) : null}
      </FormDialog>
    </Shell>
  );
}
