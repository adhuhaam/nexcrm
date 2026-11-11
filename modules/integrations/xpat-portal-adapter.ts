/**
 * XPAT portal sync adapter.
 *
 * Production sync uses the public Maldives eGov verify HTML endpoints (see `xpat.ts`).
 * When an authenticated XPAT employer portal API becomes available, implement
 * `fetchPortalWorkerProfile` here using env placeholders — no credentials in git.
 *
 * | Variable | Purpose |
 * | --- | --- |
 * | `XPAT_PORTAL_BASE_URL` | Employer portal API base (e.g. `https://xpat.egov.mv/api`) |
 * | `XPAT_PORTAL_CLIENT_ID` | OAuth / API client id |
 * | `XPAT_PORTAL_CLIENT_SECRET` | OAuth / API client secret |
 * | `XPAT_PORTAL_USERNAME` | Service account username (if not OAuth) |
 * | `XPAT_PORTAL_PASSWORD` | Service account password (if not OAuth) |
 */

export type XpatPortalWorkerProfile = {
  workPermitNumber: string;
  passportNumber: string | null;
  legalName: string | null;
  workSite: string | null;
  expiresOn: string | null;
  xpatStatus: string | null;
  photoUrl: string | null;
};

export function xpatPortalConfigured(): boolean {
  return Boolean(process.env.XPAT_PORTAL_BASE_URL?.trim());
}

/** Portal API pull — returns null when credentials are not configured. */
export async function fetchPortalWorkerProfile(_workPermitNumber: string): Promise<XpatPortalWorkerProfile | null> {
  if (!xpatPortalConfigured()) return null;
  // Placeholder: wire to employer portal REST when credentials are supplied.
  throw new Error(
    "XPAT_PORTAL_* is set but portal sync is not implemented yet. HR should use Sync from Xpat (eGov verify) on the employee record.",
  );
}
