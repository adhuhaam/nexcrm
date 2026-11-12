import assert from "node:assert/strict";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import {
  authorize,
  createRole,
  deleteRole,
  hashPassword,
  seedRoles,
  verifyPassword,
  type OfficeUser,
} from "../modules/access/access.ts";
import { ALL_MODULE_KEYS, permissionsFromFlags } from "../modules/access/permissions.ts";

await migrate(pool);

function person(slug: string, canPreview: boolean, canEdit: boolean, canDelete: boolean): OfficeUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Test",
    email: "test@jacms.local",
    phone: null,
    employeeId: null,
    mustChangePassword: false,
    active: true,
    scopedClientIds: slug === "system_admin" ? null : [],
    role: {
      id: "00000000-0000-4000-8000-000000000002",
      slug,
      name: slug,
      canPreview,
      canEdit,
      canDelete,
      systemRole: slug === "system_admin",
      permissions: permissionsFromFlags(
        ALL_MODULE_KEYS,
        { canPreview, canEdit, canDelete },
        { accessModules: slug === "system_admin" ? "full" : "none" },
      ),
    },
  };
}

await seedRoles();
await pool.query(`delete from roles where slug = 'site_reader'`);
const stored = await hashPassword("correct-horse");
assert.equal(await verifyPassword("correct-horse", stored), true);
assert.equal(await verifyPassword("wrong-password", stored), false);

const employee = person("employee_self_service", true, false, false);
assert.equal(authorize("GET", "/api/v1/ess/dashboard", employee), null);
assert.match(authorize("GET", "/api/v1/hr", employee) ?? "", /self-service portal/);

const guest = person("investor_guest", true, false, false);
assert.equal(authorize("GET", "/api/v1/hr", guest), null);
assert.match(authorize("POST", "/companies", guest) ?? "", /cannot create|cannot edit/);
assert.match(authorize("GET", "/api/v1/admin/access", guest) ?? "", /system admin/);

const admin = person("system_admin", true, true, true);
assert.equal(authorize("POST", "/api/v1/admin/roles", admin), null);
assert.equal(authorize("DELETE", "/projects/00000000-0000-4000-8000-000000000003", admin), null);

const created = await createRole({
  name: "Site reader",
  permissions: permissionsFromFlags(ALL_MODULE_KEYS, { canPreview: true, canEdit: false, canDelete: false }),
});
assert.equal(created.slug, "site_reader");
assert.equal(created.systemRole, false);
assert.ok(created.permissions.some((item) => item.module === "employees" && item.canView));
assert.ok(created.permissions.every((item) => !["users", "roles", "settings", "health"].includes(item.module) || !item.canView));
await deleteRole(created.id);

const locked = await pool.query<{ id: string }>(`select id from roles where slug = 'system_admin'`);
const adminRoleId = locked.rows[0]?.id;
assert.ok(adminRoleId);
await assert.rejects(() => deleteRole(adminRoleId), /Built-in/);

await pool.end();
console.log("access ok");
