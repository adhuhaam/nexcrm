import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UsersIcon } from "lucide-react";
import { Banner, Loading, useOffice } from "@/components/shell";
import { SelectField, TextField } from "@/components/field";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getJson, sendJson } from "@/lib/api";

type Role = {
  id: string;
  slug: string;
  name: string;
  canPreview: boolean;
  canEdit: boolean;
  canDelete: boolean;
  systemRole: boolean;
};

type ClientOption = { id: string; legalName: string };

type Person = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: Role;
  scopedClientIds: string[] | null;
};

type AccessModel = { roles: Role[]; users: Person[]; clients: ClientOption[]; actorId: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function ClientScopePicker({
  clients,
  selected,
  onChange,
}: {
  clients: ClientOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Restaurant clients</legend>
      <p className="text-xs text-muted-foreground">
        Limit this person to selected clients (restaurants). Leave empty for no client data. System admin ignores this.
      </p>
      <div className="max-h-40 space-y-1 overflow-auto">
        {clients.map((client) => {
          const checked = selected.includes(client.id);
          return (
            <label key={client.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (event.target.checked) onChange([...selected, client.id]);
                  else onChange(selected.filter((id) => id !== client.id));
                }}
              />
              <span className="truncate">{client.legalName}</span>
            </label>
          );
        })}
        {!clients.length ? <p className="text-xs text-muted-foreground">No client companies yet.</p> : null}
      </div>
    </fieldset>
  );
}

export function UsersPanel() {
  const office = useOffice();
  const [model, setModel] = useState<AccessModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);

  async function reload() {
    const data = await getJson<AccessModel>("/api/v1/admin/access");
    setModel(data);
  }

  useEffect(() => {
    if (office.role?.slug !== "system_admin") return;
    reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load users."));
  }, [office.role?.slug]);

  const clientsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of model?.clients ?? []) map.set(client.id, client.legalName);
    return map;
  }, [model]);

  const filtered = useMemo(() => {
    if (!model) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return model.users;
    return model.users.filter(
      (person) =>
        person.name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle) ||
        person.role.name.toLowerCase().includes(needle),
    );
  }, [model, q]);

  if (office.role?.slug !== "system_admin") {
    return <Banner message="Only a system admin can manage users." error />;
  }
  if (!model) return error ? <Banner message={error} error /> : <Loading />;

  async function save(url: string, body: Record<string, unknown>, success: string) {
    setPending(true);
    setError(null);
    try {
      await sendJson(url, "POST", body);
      toast.success(success);
      setCreateOpen(false);
      setEditing(null);
      await reload();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Banner message={error} error />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="size-4" />
              Office users
            </CardTitle>
            <CardDescription>
              {model.users.length} account{model.users.length === 1 ? "" : "s"} ·{" "}
              {model.users.filter((u) => u.active).length} active
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Add user
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search name, email or role"
            aria-label="Search users"
          />
          {filtered.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Restaurants</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback>{initials(person.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{person.role.name}</TableCell>
                    <TableCell className="max-w-[14rem] text-xs text-muted-foreground">
                      {person.scopedClientIds === null
                        ? "All (admin)"
                        : person.scopedClientIds.length
                          ? person.scopedClientIds.map((id) => clientsById.get(id) ?? id).join(", ")
                          : "None assigned"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={person.active ? "secondary" : "outline"}>
                        {person.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(person)}>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No users match this search.</p>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        roles={model.roles}
        clients={model.clients}
        pending={pending}
        onOpenChange={setCreateOpen}
        onSave={(url, body) => void save(url, body, "User created")}
      />
      <EditUserDialog
        person={editing}
        roles={model.roles}
        clients={model.clients}
        actorId={model.actorId}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSave={(url, body) => void save(url, body, "User saved")}
      />
    </>
  );
}

function CreateUserDialog({
  open,
  roles,
  clients,
  pending,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  roles: Role[];
  clients: ClientOption[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (url: string, body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(roles.find((role) => role.slug === "manager")?.id ?? roles[0]?.id ?? "");
  const [clientIds, setClientIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword("");
    setRoleId(roles.find((role) => role.slug === "manager")?.id ?? roles[0]?.id ?? "");
    setClientIds([]);
  }, [open, roles]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Assign restaurant clients so managers only see their own payroll and staff.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave("/api/v1/admin/users", { name, email, password, roleId, clientCompanyIds: clientIds });
          }}
        >
          <TextField id="new-user-name" label="Name" value={name} onChange={setName} />
          <TextField id="new-user-email" label="Email" value={email} onChange={setEmail} />
          <TextField
            id="new-user-password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            hint="At least 8 characters."
          />
          <SelectField id="new-user-role" label="Role" value={roleId} onChange={setRoleId}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </SelectField>
          <ClientScopePicker clients={clients} selected={clientIds} onChange={setClientIds} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  person,
  roles,
  clients,
  actorId,
  pending,
  onOpenChange,
  onSave,
}: {
  person: Person | null;
  roles: Role[];
  clients: ClientOption[];
  actorId: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (url: string, body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");
  const [clientIds, setClientIds] = useState<string[]>([]);

  useEffect(() => {
    if (!person) return;
    setName(person.name);
    setRoleId(person.role.id);
    setActive(person.active);
    setPassword("");
    setClientIds(person.scopedClientIds ?? []);
  }, [person]);

  return (
    <Dialog open={Boolean(person)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage user</DialogTitle>
          <DialogDescription>
            {person?.email}
            {person?.id === actorId ? " · This is your account." : ""}
          </DialogDescription>
        </DialogHeader>
        {person ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave(`/api/v1/admin/users/${person.id}`, {
                name,
                roleId,
                active: String(active),
                password,
                clientCompanyIds: clientIds,
              });
            }}
          >
            <TextField id={`edit-name-${person.id}`} label="Name" value={name} onChange={setName} />
            <SelectField id={`edit-role-${person.id}`} label="Role" value={roleId} onChange={setRoleId}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </SelectField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              Active account
            </label>
            <ClientScopePicker clients={clients} selected={clientIds} onChange={setClientIds} />
            <TextField
              id={`edit-password-${person.id}`}
              label="Reset password"
              type="password"
              value={password}
              onChange={setPassword}
              hint="Leave blank to keep the current password."
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save user
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
