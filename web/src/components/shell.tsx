import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  ArrowRightLeftIcon,
  BedDoubleIcon,
  BellIcon,
  Building2Icon,
  CalendarCheckIcon,
  CircleCheckIcon,
  CommandIcon,
  EllipsisVerticalIcon,
  FileArchiveIcon,
  FileTextIcon,
  FolderKanbanIcon,
  IdCardIcon,
  InfoIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  OctagonXIcon,
  PenLineIcon,
  PlusCircleIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  TagsIcon,
  TriangleAlertIcon,
  UserRoundPenIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallPrompt, MobileInstallBanner } from "@/components/install-prompt";
import { EmptyState, PageSkeleton, Spinner } from "@/components/ux";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { postJson } from "@/lib/api";
import { usePath } from "@/hooks/use-path";
import { clearSessionCache, loadOfficeSession, peekOfficeSession, type OfficeSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import "@/styles/admin.css";

export type { OfficeSession };

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type NavGroup = { label: string; items: NavItem[] };

const workspaceNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/companies", label: "Legal employers", icon: Building2Icon },
  { href: "/employees", label: "Employees", icon: UsersIcon },
  { href: "/loas", label: "LOAs", icon: FileTextIcon },
  { href: "/loas/new", label: "LOA editor", icon: PenLineIcon },
];

const operationsNav: NavItem[] = [
  { href: "/clients", label: "Clients", icon: Building2Icon },
  { href: "/designations", label: "Designations", icon: TagsIcon },
  { href: "/allocations", label: "Allocations", icon: ArrowRightLeftIcon },
  { href: "/attendance", label: "Attendance", icon: CalendarCheckIcon },
  { href: "/accommodations", label: "Accommodations", icon: BedDoubleIcon },
  { href: "/payroll", label: "Payroll", icon: WalletIcon },
  { href: "/apps/expenses", label: "Finance", icon: ReceiptIcon },
  { href: "/documents", label: "Documents", icon: FileArchiveIcon },
  { href: "/projects", label: "Projects", icon: FolderKanbanIcon },
];

const accessNav: NavItem[] = [{ href: "/settings", label: "Settings", icon: SettingsIcon }];

const OfficeContext = createContext<OfficeSession | null>(null);

export function useOffice(): OfficeSession {
  const value = useContext(OfficeContext);
  if (!value?.user || !value.role) throw new Error("Office session is missing");
  return value;
}

function current(href: string): boolean {
  const path = window.location.pathname;
  if (href === "/") return path === "/";
  if (href === "/loas/new") return path === "/loas/new" || (path.startsWith("/loas/") && path !== "/loas");
  if (href === "/loas") return path === "/loas";
  if (href === "/settings") {
    return (
      path === "/settings" ||
      path.startsWith("/settings/") ||
      path === "/admin" ||
      path.startsWith("/admin/") ||
      path === "/users" ||
      path.startsWith("/users/")
    );
  }
  return path === href || path.startsWith(`${href}/`);
}

function groupsFor(isAdmin: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    { label: "Workspace", items: workspaceNav },
    { label: "Operations", items: operationsNav },
  ];
  if (isAdmin) groups.push({ label: "System", items: accessNav });
  return groups;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function openCommandPalette() {
  window.dispatchEvent(new Event("jacms:open-command"));
}

function greetingFor(name: string, now = new Date()): string {
  const hour = now.getHours();
  const first = name.trim().split(/\s+/)[0] || "there";
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 18) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function AppSidebar({
  groups,
  session,
  canEdit,
}: {
  groups: NavGroup[];
  session: OfficeSession;
  canEdit: boolean;
}) {
  const user = session.user!;
  const role = session.role!;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <a href="/" className="nx-brand group-data-[collapsible=icon]:justify-center">
          <span className="nx-brand-mark">NX</span>
          <span className="nx-brand-copy group-data-[collapsible=icon]:hidden">
            <strong>JACMS</strong>
            <span>Admin</span>
          </span>
        </a>
        <button type="button" className="nx-side-search group-data-[collapsible=icon]:hidden" onClick={openCommandPalette}>
          <SearchIcon className="size-3.5" />
          <span>Search…</span>
          <kbd>
            <CommandIcon className="mr-0.5 inline size-2.5" />K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent>
        {canEdit ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="nx-create group-data-[collapsible=icon]:hidden">
                    <PlusCircleIcon className="size-4" />
                    Quick Create
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72" align="start" side="right">
                  <DropdownMenuLabel>Add an employee</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => window.location.assign("/employees/onboard")}>
                    <IdCardIcon />
                    <div className="grid gap-0.5">
                      <span className="font-medium">Quick onboard</span>
                      <span className="text-xs text-muted-foreground">Passport OCR with ChatGPT</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.location.assign("/employees?new=1")}>
                    <UserRoundPenIcon />
                    <div className="grid gap-0.5">
                      <span className="font-medium">Add manually</span>
                      <span className="text-xs text-muted-foreground">Fill the employee form</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.location.assign("/loas/new")}>
                    <FileTextIcon />
                    <div className="grid gap-0.5">
                      <span className="font-medium">New LOA</span>
                      <span className="text-xs text-muted-foreground">Appointment letter</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={current(item.href)} tooltip={item.label}>
                        <a href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="nx-user-chip">
              <Avatar className="size-9 rounded-xl">
                <AvatarFallback className="rounded-xl bg-white text-[color:var(--nx-blue)]">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">{user.name}</span>
                <span className="truncate text-xs text-white/65">{role.name}</span>
              </span>
              <EllipsisVerticalIcon className="size-4 opacity-70 group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56 rounded-xl" side="right" align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{role.name}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            {role.slug === "system_admin" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.location.assign("/settings")}>
                  <SettingsIcon />
                  Settings
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                clearSessionCache();
                void postJson("/logout", {});
              }}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function Shell({
  title,
  heading,
  greet = false,
  eyebrow,
  description,
  actions,
  surface = true,
  surfaceFlush = false,
  children,
}: {
  title: string;
  heading?: string;
  greet?: boolean;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  surface?: boolean;
  surfaceFlush?: boolean;
  children: ReactNode;
}) {
  const [session, setSession] = useState<OfficeSession | undefined>(() => peekOfficeSession() ?? undefined);
  const pathname = usePath();

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    let cancelled = false;
    loadOfficeSession()
      .then((next) => {
        if (cancelled) return;
        if (!next.user) {
          clearSessionCache();
          window.location.assign("/login");
          return;
        }
        setSession(next);
      })
      .catch(() => {
        if (cancelled) return;
        clearSessionCache();
        window.location.assign("/login");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pageTitle = title.replace(/^JACMS · /, "");

  if (!session?.user || !session.role) {
    return (
      <div className="nx-admin grid min-h-svh place-items-center">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm text-[color:var(--nx-muted)] shadow-sm outline outline-[color:var(--nx-line)]">
          <span className="nx-brand-mark">NX</span>
          <Spinner />
          Opening admin…
        </div>
      </div>
    );
  }

  const groups = groupsFor(session.role.slug === "system_admin");
  const displayHeading = heading ?? (greet ? greetingFor(session.user.name) : pageTitle);
  const body = surface ? <div className={cn("nx-panel", surfaceFlush && "is-flush")}>{children}</div> : children;

  return (
    <OfficeContext.Provider value={session}>
      <TooltipProvider>
        <div className="nx-admin">
          <SidebarProvider
            style={
              {
                "--sidebar-width": "17.5rem",
              } as CSSProperties
            }
          >
            <AppSidebar groups={groups} session={session} canEdit={session.role.canEdit} />
            <SidebarInset className="flex min-h-0 min-w-0 flex-col overflow-x-clip bg-[color:var(--nx-canvas)]">
              <header className="nx-topbar print:hidden">
                <SidebarTrigger className="-ml-1" />
                <button type="button" className="nx-topbar-search" onClick={openCommandPalette}>
                  <SearchIcon className="size-4" />
                  <span className="truncate">Search people, clients, payroll…</span>
                  <kbd>⌘K</kbd>
                </button>
                <div className="nx-topbar-right">
                  <span className="nx-pill is-live hidden sm:inline-flex">Online</span>
                  <button
                    type="button"
                    className="inline-flex size-9 items-center justify-center rounded-full border border-[color:var(--nx-line)] bg-white text-[color:var(--nx-muted)]"
                    aria-label="Notifications"
                  >
                    <BellIcon className="size-4" />
                  </button>
                  <InstallPrompt />
                  <ThemeToggle />
                </div>
              </header>
              <CommandPalette canEdit={session.role.canEdit} hideTrigger />

              <div className="nx-workspace">
                <div className="@container/main nx-content">
                  <div className="nx-page-head print:hidden">
                    <div className="min-w-0">
                      {eyebrow ? <p className="nx-page-kicker">{eyebrow}</p> : null}
                      <h1>{displayHeading}</h1>
                      {description ? <p className="nx-page-desc">{description}</p> : null}
                    </div>
                    {actions ? <div className="nx-page-actions">{actions}</div> : null}
                  </div>
                  {body}
                </div>
              </div>

              <MobileBottomNav pathname={pathname} isAdmin={session.role.slug === "system_admin"} />
            </SidebarInset>
          </SidebarProvider>
        </div>
      </TooltipProvider>
      <MobileInstallBanner />
    </OfficeContext.Provider>
  );
}

function MobileBottomNav({ pathname, isAdmin }: { pathname: string; isAdmin: boolean }) {
  const items = [
    { href: "/", label: "Home", icon: LayoutDashboardIcon, active: pathname === "/" },
    { href: "/employees", label: "People", icon: UsersIcon, active: pathname.startsWith("/employees") },
    { href: "/attendance", label: "Attend", icon: CalendarCheckIcon, active: pathname.startsWith("/attendance") },
    { href: "/documents", label: "Files", icon: FileArchiveIcon, active: pathname.startsWith("/documents") },
    isAdmin
      ? {
          href: "/settings",
          label: "Settings",
          icon: SettingsIcon,
          active: pathname.startsWith("/settings") || pathname.startsWith("/admin") || pathname.startsWith("/users"),
        }
      : {
          href: "/payroll",
          label: "Payroll",
          icon: WalletIcon,
          active: pathname.startsWith("/payroll"),
        },
  ] as const;

  return (
    <nav className="nx-mobile-nav print:hidden" aria-label="Primary">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            className={cn(item.active && "is-active")}
            aria-current={item.active ? "page" : undefined}
          >
            <Icon aria-hidden />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function WhenEditing({ children }: { children: ReactNode }) {
  const office = useOffice();
  if (!office.role?.canEdit) {
    return <p className="text-sm text-muted-foreground">Your role can preview this office. Editing is turned off.</p>;
  }
  return children;
}

export function Banner({
  message,
  error = false,
  tone,
}: {
  message: string | null;
  error?: boolean;
  tone?: "default" | "info" | "success" | "warning" | "destructive";
}) {
  if (!message) return null;
  const variant = tone ?? (error ? "destructive" : "info");
  const Icon =
    variant === "destructive"
      ? OctagonXIcon
      : variant === "success"
        ? CircleCheckIcon
        : variant === "warning"
          ? TriangleAlertIcon
          : InfoIcon;
  return (
    <Alert variant={variant} role={variant === "destructive" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <AlertDescription className={variant === "default" ? "text-foreground" : undefined}>{message}</AlertDescription>
    </Alert>
  );
}

export function Loading() {
  return <PageSkeleton cards={1} />;
}

export function ShellEmpty(props: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <EmptyState {...props} />;
}
