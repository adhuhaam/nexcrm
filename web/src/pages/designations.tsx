import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheckIcon, PlusIcon, TagsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TextField } from "@/components/field";
import { FormDialog } from "@/components/form-dialog";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { Badge } from "@/components/ui/badge";
import { getJson, sendJson } from "@/lib/api";

type Designation = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export function DesignationsPage() {
  const [rows, setRows] = useState<Designation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [editing, setEditing] = useState<Designation | null>(null);

  function reload() {
    getJson<{ designations: Designation[] }>("/api/v1/designations?includeInactive=1")
      .then((data) => setRows(data.designations))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load designations"));
  }

  useEffect(() => {
    reload();
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setSortOrder(String((rows?.length ?? 0) * 10 + 10));
    setOpen(true);
  }

  function openEdit(row: Designation) {
    setEditing(row);
    setName(row.name);
    setSortOrder(String(row.sortOrder));
    setOpen(true);
  }

  async function save() {
    setPending(true);
    try {
      if (editing) {
        await sendJson(`/api/v1/designations/${editing.id}`, "PATCH", {
          name,
          sortOrder: Number(sortOrder) || 0,
        });
        toast.success("Designation updated");
      } else {
        await sendJson("/api/v1/designations", "POST", {
          name,
          sortOrder: Number(sortOrder) || 0,
        });
        toast.success("Designation added");
      }
      setOpen(false);
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save designation");
    } finally {
      setPending(false);
    }
  }

  async function setActive(row: Designation, active: boolean) {
    setPending(true);
    try {
      if (active) {
        await sendJson(`/api/v1/designations/${row.id}`, "PATCH", { active: true });
        toast.success("Designation restored");
      } else {
        await sendJson(`/api/v1/designations/${row.id}`, "DELETE", {});
        toast.success("Designation deactivated");
      }
      reload();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not update designation");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      title="JACMS · Designations"
      eyebrow="Operations"
      description="Office-wide job titles for employees, client monthly rates, allocations, and payroll."
      actions={
        <WhenEditing>
          <Button type="button" onClick={openCreate}>
            <PlusIcon />
            Add designation
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>Designation catalog</CardTitle>
          <CardDescription>
            Add Labor, Mason, Steward, and other roles once. Employee edit, client rates, and allocate forms pick from this list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!rows && !error ? <PageSkeleton cards={1} /> : null}
          {rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Sort</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{row.sortOrder}</TableCell>
                    <TableCell>
                      <Badge variant={row.active ? "default" : "secondary"}>
                        {row.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <WhenEditing>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => openEdit(row)}>
                            Edit
                          </Button>
                          {row.active ? (
                            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void setActive(row, false)}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void setActive(row, true)}>
                              Restore
                            </Button>
                          )}
                        </div>
                      </WhenEditing>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {rows && !rows.length ? (
            <ShellEmpty
              icon={<TagsIcon className="size-8 opacity-60" />}
              title="No designations yet"
              description="Add roles like Labor or Mason so staff and client rate forms can use a dropdown."
              action={
                <WhenEditing>
                  <Button type="button" onClick={openCreate}>
                    <PlusIcon />
                    Add designation
                  </Button>
                </WhenEditing>
              }
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BadgeCheckIcon className="size-4" />
          </span>
          <div>
            <CardTitle className="text-base">Where this is used</CardTitle>
            <CardDescription className="mt-1">
              Employee edit · Client designation monthly rates · Allocate to client · Onboard. Payroll matches rates by the same designation name.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit designation" : "Add designation"}
        description="Names are unique (case-insensitive). Deactivate instead of deleting so history stays readable."
        pending={pending}
        submitLabel={editing ? "Save" : "Add"}
        onSubmit={save}
        size="md"
      >
        <TextField id="desigName" label="Name" value={name} onChange={setName} hint="e.g. Labor, Mason, Steward" />
        <TextField id="desigSort" label="Sort order" value={sortOrder} onChange={setSortOrder} hint="Lower numbers appear first in dropdowns" />
      </FormDialog>
    </Shell>
  );
}
