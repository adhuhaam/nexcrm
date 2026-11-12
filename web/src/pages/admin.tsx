import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, PlusIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/field";
import { Banner, Loading, useOffice } from "@/components/shell";
import { getJson, sendJson } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ModulePermission } from "@/lib/session";
import "./admin.css";

type Role = {
  id: string;
  slug: string;
  name: string;
  canPreview: boolean;
  canEdit: boolean;
  canDelete: boolean;
  systemRole: boolean;
  permissions: ModulePermission[];
};

type CatalogModule = { key: string; label: string; description: string };
type CatalogCategory = { id: string; label: string; modules: CatalogModule[] };

type AccessModel = {
  roles: Role[];
  users: { id: string; role: { id: string } }[];
  actorId: string;
  catalog: { categories: CatalogCategory[]; actions: string[] };
};

type ActionKey = "canView" | "canCreate" | "canEdit" | "canDelete";

const ACTIONS: { key: ActionKey; label: string; hint: string }[] = [
  { key: "canView", label: "View", hint: "Open and read" },
  { key: "canCreate", label: "Create", hint: "Add new records" },
  { key: "canEdit", label: "Edit", hint: "Change existing" },
  { key: "canDelete", label: "Delete", hint: "Remove records" },
];

const ACCESS_MODULES = new Set(["users", "roles", "settings", "health"]);

function emptyPerm(module: string): ModulePermission {
  return { module, canView: false, canCreate: false, canEdit: false, canDelete: false };
}

function normalizeRow(row: ModulePermission): ModulePermission {
  const canDelete = row.canDelete;
  const canEdit = row.canEdit || canDelete;
  const canCreate = row.canCreate || canEdit;
  const canView = row.canView || canCreate;
  return { module: row.module, canView, canCreate, canEdit, canDelete };
}

function permissionsForCatalog(
  categories: CatalogCategory[],
  existing?: ModulePermission[],
  full = false,
): ModulePermission[] {
  const byKey = new Map((existing ?? []).map((item) => [item.module, item]));
  return categories.flatMap((category) =>
    category.modules.map((module) => {
      if (full) {
        return { module: module.key, canView: true, canCreate: true, canEdit: true, canDelete: true };
      }
      return normalizeRow(byKey.get(module.key) ?? emptyPerm(module.key));
    }),
  );
}

function countGranted(permissions: ModulePermission[]): number {
  return permissions.reduce((sum, row) => {
    return sum + Number(row.canView) + Number(row.canCreate) + Number(row.canEdit) + Number(row.canDelete);
  }, 0);
}

function applyAction(row: ModulePermission, action: ActionKey, value: boolean): ModulePermission {
  const next = { ...row, [action]: value };
  if (value) {
    if (action === "canDelete") {
      next.canEdit = true;
      next.canCreate = true;
      next.canView = true;
    } else if (action === "canEdit") {
      next.canCreate = true;
      next.canView = true;
    } else if (action === "canCreate") {
      next.canView = true;
    }
  } else if (action === "canView") {
    next.canCreate = false;
    next.canEdit = false;
    next.canDelete = false;
  } else if (action === "canCreate") {
    next.canEdit = false;
    next.canDelete = false;
  } else if (action === "canEdit") {
    next.canDelete = false;
  }
  return normalizeRow(next);
}

export function RolesPanel() {
  const office = useOffice();
  const [model, setModel] = useState<AccessModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<ModulePermission[]>([]);
  const [creating, setCreating] = useState(false);

  async function reload(preferId?: string | null) {
    const data = await getJson<AccessModel>("/api/v1/admin/access");
    setModel(data);
    const nextId =
      preferId && data.roles.some((role) => role.id === preferId) ? preferId : (data.roles[0]?.id ?? null);
    setSelectedId(nextId);
    const role = data.roles.find((item) => item.id === nextId) ?? null;
    setCreating(false);
    setDraftName(role?.name ?? "");
    setDraftPermissions(
      permissionsForCatalog(data.catalog.categories, role?.permissions, role?.slug === "system_admin"),
    );
  }

  useEffect(() => {
    if (office.role?.slug !== "system_admin") return;
    reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load access."));
  }, [office.role?.slug]);

  const selected = useMemo(
    () => model?.roles.find((role) => role.id === selectedId) ?? null,
    [model, selectedId],
  );

  const usersOnRole = useMemo(() => {
    if (!model || !selected) return 0;
    return model.users.filter((user) => user.role.id === selected.id).length;
  }, [model, selected]);

  if (office.role?.slug !== "system_admin") {
    return <Banner message="Only a system admin can manage roles and people." error />;
  }
  if (!model) return error ? <Banner message={error} error /> : <Loading />;

  function selectRole(role: Role) {
    setCreating(false);
    setSelectedId(role.id);
    setDraftName(role.name);
    setDraftPermissions(
      permissionsForCatalog(model!.catalog.categories, role.permissions, role.slug === "system_admin"),
    );
    setError(null);
  }

  function startCreate() {
    setCreating(true);
    setSelectedId(null);
    setDraftName("");
    setDraftPermissions(permissionsForCatalog(model!.catalog.categories));
    setError(null);
  }

  function setAction(module: string, action: ActionKey, value: boolean) {
    setDraftPermissions((current) =>
      current.map((row) => (row.module === module ? applyAction(row, action, value) : row)),
    );
  }

  function grantCategoryFull(category: CatalogCategory) {
    const keys = new Set(category.modules.map((module) => module.key));
    setDraftPermissions((current) =>
      current.map((row) => {
        if (!keys.has(row.module)) return row;
        if (ACCESS_MODULES.has(row.module) && selected?.slug !== "system_admin" && !creating) return row;
        return applyAction(row, "canDelete", true);
      }),
    );
  }

  function clearCategory(category: CatalogCategory) {
    const keys = new Set(category.modules.map((module) => module.key));
    setDraftPermissions((current) =>
      current.map((row) => {
        if (!keys.has(row.module)) return row;
        if (ACCESS_MODULES.has(row.module) && selected?.slug !== "system_admin" && !creating) return row;
        return applyAction(row, "canView", false);
      }),
    );
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      if (creating) {
        const created = await sendJson<{ role?: Role }>("/api/v1/admin/roles", "POST", {
          name: draftName,
          permissions: draftPermissions,
        });
        toast.success("Role created");
        await reload(created.role?.id ?? null);
      } else if (selected) {
        await sendJson(`/api/v1/admin/roles/${selected.id}`, "POST", {
          name: draftName,
          permissions: draftPermissions,
        });
        toast.success("Role saved");
        await reload(selected.id);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save role.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function removeRole() {
    if (!selected || selected.systemRole) return;
    if (!window.confirm(`Delete role “${selected.name}”? People must be moved off it first.`)) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/admin/roles/${selected.id}/delete`, "POST", {});
      toast.success("Role deleted");
      await reload();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not delete role.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  function duplicateAsNew() {
    if (!selected || !model) return;
    setCreating(true);
    setSelectedId(null);
    setDraftName(`${selected.name} copy`);
    setDraftPermissions(
      permissionsForCatalog(model.catalog.categories, selected.permissions).map((row) =>
        ACCESS_MODULES.has(row.module) ? emptyPerm(row.module) : row,
      ),
    );
  }

  const lockedAdmin = !creating && selected?.slug === "system_admin";
  const granted = countGranted(draftPermissions);

  return (
    <div className="jacms-admin">
      <Banner message={error} error />
      <div className="nx-layout is-duo">
        <aside className="nx-rail">
          <p className="nx-label">Roles</p>
          <button type="button" className={cn("nx-nav", creating && "is-active")} onClick={startCreate}>
            <span className="nx-glyph">
              <PlusIcon />
            </span>
            <span>New role</span>
          </button>
          <div className="nx-chip-row" style={{ padding: "0.35rem 0.55rem" }}>
            <span className="nx-stat">{model.roles.length} roles</span>
          </div>
          {model.roles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={cn("nx-nav", !creating && selectedId === role.id && "is-active")}
              onClick={() => selectRole(role)}
            >
              <span className="nx-glyph">
                <ShieldIcon />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate">{role.name}</span>
                <span className="block truncate text-[0.65rem] text-muted-foreground">{role.slug}</span>
              </span>
              <span className="nx-nav-count">{countGranted(role.permissions)}</span>
            </button>
          ))}
        </aside>

        <section className="nx-main">
          <div className="admin-toolbar">
            <div className="min-w-0 flex-1">
              <TextField
                id="role-name"
                label={creating ? "New role name" : lockedAdmin ? "System admin" : "Role name"}
                value={draftName}
                onChange={lockedAdmin ? () => undefined : setDraftName}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {selected?.systemRole ? <Badge variant="secondary">Built-in</Badge> : null}
                {creating ? <Badge variant="outline">New</Badge> : null}
                {!creating && selected && !selected.systemRole ? <Badge variant="outline">Custom</Badge> : null}
                {lockedAdmin ? <Badge>Full access</Badge> : null}
                {!creating && selected ? (
                  <span className="text-xs text-muted-foreground">
                    {usersOnRole} user{usersOnRole === 1 ? "" : "s"} · {granted} permissions enabled
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{granted} permissions enabled</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!creating && selected ? (
                <Button type="button" variant="outline" disabled={pending} onClick={duplicateAsNew}>
                  <CopyIcon />
                  Duplicate
                </Button>
              ) : null}
              {!creating && selected && !selected.systemRole ? (
                <Button type="button" variant="outline" disabled={pending} onClick={() => void removeRole()}>
                  <Trash2Icon />
                  Delete
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={pending || (!creating && !selected) || !draftName.trim()}
                onClick={() => void save()}
              >
                <CheckIcon />
                {creating ? "Create role" : "Save role"}
              </Button>
            </div>
          </div>

          {lockedAdmin ? (
            <p className="admin-hint">
              System admin always keeps every module permission. Other roles use the matrix below — Access &amp; system stays
              admin-only.
            </p>
          ) : (
            <p className="admin-hint">
              Toggle View / Create / Edit / Delete per module. Higher rights imply lower ones. Access &amp; system modules stay
              locked to system admin.
            </p>
          )}

          <div className="admin-matrix">
            {model.catalog.categories.map((category) => (
              <section key={category.id} className="admin-category">
                <header className="admin-category-head">
                  <div>
                    <h3>{category.label}</h3>
                    <p>{category.modules.length} modules</p>
                  </div>
                  {!lockedAdmin ? (
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => grantCategoryFull(category)}>
                        All
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => clearCategory(category)}>
                        Clear
                      </Button>
                    </div>
                  ) : null}
                </header>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        {ACTIONS.map((action) => (
                          <th key={action.key} title={action.hint}>
                            {action.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {category.modules.map((module) => {
                        const row = draftPermissions.find((item) => item.module === module.key) ?? emptyPerm(module.key);
                        const accessLocked = ACCESS_MODULES.has(module.key) && !lockedAdmin;
                        const disabled = lockedAdmin || accessLocked;
                        return (
                          <tr key={module.key}>
                            <td>
                              <div className="admin-module">
                                <strong>{module.label}</strong>
                                <span>{module.description}</span>
                              </div>
                            </td>
                            {ACTIONS.map((action) => (
                              <td key={action.key}>
                                <label className={cn("admin-check", (lockedAdmin || row[action.key]) && "is-on", disabled && "is-locked")}>
                                  <input
                                    type="checkbox"
                                    checked={lockedAdmin ? true : row[action.key]}
                                    disabled={disabled}
                                    onChange={(event) => setAction(module.key, action.key, event.target.checked)}
                                  />
                                  <span />
                                </label>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

type FeeSettings = {
  id: string;
  workPermitMonthly: string;
  insuranceYearly: string;
  medicalYearly: string;
  currency: string;
};

type DepositRate = {
  id: string;
  countryName: string;
  isoCode: string;
  amount: string;
};

export function FinanceRatesPanel() {
  const office = useOffice();
  const [fees, setFees] = useState<FeeSettings | null>(null);
  const [rates, setRates] = useState<DepositRate[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wp, setWp] = useState("");
  const [insurance, setInsurance] = useState("");
  const [medical, setMedical] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newIso, setNewIso] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});

  async function reloadRates(search = q) {
    const data = await getJson<{ rates: DepositRate[] }>(
      `/api/v1/admin/deposit-rates${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`,
    );
    setRates(data.rates);
    setEditAmounts(Object.fromEntries(data.rates.map((row) => [row.id, row.amount])));
  }

  useEffect(() => {
    if (office.role?.slug !== "system_admin") return;
    Promise.all([
      getJson<FeeSettings>("/api/v1/admin/finance-rates"),
      getJson<{ rates: DepositRate[] }>("/api/v1/admin/deposit-rates"),
    ])
      .then(([feeData, rateData]) => {
        setFees(feeData);
        setWp(feeData.workPermitMonthly);
        setInsurance(feeData.insuranceYearly);
        setMedical(feeData.medicalYearly);
        setRates(rateData.rates);
        setEditAmounts(Object.fromEntries(rateData.rates.map((row) => [row.id, row.amount])));
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Could not load finance rates.");
      });
  }, [office.role?.slug]);

  if (office.role?.slug !== "system_admin") {
    return <Banner message="Only a system admin can edit finance rates." error />;
  }
  if (!fees && !error) return <Loading />;
  if (error && !fees) return <Banner message={error} error />;

  async function saveFees() {
    setPending(true);
    try {
      const next = await sendJson<FeeSettings>("/api/v1/admin/finance-rates", "POST", {
        workPermitMonthly: wp,
        insuranceYearly: insurance,
        medicalYearly: medical,
      });
      setFees(next);
      setWp(next.workPermitMonthly);
      setInsurance(next.insuranceYearly);
      setMedical(next.medicalYearly);
      toast.success("Finance fee rates saved");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save fee rates");
    } finally {
      setPending(false);
    }
  }

  async function saveDeposit(row: DepositRate) {
    setPending(true);
    try {
      await sendJson("/api/v1/admin/deposit-rates", "POST", {
        id: row.id,
        countryName: row.countryName,
        isoCode: row.isoCode,
        amount: editAmounts[row.id] ?? row.amount,
      });
      toast.success(`Updated ${row.countryName}`);
      await reloadRates();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not update deposit rate");
    } finally {
      setPending(false);
    }
  }

  async function addDeposit() {
    setPending(true);
    try {
      await sendJson("/api/v1/admin/deposit-rates", "POST", {
        countryName: newCountry,
        isoCode: newIso,
        amount: newAmount,
      });
      toast.success("Deposit rate added");
      setNewCountry("");
      setNewIso("");
      setNewAmount("");
      await reloadRates();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not add deposit rate");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Banner message={error} error />
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Staff fee rates</h2>
            <p className="text-sm text-muted-foreground">
              Defaults used when posting work permits and annual insurance/medical.
            </p>
          </div>
          <Button type="button" disabled={pending} onClick={() => void saveFees()}>
            <CheckIcon />
            Save fee rates
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField id="fee-wp" label="Work permit / month (MVR)" value={wp} onChange={setWp} />
          <TextField
            id="fee-ins"
            label="Insurance / year (MVR)"
            value={insurance}
            onChange={setInsurance}
          />
          <TextField id="fee-med" label="Medical / year (MVR)" value={medical} onChange={setMedical} />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">WP deposit rates (XPAT)</h2>
            <p className="text-sm text-muted-foreground">
              One-time deposit by nationality when an employee is created or onboarded.
            </p>
          </div>
          <TextField id="deposit-q" label="Search countries" value={q} onChange={setQ} />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void reloadRates(q).catch((reason: unknown) => toast.error(String(reason)))}
          >
            Search
          </Button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <TextField id="new-country" label="Country" value={newCountry} onChange={setNewCountry} />
          <TextField id="new-iso" label="ISO" value={newIso} onChange={setNewIso} />
          <TextField id="new-amount" label="Amount (MVR)" value={newAmount} onChange={setNewAmount} />
          <div className="flex items-end">
            <Button type="button" className="w-full" disabled={pending} onClick={() => void addDeposit()}>
              <PlusIcon />
              Add country
            </Button>
          </div>
        </div>

        <div className="admin-table-wrap max-h-[28rem] overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>ISO</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rates.map((row) => (
                <tr key={row.id}>
                  <td>{row.countryName}</td>
                  <td className="font-mono text-xs">{row.isoCode}</td>
                  <td>
                    <input
                      className="w-28 rounded-md border bg-background px-2 py-1 tabular-nums text-sm"
                      value={editAmounts[row.id] ?? row.amount}
                      onChange={(event) =>
                        setEditAmounts((current) => ({ ...current, [row.id]: event.target.value }))
                      }
                      aria-label={`Amount for ${row.countryName}`}
                    />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatMoney(editAmounts[row.id] ?? row.amount, fees?.currency ?? "MVR")}
                    </span>
                  </td>
                  <td className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void saveDeposit(row)}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
