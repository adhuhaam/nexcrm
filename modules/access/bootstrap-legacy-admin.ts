import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { createUser, roleBySlug } from "./access.ts";

const passwordFile = new URL("../../.admin-password", import.meta.url);

/** Dev-only: random admin when JACMS_AUTO_SEED_ADMIN=1 and no users exist. */
export async function bootstrapLegacyAdmin(): Promise<void> {
  const admin = await roleBySlug("system_admin");
  if (!admin) throw new Error("System admin role is missing");
  const password = randomBytes(18).toString("base64url");
  await createUser({
    name: "System admin",
    email: "admin@jacms.local",
    password,
    roleId: admin.id,
  });
  await writeFile(passwordFile, `Login: admin@jacms.local\nPassword: ${password}\n`, { mode: 0o600 });
  await chmod(passwordFile, 0o600);
}
