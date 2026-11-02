import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "./config";

const SESSION_KEY = "nexcrm_session";

type ApiError = Error & { status?: number };

let memoryToken: string | null = null;
let authListener: ((authed: boolean) => void) | null = null;

export function onAuthChange(listener: (authed: boolean) => void): void {
  authListener = listener;
}

export async function loadSession(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  memoryToken = await SecureStore.getItemAsync(SESSION_KEY);
  return memoryToken;
}

export async function saveSession(token: string): Promise<void> {
  memoryToken = token;
  await SecureStore.setItemAsync(SESSION_KEY, token);
  authListener?.(true);
}

export async function clearSession(): Promise<void> {
  memoryToken = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
  authListener?.(false);
}

function url(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    throw new Error("Use relative API paths only — BASE_URL is fixed to Tailscale.");
  }
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function headers(extra?: HeadersInit): Promise<Headers> {
  const h = new Headers(extra);
  h.set("accept", "application/json");
  const token = await loadSession();
  if (token) h.set("authorization", `Bearer ${token}`);
  return h;
}

function fail(status: number, message: string): never {
  const error = new Error(message) as ApiError;
  error.status = status;
  throw error;
}

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401) {
    await clearSession();
    fail(401, payload.error ?? "Sign in to open the office.");
  }
  if (!response.ok) {
    fail(response.status, payload.error ?? "Request failed");
  }
  return payload;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(url(path), { headers: await headers() });
  return parse<T>(response);
}

export async function sendJson<T = Record<string, unknown>>(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url(path), {
    method,
    headers: await headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  return parse<T>(response);
}

export async function login(email: string, password: string): Promise<void> {
  const response = await fetch(url("/login"), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string };
  if (!response.ok) fail(response.status, payload.error ?? "Sign-in failed.");
  if (!payload.token) fail(500, "Server did not return a session token.");
  await saveSession(payload.token);
}

export async function logout(): Promise<void> {
  try {
    await sendJson("/logout", "POST", {});
  } catch {
    // Clear local session even if the network call fails.
  }
  await clearSession();
}
