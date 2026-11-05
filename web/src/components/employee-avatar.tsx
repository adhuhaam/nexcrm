import { useState, type MouseEvent } from "react";
import { UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const sizeClass = {
  sm: "size-9",
  default: "size-11",
  lg: "size-14",
  xl: "size-28",
  /** Standard passport proportion (~35×45mm) for directory list rows */
  passport: "h-14 w-[2.7rem]",
  /** Larger passport frame for cards / hero */
  "passport-lg": "h-[4.75rem] w-[3.7rem]",
} as const;

const radiusClass = {
  circle: "rounded-full after:rounded-full",
  rounded: "rounded-xl after:rounded-xl",
  passport: "rounded-md after:rounded-md",
} as const;

export function EmployeeAvatar({
  name,
  photoFileId,
  size = "default",
  shape = "rounded",
  preview = false,
  className,
}: {
  name: string;
  photoFileId?: string | null;
  size?: "sm" | "default" | "lg" | "xl" | "passport" | "passport-lg";
  /** Rounded square, circle, or passport (35:45) frame. */
  shape?: "circle" | "rounded" | "passport";
  /** Click opens a larger photo dialog when a photo exists. */
  preview?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const src = photoFileId ? `/api/v1/files/${photoFileId}/download` : undefined;
  const letters = initials(name);
  const canPreview = Boolean(preview && src);
  const frame = shape === "passport" ? "passport" : shape;
  const radius = radiusClass[frame];
  const imgRadius =
    frame === "circle" ? "rounded-full" : frame === "passport" ? "rounded-md" : "rounded-xl";

  function onActivate(event?: MouseEvent) {
    event?.stopPropagation();
    if (!canPreview) return;
    setOpen(true);
  }

  const face = (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border bg-muted text-muted-foreground",
        "after:pointer-events-none after:absolute after:inset-0 after:border after:border-border",
        sizeClass[size],
        radius,
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(
            "size-full object-cover",
            frame === "passport" ? "object-top" : "object-center",
            imgRadius,
          )}
        />
      ) : letters ? (
        <span
          className={cn(
            "font-semibold tracking-wide",
            size === "xl" || size === "passport-lg"
              ? "text-base"
              : size === "lg"
                ? "text-sm"
                : size === "sm"
                  ? "text-xs"
                  : "text-sm",
          )}
        >
          {letters}
        </span>
      ) : (
        <UserIcon
          className={
            size === "xl" || size === "passport-lg"
              ? "size-6"
              : size === "lg"
                ? "size-5"
                : size === "sm"
                  ? "size-3.5"
                  : "size-4"
          }
        />
      )}
    </span>
  );

  return (
    <>
      {canPreview ? (
        <button
          type="button"
          onClick={onActivate}
          aria-label={`View photo of ${name}`}
          className={cn(
            "shrink-0 cursor-zoom-in border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            frame === "circle" ? "rounded-full" : frame === "passport" ? "rounded-md" : "rounded-xl",
          )}
        >
          {face}
        </button>
      ) : (
        face
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md gap-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>Profile photo</DialogDescription>
          </DialogHeader>
          {src ? (
            <div className="mx-auto overflow-hidden rounded-md border bg-muted" style={{ aspectRatio: "35 / 45", width: "min(100%, 14rem)" }}>
              <img src={src} alt={name} className="size-full object-cover object-top" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
