import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2Icon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField, TextField } from "@/components/field";
import { FormDialog, FormDialogWide } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson, sendJson } from "@/lib/api";

type CompanyRow = {
  id: string;
  kind: "employer" | "client";
  legalName: string;
  registrationNumber: string | null;
  country: string | null;
  projectCount: number;
  siteCount: number;
  poolCount: number;
  employeeCount: number;
};

type Draft = {
  id: string | null;
  kind: "employer" | "client";
  legalName: string;
  registrationNumber: string;
  registeredAddress: string;
  country: string;
  businessActivity: string;
  phone: string;
  email: string;
  documentPrefix: string;
  signatoryName: string;
  signatoryTitle: string;
};

const blank: Draft = {
  id: null,
  kind: "employer",
  legalName: "",
  registrationNumber: "",
  registeredAddress: "",
  country: "",
  businessActivity: "",
  phone: "",
  email: "",
  documentPrefix: "",
  signatoryName: "",
  signatoryTitle: "",
};

export function CompaniesPage() {
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [pending, setPending] = useState(false);

  function reload() {
    const query = new URLSearchParams({ counts: "1" });
    if (debouncedQ.trim()) query.set("q", debouncedQ.trim());
    getJson<{ companies: CompanyRow[] }>(`/api/v1/companies?${query}`)
      .then((data) => setRows(data.companies))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load companies"));
  }

  useEffect(() => {
    reload();
  }, [debouncedQ]);

  async function openEdit(id: string) {
    try {
      const company = await getJson<Draft & { id: string }>(`/api/v1/companies/${id}`);
      setDraft({
        id: company.id,
        kind: company.kind === "client" ? "client" : "employer",
        legalName: company.legalName ?? "",
        registrationNumber: company.registrationNumber ?? "",
        registeredAddress: company.registeredAddress ?? "",
        country: company.country ?? "",
        businessActivity: company.businessActivity ?? "",
        phone: company.phone ?? "",
        email: company.email ?? "",
        documentPrefix: company.documentPrefix ?? "",
        signatoryName: company.signatoryName ?? "",
        signatoryTitle: company.signatoryTitle ?? "",
      });
      setOpen(true);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not open company");
    }
  }

  async function save() {
    setPending(true);
    try {
      const saved = await sendJson<{ id: string }>(
        draft.id ? `/api/v1/companies/${draft.id}` : "/api/v1/companies",
        draft.id ? "PATCH" : "POST",
        { ...draft },
      );
      toast.success(draft.id ? "Company saved" : "Company created");
      setOpen(false);
      reload();
      if (!draft.id) window.location.assign(`/companies/${saved.id}`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save company");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="NEXCRM · Companies"
      eyebrow="CRM"
      description="All employers and clients. Open a company for projects, sites, pools and people."
      actions={
        <WhenEditing>
          <Button
            type="button"
            onClick={() => {
              setDraft(blank);
              setOpen(true);
            }}
          >
            <PlusIcon />
            Add company
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>Search, add, or edit. Click a row to open the company workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SearchField value={q} onChange={setQ} placeholder="Search companies" label="Search companies" />
          {!rows && !error ? <PageSkeleton cards={1} /> : null}
          {rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Sites</TableHead>
                  <TableHead className="text-right">Pools</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => window.location.assign(`/companies/${row.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{row.legalName}</div>
                      <div className="text-xs text-muted-foreground">{row.registrationNumber ?? row.country ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.kind === "employer" ? "default" : "secondary"}>{row.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.projectCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.siteCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.poolCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.employeeCount}</TableCell>
                    <TableCell>
                      <WhenEditing>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openEdit(row.id);
                          }}
                        >
                          Edit
                        </Button>
                      </WhenEditing>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {rows && !rows.length ? (
            <ShellEmpty
              icon={<Building2Icon className="size-8 opacity-60" />}
              title={q ? "No matches" : "No companies yet"}
              description={q ? "Try another name or registration." : "Add an employer or client company to get started."}
              action={
                !q ? (
                  <WhenEditing>
                    <Button
                      type="button"
                      onClick={() => {
                        setDraft(blank);
                        setOpen(true);
                      }}
                    >
                      Add company
                    </Button>
                  </WhenEditing>
                ) : null
              }
            />
          ) : null}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? draft.legalName || "Edit company" : "Add company"}
        description="Employers hold letterhead; clients receive seconded staff."
        pending={pending}
        submitLabel={draft.id ? "Save changes" : "Create company"}
        onSubmit={save}
        size="xl"
      >
        <SelectField
          id="kind"
          label="Kind"
          value={draft.kind}
          onChange={(value) => setDraft((c) => ({ ...c, kind: value === "client" ? "client" : "employer" }))}
        >
          <option value="employer">Employer</option>
          <option value="client">Client</option>
        </SelectField>
        <TextField id="legalName" label="Legal name" value={draft.legalName} onChange={(value) => setDraft((c) => ({ ...c, legalName: value }))} />
        <TextField id="registrationNumber" label="Registration number" value={draft.registrationNumber} onChange={(value) => setDraft((c) => ({ ...c, registrationNumber: value }))} />
        <FormDialogWide>
          <TextField id="registeredAddress" label="Registered address" value={draft.registeredAddress} onChange={(value) => setDraft((c) => ({ ...c, registeredAddress: value }))} />
        </FormDialogWide>
        <TextField id="country" label="Country" value={draft.country} onChange={(value) => setDraft((c) => ({ ...c, country: value }))} />
        <TextField id="businessActivity" label="Business activity" value={draft.businessActivity} onChange={(value) => setDraft((c) => ({ ...c, businessActivity: value }))} />
        <TextField id="phone" label="Phone" value={draft.phone} onChange={(value) => setDraft((c) => ({ ...c, phone: value }))} />
        <TextField id="email" label="Email" value={draft.email} onChange={(value) => setDraft((c) => ({ ...c, email: value }))} />
        <TextField id="documentPrefix" label="Document prefix" value={draft.documentPrefix} onChange={(value) => setDraft((c) => ({ ...c, documentPrefix: value }))} />
        <TextField id="signatoryName" label="Authorized signatory" value={draft.signatoryName} onChange={(value) => setDraft((c) => ({ ...c, signatoryName: value }))} />
        <TextField id="signatoryTitle" label="Signatory title" value={draft.signatoryTitle} onChange={(value) => setDraft((c) => ({ ...c, signatoryTitle: value }))} />
      </FormDialog>
    </Shell>
  );
}
