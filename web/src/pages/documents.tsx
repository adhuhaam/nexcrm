import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField, TextField } from "@/components/field";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson, uploadForm } from "@/lib/api";

type Employee = { id: string; legalName: string; companyName: string };
type StoredFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  label: string | null;
  createdAt: string;
};

type OcrResult = {
  scan: { id: string };
  ocr: { id: string };
  proposed: {
    passportNumber: string | null;
    legalName: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
    gender: string | null;
  };
  note: string;
};

export function DocumentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState("");
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [proposed, setProposed] = useState({
    passportNumber: "",
    legalName: "",
    nationality: "",
    dateOfBirth: "",
    gender: "",
  });

  useEffect(() => {
    getJson<{ employees: Employee[] }>("/api/v1/employees")
      .then((data) => {
        setEmployees(data.employees);
        if (data.employees[0]) setEmployeeId(data.employees[0].id);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load employees"));
  }, []);

  useEffect(() => {
    if (!employeeId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    getJson<{ files: StoredFile[] }>(`/api/v1/employees/${employeeId}/documents`)
      .then((data) => {
        if (!cancelled) setFiles(data.files);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load documents");
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  async function uploadDoc(fileList: FileList | null) {
    if (!fileList?.[0] || !employeeId) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", fileList[0]);
      form.append("kind", "employee_doc");
      form.append("entityType", "employee");
      form.append("entityId", employeeId);
      form.append("label", label || fileList[0].name);
      await uploadForm("/api/v1/files", form);
      toast.success("Document stored");
      setLabel("");
      const refreshed = await getJson<{ files: StoredFile[] }>(`/api/v1/employees/${employeeId}/documents`);
      setFiles(refreshed.files);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Upload failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function runPassportOcr(fileList: FileList | null) {
    if (!fileList?.[0] || !employeeId) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", fileList[0]);
      const result = await uploadForm<OcrResult>(`/api/v1/employees/${employeeId}/passport-ocr`, form);
      setOcr(result);
      setProposed({
        passportNumber: result.proposed.passportNumber ?? "",
        legalName: result.proposed.legalName ?? "",
        nationality: result.proposed.nationality ?? "",
        dateOfBirth: result.proposed.dateOfBirth ?? "",
        gender: result.proposed.gender ?? "",
      });
      toast.success("Passport scan stored — review proposed fields");
      const refreshed = await getJson<{ files: StoredFile[] }>(`/api/v1/employees/${employeeId}/documents`);
      setFiles(refreshed.files);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "OCR upload failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function applyOcr() {
    if (!employeeId) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/employees/${employeeId}/passport-ocr/apply`, "POST", proposed);
      toast.success("Reviewed passport fields applied");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not apply fields");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="NEXCRM · Documents"
      eyebrow="Operations"
      description="Employee document vault under Desktop/nexcrm-files. Passport scans and OCR JSON are stored; fields apply only after review."
    >
      <Banner message={error} error />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Employee vault</CardTitle>
            <CardDescription>Authenticated download only — no public file URLs.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SelectField id="employeeId" label="Employee" value={employeeId} onChange={setEmployeeId}>
              <option value="">Select employee</option>
              {employees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legalName} · {item.companyName}
                </option>
              ))}
            </SelectField>
            {!files && !error ? <PageSkeleton cards={1} /> : null}
            {files?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell>
                        <div className="font-medium">{file.label || file.originalName}</div>
                        <div className="text-xs text-muted-foreground">{file.originalName}</div>
                      </TableCell>
                      <TableCell className="text-sm">{file.kind}</TableCell>
                      <TableCell className="tabular-nums text-sm">{Math.round(file.sizeBytes / 1024)} KB</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/api/v1/files/${file.id}/download`}>Download</a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            {files && !files.length ? (
              <ShellEmpty
                icon={<FileIcon className="size-8 opacity-60" />}
                title="No files for this employee"
                description="Upload a document or passport scan to store it under the Desktop file root."
              />
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload document</CardTitle>
            </CardHeader>
            <CardContent>
              <WhenEditing>
                <div className="grid gap-3">
                  <TextField id="label" label="Label" value={label} onChange={setLabel} />
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">File</span>
                    <input
                      type="file"
                      disabled={pending || !employeeId}
                      onChange={(event) => void uploadDoc(event.target.files)}
                    />
                  </label>
                </div>
              </WhenEditing>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Passport OCR</CardTitle>
              <CardDescription>Stores original + OCR JSON. Blank proposed fields mean unread — do not invent data.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <WhenEditing>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Passport image or PDF</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={pending || !employeeId}
                    onChange={(event) => void runPassportOcr(event.target.files)}
                  />
                </label>
              </WhenEditing>
              {ocr ? (
                <div className="grid gap-2 rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">{ocr.note}</p>
                  <TextField id="ocrPassport" label="Passport number" value={proposed.passportNumber} onChange={(value) => setProposed((c) => ({ ...c, passportNumber: value }))} />
                  <TextField id="ocrName" label="Legal name" value={proposed.legalName} onChange={(value) => setProposed((c) => ({ ...c, legalName: value }))} />
                  <TextField id="ocrNat" label="Nationality" value={proposed.nationality} onChange={(value) => setProposed((c) => ({ ...c, nationality: value }))} />
                  <TextField id="ocrDob" label="Date of birth" value={proposed.dateOfBirth} onChange={(value) => setProposed((c) => ({ ...c, dateOfBirth: value }))} />
                  <TextField id="ocrGender" label="Gender" value={proposed.gender} onChange={(value) => setProposed((c) => ({ ...c, gender: value }))} />
                  <WhenEditing>
                    <Button type="button" disabled={pending} onClick={() => void applyOcr()}>
                      <UploadIcon />
                      Apply reviewed fields
                    </Button>
                  </WhenEditing>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
