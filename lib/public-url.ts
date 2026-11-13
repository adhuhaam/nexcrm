/** Canonical public HTTPS origin for links, CORS, and mobile docs (no trailing slash). */
export function publicAppUrl(): string {
  const fromApp = process.env.APP_URL?.trim();
  if (fromApp) return fromApp.replace(/\/+$/, "");
  const domain = (process.env.PUBLIC_DOMAIN ?? "jacms.bluraymaldives.site").trim();
  return domain.includes("://") ? domain.replace(/\/+$/, "") : `https://${domain}`;
}

export function publicAppHostname(): string {
  try {
    return new URL(publicAppUrl()).hostname;
  } catch {
    return (process.env.PUBLIC_DOMAIN ?? "jacms.bluraymaldives.site").trim();
  }
}
