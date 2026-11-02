import { UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function EmployeeAvatar({
  name,
  photoFileId,
  size = "default",
  className,
}: {
  name: string;
  photoFileId?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const src = photoFileId ? `/api/v1/files/${photoFileId}/download` : undefined;
  const letters = initials(name);
  return (
    <Avatar size={size} className={cn("bg-muted", className)}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className="bg-muted text-muted-foreground">
        {letters || <UserIcon className={size === "sm" ? "size-3" : size === "lg" ? "size-5" : "size-4"} />}
      </AvatarFallback>
    </Avatar>
  );
}
