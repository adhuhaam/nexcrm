import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeftIcon,
  BedDoubleIcon,
  Building2Icon,
  CalendarCheckIcon,
  FileArchiveIcon,
  FileTextIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  PenLineIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  TagsIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { officeApps } from "@/lib/apps";
import { cn } from "@/lib/utils";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  keywords?: string;
  icon: typeof SearchIcon;
  group: "Navigate" | "Create" | "Apps";
};

const navigateItems: PaletteItem[] = [
  { id: "dash", label: "Dashboard", href: "/", icon: LayoutDashboardIcon, group: "Navigate" },
  { id: "companies", label: "Legal employers", href: "/companies", icon: Building2Icon, group: "Navigate", keywords: "companies employers" },
  { id: "employees", label: "Employees", href: "/employees", icon: UsersIcon, group: "Navigate", keywords: "people staff workers permits xpat work permit" },
  { id: "loas", label: "LOAs", href: "/loas", icon: FileTextIcon, group: "Navigate", keywords: "letters appointment" },
  { id: "clients", label: "Clients", href: "/clients", icon: Building2Icon, group: "Navigate" },
  { id: "designations", label: "Designations", href: "/designations", icon: TagsIcon, group: "Navigate", keywords: "roles labor mason steward titles" },
  { id: "allocations", label: "Allocations", href: "/allocations", icon: ArrowRightLeftIcon, group: "Navigate", keywords: "secondment" },
  { id: "attendance", label: "Attendance", href: "/attendance", icon: CalendarCheckIcon, group: "Navigate", keywords: "present absent month sheet ot" },
  { id: "accommodations", label: "Accommodations", href: "/accommodations", icon: BedDoubleIcon, group: "Navigate" },
  { id: "payroll", label: "Payroll", href: "/payroll", icon: WalletIcon, group: "Navigate" },
  { id: "documents", label: "Documents", href: "/documents", icon: FileArchiveIcon, group: "Navigate" },
  { id: "projects", label: "Projects", href: "/projects", icon: FolderKanbanIcon, group: "Navigate" },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
    group: "Navigate",
    keywords: "users roles settings health admin permissions office ocr",
  },
];

const createItems: PaletteItem[] = [
  {
    id: "onboard",
    label: "Onboard employee",
    href: "/employees/onboard",
    icon: UserPlusIcon,
    group: "Create",
    keywords: "passport ocr",
  },
  {
    id: "new-loa",
    label: "New LOA",
    href: "/loas/new",
    icon: PenLineIcon,
    group: "Create",
    keywords: "letter appointment editor",
  },
  {
    id: "new-employee",
    label: "Add employee manually",
    href: "/employees?new=1",
    icon: UsersIcon,
    group: "Create",
  },
];

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function CommandPalette({ canEdit = true }: { canEdit?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "j" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const appItems = useMemo<PaletteItem[]>(
    () =>
      officeApps.map((app) => ({
        id: `app-${app.id}`,
        label: app.label,
        href: app.href,
        icon: ReceiptIcon,
        group: "Apps" as const,
        keywords: app.short,
      })),
    [],
  );

  const groups = useMemo(() => {
    const list: { heading: string; items: PaletteItem[] }[] = [
      { heading: "Navigate", items: navigateItems },
    ];
    if (canEdit) list.push({ heading: "Create", items: createItems });
    if (appItems.length) list.push({ heading: "Apps", items: appItems });
    return list;
  }, [appItems, canEdit]);

  const shortcut = isMac() ? "⌘J" : "Ctrl J";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "relative h-8 w-full justify-start rounded-lg bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-56",
        )}
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4 opacity-70" />
        <span className="inline-flex">Search</span>
        <kbd className="pointer-events-none absolute top-1.5 right-1.5 hidden h-5 items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium select-none sm:flex">
          {shortcut}
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette" description="Search for a command to run…">
        <Command>
          <CommandInput placeholder="Search for a command to run…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {groups.map((group, index) => (
              <div key={group.heading}>
                {index > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={group.heading}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.id}
                        value={`${item.label} ${item.keywords ?? ""} ${item.href}`}
                        onSelect={() => {
                          setOpen(false);
                          window.location.assign(item.href);
                        }}
                      >
                        <Icon />
                        <span>{item.label}</span>
                        {item.group === "Create" ? <CommandShortcut>Go</CommandShortcut> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
