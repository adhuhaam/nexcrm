import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, KeyRoundIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/field";
import { Banner, Loading, Shell, useOffice } from "@/components/shell";
import { getJson, sendJson } from "@/lib/api";

type SettingsView = {
  openaiConfigured: boolean;
  openaiKeyHint: string | null;
  openaiKeySource: "settings" | "env" | "none";
  openaiModel: string;
  envKeyPresent: boolean;
};

export function SettingsPage() {
  return (
    <Shell
      title="NEXCRM · System settings"
      eyebrow="Admin"
      description="Integrations used across the office — passport OCR via ChatGPT Vision and related API keys."
      actions={
        <Button variant="outline" asChild>
          <a href="/admin">Roles</a>
        </Button>
      }
    >
      <SettingsBody />
    </Shell>
  );
}

function SettingsBody() {
  const office = useOffice();
  const [model, setModel] = useState<SettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [ocrModel, setOcrModel] = useState("gpt-4o-mini");

  function reload() {
    getJson<SettingsView>("/api/v1/admin/settings")
      .then((data) => {
        setModel(data);
        setOcrModel(data.openaiModel || "gpt-4o-mini");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load settings"));
  }

  useEffect(() => {
    if (office.role?.slug !== "system_admin") return;
    reload();
  }, [office.role?.slug]);

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
      });
      setModel(next);
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
    <>
      <Banner message={error} error />
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SparklesIcon className="size-5" />
            </span>
            <div>
              <CardTitle>ChatGPT / OpenAI · Passport OCR</CardTitle>
              <CardDescription className="mt-1">
                Quick onboard uses OpenAI Vision (ChatGPT) to read passport photos. Store the API key here so staff do
                not need access to the server <code className="rounded bg-muted px-1">.env</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            {model.openaiConfigured ? (
              <>
                <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  OCR ready · key {model.openaiKeyHint} via {model.openaiKeySource === "settings" ? "system settings" : ".env"}
                </span>
              </>
            ) : (
              <>
                <KeyRoundIcon className="size-4 text-amber-600" />
                <span>No API key yet — passport scan will ask you to configure one.</span>
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
                : "Paste a key starting with sk-… Keys are never shown in full after save."
            }
          />
          {model.envKeyPresent ? (
            <p className="text-xs text-muted-foreground">
              An <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> in .env is used as fallback when no
              settings key is stored.
            </p>
          ) : null}

          <TextField
            id="openaiModel"
            label="OCR model"
            value={ocrModel}
            onChange={setOcrModel}
            hint="Vision-capable model such as gpt-4o-mini or gpt-4o."
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => void save(false)}>
              <SettingsIcon className="size-4" />
              Save integrations
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
    </>
  );
}
