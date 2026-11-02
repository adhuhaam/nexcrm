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
  BriefcaseBusinessIcon,
  Building2Icon,
  EllipsisVerticalIcon,
  FileArchiveIcon,
  FileTextIcon,
  FolderKanbanIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PenLineIcon,
  PlusCircleIcon,
  SettingsIcon,
  ShieldIcon,
  UserRoundPenIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { getJson, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type NavGroup = { label: string; items: NavItem[] };

const workspaceNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/companies", label: "Companies", icon: Building2Icon },
  { href: "/employees", label: "Employees", icon: UsersIcon },
  { href: "/loas", label: "LOAs", icon: FileTextIcon },
  { href: "/loas/new", label: "LOA editor", icon: PenLineIcon },
];

const operationsNav: NavItem[] = [
  { href: "/clients", label: "Clients", icon: Building2Icon },
  { href: "/allocations", label: "Allocations", icon: ArrowRightLeftIcon },
  { href: "/accommodations", label: "Accommodations", icon: BedDoubleIcon },
  { href: "/payroll", label: "Payroll", icon: WalletIcon },
  { href: "/documents", label: "Documents", icon: FileArchiveIcon },
  { href: "/work-permits", label: "Work permits", icon: IdCardIcon },
  { href: "/projects", label: "Projects", icon: FolderKanbanIcon },
];

const accessNav: NavItem[] = [
  { href: "/users", label: "Users", icon: BriefcaseBusinessIcon },
  { href: "/admin", label: "Roles", icon: ShieldIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export type OfficeSession = {
  user: { id: string; name: string; email: string } | null;
  role?: {
    id: string;
    slug: string;
    name: string;
    canPreview: boolean;
    canEdit: boolean;
    canDelete: boolean;
    systemRole: boolean;
  };
};

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
  return path === href || path.startsWith(`${href}/`);
}

function groupsFor(isAdmin: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    { label: "Workspace", items: workspaceNav },
    { label: "Operations", items: operationsNav },
  ];
  if (isAdmin) groups.push({ label: "Access", items: accessNav });
  return groups;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <a href="/">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                  NX
                </span>
                <span className="text-base font-semibold tracking-tight">NEXCRM</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                        className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
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

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = current(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
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
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <EllipsisVerticalIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side="right"
                align="end"
                sideOffset={4}
              >
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
                    <DropdownMenuItem onClick={() => window.location.assign("/users")}>
                      <UsersIcon />
                      User management
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.location.assign("/admin")}>
                      <ShieldIcon />
                      Roles
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.location.assign("/settings")}>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function Shell({
  title,
  eyebrow,
  description,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [session, setSession] = useState<OfficeSession | undefined>(undefined);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    getJson<OfficeSession>("/api/v1/session")
      .then((next) => {
        if (!next.user) {
          window.location.assign("/login");
          return;
        }
        setSession(next);
      })
      .catch(() => {
        window.location.assign("/login");
      });
  }, []);

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
  const pageTitle = title.replace(/^NEXCRM · /, "");

  return (
    <OfficeContext.Provider value={session}>
      <TooltipProvider>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 68)",
            } as CSSProperties
          }
        >
          <AppSidebar groups={groups} session={session} canEdit={session.role.canEdit} />
          <SidebarInset
            className={cn(
              "[--dashboard-header-height:--spacing(12)]",
              "min-w-0 overflow-x-clip",
            )}
          >
            <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background/50 backdrop-blur-md transition-[width,height] ease-linear print:hidden">
              <div className="flex w-full items-center justify-between px-4 lg:px-6">
                <div className="flex min-w-0 items-center gap-1 lg:gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                  />
                  <p className="truncate text-sm font-medium">{pageTitle}</p>
                </div>
                <div className="flex items-center gap-1">
                  <InstallPrompt />
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+4.5rem))] md:p-6 md:pb-6">
              <div className="@container/main page-enter flex flex-col gap-4 md:gap-6">
                <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
                  <div className="grid min-w-0 gap-1">
                    {eyebrow ? (
                      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{eyebrow}</p>
                    ) : null}
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{pageTitle}</h1>
                    {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
                  </div>
                  {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
                </div>
                <div className="page-enter grid min-w-0 gap-4 md:gap-6 [animation-delay:40ms]">{children}</div>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
      <MobileInstallBanner />
    </OfficeContext.Provider>
  );
}

export function WhenEditing({ children }: { children: ReactNode }) {
  const office = useOffice();
  if (!office.role?.canEdit) {
    return <p className="text-sm text-muted-foreground">Your role can preview this office. Editing is turned off.</p>;
  }
  return children;
}

export function Banner({ message, error = false }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return (
    <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"}>
      <AlertDescription className={error ? undefined : "text-foreground"}>{message}</AlertDescription>
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
