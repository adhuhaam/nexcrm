import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2Icon, MailIcon, MapPinIcon, PhoneIcon, PlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaField, TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson, sendJson } from "@/lib/api";

type Client = {
  id: string;
  legalName: string;
  registrationNumber: string | null;
  tinNumber: string | null;
  registeredAddress: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  employeeCount?: number;
};

type Draft = {
  legalName: string;
  registrationNumber: string;
  tinNumber: string;
  registeredAddress: string;
  country: string;
  phone: string;
  email: string;
};

const blank: Draft = {
  legalName: "",
  registrationNumber: "",
  tinNumber: "",
  registeredAddress: "",
  country: "",
  phone: "",
  email: "",
};

export function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [pending, setPending] = useState(false);

  function reload() {
    Promise.all([
      getJson<{ clients: Client[] }>("/api/v1/clients"),
      getJson<{
        headcount?: Array<{ clientCompanyId: string; activeCount: number }>;
      }>("/api/v1/allocations").catch(() => ({
        headcount: [] as Array<{ clientCompanyId: string; activeCount: number }>,
      })),
    ])
      .then(([clientsData, allocData]) => {
        const byClient = new Map(
          (allocData.headcount ?? []).map((row) => [row.clientCompanyId, row.activeCount]),
        );
        setClients(
          clientsData.clients.map((client) => ({
            ...client,
            employeeCount: byClient.get(client.id) ?? client.employeeCount ?? 0,
          })),
        );
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load clients"));
  }

  useEffect(() => {
    reload();
  }, []);

  const filteredClients = (() => {
    if (!clients) return null;
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) =>
      [client.legalName, client.registrationNumber, client.country, client.email, client.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  })();

  async function createClient() {
    setPending(true);
    try {
      const created = await sendJson<{ id: string }>("/api/v1/clients", "POST", {
        kind: "client",
        ...draft,
      });
      toast.success("Client created");
      setOpen(false);
      window.location.assign(`/clients/${created.id}`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not create client");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="JACMS · Clients"
      eyebrow="Operations"
      description="Bill and place staff here — open a client for employees, details, and monthly rates."
      actions={
        <WhenEditing>
          <Button
            type="button"
            onClick={() => {
              setDraft(blank);
              setOpen(true);
            }}
          >
            <PlusIcon />
            Add client
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField value={q} onChange={setQ} placeholder="Search clients…" label="Search clients" />
          {filteredClients ? (
            <p className="shrink-0 text-sm text-muted-foreground">
              {filteredClients.length} client{filteredClients.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        {!filteredClients && !error ? <PageSkeleton cards={6} /> : null}

        {filteredClients?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredClients.map((client) => (
              <a
                key={client.id}
                href={`/clients/${client.id}`}
                className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full hover:bg-muted/40">
                  <CardHeader className="gap-2 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{client.legalName}</CardTitle>
                      <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <CardDescription className="truncate">
                      {client.registrationNumber ?? "No registration"}
                      {client.tinNumber ? ` · TIN ${client.tinNumber}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                      <UsersIcon className="size-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Staff allocated</p>
                        <p className="text-sm font-semibold tabular-nums">{client.employeeCount ?? 0}</p>
                      </div>
                    </div>
                    <div className="grid gap-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2 truncate">
                        <MapPinIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{client.country ?? "No country"}</span>
                      </div>
                      <div className="flex items-center gap-2 truncate">
                        <MailIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{client.email ?? "No email"}</span>
                      </div>
                      <div className="flex items-center gap-2 truncate">
                        <PhoneIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{client.phone ?? "No phone"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        ) : null}

        {filteredClients && !filteredClients.length ? (
          <ShellEmpty
            icon={<Building2Icon className="size-8 opacity-60" />}
            title={q.trim() ? "No matches" : "No clients yet"}
            description={
              q.trim()
                ? "Try another name or contact."
                : "Add a client company, then set designation rates and allocate staff."
            }
            action={
              q.trim() ? (
                <Button type="button" variant="outline" onClick={() => setQ("")}>
                  Clear search
                </Button>
              ) : (
                <WhenEditing>
                  <Button
                    type="button"
                    onClick={() => {
                      setDraft(blank);
                      setOpen(true);
                    }}
                  >
                    Add client
                  </Button>
                </WhenEditing>
              )
            }
          />
        ) : null}
      </div>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Add client"
        description="Create the client company, then open it to add rates and allocate staff."
        pending={pending}
        submitLabel="Create client"
        onSubmit={createClient}
        size="md"
      >
        <TextField
          id="legalName"
          label="Legal name"
          value={draft.legalName}
          onChange={(value) => setDraft((c) => ({ ...c, legalName: value }))}
        />
        <TextField
          id="registrationNumber"
          label="Registration number"
          value={draft.registrationNumber}
          onChange={(value) => setDraft((c) => ({ ...c, registrationNumber: value }))}
        />
        <TextField
          id="tinNumber"
          label="TIN number"
          value={draft.tinNumber}
          onChange={(value) => setDraft((c) => ({ ...c, tinNumber: value }))}
        />
        <AreaField
          id="registeredAddress"
          label="Address"
          value={draft.registeredAddress}
          onChange={(value) => setDraft((c) => ({ ...c, registeredAddress: value }))}
        />
        <TextField
          id="country"
          label="Country"
          value={draft.country}
          onChange={(value) => setDraft((c) => ({ ...c, country: value }))}
        />
        <TextField id="phone" label="Phone" value={draft.phone} onChange={(value) => setDraft((c) => ({ ...c, phone: value }))} />
        <TextField id="email" label="Email" value={draft.email} onChange={(value) => setDraft((c) => ({ ...c, email: value }))} />
      </FormDialog>
    </Shell>
  );
}
