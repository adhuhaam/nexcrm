import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  ArrowRightLeftIcon,
  BedDoubleIcon,
  Building2Icon,
  CalendarCheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  Clock3Icon,
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
  PinIcon,
  PlusCircleIcon,
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { postJson } from "@/lib/api";
import { appIsActive, officeApps } from "@/lib/apps";
import { usePath } from "@/hooks/use-path";
import { clearSessionCache, loadOfficeSession, peekOfficeSession, type OfficeSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import "@/styles/nexcrm-shell.css";
import "@/styles/nexcrm-surface.css";

export type { OfficeSession };

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type NavGroup = { label: string; items: NavItem[] };

const PIN_KEY = "nexcrm.shell.pins";

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
  { href: "/documents", label: "Documents", icon: FileArchiveIcon },
  { href: "/projects", label: "Projects", icon: FolderKanbanIcon },
];

const accessNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const allNav = [...workspaceNav, ...operationsNav, ...accessNav];

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

function readPins(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writePins(pins: string[]) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

function crumbsFor(pathname: string, pageTitle: string): { label: string; href?: string }[] {
  if (pathname === "/") return [{ label: "Office" }, { label: "Dashboard" }];
  if (pathname === "/users" || pathname.startsWith("/users/")) {
    return [{ label: "Office", href: "/" }, { label: "Settings", href: "/settings" }, { label: "People" }];
  }
  if (pathname.startsWith("/settings/health")) {
    return [{ label: "Office", href: "/" }, { label: "Settings", href: "/settings" }, { label: "Health" }];
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return [{ label: "Office", href: "/" }, { label: "Settings", href: "/settings" }, { label: "Roles" }];
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return [{ label: "Office", href: "/" }, { label: "Settings" }];
  }
  const match = allNav.find((item) => current(item.href) && item.href !== "/");
  return [{ label: "Office", href: "/" }, { label: match?.label ?? pageTitle }];
}

function openCommandPalette() {
  const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
  window.dispatchEvent(event);
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function AppSidebar({
  groups,
  session,
  canEdit,
  pins,
  onTogglePin,
}: {
  groups: NavGroup[];
  session: OfficeSession;
  canEdit: boolean;
  pins: string[];
  onTogglePin: (href: string) => void;
}) {
  const user = session.user!;
  const role = session.role!;
  const pinnedItems = pins.map((href) => allNav.find((item) => item.href === href)).filter(Boolean) as NavItem[];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <a href="/">
                <span className="shell-brand-mark">NX</span>
                <span className="shell-brand-copy">
                  <strong>NEXCRM</strong>
                  <span>Office shell</span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <button type="button" className="shell-search-chip group-data-[collapsible=icon]:hidden" onClick={openCommandPalette}>
          <SearchIcon className="size-3.5" />
          <span>Search office…</span>
          <kbd>
            <CommandIcon className="mr-0.5 inline size-2.5" />K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent>
        {canEdit ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Quick Create"
                        className="min-w-8 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                      >
                        <PlusCircleIcon />
                        <span>Quick Create</span>
                      </SidebarMenuButton>
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
                  <Button size="icon" variant="outline" className="size-8 shrink-0 group-data-[collapsible=icon]:opacity-0" asChild>
                    <a href="/employees" aria-label="Employees">
                      <UsersIcon />
                    </a>
                  </Button>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {pinnedItems.length ? (
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="shell-kicker">Pinned</p>
            <div className="shell-pin-row">
              {pinnedItems.map((item) => (
                <a key={item.href} href={item.href} className={cn("shell-pin", current(item.href) && "is-active")}>
                  <PinIcon className="size-3" />
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = current(item.href);
                  const pinned = pins.includes(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <a href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                      <button
                        type="button"
                        className="absolute top-1.5 right-1 hidden size-6 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground group-hover/menu-item:grid group-data-[collapsible=icon]:hidden"
                        title={pinned ? "Unpin" : "Pin"}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onTogglePin(item.href);
                        }}
                      >
                        <PinIcon className={cn("size-3", pinned && "fill-current")} />
                      </button>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="shell-dock group-data-[collapsible=icon]:hidden">
          {officeApps.map((app) => {
            const active = appIsActive(app);
            return (
              <Tooltip key={app.id}>
                <TooltipTrigger asChild>
                  <a href={app.href} aria-label={app.label} className={cn(active && "is-active")}>
                    {app.short}
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">{app.label}</TooltipContent>
              </Tooltip>
            );
          })}
          <Tooltip>
            <TooltipTrigger asChild>
              <a href="/documents" aria-label="Documents" className={cn(current("/documents") && "is-active")}>
                DR
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Documents drive</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <a href="/employees" aria-label="Employees" className={cn(current("/employees") && "is-active")}>
                HR
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Employees</TooltipContent>
          </Tooltip>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg grayscale">
                    <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{role.name}</span>
                  </div>
                  <EllipsisVerticalIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56 rounded-lg" side="right" align="end" sideOffset={4}>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function greetingFor(name: string, now = new Date()): string {
  const hour = now.getHours();
  const first = name.trim().split(/\s+/)[0] || "there";
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 18) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
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
  /** Overrides the visible H1 (document title still uses `title`). */
  heading?: string;
  /** When true, H1 becomes a time-of-day greeting using the signed-in user. */
  greet?: boolean;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  /** Wrap page body in the shared nexcrm-surface chrome (default on). */
  surface?: boolean;
  /** Drop inset padding on the surface (directory / drive layouts). */
  surfaceFlush?: boolean;
  children: ReactNode;
}) {
  const [session, setSession] = useState<OfficeSession | undefined>(() => peekOfficeSession() ?? undefined);
  const [pins, setPins] = useState<string[]>(() => readPins());
  const now = useClock();
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

  const pageTitle = title.replace(/^NEXCRM · /, "");
  const crumbs = useMemo(() => crumbsFor(pathname, pageTitle), [pathname, pageTitle]);

  if (!session?.user || !session.role) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-foreground">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Opening office…
        </div>
      </div>
    );
  }

  const groups = groupsFor(session.role.slug === "system_admin");
  const displayHeading = heading ?? (greet ? greetingFor(session.user.name, now) : pageTitle);
  const clockLabel = now.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  function togglePin(href: string) {
    setPins((currentPins) => {
      const next = currentPins.includes(href) ? currentPins.filter((item) => item !== href) : [...currentPins, href];
      writePins(next);
      return next;
    });
  }

  const body = surface ? (
    <div className={cn("nexcrm-surface shell-module", surfaceFlush && "is-flush")}>{children}</div>
  ) : (
    children
  );

  return (
    <OfficeContext.Provider value={session}>
      <TooltipProvider>
        <div className="nexcrm-shell">
          <SidebarProvider
            style={
              {
                "--sidebar-width": "calc(var(--spacing) * 68)",
              } as CSSProperties
            }
          >
            <AppSidebar
              groups={groups}
              session={session}
              canEdit={session.role.canEdit}
              pins={pins}
              onTogglePin={togglePin}
            />
            <SidebarInset className="min-w-0 overflow-x-clip">
              <header className="shell-titlebar print:hidden">
                <div className="shell-titlebar-left">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
                  <nav className="shell-crumbs" aria-label="Breadcrumb">
                    {crumbs.map((crumb, index) => (
                      <span key={`${crumb.label}-${index}`} className="flex items-center gap-0.5">
                        {index > 0 ? <ChevronRightIcon className="size-3 opacity-50" /> : null}
                        {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <strong>{crumb.label}</strong>}
                      </span>
                    ))}
                  </nav>
                  <div className="min-w-0 flex-1 sm:max-w-[12rem] md:max-w-xs lg:max-w-sm">
                    <CommandPalette canEdit={session.role.canEdit} />
                  </div>
                </div>
                <div className="shell-titlebar-right">
                  <span className="shell-chip is-live hidden sm:inline-flex">Online</span>
                  <span className="shell-chip is-accent hidden md:inline-flex">
                    {session.role.canEdit ? "Edit mode" : "Preview"}
                  </span>
                  <span className="shell-chip hidden lg:inline-flex">
                    <Clock3Icon className="size-3" />
                    {clockLabel}
                  </span>
                  <InstallPrompt />
                  <ThemeToggle />
                </div>
              </header>

              <div className="shell-desktop">
                <div className="@container/main shell-window">
                  <div className="shell-window-head print:hidden">
                    <div className="min-w-0">
                      {eyebrow ? <p className="shell-window-eyebrow">{eyebrow}</p> : null}
                      <h1>{displayHeading}</h1>
                      {description ? <p className="shell-window-desc">{description}</p> : null}
                    </div>
                    {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
                  </div>
                  <div className="shell-window-body">{body}</div>
                </div>
              </div>

              <footer className="shell-statusbar print:hidden">
                <span>
                  Path <strong>{pathname}</strong>
                </span>
                <span>
                  Role <strong>{session.role.name}</strong>
                </span>
                <span>
                  Access <strong>{session.role.canEdit ? "Can edit" : "Preview only"}</strong>
                </span>
                <span className="ml-auto inline-flex items-center gap-1">
                  <Clock3Icon className="size-3" />
                  {clockLabel}
                </span>
              </footer>

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
    {
      href: "/",
      label: "Home",
      icon: LayoutDashboardIcon,
      active: pathname === "/",
    },
    {
      href: "/employees",
      label: "People",
      icon: UsersIcon,
      active: pathname.startsWith("/employees"),
    },
    {
      href: "/attendance",
      label: "Attend",
      icon: CalendarCheckIcon,
      active: pathname.startsWith("/attendance"),
    },
    {
      href: "/documents",
      label: "Files",
      icon: FileArchiveIcon,
      active: pathname.startsWith("/documents"),
    },
    isAdmin
      ? {
          href: "/settings",
          label: "Settings",
          icon: SettingsIcon,
          active:
            pathname.startsWith("/settings") ||
            pathname.startsWith("/admin") ||
            pathname.startsWith("/users"),
        }
      : {
          href: "/payroll",
          label: "Payroll",
          icon: WalletIcon,
          active: pathname.startsWith("/payroll"),
        },
  ] as const;

  return (
    <nav className="shell-mobile-nav print:hidden" aria-label="Primary">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <a key={item.href} href={item.href} className={cn(item.active && "is-active")} aria-current={item.active ? "page" : undefined}>
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
