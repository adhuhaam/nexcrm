import { pool } from "../../lib/db.ts";
import { loadEnv } from "../../lib/env.ts";

loadEnv();

export const SETTING_OPENAI_API_KEY = "openai_api_key";
export const SETTING_OPENAI_OCR_MODEL = "openai_ocr_model";

export type OpenAiConfig = {
  apiKey: string | null;
  model: string;
  source: "settings" | "env" | "none";
};

export type OpenAiSettingsView = {
  openaiConfigured: boolean;
  openaiKeyHint: string | null;
  openaiKeySource: "settings" | "env" | "none";
  openaiModel: string;
  envKeyPresent: boolean;
};

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

export async function resolveOpenAiConfig(): Promise<OpenAiConfig> {
  const fromDb = await getRaw(SETTING_OPENAI_API_KEY);
  const fromEnv = process.env.OPENAI_API_KEY?.trim() || null;
  const modelFromDb = await getRaw(SETTING_OPENAI_OCR_MODEL);
  const model = modelFromDb || process.env.OPENAI_OCR_MODEL?.trim() || "gpt-4o-mini";
  if (fromDb) return { apiKey: fromDb, model, source: "settings" };
  if (fromEnv) return { apiKey: fromEnv, model, source: "env" };
  return { apiKey: null, model, source: "none" };
}

export async function getOpenAiSettingsView(): Promise<OpenAiSettingsView> {
  const config = await resolveOpenAiConfig();
  const envKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    openaiConfigured: Boolean(config.apiKey),
    openaiKeyHint: config.apiKey ? maskKey(config.apiKey) : null,
    openaiKeySource: config.source,
    openaiModel: config.model,
    envKeyPresent,
  };
}

export async function saveOpenAiSettings(input: {
  apiKey?: string | null;
  clearApiKey?: boolean;
  model?: string | null;
}): Promise<OpenAiSettingsView> {
  if (input.clearApiKey) {
    await clearSetting(SETTING_OPENAI_API_KEY);
  } else if (typeof input.apiKey === "string") {
    const trimmed = input.apiKey.trim();
    if (trimmed) await setSetting(SETTING_OPENAI_API_KEY, trimmed);
  }
  if (typeof input.model === "string") {
    const model = input.model.trim() || "gpt-4o-mini";
    await setSetting(SETTING_OPENAI_OCR_MODEL, model);
  }
  return getOpenAiSettingsView();
}

export async function openaiIntegrationStatus(): Promise<{ openaiConfigured: boolean; openaiModel: string }> {
  const view = await getOpenAiSettingsView();
  return { openaiConfigured: view.openaiConfigured, openaiModel: view.openaiModel };
}
