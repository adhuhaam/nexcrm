/** Office modules grouped for role management. Keys are stable API ids. */

export type PermissionAction = "view" | "create" | "edit" | "delete";

export type ModulePermission = {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type AccessModule = {
  key: string;
  label: string;
  description: string;
};

export type AccessCategory = {
  id: string;
  label: string;
  modules: AccessModule[];
};

export const ACCESS_CATEGORIES: AccessCategory[] = [
  {
    id: "workspace",
    label: "Workspace",
    modules: [
      { key: "dashboard", label: "Dashboard", description: "Office overview and headcount cards" },
      { key: "companies", label: "Legal employers", description: "Employer companies and branding" },
      { key: "employees", label: "Employees", description: "People directory, XPAT, photos, onboard" },
      { key: "loas", label: "LOAs", description: "Letters of appointment and editor" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    modules: [
      { key: "clients", label: "Clients", description: "Client companies and designation rates" },
      { key: "designations", label: "Designations", description: "Job titles used across the office" },
      { key: "allocations", label: "Allocations", description: "Second staff to clients, rates, ends" },
      { key: "attendance", label: "Attendance", description: "Daily marks, OT, month sheets" },
      { key: "accommodations", label: "Accommodations", description: "Houses and staff check-in" },
      { key: "payroll", label: "Payroll", description: "Pay runs, salary sheets, payment requests" },
      { key: "documents", label: "Documents", description: "Company file drive and uploads" },
      { key: "projects", label: "Projects", description: "Projects, sites, pools, and slots" },
      { key: "expenses", label: "Finance / Expenses", description: "Staff fees, deposits, and organization outflows" },
    ],
  },
  {
    id: "access",
    label: "Access & system",
    modules: [
      { key: "users", label: "Users", description: "People who sign in to the office" },
      { key: "roles", label: "Roles", description: "Role definitions and module permissions" },
      { key: "settings", label: "Settings", description: "System settings such as OpenAI" },
      { key: "health", label: "Server health", description: "Live health and diagnostics" },
    ],
  },
];

export const ALL_MODULE_KEYS = ACCESS_CATEGORIES.flatMap((category) => category.modules.map((module) => module.key));

export const ACCESS_ONLY_MODULES = new Set(["users", "roles", "settings", "health"]);

export function emptyModulePermission(module: string): ModulePermission {
  return { module, canView: false, canCreate: false, canEdit: false, canDelete: false };
}

export function fullModulePermission(module: string): ModulePermission {
  return { module, canView: true, canCreate: true, canEdit: true, canDelete: true };
}

export function normalizeModulePermission(input: ModulePermission): ModulePermission {
  const canDelete = Boolean(input.canDelete);
  const canEdit = Boolean(input.canEdit) || canDelete;
  const canCreate = Boolean(input.canCreate) || canEdit;
  const canView = Boolean(input.canView) || canCreate;
  return {
    module: input.module,
    canView,
    canCreate,
    canEdit,
    canDelete,
  };
}

export function permissionsFromFlags(
  modules: string[],
  flags: { canPreview: boolean; canEdit: boolean; canDelete: boolean },
  options?: { accessModules?: "full" | "none" | "view" },
): ModulePermission[] {
  const accessMode = options?.accessModules ?? "none";
  return modules.map((module) => {
    if (ACCESS_ONLY_MODULES.has(module)) {
      if (accessMode === "full") return fullModulePermission(module);
      if (accessMode === "view") {
        return { module, canView: true, canCreate: false, canEdit: false, canDelete: false };
      }
      return emptyModulePermission(module);
    }
    return normalizeModulePermission({
      module,
      canView: flags.canPreview || flags.canEdit || flags.canDelete,
      canCreate: flags.canEdit || flags.canDelete,
      canEdit: flags.canEdit || flags.canDelete,
      canDelete: flags.canDelete,
    });
  });
}

export function aggregateFlags(permissions: ModulePermission[]): {
  canPreview: boolean;
  canEdit: boolean;
  canDelete: boolean;
} {
  const operational = permissions.filter((item) => !ACCESS_ONLY_MODULES.has(item.module));
  const source = operational.length ? operational : permissions;
  return {
    canPreview: source.some((item) => item.canView),
    canEdit: source.some((item) => item.canCreate || item.canEdit),
    canDelete: source.some((item) => item.canDelete),
  };
}

/** Map request path → module key for authorize(). */
export function moduleForPath(path: string): string | null {
  if (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/api/v1/admin/access" ||
    path.startsWith("/api/v1/admin/roles") ||
    path.startsWith("/api/v1/admin/finance-rates") ||
    path.startsWith("/api/v1/admin/deposit-rates")
  ) {
    return "roles";
  }
  if (path === "/users" || path.startsWith("/users/") || path.startsWith("/api/v1/admin/users")) {
    return "users";
  }
  if (path === "/settings/health" || path.startsWith("/settings/health") || path === "/api/v1/admin/health") {
    return "health";
  }
  if (path === "/settings" || path.startsWith("/settings/") || path === "/api/v1/admin/settings") {
    return "settings";
  }
  if (path === "/" || path === "/api/v1/hr/dashboard") return "dashboard";
  if (path.startsWith("/companies") || path.startsWith("/api/v1/companies") || path.startsWith("/api/v1/employers")) {
    return "companies";
  }
  if (
    path.startsWith("/employees") ||
    path.startsWith("/api/v1/employees") ||
    path.startsWith("/api/v1/hr/employees") ||
    path.startsWith("/work-permits") ||
    path.startsWith("/api/v1/work-permits") ||
    path.startsWith("/api/v1/xpat")
  ) {
    return "employees";
  }
  if (path.startsWith("/loas") || path.startsWith("/api/v1/letters") || path.startsWith("/api/v1/loas")) {
    return "loas";
  }
  if (path.startsWith("/clients") || path.startsWith("/api/v1/clients")) return "clients";
  if (path.startsWith("/designations") || path.startsWith("/api/v1/designations")) return "designations";
  if (path.startsWith("/allocations") || path.startsWith("/api/v1/allocations")) return "allocations";
  if (
    path.startsWith("/attendance") ||
    path.startsWith("/api/v1/attendance") ||
    path.startsWith("/api/v1/ot")
  ) {
    return "attendance";
  }
  if (path.startsWith("/accommodations") || path.startsWith("/api/v1/accommodations")) {
    return "accommodations";
  }
  if (path.startsWith("/payroll") || path.startsWith("/api/v1/pay-runs") || path.startsWith("/api/v1/payroll")) {
    return "payroll";
  }
  if (path.startsWith("/documents") || path.startsWith("/api/v1/files")) return "documents";
  if (path.startsWith("/projects") || path.startsWith("/api/v1/projects")) return "projects";
  if (path.startsWith("/apps/expenses") || path.startsWith("/api/v1/expenses")) return "expenses";
  if (path.startsWith("/api/v1/hr")) return "employees";
  return null;
}

export function actionForRequest(method: string, path: string): PermissionAction {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return "view";
  if (verb === "DELETE") return "delete";
  // Collection creates vs item updates — treat bare resource POSTs as create.
  if (verb === "POST") {
    const createRoots = [
      "/api/v1/employees",
      "/api/v1/companies",
      "/api/v1/clients",
      "/api/v1/designations",
      "/api/v1/allocations",
      "/api/v1/projects",
      "/api/v1/accommodations",
      "/api/v1/pay-runs",
      "/api/v1/expenses",
      "/api/v1/letters",
      "/api/v1/loas",
      "/api/v1/files",
      "/api/v1/admin/users",
      "/api/v1/admin/roles",
      "/employees",
      "/companies",
      "/clients",
      "/projects",
      "/loas",
      "/loas/new",
      "/employees/new",
      "/employees/onboard",
    ];
    if (createRoots.some((root) => path === root || path === `${root}/`)) return "create";
    if (/\/new$/.test(path)) return "create";
  }
  return "edit";
}
