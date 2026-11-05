import { Badge } from "@/components/ui/badge";

/** Color-grade XPAT / permit statuses for quick scanning. */
export function permitStatusTone(status: string | null, stateName: string | null): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
} {
  const text = `${stateName ?? ""} ${status ?? ""}`.toLowerCase();
  if (status === "invalid" || /expir|cancel|reject|revok|invalid|denied/.test(text)) {
    return { variant: "destructive" };
  }
  if (/arriv/.test(text)) {
    return {
      variant: "outline",
      className:
        "border-transparent bg-emerald-600 text-white [a]:hover:bg-emerald-600/90 dark:bg-emerald-500 dark:text-emerald-950",
    };
  }
  if (/depart|exit/.test(text)) {
    return {
      variant: "outline",
      className:
        "border-transparent bg-violet-600 text-white [a]:hover:bg-violet-600/90 dark:bg-violet-500 dark:text-violet-950",
    };
  }
  if (/transfer/.test(text)) {
    return {
      variant: "outline",
      className:
        "border-transparent bg-indigo-600 text-white [a]:hover:bg-indigo-600/90 dark:bg-indigo-500 dark:text-indigo-950",
    };
  }
  if (/pend|process|apply|submitted|await|draft/.test(text)) {
    return {
      variant: "outline",
      className:
        "border-transparent bg-amber-500 text-amber-950 [a]:hover:bg-amber-500/90 dark:bg-amber-400 dark:text-amber-950",
    };
  }
  if (/suspend|hold|warning/.test(text)) {
    return {
      variant: "outline",
      className:
        "border-transparent bg-orange-500 text-white [a]:hover:bg-orange-500/90 dark:bg-orange-400 dark:text-orange-950",
    };
  }
  if (status === "valid" || /issued|active|valid|approv/.test(text)) {
    return {
      variant: "outline",
      className:
        "border-transparent bg-sky-600 text-white [a]:hover:bg-sky-600/90 dark:bg-sky-500 dark:text-sky-950",
    };
  }
  return { variant: "secondary" };
}

export function XpatStatusBadge({
  status,
  stateName,
}: {
  status: string | null | undefined;
  stateName: string | null | undefined;
}) {
  if (!status && !stateName) return <span className="text-muted-foreground">—</span>;
  const tone = permitStatusTone(status ?? null, stateName ?? null);
  return (
    <Badge variant={tone.variant} className={tone.className}>
      {stateName || status}
    </Badge>
  );
}
