import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BedDoubleIcon,
  BriefcaseIcon,
  Building2Icon,
  CameraIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  FileImageIcon,
  HomeIcon,
  IdCardIcon,
  InfoIcon,
  LightbulbIcon,
  MapPinIcon,
  ScanLineIcon,
  SettingsIcon,
  SkipForwardIcon,
  SparklesIcon,
  UserCheckIcon,
  UserPlusIcon,
  WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignationField } from "@/components/designation-field";
import { SelectField, TextField } from "@/components/field";
import { Banner, Shell, WhenEditing } from "@/components/shell";
import { Spinner } from "@/components/ux";
import { getJson, sendJson, uploadForm } from "@/lib/api";
import { cn } from "@/lib/utils";

type Company = { id: string; legalName: string };
type House = { id: string; name: string; occupied: number; capacity: number; dailyRate: string };
type Option = { id: string; name: string; projectId?: string; siteId?: string };
type Slot = { id: string; slotNumber: number | null; status: string; poolId: string };

type Person = {
  legalName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  passportExpiry: string;
  passportIssueDate: string;
  occupation: string;
};

const blankPerson: Person = {
  legalName: "",
  passportNumber: "",
  nationality: "",
  dateOfBirth: "",
  gender: "",
  passportExpiry: "",
  passportIssueDate: "",
  occupation: "",
};

const STEPS = [
  {
    id: 1,
    label: "Scan",
    short: "Passport",
    icon: ScanLineIcon,
    tip: "Upload a clear passport photo. OCR fills identity fields automatically when available.",
  },
  {
    id: 2,
    label: "Review",
    short: "Identity",
    icon: IdCardIcon,
    tip: "Check every field against the passport. Leave unread values blank — do not invent data.",
  },
  {
    id: 3,
    label: "Place",
    short: "Project",
    icon: BriefcaseIcon,
    tip: "Pick legal employer → project → site → quota pool → open slot. That is how every worker is placed.",
  },
  {
    id: 4,
    label: "Allocate",
    short: "Client",
    icon: ArrowRightIcon,
    tip: "Optional. Second the worker to a client with staff salary and bill rate for payroll.",
  },
  {
    id: 5,
    label: "Housing",
    short: "Stay",
    icon: BedDoubleIcon,
    tip: "Optional. Check the worker into agency accommodation. Unallocated stay days can be charged later.",
  },
] as const;

function StepHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border/80 bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
      <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function StepNav({
  step,
  onJump,
}: {
  step: number;
  onJump: (n: number) => void;
}) {
  return (
    <nav aria-label="Onboarding steps" className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-stretch gap-1 sm:gap-2">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const done = item.id < step;
          const active = item.id === step;
          const reachable = item.id <= step;
          return (
            <li key={item.id} className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(item.id)}
                className={cn(
                  "flex min-w-[4.5rem] flex-col items-center gap-1 rounded-lg px-2 py-2 text-center sm:min-w-[5.5rem] sm:px-3",
                  active && "bg-primary text-primary-foreground shadow-sm",
                  done && !active && "bg-muted text-foreground hover:bg-muted/80",
                  !reachable && "cursor-not-allowed text-muted-foreground/50",
                  reachable && !active && !done && "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border",
                    active && "border-primary-foreground/40 bg-primary-foreground/15",
                    done && !active && "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
                    !active && !done && "border-border bg-background/60",
                  )}
                >
                  {done && !active ? <CheckCircle2Icon className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className="text-[11px] font-medium leading-tight sm:text-xs">{item.label}</span>
                <span className={cn("hidden text-[10px] sm:block", active ? "opacity-80" : "opacity-60")}>
                  {item.short}
                </span>
              </button>
              {index < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "mb-5 hidden h-px w-3 shrink-0 sm:block sm:w-5",
                    item.id < step ? "bg-emerald-600/50" : "bg-border",
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepActions({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextIcon,
  pending,
  disableNext,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextIcon?: ReactNode;
  pending?: boolean;
  disableNext?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4 sm:col-span-2">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      ) : null}
      {onNext ? (
        <Button type="button" onClick={onNext} disabled={pending || disableNext} className="ml-auto sm:ml-0">
          {pending ? <Spinner /> : nextIcon}
          {nextLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function EmployeeOnboardPage() {
  const params = new URLSearchParams(window.location.search);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [scanFileId, setScanFileId] = useState<string | null>(null);
  const [person, setPerson] = useState<Person>(blankPerson);
  const [employers, setEmployers] = useState<Company[]>([]);
  const [clients, setClients] = useState<Company[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [companyId, setCompanyId] = useState(params.get("companyId") ?? "");
  const [projects, setProjects] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [pools, setPools] = useState<Option[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [quotaPoolId, setQuotaPoolId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [allocate, setAllocate] = useState(false);
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [designation, setDesignation] = useState("");
  const [staffSalary, setStaffSalary] = useState("");
  const [billRate, setBillRate] = useState("");
  const [houseStay, setHouseStay] = useState(false);
  const [accommodationId, setAccommodationId] = useState("");
  const [checkIn, setCheckIn] = useState(new Date().toISOString().slice(0, 10));
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null);
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");

  const current = STEPS[step - 1]!;

  useEffect(() => {
    getJson<{
      employers: Company[];
      clients: Company[];
      accommodations: House[];
      openai?: { openaiConfigured: boolean; openaiModel: string };
    }>("/api/v1/onboard/options")
      .then((data) => {
        setEmployers(data.employers);
        setClients(data.clients);
        setHouses(data.accommodations);
        setOpenaiConfigured(data.openai?.openaiConfigured ?? false);
        setOpenaiModel(data.openai?.openaiModel ?? "gpt-4o-mini");
        if (!companyId && data.employers[0]) setCompanyId(data.employers[0].id);
        if (data.clients[0]) setClientCompanyId(data.clients[0].id);
        if (data.accommodations[0]) setAccommodationId(data.accommodations[0].id);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load options"));
  }, []);

  useEffect(() => {
    if (!companyId) {
      setProjects([]);
      return;
    }
    getJson<{ projects: Option[]; sites: Option[]; quotaPools: Option[] }>(`/api/v1/employees/options?companyId=${companyId}`)
      .then((data) => {
        setProjects(data.projects);
        setSites(data.sites);
        setPools(data.quotaPools);
      })
      .catch(() => {
        setProjects([]);
        setSites([]);
        setPools([]);
      });
  }, [companyId]);

  useEffect(() => {
    if (!projectId) {
      setSlots([]);
      return;
    }
    getJson<{ slots: Slot[] }>(`/api/v1/projects/${projectId}`)
      .then((data) => setSlots((data.slots ?? []).filter((slot) => slot.status === "open")))
      .catch(() => setSlots([]));
  }, [projectId]);

  const filteredSites = useMemo(
    () => sites.filter((site) => !projectId || site.projectId === projectId),
    [sites, projectId],
  );
  const filteredPools = useMemo(
    () => pools.filter((pool) => !siteId || pool.siteId === siteId),
    [pools, siteId],
  );
  const filteredSlots = useMemo(
    () => slots.filter((slot) => !quotaPoolId || slot.poolId === quotaPoolId),
    [slots, quotaPoolId],
  );

  async function scan(fileList: FileList | null) {
    if (!fileList?.[0]) return;
    const file = fileList[0];
    setFileName(file.name);
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await uploadForm<{
        proposed: Record<string, string | null>;
        scanFileId: string;
      }>("/api/v1/employees/onboard/scan", form);
      setScanFileId(result.scanFileId);
      setPerson({
        legalName: result.proposed.legalName ?? "",
        passportNumber: result.proposed.passportNumber ?? "",
        nationality: result.proposed.nationality ?? "",
        dateOfBirth: result.proposed.dateOfBirth ?? "",
        gender: result.proposed.gender ?? "",
        passportExpiry: result.proposed.passportExpiry ?? "",
        passportIssueDate: result.proposed.passportIssueDate ?? "",
        occupation: "",
      });
      toast.success("Passport scanned — review fields");
      setStep(2);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "OCR failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function commit() {
    if (!companyId) {
      toast.error("Select an employer company");
      return;
    }
    if (!person.legalName.trim()) {
      toast.error("Legal name is required");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await sendJson<{ employee: { id: string; companyId: string } }>("/api/v1/employees/onboard", "POST", {
        person,
        companyId,
        projectId: projectId || null,
        siteId: siteId || null,
        quotaPoolId: quotaPoolId || null,
        slotId: slotId || null,
        scanFileId,
        clientAllocation: allocate
          ? { clientCompanyId, joinDate, designation, staffSalary, billRate, currency: "MVR" }
          : null,
        accommodationStay: houseStay ? { accommodationId, checkIn, notes: null } : null,
      });
      toast.success("Employee onboarded");
      window.location.assign(`/companies/${created.employee.companyId}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Onboard failed";
      setError(message);
      toast.error(message);
      setPending(false);
    }
  }

  return (
    <Shell
      title="JACMS · Onboard employee"
      eyebrow="Process"
      description="Five short steps: scan the passport, confirm identity, place on a project, then optionally allocate to a client and housing."
      actions={
        <Button variant="outline" asChild>
          <a href="/employees">
            <ArrowLeftIcon className="size-4" />
            Back to list
          </a>
        </Button>
      }
    >
      <Banner message={error} error />

      <div className="grid gap-4">
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserPlusIcon className="size-5" />
            </div>
            <div className="grid gap-1 text-sm">
              <p className="font-medium text-foreground">How this wizard works</p>
              <p className="text-muted-foreground leading-relaxed">
                Work top to bottom. Steps 4 and 5 are optional — skip them if the worker is not seconded or housed yet.
                You can jump back to finished steps using the tracker below.
              </p>
            </div>
          </CardContent>
        </Card>

        <StepNav step={step} onJump={setStep} />

        <StepHint>{current.tip}</StepHint>

        {step === 1 ? (
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CameraIcon className="size-5" />
                </span>
                <div>
                  <CardTitle>1 · Passport photo</CardTitle>
                  <CardDescription className="mt-1">
                    Prefer a flat, well-lit photo of the biodata page. Avoid glare and cropped corners.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                {[
                  { icon: FileImageIcon, text: "JPG or PNG works best" },
                  { icon: SparklesIcon, text: `ChatGPT Vision (${openaiModel}) reads the biodata page` },
                  { icon: CircleHelpIcon, text: "No photo? Skip and type manually" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-2 rounded-md bg-muted/35 px-3 py-2">
                    <item.icon className="mt-0.5 size-4 shrink-0 text-foreground/70" />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>

              {openaiConfigured === false ? (
                <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <SettingsIcon className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <span>
                      OpenAI API key is not set. Add it in System settings so passport OCR can run, or enter details
                      manually.
                    </span>
                  </div>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href="/settings">Open settings</a>
                  </Button>
                </div>
              ) : openaiConfigured ? (
                <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                  <SparklesIcon className="size-4 shrink-0" />
                  ChatGPT OCR is configured — drop a passport image to extract fields.
                </div>
              ) : null}

              <WhenEditing>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={pending}
                  onChange={(event) => void scan(event.target.files)}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    void scan(event.dataTransfer.files);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center",
                    dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
                    pending && "pointer-events-none opacity-70",
                  )}
                >
                  {pending ? (
                    <>
                      <Spinner />
                      <div>
                        <p className="font-medium text-foreground">Scanning passport…</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {fileName ? `Reading ${fileName}` : "This usually takes a few seconds"}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex size-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
                        <CameraIcon className="size-6 text-primary" />
                      </span>
                      <div>
                        <p className="font-medium text-foreground">Drop passport image here, or tap to browse</p>
                        <p className="mt-1 text-sm text-muted-foreground">Clear biodata page · phone camera is fine</p>
                      </div>
                    </>
                  )}
                </button>
              </WhenEditing>

              <div className="flex flex-wrap items-center gap-2">
                <InfoIcon className="size-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  API key lives in <a className="underline underline-offset-2" href="/settings">System settings</a>
                  {" "}(admin) or <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> in .env as fallback.
                </p>
              </div>

              <Button type="button" variant="outline" disabled={pending} onClick={() => setStep(2)}>
                <SkipForwardIcon className="size-4" />
                Skip scan — enter manually
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <IdCardIcon className="size-5" />
                </span>
                <div>
                  <CardTitle>2 · Review identity</CardTitle>
                  <CardDescription className="mt-1">
                    Confirm OCR results against the passport. Legal name is required to continue.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
                <InfoIcon className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  Blank fields were unread by OCR. Fill only what you can verify from the document — do not guess.
                </span>
              </div>
              {(
                [
                  ["legalName", "Legal name"],
                  ["passportNumber", "Passport number"],
                  ["nationality", "Nationality"],
                  ["dateOfBirth", "Date of birth", "date"],
                  ["gender", "Gender"],
                  ["passportIssueDate", "Passport issue date", "date"],
                  ["passportExpiry", "Passport expiry", "date"],
                  ["occupation", "Position"],
                ] as const
              ).map(([key, label, type]) => (
                <TextField
                  key={key}
                  id={key}
                  label={label}
                  type={type ?? "text"}
                  value={person[key]}
                  onChange={(value) => setPerson((c) => ({ ...c, [key]: value }))}
                />
              ))}
              <StepActions
                onBack={() => setStep(1)}
                onNext={() => {
                  if (!person.legalName.trim()) {
                    toast.error("Legal name is required");
                    return;
                  }
                  setStep(3);
                }}
                nextIcon={<ArrowRightIcon className="size-4" />}
              />
            </CardContent>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2Icon className="size-5" />
                </span>
                <div>
                  <CardTitle>3 · Place on company / project</CardTitle>
                  <CardDescription className="mt-1">
                    Employer is required. Project, site, pool, and slot can be set now or left empty.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <ol className="grid gap-2 text-sm text-muted-foreground sm:col-span-2 sm:grid-cols-4">
                {[
                  { icon: Building2Icon, label: "1. Legal employer" },
                  { icon: BriefcaseIcon, label: "2. Project" },
                  { icon: MapPinIcon, label: "3. Site / pool" },
                  { icon: UserCheckIcon, label: "4. Slot" },
                ].map((item) => (
                  <li key={item.label} className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
                    <item.icon className="size-4 shrink-0 text-foreground/70" />
                    {item.label}
                  </li>
                ))}
              </ol>
              <SelectField
                id="companyId"
                label="Legal employer"
                value={companyId}
                onChange={(value) => {
                  setCompanyId(value);
                  setProjectId("");
                  setSiteId("");
                  setQuotaPoolId("");
                  setSlotId("");
                }}
              >
                <option value="">Select legal employer</option>
                {employers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.legalName}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="projectId"
                label="Project"
                value={projectId}
                onChange={(value) => {
                  setProjectId(value);
                  setSiteId("");
                  setQuotaPoolId("");
                  setSlotId("");
                }}
              >
                <option value="">None</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="siteId"
                label="Site"
                value={siteId}
                onChange={(value) => {
                  setSiteId(value);
                  setQuotaPoolId("");
                  setSlotId("");
                }}
              >
                <option value="">None</option>
                {filteredSites.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="quotaPoolId"
                label="Quota pool"
                value={quotaPoolId}
                onChange={(value) => {
                  setQuotaPoolId(value);
                  setSlotId("");
                }}
              >
                <option value="">None</option>
                {filteredPools.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              <SelectField id="slotId" label="Open slot" value={slotId} onChange={setSlotId}>
                <option value="">Auto / none</option>
                {filteredSlots.map((item) => (
                  <option key={item.id} value={item.id}>
                    Slot {item.slotNumber ?? "—"}
                  </option>
                ))}
              </SelectField>
              <StepActions
                onBack={() => setStep(2)}
                onNext={() => {
                  if (!companyId) {
                    toast.error("Select an employer company");
                    return;
                  }
                  setStep(4);
                }}
                nextIcon={<ArrowRightIcon className="size-4" />}
              />
            </CardContent>
          </Card>
        ) : null}

        {step === 4 ? (
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <WalletIcon className="size-5" />
                </span>
                <div>
                  <CardTitle>4 · Client allocation (optional)</CardTitle>
                  <CardDescription className="mt-1">
                    Use this when the worker is seconded to a client. Skip if they stay on the employer only.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 px-3 py-3 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={allocate}
                  onChange={(event) => setAllocate(event.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <ArrowRightIcon className="size-4" />
                    Allocate to a client now
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    Creates an immutable allocation with staff salary (paid to worker) and bill rate (charged to client).
                  </span>
                </span>
              </label>
              {allocate ? (
                <>
                  <SelectField id="clientCompanyId" label="Client" value={clientCompanyId} onChange={setClientCompanyId}>
                    {clients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.legalName}
                      </option>
                    ))}
                  </SelectField>
                  <TextField id="joinDate" label="Join date" type="date" value={joinDate} onChange={setJoinDate} />
                  <DesignationField
                    id="designation"
                    value={designation}
                    onChange={(value) => {
                      setDesignation(value);
                      if (!clientCompanyId || !value.trim()) return;
                      void getJson<{ rates: { designation: string; staffMonthRate: string; billMonthRate: string }[] }>(
                        `/api/v1/clients/${clientCompanyId}/rates`,
                      )
                        .then((data) => {
                          const match = data.rates.find(
                            (rate) => rate.designation.trim().toLowerCase() === value.trim().toLowerCase(),
                          );
                          if (match) {
                            setStaffSalary(match.staffMonthRate);
                            setBillRate(match.billMonthRate);
                          }
                        })
                        .catch(() => undefined);
                    }}
                  />
                  <TextField id="staffSalary" label="Staff monthly salary" value={staffSalary} onChange={setStaffSalary} />
                  <TextField id="billRate" label="Client monthly bill" value={billRate} onChange={setBillRate} />
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                  <SkipForwardIcon className="size-4" />
                  Leaving this off is fine — you can allocate later from Allocations.
                </p>
              )}
              <StepActions
                onBack={() => setStep(3)}
                onNext={() => setStep(5)}
                nextLabel={allocate ? "Continue" : "Skip allocation"}
                nextIcon={<ArrowRightIcon className="size-4" />}
              />
            </CardContent>
          </Card>
        ) : null}

        {step === 5 ? (
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <HomeIcon className="size-5" />
                </span>
                <div>
                  <CardTitle>5 · Accommodation (optional)</CardTitle>
                  <CardDescription className="mt-1">
                    Check the worker into agency housing. Occupancy and daily rate show beside each house.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 px-3 py-3 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={houseStay}
                  onChange={(event) => setHouseStay(event.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <BedDoubleIcon className="size-4" />
                    Check into accommodation
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    Stay days without a client allocation can be reviewed later under Accommodations for charge-back.
                  </span>
                </span>
              </label>
              {houseStay ? (
                <>
                  <SelectField id="accommodationId" label="House" value={accommodationId} onChange={setAccommodationId}>
                    {houses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.occupied}/{item.capacity}) · {item.dailyRate}/day
                      </option>
                    ))}
                  </SelectField>
                  <TextField id="checkIn" label="Check-in" type="date" value={checkIn} onChange={setCheckIn} />
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                  <SkipForwardIcon className="size-4" />
                  No housing needed — finish without a stay.
                </p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setStep(4)} disabled={pending}>
                  <ArrowLeftIcon className="size-4" />
                  Back
                </Button>
                <WhenEditing>
                  <Button type="button" disabled={pending} onClick={() => void commit()} className="ml-auto sm:ml-0">
                    {pending ? <Spinner /> : <CheckCircle2Icon className="size-4" />}
                    Complete onboard
                  </Button>
                </WhenEditing>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Shell>
  );
}
