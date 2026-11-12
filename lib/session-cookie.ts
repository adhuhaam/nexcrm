import type { IncomingMessage } from "node:http";

export const SESSION_COOKIE_NAME = "jacms_session";
/** @deprecated Pre-rebrand cookie; still accepted until users re-login */
export const LEGACY_SESSION_COOKIE_NAME = "nexcrm_session";

let legacyCookieWarned = false;

export function readSessionToken(request: IncomingMessage): string | null {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const header = request.headers.cookie;
  if (!header) return null;
  let legacy: string | null = null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    const value = decodeURIComponent(rest.join("="));
    if (name === SESSION_COOKIE_NAME && value) return value;
    if (name === LEGACY_SESSION_COOKIE_NAME && value) legacy = value;
  }
  if (legacy) {
    if (!legacyCookieWarned) {
      legacyCookieWarned = true;
      console.warn(
        `[jacms] Deprecated cookie ${LEGACY_SESSION_COOKIE_NAME}; users should sign in again to receive ${SESSION_COOKIE_NAME}.`,
      );
    }
    return legacy;
  }
  return null;
}

export function formatSessionCookie(token: string, request: IncomingMessage, clear = false): string {
  const secure = request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  const value = clear ? "" : token;
  const age = clear ? 0 : 60 * 60 * 12;
  return `${SESSION_COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
}

export function sessionTokenFromCookieHeader(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const primary = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (primary) return decodeURIComponent(primary);
  const legacy = cookie.match(new RegExp(`(?:^|;\\s*)${LEGACY_SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (legacy) return decodeURIComponent(legacy);
  return null;
}
