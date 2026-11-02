import { useEffect, useState } from "react";
import { toast } from "sonner";
import { IdCardIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField, TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";

type Permit = {
  id: string;
  companyId: string;
  legalName: string;
  workPermitNumber: string | null;
  nationality: string | null;
  country: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  occupation: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  feePaidUntil: string | null;
  medicalExpiry: string | null;
  insuranceExpiry: string | null;
  origin: string | null;
  salary: string | null;
  arrivalDate: string | null;
  workVisaNumber: string | null;
  workVisaExpiry: string | null;
  contractExpiry: string | null;
  quotaPoolNumber: string | null;
  quotaPoolName: string | null;
  linkedSites: string | null;
  linkedSlot: string | null;
  linkedSlotExpiry: string | null;
};

type Draft = Omit<Permit, "id" | "quotaPoolNumber" | "quotaPoolName" | "linkedSites" | "linkedSlot" | "linkedSlotExpiry">;

const textFields: { key: keyof Draft; label: string; type?: string }[] = [
  { key: "workPermitNumber", label: "Work permit number" },
  { key: "legalName", label: "Work permit holder name" },
  { key: "nationality", label: "Nationality" },
  { key: "country", label: "Country" },
  { key: "gender", label: "Gender" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "passportNumber", label: "Passport number" },
  { key: "passportExpiry", label: "Passport expiry", type: "date" },
  { key: "occupation", label: "Occupation" },
  { key: "issuedOn", label: "Work permit issued date", type: "date" },
  { key: "expiresOn", label: "Work permit expiry date", type: "date" },
  { key: "feePaidUntil", label: "Fee paid until", type: "date" },
  { key: "medicalExpiry", label: "Medical expiry", type: "date" },
  { key: "insuranceExpiry", label: "Insurance expiry", type: "date" },
  { key: "origin", label: "Origin" },
  { key: "salary", label: "Salary" },
  { key: "arrivalDate", label: "Arrival date", type: "date" },
  { key: "workVisaNumber", label: "Work visa number" },
  { key: "workVisaExpiry", label: "Work visa expiry", type: "date" },
  { key: "contractExpiry", label: "Contract expiry", type: "date" },
];

function emptyDraft(companyId: string): Draft {
  return {
    companyId,
    legalName: "",
    workPermitNumber: "",
    nationality: "",
    country: "",
    gender: "",
    dateOfBirth: "",
    passportNumber: "",
    passportExpiry: "",
    occupation: "",
    issuedOn: "",
    expiresOn: "",
    feePaidUntil: "",
    medicalExpiry: "",
    insuranceExpiry: "",
    origin: "",
    salary: "",
    arrivalDate: "",
    workVisaNumber: "",
    workVisaExpiry: "",
    contractExpiry: "",
  };
}

function fromPermit(permit: Permit): Draft {
  const draft = emptyDraft(permit.companyId);
  for (const field of textFields) {
    draft[field.key] = permit[field.key] ?? "";
  }
  draft.companyId = permit.companyId;
  draft.legalName = permit.legalName;
  return draft;
}

export function WorkPermitList() {
  const [rows, setRows] = useState<Permit[] | null>(null);
  const [companies, setCompanies] = useState<{ id: string; legalName: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);

  function reload() {
    getJson<{ workPermits: Permit[] }>("/api/v1/work-permits")
      .then((data) => setRows(data.workPermits))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load work permits"));
  }

  useEffect(() => {
    reload();
    getJson<{ companies: { id: string; legalName: string }[]; preferences: { defaultCompanyId: string | null; selectedCompanyId: string | null } }>(
      "/api/v1/companies?kind=employer",
    ).then((data) => {
      setCompanies(data.companies);
      const companyId = data.preferences.selectedCompanyId ?? data.preferences.defaultCompanyId ?? data.companies[0]?.id ?? "";
      setDraft(emptyDraft(companyId));
    });
  }, []);

  async function openCreate() {
    const companyId = companies[0]?.id ?? "";
    setEditId(null);
    setDraft(emptyDraft(companyId));
    setOpen(true);
  }

  async function openEdit(id: string) {
    try {
      const permit = await getJson<Permit>(`/api/v1/work-permits/${id}`);
      setEditId(id);
      setDraft(fromPermit(permit));
      setOpen(true);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not open work permit");
    }
  }

  async function save() {
    if (!draft) return;
    setPending(true);
    try {
      const body: Record<string, string> = {};
      for (const [key, value] of Object.entries(draft)) body[key] = value ?? "";
      await sendJson(editId ? `/work-permits/${editId}` : "/work-permits", "POST", body);
      toast.success(editId ? "Work permit updated" : "Work permit created");
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
      title="NEXCRM · Work permits"
      eyebrow="Operations"
      description="Xpat-style work permit records. Add and edit in a dialog."
      actions={
        <WhenEditing>
          <Button type="button" onClick={() => void openCreate()}>
            <PlusIcon />
            Add work permit
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>Work permits</CardTitle>
          <CardDescription>Click a row to edit holder, passport and permit dates.</CardDescription>
        </CardHeader>
        <CardContent>
          {!rows && !error ? <PageSkeleton cards={1} /> : null}
          {rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Passport</TableHead>
                  <TableHead>Occupation</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => void openEdit(row.id)}>
                    <TableCell className="font-mono text-xs">{row.workPermitNumber ?? "—"}</TableCell>
                    <TableCell className="font-medium">{row.legalName}</TableCell>
                    <TableCell className="font-mono text-xs">{row.passportNumber ?? "—"}</TableCell>
                    <TableCell>{row.occupation ?? "—"}</TableCell>
                    <TableCell>{row.expiresOn ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {rows && !rows.length ? (
            <ShellEmpty
              icon={<IdCardIcon className="size-8 opacity-60" />}
              title="No work permits yet"
              description="Add a work permit holder record to track passport and permit dates."
              action={
                <WhenEditing>
                  <Button type="button" onClick={() => void openCreate()}>
                    Add work permit
                  </Button>
                </WhenEditing>
              }
            />
          ) : null}
        </CardContent>
      </Card>

      <FormDialog
        open={open && !!draft}
        onOpenChange={setOpen}
        title={editId ? draft?.legalName || "Edit work permit" : "Add work permit"}
        description="Leave a field blank when it has not been verified."
        pending={pending}
        submitLabel={editId ? "Save changes" : "Create work permit"}
        onSubmit={save}
        size="xl"
      >
        {draft ? (
          <>
            <SelectField id="companyId" label="Employer" value={draft.companyId} onChange={(value) => setDraft({ ...draft, companyId: value })}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.legalName}
                </option>
              ))}
            </SelectField>
            {textFields.map((field) => (
              <TextField
                key={field.key}
                id={field.key}
                label={field.label}
                type={field.type}
                value={draft[field.key] ?? ""}
                onChange={(value) => setDraft({ ...draft, [field.key]: value })}
              />
            ))}
          </>
        ) : null}
      </FormDialog>
    </Shell>
  );
}

export function WorkPermitForm({ id }: { id: string | null }) {
  useEffect(() => {
    window.location.replace(id ? `/work-permits?edit=${id}` : "/work-permits?new=1");
  }, [id]);
  return null;
}
