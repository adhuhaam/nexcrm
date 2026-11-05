import { getJson } from "@/lib/api";

export type ModulePermission = {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type OfficeSession = {
  user: { id: string; name: string; email: string } | null;
  role?: {
    id: string;
    slug: string;
    name: string;
    canPreview: boolean;
    canEdit: boolean;
    canDelete: boolean;
    systemRole: boolean;
    permissions?: ModulePermission[];
  };
};

const TTL_MS = 90_000;

let cache: { at: number; data: OfficeSession } | null = null;
let inflight: Promise<OfficeSession> | null = null;

export function clearSessionCache(): void {
  cache = null;
  inflight = null;
}

/** Sync peek for instant Shell paint after soft navigations. */
export function peekOfficeSession(): OfficeSession | null {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  return null;
}

/** Shared session fetch — one request shared across Soft navigations. */
export async function loadOfficeSession(): Promise<OfficeSession> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = getJson<OfficeSession>("/api/v1/session")
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
