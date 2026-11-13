import type { OfficeUser } from "../access/access.ts";
import { PortalError } from "./errors.ts";

export const PORTAL_EMPLOYER_ROLE = "legal_employer" as const;
export const PORTAL_CLIENT_ROLE = "portal_client" as const;

export type PortalRoleSlug = typeof PORTAL_EMPLOYER_ROLE | typeof PORTAL_CLIENT_ROLE;

export function requirePortalCompany(user: OfficeUser, role: PortalRoleSlug): string {
  if (user.role.slug !== role) {
    throw new PortalError("This portal is not available for your account.", 403);
  }
  if (!user.portalCompanyId) {
    throw new PortalError("Your login is not linked to a company. Contact the agency.", 403);
  }
  return user.portalCompanyId;
}
