import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TextField } from "@/components/field";
import { SubmitButton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";

type PortalAccount = {
  userId: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  roleSlug: string;
};

export function PortalAccountsPanel({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<PortalAccount[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  const reload = useCallback(() => {
    void getJson<{ items: PortalAccount[] }>(`/api/v1/companies/${companyId}/portal-accounts`).then((data) =>
      setItems(data.items ?? []),
    );
  }, [companyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  function createAccount(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    void sendJson(`/api/v1/companies/${companyId}/portal-accounts`, "POST", { email, password, name })
      .then(() => {
        toast.success("Portal login saved — user must change password on first sign-in.");
        setPassword("");
        reload();
      })
      .catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : "Could not save login"))
      .finally(() => setPending(false));
  }

  function resetPassword(userId: string) {
    const next = window.prompt("New temporary password (min 8 characters)");
    if (!next) return;
    void sendJson(`/api/v1/portal-accounts/${userId}`, "PATCH", { password: next })
      .then(() => toast.success("Password reset"))
      .catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : "Reset failed"));
  }

  function toggleActive(userId: string, active: boolean) {
    void sendJson(`/api/v1/portal-accounts/${userId}`, "PATCH", { active: !active })
      .then(() => {
        toast.success(active ? "Login disabled" : "Login enabled");
        reload();
      })
      .catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : "Update failed"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal logins</CardTitle>
        <CardDescription>
          External read-only portal (email + password). No self-signup. Forced password change on first login, same as ESS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="grid gap-3 md:grid-cols-3" onSubmit={createAccount}>
          <TextField id="portal-name" label="Contact name" value={name} onChange={setName} />
          <TextField id="portal-email" label="Sign-in email" value={email} onChange={setEmail} />
          <TextField id="portal-password" label="Temporary password" type="password" value={password} onChange={setPassword} />
          <div className="md:col-span-3">
            <SubmitButton pending={pending}>Create or reset login</SubmitButton>
          </div>
        </form>
        {items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <div className="font-medium">{row.email}</div>
                    <div className="text-xs text-muted-foreground">{row.name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.active ? "secondary" : "destructive"}>{row.active ? "Active" : "Disabled"}</Badge>
                    {row.mustChangePassword ? (
                      <span className="ml-2 text-xs text-muted-foreground">Must change password</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => resetPassword(row.userId)}>
                      Reset password
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => toggleActive(row.userId, row.active)}>
                      {row.active ? "Disable" : "Enable"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No portal logins yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
