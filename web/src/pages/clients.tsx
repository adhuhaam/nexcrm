import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";

type Client = {
  id: string;
  legalName: string;
  registrationNumber: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
};

type Draft = {
  id: string | null;
  legalName: string;
  registrationNumber: string;
  country: string;
  phone: string;
  email: string;
};

const blank: Draft = {
  id: null,
  legalName: "",
  registrationNumber: "",
  country: "",
  phone: "",
  email: "",
};

export function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [pending, setPending] = useState(false);

  function reload() {
    getJson<{ clients: Client[] }>("/api/v1/clients")
      .then((data) => setClients(data.clients))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load clients"));
  }

  useEffect(() => {
    reload();
  }, []);

  function openCreate() {
    setDraft(blank);
    setOpen(true);
  }

  function openEdit(client: Client) {
    setDraft({
      id: client.id,
      legalName: client.legalName,
      registrationNumber: client.registrationNumber ?? "",
      country: client.country ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
    });
    setOpen(true);
  }

  async function save() {
    setPending(true);
    try {
      const body = {
        kind: "client",
        legalName: draft.legalName,
        registrationNumber: draft.registrationNumber,
        country: draft.country,
        phone: draft.phone,
        email: draft.email,
      };
      if (draft.id) {
        await sendJson(`/api/v1/companies/${draft.id}`, "PATCH", body);
        toast.success("Client updated");
      } else {
        await sendJson("/api/v1/clients", "POST", body);
        toast.success("Client created");
      }
      setOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save client");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="NEXCRM · Clients"
      eyebrow="Operations"
      description="Client companies that receive seconded staff. Add and edit in a dialog."
      actions={
        <WhenEditing>
          <Button type="button" onClick={openCreate}>
            <PlusIcon />
            Add client
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>Client companies</CardTitle>
          <CardDescription>Click a row to edit. Legal employers stay under Companies.</CardDescription>
        </CardHeader>
        <CardContent>
          {!clients && !error ? <PageSkeleton cards={1} /> : null}
          {clients?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id} className="cursor-pointer" onClick={() => openEdit(client)}>
                    <TableCell className="font-medium">{client.legalName}</TableCell>
                    <TableCell>{client.country ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{client.email ?? client.phone ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {clients && !clients.length ? (
            <ShellEmpty
              icon={<Building2Icon className="size-8 opacity-60" />}
              title="No clients yet"
              description="Add a client company, then allocate employees to it."
              action={
                <WhenEditing>
                  <Button type="button" onClick={openCreate}>
                    Add client
                  </Button>
                </WhenEditing>
              }
            />
          ) : null}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? "Edit client" : "Add client"}
        description="Clients do not need LOA letterhead fields."
        pending={pending}
        submitLabel={draft.id ? "Save changes" : "Create client"}
        onSubmit={save}
        size="md"
      >
        <TextField id="legalName" label="Legal name" value={draft.legalName} onChange={(value) => setDraft((c) => ({ ...c, legalName: value }))} />
        <TextField id="registrationNumber" label="Registration number" value={draft.registrationNumber} onChange={(value) => setDraft((c) => ({ ...c, registrationNumber: value }))} />
        <TextField id="country" label="Country" value={draft.country} onChange={(value) => setDraft((c) => ({ ...c, country: value }))} />
        <TextField id="phone" label="Phone" value={draft.phone} onChange={(value) => setDraft((c) => ({ ...c, phone: value }))} />
        <TextField id="email" label="Email" value={draft.email} onChange={(value) => setDraft((c) => ({ ...c, email: value }))} />
      </FormDialog>
    </Shell>
  );
}
