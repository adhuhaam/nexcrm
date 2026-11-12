import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Building2Icon,
  CalendarRangeIcon,
  CheckCircle2Icon,
  CoinsIcon,
  GlobeIcon,
  KeyRoundIcon,
  LinkIcon,
  MailIcon,
  SettingsIcon,
  SparklesIcon,
  TagsIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/field";
import { Banner, Loading, useOffice } from "@/components/shell";
import { getJson, sendJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import "./settings.css";

type SettingsCatalog = {
  timeZones: string[];
  currencies: string[];
  dateFormats: { id: string; label: string; example: string }[];
  weekStarts: { id: string; label: string }[];
  ocrModels: { id: string; label: string }[];
};

type SettingsView = {
  officeName: string;
  supportEmail: string;
  timeZone: string;
  currency: string;
  dateFormat: "dmy" | "ymd" | "mdy";
  weekStartsOn: "monday" | "sunday";
  openaiConfigured: boolean;
  openaiKeyHint: string | null;
  openaiKeySource: "settings" | "env" | "none";
  openaiModel: string;
  envKeyPresent: boolean;
  catalog?: SettingsCatalog;
};

type SectionId = "office" | "region" | "ai" | "links";

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "office", label: "Office", hint: "Name & contact" },
  { id: "region", label: "Region", hint: "Time, money, dates" },
  { id: "ai", label: "AI & OCR", hint: "Passport scanning" },
  { id: "links", label: "Shortcuts", hint: "Jump to setup" },
];

const DEFAULT_CATALOG: SettingsCatalog = {
  timeZones: ["Indian/Maldives", "Asia/Colombo", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "UTC"],
  currencies: ["MVR", "USD", "EUR", "INR", "LKR", "AED"],
  dateFormats: [
    { id: "dmy", label: "DD/MM/YYYY", example: "05/11/2026" },
    { id: "ymd", label: "YYYY-MM-DD", example: "2026-11-05" },
    { id: "mdy", label: "MM/DD/YYYY", example: "11/05/2026" },
  ],
  weekStarts: [
    { id: "monday", label: "Monday" },
    { id: "sunday", label: "Sunday" },
  ],
  ocrModels: [
    { id: "gpt-4o-mini", label: "GPT-4o mini (fast, lower cost)" },
    { id: "gpt-4o", label: "GPT-4o (higher accuracy)" },
  ],
};

export function SettingsPanel() {
  const office = useOffice();
  const [model, setModel] = useState<SettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [section, setSection] = useState<SectionId>("office");
  const [officeName, setOfficeName] = useState("JACMS");
  const [supportEmail, setSupportEmail] = useState("");
  const [timeZone, setTimeZone] = useState("Indian/Maldives");
  const [currency, setCurrency] = useState("MVR");
  const [dateFormat, setDateFormat] = useState<"dmy" | "ymd" | "mdy">("dmy");
  const [weekStartsOn, setWeekStartsOn] = useState<"monday" | "sunday">("monday");
  const [apiKey, setApiKey] = useState("");
  const [ocrModel, setOcrModel] = useState("gpt-4o-mini");

  const catalog = model?.catalog ?? DEFAULT_CATALOG;

  function apply(data: SettingsView) {
    setModel(data);
    setOfficeName(data.officeName || "JACMS");
    setSupportEmail(data.supportEmail || "");
    setTimeZone(data.timeZone || "Indian/Maldives");
    setCurrency(data.currency || "MVR");
    setDateFormat(data.dateFormat || "dmy");
    setWeekStartsOn(data.weekStartsOn || "monday");
    setOcrModel(data.openaiModel || "gpt-4o-mini");
  }

  function reload() {
    getJson<SettingsView>("/api/v1/admin/settings")
      .then(apply)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load settings"));
  }

  useEffect(() => {
    if (office.role?.slug !== "system_admin") return;
    reload();
  }, [office.role?.slug]);

  const dirty = useMemo(() => {
    if (!model) return false;
    return (
      officeName !== model.officeName ||
      supportEmail !== (model.supportEmail || "") ||
      timeZone !== model.timeZone ||
      currency !== model.currency ||
      dateFormat !== model.dateFormat ||
      weekStartsOn !== model.weekStartsOn ||
      ocrModel !== model.openaiModel ||
      apiKey.trim().length > 0
    );
  }, [model, officeName, supportEmail, timeZone, currency, dateFormat, weekStartsOn, ocrModel, apiKey]);

  if (office.role?.slug !== "system_admin") {
    return <Banner message="Only a system admin can manage system settings." error />;
  }
  if (!model) return error ? <Banner message={error} error /> : <Loading />;

  async function save(clearApiKey = false) {
    setPending(true);
    setError(null);
    try {
      const next = await sendJson<SettingsView>("/api/v1/admin/settings", "POST", {
        apiKey: clearApiKey ? "" : apiKey,
        clearApiKey,
        model: ocrModel,
        officeName,
        supportEmail,
        timeZone,
        currency,
        dateFormat,
        weekStartsOn,
      });
      apply(next);
      setApiKey("");
      toast.success(clearApiKey ? "API key cleared" : "Settings saved");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save settings";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="jacms-settings">
      <Banner message={error} error />

      <div className="settings-hero">
        <div>
          <p className="settings-kicker">JACMS system</p>
          <h2>{model.officeName || "Office settings"}</h2>
          <p>One place for office identity, region defaults, AI passport OCR, and setup shortcuts.</p>
        </div>
        <div className="settings-status-row">
          <span className={cn("settings-pill", model.openaiConfigured ? "is-ok" : "is-warn")}>
            {model.openaiConfigured ? <CheckCircle2Icon className="size-3.5" /> : <KeyRoundIcon className="size-3.5" />}
            OCR {model.openaiConfigured ? "ready" : "needs key"}
          </span>
          <span className="settings-pill">
            <GlobeIcon className="size-3.5" />
            {model.timeZone}
          </span>
          <span className="settings-pill">
            <CoinsIcon className="size-3.5" />
            {model.currency}
          </span>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="settings-rail" aria-label="Settings sections">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn("settings-nav", section === item.id && "is-active")}
              onClick={() => setSection(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
          <div className="settings-rail-foot">
            <Button type="button" disabled={pending || (!dirty && !pending)} onClick={() => void save(false)}>
              <SettingsIcon className="size-4" />
              Save changes
            </Button>
            {dirty ? <p className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes</p> : null}
          </div>
        </aside>

        <div className="settings-main">
          {section === "office" ? (
            <Card>
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="settings-icon">
                    <Building2Icon className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Office identity</CardTitle>
                    <CardDescription className="mt-1">
                      How JACMS introduces this office in the shell and emails. Keep it short and recognisable.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="officeName"
                  label="Office name"
                  value={officeName}
                  onChange={setOfficeName}
                  hint="Shown in the app title area and settings."
                />
                <TextField
                  id="supportEmail"
                  label="Support email"
                  value={supportEmail}
                  onChange={setSupportEmail}
                  hint="Optional contact for staff when something needs an admin."
                />
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button type="button" disabled={pending} onClick={() => void save(false)}>
                    Save office
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {section === "region" ? (
            <Card>
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="settings-icon">
                    <GlobeIcon className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Region & formats</CardTitle>
                    <CardDescription className="mt-1">
                      Defaults for clocks, money, calendars, and attendance weeks across the office.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <SelectField id="timeZone" label="Time zone" value={timeZone} onChange={setTimeZone}>
                  {catalog.timeZones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </SelectField>
                <SelectField id="currency" label="Default currency" value={currency} onChange={setCurrency}>
                  {catalog.currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="dateFormat"
                  label="Date format"
                  value={dateFormat}
                  onChange={(value) => setDateFormat(value as "dmy" | "ymd" | "mdy")}
                >
                  {catalog.dateFormats.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · {item.example}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="weekStartsOn"
                  label="Week starts on"
                  value={weekStartsOn}
                  onChange={(value) => setWeekStartsOn(value as "monday" | "sunday")}
                >
                  {catalog.weekStarts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </SelectField>
                <div className="sm:col-span-2 rounded-xl border bg-muted/25 p-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <CalendarRangeIcon className="size-4" />
                    Preview
                  </p>
                  <p className="mt-1">
                    Today displays as{" "}
                    <Badge variant="secondary">
                      {catalog.dateFormats.find((item) => item.id === dateFormat)?.example ?? "—"}
                    </Badge>{" "}
                    · payroll & attendance use <strong>{currency}</strong> · week from{" "}
                    <strong>{weekStartsOn === "sunday" ? "Sunday" : "Monday"}</strong>.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Button type="button" disabled={pending} onClick={() => void save(false)}>
                    Save region
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {section === "ai" ? (
            <Card>
              <CardHeader className="gap-3">
                <div className="flex items-start gap-3">
                  <span className="settings-icon">
                    <SparklesIcon className="size-5" />
                  </span>
                  <div>
                    <CardTitle>AI passport OCR</CardTitle>
                    <CardDescription className="mt-1">
                      Quick onboard reads passport photos with OpenAI Vision. Staff never need the server{" "}
                      <code className="rounded bg-muted px-1">.env</code>.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className={cn("settings-banner", model.openaiConfigured ? "is-ok" : "is-warn")}>
                  {model.openaiConfigured ? (
                    <>
                      <CheckCircle2Icon className="size-4" />
                      <span>
                        Ready · key {model.openaiKeyHint} via{" "}
                        {model.openaiKeySource === "settings" ? "these settings" : ".env fallback"}
                      </span>
                    </>
                  ) : (
                    <>
                      <KeyRoundIcon className="size-4" />
                      <span>No key yet — paste an OpenAI key below to turn on passport scan.</span>
                    </>
                  )}
                </div>

                <TextField
                  id="openaiApiKey"
                  label="OpenAI API key"
                  type="password"
                  value={apiKey}
                  onChange={setApiKey}
                  hint={
                    model.openaiConfigured
                      ? "Leave blank to keep the current key. Paste a new key to replace it."
                      : "Paste a key starting with sk-… It is never shown in full after save."
                  }
                />
                {model.envKeyPresent ? (
                  <p className="text-xs text-muted-foreground">
                    An <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> in .env is used only when no settings
                    key is stored.
                  </p>
                ) : null}

                <SelectField id="openaiModel" label="OCR model" value={ocrModel} onChange={setOcrModel}>
                  {catalog.ocrModels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </SelectField>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={pending} onClick={() => void save(false)}>
                    <SettingsIcon className="size-4" />
                    Save AI settings
                  </Button>
                  {model.openaiKeySource === "settings" ? (
                    <Button type="button" variant="outline" disabled={pending} onClick={() => void save(true)}>
                      Clear stored key
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" asChild>
                    <a href="/employees/onboard">Try quick onboard</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {section === "links" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ShortcutCard
                href="/users"
                icon={<UsersIcon className="size-5" />}
                title="People"
                description="Add accounts, reset passwords, and assign roles."
              />
              <ShortcutCard
                href="/admin"
                icon={<SettingsIcon className="size-5" />}
                title="Roles & permissions"
                description="Choose what each role can view, create, edit, or delete."
              />
              <ShortcutCard
                href="/designations"
                icon={<TagsIcon className="size-5" />}
                title="Designations"
                description="Job titles used on employees, rates, and allocations."
              />
              <ShortcutCard
                href="/clients"
                icon={<Building2Icon className="size-5" />}
                title="Clients & rates"
                description="Client companies and monthly designation rate cards."
              />
              <ShortcutCard
                href="/payroll"
                icon={<WalletIcon className="size-5" />}
                title="Payroll"
                description="Pay runs, salary sheets, and payment requests."
              />
              <ShortcutCard
                href="/settings/health"
                icon={<MailIcon className="size-5" />}
                title="Server health"
                description="Live host, database, disk, and process checks."
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ShortcutCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <a href={href} className="settings-link-card">
      <span className="settings-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <em>{description}</em>
      </span>
      <LinkIcon className="ml-auto size-4 opacity-50" />
    </a>
  );
}
