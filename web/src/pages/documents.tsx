import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import {
  ArrowUpDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileImageIcon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  LayoutGridIcon,
  LayoutListIcon,
  SearchIcon,
  UploadIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/field";
import { Banner, Shell, WhenEditing } from "@/components/shell";
import { PageSkeleton } from "@/components/ux";
import { getJson, sendJson, uploadForm } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import "@/styles/jacms-surface.css";
import "./documents.css";

type Employee = { id: string; legalName: string; companyName: string };

type DriveFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  label: string | null;
  createdAt: string;
  entityType: string;
  entityId: string;
  entityName: string;
};

type OcrResult = {
  scan: { id: string };
  ocr: { id: string };
  proposed: {
    passportNumber: string | null;
    legalName: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
    gender: string | null;
  };
  note: string;
};

type Crumb = { id: string; label: string };
type ViewMode = "list" | "grid";
type SortKey = "name" | "date" | "size" | "type";
type FolderRow = { id: string; label: string; count: number; icon: "users" | "folder" };

const VIEW_KEY = "jacms.documents.view";
const SORT_KEY = "jacms.documents.sort";

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function readSort(): SortKey {
  try {
    const value = localStorage.getItem(SORT_KEY);
    if (value === "date" || value === "size" || value === "type" || value === "name") return value;
  } catch {
    /* ignore */
  }
  return "name";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: string): string {
  if (kind === "passport_scan") return "Passport scan";
  if (kind === "passport_ocr_json") return "Passport OCR";
  if (kind === "loa_signed") return "Signed LOA";
  if (kind === "employee_doc") return "Document";
  if (kind === "company_letterhead") return "Letterhead";
  if (kind === "company_seal") return "Seal";
  if (kind === "company_signature") return "Signature";
  return kind.replaceAll("_", " ");
}

function kindFolderId(kind: string): string {
  if (kind === "passport_scan" || kind === "passport_ocr_json") return "type:passport";
  if (kind === "loa_signed") return "type:loa";
  if (kind.startsWith("company_")) return "type:branding";
  return "type:docs";
}

function glyphClass(mimeType: string, kind: string): string {
  if (mimeType.startsWith("image/")) return "is-image";
  if (mimeType === "application/pdf") return "is-pdf";
  if (kind.includes("ocr") || mimeType.includes("json")) return "is-json";
  return "";
}

function FileGlyph({ mimeType, kind, size = "md" }: { mimeType: string; kind: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "size-4" : "size-5";
  if (mimeType.startsWith("image/")) return <FileImageIcon className={cls} />;
  if (mimeType === "application/pdf") return <FileTextIcon className={cls} />;
  if (kind.includes("ocr") || mimeType.includes("json")) return <FileJsonIcon className={cls} />;
  return <FileIcon className={cls} />;
}

export function DocumentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [path, setPath] = useState<Crumb[]>([{ id: "root", label: "My Drive" }]);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => readView());
  const [sortKey, setSortKey] = useState<SortKey>(() => readSort());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploadEmployeeId, setUploadEmployeeId] = useState("");
  const [label, setLabel] = useState("");
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [proposed, setProposed] = useState({
    passportNumber: "",
    legalName: "",
    nationality: "",
    dateOfBirth: "",
    gender: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const current = path[path.length - 1]!;

  function reloadDrive() {
    return getJson<{ files: DriveFile[] }>("/api/v1/files/drive")
      .then((data) => setFiles(data.files))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load drive"));
  }

  useEffect(() => {
    getJson<{ employees: Employee[] }>("/api/v1/employees")
      .then((data) => {
        setEmployees(data.employees);
        if (data.employees[0]) setUploadEmployeeId(data.employees[0].id);
      })
      .catch(() => undefined);
    void reloadDrive();
  }, []);

  useEffect(() => {
    if (current.id.startsWith("employee:")) {
      setUploadEmployeeId(current.id.slice("employee:".length));
    }
  }, [current.id]);

  const employeeFolders = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const file of files ?? []) {
      if (file.entityType !== "employee") continue;
      const existing = map.get(file.entityId);
      if (existing) existing.count += 1;
      else map.set(file.entityId, { id: file.entityId, name: file.entityName, count: 1 });
    }
    for (const employee of employees) {
      if (!map.has(employee.id)) {
        map.set(employee.id, { id: employee.id, name: employee.legalName, count: 0 });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [files, employees]);

  const typeFolders = useMemo(
    () => [
      {
        id: "type:passport",
        label: "Passport scans",
        count: (files ?? []).filter((f) => kindFolderId(f.kind) === "type:passport").length,
      },
      {
        id: "type:loa",
        label: "Signed LOAs",
        count: (files ?? []).filter((f) => kindFolderId(f.kind) === "type:loa").length,
      },
      {
        id: "type:docs",
        label: "Employee documents",
        count: (files ?? []).filter((f) => kindFolderId(f.kind) === "type:docs").length,
      },
      {
        id: "type:branding",
        label: "Company branding",
        count: (files ?? []).filter((f) => kindFolderId(f.kind) === "type:branding").length,
      },
    ],
    [files],
  );

  const foldersHere = useMemo(() => {
    if (current.id === "root") {
      return [
        {
          id: "people",
          label: "People",
          count: employeeFolders.filter((f) => f.count > 0).length,
          icon: "users" as const,
        },
        ...typeFolders.map((folder) => ({ ...folder, icon: "folder" as const })),
      ];
    }
    if (current.id === "people") {
      return employeeFolders.map((folder) => ({
        id: `employee:${folder.id}`,
        label: folder.name,
        count: folder.count,
        icon: "folder" as const,
      }));
    }
    return [] as FolderRow[];
  }, [current.id, employeeFolders, typeFolders]);

  const filesHere = useMemo(() => {
    const all = files ?? [];
    let rows = all;
    if (current.id.startsWith("employee:")) {
      const id = current.id.slice("employee:".length);
      rows = all.filter((file) => file.entityType === "employee" && file.entityId === id);
    } else if (current.id.startsWith("type:")) {
      rows = all.filter((file) => kindFolderId(file.kind) === current.id);
    } else if (current.id === "root" || current.id === "people") {
      rows = [];
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((file) =>
        [file.label, file.originalName, file.kind, file.entityName, file.mimeType]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortKey === "size") return b.sizeBytes - a.sizeBytes;
      if (sortKey === "date") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sortKey === "type") return kindLabel(a.kind).localeCompare(kindLabel(b.kind));
      return (a.label || a.originalName).localeCompare(b.label || b.originalName);
    });
    return sorted;
  }, [files, current.id, q, sortKey]);

  const items = useMemo(
    () => [
      ...foldersHere.map((folder) => ({ kind: "folder" as const, id: folder.id, folder })),
      ...filesHere.map((file) => ({ kind: "file" as const, id: file.id, file })),
    ],
    [foldersHere, filesHere],
  );

  const selected = filesHere.find((file) => file.id === selectedId) ?? null;
  const canUpload = current.id.startsWith("employee:") || Boolean(uploadEmployeeId);
  const totalBytes = (files ?? []).reduce((sum, file) => sum + file.sizeBytes, 0);
  const usagePct = Math.min(100, Math.round((totalBytes / (250 * 1024 * 1024)) * 100));

  useEffect(() => {
    setFocusIndex(0);
    setSelectedId(null);
  }, [current.id, q, sortKey]);

  function openFolder(id: string, folderLabel: string) {
    setSelectedId(null);
    setPath((crumbs) => [...crumbs, { id, label: folderLabel }]);
  }

  function jumpTo(index: number) {
    setSelectedId(null);
    setPath((crumbs) => crumbs.slice(0, index + 1));
  }

  function goSidebar(id: string, folderLabel: string) {
    if (id === "root") {
      setPath([{ id: "root", label: "My Drive" }]);
      return;
    }
    if (id === "people") {
      setPath([
        { id: "root", label: "My Drive" },
        { id: "people", label: "People" },
      ]);
      return;
    }
    setPath([
      { id: "root", label: "My Drive" },
      { id, label: folderLabel },
    ]);
  }

  function setView(next: ViewMode) {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function setSort(next: SortKey) {
    setSortKey(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function activateItem(index: number) {
    const item = items[index];
    if (!item) return;
    if (item.kind === "folder") openFolder(item.folder.id, item.folder.label);
    else window.open(`/api/v1/files/${item.file.id}/download`, "_blank");
  }

  function selectItem(index: number) {
    const item = items[index];
    if (!item) return;
    setFocusIndex(index);
    if (item.kind === "file") setSelectedId(item.file.id);
    else setSelectedId(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!items.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(items.length - 1, focusIndex + 1);
      selectItem(next);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(0, focusIndex - 1);
      selectItem(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateItem(focusIndex);
    } else if (event.key === "Backspace" && path.length > 1 && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      jumpTo(path.length - 2);
    } else if (event.key === "Escape") {
      setSelectedId(null);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    const targetEmployeeId = current.id.startsWith("employee:")
      ? current.id.slice("employee:".length)
      : uploadEmployeeId;
    if (!fileList?.length || !targetEmployeeId) {
      toast.error("Open a person folder or choose an employee to upload into");
      return;
    }
    setPending(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", "employee_doc");
        form.append("entityType", "employee");
        form.append("entityId", targetEmployeeId);
        form.append("label", label || file.name);
        await uploadForm("/api/v1/files", form);
      }
      toast.success(fileList.length === 1 ? "File uploaded" : `${fileList.length} files uploaded`);
      setLabel("");
      await reloadDrive();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Upload failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function runPassportOcr(fileList: FileList | null) {
    const targetEmployeeId = current.id.startsWith("employee:")
      ? current.id.slice("employee:".length)
      : uploadEmployeeId;
    if (!fileList?.[0] || !targetEmployeeId) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", fileList[0]);
      const result = await uploadForm<OcrResult>(`/api/v1/employees/${targetEmployeeId}/passport-ocr`, form);
      setOcr(result);
      setProposed({
        passportNumber: result.proposed.passportNumber ?? "",
        legalName: result.proposed.legalName ?? "",
        nationality: result.proposed.nationality ?? "",
        dateOfBirth: result.proposed.dateOfBirth ?? "",
        gender: result.proposed.gender ?? "",
      });
      toast.success("Passport scan stored — review proposed fields");
      await reloadDrive();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "OCR upload failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function applyOcr() {
    const targetEmployeeId = current.id.startsWith("employee:")
      ? current.id.slice("employee:".length)
      : uploadEmployeeId;
    if (!targetEmployeeId) return;
    setPending(true);
    try {
      await sendJson(`/api/v1/employees/${targetEmployeeId}/passport-ocr/apply`, "POST", proposed);
      toast.success("Reviewed passport fields applied");
      setOcr(null);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not apply fields");
    } finally {
      setPending(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    void uploadFiles(event.dataTransfer.files);
  }

  const peopleActive = path.some((crumb) => crumb.id === "people" || crumb.id.startsWith("employee:"));

  return (
    <Shell
      title="JACMS · Documents"
      eyebrow="Drive"
      description="Interactive company file drive — browse, search, drop files, and manage employee documents."
      surface={false}
      actions={
        <WhenEditing>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <Button type="button" disabled={pending || !canUpload} onClick={() => fileInputRef.current?.click()}>
              <UploadIcon />
              Upload
            </Button>
          </div>
        </WhenEditing>
      }
    >
      <Banner message={error} error />

      <div className="jacms-drive">
        {pending ? (
          <div className="drive-upload-bar" aria-hidden>
            <span />
          </div>
        ) : null}

        <div className="jacms-drive-layout">
          <aside className="drive-rail">
            <p className="drive-rail-label">Browse</p>
            <button
              type="button"
              className={cn("drive-nav", current.id === "root" && path.length === 1 && "is-active")}
              onClick={() => goSidebar("root", "My Drive")}
            >
              <span className="drive-folder-glyph">
                <FolderOpenIcon className="size-4" />
              </span>
              My Drive
            </button>
            <button
              type="button"
              className={cn("drive-nav", peopleActive && "is-active")}
              onClick={() => goSidebar("people", "People")}
            >
              <span className="drive-folder-glyph is-people">
                <UsersIcon className="size-4" />
              </span>
              People
              <span className="drive-nav-count">{employeeFolders.filter((f) => f.count > 0).length}</span>
            </button>

            <p className="drive-rail-label" style={{ marginTop: "0.75rem" }}>
              Libraries
            </p>
            {typeFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={cn("drive-nav", current.id === folder.id && "is-active")}
                onClick={() => goSidebar(folder.id, folder.label)}
              >
                <span className="drive-folder-glyph">
                  <FolderIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                <span className="drive-nav-count">{folder.count}</span>
              </button>
            ))}

            <div className="drive-panel" style={{ marginTop: "0.85rem" }}>
              <p className="drive-panel-title">Storage</p>
              <div className="drive-usage">
                <div className="drive-usage-track">
                  <div className="drive-usage-fill" style={{ width: `${Math.max(usagePct, 4)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(totalBytes)} used · {(files ?? []).length} files
                </p>
              </div>
            </div>
          </aside>

          <section
            ref={mainRef}
            className={cn("drive-main", dragOver && "is-dragover")}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="drive-toolbar">
              <div className="drive-crumbs">
                {path.map((crumb, index) => (
                  <div key={`${crumb.id}-${index}`} className="flex items-center gap-0.5">
                    {index > 0 ? <ChevronRightIcon className="size-3.5 text-muted-foreground" /> : null}
                    <button
                      type="button"
                      className={cn("drive-crumb", index === path.length - 1 && "is-current")}
                      onClick={() => jumpTo(index)}
                    >
                      {crumb.label}
                    </button>
                  </div>
                ))}
              </div>

              <div className="drive-search">
                <SearchIcon className="drive-search-icon" />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Search this folder…"
                  aria-label="Search files"
                />
                {q ? (
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => setQ("")}
                    aria-label="Clear search"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="drive-seg" role="group" aria-label="View mode">
                <button type="button" className={cn(viewMode === "grid" && "is-active")} onClick={() => setView("grid")}>
                  <LayoutGridIcon className="size-3.5" />
                  Grid
                </button>
                <button type="button" className={cn(viewMode === "list" && "is-active")} onClick={() => setView("list")}>
                  <LayoutListIcon className="size-3.5" />
                  List
                </button>
              </div>
            </div>

            <div className="drive-meta-row">
              <span>
                {foldersHere.length} folder{foldersHere.length === 1 ? "" : "s"} · {filesHere.length} file
                {filesHere.length === 1 ? "" : "s"}
                {selected ? ` · selected ${selected.label || selected.originalName}` : ""}
              </span>
              <label className="drive-sort">
                <ArrowUpDownIcon className="size-3.5" />
                <span>Sort</span>
                <select value={sortKey} onChange={(event) => setSort(event.target.value as SortKey)}>
                  <option value="name">Name</option>
                  <option value="date">Modified</option>
                  <option value="size">Size</option>
                  <option value="type">Type</option>
                </select>
              </label>
            </div>

            {!files && !error ? <PageSkeleton cards={1} /> : null}

            {files ? (
              <>
                {items.length ? (
                  viewMode === "grid" ? (
                    <div className="drive-grid">
                      {foldersHere.map((folder, index) => (
                        <button
                          key={folder.id}
                          type="button"
                          className={cn("drive-tile is-folder", focusIndex === index && "is-selected")}
                          onClick={() => {
                            setFocusIndex(index);
                            openFolder(folder.id, folder.label);
                          }}
                          onDoubleClick={() => openFolder(folder.id, folder.label)}
                        >
                          <span className={cn("drive-folder-glyph", folder.icon === "users" && "is-people")}>
                            {folder.icon === "users" ? (
                              <UsersIcon className="size-5" />
                            ) : (
                              <FolderIcon className="size-5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="drive-tile-title">{folder.label}</p>
                            <p className="drive-tile-sub">
                              {folder.count} item{folder.count === 1 ? "" : "s"}
                            </p>
                          </div>
                        </button>
                      ))}
                      {filesHere.map((file, fileIndex) => {
                        const index = foldersHere.length + fileIndex;
                        return (
                          <button
                            key={file.id}
                            type="button"
                            className={cn(
                              "drive-tile",
                              (selectedId === file.id || focusIndex === index) && "is-selected",
                            )}
                            onClick={() => {
                              setFocusIndex(index);
                              setSelectedId(file.id);
                            }}
                            onDoubleClick={() => window.open(`/api/v1/files/${file.id}/download`, "_blank")}
                          >
                            <div className="drive-tile-actions">
                              <a
                                href={`/api/v1/files/${file.id}/download`}
                                title="Download"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <DownloadIcon className="size-3.5" />
                              </a>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className={cn("drive-file-glyph", glyphClass(file.mimeType, file.kind))}>
                                <FileGlyph mimeType={file.mimeType} kind={file.kind} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="drive-tile-title">{file.label || file.originalName}</p>
                                <p className="drive-tile-sub">{kindLabel(file.kind)}</p>
                              </div>
                            </div>
                            <div className="drive-tile-foot">
                              <span>{formatBytes(file.sizeBytes)}</span>
                              <span>{formatDateTime(file.createdAt)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="drive-list">
                      <table>
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Owner</th>
                            <th className="px-3 py-2 text-right font-medium">Size</th>
                            <th className="px-3 py-2 font-medium">Modified</th>
                          </tr>
                        </thead>
                        <tbody>
                          {foldersHere.map((folder, index) => (
                            <tr
                              key={folder.id}
                              className={cn(focusIndex === index && "is-selected")}
                              onClick={() => {
                                setFocusIndex(index);
                                openFolder(folder.id, folder.label);
                              }}
                            >
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2 font-medium">
                                  <span
                                    className={cn(
                                      "drive-folder-glyph",
                                      folder.icon === "users" && "is-people",
                                    )}
                                    style={{ width: "1.75rem", height: "1.75rem" }}
                                  >
                                    {folder.icon === "users" ? (
                                      <UsersIcon className="size-3.5" />
                                    ) : (
                                      <FolderIcon className="size-3.5" />
                                    )}
                                  </span>
                                  {folder.label}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-sm text-muted-foreground">Folder</td>
                              <td className="px-3 py-2.5 text-muted-foreground">—</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                {folder.count}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground">—</td>
                            </tr>
                          ))}
                          {filesHere.map((file, fileIndex) => {
                            const index = foldersHere.length + fileIndex;
                            return (
                              <tr
                                key={file.id}
                                className={cn(
                                  (selectedId === file.id || focusIndex === index) && "is-selected",
                                )}
                                onClick={() => {
                                  setFocusIndex(index);
                                  setSelectedId(file.id);
                                }}
                                onDoubleClick={() =>
                                  window.open(`/api/v1/files/${file.id}/download`, "_blank")
                                }
                              >
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className={cn("drive-file-glyph", glyphClass(file.mimeType, file.kind))} style={{ width: "1.9rem", height: "1.9rem" }}>
                                      <FileGlyph mimeType={file.mimeType} kind={file.kind} size="sm" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="truncate font-medium">{file.label || file.originalName}</div>
                                      <div className="truncate text-xs text-muted-foreground">{file.originalName}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-sm">{kindLabel(file.kind)}</td>
                                <td className="px-3 py-2.5 text-sm">{file.entityName}</td>
                                <td className="px-3 py-2.5 text-right text-sm tabular-nums">
                                  {formatBytes(file.sizeBytes)}
                                </td>
                                <td className="px-3 py-2.5 text-sm text-muted-foreground">
                                  {formatDateTime(file.createdAt)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  <div className="drive-empty">
                    <div className="drive-empty-icon">
                      <FolderOpenIcon className="size-6" />
                    </div>
                    <div>
                      <p className="font-medium">{q.trim() ? "No matches" : "This folder is empty"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {q.trim()
                          ? "Try another name or clear search."
                          : current.id.startsWith("employee:")
                            ? "Drop files here or use Upload."
                            : "Open People, pick someone, then upload."}
                      </p>
                    </div>
                    {q.trim() ? (
                      <Button type="button" variant="outline" onClick={() => setQ("")}>
                        Clear search
                      </Button>
                    ) : (
                      <WhenEditing>
                        <Button
                          type="button"
                          disabled={!canUpload || pending}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <UploadIcon />
                          Upload files
                        </Button>
                      </WhenEditing>
                    )}
                  </div>
                )}

                {dragOver ? (
                  <div className="drive-drop-hint">
                    <div>
                      Drop to upload into{" "}
                      {current.id.startsWith("employee:") ? current.label : "selected employee"}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <aside className="drive-details">
            <div className="drive-panel">
              <p className="drive-panel-title">Details</p>
              {selected ? (
                <>
                  <div className={cn("drive-preview", glyphClass(selected.mimeType, selected.kind))}>
                    <FileGlyph mimeType={selected.mimeType} kind={selected.kind} />
                  </div>
                  <div>
                    <p className="font-medium leading-snug">{selected.label || selected.originalName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{selected.originalName}</p>
                  </div>
                  <div className="drive-kv">
                    <div>
                      <span>Type</span>
                      <span>{kindLabel(selected.kind)}</span>
                    </div>
                    <div>
                      <span>Size</span>
                      <span className="tabular-nums">{formatBytes(selected.sizeBytes)}</span>
                    </div>
                    <div>
                      <span>Owner</span>
                      <span className="truncate text-right">{selected.entityName}</span>
                    </div>
                    <div>
                      <span>Modified</span>
                      <span>{formatDateTime(selected.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/v1/files/${selected.id}/download`}>
                        <DownloadIcon />
                        Download
                      </a>
                    </Button>
                    {selected.entityType === "employee" ? (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/employees?edit=${selected.entityId}`}>
                          <ExternalLinkIcon />
                          Employee
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a file for details. Use arrow keys in the main pane, Enter to open, Backspace to go up.
                </p>
              )}
            </div>

            <WhenEditing>
              <div className="drive-panel">
                <p className="drive-panel-title">Upload</p>
                {!current.id.startsWith("employee:") ? (
                  <SelectField
                    id="uploadEmployeeId"
                    label="Employee folder"
                    value={uploadEmployeeId}
                    onChange={setUploadEmployeeId}
                  >
                    <option value="">Select employee</option>
                    {employees.map((item) => (
                      <option key={item.id} value={item.id} title={`${item.legalName} · ${item.companyName}`}>
                        {item.legalName.length > 28 ? `${item.legalName.slice(0, 26)}…` : item.legalName}
                      </option>
                    ))}
                  </SelectField>
                ) : (
                  <p className="truncate text-xs text-muted-foreground">Uploading into {current.label}</p>
                )}
                <TextField id="label" label="Optional label" value={label} onChange={setLabel} />
                <Button
                  type="button"
                  disabled={pending || !canUpload}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon />
                  Choose files
                </Button>
                <p className="text-[11px] text-muted-foreground">Or drag files onto the main pane.</p>
              </div>

              <div className="drive-panel">
                <p className="drive-panel-title">Passport OCR</p>
                <p className="text-xs text-muted-foreground">
                  Stores the scan + OCR JSON under the selected employee.
                </p>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs text-muted-foreground">Passport image or PDF</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={pending || !canUpload}
                    onChange={(event) => void runPassportOcr(event.target.files)}
                  />
                </label>
                {ocr ? (
                  <div className="grid gap-2">
                    <p className="text-xs text-muted-foreground">{ocr.note}</p>
                    <TextField
                      id="ocrPassport"
                      label="Passport number"
                      value={proposed.passportNumber}
                      onChange={(value) => setProposed((c) => ({ ...c, passportNumber: value }))}
                    />
                    <TextField
                      id="ocrName"
                      label="Legal name"
                      value={proposed.legalName}
                      onChange={(value) => setProposed((c) => ({ ...c, legalName: value }))}
                    />
                    <TextField
                      id="ocrNat"
                      label="Nationality"
                      value={proposed.nationality}
                      onChange={(value) => setProposed((c) => ({ ...c, nationality: value }))}
                    />
                    <TextField
                      id="ocrDob"
                      label="Date of birth"
                      value={proposed.dateOfBirth}
                      onChange={(value) => setProposed((c) => ({ ...c, dateOfBirth: value }))}
                    />
                    <TextField
                      id="ocrGender"
                      label="Gender"
                      value={proposed.gender}
                      onChange={(value) => setProposed((c) => ({ ...c, gender: value }))}
                    />
                    <Button type="button" disabled={pending} onClick={() => void applyOcr()}>
                      Apply reviewed fields
                    </Button>
                  </div>
                ) : null}
              </div>
            </WhenEditing>
          </aside>
        </div>
      </div>

      <div className="drive-stats">
        <span className="drive-chip">{(files ?? []).length} files in drive</span>
        <span className="drive-chip">
          {employeeFolders.filter((folder) => folder.count > 0).length} people with files
        </span>
        <span className="drive-chip">{formatBytes(totalBytes)} total</span>
      </div>
    </Shell>
  );
}
