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
  size?: "md" | "lg" | "xl";
  footerExtra?: ReactNode;
}) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void onSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92dvh,52rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-3xl",
        )}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
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
