import type { FormEvent, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ux";
import { cn } from "@/lib/utils";

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  submitLabel = "Save",
  onSubmit,
  children,
  size = "lg",
  footerExtra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  pending?: boolean;
  submitLabel?: string;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
  size?: "md" | "lg" | "xl" | "2xl" | "full";
  footerExtra?: ReactNode;
}) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void onSubmit();
  }

  const isFull = size === "full";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          !isFull && "max-h-[min(92dvh,52rem)]",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-3xl",
          size === "2xl" && "sm:max-w-5xl",
          isFull &&
            "top-[50%] h-[min(98dvh,100dvh)] max-h-[98dvh] w-[calc(100%-0.75rem)] rounded-2xl sm:max-w-[min(96rem,calc(100vw-1.5rem))]",
        )}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogHeader
            className={cn("shrink-0 border-b px-4 py-4 pr-12", isFull && "px-5 py-4 md:px-6")}
          >
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4",
              isFull && "px-5 py-5 md:px-6",
            )}
          >
            <div className={cn("grid gap-4 sm:grid-cols-2", isFull && "gap-5 lg:gap-6")}>{children}</div>
          </div>
          <DialogFooter className={cn("mx-0 mb-0 shrink-0", isFull && "px-1")}>
            {footerExtra}
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FormDialogWide({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("sm:col-span-2", className)}>{children}</div>;
}
