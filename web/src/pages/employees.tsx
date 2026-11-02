import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CameraIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaField, SelectField, TextField } from "@/components/field";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { FormDialog, FormDialogWide } from "@/components/form-dialog";
import { QuickCreateMenu } from "@/components/quick-create";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson, sendJson, uploadForm } from "@/lib/api";

type Company = { id: string; legalName: string };
type Option = { id: string; name: string; projectId?: string; siteId?: string };

type EmployeeListItem = {
  id: string;
  companyId: string;
  companyName: string;
  legalName: string;
  passportNumber: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  nationality: string | null;
  photoFileId: string | null;
};

type EmployeeForm = {
  companyId: string;
  legalName: string;
  preferredName: string;
  passportNumber: string;
  passportIssueDate: string;
  passportExpiry: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  permanentAddress: string;
  emergencyContact: string;
  occupation: string;
  employmentStatus: string;
  projectId: string;
  siteId: string;
  quotaPoolId: string;
  workSite: string;
  siteCode: string;
  salary: string;
  benefits: string;
  paidVacation: string;
  workingHours: string;
  contractDuration: string;
  country: string;
  origin: string;
};

const blank: EmployeeForm = {
  companyId: "",
  legalName: "",
  preferredName: "",
  passportNumber: "",
  passportIssueDate: "",
  passportExpiry: "",
  nationality: "",
  dateOfBirth: "",
  gender: "",
  permanentAddress: "",
  emergencyContact: "",
  occupation: "",
  employmentStatus: "",
  projectId: "",
  siteId: "",
  quotaPoolId: "",
  workSite: "",
  siteCode: "",
  salary: "",
  benefits: "",
  paidVacation: "",
  workingHours: "",
  contractDuration: "",
  country: "",
  origin: "",
};

function fromRecord(record: Record<string, string | null | undefined>, companyId = ""): EmployeeForm {
  const text = (key: keyof EmployeeForm) => record[key] ?? "";
  return {
    companyId: record.companyId ?? companyId,
    legalName: text("legalName"),
    preferredName: text("preferredName"),
    passportNumber: text("passportNumber"),
    passportIssueDate: text("passportIssueDate"),
    passportExpiry: text("passportExpiry"),
    nationality: text("nationality"),
    dateOfBirth: text("dateOfBirth"),
    gender: text("gender"),
    permanentAddress: text("permanentAddress"),
    emergencyContact: text("emergencyContact"),
    occupation: text("occupation"),
    employmentStatus: text("employmentStatus"),
    projectId: text("projectId"),
    siteId: text("siteId"),
    quotaPoolId: text("quotaPoolId"),
    workSite: text("workSite"),
    siteCode: text("siteCode"),
    salary: text("salary"),
    benefits: text("benefits"),
    paidVacation: text("paidVacation"),
    workingHours: text("workingHours"),
    contractDuration: text("contractDuration"),
    country: text("country"),
    origin: text("origin"),
  };
}

function editIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("new") === "1") return "new";
  const edit = params.get("edit");
  return edit && /^[0-9a-f-]{36}$/i.test(edit) ? edit : null;
}

function setUrlEdit(id: string | null) {
  const url = new URL(window.location.href);
  url.pathname = "/employees";
  url.searchParams.delete("new");
  url.searchParams.delete("edit");
  if (id === "new") url.searchParams.set("new", "1");
  else if (id) url.searchParams.set("edit", id);
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export function EmployeeListPage() {
  const [rows, setRows] = useState<EmployeeListItem[] | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [error, setError] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<string | null>(() => editIdFromUrl());

  function reload() {
    const query = debouncedQ.trim() ? `?q=${encodeURIComponent(debouncedQ.trim())}` : "";
    getJson<{ employees: EmployeeListItem[] }>(`/api/v1/employees${query}`)
      .then((data) => setRows(data.employees))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load employees"));
  }

  useEffect(() => {
    reload();
  }, [debouncedQ]);

  function openEditor(id: string | null) {
    setEditorId(id);
    setUrlEdit(id);
  }

  return (
    <Shell
      title="NEXCRM · Employees"
      eyebrow="HR"
      description="One record per worker. Add and edit in a dialog — reuse details for LOAs and allocations."
      actions={
        <WhenEditing>
          <QuickCreateMenu label="Quick Create" />
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>All employees</CardTitle>
          <CardDescription>Search by name, passport or position. Click a row to edit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SearchField value={q} onChange={setQ} placeholder="Search employees" label="Search employees" />
          {!rows && !error ? <PageSkeleton cards={1} /> : null}
          {rows ? (
            rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"> </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Passport</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => openEditor(row.id)}>
                      <TableCell className="w-12 pr-0">
                        <EmployeeAvatar name={row.legalName} photoFileId={row.photoFileId} size="sm" />
                      </TableCell>
                      <TableCell className="font-medium">{row.legalName}</TableCell>
                      <TableCell>{row.companyName}</TableCell>
                      <TableCell className="font-mono text-xs">{row.passportNumber ?? "—"}</TableCell>
                      <TableCell>{row.occupation ?? "—"}</TableCell>
                      <TableCell>{row.employmentStatus ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <ShellEmpty
                icon={<UsersIcon className="size-8 opacity-60" />}
                title={q ? "No matches" : "No employees yet"}
                description={q ? "Try another name, passport or position." : "Create an employee record once, then reuse it for LOAs and work permits."}
                action={
                  !q ? (
                    <WhenEditing>
                      <QuickCreateMenu label="Add employee" />
                    </WhenEditing>
                  ) : null
                }
              />
            )
          ) : null}
        </CardContent>
      </Card>

      <EmployeeEditorDialog
        id={editorId === "new" ? null : editorId}
        open={editorId !== null}
        onOpenChange={(open) => {
          if (!open) openEditor(null);
        }}
        onSaved={() => {
          openEditor(null);
          reload();
        }}
      />
    </Shell>
  );
}

function EmployeeEditorDialog({
  id,
  open,
  onOpenChange,
  onSaved,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [quotaPools, setQuotaPools] = useState<Option[]>([]);
  const [form, setForm] = useState<EmployeeForm>(blank);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    setPhotoFileId(null);
    async function load() {
      try {
        if (id) {
          const data = await getJson<{
            employee: Record<string, string | null>;
            companies: Company[];
            projects: Option[];
            sites: Option[];
            quotaPools: Option[];
          }>(`/api/v1/employees/${id}`);
          if (cancelled) return;
          setCompanies(data.companies);
          setProjects(data.projects);
          setSites(data.sites);
          setQuotaPools(data.quotaPools);
          setForm(fromRecord(data.employee));
          setPhotoFileId(data.employee.photoFileId ?? null);
        } else {
          const data = await getJson<{
            companies: Company[];
            preferences: { selectedCompanyId: string | null; defaultCompanyId: string | null };
          }>("/api/v1/companies?kind=employer");
          if (cancelled) return;
          setCompanies(data.companies);
          const fromUrl = new URLSearchParams(window.location.search).get("companyId");
          const companyId =
            (fromUrl && data.companies.some((item) => item.id === fromUrl) ? fromUrl : null) ??
            data.preferences.selectedCompanyId ??
            data.preferences.defaultCompanyId ??
            data.companies[0]?.id ??
            "";
          setForm({ ...blank, companyId });
          if (companyId) {
            const options = await getJson<{ projects: Option[]; sites: Option[]; quotaPools: Option[] }>(
              `/api/v1/employees/options?companyId=${companyId}`,
            );
            if (cancelled) return;
            setProjects(options.projects);
            setSites(options.sites);
            setQuotaPools(options.quotaPools);
          }
        }
        if (!cancelled) setReady(true);
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Could not load employee");
        onOpenChange(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, open]);

  const filteredSites = useMemo(
    () => sites.filter((site) => !form.projectId || site.projectId === form.projectId),
    [sites, form.projectId],
  );
  const filteredPools = useMemo(
    () => quotaPools.filter((pool) => !form.siteId || pool.siteId === form.siteId),
    [quotaPools, form.siteId],
  );

  async function onCompanyChange(companyId: string) {
    setForm((current) => ({ ...current, companyId, projectId: "", siteId: "", quotaPoolId: "" }));
    if (!companyId) {
      setProjects([]);
      setSites([]);
      setQuotaPools([]);
      return;
    }
    const options = await getJson<{ projects: Option[]; sites: Option[]; quotaPools: Option[] }>(
      `/api/v1/employees/options?companyId=${companyId}`,
    );
    setProjects(options.projects);
    setSites(options.sites);
    setQuotaPools(options.quotaPools);
  }

  async function save() {
    setPending(true);
    try {
      await sendJson<{ id: string }>(
        id ? `/api/v1/employees/${id}` : "/api/v1/employees",
        id ? "PATCH" : "POST",
        form,
      );
      toast.success(id ? "Employee updated" : "Employee created");
      onSaved();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save employee");
    } finally {
      setPending(false);
    }
  }

  async function uploadPhoto(fileList: FileList | null) {
    if (!id || !fileList?.[0]) return;
    setPending(true);
    try {
      const formData = new FormData();
      formData.append("file", fileList[0]);
      const result = await uploadForm<{ employee: { photoFileId: string | null } }>(`/api/v1/employees/${id}/photo`, formData);
      setPhotoFileId(result.employee.photoFileId);
      toast.success("Photo updated");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not upload photo");
    } finally {
      setPending(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={id ? form.legalName || "Edit employee" : "Add employee"}
      description="Passport and assignment details stay on the employee record for LOAs."
      pending={pending || !ready}
      submitLabel={id ? "Save changes" : "Create employee"}
      size="xl"
      onSubmit={save}
      footerExtra={
        id ? (
          <Button type="button" variant="outline" asChild className="mr-auto">
            <a href={`/loas/new?employeeId=${id}`}>Create LOA</a>
          </Button>
        ) : null
      }
    >
      {ready ? (
        <>
          <FormDialogWide>
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 px-3 py-3">
              <EmployeeAvatar name={form.legalName || "Employee"} photoFileId={photoFileId} size="lg" />
              <div className="grid min-w-0 flex-1 gap-1">
                <p className="text-sm font-medium">Profile photo</p>
                <p className="text-xs text-muted-foreground">
                  {id
                    ? photoFileId
                      ? "Photo on file — upload another to replace."
                      : "No photo yet — placeholder initials show in the list until you upload one."
                    : "Save the employee first, then open again to upload a photo."}
                </p>
                {id ? (
                  <div className="pt-1">
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={pending}
                      onChange={(event) => void uploadPhoto(event.target.files)}
                    />
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => photoRef.current?.click()}>
                      <CameraIcon className="size-4" />
                      {photoFileId ? "Replace photo" : "Upload photo"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </FormDialogWide>
          <SelectField id="companyId" label="Company" value={form.companyId} onChange={(value) => void onCompanyChange(value)}>
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.legalName}
              </option>
            ))}
          </SelectField>
          <TextField id="legalName" label="Full name" value={form.legalName} onChange={(value) => setForm((c) => ({ ...c, legalName: value }))} />
          <TextField id="preferredName" label="Preferred name" value={form.preferredName} onChange={(value) => setForm((c) => ({ ...c, preferredName: value }))} />
          <TextField id="occupation" label="Position" value={form.occupation} onChange={(value) => setForm((c) => ({ ...c, occupation: value }))} />
          <TextField id="passportNumber" label="Passport number" value={form.passportNumber} onChange={(value) => setForm((c) => ({ ...c, passportNumber: value }))} />
          <TextField id="nationality" label="Nationality" value={form.nationality} onChange={(value) => setForm((c) => ({ ...c, nationality: value }))} />
          <TextField id="dateOfBirth" label="Date of birth" type="date" value={form.dateOfBirth} onChange={(value) => setForm((c) => ({ ...c, dateOfBirth: value }))} />
          <TextField id="gender" label="Gender" value={form.gender} onChange={(value) => setForm((c) => ({ ...c, gender: value }))} />
          <TextField id="passportIssueDate" label="Passport issue date" type="date" value={form.passportIssueDate} onChange={(value) => setForm((c) => ({ ...c, passportIssueDate: value }))} />
          <TextField id="passportExpiry" label="Passport expiry" type="date" value={form.passportExpiry} onChange={(value) => setForm((c) => ({ ...c, passportExpiry: value }))} />
          <FormDialogWide>
            <AreaField id="permanentAddress" label="Permanent address" value={form.permanentAddress} onChange={(value) => setForm((c) => ({ ...c, permanentAddress: value }))} />
          </FormDialogWide>
          <FormDialogWide>
            <AreaField id="emergencyContact" label="Emergency contact" value={form.emergencyContact} onChange={(value) => setForm((c) => ({ ...c, emergencyContact: value }))} />
          </FormDialogWide>
          <SelectField id="projectId" label="Project" value={form.projectId} onChange={(value) => setForm((c) => ({ ...c, projectId: value, siteId: "", quotaPoolId: "" }))}>
            <option value="">None</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
          <SelectField id="siteId" label="Site" value={form.siteId} onChange={(value) => setForm((c) => ({ ...c, siteId: value, quotaPoolId: "" }))}>
            <option value="">None</option>
            {filteredSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </SelectField>
          <SelectField id="quotaPoolId" label="Quota pool" value={form.quotaPoolId} onChange={(value) => setForm((c) => ({ ...c, quotaPoolId: value }))}>
            <option value="">None</option>
            {filteredPools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name}
              </option>
            ))}
          </SelectField>
          <TextField id="workSite" label="Work site (document text)" value={form.workSite} onChange={(value) => setForm((c) => ({ ...c, workSite: value }))} />
          <TextField id="siteCode" label="Site ID" value={form.siteCode} onChange={(value) => setForm((c) => ({ ...c, siteCode: value }))} />
          <TextField id="salary" label="Basic salary" value={form.salary} onChange={(value) => setForm((c) => ({ ...c, salary: value }))} />
          <TextField id="employmentStatus" label="Employment status" value={form.employmentStatus} onChange={(value) => setForm((c) => ({ ...c, employmentStatus: value }))} />
          <TextField id="benefits" label="Benefits" value={form.benefits} onChange={(value) => setForm((c) => ({ ...c, benefits: value }))} />
          <TextField id="paidVacation" label="Paid vacation" value={form.paidVacation} onChange={(value) => setForm((c) => ({ ...c, paidVacation: value }))} />
          <TextField id="workingHours" label="Working hours" value={form.workingHours} onChange={(value) => setForm((c) => ({ ...c, workingHours: value }))} />
          <TextField id="contractDuration" label="Contract duration" value={form.contractDuration} onChange={(value) => setForm((c) => ({ ...c, contractDuration: value }))} />
        </>
      ) : (
        <FormDialogWide>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </FormDialogWide>
      )}
    </FormDialog>
  );
}

/** Deep-link compatibility: /employees/:id and /employees/new open the list with a dialog. */
export function EmployeeFormPage({ id }: { id: string | null }) {
  useEffect(() => {
    const target = id ? `/employees?edit=${id}` : "/employees?new=1";
    window.location.replace(target);
  }, [id]);
  return null;
}
