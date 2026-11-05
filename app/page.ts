import { formatDateTime } from "../lib/dates.ts";
import type { CompanyRecord } from "../modules/companies/companies.ts";
import type { Preferences } from "../modules/companies/preferences.ts";
import { issueBlockers, type CompanyInput } from "../modules/companies/validation.ts";
import type { StoredSnapshot } from "../modules/documents/snapshots.ts";
import type { EmployeeListItem } from "../modules/hr/employees.ts";

export type PageModel = {
  companies: CompanyRecord[];
  preferences: Preferences;
  editor: CompanyInput & { id: string | null };
  snapshots: StoredSnapshot[];
  employees: EmployeeListItem[];
  notice: string | null;
  error: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function field(name: string, label: string, value: string | null, hint?: string): string {
  const described = hint ? ` aria-describedby="${name}-hint"` : "";
  return `<label for="${name}">${escapeHtml(label)}</label>
<input id="${name}" name="${name}" value="${escapeHtml(value ?? "")}"${described}>
${hint ? `<p id="${name}-hint" class="hint">${escapeHtml(hint)}</p>` : ""}`;
}

function companyName(companies: CompanyRecord[], id: string | null): string {
  if (!id) return "Not set";
  return companies.find((company) => company.id === id)?.legalName ?? "Missing company";
}

const notices: Record<string, string> = {
  saved: "Company saved.",
  "default-set": "Organization default updated. The company open in the editor was left as it was.",
  selected: "This company will be used for a new blank document.",
  snapshot: "HR document saved. Later company edits will not change it.",
  employee: "Employee added. Open a slot under Projects when they start work.",
};

export function renderPage(model: PageModel): string {
  const blockers = model.editor.id ? issueBlockers(model.editor) : [];
  const editorTitle = model.editor.id ? model.editor.legalName : "New company";
  const action = model.editor.id ? `/companies/${model.editor.id}` : "/companies";
  const companyQuery = model.editor.id ?? "new";
  const rows = model.companies
    .map((company) => {
      const current = company.id === model.editor.id ? " current" : "";
      return `<li class="${current.trim()}"><a href="/?company=${company.id}">${escapeHtml(company.legalName)}</a></li>`;
    })
    .join("");
  const snapshotRows = model.snapshots
    .map((item) => {
      const when = formatDateTime(item.createdAt);
      return `<article>
        <h3>${escapeHtml(item.snapshot.legalName)}</h3>
        <p>${escapeHtml(item.snapshot.phone ?? "No phone")} · ${escapeHtml(item.snapshot.email ?? "No email")}</p>
        <p>${escapeHtml(item.snapshot.registeredAddress ?? "No address")}</p>
        <p class="hint">Saved ${escapeHtml(when)}. This copy stays as it was when saved.</p>
      </article>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NEXCRM HR</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.45 "Segoe UI", sans-serif; background: #f3f0e8; color: #1d1a16; }
    main { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    a { color: #1f4f3a; }
    .layout { display: grid; grid-template-columns: 240px 1fr; gap: 20px; }
    .panel { background: #fffdf8; border: 1px solid #ddd4c4; padding: 16px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { margin: 0; }
    li a { display: block; padding: 10px 8px; text-decoration: none; }
    li.current a { background: #e7f0ea; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input { width: 100%; margin-top: 4px; padding: 10px; border: 1px solid #c9bfae; font: inherit; }
    button { margin: 12px 8px 0 0; min-height: 44px; padding: 8px 12px; border: 1px solid #1f4f3a; background: #1f4f3a; color: white; font: inherit; }
    button.secondary { background: white; color: #1f4f3a; }
    nav.modules { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    nav.modules a { display: inline-block; min-height: 44px; line-height: 28px; padding: 8px 12px; border: 1px solid #1f4f3a; text-decoration: none; }
    nav.modules a[aria-current="page"] { background: #1f4f3a; color: white; }
    select { width: 100%; margin-top: 4px; padding: 10px; border: 1px solid #c9bfae; font: inherit; }
    .hint { color: #5d564c; margin: 4px 0 0; }
    .notice { background: #e7f0ea; padding: 10px 12px; margin: 12px 0; }
    .warning { background: #fff4d6; padding: 10px 12px; margin: 12px 0; }
    .warning li { margin-left: 18px; list-style: disc; }
    article { border-top: 1px solid #ddd4c4; padding-top: 12px; margin-top: 12px; }
    @media (max-width: 720px) {
      .layout { display: block; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main>
    <nav class="modules" aria-label="Modules">
      <a href="/" aria-current="page">HR</a>
      <a href="/work-permits">Work permits</a>
      <a href="/projects">Projects</a>
    </nav>
    <h1>HR</h1>
    <p>Letters of appointment and company documents are created here. Work permits follow the Xpat work permit report. Sites, quota pools, and quota slots are in Projects.</p>
    ${model.notice ? `<p class="notice" role="status">${escapeHtml(model.notice)}</p>` : ""}
    ${model.error ? `<p class="warning" role="alert">${escapeHtml(model.error)}</p>` : ""}
    <section class="panel">
      <h2>Which company is used</h2>
      <p>Organization default: <strong>${escapeHtml(companyName(model.companies, model.preferences.defaultCompanyId))}</strong></p>
      <p>Selected for a new blank document: <strong>${escapeHtml(companyName(model.companies, model.preferences.selectedCompanyId))}</strong></p>
      <p class="hint">Changing the organization default does not switch the company open in the editor.</p>
    </section>
    <div class="layout">
      <section class="panel">
        <h2>Companies</h2>
        <ul>${rows}</ul>
        <p><a href="/?company=new">Add a company</a></p>
      </section>
      <section class="panel">
        <h2>${escapeHtml(editorTitle)}</h2>
        ${
          blockers.length
            ? `<div class="warning" role="status"><p>This company cannot issue a document yet.</p><ul>${blockers
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}</ul><p class="hint">Letterhead artwork was not included with the handoff, so none is stored.</p></div>`
            : ""
        }
        <form method="post" action="${action}">
          ${field("legalName", "Legal name", model.editor.legalName)}
          ${field("registrationNumber", "Registration number", model.editor.registrationNumber, "Leave blank when it has not been verified.")}
          ${field("registeredAddress", "Registered address", model.editor.registeredAddress)}
          ${field("country", "Country", model.editor.country)}
          ${field("businessActivity", "Business activity", model.editor.businessActivity)}
          ${field("phone", "Phone", model.editor.phone)}
          ${field("email", "Email", model.editor.email)}
          ${field("documentPrefix", "Document prefix", model.editor.documentPrefix)}
          ${field("signatoryName", "Authorized signatory", model.editor.signatoryName)}
          ${field("signatoryTitle", "Signatory title", model.editor.signatoryTitle)}
          <button type="submit">Save company</button>
        </form>
        ${
          model.editor.id
            ? `<form method="post" action="/preferences/default"><input type="hidden" name="companyId" value="${model.editor.id}"><input type="hidden" name="returnTo" value="${companyQuery}"><button class="secondary" type="submit">Set as organization default</button></form>
        <form method="post" action="/preferences/selected"><input type="hidden" name="companyId" value="${model.editor.id}"><input type="hidden" name="returnTo" value="${companyQuery}"><button class="secondary" type="submit">Use for new documents</button></form>
        <form method="post" action="/documents"><input type="hidden" name="companyId" value="${model.editor.id}"><button class="secondary" type="submit">Save HR document</button></form>`
            : ""
        }
      </section>
    </div>
    <section class="panel">
      <h2>Work permit holders</h2>
      <p class="hint">The full record is the work permit: passport, occupation, permit dates, and the linked quota slot.</p>
      ${
        model.employees.length
          ? `<ul>${model.employees.map((employee) => `<li><a href="/work-permits/${employee.id}">${escapeHtml(employee.legalName)}</a> · ${escapeHtml(employee.companyName)}</li>`).join("")}</ul>`
          : "<p>No work permits yet.</p>"
      }
      <p><a href="/work-permits/new">New work permit</a></p>
    </section>
    <section class="panel">
      <h2>HR documents</h2>
      ${snapshotRows || "<p>No saved copies yet.</p>"}
    </section>
  </main>
</body>
</html>`;
}

export function noticeText(code: string | null): string | null {
  if (!code) return null;
  return notices[code] ?? null;
}
