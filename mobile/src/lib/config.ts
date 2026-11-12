import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_KEY = "jacms_api_base";

/** Suggested default for this office — user can replace with any reachable JACMS origin. */
export const DEFAULT_API_HINT = "http://server-1.snowy-pride.ts.net";

let memoryBase: string | null = null;

export function normalizeApiBase(input: string): string {
  let value = input.trim();
  if (!value) throw new Error("Enter the API URL for your JACMS server.");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("API URL is not valid. Example: http://server-1.snowy-pride.ts.net");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API URL must start with http:// or https://");
  }
  parsed.hash = "";
  parsed.search = "";
  let base = parsed.toString();
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

export async function loadApiBase(): Promise<string | null> {
  if (memoryBase) return memoryBase;
  const stored = await AsyncStorage.getItem(API_BASE_KEY);
  memoryBase = stored?.trim() ? stored.trim() : null;
  return memoryBase;
}

export async function saveApiBase(input: string): Promise<string> {
  const base = normalizeApiBase(input);
  memoryBase = base;
  await AsyncStorage.setItem(API_BASE_KEY, base);
  return base;
}

export async function clearApiBase(): Promise<void> {
  memoryBase = null;
  await AsyncStorage.removeItem(API_BASE_KEY);
}

/** Resolved base used by the API client. Throws if the user has not connected a server yet. */
export async function requireApiBase(): Promise<string> {
  const base = await loadApiBase();
  if (!base) throw new Error("Connect to a JACMS API URL before using the office.");
  return base;
}
