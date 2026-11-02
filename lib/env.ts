import { readFileSync } from "node:fs";

export function loadEnv(path = new URL("../.env", import.meta.url)): void {
  const file = path instanceof URL ? path : new URL(path, import.meta.url);
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
