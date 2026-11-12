import type { WorkPermitInput, WorkPermitRecord } from "../modules/hr/work-permits.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    a { color: #1f4f3a; }
    nav.modules { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    nav.modules a { display: inline-block; min-height: 44px; line-height: 28px; padding: 8px 12px; border: 1px solid #1f4f3a; text-decoration: none; }
    nav.modules a[aria-current="page"] { background: #1f4f3a; color: white; }
    .panel { background: #fffdf8; border: 1px solid #ddd4c4; padding: 16px; margin-top: 16px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input, select { width: 100%; max-width: 100%; margin-top: 4px; padding: 10px; border: 1px solid #c9bfae; font: inherit; }
    button { margin-top: 16px; min-height: 44px; padding: 8px 12px; border: 1px solid #1f4f3a; background: #1f4f3a; color: white; font: inherit; }
    .notice { background: #e7f0ea; padding: 10px 12px; }
    .warning { background: #fff4d6; padding: 10px 12px; }
    .hint { color: #5d564c; }
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd4c4; white-space: nowrap; }
    @media (max-width: 720px) { h1 { font-size: 24px; } }
  </style>
</head>
<body>
  <main>
    <nav class="modules" aria-label="Modules">
      <a href="/">HR</a>
      <a href="/work-permits" aria-current="page">Work permits</a>
      <a href="/projects">Projects</a>
    </nav>
    ${body}
  </main>
</body>
</html>`;
}

function cell(value: string | null): string {
  return escapeHtml(value ?? "");
}

export function renderWorkPermitList(records: WorkPermitRecord[], notice: string | null): string {
  const rows = records
    .map(
      (record) => `<tr>
        <td>${cell(record.workPermitNumber)}</td>
        <td><a href="/work-permits/${record.id}">${cell(record.legalName)}</a></td>
        <td>${cell(record.nationality)}</td>
        <td>${cell(record.passportNumber)}</td>
        <td>${cell(record.occupation)}</td>
        <td>${cell(record.issuedOn)}</td>
        <td>${cell(record.expiresOn)}</td>
        <td>${cell(record.quotaPoolName)}</td>
        <td>${cell(record.linkedSlot)}</td>
        <td>${cell(record.linkedSites)}</td>
      </tr>`,
    )
    .join("");
  const banner = notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : "";
  return shell(
    "Work permits",
    `<h1>Work permits</h1>
    <p>Each person is a work permit holder. The columns follow the Xpat work permit report: holder, passport, occupation, permit dates, quota pool, slot, and linked site. Quota slots are opened under Projects. This copy stays in JACMS.</p>
    ${banner}
    <section class="panel">
      <h2>View work permit</h2>
      ${
        rows
          ? `<div class="table-wrap"><table>
        <thead><tr>
          <th>Work permit number</th><th>Work permit holder name</th><th>Nationality</th><th>Passport number</th>
          <th>Occupation</th><th>Issued</th><th>Expiry</th><th>Quota pool name</th><th>Linked quota slot</th><th>Linked sites</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
          : "<p>No work permits yet.</p>"
      }
      <p><a href="/work-permits/new">New work permit</a></p>
    </section>`,
  );
}

function input(name: string, label: string, value: string | null, type = "text"): string {
  return `<label for="${name}">${escapeHtml(label)}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value ?? "")}">`;
}

export function renderWorkPermitForm(
  companies: { id: string; legalName: string }[],
  draft: WorkPermitInput & { id: string | null; companyName?: string; quotaPoolNumber?: string | null; quotaPoolName?: string | null; linkedSites?: string | null; linkedSlot?: string | null; linkedSlotExpiry?: string | null },
  error: string | null,
  notice: string | null = null,
): string {
  const action = draft.id ? `/work-permits/${draft.id}` : "/work-permits";
  const options = companies
    .map((company) => `<option value="${company.id}"${company.id === draft.companyId ? " selected" : ""}>${escapeHtml(company.legalName)}</option>`)
    .join("");
  const banner = error
    ? `<p class="warning" role="alert">${escapeHtml(error)}</p>`
    : notice
      ? `<p class="notice" role="status">${escapeHtml(notice)}</p>`
      : "";
  const links = draft.id
    ? `<section class="panel">
      <h2>Linked quota</h2>
      <p>Quota pool number: ${escapeHtml(draft.quotaPoolNumber ?? "Not linked")}</p>
      <p>Quota pool name: ${escapeHtml(draft.quotaPoolName ?? "Not linked")}</p>
      <p>Linked sites: ${escapeHtml(draft.linkedSites ?? "Not linked")}</p>
      <p>Linked quota slot: ${escapeHtml(draft.linkedSlot ?? "Not linked")}</p>
      <p>Linked quota slot expiry: ${escapeHtml(draft.linkedSlotExpiry ?? "Not recorded")}</p>
    </section>`
    : "";
  return shell(
    draft.legalName || "New work permit",
    `<h1>${escapeHtml(draft.id ? draft.legalName : "New work permit")}</h1>
    <p>Record the same details an employer keeps for an Xpat work permit. Leave a field blank when it has not been verified.</p>
    ${banner}
    <section class="panel">
      <h2>Work permit holder</h2>
      <form method="post" action="${action}">
        <label for="companyId">Employer</label>
        <select id="companyId" name="companyId">${options}</select>
        ${input("workPermitNumber", "Work permit number", draft.workPermitNumber)}
        ${input("legalName", "Work permit holder name", draft.legalName)}
        ${input("nationality", "Nationality", draft.nationality)}
        ${input("country", "Country", draft.country)}
        ${input("gender", "Gender", draft.gender)}
        ${input("dateOfBirth", "Date of birth", draft.dateOfBirth, "date")}
        ${input("passportNumber", "Passport number", draft.passportNumber)}
        ${input("passportExpiry", "Passport expiry", draft.passportExpiry, "date")}
        ${input("occupation", "Occupation", draft.occupation)}
        ${input("issuedOn", "Work permit issued date", draft.issuedOn, "date")}
        ${input("expiresOn", "Work permit expiry date", draft.expiresOn, "date")}
        ${input("feePaidUntil", "Work permit fee last paid up to date", draft.feePaidUntil, "date")}
        ${input("medicalExpiry", "Medical expiry", draft.medicalExpiry, "date")}
        ${input("insuranceExpiry", "Insurance expiry", draft.insuranceExpiry, "date")}
        ${input("origin", "Origin", draft.origin)}
        ${input("salary", "Salary", draft.salary)}
        ${input("arrivalDate", "Arrival date", draft.arrivalDate, "date")}
        ${input("workVisaNumber", "Work visa number", draft.workVisaNumber)}
        ${input("workVisaExpiry", "Work visa expiry date", draft.workVisaExpiry, "date")}
        ${input("contractExpiry", "Work permit contract expiry", draft.contractExpiry, "date")}
        <button type="submit">Save work permit</button>
      </form>
    </section>
    ${links}`,
  );
}

export function emptyWorkPermit(companyId: string): WorkPermitInput & { id: null } {
  return {
    id: null,
    companyId,
    legalName: "",
    workPermitNumber: null,
    nationality: null,
    country: null,
    gender: null,
    dateOfBirth: null,
    passportNumber: null,
    passportExpiry: null,
    occupation: null,
    issuedOn: null,
    expiresOn: null,
    feePaidUntil: null,
    medicalExpiry: null,
    insuranceExpiry: null,
    origin: null,
    salary: null,
    arrivalDate: null,
    workVisaNumber: null,
    workVisaExpiry: null,
    contractExpiry: null,
  };
}
