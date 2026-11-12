import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/field";
import { Banner, Loading, Shell, WhenEditing } from "@/components/shell";
import { getJson, postJson } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";

type CompanyFields = {
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

type Editor = CompanyFields & { id: string | null };

type HrModel = {
  companies: { id: string; legalName: string }[];
  preferences: { defaultCompanyId: string | null; selectedCompanyId: string | null };
  editor: Editor;
  snapshots: {
    id: string;
    createdAt: string;
    snapshot: { legalName: string; phone: string | null; email: string | null; registeredAddress: string | null };
  }[];
  employees: { id: string; legalName: string; companyName: string }[];
  notice: string | null;
};

const blank: Editor = {
  id: null,
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

const fields: { key: keyof CompanyFields; label: string; hint?: string }[] = [
  { key: "legalName", label: "Legal name" },
  { key: "registrationNumber", label: "Registration number", hint: "Leave blank when it has not been verified." },
  { key: "registeredAddress", label: "Registered address" },
  { key: "country", label: "Country" },
  { key: "businessActivity", label: "Business activity" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "documentPrefix", label: "Document prefix" },
  { key: "signatoryName", label: "Authorized signatory" },
  { key: "signatoryTitle", label: "Signatory title" },
];

function text(value: string | null | undefined): string {
  return value ?? "";
}

function companyName(companies: { id: string; legalName: string }[], id: string | null): string {
  if (!id) return "Not set";
  return companies.find((company) => company.id === id)?.legalName ?? "Missing company";
}

function blockers(editor: Editor): string[] {
  const items: string[] = [];
  if (!editor.registrationNumber.trim()) items.push("Registration number is missing");
  if (!editor.signatoryName.trim()) items.push("Authorized signatory is missing");
  if (!editor.signatoryTitle.trim()) items.push("Signatory title is missing");
  return items;
}

export function HrPage() {
  const [model, setModel] = useState<HrModel | null>(null);
  const [editor, setEditor] = useState<Editor>(blank);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson<HrModel>(`/api/v1/hr${window.location.search}`)
      .then((data) => {
        if (cancelled) return;
        setModel(data);
        setEditor({
          id: data.editor.id,
          legalName: text(data.editor.legalName),
          registrationNumber: text(data.editor.registrationNumber),
          registeredAddress: text(data.editor.registeredAddress),
          country: text(data.editor.country),
          businessActivity: text(data.editor.businessActivity),
          phone: text(data.editor.phone),
          email: text(data.editor.email),
          documentPrefix: text(data.editor.documentPrefix),
          signatoryName: text(data.editor.signatoryName),
          signatoryTitle: text(data.editor.signatoryTitle),
        });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this page");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(action: string, body: Record<string, string>) {
    setPending(true);
    setError(null);
    try {
      await postJson(action, body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
      setPending(false);
    }
  }

  const missing = editor.id ? blockers(editor) : [];
  const values: Record<string, string> = {
    legalName: editor.legalName,
    registrationNumber: editor.registrationNumber,
    registeredAddress: editor.registeredAddress,
    country: editor.country,
    businessActivity: editor.businessActivity,
    phone: editor.phone,
    email: editor.email,
    documentPrefix: editor.documentPrefix,
    signatoryName: editor.signatoryName,
    signatoryTitle: editor.signatoryTitle,
  };

  return (
    <Shell title="JACMS HR">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">HR</h1>
        <p className="text-sm text-muted-foreground">
          Letters of appointment and company documents are created here. Work permits follow the Xpat work permit report. Sites, quota pools, and quota slots are in Projects.
        </p>
      </div>
      {model ? <Banner message={model.notice} /> : null}
      <Banner message={error} error />
      {!model && !error ? <Loading /> : null}
      {model ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Which company is used</CardTitle>
              <CardDescription>Changing the organization default does not switch the company open in the editor.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                Organization default: <strong>{companyName(model.companies, model.preferences.defaultCompanyId)}</strong>
              </p>
              <p>
                Selected for a new blank document: <strong>{companyName(model.companies, model.preferences.selectedCompanyId)}</strong>
              </p>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Companies</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1">
                {model.companies.map((company) => (
                  <a
                    key={company.id}
                    href={`/?company=${company.id}`}
                    className={`rounded-lg px-2 py-2 text-sm hover:bg-muted ${company.id === editor.id ? "bg-muted font-medium" : ""}`}
                  >
                    {company.legalName}
                  </a>
                ))}
                <WhenEditing>
                  <Button variant="outline" className="mt-2" asChild>
                    <a href="/?company=new">Add a company</a>
                  </Button>
                </WhenEditing>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{editor.id ? editor.legalName || "Company" : "New company"}</CardTitle>
              </CardHeader>
              <CardContent>
                {missing.length ? (
                  <AlertBlock items={missing} />
                ) : null}
                <WhenEditing>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit(editor.id ? `/companies/${editor.id}` : "/companies", values);
                  }}
                >
                  {fields.map((field) => (
                    <TextField
                      key={field.key}
                      id={field.key}
                      label={field.label}
                      hint={field.hint}
                      value={editor[field.key]}
                      onChange={(value) => setEditor((current) => ({ ...current, [field.key]: value }))}
                    />
                  ))}
                  <Button type="submit" disabled={pending}>
                    Save company
                  </Button>
                </form>
                {editor.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void submit("/preferences/default", { companyId: editor.id ?? "", returnTo: editor.id ?? "new" })}
                    >
                      Set as organization default
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void submit("/preferences/selected", { companyId: editor.id ?? "", returnTo: editor.id ?? "new" })}
                    >
                      Use for new documents
                    </Button>
                    <Button type="button" variant="outline" disabled={pending} onClick={() => void submit("/documents", { companyId: editor.id ?? "" })}>
                      Save HR document
                    </Button>
                  </div>
                ) : null}
                </WhenEditing>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Work permit holders</CardTitle>
              <CardDescription>The full record is the work permit: passport, occupation, permit dates, and the linked quota slot.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {model.employees.length ? (
                model.employees.map((employee) => (
                  <p key={employee.id}>
                    <a className="underline underline-offset-4" href={`/employees?edit=${employee.id}`}>
                      {employee.legalName}
                    </a>
                    <span className="text-muted-foreground"> · {employee.companyName}</span>
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">No work permits yet.</p>
              )}
              <Button variant="outline" className="mt-2 w-fit" asChild>
                <a href="/employees?new=1">New employee</a>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>HR documents</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {model.snapshots.length ? (
                model.snapshots.map((item) => (
                  <article key={item.id} className="border-t pt-4 first:border-0 first:pt-0">
                    <h3 className="font-medium">{item.snapshot.legalName}</h3>
                    <p className="text-sm">
                      {item.snapshot.phone ?? "No phone"} · {item.snapshot.email ?? "No email"}
                    </p>
                    <p className="text-sm">{item.snapshot.registeredAddress ?? "No address"}</p>
                    <p className="text-sm text-muted-foreground">
                      Saved {formatDateTime(item.createdAt)}. This copy stays as it was when saved.
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No saved copies yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </Shell>
  );
}

function AlertBlock({ items }: { items: string[] }) {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/12 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-50">
      <p className="font-medium">This company cannot issue a document yet.</p>
      <ul className="mt-2 list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-2 opacity-80">Letterhead artwork was not included with the handoff, so none is stored.</p>
    </div>
  );
}
