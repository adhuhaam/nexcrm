export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (response.status === 401 && window.location.pathname !== "/login") {
    window.location.assign("/login");
    throw new Error("Sign in to open the office.");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not load this page");
  }
  return response.json() as Promise<T>;
}

export async function postJson(url: string, body: Record<string, unknown>): Promise<void> {
  const payload = await sendJson(url, "POST", body);
  if (payload.location) {
    window.location.assign(payload.location);
  }
}

export async function sendJson<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<T & { error?: string; location?: string }> {
  const response = await fetch(url, {
    method,
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; location?: string };
  if (response.status === 401 && window.location.pathname !== "/login") {
    window.location.assign("/login");
    throw new Error(payload.error ?? "Sign in to open the office.");
  }
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

export async function uploadForm<T = Record<string, unknown>>(url: string, form: FormData): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json" },
    body: form,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401 && window.location.pathname !== "/login") {
    window.location.assign("/login");
    throw new Error(payload.error ?? "Sign in to open the office.");
  }
  if (!response.ok) {
    throw new Error(payload.error ?? "Upload failed");
  }
  return payload;
}
