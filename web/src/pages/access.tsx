import { useMemo } from "react";
import { ActivityIcon, SettingsIcon, ShieldIcon, UsersIcon } from "lucide-react";
import { Shell } from "@/components/shell";
import { usePath } from "@/hooks/use-path";
import { cn } from "@/lib/utils";
import { RolesPanel } from "@/pages/admin";
import { UsersPanel } from "@/pages/users";
import { SettingsPanel } from "@/pages/settings";
import { HealthPanel } from "@/pages/settings-health";
import "@/styles/nexcrm-surface.css";
import "./access.css";

export type AccessTab = "users" | "roles" | "settings" | "health";

const TABS: { id: AccessTab; href: string; label: string; icon: typeof UsersIcon; blurb: string }[] = [
  { id: "settings", href: "/settings", label: "General", icon: SettingsIcon, blurb: "Office, region, AI" },
  { id: "users", href: "/users", label: "People", icon: UsersIcon, blurb: "Accounts & passwords" },
  { id: "roles", href: "/admin", label: "Roles", icon: ShieldIcon, blurb: "Module permissions" },
  { id: "health", href: "/settings/health", label: "Health", icon: ActivityIcon, blurb: "Server diagnostics" },
];

export function tabFromPath(path: string): AccessTab {
  if (path.startsWith("/settings/health")) return "health";
  if (path === "/users" || path.startsWith("/users/")) return "users";
  if (path === "/admin" || path.startsWith("/admin/")) return "roles";
  return "settings";
}

const meta: Record<AccessTab, { description: string }> = {
  settings: {
    description: "Full NEXCRM system settings — office identity, region defaults, AI OCR, and setup shortcuts.",
  },
  users: { description: "Create office accounts, assign roles, and reset passwords." },
  roles: {
    description: "Per-module permissions by category — View, Create, Edit, Delete for every office module.",
  },
  health: {
    description: "Live host, database, disk, and app process signals. Refreshes every few seconds.",
  },
};

export function AccessPage() {
  const path = usePath();
  const tab = useMemo(() => tabFromPath(path), [path]);
  const copy = meta[tab];

  return (
    <Shell title="NEXCRM · Settings" eyebrow="System" description={copy.description} surface={false}>
      <div className="nexcrm-surface nexcrm-access">
        <nav className="access-tabs" aria-label="System settings sections">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = item.id === tab;
            return (
              <a
                key={item.id}
                href={item.href}
                className={cn("access-tab", active && "is-active")}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                <span className="access-tab-copy">
                  <strong>{item.label}</strong>
                  <em>{item.blurb}</em>
                </span>
              </a>
            );
          })}
        </nav>
        <div className="access-panel">
          {tab === "settings" ? <SettingsPanel /> : null}
          {tab === "users" ? <UsersPanel /> : null}
          {tab === "roles" ? <RolesPanel /> : null}
          {tab === "health" ? <HealthPanel /> : null}
        </div>
      </div>
    </Shell>
  );
}
