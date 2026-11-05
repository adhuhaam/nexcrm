import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadForm, sendJson } from "@/lib/api";

export type CompanyBranding = {
  letterheadFileId: string | null;
  sealFileId: string | null;
  signatureFileId: string | null;
};

type Slot = "letterhead" | "seal" | "signature";

const slots: { id: Slot; title: string; hint: string }[] = [
  { id: "letterhead", title: "Letterhead", hint: "Header artwork for LOAs (PNG, JPG, or PDF)" },
  { id: "seal", title: "Stamp / seal", hint: "Company rubber stamp or seal image" },
  { id: "signature", title: "Authorized signature", hint: "Signatory wet-ink or digital signature image" },
];

function fileUrl(id: string | null): string | null {
  return id ? `/api/v1/files/${id}/download` : null;
}

export function CompanyBrandingPanel({
  companyId,
  branding,
  onChange,
  disabled,
}: {
  companyId: string;
  branding: CompanyBranding;
  onChange: (next: CompanyBranding) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<Slot | null>(null);
  const letterheadRef = useRef<HTMLInputElement>(null);
  const sealRef = useRef<HTMLInputElement>(null);
  const signatureRef = useRef<HTMLInputElement>(null);
  const refs = { letterhead: letterheadRef, seal: sealRef, signature: signatureRef } as const;

  async function upload(slot: Slot, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(slot);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await uploadForm<{ company: CompanyBranding }>(`/api/v1/companies/${companyId}/assets/${slot}`, body);
      onChange({
        letterheadFileId: result.company.letterheadFileId,
        sealFileId: result.company.sealFileId,
        signatureFileId: result.company.signatureFileId,
      });
      toast.success(`${slot === "seal" ? "Stamp/seal" : slot[0].toUpperCase() + slot.slice(1)} uploaded`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Upload failed");
    } finally {
      setBusy(null);
      if (refs[slot].current) refs[slot].current.value = "";
    }
  }

  async function clear(slot: Slot) {
    setBusy(slot);
    try {
      const result = await sendJson<{ company: CompanyBranding }>(`/api/v1/companies/${companyId}/assets/${slot}`, "DELETE", {});
      onChange({
        letterheadFileId: result.company.letterheadFileId,
        sealFileId: result.company.sealFileId,
        signatureFileId: result.company.signatureFileId,
      });
      toast.success("Removed");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {slots.map((slot) => {
        const id =
          slot.id === "letterhead"
            ? branding.letterheadFileId
            : slot.id === "seal"
              ? branding.sealFileId
              : branding.signatureFileId;
        const src = fileUrl(id);
        return (
          <div key={slot.id} className="grid gap-2 rounded-lg border bg-muted/15 p-3">
            <div>
              <p className="text-sm font-medium">{slot.title}</p>
              <p className="text-[11px] text-muted-foreground">{slot.hint}</p>
            </div>
            <div className="flex h-28 items-center justify-center overflow-hidden rounded-md border border-dashed bg-background">
              {src ? (
                <img src={src} alt={slot.title} className="max-h-full max-w-full object-contain p-2" />
              ) : (
                <ImageIcon className="size-8 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <input
                ref={refs[slot.id]}
                type="file"
                accept={slot.id === "letterhead" ? "image/*,application/pdf" : "image/*"}
                className="sr-only"
                disabled={disabled || busy === slot.id}
                onChange={(event) => void upload(slot.id, event.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || busy === slot.id}
                onClick={() => refs[slot.id].current?.click()}
              >
                <UploadIcon className="size-3.5" />
                {id ? "Replace" : "Upload"}
              </Button>
              {id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || busy === slot.id}
                  onClick={() => void clear(slot.id)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
