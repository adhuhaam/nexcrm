const VERIFY_URL = "https://xpat.egov.mv/EmploymentApproval/EmploymentApproval/WorkPermitVerify";
const CARD_VERIFY_URL = "https://xpat.egov.mv/EmploymentApproval/CardVerify/Verify";

export class XpatError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "XpatError";
    this.status = status;
  }
}

export type XpatNormalized = {
  source: "verify";
  workPermitNumber: string;
  passportNumber: string | null;
  legalName: string;
  occupation: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  xpatStatus: string | null;
  xpatStateName: string | null;
  employerName: string | null;
  workSite: string | null;
  workSiteCode: string | null;
  photoUrl: string | null;
  verifySearch: string;
};

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutSuffix = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(withoutSuffix)) return withoutSuffix.slice(0, 10);
  const match = withoutSuffix.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const months: Record<string, string> = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12",
    };
    const month = months[match[2] ?? ""];
    if (month) return `${match[3]}-${month}-${(match[1] ?? "").padStart(2, "0")}`;
  }
  const parsed = new Date(withoutSuffix);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function extractAttr(tag: string, attr: string): string | null {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.replace(/&amp;/g, "&") ?? null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function fieldMap(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  const labels = [...html.matchAll(/class=["'][^"']*verification-label[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  for (const labelMatch of labels) {
    const label = stripTags(labelMatch[1] ?? "").toLowerCase();
    if (!label) continue;
    const after = html.slice(labelMatch.index! + labelMatch[0].length);
    const valueMatch = after.match(/class=["'][^"']*verification-value[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/div>/i);
    const value = valueMatch ? stripTags(valueMatch[1] ?? "") : "";
    if (value) map[label] = value;
  }
  return map;
}

/**
 * Card layout used by XPAT (same approach as adhuhaam/xxpat):
 * `.kt-widget__subhead a` rows with icon title/class for employer / occupation / passport / WP.
 */
function subheadFields(html: string): {
  employer: string;
  occupation: string;
  passport: string;
  workPermit: string;
} {
  const blockMatch = html.match(/class=["'][^"']*kt-widget__subhead[^"']*["'][^>]*>([\s\S]{0,5000}?)<\/div>/i);
  const scope = blockMatch?.[1] ?? html;
  const links = [...scope.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
  let employer = "";
  let occupation = "";
  let passport = "";
  let workPermit = "";
  const ordered: string[] = [];

  for (const match of links) {
    const full = match[0] ?? "";
    const iconMatch = full.match(/<i\b([^>]*)>/i);
    const iconAttrs = iconMatch?.[1] ?? "";
    const title = (extractAttr(`<i ${iconAttrs}>`, "title") ?? "").toLowerCase();
    const iconClass = (extractAttr(`<i ${iconAttrs}>`, "class") ?? iconAttrs).toLowerCase();
    const text = stripTags(match[1] ?? "");
    if (!text) continue;
    ordered.push(text);
    if (title.includes("employer") || iconClass.includes("businesswoman")) employer ||= text;
    else if (title.includes("occupation") || iconClass.includes("suitcase")) occupation ||= text;
    else if (title.includes("passport") || iconClass.includes("calendar")) passport ||= text;
    else if (title.includes("work permit") || iconClass.includes("website")) workPermit ||= text;
  }

  if (!employer && ordered[0]) employer = ordered[0];
  if (!occupation && ordered[1]) occupation = ordered[1];
  if (!passport && ordered[2]) passport = ordered[2];
  if (!workPermit && ordered[3]) workPermit = ordered[3];
  return { employer, occupation, passport, workPermit };
}

function extractBodyField(html: string, label: RegExp): string {
  const text = stripTags(html);
  const match = text.match(label);
  return match?.[1]?.trim() ?? "";
}

async function postVerify(workPermitNumber: string, search: string): Promise<string> {
  const formData = new URLSearchParams();
  formData.append("workPermitNumber", workPermitNumber);
  formData.append("firstName", search);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
    });
  } catch {
    throw new XpatError("Could not reach Xpat verification", 502);
  }
  if (!res.ok) throw new XpatError(`Xpat verification returned ${res.status}`, 502);
  return res.text();
}

async function getCardVerify(workPermitNumber: string, search: string): Promise<string> {
  const url = new URL(CARD_VERIFY_URL);
  url.searchParams.set("wp", workPermitNumber);
  url.searchParams.set("firstName", search);
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new XpatError("Could not reach Xpat verification", 502);
  }
  if (!res.ok) throw new XpatError(`Xpat verification returned ${res.status}`, 502);
  return res.text();
}

function parseVerifyHtml(html: string, fallbackWp: string, search: string): XpatNormalized {
  const nameMatch =
    html.match(/class=["'][^"']*verification-name[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i) ??
    html.match(/class=["'][^"']*kt-widget__username[^"']*["'][^>]*>([\s\S]*?)<\//i);
  const legalName = nameMatch ? stripTags(nameMatch[1] ?? "").replace("✓", "").trim() : "";
  if (!legalName) throw new XpatError("Work permit not found on Xpat", 404);

  let photoUrl: string | null = null;
  const photoMatch =
    html.match(/class=["'][^"']*verification-photo-container[^"']*["'][\s\S]*?<img[^>]+>/i) ??
    html.match(/class=["'][^"']*kt-widget__media[^"']*["'][\s\S]*?<img[^>]+>/i);
  if (photoMatch) {
    const src = extractAttr(photoMatch[0], "src");
    if (src && !src.includes("default.jpg") && !src.includes("user_Icon")) {
      photoUrl = src.startsWith("http") ? src : `https://xpat.egov.mv${src}`;
    }
  }

  const fields = fieldMap(html);
  const subhead = subheadFields(html);
  const employer =
    fields["current employer"] || fields.employer || subhead.employer || "";
  const occupation = fields.occupation || subhead.occupation || "";
  const passport = fields["passport number"] || fields.passport || subhead.passport || "";
  const permit =
    fields["work permit number"] || fields["work permit"] || subhead.workPermit || fallbackWp;
  const issuedRaw =
    fields["issued date"] ||
    fields["issued on"] ||
    extractBodyField(html, /Issued On:\s*([\dA-Za-z-]+)/i);
  const expiryRaw =
    fields["expiry date"] ||
    fields["work permit valid till"] ||
    extractBodyField(html, /Work Permit Valid till:\s*([\dA-Za-z-]+)/i);

  let siteRaw = fields["registered work site"] || fields["work site"] || "";
  if (!siteRaw) {
    const siteBlock = html.match(/Work Site:\s*([\s\S]*?)(?:<\/div>|<br|$)/i);
    if (siteBlock) siteRaw = stripTags(siteBlock[1] ?? "");
  }

  const badgeMatch =
    html.match(/class=["'][^"']*btn-upper[^"']*["'][^>]*>([\s\S]*?)<\//i) ??
    html.match(/class=["'][^"']*kt-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const xpatStateName = badgeMatch ? stripTags(badgeMatch[1] ?? "") : null;
  const expired =
    /expired|kt-font-danger/i.test(html) ||
    /expired/i.test(expiryRaw) ||
    (html.includes("kt-font-danger") && !html.includes("kt-font-success"));
  const xpatStatus = expired ? "invalid" : xpatStateName || employer ? "valid" : null;

  let workSite: string | null = null;
  let workSiteCode: string | null = null;
  if (siteRaw) {
    const codeMatch = siteRaw.match(/\((ST\d+)\)/);
    if (codeMatch) {
      workSiteCode = codeMatch[1] ?? null;
      workSite = siteRaw.replace(codeMatch[0], "").trim() || null;
    } else {
      workSite = siteRaw.trim() || null;
    }
  }

  return {
    source: "verify",
    workPermitNumber: permit.trim() || fallbackWp,
    passportNumber: passport.trim() || null,
    legalName,
    occupation: occupation.trim() || null,
    issuedOn: toDateOnly(issuedRaw),
    expiresOn: toDateOnly(expiryRaw),
    xpatStatus,
    xpatStateName,
    employerName: employer.trim() || null,
    workSite,
    workSiteCode,
    photoUrl,
    verifySearch: search,
  };
}

export async function resolveXpatLookup(input: {
  workPermitNumber: string;
  passportNumber?: string | null;
  lastName?: string | null;
}): Promise<XpatNormalized> {
  const wp = (input.workPermitNumber ?? "").trim();
  const passport = (input.passportNumber ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  if (!wp) throw new XpatError("Work permit number is required");
  if (!passport && !lastName) throw new XpatError("Provide a passport number or last name");

  const search = passport || lastName;
  let html = await postVerify(wp, search);
  try {
    return parseVerifyHtml(html, wp, search);
  } catch (firstError) {
    if (!(firstError instanceof XpatError) || firstError.status !== 404) throw firstError;
    html = await getCardVerify(wp, search);
    return parseVerifyHtml(html, wp, search);
  }
}

export async function fetchPublicImage(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(imageUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) return null;
    return { buffer, mimeType: res.headers.get("content-type") ?? "image/jpeg" };
  } catch {
    return null;
  }
}
