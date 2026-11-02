import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TextField } from "@/components/field";
import { FormDialog, FormDialogWide } from "@/components/form-dialog";
import { QuickCreateMenu } from "@/components/quick-create";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";

type Detail = {
  id: string;
  kind: "employer" | "client";
  legalName: string;
  registrationNumber: string | null;
  registeredAddress: string | null;
  country: string | null;
  businessActivity: string | null;
  phone: string | null;
  email: string | null;
  documentPrefix: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
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
  }[];
};

export function CompanyDetailPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  function reload() {
    getJson<Detail>(`/api/v1/companies/${id}`)
      .then(setDetail)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load company"));
  }

  useEffect(() => {
    reload();
  }, [id]);

  function openEdit() {
    if (!detail) return;
    setDraft({
      kind: detail.kind,
      legalName: detail.legalName,
      registrationNumber: detail.registrationNumber ?? "",
      registeredAddress: detail.registeredAddress ?? "",
      country: detail.country ?? "",
      businessActivity: detail.businessActivity ?? "",
      phone: detail.phone ?? "",
      email: detail.email ?? "",
      documentPrefix: detail.documentPrefix ?? "",
      signatoryName: detail.signatoryName ?? "",
      signatoryTitle: detail.signatoryTitle ?? "",
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

  return (
    <Shell
      title={detail ? `NEXCRM · ${detail.legalName}` : "NEXCRM · Company"}
      eyebrow="Company workspace"
      description="Projects, sites, pools and employees for this company."
      actions={
        <>
          <Button variant="outline" asChild>
            <a href="/companies">
              <ArrowLeftIcon />
              All companies
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
                  <Badge variant={detail.kind === "employer" ? "default" : "secondary"}>{detail.kind}</Badge>
                </div>
                <CardDescription>
                  {detail.registrationNumber ?? "No registration"} · {detail.country ?? "No country"}
                </CardDescription>
              </div>
              <WhenEditing>
                <Button type="button" variant="outline" onClick={openEdit}>
                  Edit company
                </Button>
              </WhenEditing>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p>Address: {detail.registeredAddress ?? "—"}</p>
              <p>Phone / email: {detail.phone ?? "—"} · {detail.email ?? "—"}</p>
              <p>Signatory: {detail.signatoryName ?? "—"} ({detail.signatoryTitle ?? "—"})</p>
              <p>Prefix: {detail.documentPrefix ?? "—"}</p>
              <p className="sm:col-span-2 text-muted-foreground">
                {detail.projectCount} projects · {detail.siteCount} sites · {detail.poolCount} pools · {detail.employeeCount}{" "}
                employees
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Projects</CardTitle>
                  <CardDescription>Sites and quota pools live under each project.</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/projects">
                    <PlusIcon />
                    Projects
                  </a>
                </Button>
              </CardHeader>
              <CardContent>
                {detail.projects.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Sites</TableHead>
                        <TableHead className="text-right">Pools</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.projects.map((project) => (
                        <TableRow
                          key={project.id}
                          className="cursor-pointer"
                          onClick={() => window.location.assign(`/projects/${project.id}`)}
                        >
                          <TableCell className="font-medium">{project.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{project.siteCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{project.poolCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <ShellEmpty title="No projects" description="Create projects from the Projects page for this employer." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Employees</CardTitle>
                  <CardDescription>Quick onboard with passport OCR, or add manually.</CardDescription>
                </div>
                {detail.kind === "employer" ? (
                  <WhenEditing>
                    <QuickCreateMenu companyId={id} size="sm" label="Add" />
                  </WhenEditing>
                ) : null}
              </CardHeader>
              <CardContent>
                {detail.employees.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Passport</TableHead>
                        <TableHead>Position</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.employees.map((employee) => (
                        <TableRow
                          key={employee.id}
                          className="cursor-pointer"
                          onClick={() => window.location.assign(`/employees?edit=${employee.id}`)}
                        >
                          <TableCell className="font-medium">{employee.legalName}</TableCell>
                          <TableCell className="font-mono text-xs">{employee.passportNumber ?? "—"}</TableCell>
                          <TableCell>{employee.occupation ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <ShellEmpty
                    title="No employees"
                    description="Use Quick Create for passport OCR onboard, or add the worker manually."
                    action={
                      detail.kind === "employer" ? (
                        <WhenEditing>
                          <QuickCreateMenu companyId={id} label="Add employee" />
                        </WhenEditing>
                      ) : null
                    }
                  />
                )}
              </CardContent>
            </Card>
          </div>
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
        <TextField id="registrationNumber" label="Registration number" value={draft.registrationNumber ?? ""} onChange={(value) => setDraft((c) => ({ ...c, registrationNumber: value }))} />
        <FormDialogWide>
          <TextField id="registeredAddress" label="Registered address" value={draft.registeredAddress ?? ""} onChange={(value) => setDraft((c) => ({ ...c, registeredAddress: value }))} />
        </FormDialogWide>
        <TextField id="country" label="Country" value={draft.country ?? ""} onChange={(value) => setDraft((c) => ({ ...c, country: value }))} />
        <TextField id="phone" label="Phone" value={draft.phone ?? ""} onChange={(value) => setDraft((c) => ({ ...c, phone: value }))} />
        <TextField id="email" label="Email" value={draft.email ?? ""} onChange={(value) => setDraft((c) => ({ ...c, email: value }))} />
        <TextField id="documentPrefix" label="Document prefix" value={draft.documentPrefix ?? ""} onChange={(value) => setDraft((c) => ({ ...c, documentPrefix: value }))} />
        <TextField id="signatoryName" label="Signatory" value={draft.signatoryName ?? ""} onChange={(value) => setDraft((c) => ({ ...c, signatoryName: value }))} />
        <TextField id="signatoryTitle" label="Signatory title" value={draft.signatoryTitle ?? ""} onChange={(value) => setDraft((c) => ({ ...c, signatoryTitle: value }))} />
      </FormDialog>
    </Shell>
  );
}
