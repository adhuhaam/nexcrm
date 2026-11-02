import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LockIcon, PlusIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField, TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson } from "@/lib/api";

type PayRunListItem = {
  id: string;
  clientName: string;
  employerName: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "locked";
};

type PayRunDetail = PayRunListItem & {
  items: {
    id: string;
    employeeName: string;
    designation: string | null;
    staffSalary: string;
    billRate: string;
    currency: string;
  }[];
  totals: { staffSalary: string; billRate: string };
};

type Company = { id: string; legalName: string };

export function PayrollPage() {
  const [payRuns, setPayRuns] = useState<PayRunListItem[] | null>(null);
  const [clients, setClients] = useState<Company[]>([]);
  const [selected, setSelected] = useState<PayRunDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));

  function reload() {
    getJson<{ payRuns: PayRunListItem[]; clients: Company[] }>("/api/v1/pay-runs")
      .then((data) => {
        setPayRuns(data.payRuns);
        setClients(data.clients);
        if (!clientCompanyId && data.clients[0]) setClientCompanyId(data.clients[0].id);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load pay runs"));
  }

  useEffect(() => {
    reload();
  }, []);

  async function createRun() {
    setPending(true);
    try {
      const created = await sendJson<PayRunDetail>("/api/v1/pay-runs", "POST", {
        clientCompanyId,
        periodStart,
        periodEnd,
      });
      toast.success("Pay run generated");
      setCreateOpen(false);
      setSelected(created);
      setDetailOpen(true);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not create pay run");
    } finally {
      setPending(false);
    }
  }

  async function openRun(id: string) {
    try {
      const run = await getJson<PayRunDetail>(`/api/v1/pay-runs/${id}`);
      setSelected(run);
      setDetailOpen(true);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not open pay run");
    }
  }

  async function lockRun(id: string) {
    setPending(true);
    try {
      const locked = await sendJson<PayRunDetail>(`/api/v1/pay-runs/${id}/lock`, "POST", {});
      toast.success("Pay run locked");
      setSelected(locked);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not lock pay run");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="NEXCRM · Payroll"
      eyebrow="Operations"
      description="Per-client pay runs. Generate and review in dialogs; lock freezes staff vs bill amounts."
      actions={
        <WhenEditing>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            Generate pay run
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>Pay runs</CardTitle>
          <CardDescription>Each run is scoped to one client company and period. Click a row to open.</CardDescription>
        </CardHeader>
        <CardContent>
          {!payRuns && !error ? <PageSkeleton cards={1} /> : null}
          {payRuns?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payRuns.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => void openRun(row.id)}>
                    <TableCell className="font-medium">{row.clientName}</TableCell>
                    <TableCell className="text-sm">
                      {row.periodStart} → {row.periodEnd}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "locked" ? "secondary" : "default"}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {payRuns && !payRuns.length ? (
            <ShellEmpty
              icon={<WalletIcon className="size-8 opacity-60" />}
              title="No pay runs yet"
              description="Generate a draft from active client allocations, review, then lock."
              action={
                <WhenEditing>
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    Generate pay run
                  </Button>
                </WhenEditing>
              }
            />
          ) : null}
        </CardContent>
      </Card>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Generate pay run"
        description="Pulls active allocations for the client into a draft."
        pending={pending}
        submitLabel="Generate draft"
        onSubmit={createRun}
        size="md"
      >
        <SelectField id="clientCompanyId" label="Client" value={clientCompanyId} onChange={setClientCompanyId}>
          <option value="">Select client</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.legalName}
            </option>
          ))}
        </SelectField>
        <TextField id="periodStart" label="Period start" type="date" value={periodStart} onChange={setPeriodStart} />
        <TextField id="periodEnd" label="Period end" type="date" value={periodEnd} onChange={setPeriodEnd} />
      </FormDialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex max-h-[min(90vh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {selected ? (
            <>
              <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12">
                <DialogTitle>
                  {selected.clientName} · {selected.periodStart} → {selected.periodEnd}
                </DialogTitle>
                <DialogDescription>
                  Employer {selected.employerName}. Totals freeze at generation time.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Staff salary</TableHead>
                      <TableHead>Bill rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.employeeName}</div>
                          <div className="text-xs text-muted-foreground">{item.designation ?? "—"}</div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {item.staffSalary} {item.currency}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {item.billRate} {item.currency}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-3 text-sm text-muted-foreground">
                  Totals · Staff {selected.totals.staffSalary} · Bill {selected.totals.billRate}
                </p>
              </div>
              <DialogFooter className="mx-0 mb-0">
                <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
                  Close
                </Button>
                {selected.status === "draft" ? (
                  <WhenEditing>
                    <Button type="button" disabled={pending} onClick={() => void lockRun(selected.id)}>
                      <LockIcon />
                      Lock pay run
                    </Button>
                  </WhenEditing>
                ) : (
                  <Badge variant="secondary">Locked</Badge>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
