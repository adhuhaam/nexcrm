import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { loadApiBase, normalizeApiBase, requireApiBase, saveApiBase } from "./config";

const SESSION_KEY = "jacms_session";
const LEGACY_SESSION_KEY = "nexcrm_session";

type ApiError = Error & { status?: number };

let memoryToken: string | null = null;
let authListener: ((authed: boolean) => void) | null = null;

async function getStoredSession(): Promise<string | null> {
  const read = Platform.OS === "web" ? AsyncStorage.getItem.bind(AsyncStorage) : SecureStore.getItemAsync.bind(SecureStore);
  const primary = await read(SESSION_KEY);
  if (primary) return primary;
  const legacy = await read(LEGACY_SESSION_KEY);
  if (!legacy) return null;
  await setStoredSession(legacy);
  if (Platform.OS === "web") await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
  else await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
  return legacy;
}

async function setStoredSession(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(SESSION_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

async function deleteStoredSession(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function onAuthChange(listener: (authed: boolean) => void): void {
  authListener = listener;
}

export async function loadSession(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  memoryToken = await getStoredSession();
  return memoryToken;
}

export async function saveSession(token: string): Promise<void> {
  memoryToken = token;
  await setStoredSession(token);
  authListener?.(true);
}

export async function clearSession(): Promise<void> {
  memoryToken = null;
  await deleteStoredSession();
  authListener?.(false);
}

async function url(path: string): Promise<string> {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    throw new Error("Use relative API paths only.");
  }
  const base = await requireApiBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
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

function networkError(reason: unknown, base?: string | null): never {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/failed to fetch|network request failed|load failed|networkerror/i.test(message)) {
    fail(
      0,
      base
        ? `Cannot reach ${base}. Check the API URL, network, and that the JACMS server is running.`
        : "Cannot reach the JACMS server. Check the API URL and network.",
    );
  }
  fail(0, message || "Network request failed.");
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

/** Ping health (or session) on a candidate API origin before saving credentials. */
export async function probeApiBase(input: string): Promise<string> {
  const base = normalizeApiBase(input);
  let response: Response;
  try {
    response = await fetch(`${base}/health`, {
      headers: { accept: "application/json" },
    });
  } catch (reason) {
    networkError(reason, base);
  }
  if (!response.ok) {
    // Older servers may not expose /health — fall back to public session probe.
    try {
      response = await fetch(`${base}/api/v1/session`, {
        headers: { accept: "application/json" },
      });
    } catch (reason) {
      networkError(reason, base);
    }
    if (!response.ok) {
      fail(response.status, `Server at ${base} did not respond like JACMS.`);
    }
  } else {
    const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    if (body && body.ok === false) {
      fail(503, `JACMS at ${base} reported unhealthy.`);
    }
  }
  return base;
}

export async function getJson<T>(path: string): Promise<T> {
  const base = await loadApiBase();
  let response: Response;
  try {
    response = await fetch(await url(path), { headers: await headers() });
  } catch (reason) {
    networkError(reason, base);
  }
  return parse<T>(response);
}

export async function sendJson<T = Record<string, unknown>>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown> = {},
): Promise<T> {
  const base = await loadApiBase();
  let response: Response;
  try {
    response = await fetch(await url(path), {
      method,
      headers: await headers(
        method === "DELETE" ? undefined : { "content-type": "application/json" },
      ),
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
  } catch (reason) {
    networkError(reason, base);
  }
  return parse<T>(response);
}

export async function login(
  apiUrl: string,
  identifier: string,
  password: string,
  mode: "office" | "employee" = "office",
): Promise<string> {
  if (!identifier.trim() || !password) {
    fail(400, mode === "employee" ? "Enter phone and password." : "Enter email and password.");
  }
  const base = await probeApiBase(apiUrl);
  await saveApiBase(base);

  let response: Response;
  try {
    response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(
        mode === "employee"
          ? { phone: identifier.trim(), password }
          : { email: identifier.trim(), password },
      ),
    });
  } catch (reason) {
    networkError(reason, base);
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string };
  if (!response.ok) fail(response.status, payload.error ?? "Sign-in failed.");
  if (!payload.token) fail(500, "Server did not return a session token. Is this a JACMS API?");
  await saveSession(payload.token);
  return base;
}

export async function logout(): Promise<void> {
  try {
    await sendJson("/logout", "POST", {});
  } catch {
    // Clear local session even if the network call fails.
  }
  await clearSession();
}
