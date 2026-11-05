import { useEffect, useState } from "react";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banner, Shell, ShellEmpty, WhenEditing } from "@/components/shell";
import { PageSkeleton, SearchField } from "@/components/ux";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getJson } from "@/lib/api";
type LetterRow = {
  id: string;
  documentNumber: string;
  letterDate: string;
  employeeName: string | null;
  companyName: string;
  createdAt: string;
  status?: "issued" | "signed_archived";
};

export function LoaListPage() {
  const [rows, setRows] = useState<LetterRow[] | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = debouncedQ.trim() ? `?q=${encodeURIComponent(debouncedQ.trim())}` : "";
    getJson<{ letters: LetterRow[] }>(`/api/v1/letters${query}`)
      .then((data) => {
        if (!cancelled) setRows(data.letters);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load letters");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ]);

  return (
    <Shell
      title="NEXCRM · LOAs"
      eyebrow="Document archive"
      description="Saved LOA snapshots. Reopen any letter to review or print it. Company edits never change archived letters."
      actions={
        <WhenEditing>
          <Button asChild>
            <a href="/loas/new">
              <PlusIcon />
              New LOA
            </a>
          </Button>
        </WhenEditing>
      }
    >
      <Banner message={error} error />
      <Card>
        <CardHeader>
          <CardTitle>All LOAs</CardTitle>
          <CardDescription>Search by employee, passport or document number.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SearchField value={q} onChange={setQ} placeholder="Search letters" label="Search letters" />
          {!rows && !error ? <PageSkeleton cards={1} /> : null}
          {rows ? (
            rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Letter date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => window.location.assign(`/loas/${row.id}`)}>
                      <TableCell>
                        <a
                          className="font-medium underline-offset-4 hover:underline"
                          href={`/loas/${row.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.employeeName ?? "Unnamed"}
                        </a>
                      </TableCell>
                      <TableCell>{row.companyName}</TableCell>
                      <TableCell className="font-mono text-xs">{row.documentNumber}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.status === "signed_archived" ? "Signed" : "Issued"}
                      </TableCell>
                      <TableCell>{row.letterDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <ShellEmpty
                icon={<FileTextIcon className="size-8 opacity-60" />}
                title={q ? "No matches" : "No saved letters yet"}
                description={
                  q
                    ? "Try another employee name, passport or document number."
                    : "Create an appointment letter, then it will appear in this archive."
                }
                action={
                  !q ? (
                    <WhenEditing>
                      <Button asChild>
                        <a href="/loas/new">Create LOA</a>
                      </Button>
                    </WhenEditing>
                  ) : null
                }
              />
            )
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  );
}
