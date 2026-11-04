import { useAuth } from "./auth";

export function usePermissions() {
  const { session } = useAuth();
  const role = session?.role;
  return {
    canPreview: Boolean(role?.canPreview || role?.systemRole),
    canEdit: Boolean(role?.canEdit || role?.canDelete || role?.systemRole),
    canDelete: Boolean(role?.canDelete || role?.systemRole),
  };
}
