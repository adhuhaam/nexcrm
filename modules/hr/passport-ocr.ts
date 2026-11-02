import { resolveOpenAiConfig } from "../settings/settings.ts";

export class PassportOcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PassportOcrError";
  }
}

export type PassportProposed = {
  passportNumber: string | null;
  legalName: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  passportExpiry: string | null;
  passportIssueDate: string | null;
};

const emptyProposed: PassportProposed = {
  passportNumber: null,
  legalName: null,
  nationality: null,
  dateOfBirth: null,
  gender: null,
  passportExpiry: null,
  passportIssueDate: null,
};

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed.toLowerCase() === "null" ? null : trimmed;
}

function parseProposed(raw: unknown): PassportProposed {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...emptyProposed };
  const record = raw as Record<string, unknown>;
  return {
    passportNumber: asNullableString(record.passportNumber),
    legalName: asNullableString(record.legalName),
    nationality: asNullableString(record.nationality),
    dateOfBirth: asNullableString(record.dateOfBirth),
    gender: asNullableString(record.gender),
    passportExpiry: asNullableString(record.passportExpiry),
    passportIssueDate: asNullableString(record.passportIssueDate),
  };
}

/** ChatGPT Vision OCR. Returns nulls for unread fields — never invents values. */
export async function extractPassportFields(buffer: Buffer, mimeType: string): Promise<PassportProposed> {
  const config = await resolveOpenAiConfig();
  if (!config.apiKey) {
    throw new PassportOcrError(
      "OpenAI API key is not configured. Add it under System settings → Integrations, or set OPENAI_API_KEY in .env.",
    );
  }
  const mime = mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  if (!mime.startsWith("image/")) {
    throw new PassportOcrError("Upload a passport photo or scan image (JPEG, PNG, WebP). PDF is not supported yet.");
  }
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract passport identity fields from an image. Return JSON only with keys: passportNumber, legalName, nationality, dateOfBirth, gender, passportExpiry, passportIssueDate. Use ISO dates YYYY-MM-DD when readable. If a field is unreadable or missing, set it to null. Never invent or guess values.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract passport fields from this image." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new PassportOcrError(`OpenAI OCR failed (${response.status}). ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  try {
    return parseProposed(JSON.parse(content));
  } catch {
    return { ...emptyProposed };
  }
}
