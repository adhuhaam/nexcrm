import { LogOutIcon, SettingsIcon, ShieldIcon, UserIcon, UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { postJson } from "@/lib/api";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function UserMenu({
  name,
  email,
  roleName,
  canManageUsers = false,
}: {
  name: string;
  email: string;
  roleName: string;
  canManageUsers?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-8 gap-2 rounded-full px-1.5 sm:pr-2.5"
          aria-label="Account menu"
        >
          <Avatar size="sm">
            <AvatarFallback className="bg-muted text-foreground">
              <UserIcon className="size-3.5" />
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-start gap-3 py-1">
            <Avatar>
              <AvatarFallback className="bg-muted font-medium text-foreground">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 gap-0.5">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldIcon className="size-3" />
                {roleName}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        {canManageUsers ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.location.assign("/users");
              }}
            >
              <UsersIcon />
              User management
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.assign("/admin");
              }}
            >
              <ShieldIcon />
              Roles
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.assign("/settings");
              }}
            >
              <SettingsIcon />
              System settings
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void postJson("/logout", {});
          }}
        >
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
