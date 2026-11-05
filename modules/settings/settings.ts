import { pool } from "../../lib/db.ts";
import { loadEnv } from "../../lib/env.ts";

loadEnv();

export const SETTING_OPENAI_API_KEY = "openai_api_key";
export const SETTING_OPENAI_OCR_MODEL = "openai_ocr_model";
export const SETTING_OFFICE_NAME = "office_name";
export const SETTING_OFFICE_SUPPORT_EMAIL = "office_support_email";
export const SETTING_DISPLAY_TIME_ZONE = "display_time_zone";
export const SETTING_DEFAULT_CURRENCY = "default_currency";
export const SETTING_DATE_FORMAT = "date_format";
export const SETTING_WEEK_STARTS_ON = "week_starts_on";

export type OpenAiConfig = {
  apiKey: string | null;
  model: string;
  source: "settings" | "env" | "none";
};

export type OfficeSettings = {
  officeName: string;
  supportEmail: string;
  timeZone: string;
  currency: string;
  dateFormat: "dmy" | "ymd" | "mdy";
  weekStartsOn: "monday" | "sunday";
};

export type SystemSettingsView = OfficeSettings & {
  openaiConfigured: boolean;
  openaiKeyHint: string | null;
  openaiKeySource: "settings" | "env" | "none";
  openaiModel: string;
  envKeyPresent: boolean;
  /** @deprecated alias kept for older clients */
  openaiConfiguredAlias?: boolean;
};

/** @deprecated Use SystemSettingsView */
export type OpenAiSettingsView = SystemSettingsView;

const TIME_ZONES = [
  "Indian/Maldives",
  "Asia/Colombo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "UTC",
] as const;

async function getRaw(key: string): Promise<string | null> {
  const result = await pool.query<{ value: string }>(`select value from system_settings where key = $1`, [key]);
  const value = result.rows[0]?.value?.trim() ?? "";
  return value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `insert into system_settings (key, value, updated_at)
     values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

export async function clearSetting(key: string): Promise<void> {
  await pool.query(`delete from system_settings where key = $1`, [key]);
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

function normalizeCurrency(value: string | null | undefined): string {
  const text = (value ?? "MVR").trim().toUpperCase().slice(0, 8);
  return text || "MVR";
}

function normalizeDateFormat(value: string | null | undefined): OfficeSettings["dateFormat"] {
  const text = (value ?? "dmy").trim().toLowerCase();
  if (text === "ymd" || text === "mdy") return text;
  return "dmy";
}

function normalizeWeekStart(value: string | null | undefined): OfficeSettings["weekStartsOn"] {
  return (value ?? "monday").trim().toLowerCase() === "sunday" ? "sunday" : "monday";
}

function normalizeTimeZone(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (text) return text;
  return process.env.DISPLAY_TIME_ZONE?.trim() || "Indian/Maldives";
}

export async function resolveOfficeSettings(): Promise<OfficeSettings> {
  const [officeName, supportEmail, timeZone, currency, dateFormat, weekStartsOn] = await Promise.all([
    getRaw(SETTING_OFFICE_NAME),
    getRaw(SETTING_OFFICE_SUPPORT_EMAIL),
    getRaw(SETTING_DISPLAY_TIME_ZONE),
    getRaw(SETTING_DEFAULT_CURRENCY),
    getRaw(SETTING_DATE_FORMAT),
    getRaw(SETTING_WEEK_STARTS_ON),
  ]);
  return {
    officeName: officeName || "NEXCRM",
    supportEmail: supportEmail || "",
    timeZone: normalizeTimeZone(timeZone),
    currency: normalizeCurrency(currency || process.env.DEFAULT_CURRENCY),
    dateFormat: normalizeDateFormat(dateFormat),
    weekStartsOn: normalizeWeekStart(weekStartsOn),
  };
}

export async function resolveOpenAiConfig(): Promise<OpenAiConfig> {
  const fromDb = await getRaw(SETTING_OPENAI_API_KEY);
  const fromEnv = process.env.OPENAI_API_KEY?.trim() || null;
  const modelFromDb = await getRaw(SETTING_OPENAI_OCR_MODEL);
  const model = modelFromDb || process.env.OPENAI_OCR_MODEL?.trim() || "gpt-4o-mini";
  if (fromDb) return { apiKey: fromDb, model, source: "settings" };
  if (fromEnv) return { apiKey: fromEnv, model, source: "env" };
  return { apiKey: null, model, source: "none" };
}

export async function getSystemSettingsView(): Promise<SystemSettingsView> {
  const [office, config] = await Promise.all([resolveOfficeSettings(), resolveOpenAiConfig()]);
  const envKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    ...office,
    openaiConfigured: Boolean(config.apiKey),
    openaiKeyHint: config.apiKey ? maskKey(config.apiKey) : null,
    openaiKeySource: config.source,
    openaiModel: config.model,
    envKeyPresent,
  };
}

/** @deprecated */
export async function getOpenAiSettingsView(): Promise<SystemSettingsView> {
  return getSystemSettingsView();
}

export async function saveSystemSettings(input: {
  apiKey?: string | null;
  clearApiKey?: boolean;
  model?: string | null;
  officeName?: string | null;
  supportEmail?: string | null;
  timeZone?: string | null;
  currency?: string | null;
  dateFormat?: string | null;
  weekStartsOn?: string | null;
}): Promise<SystemSettingsView> {
  if (input.clearApiKey) {
    await clearSetting(SETTING_OPENAI_API_KEY);
  } else if (typeof input.apiKey === "string") {
    const trimmed = input.apiKey.trim();
    if (trimmed) await setSetting(SETTING_OPENAI_API_KEY, trimmed);
  }
  if (typeof input.model === "string") {
    await setSetting(SETTING_OPENAI_OCR_MODEL, input.model.trim() || "gpt-4o-mini");
  }
  if (typeof input.officeName === "string") {
    await setSetting(SETTING_OFFICE_NAME, input.officeName.trim().slice(0, 120) || "NEXCRM");
  }
  if (typeof input.supportEmail === "string") {
    const email = input.supportEmail.trim().toLowerCase().slice(0, 200);
    if (email) await setSetting(SETTING_OFFICE_SUPPORT_EMAIL, email);
    else await clearSetting(SETTING_OFFICE_SUPPORT_EMAIL);
  }
  if (typeof input.timeZone === "string") {
    const zone = input.timeZone.trim() || "Indian/Maldives";
    await setSetting(SETTING_DISPLAY_TIME_ZONE, zone);
  }
  if (typeof input.currency === "string") {
    await setSetting(SETTING_DEFAULT_CURRENCY, normalizeCurrency(input.currency));
  }
  if (typeof input.dateFormat === "string") {
    await setSetting(SETTING_DATE_FORMAT, normalizeDateFormat(input.dateFormat));
  }
  if (typeof input.weekStartsOn === "string") {
    await setSetting(SETTING_WEEK_STARTS_ON, normalizeWeekStart(input.weekStartsOn));
  }
  return getSystemSettingsView();
}

/** @deprecated */
export async function saveOpenAiSettings(input: {
  apiKey?: string | null;
  clearApiKey?: boolean;
  model?: string | null;
}): Promise<SystemSettingsView> {
  return saveSystemSettings(input);
}

export async function openaiIntegrationStatus(): Promise<{ openaiConfigured: boolean; openaiModel: string }> {
  const view = await getSystemSettingsView();
  return { openaiConfigured: view.openaiConfigured, openaiModel: view.openaiModel };
}

export function settingsCatalog() {
  return {
    timeZones: [...TIME_ZONES],
    currencies: ["MVR", "USD", "EUR", "INR", "LKR", "AED"],
    dateFormats: [
      { id: "dmy", label: "DD/MM/YYYY", example: "05/11/2026" },
      { id: "ymd", label: "YYYY-MM-DD", example: "2026-11-05" },
      { id: "mdy", label: "MM/DD/YYYY", example: "11/05/2026" },
    ],
    weekStarts: [
      { id: "monday", label: "Monday" },
      { id: "sunday", label: "Sunday" },
    ],
    ocrModels: [
      { id: "gpt-4o-mini", label: "GPT-4o mini (fast, lower cost)" },
      { id: "gpt-4o", label: "GPT-4o (higher accuracy)" },
    ],
  };
}
