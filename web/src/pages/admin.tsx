import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/field";
import { Banner, Loading, Shell, useOffice } from "@/components/shell";
import { getJson, postJson } from "@/lib/api";

type Role = {
  id: string;
  slug: string;
  name: string;
  canPreview: boolean;
  canEdit: boolean;
  canDelete: boolean;
  systemRole: boolean;
};

type AccessModel = { roles: Role[]; users: unknown[] };

export function AdminPage() {
  return (
    <Shell
      title="NEXCRM · Roles"
      eyebrow="Access"
      description="Roles decide who can preview, edit, and delete. Manage people under Users."
      actions={
        <Button variant="outline" asChild>
          <a href="/users">User management</a>
        </Button>
      }
    >
      <AdminBody />
    </Shell>
  );
}

function AdminBody() {
  const office = useOffice();
  const [model, setModel] = useState<AccessModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (office.role?.slug !== "system_admin") return;
    getJson<AccessModel>("/api/v1/admin/access")
      .then(setModel)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load access."));
  }, [office.role?.slug]);

  if (office.role?.slug !== "system_admin") {
    return <Banner message="Only a system admin can manage roles and people." error />;
  }
  if (!model) return error ? <Banner message={error} error /> : <Loading />;

  function save(url: string, body: Record<string, string>) {
    setPending(true);
    setError(null);
    void postJson(url, body).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not save.");
      setPending(false);
    });
  }

  return (
    <>
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>Built-in roles stay. System admin always keeps every permission. Add another role when the office needs one.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {model.roles.map((role) => (
            <RoleForm key={role.id} role={role} pending={pending} onSave={save} />
          ))}
          <NewRole pending={pending} onSave={save} />
        </CardContent>
      </Card>
    </>
  );
}

function RoleForm({
  role,
  pending,
  onSave,
}: {
  role: Role;
  pending: boolean;
  onSave: (url: string, body: Record<string, string>) => void;
}) {
  const locked = role.slug === "system_admin";
  const [name, setName] = useState(role.name);
  const [canPreview, setCanPreview] = useState(role.canPreview || locked);
  const [canEdit, setCanEdit] = useState(role.canEdit || locked);
  const [canDelete, setCanDelete] = useState(role.canDelete || locked);
  return (
    <form
      className="grid gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(`/api/v1/admin/roles/${role.id}`, {
          name,
          canPreview: String(canPreview),
          canEdit: String(canEdit),
          canDelete: String(canDelete),
        });
      }}
    >
      <TextField id={`role-${role.id}`} label={role.systemRole ? "Built-in role" : "Role name"} value={name} onChange={locked ? () => undefined : setName} />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={canPreview} disabled={locked} onChange={(event) => setCanPreview(event.target.checked)} />
          Preview
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={canEdit} disabled={locked} onChange={(event) => setCanEdit(event.target.checked)} />
          Edit
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={canDelete} disabled={locked} onChange={(event) => setCanDelete(event.target.checked)} />
          Delete
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save role
        </Button>
        {role.systemRole ? null : (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onSave(`/api/v1/admin/roles/${role.id}/delete`, {})}>
            Delete role
          </Button>
        )}
      </div>
    </form>
  );
}

function NewRole({ pending, onSave }: { pending: boolean; onSave: (url: string, body: Record<string, string>) => void }) {
  const [name, setName] = useState("");
  const [canPreview, setCanPreview] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  return (
    <form
      className="grid gap-3 rounded-lg border border-dashed p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave("/api/v1/admin/roles", {
          name,
          canPreview: String(canPreview),
          canEdit: String(canEdit),
          canDelete: String(canDelete),
        });
      }}
    >
      <p className="text-sm font-medium">Add another role</p>
      <TextField id="new-role" label="Role name" value={name} onChange={setName} />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={canPreview} onChange={(event) => setCanPreview(event.target.checked)} /> Preview
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={canEdit} onChange={(event) => setCanEdit(event.target.checked)} /> Edit
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={canDelete} onChange={(event) => setCanDelete(event.target.checked)} /> Delete
        </label>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Add role
      </Button>
    </form>
  );
}
