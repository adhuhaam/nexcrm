import { listCompanies } from "../modules/companies/companies.ts";
import type { ProjectRecord, ProjectView } from "../modules/projects/projects.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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

export function projectNotice(code: string | null): string | null {
  if (!code) return null;
  return notices[code] ?? errors[code] ?? null;
}

export function projectNoticeIsError(code: string | null): boolean {
  return Boolean(code && code in errors);
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.45 "Segoe UI", sans-serif; background: #f3f0e8; color: #1d1a16; }
    main { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    a { color: #1f4f3a; }
    nav.modules { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    nav.modules a { display: inline-block; min-height: 44px; line-height: 28px; padding: 8px 12px; border: 1px solid #1f4f3a; text-decoration: none; }
    nav.modules a[aria-current="page"] { background: #1f4f3a; color: white; }
    .panel { background: #fffdf8; border: 1px solid #ddd4c4; padding: 16px; margin-top: 16px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input, select, textarea { width: 100%; margin-top: 4px; padding: 10px; border: 1px solid #c9bfae; font: inherit; }
    button { margin-top: 12px; min-height: 44px; padding: 8px 12px; border: 1px solid #1f4f3a; background: #1f4f3a; color: white; font: inherit; }
    .notice { background: #e7f0ea; padding: 10px 12px; }
    .warning { background: #fff4d6; padding: 10px 12px; }
    .hint { color: #5d564c; }
    ul { padding-left: 18px; }
    @media (max-width: 720px) { h1 { font-size: 24px; } }
  </style>
</head>
<body>
  <main>
    <nav class="modules" aria-label="Modules">
      <a href="/">HR</a>
      <a href="/work-permits">Work permits</a>
      <a href="/projects" aria-current="page">Projects</a>
    </nav>
    ${body}
  </main>
</body>
</html>`;
}

export function renderProjectList(projects: ProjectRecord[], companies: { id: string; legalName: string }[], notice: string | null, error: boolean): string {
  const rows = projects
    .map(
      (project) => `<li class="panel" style="margin-top:12px;list-style:none">
        <a href="/projects/${project.id}"><strong>${escapeHtml(project.name)}</strong></a>
        <div class="hint">${escapeHtml(project.companyName)}</div>
        <div class="hint" style="margin-top:6px">
          ${project.siteCount} sites · ${project.poolCount} pools · ${project.slotCount} slots · ${project.employeeCount} employees
          ${project.openSlotCount ? ` · ${project.openSlotCount} open` : ""}
        </div>
      </li>`,
    )
    .join("");
  const options = companies.map((company) => `<option value="${company.id}">${escapeHtml(company.legalName)}</option>`).join("");
  const banner = notice ? `<p class="${error ? "warning" : "notice"}" role="${error ? "alert" : "status"}">${escapeHtml(notice)}</p>` : "";
  return shell(
    "NEXCRM projects",
    `<h1>Projects</h1>
    <p>Legal employer → project → site → pool → slot → employee. Open a project to manage placement.</p>
    ${banner}
    <section class="panel">
      <h2>Project list</h2>
      ${rows ? `<ul style="padding:0;margin:0">${rows}</ul>` : "<p>No projects yet.</p>"}
    </section>
    <section class="panel">
      <h2>New project</h2>
      <form method="post" action="/projects">
        <label for="companyId">Company</label>
        <select id="companyId" name="companyId">${options}</select>
        <label for="name">Project name</label>
        <input id="name" name="name">
        <button type="submit">Create project</button>
      </form>
    </section>`,
  );
}

export function renderProjectDetail(view: ProjectView, notice: string | null, error: boolean): string {
  const banner = notice ? `<p class="${error ? "warning" : "notice"}" role="${error ? "alert" : "status"}">${escapeHtml(notice)}</p>` : "";
  const siteOptions = view.sites.map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join("");
  const openSlots = view.slots.filter((slot) => slot.status === "open");
  const slotOptions = openSlots
    .map((slot) => `<option value="${slot.id}" data-pool="${slot.poolId}">${escapeHtml(String(slot.slotNumber ?? ""))} · ${escapeHtml(slot.poolName)} · ${escapeHtml(slot.siteName)}</option>`)
    .join("");
  const employeeOptions = view.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.legalName)}</option>`).join("");
  const slotRows = view.slots
    .map((slot) => {
      const state = slot.status === "occupied" ? "Occupied" : "Open";
      const holder = slot.employeeName ?? "No work permit holder";
      return `<li>${escapeHtml(String(slot.slotNumber ?? ""))} · ${state} · ${escapeHtml(holder)} · ${escapeHtml(slot.occupation ?? "No occupation")} · ${escapeHtml(slot.poolName)} · ${escapeHtml(slot.siteName)}</li>`;
    })
    .join("");
  const documentRows = view.documents
    .map((document) => `<article><h3>${escapeHtml(document.title)}</h3><p>${escapeHtml(document.notes ?? "")}</p></article>`)
    .join("");
  return shell(
    view.project.name,
    `<h1>${escapeHtml(view.project.name)}</h1>
    <p>${escapeHtml(view.project.companyName)}</p>
    ${banner}
    <section class="panel">
      <h2>Quota slots</h2>
      <p class="hint">A quota slot is one place in a pool. Open can take a work permit. Occupied is a work permit holder working on this project.</p>
      ${slotRows ? `<ul>${slotRows}</ul>` : "<p>No quota slots yet.</p>"}
      ${
        openSlots.length
          ? `<form method="post" action="/projects/${view.project.id}/slots">
        <label for="slotId">Open quota slot</label>
        <select id="slotId" name="slotId">${slotOptions}</select>
        <label for="employeeId">Work permit holder</label>
        <select id="employeeId" name="employeeId"><option value="">New work permit holder</option>${employeeOptions}</select>
        <label for="employeeName">New work permit holder name</label>
        <input id="employeeName" name="employeeName">
        <button type="submit">Occupy slot</button>
      </form>`
          : view.pools.length
            ? "<p>Every quota slot in this project is occupied.</p>"
            : "<p>Add a site and a quota pool before occupying a slot.</p>"
      }
    </section>
    <section class="panel">
      <h2>Sites</h2>
      ${
        view.sites.length
          ? `<ul>${view.sites
              .map((site) => `<li>${escapeHtml(site.name)} · ${escapeHtml(site.siteType ?? "Site type not recorded")} · ${escapeHtml(site.state === "active" ? "Active" : site.state)}${site.address ? ` · ${escapeHtml(site.address)}` : ""}</li>`)
              .join("")}</ul>`
          : "<p>No sites yet.</p>"
      }
      <form method="post" action="/projects/${view.project.id}/sites">
        <label for="siteName">Site name</label>
        <input id="siteName" name="name">
        <label for="siteType">Site type</label>
        <select id="siteType" name="siteType"><option value="">Not recorded</option><option value="Address">Address</option><option value="Vessel">Vessel</option></select>
        <label for="address">Site address</label>
        <input id="address" name="address">
        <button type="submit">Add site</button>
      </form>
    </section>
    <section class="panel">
      <h2>Quota pools</h2>
      ${
        view.pools.length
          ? `<ul>${view.pools
              .map((pool) => `<li>${escapeHtml(pool.poolNumber ? `${pool.poolNumber} · ` : "")}${escapeHtml(pool.name)} · ${escapeHtml(pool.siteName)} · ${pool.used} occupied · ${pool.open} open</li>`)
              .join("")}</ul>`
          : "<p>No quota pools yet.</p>"
      }
      ${
        view.sites.length
          ? `<form method="post" action="/projects/${view.project.id}/pools">
        <label for="siteId">Site</label>
        <select id="siteId" name="siteId">${siteOptions}</select>
        <label for="poolNumber">Quota pool number</label>
        <input id="poolNumber" name="poolNumber">
        <label for="poolName">Quota pool name</label>
        <input id="poolName" name="name">
        <label for="capacity">Quota slots</label>
        <input id="capacity" name="capacity" inputmode="numeric" value="1">
        <button type="submit">Add quota pool</button>
      </form>`
          : ""
      }
    </section>
    <section class="panel">
      <h2>Project documents</h2>
      <p class="hint">These files belong to the project. Appointment letters are created in HR.</p>
      ${documentRows || "<p>No project documents yet.</p>"}
      <form method="post" action="/projects/${view.project.id}/documents">
        <label for="title">Title</label>
        <input id="title" name="title">
        <label for="notes">Notes</label>
        <textarea id="notes" name="notes" rows="4"></textarea>
        <button type="submit">Save project document</button>
      </form>
    </section>`,
  );
}
