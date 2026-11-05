import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BriefcaseIcon,
  Building2Icon,
  LayersIcon,
  MapPinIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/field";
import { FormDialog, FormDialogWide } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CompanyBrandingPanel } from "@/components/company-branding";
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
  kind: "employer";
  legalName: string;
  registrationNumber: string;
  tinNumber: string;
  registeredAddress: string;
  country: string;
  businessActivity: string;
  phone: string;
  email: string;
  documentPrefix: string;
  signatoryName: string;
  signatoryTitle: string;
  letterheadFileId: string | null;
  sealFileId: string | null;
  signatureFileId: string | null;
};

const blank: Draft = {
  id: null,
  kind: "employer",
  legalName: "",
  registrationNumber: "",
  tinNumber: "",
  registeredAddress: "",
  country: "",
  businessActivity: "",
  phone: "",
  email: "",
  documentPrefix: "",
  signatoryName: "",
  signatoryTitle: "",
  letterheadFileId: null,
  sealFileId: null,
  signatureFileId: null,
};

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersIcon;
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

export function CompaniesPage() {
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [pending, setPending] = useState(false);

  function reload() {
    const query = new URLSearchParams({ counts: "1", kind: "employer" });
    if (debouncedQ.trim()) query.set("q", debouncedQ.trim());
    getJson<{ companies: CompanyRow[] }>(`/api/v1/companies?${query}`)
      .then((data) => setRows(data.companies))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load companies"));
  }

  useEffect(() => {
    // Old clients tab moved to /clients
    if (new URLSearchParams(window.location.search).get("tab") === "clients") {
      window.location.replace("/clients");
      return;
    }
    reload();
  }, [debouncedQ]);

  async function openEdit(id: string) {
    try {
      const company = await getJson<Draft & { id: string }>(`/api/v1/companies/${id}`);
      setDraft({
        id: company.id,
        kind: "employer",
        legalName: company.legalName ?? "",
        registrationNumber: company.registrationNumber ?? "",
        tinNumber: company.tinNumber ?? "",
        registeredAddress: company.registeredAddress ?? "",
        country: company.country ?? "",
        businessActivity: company.businessActivity ?? "",
        phone: company.phone ?? "",
        email: company.email ?? "",
        documentPrefix: company.documentPrefix ?? "",
        signatoryName: company.signatoryName ?? "",
        signatoryTitle: company.signatoryTitle ?? "",
        letterheadFileId: company.letterheadFileId ?? null,
        sealFileId: company.sealFileId ?? null,
        signatureFileId: company.signatureFileId ?? null,
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
        { ...draft, kind: "employer" },
      );
      toast.success(draft.id ? "Legal employer saved" : "Legal employer created");
      setOpen(false);
      reload();
      if (!draft.id) window.location.assign(`/companies/${saved.id}`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save company");
    } finally {
      setPending(false);
    }
  }

  function openCreate() {
    setDraft(blank);
    setOpen(true);
  }

  return (
    <Shell
      title="NEXCRM · Legal employers"
      eyebrow="CRM"
      description="WP-holding employers with projects, sites, pools, LOAs and letterhead. Clients live under Clients."
      actions={
        <WhenEditing>
          <Button type="button" onClick={openCreate}>
            <PlusIcon />
            Add legal employer
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField value={q} onChange={setQ} placeholder="Search legal employers…" label="Search companies" />
          {rows ? (
            <p className="shrink-0 text-sm text-muted-foreground">
              {rows.length} employer{rows.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        {!rows && !error ? <PageSkeleton cards={6} /> : null}

        {rows?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <div key={row.id} className="relative">
                <a
                  href={`/companies/${row.id}`}
                  className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full hover:bg-muted/40">
                    <CardHeader className="gap-2 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="pr-14 text-base leading-snug">{row.legalName}</CardTitle>
                        <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
                      </div>
                      <CardDescription className="truncate">
                        {row.registrationNumber ?? "No registration"}
                        {row.country ? ` · ${row.country}` : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2">
                        <StatChip icon={BriefcaseIcon} label="Projects" value={row.projectCount} />
                        <StatChip icon={MapPinIcon} label="Sites" value={row.siteCount} />
                        <StatChip icon={LayersIcon} label="Pools" value={row.poolCount} />
                        <StatChip icon={UsersIcon} label="Employees" value={row.employeeCount} />
                      </div>
                    </CardContent>
                  </Card>
                </a>
                <WhenEditing>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="absolute top-3 right-3 z-10"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void openEdit(row.id);
                    }}
                  >
                    Edit
                  </Button>
                </WhenEditing>
              </div>
            ))}
          </div>
        ) : null}

        {rows && !rows.length ? (
          <ShellEmpty
            icon={<Building2Icon className="size-8 opacity-60" />}
            title={q.trim() ? "No matches" : "No legal employers yet"}
            description={
              q.trim()
                ? "Try another name or registration."
                : "Add a legal employer (WP holder) for staff, projects and LOAs."
            }
            action={
              q.trim() ? (
                <Button type="button" variant="outline" onClick={() => setQ("")}>
                  Clear search
                </Button>
              ) : (
                <WhenEditing>
                  <Button type="button" onClick={openCreate}>
                    Add legal employer
                  </Button>
                </WhenEditing>
              )
            }
          />
        ) : null}
      </div>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? draft.legalName || "Edit legal employer" : "Add legal employer"}
        description="Legal employers hold letterhead, seal and signature for LOAs. Upload branding after the company exists."
        pending={pending}
        submitLabel={draft.id ? "Save changes" : "Create company"}
        onSubmit={save}
        size="xl"
      >
        <TextField id="legalName" label="Legal name" value={draft.legalName} onChange={(value) => setDraft((c) => ({ ...c, legalName: value }))} />
        <TextField id="registrationNumber" label="Registration number" value={draft.registrationNumber} onChange={(value) => setDraft((c) => ({ ...c, registrationNumber: value }))} />
        <TextField id="tinNumber" label="TIN number" value={draft.tinNumber} onChange={(value) => setDraft((c) => ({ ...c, tinNumber: value }))} />
        <FormDialogWide>
          <TextField id="registeredAddress" label="Address" value={draft.registeredAddress} onChange={(value) => setDraft((c) => ({ ...c, registeredAddress: value }))} />
        </FormDialogWide>
        <TextField id="country" label="Country" value={draft.country} onChange={(value) => setDraft((c) => ({ ...c, country: value }))} />
        <TextField id="businessActivity" label="Business activity" value={draft.businessActivity} onChange={(value) => setDraft((c) => ({ ...c, businessActivity: value }))} />
        <TextField id="phone" label="Phone" value={draft.phone} onChange={(value) => setDraft((c) => ({ ...c, phone: value }))} />
        <TextField id="email" label="Email" value={draft.email} onChange={(value) => setDraft((c) => ({ ...c, email: value }))} />
        <TextField id="documentPrefix" label="Document prefix" value={draft.documentPrefix} onChange={(value) => setDraft((c) => ({ ...c, documentPrefix: value }))} />
        <TextField id="signatoryName" label="Authorized signatory" value={draft.signatoryName} onChange={(value) => setDraft((c) => ({ ...c, signatoryName: value }))} />
        <TextField id="signatoryTitle" label="Signatory title" value={draft.signatoryTitle} onChange={(value) => setDraft((c) => ({ ...c, signatoryTitle: value }))} />
        <FormDialogWide>
          {draft.id ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Document branding</p>
              <p className="text-xs text-muted-foreground">Used on LOAs and other company letters.</p>
              <CompanyBrandingPanel
                companyId={draft.id}
                branding={{
                  letterheadFileId: draft.letterheadFileId,
                  sealFileId: draft.sealFileId,
                  signatureFileId: draft.signatureFileId,
                }}
                onChange={(next) => setDraft((c) => ({ ...c, ...next }))}
                disabled={pending}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Create the legal employer first, then edit it to upload letterhead, stamp/seal, and authorized signature.
            </p>
          )}
        </FormDialogWide>
      </FormDialog>
    </Shell>
  );
}
