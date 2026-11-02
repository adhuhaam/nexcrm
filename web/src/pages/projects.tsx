import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaField, SelectField, TextField } from "@/components/field";
import { Banner, Loading, Shell, WhenEditing } from "@/components/shell";
import { getJson, postJson } from "@/lib/api";

type Project = { id: string; name: string; companyName: string };
type Company = { id: string; legalName: string };
type Site = { id: string; name: string; siteType: string | null; address: string | null; state: string };
type Pool = { id: string; name: string; poolNumber: string | null; siteName: string; used: number; open: number };
type Slot = {
  id: string;
  slotNumber: number | null;
  status: string;
  occupation: string | null;
  employeeName: string | null;
  poolName: string;
  siteName: string;
};
type ProjectView = {
  project: Project;
  sites: Site[];
  pools: Pool[];
  slots: Slot[];
  documents: { id: string; title: string; notes: string | null }[];
  employees: { id: string; legalName: string }[];
};

const notices: Record<string, string> = {
  project: "Project created.",
  site: "Site added.",
  pool: "Quota pool added.",
  slot: "Quota slot occupied. This work permit holder is now working on the project.",
  document: "Project document saved.",
};

const errors: Record<string, string> = {
  "pool-full": "This quota pool has no open slot.",
  "duplicate-slot": "This employee already has a slot on this project.",
  "wrong-company": "That employee belongs to another company.",
  missing: "A required field is missing.",
};

function queryMessage(): { message: string | null; error: boolean } {
  const params = new URLSearchParams(window.location.search);
  const notice = params.get("notice");
  const error = params.get("error");
  if (error) return { message: errors[error] ?? "Request failed", error: true };
  if (notice) return { message: notices[notice] ?? null, error: false };
  return { message: null, error: false };
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const banner = queryMessage();

  useEffect(() => {
    let cancelled = false;
    getJson<{ projects: Project[]; companies: Company[] }>("/api/v1/projects")
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        setCompanies(data.companies);
        setCompanyId(data.companies[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this page");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Shell title="NEXCRM projects">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          A project has work sites, quota pools, and quota slots. A slot is one place in a pool. Open means it is empty. Occupied means a work permit holder is working on that project. Project documents stay with the project.
        </p>
      </div>
      <Banner message={banner.message} error={banner.error} />
      <Banner message={error} error />
      {!projects && !error ? <Loading /> : null}
      {projects ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Project list</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {projects.length ? (
                projects.map((project) => (
                  <p key={project.id}>
                    <a className="underline underline-offset-4" href={`/projects/${project.id}`}>
                      {project.name}
                    </a>
                    <span className="text-muted-foreground"> {project.companyName}</span>
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">No projects yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>New project</CardTitle>
            </CardHeader>
            <CardContent>
              <WhenEditing>
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPending(true);
                  setError(null);
                  void postJson("/projects", { companyId, name }).catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : "Request failed");
                    setPending(false);
                  });
                }}
              >
                <SelectField id="companyId" label="Company" value={companyId} onChange={setCompanyId}>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.legalName}
                    </option>
                  ))}
                </SelectField>
                <TextField id="name" label="Project name" value={name} onChange={setName} />
                <Button type="submit" disabled={pending || !companyId}>
                  Create project
                </Button>
              </form>
              </WhenEditing>
            </CardContent>
          </Card>
        </>
      ) : null}
    </Shell>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [slotId, setSlotId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteType, setSiteType] = useState("");
  const [address, setAddress] = useState("");
  const [poolSiteId, setPoolSiteId] = useState("");
  const [poolNumber, setPoolNumber] = useState("");
  const [poolName, setPoolName] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const banner = queryMessage();

  useEffect(() => {
    let cancelled = false;
    getJson<ProjectView>(`/api/v1/projects/${id}`)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        setSlotId(data.slots.find((slot) => slot.status === "open")?.id ?? "");
        setPoolSiteId(data.sites[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this page");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function send(action: string, body: Record<string, string>) {
    setPending(true);
    setError(null);
    void postJson(action, body).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Request failed");
      setPending(false);
    });
  }

  const openSlots = view?.slots.filter((slot) => slot.status === "open") ?? [];

  return (
    <Shell title={view?.project.name ?? "Project"}>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{view?.project.name ?? "Project"}</h1>
        {view ? <p className="text-sm text-muted-foreground">{view.project.companyName}</p> : null}
      </div>
      <Banner message={banner.message} error={banner.error} />
      <Banner message={error} error />
      {!view && !error ? <Loading /> : null}
      {view ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Quota slots</CardTitle>
              <CardDescription>A quota slot is one place in a pool. Open can take a work permit. Occupied is a work permit holder working on this project.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {view.slots.length ? (
                <ul className="grid gap-2">
                  {view.slots.map((slot) => (
                    <li key={slot.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={slot.status === "occupied" ? "default" : "outline"}>{slot.status === "occupied" ? "Occupied" : "Open"}</Badge>
                      <span>
                        {slot.slotNumber} · {slot.employeeName ?? "No work permit holder"} · {slot.occupation ?? "No occupation"} · {slot.poolName} · {slot.siteName}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No quota slots yet.</p>
              )}
              {openSlots.length ? (
                <WhenEditing>
              <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    send(`/projects/${id}/slots`, { slotId, employeeId, employeeName });
                  }}
                >
                  <SelectField id="slotId" label="Open quota slot" value={slotId} onChange={setSlotId}>
                    {openSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.slotNumber} · {slot.poolName} · {slot.siteName}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField id="employeeId" label="Work permit holder" value={employeeId} onChange={setEmployeeId}>
                    <option value="">New work permit holder</option>
                    {view.employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.legalName}
                      </option>
                    ))}
                  </SelectField>
                  <TextField id="employeeName" label="New work permit holder name" value={employeeName} onChange={setEmployeeName} />
                  <Button type="submit" disabled={pending}>
                    Occupy slot
                  </Button>
                </form>
              </WhenEditing>
              ) : view.pools.length ? (
                <p className="text-sm text-muted-foreground">Every quota slot in this project is occupied.</p>
              ) : (
                <p className="text-sm text-muted-foreground">Add a site and a quota pool before occupying a slot.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sites</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {view.sites.length ? (
                <ul className="grid gap-2 text-sm">
                  {view.sites.map((site) => (
                    <li key={site.id}>
                      {site.name} · {site.siteType ?? "Site type not recorded"} · {site.state === "active" ? "Active" : site.state}
                      {site.address ? ` · ${site.address}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No sites yet.</p>
              )}
              <WhenEditing>
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  send(`/projects/${id}/sites`, { name: siteName, siteType, address });
                }}
              >
                <TextField id="siteName" label="Site name" value={siteName} onChange={setSiteName} />
                <SelectField id="siteType" label="Site type" value={siteType} onChange={setSiteType}>
                  <option value="">Not recorded</option>
                  <option value="Address">Address</option>
                  <option value="Vessel">Vessel</option>
                </SelectField>
                <TextField id="address" label="Site address" value={address} onChange={setAddress} />
                <Button type="submit" disabled={pending}>
                  Add site
                </Button>
              </form>
              </WhenEditing>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Quota pools</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {view.pools.length ? (
                <ul className="grid gap-2 text-sm">
                  {view.pools.map((pool) => (
                    <li key={pool.id}>
                      {pool.poolNumber ? `${pool.poolNumber} · ` : ""}
                      {pool.name} · {pool.siteName} · {pool.used} occupied · {pool.open} open
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No quota pools yet.</p>
              )}
              {view.sites.length ? (
                <WhenEditing>
              <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    send(`/projects/${id}/pools`, { siteId: poolSiteId, poolNumber, name: poolName, capacity });
                  }}
                >
                  <SelectField id="siteId" label="Site" value={poolSiteId} onChange={setPoolSiteId}>
                    {view.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField id="poolNumber" label="Quota pool number" value={poolNumber} onChange={setPoolNumber} />
                  <TextField id="poolName" label="Quota pool name" value={poolName} onChange={setPoolName} />
                  <TextField id="capacity" label="Quota slots" value={capacity} onChange={setCapacity} />
                  <Button type="submit" disabled={pending}>
                    Add quota pool
                  </Button>
                </form>
              </WhenEditing>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Project documents</CardTitle>
              <CardDescription>These files belong to the project. Appointment letters are created in HR.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {view.documents.length ? (
                view.documents.map((document) => (
                  <article key={document.id}>
                    <h3 className="font-medium">{document.title}</h3>
                    <p className="text-sm text-muted-foreground">{document.notes}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No project documents yet.</p>
              )}
              <WhenEditing>
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  send(`/projects/${id}/documents`, { title, notes });
                }}
              >
                <TextField id="title" label="Title" value={title} onChange={setTitle} />
                <AreaField id="notes" label="Notes" value={notes} onChange={setNotes} />
                <Button type="submit" disabled={pending}>
                  Save project document
                </Button>
              </form>
              </WhenEditing>
            </CardContent>
          </Card>
        </>
      ) : null}
    </Shell>
  );
}
