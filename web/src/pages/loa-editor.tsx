import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LoaDocument } from "@/components/loa-document";
import type { LetterSnapshot } from "@/components/loa-types";
import { AreaField, SelectField, TextField } from "@/components/field";
import { Banner, Loading, Shell, WhenEditing } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson, sendJson, uploadForm } from "@/lib/api";

type Company = {
  id: string;
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
  letterheadFileId?: string | null;
  sealFileId?: string | null;
  signatureFileId?: string | null;
};

type EmployeeOption = { id: string; legalName: string; passportNumber: string | null };

type EditorState = {
  companyId: string;
  employeeId: string;
  documentNumber: string;
  letterDate: string;
  signatoryName: string;
  signatoryTitle: string;
  letterheadAddress: string;
  phone: string;
  email: string;
  legalName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  permanentAddress: string;
  emergencyContact: string;
  occupation: string;
  workSite: string;
  siteCode: string;
  basicSalary: string;
  benefits: string;
  paidVacation: string;
  workingHours: string;
  contractDuration: string;
  employmentStatus: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function text(value: string | null | undefined): string {
  return value ?? "";
}

function buildSnapshot(state: EditorState, company: Company | null): LetterSnapshot {
  return {
    company: {
      companyId: company?.id ?? state.companyId,
      legalName: company?.legalName ?? "",
      registrationNumber: company?.registrationNumber ?? null,
      registeredAddress: company?.registeredAddress ?? null,
      country: company?.country ?? null,
      businessActivity: company?.businessActivity ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
      documentPrefix: company?.documentPrefix ?? null,
      signatoryName: company?.signatoryName ?? null,
      signatoryTitle: company?.signatoryTitle ?? null,
      letterheadFileId: company?.letterheadFileId ?? null,
      sealFileId: company?.sealFileId ?? null,
      signatureFileId: company?.signatureFileId ?? null,
    },
    employee: {
      id: state.employeeId || null,
      legalName: state.legalName,
      preferredName: null,
      passportNumber: state.passportNumber || null,
      nationality: state.nationality || null,
      dateOfBirth: state.dateOfBirth || null,
      gender: null,
      permanentAddress: state.permanentAddress || null,
      emergencyContact: state.emergencyContact || null,
      occupation: state.occupation || null,
      employmentStatus: state.employmentStatus || null,
    },
    terms: {
      workSite: state.workSite || null,
      siteCode: state.siteCode || null,
      basicSalary: state.basicSalary || null,
      benefits: state.benefits || null,
      paidVacation: state.paidVacation || null,
      workingHours: state.workingHours || null,
      contractDuration: state.contractDuration || null,
      employmentStatus: state.employmentStatus || null,
    },
    documentNumber: state.documentNumber || "Draft",
    letterDate: state.letterDate || today(),
    signatoryName: state.signatoryName || null,
    signatoryTitle: state.signatoryTitle || null,
    letterheadAddress: state.letterheadAddress || null,
    phone: state.phone || null,
    email: state.email || null,
    letterheadFileId: company?.letterheadFileId ?? null,
    sealFileId: company?.sealFileId ?? null,
    signatureFileId: company?.signatureFileId ?? null,
  };
}

export function LoaEditorPage({ id }: { id: string | null }) {
  const params = new URLSearchParams(window.location.search);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [archived, setArchived] = useState(false);
  const [letterStatus, setLetterStatus] = useState<"issued" | "signed_archived">("issued");
  const [signedFileId, setSignedFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (id) {
          const letter = await getJson<{
            id: string;
            snapshot: LetterSnapshot;
            documentNumber: string;
            letterDate: string;
            companyId: string;
            employeeId: string | null;
            status?: "issued" | "signed_archived";
            signedFileId?: string | null;
          }>(`/api/v1/letters/${id}`);
          if (cancelled) return;
          const snap = letter.snapshot;
          setArchived(true);
          setLetterStatus(letter.status === "signed_archived" ? "signed_archived" : "issued");
          setSignedFileId(letter.signedFileId ?? null);
          setCompany({
            id: snap.company.companyId,
            legalName: snap.company.legalName,
            registrationNumber: snap.company.registrationNumber,
            registeredAddress: snap.company.registeredAddress,
            country: snap.company.country,
            businessActivity: snap.company.businessActivity,
            phone: snap.company.phone,
            email: snap.company.email,
            documentPrefix: snap.company.documentPrefix,
            signatoryName: snap.company.signatoryName,
            signatoryTitle: snap.company.signatoryTitle,
          });
          setCompanies([]);
          setEmployees([]);
          setState({
            companyId: letter.companyId,
            employeeId: letter.employeeId ?? "",
            documentNumber: letter.documentNumber,
            letterDate: letter.letterDate,
            signatoryName: text(snap.signatoryName),
            signatoryTitle: text(snap.signatoryTitle),
            letterheadAddress: text(snap.letterheadAddress),
            phone: text(snap.phone),
            email: text(snap.email),
            legalName: text(snap.employee.legalName),
            passportNumber: text(snap.employee.passportNumber),
            nationality: text(snap.employee.nationality),
            dateOfBirth: text(snap.employee.dateOfBirth),
            permanentAddress: text(snap.employee.permanentAddress),
            emergencyContact: text(snap.employee.emergencyContact),
            occupation: text(snap.employee.occupation),
            workSite: text(snap.terms.workSite),
            siteCode: text(snap.terms.siteCode),
            basicSalary: text(snap.terms.basicSalary),
            benefits: text(snap.terms.benefits),
            paidVacation: text(snap.terms.paidVacation),
            workingHours: text(snap.terms.workingHours),
            contractDuration: text(snap.terms.contractDuration),
            employmentStatus: text(snap.terms.employmentStatus ?? snap.employee.employmentStatus),
          });
          return;
        }

        const employeeId = params.get("employeeId");
        const companyId = params.get("companyId");
        const query = new URLSearchParams();
        if (employeeId) query.set("employeeId", employeeId);
        if (companyId) query.set("companyId", companyId);
        const context = await getJson<{
          companies: Company[];
          company: Company | null;
          employees: EmployeeOption[];
          employee: {
            id: string;
            legalName: string;
            passportNumber: string | null;
            nationality: string | null;
            dateOfBirth: string | null;
            permanentAddress: string | null;
            emergencyContact: string | null;
            occupation: string | null;
            employmentStatus: string | null;
            workSite: string | null;
            siteCode: string | null;
            salary: string | null;
            benefits: string | null;
            paidVacation: string | null;
            workingHours: string | null;
            contractDuration: string | null;
          } | null;
          documentNumber: string | null;
        }>(`/api/v1/hr/editor-context?${query.toString()}`);
        if (cancelled) return;
        setCompanies(context.companies);
        setEmployees(context.employees);
        setCompany(context.company);
        const employee = context.employee;
        setState({
          companyId: context.company?.id ?? "",
          employeeId: employee?.id ?? "",
          documentNumber: context.documentNumber ?? "",
          letterDate: today(),
          signatoryName: text(context.company?.signatoryName),
          signatoryTitle: text(context.company?.signatoryTitle),
          letterheadAddress: text(context.company?.registeredAddress),
          phone: text(context.company?.phone),
          email: text(context.company?.email),
          legalName: text(employee?.legalName),
          passportNumber: text(employee?.passportNumber),
          nationality: text(employee?.nationality),
          dateOfBirth: text(employee?.dateOfBirth),
          permanentAddress: text(employee?.permanentAddress),
          emergencyContact: text(employee?.emergencyContact),
          occupation: text(employee?.occupation),
          workSite: text(employee?.workSite),
          siteCode: text(employee?.siteCode),
          basicSalary: text(employee?.salary),
          benefits: text(employee?.benefits),
          paidVacation: text(employee?.paidVacation),
          workingHours: text(employee?.workingHours),
          contractDuration: text(employee?.contractDuration),
          employmentStatus: text(employee?.employmentStatus),
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open LOA editor");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const snapshot = useMemo(() => (state ? buildSnapshot(state, company) : null), [state, company]);

  async function changeCompany(companyId: string) {
    if (!state) return;
    const context = await getJson<{
      companies: Company[];
      company: Company | null;
      employees: EmployeeOption[];
      documentNumber: string | null;
    }>(`/api/v1/hr/editor-context?companyId=${companyId}`);
    setCompanies(context.companies);
    setEmployees(context.employees);
    setCompany(context.company);
    setState({
      ...state,
      companyId,
      employeeId: "",
      documentNumber: context.documentNumber ?? "",
      signatoryName: text(context.company?.signatoryName),
      signatoryTitle: text(context.company?.signatoryTitle),
      letterheadAddress: text(context.company?.registeredAddress),
      phone: text(context.company?.phone),
      email: text(context.company?.email),
      legalName: "",
      passportNumber: "",
      nationality: "",
      dateOfBirth: "",
      permanentAddress: "",
      emergencyContact: "",
      occupation: "",
      workSite: "",
      siteCode: "",
      basicSalary: "",
      benefits: "",
      paidVacation: "",
      workingHours: "",
      contractDuration: "",
      employmentStatus: "",
    });
  }

  async function changeEmployee(employeeId: string) {
    if (!state) return;
    if (!employeeId) {
      setState({ ...state, employeeId: "" });
      return;
    }
    const data = await getJson<{ employee: Record<string, string | null> }>(`/api/v1/employees/${employeeId}`);
    const employee = data.employee;
    setState({
      ...state,
      employeeId,
      legalName: text(employee.legalName),
      passportNumber: text(employee.passportNumber),
      nationality: text(employee.nationality),
      dateOfBirth: text(employee.dateOfBirth),
      permanentAddress: text(employee.permanentAddress),
      emergencyContact: text(employee.emergencyContact),
      occupation: text(employee.occupation),
      workSite: text(employee.workSite),
      siteCode: text(employee.siteCode),
      basicSalary: text(employee.salary),
      benefits: text(employee.benefits),
      paidVacation: text(employee.paidVacation),
      workingHours: text(employee.workingHours),
      contractDuration: text(employee.contractDuration),
      employmentStatus: text(employee.employmentStatus),
    });
  }

  async function save() {
    if (!state) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await sendJson<{ id: string }>("/api/v1/letters", "POST", {
        companyId: state.companyId,
        employeeId: state.employeeId,
        letterDate: state.letterDate,
        documentNumber: state.documentNumber,
        signatoryName: state.signatoryName,
        signatoryTitle: state.signatoryTitle,
        letterheadAddress: state.letterheadAddress,
        phone: state.phone,
        email: state.email,
        legalName: state.legalName,
        passportNumber: state.passportNumber,
        nationality: state.nationality,
        dateOfBirth: state.dateOfBirth,
        permanentAddress: state.permanentAddress,
        emergencyContact: state.emergencyContact,
        occupation: state.occupation,
        workSite: state.workSite,
        siteCode: state.siteCode,
        basicSalary: state.basicSalary,
        benefits: state.benefits,
        paidVacation: state.paidVacation,
        workingHours: state.workingHours,
        contractDuration: state.contractDuration,
        employmentStatus: state.employmentStatus,
      });
      toast.success("LOA saved to archive");
      window.location.assign(`/loas/${saved.id}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save LOA";
      setError(message);
      toast.error(message);
      setPending(false);
    }
  }

  async function uploadSigned(fileList: FileList | null) {
    if (!id || !fileList?.[0]) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", fileList[0]);
      const result = await uploadForm<{ status: "signed_archived"; file: { id: string } }>(
        `/api/v1/letters/${id}/signed-copy`,
        form,
      );
      setLetterStatus("signed_archived");
      setSignedFileId(result.file.id);
      setNotice("Signed copy stored. The issued LOA snapshot is unchanged.");
      toast.success("Signed LOA archived");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not upload signed copy";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title={archived ? "JACMS · Saved LOA" : "JACMS · LOA editor"}
      eyebrow="Letter of Appointment"
      description={
        archived
          ? "This is an archived snapshot. Company or employee edits made later do not change this letter. You can still upload a signed copy."
          : "Select a company and employee, edit terms, preview on A4, then save or print."
      }
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print / Save PDF
          </Button>
          {!archived ? (
            <WhenEditing>
              <Button type="button" disabled={pending || !state} onClick={() => void save()}>
                Save LOA
              </Button>
            </WhenEditing>
          ) : (
            <Button variant="outline" asChild>
              <a href="/loas/new">New LOA</a>
            </Button>
          )}
        </>
      }
    >
      <Banner message={error} error />
      <Banner message={notice} />
      {!state && !error ? <Loading /> : null}
      {state && snapshot ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {!archived ? (
            <Card className="print:hidden h-fit">
              <CardHeader>
                <CardTitle>Letter details</CardTitle>
                <CardDescription>Changes update the live preview instantly.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <SelectField id="companyId" label="Company" value={state.companyId} onChange={(value) => void changeCompany(value)}>
                  <option value="">Select company</option>
                  {companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legalName}
                    </option>
                  ))}
                </SelectField>
                <SelectField id="employeeId" label="Employee" value={state.employeeId} onChange={(value) => void changeEmployee(value)}>
                  <option value="">New employee / enter details</option>
                  {employees.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legalName}
                      {item.passportNumber ? ` · ${item.passportNumber}` : ""}
                    </option>
                  ))}
                </SelectField>
                <TextField id="documentNumber" label="Document number" value={state.documentNumber} onChange={(value) => setState({ ...state, documentNumber: value })} />
                <TextField id="letterDate" label="Letter date" type="date" value={state.letterDate} onChange={(value) => setState({ ...state, letterDate: value })} />
                <TextField id="signatoryName" label="Signatory" value={state.signatoryName} onChange={(value) => setState({ ...state, signatoryName: value })} />
                <TextField id="signatoryTitle" label="Signatory title" value={state.signatoryTitle} onChange={(value) => setState({ ...state, signatoryTitle: value })} />
                <AreaField id="letterheadAddress" label="Letterhead address" value={state.letterheadAddress} onChange={(value) => setState({ ...state, letterheadAddress: value })} />
                <TextField id="phone" label="Phone" value={state.phone} onChange={(value) => setState({ ...state, phone: value })} />
                <TextField id="email" label="Email" value={state.email} onChange={(value) => setState({ ...state, email: value })} />
                <TextField id="legalName" label="Full name" value={state.legalName} onChange={(value) => setState({ ...state, legalName: value })} />
                <TextField id="passportNumber" label="Passport number" value={state.passportNumber} onChange={(value) => setState({ ...state, passportNumber: value })} />
                <TextField id="nationality" label="Nationality" value={state.nationality} onChange={(value) => setState({ ...state, nationality: value })} />
                <TextField id="dateOfBirth" label="Date of birth" type="date" value={state.dateOfBirth} onChange={(value) => setState({ ...state, dateOfBirth: value })} />
                <AreaField id="permanentAddress" label="Permanent address" value={state.permanentAddress} onChange={(value) => setState({ ...state, permanentAddress: value })} />
                <AreaField id="emergencyContact" label="Emergency contact" value={state.emergencyContact} onChange={(value) => setState({ ...state, emergencyContact: value })} />
                <TextField id="occupation" label="Position" value={state.occupation} onChange={(value) => setState({ ...state, occupation: value })} />
                <TextField id="workSite" label="Work site" value={state.workSite} onChange={(value) => setState({ ...state, workSite: value })} />
                <TextField id="siteCode" label="Site ID" value={state.siteCode} onChange={(value) => setState({ ...state, siteCode: value })} />
                <TextField id="basicSalary" label="Basic salary" value={state.basicSalary} onChange={(value) => setState({ ...state, basicSalary: value })} />
                <TextField id="benefits" label="Benefits" value={state.benefits} onChange={(value) => setState({ ...state, benefits: value })} />
                <TextField id="paidVacation" label="Paid vacation" value={state.paidVacation} onChange={(value) => setState({ ...state, paidVacation: value })} />
                <TextField id="workingHours" label="Working hours and weekly rest" value={state.workingHours} onChange={(value) => setState({ ...state, workingHours: value })} />
                <TextField id="contractDuration" label="Contract duration" value={state.contractDuration} onChange={(value) => setState({ ...state, contractDuration: value })} />
                <TextField id="employmentStatus" label="Employment status" value={state.employmentStatus} onChange={(value) => setState({ ...state, employmentStatus: value })} />
              </CardContent>
            </Card>
          ) : (
            <Card className="print:hidden h-fit">
              <CardHeader>
                <CardTitle>Signed copy</CardTitle>
                <CardDescription>
                  Status: {letterStatus === "signed_archived" ? "Signed archived" : "Issued"}. Upload does not alter the issued snapshot.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {signedFileId ? (
                  <Button variant="outline" asChild>
                    <a href={`/api/v1/files/${signedFileId}/download`}>Download signed file</a>
                  </Button>
                ) : null}
                <WhenEditing>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Upload signed PDF or image</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      disabled={pending}
                      onChange={(event) => void uploadSigned(event.target.files)}
                    />
                  </label>
                </WhenEditing>
              </CardContent>
            </Card>
          )}
          <div className="loa-preview-pane">
            <p className="mb-3 text-sm text-muted-foreground print:hidden">Live preview · A4 portrait</p>
            <LoaDocument snapshot={snapshot} />
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
